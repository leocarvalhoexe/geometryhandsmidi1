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
    this.currentPitchBend = 8192; // Initialize pitch bend
    this.reverbAmount = 0; // CC91
    this.delayAmount = 0;  // CC94
    this.lastSentReverb = -1; // To track changes for CC sending
    this.lastSentDelay = -1;  // To track changes for CC sending
    this.vertexOffsets = {}; // Stores { vertexIndex: {x, y, fingerId} } for pulled vertices
    this.beingPulledByFinger = {}; // Stores { fingerId: vertexIndex }
    this.rotationDirection = 1; // 1 for clockwise, -1 for counter-clockwise
    this.currentEdgeIndex = 0;  // For note generation
    this.lastNotePlayedTime = 0; // Timestamp for note generation speed
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
let vertexPullModeActive = false; // New mode

// MODIFICATION: Remove global centerX, centerY functions as position is now per-shape
// const centerX = () => canvasElement.width / 2;
// const centerY = () => canvasElement.height / 2;

// OSC Setup
let osc;
let oscStatus = "OSC Desconectado";
const OSC_HOST = 'localhost';
const OSC_PORT = 8080; // Default WebSocket port for osc-js relay

function setupOSC() {
  osc = new OSC({
    plugin: new OSC.WebsocketClientPlugin({
      host: OSC_HOST,
      port: OSC_PORT,
      secure: false // Change to true if using wss://
    })
  });

  osc.on('open', () => {
    oscStatus = `OSC Conectado a ws://${OSC_HOST}:${OSC_PORT}`;
    console.log(oscStatus);
    updateHUD();
  });

  osc.on('close', () => {
    oscStatus = "OSC Desconectado";
    console.log(oscStatus);
    updateHUD();
    // Optional: attempt to reconnect
    // setTimeout(setupOSC, 5000); 
  });

  osc.on('error', (err) => {
    oscStatus = "OSC Erro";
    console.error("OSC Error:", err);
    updateHUD();
  });

  try {
    osc.open();
  } catch (error) {
    console.error("Falha ao iniciar OSC:", error);
    oscStatus = "OSC Falha ao iniciar";
    updateHUD();
  }
}
// Defer OSC setup until after the page has loaded a bit or via a button.
// For now, let's call it after a short delay or directly.
// window.addEventListener('load', setupOSC); // Or call it directly if OSC is critical path.
setupOSC(); // Attempt to connect on script load.

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

