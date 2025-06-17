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
let pulseModeActive = false;
let pulseTime = 0;
let pulseFrequency = 0.5; // cycles per second
let lastPulseValue = 0; // To detect pulse peaks
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
let availableMidiOutputs = new Map(); // Store MIDI outputs by ID
let midiEnabled = false; // Toggled by 'M' key
const MIDI_CHANNEL = 0; // MIDI channel 0 is channel 1 in most DAWs

// HTML Elements for MIDI Configuration
const settingsButton = document.getElementById('settingsButton');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalButton = document.getElementById('closeSettingsModal');
const midiOutputSelect = document.getElementById('midiOutputSelect');

// HTML Element for Output Popup
const openOutputPopupButton = document.getElementById('openOutputPopupButton');
let outputPopupWindow = null;
let popupCanvasCtx = null;

function updateMidiOutputList() {
  availableMidiOutputs.clear();
  if (midiAccess) {
    midiAccess.outputs.forEach(output => {
      availableMidiOutputs.set(output.id, output);
    });
  }
  populateMidiOutputSelect();
}

function populateMidiOutputSelect() {
  const previouslySelectedId = midiOutput ? midiOutput.id : null;
  midiOutputSelect.innerHTML = ''; // Clear existing options

  if (availableMidiOutputs.size === 0) {
    const option = document.createElement('option');
    option.textContent = 'Nenhuma porta MIDI encontrada';
    option.disabled = true;
    midiOutputSelect.appendChild(option);
    midiOutput = null; // No output available
    return;
  }

  availableMidiOutputs.forEach(output => {
    const option = document.createElement('option');
    option.value = output.id;
    option.textContent = output.name;
    midiOutputSelect.appendChild(option);
  });

  if (previouslySelectedId && availableMidiOutputs.has(previouslySelectedId)) {
    midiOutputSelect.value = previouslySelectedId;
    midiOutput = availableMidiOutputs.get(previouslySelectedId);
  } else if (availableMidiOutputs.size > 0) {
    const firstOutputId = availableMidiOutputs.keys().next().value;
    midiOutputSelect.value = firstOutputId;
    midiOutput = availableMidiOutputs.get(firstOutputId);
  } else {
    midiOutput = null;
  }
  if (midiOutput) {
    console.log("Populated MIDI outputs. Selected:", midiOutput.name);
  } else {
    console.warn("Populated MIDI outputs. No output selected.");
  }
}

async function initMidi() {
  try {
    if (navigator.requestMIDIAccess) {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      console.log("MIDI Access Granted");
      updateMidiOutputList();

      midiAccess.onstatechange = (event) => {
        console.log("MIDI state changed:", event.port.name, event.port.state, event.port.type);
        updateMidiOutputList();
        if (event.port.type === "output" && event.port.state === "disconnected") {
            if (midiOutput && event.port.id === midiOutput.id) {
                console.warn("Selected MIDI Output disconnected:", event.port.name);
            }
        } else if (event.port.type === "output" && event.port.state === "connected") {
             console.log("New MIDI Output connected:", event.port.name);
        }
      };

    } else {
      console.warn("Web MIDI API is not supported in this browser.");
      populateMidiOutputSelect();
    }
  } catch (error) {
    console.error("Could not access MIDI devices.", error);
    populateMidiOutputSelect();
  }
}

midiOutputSelect.addEventListener('change', () => {
  const selectedId = midiOutputSelect.value;
  if (availableMidiOutputs.has(selectedId)) {
    midiOutput = availableMidiOutputs.get(selectedId);
    console.log("MIDI Output changed to:", midiOutput.name);
    turnOffAllActiveNotes();
  } else {
    console.warn("Selected MIDI output ID not found in available list:", selectedId);
    midiOutput = null;
  }
});

function sendMidiNoteOn(note, velocity, channel = MIDI_CHANNEL) {
  if (midiOutput && midiEnabled) {
    const noteOnMessage = [0x90 + channel, note, velocity];
    midiOutput.send(noteOnMessage);
  }
}

