const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const ctx = canvasElement.getContext('2d');

function resizeCanvas() {
  canvasElement.width = window.innerWidth;
  canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// MODIFICATION: Define Shape class
class Shape {
  constructor(id, midiChannel) {
    this.id = id;
    this.centerX = canvasElement.width / (this.id === 0 ? 4 : 1.333); // Initial distinct positions
    this.centerY = canvasElement.height / 2;
    this.radius = 100;
    this.sides = 100; // 100 = círculo
    this.distortionFactor = 0; // Placeholder for liquify effect
    this.activeMidiNotes = {}; // MIDI notes specific to this shape
    this.midiChannel = midiChannel;
    this.leftHandLandmarks = null;
    this.rightHandLandmarks = null; // For liquify, will be this user's right hand
    this.pinchDistance = 0; // For side control
    this.lastSideChangeTime = 0;
    this.isThumbResizingActive = false; // Track if this shape is being resized by its user's thumbs
  }
}

// MODIFICATION: Instantiate two shapes
const shapes = [new Shape(0, 0), new Shape(1, 1)]; // Shape 0 on MIDI channel 0, Shape 1 on MIDI channel 1

// MODIFICATION: Comment out or remove old global shape variables
// let circleRadius = 100;
// let shapeSides = 100;
// let rightHandLandmarks = null; // Will be handled by shape[user].rightHandLandmarks
// let activeMidiNotes = {}; // Now per-shape: shape.activeMidiNotes
// let lastSideChangeTime = 0; // Now per-shape: shape.lastSideChangeTime

let scaleX = 1; // These seem generic, might need review later if they become shape-specific
let scaleY = 1;
const SIDE_CHANGE_DEBOUNCE_MS = 200;
let pulseModeActive = false; // Global for now, could be per-shape later
let pulseTime = 0;
let pulseFrequency = 0.5; // cycles per second
let lastPulseValue = 0;
let staccatoModeActive = false; // Default is legato

// MODIFICATION: Remove global centerX, centerY functions as position is now per-shape
// const centerX = () => canvasElement.width / 2;
// const centerY = () => canvasElement.height / 2;

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 4, // MODIFIED: Kept from previous step
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

hands.onResults(onResults);

function displayGlobalError(message) {
  let errorDiv = document.getElementById('globalErrorDiv');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'globalErrorDiv';
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '50%';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translate(-50%, -50%)';
    errorDiv.style.backgroundColor = 'red';
    errorDiv.style.color = 'white';
    errorDiv.style.padding = '20px';
    errorDiv.style.borderRadius = '10px';
    errorDiv.style.zIndex = '2000';
    errorDiv.style.textAlign = 'center';
    document.body.appendChild(errorDiv);
  }
  errorDiv.innerHTML = message;
}

let midiAccess = null;
let midiOutput = null;
let availableMidiOutputs = new Map();
let midiEnabled = true;
// const MIDI_CHANNEL = 0; // Now per-shape: shape.midiChannel

const midiToggleButton = document.getElementById('midiToggleButton');
const settingsButton = document.getElementById('settingsButton');
const hudElement = document.getElementById('hud');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalButton = document.getElementById('closeSettingsModal');
const midiOutputSelect = document.getElementById('midiOutputSelect');
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
  midiOutputSelect.innerHTML = '';
  if (availableMidiOutputs.size === 0) {
    const option = document.createElement('option');
    option.textContent = 'Nenhuma porta MIDI encontrada';
    option.disabled = true;
    midiOutputSelect.appendChild(option);
    midiOutput = null;
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
  if (midiOutput) console.log("Populated MIDI outputs. Selected:", midiOutput.name);
  else console.warn("Populated MIDI outputs. No output selected.");
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
        if (event.port.type === "output" && event.port.state === "disconnected" && midiOutput && event.port.id === midiOutput.id) {
          console.warn("Selected MIDI Output disconnected:", event.port.name);
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
    turnOffAllActiveNotes(); // Will need to be updated for per-shape notes
  } else {
    console.warn("Selected MIDI output ID not found in available list:", selectedId);
    midiOutput = null;
  }
});