function sendMidiCC(controlNumber, value, channel) {
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validControlNumber = Math.max(0, Math.min(119, Math.round(controlNumber))); // CCs 0-119 generally
    const validValue = Math.max(0, Math.min(127, Math.round(value)));
    // MIDI CC Message: [Status Byte (0xB0 + channel), Control Number, Value]
    const ccMessage = [0xB0 + currentChannel, validControlNumber, validValue];
    midiOutput.send(ccMessage);
    // console.log(`Sent CC: Ch ${currentChannel}, CC# ${validControlNumber}, Val ${validValue}`);
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
  console.log("Attempting to initialize camera - v24 debug"); // Updated log
  try {
    // First, try to get user media to ensure permissions are prompted early.
    // This is crucial for the user's problem: "não chega a pedir permissão da câmera"
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    // Stop the tracks immediately if we only needed this for permission and MediaPipe's Camera will handle its own stream.
    stream.getTracks().forEach(track => track.stop());
    console.log("getUserMedia successful, camera permission likely granted. Proceeding with MediaPipe Camera - v24 debug");

    const camera = new Camera(videoElement, {
      onFrame: async () => {
        // console.log("Camera onFrame triggered"); // DEBUG
        if (videoElement.readyState >= 2) { // Ensure video is ready enough
            await hands.send({ image: videoElement });
        }
      },
      width: 640,
      height: 480
    });
    await camera.start(); // Make sure to await camera.start() if it's async and can throw
    console.log("camera.start() called and awaited - v24 debug");
  } catch (error) {
    console.error("Failed to access webcam or start MediaPipe camera:", error);
    displayGlobalError("Falha ao acessar a webcam. <br>É necessário permitir o acesso à câmera para manipular a forma.<br><br>Erro: " + error.message + "<br><br>Por favor, verifique as permissões da câmera no seu navegador e tente recarregar a página.");
  }
}
initializeCamera(); // Called globally

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
  if (e.key === 'v' || e.key === 'V') {
    vertexPullModeActive = !vertexPullModeActive;
    if (!vertexPullModeActive) {
      // Clear any existing pulls when mode is deactivated
      shapes.forEach(shape => {
        shape.vertexOffsets = {};
        shape.beingPulledByFinger = {};
      });
    }
    updateHUD();
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
  const noteInterval = 200; // ms between notes, can be adjusted or linked to pulse

  // Use shape's properties
  const cx = shape.centerX;
  const cy = shape.centerY;
  let drawingRadius = shape.radius; // Base radius for drawing calculations

  // Pulse affects drawing radius
  if (isPulsing) {
    let radiusModulationFactor = 0.25 * pulseValue; // pulseValue is sin wave from -1 to 1
    drawingRadius = shape.radius * (1 + radiusModulationFactor);
    drawingRadius = Math.max(10, drawingRadius); // Minimum radius
  }

  let localRightHandLandmarks = shape.rightHandLandmarks;
  if (shape.isThumbResizingActive || vertexPullModeActive) { // Disable liquify if thumb resizing or vertex pulling is active
    localRightHandLandmarks = null;
  }

  // Calculate overall distortion for this shape (used for pitch bend and CCs)
  // This is a simplified approach. A more accurate one might average vertex displacements.
  let totalDisplacementMagnitude = 0;
  let activeLiquifyPoints = 0;

  for (let i = 0; i < shape.sides; i++) {
    const angle = (i / shape.sides) * Math.PI * 2;
    // Base vertex position uses the (potentially pulsed) drawingRadius for visual consistency
    let vertexX_orig = drawingRadius * Math.cos(angle);
    let vertexY_orig = drawingRadius * Math.sin(angle);
    let totalDisplacementX = 0;
    let totalDisplacementY = 0;

    // Liquify logic using localRightHandLandmarks
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
          activeLiquifyPoints++;
        }
      }
    }
    
    // Apply vertex pulling offset if active for this vertex
    if (vertexPullModeActive && shape.vertexOffsets[i]) {
        totalDisplacementX += shape.vertexOffsets[i].x;
        totalDisplacementY += shape.vertexOffsets[i].y;
    }

    totalDisplacementMagnitude += Math.sqrt(totalDisplacementX * totalDisplacementX + totalDisplacementY * totalDisplacementY);

    let deformedX = vertexX_orig + totalDisplacementX;
    let deformedY = vertexY_orig + totalDisplacementY;
    const finalX = cx + deformedX;
    const finalY = cy + deformedY;

    if (i === 0) ctx.moveTo(finalX, finalY);
    else ctx.lineTo(finalX, finalY);
  } // End of vertex drawing loop

  ctx.closePath();
  ctx.strokeStyle = shape.id === 0 ? 'cyan' : 'magenta'; // Different colors for shapes
  ctx.lineWidth = 4;
  ctx.stroke();

  // Update shape's global distortion metrics based on liquify/pulling
  const averageDisplacement = (shape.sides > 0 && activeLiquifyPoints > 0) ? totalDisplacementMagnitude / activeLiquifyPoints : (shape.sides > 0 && Object.keys(shape.vertexOffsets).length > 0 ? totalDisplacementMagnitude / Object.keys(shape.vertexOffsets).length : 0) ;
  const maxObservedDistortion = 50.0; // Max average displacement to map to full pitch bend/CC range
  const pitchBendSensitivity = 4096; // How much bend for max distortion (e.g., 4096 for ~1 octave if configured in synth)
  
  let calculatedPitchBend = 8192; // Center value
  if (averageDisplacement > 0.1) {
      const bendAmount = Math.min(1.0, averageDisplacement / maxObservedDistortion) * pitchBendSensitivity;
      calculatedPitchBend = 8192 + Math.round(bendAmount); // Example: bend upwards
      calculatedPitchBend = Math.max(0, Math.min(16383, calculatedPitchBend));
  }
  shape.currentPitchBend = calculatedPitchBend;

  const distortionNormalizedForCC = Math.min(1.0, averageDisplacement / maxObservedDistortion);
  shape.reverbAmount = Math.round(distortionNormalizedForCC * 127);
  shape.delayAmount = Math.round(distortionNormalizedForCC * 127);


  // --- MIDI NOTE GENERATION LOGIC (Dual Direction) ---
  if (midiEnabled && shape.sides > 0 && performance.now() - shape.lastNotePlayedTime > noteInterval) {
    const oldEdgeIndex = shape.currentEdgeIndex;
    if (shape.activeMidiNotes[oldEdgeIndex] && shape.activeMidiNotes[oldEdgeIndex].playing && !staccatoModeActive) {
        sendMidiNoteOff(shape.activeMidiNotes[oldEdgeIndex].note, shape.midiChannel);
        shape.activeMidiNotes[oldEdgeIndex].playing = false;
    }

    shape.currentEdgeIndex += shape.rotationDirection;
    if (shape.currentEdgeIndex >= shape.sides) {
      shape.currentEdgeIndex = Math.max(0, shape.sides - 1); // Stay on last valid index if sides > 0
      shape.rotationDirection = -1;
    } else if (shape.currentEdgeIndex < 0) {
      shape.currentEdgeIndex = 0; // Stay on first valid index
      shape.rotationDirection = 1;
    }
    
    const edgeIndexToPlay = shape.currentEdgeIndex;
    // Ensure edgeIndexToPlay is valid, especially if sides just became 0 or 1
    if (edgeIndexToPlay < shape.sides) {
        const note = getPentatonicNote(edgeIndexToPlay);
        // Velocity based on UNPULSED radius for consistency, but pulse can modulate it further
        let velocity = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * ((127-30) / (300-30)))));
        if (isPulsing) {
            let pulseVelocityFactor = 0.6 + ((pulseValue + 1) / 2) * 0.4; // pulseValue from -1 to 1
            velocity = Math.round(velocity * pulseVelocityFactor);
            velocity = Math.max(0, Math.min(127, velocity));
        }

        sendMidiNoteOn(note, velocity, shape.midiChannel);
        console.log(`v24 drawShape: MIDI Note ON attempted: Shape ${shape.id}, Ch ${shape.midiChannel}, Note ${note}, Vel ${velocity}, Sides ${shape.sides}, EdgeIdx ${edgeIndexToPlay}`); // DEBUG
        if (shape.currentPitchBend !== 8192) { // Send current overall pitch bend
            sendPitchBend(shape.currentPitchBend, shape.midiChannel);
        }
        
        // Send current CCs (reverb/delay)
        if (shape.reverbAmount !== shape.lastSentReverb) {
            sendMidiCC(91, shape.reverbAmount, shape.midiChannel);
            shape.lastSentReverb = shape.reverbAmount;
        }
        if (shape.delayAmount !== shape.lastSentDelay) {
            sendMidiCC(94, shape.delayAmount, shape.midiChannel);
            shape.lastSentDelay = shape.delayAmount;
        }

        // Clear any old staccato timer for this edge index
        if(shape.activeMidiNotes[edgeIndexToPlay] && shape.activeMidiNotes[edgeIndexToPlay].staccatoTimer){
            clearTimeout(shape.activeMidiNotes[edgeIndexToPlay].staccatoTimer);
        }

        shape.activeMidiNotes[edgeIndexToPlay] = {
            note: note,
            channel: shape.midiChannel,
            lastVelocity: velocity,
            lastPitchBend: shape.currentPitchBend,
            playing: true,
            staccatoTimer: null
        };
        
        if (staccatoModeActive) {
            shape.activeMidiNotes[edgeIndexToPlay].staccatoTimer = setTimeout(() => {
                if (shape.activeMidiNotes[edgeIndexToPlay] && shape.activeMidiNotes[edgeIndexToPlay].playing) {
                    sendMidiNoteOff(note, shape.midiChannel);
                    shape.activeMidiNotes[edgeIndexToPlay].playing = false;
                }
            }, 150);
        }
        shape.lastNotePlayedTime = performance.now();
    }
  }
  // --- END OF MIDI NOTE GENERATION LOGIC ---

  // Continuous MIDI updates for the currently sounding note (pitch bend) and CCs
  if (midiEnabled && shape.sides > 0) {
    const activeNoteInfo = shape.activeMidiNotes[shape.currentEdgeIndex];
    if (activeNoteInfo && activeNoteInfo.playing) {
      if (Math.abs(shape.currentPitchBend - activeNoteInfo.lastPitchBend) > 10) { // Threshold to avoid flooding
          sendPitchBend(shape.currentPitchBend, shape.midiChannel);
          activeNoteInfo.lastPitchBend = shape.currentPitchBend;
      }
    }
    // CCs are sent when they change, or with note-on.
    // We can also send them periodically or if they change significantly here.
    // For now, they are updated with note-on and if the value actually changes.
    if (shape.reverbAmount !== shape.lastSentReverb) {
        sendMidiCC(91, shape.reverbAmount, shape.midiChannel);
        shape.lastSentReverb = shape.reverbAmount;
    }
    if (shape.delayAmount !== shape.lastSentDelay) {
        sendMidiCC(94, shape.delayAmount, shape.midiChannel);
        shape.lastSentDelay = shape.delayAmount;
    }
  }


  // Cleanup inactive notes or notes out of bounds due to side changes
  if (Object.keys(shape.activeMidiNotes).length > 0) {
    Object.keys(shape.activeMidiNotes).forEach(edgeIdxStr => {
        const edgeIdxNum = Number(edgeIdxStr);
        const noteInfo = shape.activeMidiNotes[edgeIdxNum];
        let shouldDelete = false;

        if (noteInfo) {
            if (!noteInfo.playing) { // Already marked as not playing (e.g. staccato ended)
                shouldDelete = true;
            } else if (midiEnabled && shape.sides > 0) {
                // If note's index is now out of bounds due to sides changing
                if (edgeIdxNum >= shape.sides) {
                    sendMidiNoteOff(noteInfo.note, shape.midiChannel);
                    noteInfo.playing = false; // Mark for deletion
                    shouldDelete = true;
                }
            } else { // MIDI disabled or sides became 0
                 sendMidiNoteOff(noteInfo.note, shape.midiChannel);
                 noteInfo.playing = false; // Mark for deletion
                 shouldDelete = true;
            }
            
            if (shouldDelete) {
                if (noteInfo.staccatoTimer) {
                    clearTimeout(noteInfo.staccatoTimer);
                }
                delete shape.activeMidiNotes[edgeIdxStr];
            }
        }
    });
    // If MIDI got disabled globally OR shape has no sides, ensure all notes for this shape are cleared out after sending OFF.
    if (!midiEnabled || shape.sides <= 0) {
        Object.values(shape.activeMidiNotes).forEach(noteInfo => {
            if (noteInfo.playing) {
                sendMidiNoteOff(noteInfo.note, shape.midiChannel);
            }
            if (noteInfo.staccatoTimer) clearTimeout(noteInfo.staccatoTimer);
        });
        shape.activeMidiNotes = {};
    }
  }
}


