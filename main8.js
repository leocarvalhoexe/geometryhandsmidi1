const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const ctx = canvasElement.getContext('2d');

function resizeCanvas() {
  canvasElement.width = window.innerWidth;
  canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let circleRadius = 100;
let shapeSides = 100; // 100 = círculo
let scaleX = 1;
let scaleY = 1;
let rightHandLandmarks = null; // For liquify effect
// MODIFICATION 1: Add activeMidiNotes
let activeMidiNotes = {}; // { edgeIndex: { note, channel, lastVelocity, lastPitchBend, playing } }
const centerX = () => canvasElement.width / 2;
const centerY = () => canvasElement.height / 2;

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

hands.onResults(onResults);

// MIDI Integration
let midiAccess = null;
let midiOutput = null;
let midiEnabled = false; // Toggled by 'M' key
const MIDI_CHANNEL = 0; // MIDI channel 0 is channel 1 in most DAWs

async function initMidi() {
  try {
    if (navigator.requestMIDIAccess) {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      console.log("MIDI Access Granted");

      const outputs = midiAccess.outputs.values();
      let firstOutput = null;
      for (let output of outputs) {
        if (!firstOutput) firstOutput = output; // Select the first available output
        console.log("Found MIDI output:", output.name, output.id);
      }

      if (firstOutput) {
        midiOutput = firstOutput;
        console.log("Selected MIDI Output:", midiOutput.name);
      } else {
        console.warn("No MIDI output devices found.");
      }

      midiAccess.onstatechange = (event) => {
        console.log("MIDI state changed:", event.port.name, event.port.state);
        // Re-scan and select output if needed
        if (event.port.type === "output" && event.port.state === "connected" && !midiOutput) {
            midiOutput = event.port;
            console.log("Newly connected MIDI Output selected:", midiOutput.name);
        } else if (event.port.type === "output" && event.port.state === "disconnected" && midiOutput && event.port.id === midiOutput.id) {
            console.warn("Selected MIDI Output disconnected:", event.port.name);
            midiOutput = null;
            // Try to find another output
            const newOutputs = midiAccess.outputs.values();
            let newFirstOutput = null;
            for (let output of newOutputs) {
                if(!newFirstOutput) newFirstOutput = output;
                break;
            }
            if (newFirstOutput) {
                midiOutput = newFirstOutput;
                console.log("Switched to MIDI Output:", midiOutput.name);
            } else {
                 console.warn("No alternative MIDI output devices found.");
            }
        }
      };

    } else {
      console.warn("Web MIDI API is not supported in this browser.");
    }
  } catch (error) {
    console.error("Could not access MIDI devices.", error);
  }
}

function sendMidiNoteOn(note, velocity, channel = MIDI_CHANNEL) {
  if (midiOutput && midiEnabled) {
    // Note ON: 0x90 (channel 0), note number, velocity
    const noteOnMessage = [0x90 + channel, note, velocity];
    midiOutput.send(noteOnMessage);
    // console.log(`Sent Note ON: note=${note}, velocity=${velocity}, channel=${channel}`);
  }
}

function sendMidiNoteOff(note, channel = MIDI_CHANNEL) {
  if (midiOutput && midiEnabled) {
    // Note OFF: 0x80 (channel 0), note number, velocity 0
    const noteOffMessage = [0x80 + channel, note, 0]; // Velocity 0 for Note OFF
    midiOutput.send(noteOffMessage);
    // console.log(`Sent Note OFF: note=${note}, channel=${channel}`);
  }
}

function sendPitchBend(bendValue, channel = MIDI_CHANNEL) { // bendValue from 0 to 16383 (8192 is center)
  if (midiOutput && midiEnabled) {
    const lsb = bendValue & 0x7F; // Least Significant Byte
    const msb = (bendValue >> 7) & 0x7F; // Most Significant Byte
    // Pitch Bend: 0xE0 (channel 0), LSB, MSB
    const pitchBendMessage = [0xE0 + channel, lsb, msb];
    midiOutput.send(pitchBendMessage);
    // console.log(`Sent Pitch Bend: value=${bendValue} (LSB: ${lsb}, MSB: ${msb}), channel=${channel}`);
  }
}

// Call initMidi when the script loads
initMidi();

// MODIFICATION 2: Add pentatonic scale and helper functions
// Pentatonic Scale and MIDI Note Management
const PENTATONIC_SCALE_C_MAJOR = [60, 62, 64, 67, 69]; // C4, D4, E4, G4, A4

function getPentatonicNote(index, baseOctaveOffset = 0) {
    const scaleLength = PENTATONIC_SCALE_C_MAJOR.length;
    const octave = baseOctaveOffset + Math.floor(index / scaleLength);
    const noteInScale = PENTATONIC_SCALE_C_MAJOR[index % scaleLength];
    return noteInScale + (octave * 12);
}

function turnOffAllActiveNotes() {
    if (midiOutput && Object.keys(activeMidiNotes).length > 0) {
        // console.log("Turning off all notes:", activeMidiNotes);
        Object.keys(activeMidiNotes).forEach(edgeIdx => {
            const noteInfo = activeMidiNotes[edgeIdx];
            if (noteInfo.playing) {
                // Temporarily ensure MIDI is on for sending NOTE OFF, then restore original state
                const originalMidiEnabledState = midiEnabled;
                midiEnabled = true;
                sendMidiNoteOff(noteInfo.note, noteInfo.channel);
                midiEnabled = originalMidiEnabledState;
            }
        });
    }
    activeMidiNotes = {}; // Clear active notes cache
}


const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  width: 640,
  height: 480
});
camera.start();