// MODIFICATION: sendMidiNoteOn, sendMidiNoteOff, sendPitchBend to accept channel
function sendMidiNoteOn(note, velocity, channel) {
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validNote = Math.max(0, Math.min(127, Math.round(note)));
    const validVelocity = Math.max(0, Math.min(127, Math.round(velocity)));
    const noteOnMessage = [0x90 + currentChannel, validNote, validVelocity];
    midiOutput.send(noteOnMessage);
  }
}

function sendMidiNoteOff(note, channel) {
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validNote = Math.max(0, Math.min(127, Math.round(note)));
    const noteOffMessage = [0x80 + currentChannel, validNote, 0];
    midiOutput.send(noteOffMessage);
  }
}

function sendPitchBend(bendValue, channel) {
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validBendValue = Math.max(0, Math.min(16383, Math.round(bendValue)));
    const lsb = validBendValue & 0x7F;
    const msb = (validBendValue >> 7) & 0x7F;
    const pitchBendMessage = [0xE0 + currentChannel, lsb, msb];
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

// MODIFICATION: turnOffAllActiveNotes to handle per-shape activeMidiNotes
function turnOffAllActiveNotes() {
  if (midiOutput) {
    const originalMidiEnabledState = midiEnabled;
    midiEnabled = true; // Temporarily enable MIDI for sending note off
    shapes.forEach(shape => {
      Object.keys(shape.activeMidiNotes).forEach(edgeIdx => {
        const noteInfo = shape.activeMidiNotes[edgeIdx];
        if (noteInfo && noteInfo.playing) {
          sendMidiNoteOff(noteInfo.note, shape.midiChannel);
          if (noteInfo.staccatoTimer) {
            clearTimeout(noteInfo.staccatoTimer);
          }
          // noteInfo.playing = false; // Mark as not playing, will be cleared next
        }
      });
      shape.activeMidiNotes = {}; // Clear notes for this shape
    });
    midiEnabled = originalMidiEnabledState;
  }
}


async function initializeCamera() {
  console.log("Attempting to initialize camera - v18 debug");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach(track => track.stop());
    console.log("getUserMedia successful, proceeding with MediaPipe Camera - v18 debug");
    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480
    });
    camera.start();
    console.log("camera.start() called - v18 debug");
  } catch (error) {
    console.error("Failed to access webcam:", error);
    displayGlobalError("Falha ao acessar a webcam. <br>É necessário permitir o acesso à câmera para manipular a forma.<br><br>Erro: " + error.message);
  }
}
initializeCamera();

document.addEventListener('keydown', (e) => {
  // Key controls for radius might need to affect a default shape or be removed if all control is by hand
  if (e.key === '+') {
    // shapes[0].radius = Math.min(shapes[0].radius + 10, 300); // Example: control shape 0
    updateHUD();
  }
  if (e.key === '-') {
    // shapes[0].radius = Math.max(shapes[0].radius - 10, 30); // Example: control shape 0
    updateHUD();
  }
  if (e.key === 'p' || e.key === 'P') {
    pulseModeActive = !pulseModeActive;
    if (pulseModeActive) pulseTime = 0;
    updateHUD();
  }
  if (e.key === 'm' || e.key === 'M') {
    midiEnabled = !midiEnabled;
    updateMidiButtonText();
    if (!midiEnabled) turnOffAllActiveNotes();
    updateHUD();
  }
  if (e.key === 'l' || e.key === 'L') {
    staccatoModeActive = !staccatoModeActive;
    updateHUD(); // Update HUD to show staccato/legato status
  }
});

const infoButton = document.getElementById('info');
const infoModal = document.getElementById('infoModal');
const closeModalButton = document.getElementById('closeModal');
infoButton.addEventListener('click', () => { infoModal.style.display = 'flex'; });
closeModalButton.addEventListener('click', () => { infoModal.style.display = 'none'; });

if (settingsButton && settingsModal && closeSettingsModalButton) {
  settingsButton.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
  closeSettingsModalButton.addEventListener('click', () => { settingsModal.style.display = 'none'; });
} else {
  console.error("Settings modal elements not found.");
}

window.addEventListener('click', (event) => {
  if (event.target === infoModal) infoModal.style.display = 'none';
  if (event.target === settingsModal) settingsModal.style.display = 'none';
});