function sendMidiNoteOff(note, channel = MIDI_CHANNEL) {
  if (midiOutput && midiEnabled) {
    const noteOffMessage = [0x80 + channel, note, 0];
    midiOutput.send(noteOffMessage);
  }
}

function sendPitchBend(bendValue, channel = MIDI_CHANNEL) {
  if (midiOutput && midiEnabled) {
    const lsb = bendValue & 0x7F;
    const msb = (bendValue >> 7) & 0x7F;
    const pitchBendMessage = [0xE0 + channel, lsb, msb];
    midiOutput.send(pitchBendMessage);
  }
}

initMidi();

const PENTATONIC_SCALE_C_MAJOR = [60, 62, 64, 67, 69];

function getPentatonicNote(index, baseOctaveOffset = 0) {
    const scaleLength = PENTATONIC_SCALE_C_MAJOR.length;
    const octave = baseOctaveOffset + Math.floor(index / scaleLength);
    const noteInScale = PENTATONIC_SCALE_C_MAJOR[index % scaleLength];
    return noteInScale + (octave * 12);
}

function turnOffAllActiveNotes() {
    if (midiOutput && Object.keys(activeMidiNotes).length > 0) {
        Object.keys(activeMidiNotes).forEach(edgeIdx => {
            const noteInfo = activeMidiNotes[edgeIdx];
            if (noteInfo.playing) {
                const originalMidiEnabledState = midiEnabled;
                midiEnabled = true;
                sendMidiNoteOff(noteInfo.note, noteInfo.channel);
                midiEnabled = originalMidiEnabledState;
            }
        });
    }
    activeMidiNotes = {};
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') {
    pulseModeActive = !pulseModeActive;
    if (pulseModeActive) {
      console.log("Pulse mode ACTIVE");
      pulseTime = 0;
    } else {
      console.log("Pulse mode INACTIVE");
    }
  }
});

const infoButton = document.getElementById('info');
const infoModal = document.getElementById('infoModal');
const closeModalButton = document.getElementById('closeModal');

infoButton.addEventListener('click', () => {
  infoModal.style.display = 'flex';
});

closeModalButton.addEventListener('click', () => {
  infoModal.style.display = 'none';
});

if (settingsButton && settingsModal && closeSettingsModalButton) {
  settingsButton.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  closeSettingsModalButton.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });
} else {
  console.error("Settings modal elements not found. MIDI configuration might not work.");
}