function onResults(results) {
  console.log("v24 onResults: Called with results", results); // Verification log
  // console.log("onResults called with results:", results); // DEBUG
  if (!midiEnabled) {
    // This specific block might be redundant if turnOffAllActiveNotes() is comprehensive
    // and drawShape handles !midiEnabled correctly.
    // However, let's ensure notes are off if midiEnabled is toggled.
    // turnOffAllActiveNotes() is called on 'm' key press.
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Trail effect
  ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

  shapes.forEach(shape => {
    shape.leftHandLandmarks = null;
    shape.rightHandLandmarks = null;
    // isThumbResizingActive is determined per frame, so reset is implicit or handled in gesture logic.
  });

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    // Simple assignment: first Left/Right to shape 0, second Left/Right to shape 1
    let assignedToShape0L = false;
    let assignedToShape0R = false;
    let assignedToShape1L = false;
    let assignedToShape1R = false;

    results.multiHandLandmarks.forEach((landmarks, i) => {
      const handedness = results.multiHandedness[i] ? results.multiHandedness[i].label : null;
      drawLandmarks(landmarks); // Draw all detected landmarks for visual feedback

      if (handedness === "Left") {
        if (!shapes[0].leftHandLandmarks && !assignedToShape0L) {
          shapes[0].leftHandLandmarks = landmarks;
          assignedToShape0L = true;
        } else if (shapes.length > 1 && !shapes[1].leftHandLandmarks && !assignedToShape1L) {
          shapes[1].leftHandLandmarks = landmarks;
          assignedToShape1L = true;
        }
      } else if (handedness === "Right") {
        if (!shapes[0].rightHandLandmarks && !assignedToShape0R) {
          shapes[0].rightHandLandmarks = landmarks;
          assignedToShape0R = true;
        } else if (shapes.length > 1 && !shapes[1].rightHandLandmarks && !assignedToShape1R) {
          shapes[1].rightHandLandmarks = landmarks;
          assignedToShape1R = true;
        }
      }
    });
  }
  
  shapes.forEach(shape => {
    shape.isThumbResizingActive = false; // Reset for current shape's gesture processing

    // Update shape position based on average of assigned wrist landmarks (if any)
    let wristCount = 0;
    let avgWristX = 0;
    let avgWristY = 0;
    if (shape.leftHandLandmarks && shape.leftHandLandmarks[0]) { // Wrist is landmark 0
        avgWristX += shape.leftHandLandmarks[0].x;
        avgWristY += shape.leftHandLandmarks[0].y;
        wristCount++;
    }
    if (shape.rightHandLandmarks && shape.rightHandLandmarks[0]) { // Wrist is landmark 0
        avgWristX += shape.rightHandLandmarks[0].x;
        avgWristY += shape.rightHandLandmarks[0].y;
        wristCount++;
    }

    if (wristCount > 0) {
        let normX = avgWristX / wristCount;
        let normY = avgWristY / wristCount;
        // Invert X for mirrored view
        shape.centerX = canvasElement.width - (normX * canvasElement.width); 
        shape.centerY = normY * canvasElement.height;
    }

    // --- RADIUS CONTROL (Thumbs of same user) ---
    if (shape.leftHandLandmarks && shape.rightHandLandmarks) {
      const leftThumbTip = shape.leftHandLandmarks[4];
      const rightThumbTip = shape.rightHandLandmarks[4];

      // Check if fingers (index, middle) are curled for both hands
      // A finger is considered curled if its tip (e.g., 8 for index) is 'above' (smaller y) its joint (e.g., 6)
      // This assumes hands are somewhat upright. This logic might need refinement for robustness.
      const leftIndexCurled = shape.leftHandLandmarks[8].y > shape.leftHandLandmarks[6].y;
      const leftMiddleCurled = shape.leftHandLandmarks[12].y > shape.leftHandLandmarks[10].y;
      const rightIndexCurled = shape.rightHandLandmarks[8].y > shape.rightHandLandmarks[6].y;
      const rightMiddleCurled = shape.rightHandLandmarks[12].y > shape.rightHandLandmarks[10].y;

      if (leftIndexCurled && leftMiddleCurled && rightIndexCurled && rightMiddleCurled) {
        const leftThumbX = canvasElement.width - (leftThumbTip.x * canvasElement.width);
        const leftThumbY = leftThumbTip.y * canvasElement.height;
        const rightThumbX = canvasElement.width - (rightThumbTip.x * canvasElement.width);
        const rightThumbY = rightThumbTip.y * canvasElement.height;
        const thumbDistancePixels = distance(leftThumbX, leftThumbY, rightThumbX, rightThumbY);

        const minThumbDist = canvasElement.width * 0.03; // ~3% of screen width
        const maxThumbDist = canvasElement.width * 0.35; // ~35% of screen width
        const normalizedThumbDist = Math.max(0, Math.min(1, (thumbDistancePixels - minThumbDist) / (maxThumbDist - minThumbDist)));
        shape.radius = 30 + normalizedThumbDist * 270; // Map to radius 30-300
        shape.isThumbResizingActive = true;
      }
    }

    // --- SIDE CONTROL (Left hand pinch of user) ---
    if (shape.leftHandLandmarks && !shape.isThumbResizingActive) {
        const indexTip = shape.leftHandLandmarks[8]; // Landmark 8: INDEX_FINGER_TIP
        const thumbTip = shape.leftHandLandmarks[4]; // Landmark 4: THUMB_TIP

        const ix_canvas = canvasElement.width - (indexTip.x * canvasElement.width);
        const iy_canvas = indexTip.y * canvasElement.height;
        const tx_canvas = canvasElement.width - (thumbTip.x * canvasElement.width);
        const ty_canvas = thumbTip.y * canvasElement.height;
        shape.pinchDistance = distance(ix_canvas, iy_canvas, tx_canvas, ty_canvas);

        // Check if the pinch gesture is close to the shape's boundary
        const pinchCenterX = (ix_canvas + tx_canvas) / 2;
        const pinchCenterY = (iy_canvas + ty_canvas) / 2;
        if (isTouchingCircle(pinchCenterX, pinchCenterY, shape.centerX, shape.centerY, shape.radius, shape.radius * 0.5)) { // Tolerance based on radius
            // Map pinch distance to number of sides (e.g., 10px to 200px maps to 3 to 20 sides)
            // Circle (100 sides) can be a special max value if pinch is very wide or specific gesture
            const minPinch = 10; const maxPinchDistForSides = 150;
            const sidesRangeMin = 3; const sidesRangeMax = 20; // Max controllable sides via pinch
            
            let newSides;
            if (shape.pinchDistance > maxPinchDistForSides * 1.2) { // Very open pinch could mean circle
                newSides = 100;
            } else {
                const normalizedPinch = Math.max(0, Math.min(1, (shape.pinchDistance - minPinch) / (maxPinchDistForSides - minPinch)));
                newSides = Math.round(sidesRangeMin + normalizedPinch * (sidesRangeMax - sidesRangeMin));
            }
            newSides = Math.max(3, Math.min(100, newSides)); // Clamp

            if (newSides !== shape.sides) {
                const currentTime = performance.now();
                if (currentTime - shape.lastSideChangeTime > SIDE_CHANGE_DEBOUNCE_MS) {
                    // Note: MIDI note off for removed sides is handled in drawShape's cleanup logic
                    shape.sides = newSides;
                    shape.lastSideChangeTime = currentTime;
                    // Reset currentEdgeIndex if it becomes invalid, or let drawShape handle it
                    if (shape.currentEdgeIndex >= newSides) {
                        shape.currentEdgeIndex = Math.max(0, newSides -1 );
                        // Consider resetting rotation direction or letting it continue
                    }
                }
            }
        }
    }
    
    // --- VERTEX PULLING LOGIC (Right hand index finger of user) ---
    if (vertexPullModeActive && shape.rightHandLandmarks && !shape.isThumbResizingActive) {
      const indexFingertip = shape.rightHandLandmarks[8]; // Index fingertip
      const fingertipX_canvas = canvasElement.width - (indexFingertip.x * canvasElement.width);
      const fingertipY_canvas = indexFingertip.y * canvasElement.height;
      const pullRadiusThreshold = 30; 
      const fingerId = shape.id + "_idx"; 

      let pulledVertexThisFrame = false;

      if (shape.beingPulledByFinger[fingerId] !== undefined) {
        const vertexIndex = shape.beingPulledByFinger[fingerId];
        // Use the shape's current (potentially pulsed for drawing) radius to calculate original vertex pos
        const currentDrawingRadius = pulseModeActive ? shape.radius * (1 + 0.25 * Math.sin(pulseTime * pulseFrequency * 2 * Math.PI)) : shape.radius;
        const angle = (vertexIndex / shape.sides) * Math.PI * 2;
        const originalVertexX_view = currentDrawingRadius * Math.cos(angle); // relative to shape center
        const originalVertexY_view = currentDrawingRadius * Math.sin(angle);
        
        const displacementX = fingertipX_canvas - (shape.centerX + originalVertexX_view);
        const displacementY = fingertipY_canvas - (shape.centerY + originalVertexY_view);

        shape.vertexOffsets[vertexIndex] = { x: displacementX, y: displacementY, fingerId: fingerId };
        pulledVertexThisFrame = true;
      } else {
        for (let i = 0; i < shape.sides; i++) {
          const currentDrawingRadius = pulseModeActive ? shape.radius * (1 + 0.25 * Math.sin(pulseTime * pulseFrequency * 2 * Math.PI)) : shape.radius;
          const angle = (i / shape.sides) * Math.PI * 2;
          let vertexX_orig_view = currentDrawingRadius * Math.cos(angle);
          let vertexY_orig_view = currentDrawingRadius * Math.sin(angle);
          
          const currentVertexCanvasX = shape.centerX + vertexX_orig_view;
          const currentVertexCanvasY = shape.centerY + vertexY_orig_view;

          if (distance(fingertipX_canvas, fingertipY_canvas, currentVertexCanvasX, currentVertexCanvasY) < pullRadiusThreshold) {
            let alreadyPulledByOtherFinger = false; // Future proofing for multi-finger pull on same shape
            for (const fId in shape.beingPulledByFinger) {
                if (shape.beingPulledByFinger[fId] === i && fId !== fingerId) {
                    alreadyPulledByOtherFinger = true;
                    break;
                }
            }
            if (alreadyPulledByOtherFinger) continue;

            const displacementX = fingertipX_canvas - currentVertexCanvasX;
            const displacementY = fingertipY_canvas - currentVertexCanvasY;
            shape.vertexOffsets[i] = { x: displacementX, y: displacementY, fingerId: fingerId };
            shape.beingPulledByFinger[fingerId] = i;
            pulledVertexThisFrame = true;
            break; 
          }
        }
      }

      if (!pulledVertexThisFrame && shape.beingPulledByFinger[fingerId] !== undefined) {
         const vertexIndexReleased = shape.beingPulledByFinger[fingerId];
         if (shape.vertexOffsets[vertexIndexReleased] && shape.vertexOffsets[vertexIndexReleased].fingerId === fingerId) {
            delete shape.vertexOffsets[vertexIndexReleased];
         }
         delete shape.beingPulledByFinger[fingerId];
      }
    } else if (!vertexPullModeActive) { // If mode just got deactivated
        // This is also handled by keydown, but good to ensure clearance if hands are still present
        const fingerId = shape.id + "_idx";
        if (shape.beingPulledByFinger[fingerId] !== undefined) {
            const vertexIndex = shape.beingPulledByFinger[fingerId];
            if (shape.vertexOffsets[vertexIndex] && shape.vertexOffsets[vertexIndex].fingerId === fingerId) {
               delete shape.vertexOffsets[vertexIndex];
            }
            delete shape.beingPulledByFinger[fingerId];
        }
    }
  });

  // Pulse calculation
  let currentPulseValue = 0; // Sin wave from -1 to 1
  if (pulseModeActive) {
      pulseTime = performance.now() * 0.001; // Time in seconds
      currentPulseValue = Math.sin(pulseTime * pulseFrequency * 2 * Math.PI);
      lastPulseValue = currentPulseValue; // Store for potential use if needed outside
  }

  // Draw each shape
  shapes.forEach(shape => {
    // Pass the shape object, whether global pulsing is active, and the current pulse value (-1 to 1)
    drawShape(shape, pulseModeActive, currentPulseValue);
  });

  updateHUD();

  // Update output popup window
  if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) {
    try {
      const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
      if (popupCanvas) {
        // Ensure popup canvas size matches its window
        if (popupCanvas.width !== outputPopupWindow.innerWidth || popupCanvas.height !== outputPopupWindow.innerHeight) {
            popupCanvas.width = outputPopupWindow.innerWidth;
            popupCanvas.height = outputPopupWindow.innerHeight;
        }
        // Clear with transparency (or match main canvas background)
        popupCanvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)'; 
        popupCanvasCtx.fillRect(0, 0, popupCanvas.width, popupCanvas.height);
        // Draw main canvas content to popup (scaled if necessary)
        popupCanvasCtx.drawImage(canvasElement, 0, 0, popupCanvas.width, popupCanvas.height);
      }
    } catch (e) { 
      // console.warn("Error drawing to popup:", e.message); 
      // Can happen if popup is closed abruptly
      if (e.name === "InvalidStateError" || (outputPopupWindow && outputPopupWindow.closed)) {
        popupCanvasCtx = null; 
        outputPopupWindow = null; // Ensure it's marked as closed
      }
    }
  }
}