document.addEventListener('keydown', (e) => {
  if (e.key === '+') {
    circleRadius = Math.min(circleRadius + 10, 300);
  }
  if (e.key === '-') {
    circleRadius = Math.max(circleRadius - 10, 30);
  }
});

const infoButton = document.getElementById('info');
const infoModal = document.getElementById('infoModal');
const closeModalButton = document.getElementById('closeModal');

infoButton.addEventListener('click', () => {
  infoModal.style.display = 'flex'; // Use flex for centering
});

closeModalButton.addEventListener('click', () => {
  infoModal.style.display = 'none';
});

// Optional: Close modal if user clicks outside of it
window.addEventListener('click', (event) => {
  if (event.target === infoModal) {
    infoModal.style.display = 'none';
  }
});

const drawLandmarks = (landmarks) => {
  const connections = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],
    [0,17]
  ];
  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 2;
  for (const [a, b] of connections) {
    const x1 = canvasElement.width - (landmarks[a].x * canvasElement.width);
    const y1 = landmarks[a].y * canvasElement.height;
    const x2 = canvasElement.width - (landmarks[b].x * canvasElement.width);
    const y2 = landmarks[b].y * canvasElement.height;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
};

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) {
  const d = distance(x, y, cx, cy);
  return Math.abs(d - r) <= tolerance;
}

// MODIFICATION 3: Modify drawShape function
function drawShape(cx, cy, radius, sides) {
  ctx.beginPath();
  const maxInfluenceDistance = 150; // px
  const maxForce = 25; // px, adjust for desired strength
  const fingertipsToUse = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky

  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    let vertexX_orig = radius * Math.cos(angle);
    let vertexY_orig = radius * Math.sin(angle);

    // Liquify effect
    let totalDisplacementX = 0;
    let totalDisplacementY = 0;

    if (rightHandLandmarks) {
      const currentVertexCanvasX = cx + vertexX_orig;
      const currentVertexCanvasY = cy + vertexY_orig;

      for (const landmarkIndex of fingertipsToUse) {
        const fingertip = rightHandLandmarks[landmarkIndex];
        const fingertipX = canvasElement.width - (fingertip.x * canvasElement.width); // Invert X
        const fingertipY = fingertip.y * canvasElement.height;

        const distToFingertip = distance(currentVertexCanvasX, currentVertexCanvasY, fingertipX, fingertipY);

        if (distToFingertip < maxInfluenceDistance && distToFingertip > 0) {
          const vecX = currentVertexCanvasX - fingertipX;
          const vecY = currentVertexCanvasY - fingertipY;

          const normVecX = vecX / distToFingertip;
          const normVecY = vecY / distToFingertip;

          const forceMagnitude = maxForce * (1 - distToFingertip / maxInfluenceDistance);

          totalDisplacementX += normVecX * forceMagnitude;
          totalDisplacementY += normVecY * forceMagnitude;
        }
      }
    }

    let deformedX = vertexX_orig + totalDisplacementX;
    let deformedY = vertexY_orig + totalDisplacementY;

    // Apply scaling AFTER deformation
    const finalX = cx + deformedX;
    const finalY = cy + deformedY;

// MODIFICATION 3a: MIDI logic inside the loop
            // MIDI Logic for this vertex/edge
            if (midiEnabled && sides > 0) {
                const edgeIndex = i;
                const note = getPentatonicNote(edgeIndex);
                // Velocity: Map circleRadius (30-300) to MIDI velocity (e.g., 30-127)
                let velocity = Math.max(0, Math.min(127, Math.round(30 + (radius - 30) * ( (127-30) / (300-30) )) ) );

                // Pitch Bend: Map distortion to pitch bend
                const displacementMagnitude = Math.sqrt(totalDisplacementX*totalDisplacementX + totalDisplacementY*totalDisplacementY);
                const maxObservedDistortion = 50.0; // Tune this value based on visual feedback
                const pitchBendSensitivity = 2048; // Max deviation from center (e.g. 8192 +/- 2048 for ~2 semitones)
                let pitchBend = 8192; // Center pitch (no bend)

                if (displacementMagnitude > 0.5) { // Only apply if there's some noticeable displacement
                    const bendAmount = Math.min(1.0, displacementMagnitude / maxObservedDistortion) * pitchBendSensitivity;
                    // For now, any distortion bends the pitch upwards. This could be refined.
                    pitchBend = 8192 + Math.round(bendAmount);
                    pitchBend = Math.max(0, Math.min(16383, pitchBend)); // Clamp to valid MIDI range
                }

                if (activeMidiNotes[edgeIndex] && activeMidiNotes[edgeIndex].playing) {
                    // Note is already playing, update pitch bend if changed significantly
                    if (Math.abs(pitchBend - activeMidiNotes[edgeIndex].lastPitchBend) > 10) { // Threshold to avoid flooding
                        sendPitchBend(pitchBend, MIDI_CHANNEL);
                        activeMidiNotes[edgeIndex].lastPitchBend = pitchBend;
                    }
                    // Update velocity if changed significantly (optional, can make it more dynamic)
                    if (Math.abs(velocity - activeMidiNotes[edgeIndex].lastVelocity) > 5) {
                       // This would require sending another note-on, or using channel pressure. For simplicity, we'll just update our record.
                       // sendMidiNoteOn(note, velocity, MIDI_CHANNEL); // Re-triggering might not be ideal.
                       activeMidiNotes[edgeIndex].lastVelocity = velocity;
                    }
                } else { // New note for this edge or was previously off
                    sendMidiNoteOn(note, velocity, MIDI_CHANNEL);
                    activeMidiNotes[edgeIndex] = {
                        note: note,
                        channel: MIDI_CHANNEL,
                        lastVelocity: velocity, // Store initial velocity
                        lastPitchBend: pitchBend,
                        playing: true
                    };
                    if (pitchBend !== 8192) { // Send initial pitch bend if not centered
                         sendPitchBend(pitchBend, MIDI_CHANNEL);
                    }
                }
            }

    if (i === 0) ctx.moveTo(finalX, finalY);
    else ctx.lineTo(finalX, finalY);
  } // End of for loop