window.addEventListener('click', (event) => {
  if (event.target === infoModal) {
    infoModal.style.display = 'none';
  }
  if (event.target === settingsModal) {
    settingsModal.style.display = 'none';
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

function drawShape(cx, cy, radius, sides, isPulsing, pulseValue) {
  ctx.beginPath();
  const maxInfluenceDistance = 150;
  const maxForce = 25;
  const fingertipsToUse = [4, 8, 12, 16, 20];

  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    let vertexX_orig = radius * Math.cos(angle);
    let vertexY_orig = radius * Math.sin(angle);

    let totalDisplacementX = 0;
    let totalDisplacementY = 0;

    if (rightHandLandmarks) {
      const currentVertexCanvasX = cx + vertexX_orig;
      const currentVertexCanvasY = cy + vertexY_orig;

      for (const landmarkIndex of fingertipsToUse) {
        const fingertip = rightHandLandmarks[landmarkIndex];
        const fingertipX = canvasElement.width - (fingertip.x * canvasElement.width);
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
    const finalX = cx + deformedX;
    const finalY = cy + deformedY;

    if (midiEnabled && sides > 0) {
        const edgeIndex = i;
        const note = getPentatonicNote(edgeIndex);
        let velocity = Math.max(0, Math.min(127, Math.round(30 + (radius - 30) * ( (127-30) / (300-30) )) ) );

        if (isPulsing) {
            // pulseValue is -1 to 1. (pulseValue + 1) / 2 gives 0 to 1.
            // Modulate velocity from 60% to 100% of its calculated value based on pulse.
            let pulseVelocityFactor = 0.6 + ((pulseValue + 1) / 2) * 0.4;
            velocity = Math.round(velocity * pulseVelocityFactor);
            velocity = Math.max(0, Math.min(127, velocity)); // Re-clamp
        }
        const displacementMagnitude = Math.sqrt(totalDisplacementX*totalDisplacementX + totalDisplacementY*totalDisplacementY);
        const maxObservedDistortion = 50.0;
        const pitchBendSensitivity = 2048;
        let pitchBend = 8192;

        if (displacementMagnitude > 0.5) {
            const bendAmount = Math.min(1.0, displacementMagnitude / maxObservedDistortion) * pitchBendSensitivity;
            pitchBend = 8192 + Math.round(bendAmount);
            pitchBend = Math.max(0, Math.min(16383, pitchBend));
        }

        if (activeMidiNotes[edgeIndex] && activeMidiNotes[edgeIndex].playing) {
            if (Math.abs(pitchBend - activeMidiNotes[edgeIndex].lastPitchBend) > 10) {
                sendPitchBend(pitchBend, MIDI_CHANNEL);
                activeMidiNotes[edgeIndex].lastPitchBend = pitchBend;
            }
            if (Math.abs(velocity - activeMidiNotes[edgeIndex].lastVelocity) > 5) {
               activeMidiNotes[edgeIndex].lastVelocity = velocity;
            }
        } else {
            sendMidiNoteOn(note, velocity, MIDI_CHANNEL);
            activeMidiNotes[edgeIndex] = {
                note: note,
                channel: MIDI_CHANNEL,
                lastVelocity: velocity,
                lastPitchBend: pitchBend,
                playing: true
            };
            if (pitchBend !== 8192) {
                 sendPitchBend(pitchBend, MIDI_CHANNEL);
            }
        }
    }

    if (i === 0) ctx.moveTo(finalX, finalY);
    else ctx.lineTo(finalX, finalY);
  }

  if (Object.keys(activeMidiNotes).length > 0) {
      if (midiEnabled && sides > 0) {
          const currentActiveEdgeIndices = Object.keys(activeMidiNotes);
          for (const edgeIdxStr of currentActiveEdgeIndices) {
              const edgeIdxNum = Number(edgeIdxStr);
              if (activeMidiNotes[edgeIdxNum] && activeMidiNotes[edgeIdxNum].playing) {
                  if (edgeIdxNum >= sides) {
                      sendMidiNoteOff(activeMidiNotes[edgeIdxNum].note, activeMidiNotes[edgeIdxNum].channel);
                      activeMidiNotes[edgeIdxNum].playing = false;
                  }
              }
          }
          Object.keys(activeMidiNotes).forEach(edgeIdxStr => {
              const edgeIdxNum = Number(edgeIdxStr);
              if (activeMidiNotes[edgeIdxNum] && !activeMidiNotes[edgeIdxNum].playing) {
                  delete activeMidiNotes[edgeIdxNum];
              }
          });
      } else {
          turnOffAllActiveNotes();
      }
  }

  ctx.closePath();
  ctx.strokeStyle = 'cyan';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function onResults(results) {
  // Safeguard: If MIDI has been globally disabled (e.g. by 'M' key) and notes are still cached as active, clear them.
  if (!midiEnabled && Object.keys(activeMidiNotes).length > 0) {
    turnOffAllActiveNotes();
  }

  // Clear main canvas with afterimage effect
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Adjust alpha for trail length
  ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

  const cx = centerX();
  const cy = centerY();
  let isThumbResizing = false;

  rightHandLandmarks = null;

  if (results.multiHandLandmarks && results.multiHandLandmarks.length == 2) {
    let leftHandLandmarks = null;
    let rightHandLandmarksLocal = null;

    if (results.multiHandedness[0].label === "Left") {
      leftHandLandmarks = results.multiHandLandmarks[0];
      rightHandLandmarksLocal = results.multiHandLandmarks[1];
    } else {
      leftHandLandmarks = results.multiHandLandmarks[1];
      rightHandLandmarksLocal = results.multiHandLandmarks[0];
    }

    const isThumbUp = (landmarks, handednessLabel) => {
      if (!landmarks) return false;
      const thumbIsOpen = landmarks[4].y < landmarks[3].y && landmarks[3].y < landmarks[2].y;
      const thumbExtended = (handednessLabel === "Right" && landmarks[4].x < landmarks[2].x) ||
                            (handednessLabel === "Left" && landmarks[4].x > landmarks[2].x);
      const fingersCurled =
        landmarks[8].y > landmarks[6].y &&
        landmarks[12].y > landmarks[10].y &&
        landmarks[16].y > landmarks[14].y &&
        landmarks[20].y > landmarks[18].y;
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
          if (newSides !== shapeSides) {
            if (newSides < shapeSides && midiEnabled) {
                for (let k = newSides; k < shapeSides; k++) {
                    if (activeMidiNotes[k] && activeMidiNotes[k].playing) {
                        sendMidiNoteOff(activeMidiNotes[k].note, activeMidiNotes[k].channel);
                        activeMidiNotes[k].playing = false;
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

  let currentRadiusForShape = circleRadius; // Default to original circleRadius
  let currentPulseValue = 0; // For velocity modulation, default to no pulse effect

  if (pulseModeActive) {
      pulseTime = performance.now() * 0.001;
      currentPulseValue = Math.sin(pulseTime * pulseFrequency * 2 * Math.PI); // Sin wave from -1 to 1

      let radiusModulationFactor = 0.25 * currentPulseValue;
      currentRadiusForShape = circleRadius * (1 + radiusModulationFactor);
      currentRadiusForShape = Math.max(10, currentRadiusForShape); // Minimum radius of 10
  }
  drawShape(cx, cy, currentRadiusForShape, shapeSides, pulseModeActive, currentPulseValue);

  if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) {
    try {
      const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
      if (popupCanvas) {
        if (popupCanvas.width !== outputPopupWindow.innerWidth || popupCanvas.height !== outputPopupWindow.innerHeight) {
            popupCanvas.width = outputPopupWindow.innerWidth;
            popupCanvas.height = outputPopupWindow.innerHeight;
        }

        // Clear popup canvas with afterimage effect
        popupCanvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Use the same alpha
        popupCanvasCtx.fillRect(0, 0, popupCanvas.width, popupCanvas.height);

        popupCanvasCtx.drawImage(canvasElement, 0, 0, popupCanvas.width, popupCanvas.height);
      }
    } catch (e) {
        // console.warn("Error drawing to popup:", e.message);
    }
  }
}

if (openOutputPopupButton) {
  openOutputPopupButton.addEventListener('click', () => {
    if (outputPopupWindow && !outputPopupWindow.closed) {
      outputPopupWindow.focus();
    } else {
      outputPopupWindow = window.open('', 'OutputWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
      if (outputPopupWindow) {
        outputPopupWindow.document.write(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>Visual Output</title>
            <style>
              body { margin: 0; overflow: hidden; background: #111; display: flex; justify-content: center; align-items: center; }
              canvas { display: block; width: 100%; height: 100%; }
            </style>
          </head>
          <body>
            <canvas id="popupCanvas"></canvas>
          </body>
          </html>
        `);
        outputPopupWindow.document.close();

        const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
        if (popupCanvas) {
          popupCanvasCtx = popupCanvas.getContext('2d');
          popupCanvas.width = outputPopupWindow.innerWidth;
          popupCanvas.height = outputPopupWindow.innerHeight;
        } else {
          console.error("Could not find 'popupCanvas' in the new window.");
          outputPopupWindow.close();
          outputPopupWindow = null;
          return;
        }

        outputPopupWindow.addEventListener('beforeunload', () => {
          console.log("Output popup window closing.");
          popupCanvasCtx = null;
          outputPopupWindow = null;
        });
      } else {
        console.error("Failed to open output popup window. Popups might be blocked.");
      }
    }
  });
} else {
  console.error("openOutputPopupButton not found.");
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    midiEnabled = !midiEnabled;
    if (midiEnabled) {
      console.log("MIDI output ENABLED.");
    } else {
      console.log("MIDI output DISABLED.");
      turnOffAllActiveNotes();
    }
  }
});