const drawLandmarks = (landmarks) => {
  const connections = [
    [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16], [13,17],[17,18],[18,19],[19,20], [0,17]
  ];
  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 2;
  for (const [a, b] of connections) {
    const x1 = canvasElement.width - (landmarks[a].x * canvasElement.width);
    const y1 = landmarks[a].y * canvasElement.height;
    const x2 = canvasElement.width - (landmarks[b].x * canvasElement.width);
    const y2 = landmarks[b].y * canvasElement.height;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
};

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1; const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) {
  const d = distance(x, y, cx, cy);
  return Math.abs(d - r) <= tolerance;
}

// MODIFICATION: drawShape to accept a shape object and use its properties
function drawShape(shape, isPulsing, pulseValue) { // Added 'shape' parameter
  ctx.beginPath();
  const maxInfluenceDistance = 150;
  const maxForce = 25; // For liquify
  const fingertipsToUse = [4, 8, 12, 16, 20]; // For liquify

  // Use shape's properties
  const cx = shape.centerX;
  const cy = shape.centerY;
  let radius = shape.radius; // Base radius
  const sides = shape.sides;

  if (isPulsing) { // If global pulsing is active, calculate radius for drawing
    let radiusModulationFactor = 0.25 * pulseValue; // pulseValue is sin wave from -1 to 1
    radius = shape.radius * (1 + radiusModulationFactor);
    radius = Math.max(10, radius); // Minimum radius
  }

  let localRightHandLandmarks = shape.rightHandLandmarks; // Get assigned right hand
  if (shape.isThumbResizingActive) { // NEW CHECK
    localRightHandLandmarks = null; // Disable liquify if thumb resizing is active for this shape
  }

  // Apply global pulse to this shape's radius for drawing if active
  // This was moved down in the user's provided final script, but makes more sense here or before vertex calcs.
  // For consistency with the previous full script, I'll keep it here.
  // However, the user's example for onResults had the pulsing logic *outside* the gesture processing loop,
  // then passed the modified radius. The drawShape in the previous full script took shape.radius directly.
  // For now, I will assume 'radius' is the one to be used for drawing, potentially modified by pulse.
  // The previous full script had:
  //   let currentRadiusForShape = shape.radius;
  //   if (pulseModeActive) { ... currentRadiusForShape = shape.radius * (1 + radiusModulationFactor); ... }
  //   drawShape(shape, pulseModeActive, currentPulseValue);
  // And then drawShape used shape.radius (unpulsed) for vertex calculation, which is a bit inconsistent.
  // Let's assume the 'radius' parameter passed (or shape.radius) should be the base, and pulsing modifies it for drawing.
  // The provided snippet for drawShape uses 'const radius = shape.radius;' and then this radius is used.
  // The new snippet has 'let radius = shape.radius;'
  // The previous full script's onResults called: drawShape(shape, pulseModeActive, currentPulseValue);
  // And drawShape had: const radius = shape.radius; then later if(isPulsing) { radius = shape.radius * ...}
  // This seems like an area that might need clarification, but I will follow the latest snippet for drawShape.
  // The provided snippet for drawShape itself does not re-calculate radius based on pulsing.
  // It expects the 'radius' (derived from shape.radius) to be the one to use.
  // The pulsing logic in onResults already calculates currentRadiusForShape and passes it to drawShape.
  // So, the `radius` in `drawShape` is already the potentially pulsed radius.

  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    let vertexX_orig = radius * Math.cos(angle);
    let vertexY_orig = radius * Math.sin(angle);
    let totalDisplacementX = 0;
    let totalDisplacementY = 0;

    // Liquify logic using localRightHandLandmarks (specific to this shape's user)
    if (localRightHandLandmarks) {
      const currentVertexCanvasX = cx + vertexX_orig;
      const currentVertexCanvasY = cy + vertexY_orig;
      for (const landmarkIndex of fingertipsToUse) {
        const fingertip = localRightHandLandmarks[landmarkIndex];
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

    // MIDI logic using shape.midiChannel and shape.activeMidiNotes
    if (midiEnabled && sides > 0) {
        const edgeIndex = i;
        const note = getPentatonicNote(edgeIndex);
        let velocity = Math.max(0, Math.min(127, Math.round(30 + (radius - 30) * ((127-30) / (300-30)))));
        if (isPulsing) { // Assuming global pulsing for now
            let pulseVelocityFactor = 0.6 + ((pulseValue + 1) / 2) * 0.4;
            velocity = Math.round(velocity * pulseVelocityFactor);
            velocity = Math.max(0, Math.min(127, velocity));
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

        if (shape.activeMidiNotes[edgeIndex] && shape.activeMidiNotes[edgeIndex].playing) {
            if (Math.abs(pitchBend - shape.activeMidiNotes[edgeIndex].lastPitchBend) > 10) {
                sendPitchBend(pitchBend, shape.midiChannel);
                shape.activeMidiNotes[edgeIndex].lastPitchBend = pitchBend;
            }
            // Velocity updates for active notes are tricky, often not done or requires re-triggering
            // For now, we'll just store the last calculated velocity
            shape.activeMidiNotes[edgeIndex].lastVelocity = velocity;
        } else {
            sendMidiNoteOn(note, velocity, shape.midiChannel);
            sendMidiNoteOn(note, velocity, shape.midiChannel);
            shape.activeMidiNotes[edgeIndex] = {
                note: note,
                channel: shape.midiChannel,
                lastVelocity: velocity,
                lastPitchBend: pitchBend,
                playing: true,
                staccatoTimer: null // Initialize staccato timer
            };
            if (pitchBend !== 8192) {
                 sendPitchBend(pitchBend, shape.midiChannel);
            }
            // If staccato mode is active, schedule a note off
            if (staccatoModeActive) {
                if (shape.activeMidiNotes[edgeIndex].staccatoTimer) {
                    clearTimeout(shape.activeMidiNotes[edgeIndex].staccatoTimer);
                }
                shape.activeMidiNotes[edgeIndex].staccatoTimer = setTimeout(() => {
                    if (shape.activeMidiNotes[edgeIndex] && shape.activeMidiNotes[edgeIndex].playing) {
                        sendMidiNoteOff(note, shape.midiChannel);
                        shape.activeMidiNotes[edgeIndex].playing = false;
                        // We can choose to delete shape.activeMidiNotes[edgeIndex] here or let the cleanup logic handle it
                    }
                }, 150); // Staccato duration: 150ms
            }
        }
    }

    if (i === 0) ctx.moveTo(finalX, finalY);
    else ctx.lineTo(finalX, finalY);
  }

  // MIDI note off logic for sides that are no longer present
  if (Object.keys(shape.activeMidiNotes).length > 0) {
      if (midiEnabled && sides > 0) {
          const currentActiveEdgeIndices = Object.keys(shape.activeMidiNotes);
          for (const edgeIdxStr of currentActiveEdgeIndices) {
              const edgeIdxNum = Number(edgeIdxStr);
              if (shape.activeMidiNotes[edgeIdxNum] && shape.activeMidiNotes[edgeIdxNum].playing) {
                  if (edgeIdxNum >= sides) { // If edge index is now out of bounds
                      const noteInfo = shape.activeMidiNotes[edgeIdxNum];
                      sendMidiNoteOff(noteInfo.note, shape.midiChannel);
                      noteInfo.playing = false;
                      if (noteInfo.staccatoTimer) {
                          clearTimeout(noteInfo.staccatoTimer);
                          noteInfo.staccatoTimer = null;
                      }
                  }
              }
          }
          // Clean up notes marked as not playing
          Object.keys(shape.activeMidiNotes).forEach(edgeIdxStr => {
              const noteInfo = shape.activeMidiNotes[edgeIdxStr];
              if (noteInfo && !noteInfo.playing) {
                  // Ensure timer is cleared if somehow missed
                  if (noteInfo.staccatoTimer) {
                    clearTimeout(noteInfo.staccatoTimer);
                  }
                  delete shape.activeMidiNotes[edgeIdxStr];
              }
          });
      } else { // If MIDI got disabled or sides became 0, turn off all notes for this shape
          Object.keys(shape.activeMidiNotes).forEach(edgeIdx => {
            const noteInfo = shape.activeMidiNotes[edgeIdx];
            if (noteInfo && noteInfo.playing) {
                sendMidiNoteOff(noteInfo.note, shape.midiChannel);
                if (noteInfo.staccatoTimer) {
                    clearTimeout(noteInfo.staccatoTimer);
                }
            }
          });
          shape.activeMidiNotes = {};
      }
  }

  ctx.closePath();
  ctx.strokeStyle = shape.id === 0 ? 'cyan' : 'magenta'; // Different colors for shapes
  ctx.lineWidth = 4;
  ctx.stroke();
}

function onResults(results) {
  if (!midiEnabled) { // If MIDI globally disabled, ensure all notes are off
    let turnedOffAny = false;
    shapes.forEach(shape => {
        if (Object.keys(shape.activeMidiNotes).length > 0) {
            Object.values(shape.activeMidiNotes).forEach(noteInfo => {
                if (noteInfo.playing) {
                    // Temporarily enable MIDI to send note off
                    const originalMidiEnabledState = midiEnabled;
                    midiEnabled = true;
                    sendMidiNoteOff(noteInfo.note, shape.midiChannel);
                    midiEnabled = originalMidiEnabledState;
                    noteInfo.playing = false; // Mark as not playing
                    turnedOffAny = true;
                }
            });
            if (turnedOffAny) shape.activeMidiNotes = {}; // Clear notes for this shape
        }
    });
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

  // Reset hand assignments for shapes each frame
  shapes.forEach(shape => {
    shape.leftHandLandmarks = null;
    shape.rightHandLandmarks = null;
    shape.isThumbResizingActive = false;
  });

  // New hand assignment logic
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    results.multiHandLandmarks.forEach((landmarks, i) => {
      const handednessLabel = results.multiHandedness[i] ? results.multiHandedness[i].label : null;
      drawLandmarks(landmarks); // Draw all detected landmarks

      if (handednessLabel === "Left") {
        if (!shapes[0].leftHandLandmarks) {
          shapes[0].leftHandLandmarks = landmarks;
        } else if (shapes.length > 1 && !shapes[1].leftHandLandmarks) { // Check if shapes[1] exists
          shapes[1].leftHandLandmarks = landmarks;
        }
      } else if (handednessLabel === "Right") {
        if (!shapes[0].rightHandLandmarks) {
          shapes[0].rightHandLandmarks = landmarks;
        } else if (shapes.length > 1 && !shapes[1].rightHandLandmarks) { // Check if shapes[1] exists
          shapes[1].rightHandLandmarks = landmarks;
        }
      }
      // If handednessLabel is null or hand type is already assigned for both users,
      // this hand is currently ignored for shape control.
    });
  }
  // End of New hand assignment logic

  // --- GESTURE PROCESSING ---
  shapes.forEach(shape => {
    shape.isThumbResizingActive = false; // Reset at the start for this shape

    // Update shape position based on average of assigned wrist landmarks
    let wristCount = 0;
    let avgWristX = 0;
    let avgWristY = 0;
    if (shape.leftHandLandmarks && shape.leftHandLandmarks[0]) {
        avgWristX += shape.leftHandLandmarks[0].x;
        avgWristY += shape.leftHandLandmarks[0].y;
        wristCount++;
    }
    if (shape.rightHandLandmarks && shape.rightHandLandmarks[0]) {
        avgWristX += shape.rightHandLandmarks[0].x;
        avgWristY += shape.rightHandLandmarks[0].y;
        wristCount++;
    }

    if (wristCount > 0) {
        let normX = avgWristX / wristCount;
        let normY = avgWristY / wristCount;
        shape.centerX = canvasElement.width - (normX * canvasElement.width);
        shape.centerY = normY * canvasElement.height;
    } else {
        // Optional: if no hands for this shape, keep its last position or move to a default
    }

    // --- NEW: RADIUS CONTROL (Thumbs of same user) ---
    if (shape.leftHandLandmarks && shape.rightHandLandmarks) {
      const leftThumbTip = shape.leftHandLandmarks[4];
      const rightThumbTip = shape.rightHandLandmarks[4];

      // Simplified readiness check
      const leftThumbReady = shape.leftHandLandmarks[4].y < shape.leftHandLandmarks[2].y && shape.leftHandLandmarks[4].y < shape.leftHandLandmarks[3].y;
      const rightThumbReady = shape.rightHandLandmarks[4].y < shape.rightHandLandmarks[2].y && shape.rightHandLandmarks[4].y < shape.rightHandLandmarks[3].y;

      let leftFingersCurled = (shape.leftHandLandmarks[8].y > shape.leftHandLandmarks[6].y) &&
                               (shape.leftHandLandmarks[12].y > shape.leftHandLandmarks[10].y);
      let rightFingersCurled = (shape.rightHandLandmarks[8].y > shape.rightHandLandmarks[6].y) &&
                                (shape.rightHandLandmarks[12].y > shape.rightHandLandmarks[10].y);

      if (leftThumbReady && rightThumbReady && leftFingersCurled && rightFingersCurled) {
        const leftThumbX = canvasElement.width - (leftThumbTip.x * canvasElement.width);
        const leftThumbY = leftThumbTip.y * canvasElement.height;
        const rightThumbX = canvasElement.width - (rightThumbTip.x * canvasElement.width);
        const rightThumbY = rightThumbTip.y * canvasElement.height;
        const thumbDistancePixels = distance(leftThumbX, leftThumbY, rightThumbX, rightThumbY);

        const minThumbDist = canvasElement.width * 0.03;
        const maxThumbDist = canvasElement.width * 0.35;
        const normalizedThumbDist = Math.max(0, Math.min(1, (thumbDistancePixels - minThumbDist) / (maxThumbDist - minThumbDist)));
        shape.radius = 30 + normalizedThumbDist * 270;
        shape.isThumbResizingActive = true;
      }
    }
    // --- END OF RADIUS CONTROL ---

    // --- SIDE CONTROL (Left hand pinch of user) ---
    if (shape.leftHandLandmarks && !shape.isThumbResizingActive) {
        const indexTip = shape.leftHandLandmarks[8];
        const thumbTip = shape.leftHandLandmarks[4];

        const ix = canvasElement.width - (indexTip.x * canvasElement.width);
        const iy = indexTip.y * canvasElement.height;
        const tx = canvasElement.width - (thumbTip.x * canvasElement.width);
        const ty = thumbTip.y * canvasElement.height;
        shape.pinchDistance = distance(ix, iy, tx, ty); // Store for potential use or debugging

        if (isTouchingCircle( (ix+tx)/2, (iy+ty)/2, shape.centerX, shape.centerY, shape.radius)) {
            const newSides = Math.round(Math.min(Math.max((shape.pinchDistance - 10) / 5 + 3, 3), 100));
            if (newSides !== shape.sides) {
                const currentTime = performance.now();
                if (currentTime - shape.lastSideChangeTime > SIDE_CHANGE_DEBOUNCE_MS) {
                    // MIDI note off for removed sides
                    if (newSides < shape.sides && midiEnabled) {
                        for (let k = newSides; k < shape.sides; k++) {
                            if (shape.activeMidiNotes[k] && shape.activeMidiNotes[k].playing) {
                                sendMidiNoteOff(shape.activeMidiNotes[k].note, shape.midiChannel);
                                // Mark as not playing, will be cleaned up in drawShape
                                shape.activeMidiNotes[k].playing = false;
                            }
                        }
                    }
                    shape.sides = newSides;
                    shape.lastSideChangeTime = currentTime;
                }
            }
        }
    }

    // --- LIQUIFY CONTROL (Right hand of user) ---
    // The right hand landmarks for the shape (shape.rightHandLandmarks) are now passed to drawShape
    // The actual liquify calculation happens inside drawShape.
    // No specific gesture logic needed here other than assigning shape.rightHandLandmarks.
  });
  // --- END OF GESTURE PROCESSING ---

  let currentPulseValue = 0;
  if (pulseModeActive) {
      pulseTime = performance.now() * 0.001;
      currentPulseValue = Math.sin(pulseTime * pulseFrequency * 2 * Math.PI);
  }

  // Draw each shape
  shapes.forEach(shape => {
    let currentRadiusForShape = shape.radius;
    if (pulseModeActive) { // Global pulse affects both shapes for now
        let radiusModulationFactor = 0.25 * currentPulseValue;
        currentRadiusForShape = shape.radius * (1 + radiusModulationFactor);
        currentRadiusForShape = Math.max(10, currentRadiusForShape);
    }
    // Pass the shape object, global pulsing state, and current pulse value
    drawShape(shape, pulseModeActive, currentPulseValue);
  });

  updateHUD();

  if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) {
    try {
      const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
      if (popupCanvas) {
        if (popupCanvas.width !== outputPopupWindow.innerWidth || popupCanvas.height !== outputPopupWindow.innerHeight) {
            popupCanvas.width = outputPopupWindow.innerWidth;
            popupCanvas.height = outputPopupWindow.innerHeight;
        }
        popupCanvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        popupCanvasCtx.fillRect(0, 0, popupCanvas.width, popupCanvas.height);
        popupCanvasCtx.drawImage(canvasElement, 0, 0, popupCanvas.width, popupCanvas.height);
      }
    } catch (e) { /* console.warn("Error drawing to popup:", e.message); */ }
  }
}

if (openOutputPopupButton) {
  openOutputPopupButton.addEventListener('click', () => {
    if (outputPopupWindow && !outputPopupWindow.closed) {
      outputPopupWindow.focus();
    } else {
      outputPopupWindow = window.open('', 'OutputWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
      if (!outputPopupWindow || outputPopupWindow.closed || typeof outputPopupWindow.document === 'undefined') {
        alert("Falha ao abrir a janela de saída...");
        outputPopupWindow = null; popupCanvasCtx = null;
      } else {
        outputPopupWindow.document.write('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Visual Output</title><style>body { margin: 0; overflow: hidden; background: #111; display: flex; justify-content: center; align-items: center; } canvas { display: block; width: 100%; height: 100%; }</style></head><body><canvas id="popupCanvas"></canvas></body></html>');
        outputPopupWindow.document.close();
        const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
        if (popupCanvas) {
          popupCanvasCtx = popupCanvas.getContext('2d');
          try {
            popupCanvas.width = outputPopupWindow.innerWidth;
            popupCanvas.height = outputPopupWindow.innerHeight;
          } catch (e) { console.warn("Error setting initial popup canvas size:", e); }
        } else {
          alert("Erro ao configurar a janela de saída.");
          outputPopupWindow.close(); outputPopupWindow = null; popupCanvasCtx = null;
          return;
        }
        outputPopupWindow.addEventListener('beforeunload', () => {
          popupCanvasCtx = null; outputPopupWindow = null;
        });
      }
    }
  });
} else {
  console.error("openOutputPopupButton not found.");
}

// MODIFICATION: updateHUD to show info for both shapes
function updateHUD() {
  if (hudElement) {
    let hudText = "";
    shapes.forEach(shape => {
      const radius = Math.round(shape.radius);
      const sides = shape.sides === 100 ? 'Círculo' : shape.sides;
      const posX = Math.round(shape.centerX);
      const posY = Math.round(shape.centerY);
      const leftHandStatus = shape.leftHandLandmarks ? "L:Detectada" : "L:Nenhuma";
      const rightHandStatus = shape.rightHandLandmarks ? "R:Detectada" : "R:Nenhuma";
      const resizingStatus = shape.isThumbResizingActive ? "Redimensionando" : "Não Redim.";

      hudText += `<b>Forma ${shape.id + 1}:</b> Raio: ${radius}, Lados: ${sides}<br>`;
      hudText += `&nbsp;&nbsp;Posição: (${posX},${posY})<br>`;
      hudText += `&nbsp;&nbsp;Mãos: ${leftHandStatus}, ${rightHandStatus}<br>`;
      hudText += `&nbsp;&nbsp;Polegares: ${resizingStatus}<br><br>`;
    });
    const midiStatus = midiEnabled ? 'ON' : 'OFF';
    const pulseStatus = pulseModeActive ? 'ON' : 'OFF'; // Pulse mode is still global
    const legatoStaccatoStatus = staccatoModeActive ? 'Staccato' : 'Legato';

    hudText += `<b>Geral:</b> MIDI: ${midiStatus}, Pulso: ${pulseStatus}, Articulação: ${legatoStaccatoStatus}`;
    hudElement.innerHTML = hudText;
  }
}

function updateMidiButtonText() {
  if (midiToggleButton) {
    midiToggleButton.textContent = midiEnabled ? "🎹 MIDI ON" : "🎹 MIDI OFF";
  }
}
updateMidiButtonText();

if (midiToggleButton) {
  midiToggleButton.addEventListener('click', () => {
    midiEnabled = !midiEnabled;
    updateMidiButtonText();
    if (!midiEnabled) turnOffAllActiveNotes();
    updateHUD();
  });
}

// Initial HUD update
updateHUD();
console.log("main20.js loaded with Shape class and two shape instances.");