// MODIFICATION 3b: Note cleanup logic after the loop
        // MIDI Note Cleanup: Turn off notes for edges that no longer exist or if MIDI is globally disabled
        if (Object.keys(activeMidiNotes).length > 0) { // Only if there's something to clean
            if (midiEnabled && sides > 0) {
                const currentActiveEdgeIndices = Object.keys(activeMidiNotes); // These are strings
                for (const edgeIdxStr of currentActiveEdgeIndices) {
                    const edgeIdxNum = Number(edgeIdxStr);
                    if (activeMidiNotes[edgeIdxNum] && activeMidiNotes[edgeIdxNum].playing) {
                        if (edgeIdxNum >= sides) {
                            sendMidiNoteOff(activeMidiNotes[edgeIdxNum].note, activeMidiNotes[edgeIdxNum].channel);
                            activeMidiNotes[edgeIdxNum].playing = false;
                        }
                    }
                }
                // Clean up non-playing notes from the active list
                Object.keys(activeMidiNotes).forEach(edgeIdxStr => {
                    const edgeIdxNum = Number(edgeIdxStr);
                    if (activeMidiNotes[edgeIdxNum] && !activeMidiNotes[edgeIdxNum].playing) {
                        delete activeMidiNotes[edgeIdxNum];
                    }
                });
            } else { // MIDI is disabled OR sides is 0, turn off all notes
                turnOffAllActiveNotes();
            }
        }

  ctx.closePath();
  ctx.strokeStyle = 'cyan';
  ctx.lineWidth = 4;
  ctx.stroke();
}