if (openOutputPopupButton) {
  openOutputPopupButton.addEventListener('click', () => {
    if (outputPopupWindow && !outputPopupWindow.closed) {
      outputPopupWindow.focus();
    } else {
      outputPopupWindow = window.open('', 'OutputWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
      if (!outputPopupWindow || outputPopupWindow.closed || typeof outputPopupWindow.document === 'undefined') {
        alert("Falha ao abrir a janela de saída. Verifique as configurações de pop-up do seu navegador.");
        outputPopupWindow = null; popupCanvasCtx = null;
      } else {
        outputPopupWindow.document.write('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Visual Output</title><style>body { margin: 0; overflow: hidden; background: #111; display: flex; justify-content: center; align-items: center; } canvas { display: block; width: 100%; height: 100%; }</style></head><body><canvas id="popupCanvas"></canvas></body></html>');
        outputPopupWindow.document.close(); // Important to close the document write stream

        // Wait for the document to be fully loaded before accessing elements
        outputPopupWindow.onload = () => {
            const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
            if (popupCanvas) {
              popupCanvasCtx = popupCanvas.getContext('2d');
              try {
                // Set initial size
                popupCanvas.width = outputPopupWindow.innerWidth;
                popupCanvas.height = outputPopupWindow.innerHeight;
              } catch (e) { console.warn("Error setting initial popup canvas size:", e); }
            } else {
              alert("Erro ao configurar o canvas na janela de saída.");
              outputPopupWindow.close(); outputPopupWindow = null; popupCanvasCtx = null;
            }
        };
        
        outputPopupWindow.addEventListener('beforeunload', () => {
          popupCanvasCtx = null; outputPopupWindow = null; // Cleanup
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
      const pitchBendDisplay = shape.currentPitchBend - 8192;

      hudText += `<b>Forma ${shape.id + 1}:</b> Raio: ${radius}, Lados: ${sides}<br>`;
      hudText += `&nbsp;&nbsp;Posição: (${posX},${posY})<br>`;
      hudText += `&nbsp;&nbsp;Mãos: ${leftHandStatus}, ${rightHandStatus}<br>`;
      hudText += `&nbsp;&nbsp;Polegares: ${resizingStatus}<br>`;
      hudText += `&nbsp;&nbsp;Pitch Bend Val: ${shape.currentPitchBend} (Rel: ${pitchBendDisplay})<br>`;
      hudText += `&nbsp;&nbsp;Reverb (CC91): ${shape.reverbAmount}<br>`;
      hudText += `&nbsp;&nbsp;Delay (CC94): ${shape.delayAmount}<br>`;
      hudText += `&nbsp;&nbsp;Nota Atual Idx: ${shape.currentEdgeIndex}, Dir: ${shape.rotationDirection === 1 ? 'CW' : 'CCW'}<br><br>`;
    });

    const midiStatus = midiEnabled ? 'ON' : 'OFF';
    const pulseStatus = pulseModeActive ? 'ON' : 'OFF';
    const legatoStaccatoStatus = staccatoModeActive ? 'Staccato' : 'Legato';
    const vertexPullStatus = vertexPullModeActive ? 'ON' : 'OFF';

    hudText += `<b>Geral:</b> MIDI: ${midiStatus}, Pulso: ${pulseStatus}, Articulação: ${legatoStaccatoStatus}, Puxar Vértices: ${vertexPullStatus}<br>`;
    hudText += `<b>OSC:</b> ${oscStatus}`;
    hudElement.innerHTML = hudText;

    // OSC Sending Logic
    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
      shapes.forEach(shape => {
        const shapeId = shape.id + 1; 
        
        osc.send(new OSC.Message(`/forma/${shapeId}/radius`, parseFloat(shape.radius.toFixed(2))));
        osc.send(new OSC.Message(`/forma/${shapeId}/sides`, parseInt(shape.sides)));
        
        const posX_norm = parseFloat((shape.centerX / canvasElement.width).toFixed(3));
        const posY_norm = parseFloat((shape.centerY / canvasElement.height).toFixed(3));
        osc.send(new OSC.Message(`/forma/${shapeId}/pos`, posX_norm, posY_norm));
        
        const maxPitchBendRange = 8191; 
        const distortionMetric = Math.abs(shape.currentPitchBend - 8192) / maxPitchBendRange;
        osc.send(new OSC.Message(`/forma/${shapeId}/distortion`, parseFloat(distortionMetric.toFixed(3))));

        osc.send(new OSC.Message(`/forma/${shapeId}/pitchbend`, parseInt(shape.currentPitchBend)));
        osc.send(new OSC.Message(`/forma/${shapeId}/cc91`, parseInt(shape.reverbAmount)));
        osc.send(new OSC.Message(`/forma/${shapeId}/cc94`, parseInt(shape.delayAmount)));
        osc.send(new OSC.Message(`/forma/${shapeId}/direction`, parseInt(shape.rotationDirection)));
      });
       // Global parameters OSC
      osc.send(new OSC.Message(`/global/pulseActive`, pulseModeActive ? 1 : 0));
      osc.send(new OSC.Message(`/global/staccatoActive`, staccatoModeActive ? 1 : 0));
      osc.send(new OSC.Message(`/global/vertexPullActive`, vertexPullModeActive ? 1 : 0));
      osc.send(new OSC.Message(`/global/midiEnabled`, midiEnabled ? 1 : 0));
    }
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
    if (!midiEnabled) {
        turnOffAllActiveNotes(); // Ensure all notes are turned off when MIDI is disabled
    }
    updateHUD();
  });
}

// Initial HUD update
updateHUD();
console.log("main24.js loaded. Attempting to initialize camera and MediaPipe Hands.");