// MODIFICATION 4: Modify onResults function
function onResults(results) {
// MODIFICATION 4a: Add safeguard cleanup
  // Safeguard: If MIDI has been globally disabled (e.g. by 'M' key) and notes are still cached as active, clear them.
  if (!midiEnabled && Object.keys(activeMidiNotes).length > 0) {
    turnOffAllActiveNotes();
  }

  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  const cx = centerX();
  const cy = centerY();
  let isThumbResizing = false;

  // Reset rightHandLandmarks before processing results
  rightHandLandmarks = null;

  // Two-thumb resizing logic
  if (results.multiHandLandmarks && results.multiHandLandmarks.length == 2) {
    let leftHandLandmarks = null;
    let rightHandLandmarksLocal = null; // Use a local var to avoid conflict with global one for liquify

    if (results.multiHandedness[0].label === "Left") {
      leftHandLandmarks = results.multiHandLandmarks[0];
      rightHandLandmarksLocal = results.multiHandLandmarks[1];
    } else {
      leftHandLandmarks = results.multiHandLandmarks[1];
      rightHandLandmarksLocal = results.multiHandLandmarks[0];
    }

    const isThumbUp = (landmarks, handednessLabel) => {
      if (!landmarks) return false;
      // Check Y coordinates: Tip above PIP, PIP above MCP (lower Y is higher on screen)
      const thumbIsOpen = landmarks[4].y < landmarks[3].y && landmarks[3].y < landmarks[2].y;
      // Check X coordinates for thumb extension.
      // For Right hand, thumb tip (4) should be to the left (smaller X) of thumb MCP (2).
      // For Left hand, thumb tip (4) should be to the right (larger X) of thumb MCP (2).
      // This assumes raw landmark data where X is 0 (left) to 1 (right).
      const thumbExtended = (handednessLabel === "Right" && landmarks[4].x < landmarks[2].x) ||
                            (handednessLabel === "Left" && landmarks[4].x > landmarks[2].x);

      const fingersCurled =
        landmarks[8].y > landmarks[6].y && // Index
        landmarks[12].y > landmarks[10].y && // Middle
        landmarks[16].y > landmarks[14].y && // Ring
        landmarks[20].y > landmarks[18].y; // Pinky
      return thumbIsOpen && thumbExtended && fingersCurled;
    };

    if (isThumbUp(leftHandLandmarks, "Left") && isThumbUp(rightHandLandmarksLocal, "Right")) {
      isThumbResizing = true;
      const leftThumbTip = leftHandLandmarks[4];
      const rightThumbTip = rightHandLandmarksLocal[4];

      const leftThumbX = leftThumbTip.x * canvasElement.width;
      const leftThumbY = leftThumbTip.y * canvasElement.height;
      const rightThumbX = rightThumbTip.x * canvasElement.width;
      const rightThumbY = rightThumbTip.y * canvasElement.height;

      const thumbDistancePixels = distance(leftThumbX, leftThumbY, rightThumbX, rightThumbY);

      const minThumbDist = canvasElement.width * 0.05;
      const maxThumbDist = canvasElement.width * 0.5;

      const normalizedThumbDist = Math.max(0, Math.min(1, (thumbDistancePixels - minThumbDist) / (maxThumbDist - minThumbDist)));
      circleRadius = 30 + normalizedThumbDist * 270;
    }
  }

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i].label;

      if (!isThumbResizing && handedness === "Right") {
        rightHandLandmarks = landmarks;
      }

      drawLandmarks(landmarks);

      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      const ix = canvasElement.width - (indexTip.x * canvasElement.width);
      const iy = indexTip.y * canvasElement.height;
      const tx = canvasElement.width - (thumbTip.x * canvasElement.width);
      const ty = thumbTip.y * canvasElement.height;

      const pinchDistance = distance(ix, iy, tx, ty);
      const pinchX = (ix + tx) / 2;
      const pinchY = (iy + ty) / 2;

      if (!isThumbResizing && handedness === "Left") {
        if (isTouchingCircle(pinchX, pinchY, cx, cy, circleRadius)) {
          const newSides = Math.round(Math.min(Math.max((pinchDistance - 10) / 5 + 3, 3), 100));
          if (newSides !== shapeSides) { // Only update if sides actually changed
            // If the number of sides is decreasing, turn off notes for edges that will disappear
            if (newSides < shapeSides && midiEnabled) {
                for (let k = newSides; k < shapeSides; k++) {
                    if (activeMidiNotes[k] && activeMidiNotes[k].playing) {
                        sendMidiNoteOff(activeMidiNotes[k].note, activeMidiNotes[k].channel);
                        activeMidiNotes[k].playing = false;
                        // No need to delete from activeMidiNotes here, cleanup in drawShape handles it
                    }
                }
            }
            shapeSides = newSides;
          }
        }
      }
    }
  }
  if (isThumbResizing) {
    rightHandLandmarks = null;
  }
  drawShape(cx, cy, circleRadius, shapeSides);
}


// Event listener for 'M' key to toggle MIDI
document.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    midiEnabled = !midiEnabled;
    if (midiEnabled) {
      console.log("MIDI output ENABLED.");
      // Optional: if you want to re-trigger notes immediately when enabled,
      // you might need to call a function that re-evaluates the current shape.
      // For now, notes will start on next shape update/draw.
    } else {
      console.log("MIDI output DISABLED.");
      turnOffAllActiveNotes(); // Ensure all notes are turned off
    }
  }
});
