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
    // this.isThumbResizingActive = false; // Replaced by activeGesture
    this.activeGesture = null; // null, 'resize', 'sides', 'liquify', 'pull'
    this.currentPitchBend = 8192; // Initialize pitch bend
    this.reverbAmount = 0; // CC91
    this.delayAmount = 0;  // CC94
    this.panValue = 64;    // CC10 (Pan)
    this.brightnessValue = 64; // CC74 (Brightness)
    this.lastSentReverb = -1; // To track changes for CC sending
    this.lastSentDelay = -1;  // To track changes for CC sending
    this.lastSentPan = -1;    // To track changes for CC sending
    this.lastSentBrightness = -1; // To track changes for CC sending
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
let lastOscSendTime = 0;
const OSC_SEND_INTERVAL = 100; // ms, for 10Hz. Use 200 for 5Hz.


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

  // Listen for incoming OSC messages
  osc.on('/forma/+/setRadius', msg => { // Example: /forma/1/setRadius 150
    const shapeIndex = parseInt(msg.address.split('/')[2]) - 1;
    if (shapes[shapeIndex] && typeof msg.args[0] === 'number') {
      shapes[shapeIndex].radius = Math.max(10, Math.min(300, msg.args[0]));
      console.log(`OSC: Forma ${shapeIndex + 1} raio definido para ${shapes[shapeIndex].radius}`);
      updateHUD();
    }
  });

  osc.on('/forma/+/setSides', msg => { // Example: /forma/1/setSides 5
    const shapeIndex = parseInt(msg.address.split('/')[2]) - 1;
    if (shapes[shapeIndex] && typeof msg.args[0] === 'number') {
      shapes[shapeIndex].sides = Math.max(3, Math.min(100, Math.round(msg.args[0])));
      console.log(`OSC: Forma ${shapeIndex + 1} lados definidos para ${shapes[shapeIndex].sides}`);
      if (shapes[shapeIndex].currentEdgeIndex >= shapes[shapeIndex].sides) {
        shapes[shapeIndex].currentEdgeIndex = Math.max(0, shapes[shapeIndex].sides - 1);
      }
      turnOffAllActiveNotes(); // Or just for that shape
      updateHUD();
    }
  });
  
  osc.on('/global/setPulseActive', msg => {
    if (typeof msg.args[0] === 'number' || typeof msg.args[0] === 'boolean') {
        pulseModeActive = !!msg.args[0];
        if (pulseModeActive) pulseTime = 0;
        console.log(`OSC: Modo Pulso definido para ${pulseModeActive}`);
        updateHUD();
    }
  });

  osc.on('/global/setStaccatoActive', msg => {
    if (typeof msg.args[0] === 'number' || typeof msg.args[0] === 'boolean') {
        staccatoModeActive = !!msg.args[0];
        console.log(`OSC: Modo Staccato definido para ${staccatoModeActive}`);
        updateHUD();
    }
  });

   osc.on('/global/setVertexPullActive', msg => {
    if (typeof msg.args[0] === 'number' || typeof msg.args[0] === 'boolean') {
        vertexPullModeActive = !!msg.args[0];
         console.log(`OSC: Modo Puxar Vértices definido para ${vertexPullModeActive}`);
        if (!vertexPullModeActive) {
          shapes.forEach(shape => {
            shape.vertexOffsets = {};
            shape.beingPulledByFinger = {};
          });
        }
        updateHUD();
    }
  });

  osc.on('/global/setMidiEnabled', msg => {
    if (typeof msg.args[0] === 'number' || typeof msg.args[0] === 'boolean') {
        midiEnabled = !!msg.args[0];
        updateMidiButtonText();
        if (!midiEnabled) turnOffAllActiveNotes();
        console.log(`OSC: MIDI definido para ${midiEnabled}`);
        updateHUD();
    }
  });

  osc.on('/global/setScale', msg => {
    const newScaleName = msg.args[0];
    if (typeof newScaleName === 'string' && SCALES[newScaleName]) {
      currentScaleName = newScaleName;
      currentScaleIndex = scaleKeys.indexOf(newScaleName); // Update index accordingly
      console.log(`OSC: Escala definida para ${SCALES[currentScaleName].name}`);
      turnOffAllActiveNotes();
      updateHUD();
      // Optionally send confirmation back if not done by continuous HUD updates
      // if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
      //   osc.send(new OSC.Message('/global/scaleChanged', currentScaleName, SCALES[currentScaleName].name));
      // }
    } else {
      console.warn(`OSC: Tentativa de definir escala para valor inválido/desconhecido: ${newScaleName}`);
    }
  });

  osc.on('/global/setNoteMode', msg => {
    const newNoteMode = msg.args[0];
    if (typeof newNoteMode === 'string' && NOTE_MODES.includes(newNoteMode)) {
      currentNoteMode = newNoteMode;
      currentNoteModeIndex = NOTE_MODES.indexOf(newNoteMode);
      console.log(`OSC: Modo de nota definido para ${currentNoteMode}`);
      turnOffAllActiveNotes();
      updateHUD();
    } else {
      console.warn(`OSC: Tentativa de definir modo de nota para valor inválido/desconhecido: ${newNoteMode}`);
    }
  });
}

setupOSC(); 

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
function sendMidiNoteOn(note, velocity, channel, shapeId = -1) { // Added shapeId for OSC
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validNote = Math.max(0, Math.min(127, Math.round(note)));
    const validVelocity = Math.max(0, Math.min(127, Math.round(velocity)));
    const noteOnMessage = [0x90 + currentChannel, validNote, validVelocity];
    midiOutput.send(noteOnMessage);

    if (osc && osc.status() === OSC.STATUS.IS_OPEN && shapeId !== -1) {
      osc.send(new OSC.Message(`/forma/${shapeId}/noteOn`, validNote, validVelocity, currentChannel));
    }
  }
}

function sendMidiNoteOff(note, channel, shapeId = -1) { // Added shapeId for OSC
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validNote = Math.max(0, Math.min(127, Math.round(note)));
    const noteOffMessage = [0x80 + currentChannel, validNote, 0];
    midiOutput.send(noteOffMessage);

    if (osc && osc.status() === OSC.STATUS.IS_OPEN && shapeId !== -1) {
      osc.send(new OSC.Message(`/forma/${shapeId}/noteOff`, validNote, currentChannel));
    }
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

// Musical Scales Definition
const SCALES = {
  PENTATONIC_MAJ: { name: 'Pentatônica Maior', notes: [0, 2, 4, 7, 9], baseMidiNote: 60 }, // C4 Pentatonic Major
  DORIAN: { name: 'Dórico', notes: [0, 2, 3, 5, 7, 9, 10], baseMidiNote: 60 },         // C4 Dorian
  HARMONIC_MINOR: { name: 'Menor Harmônica', notes: [0, 2, 3, 5, 7, 8, 11], baseMidiNote: 57 }, // A3 Harmonic Minor
  CHROMATIC: { name: 'Cromática', notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], baseMidiNote: 60 } // C4 Chromatic
};
let currentScaleName = 'PENTATONIC_MAJ';
const scaleKeys = Object.keys(SCALES);
let currentScaleIndex = 0; // Index for cycling through SCALES

// Note Generation Modes
const NOTE_MODES = ['SEQUENTIAL', 'ARPEGGIO', 'CHORD', 'RANDOM_WALK'];
let currentNoteMode = 'SEQUENTIAL';
let currentNoteModeIndex = 0; // Index for cycling through NOTE_MODES


function getNoteInScale(index, baseOctaveOffset = 0) {
  const scale = SCALES[currentScaleName];
  if (!scale) {
    console.warn(`Escala ${currentScaleName} não encontrada. Usando Pentatônica Maior.`);
    return SCALES.PENTATONIC_MAJ.notes[0] + SCALES.PENTATONIC_MAJ.baseMidiNote; // Default fallback
  }
  const scaleNotes = scale.notes;
  const scaleLength = scaleNotes.length;
  const octave = baseOctaveOffset + Math.floor(index / scaleLength);
  const noteIndexInScale = index % scaleLength;
  let note = scale.baseMidiNote + scaleNotes[noteIndexInScale] + (octave * 12);
  
  // Ensure note is within MIDI range 0-127
  note = Math.max(0, Math.min(127, note));
  return note;
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
  console.log("Attempting to initialize camera - v25 debug"); // Updated log
  try {
    // First, try to get user media to ensure permissions are prompted early.
    // This is crucial for the user's problem: "não chega a pedir permissão da câmera"
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    // Stop the tracks immediately if we only needed this for permission and MediaPipe's Camera will handle its own stream.
    stream.getTracks().forEach(track => track.stop());
    console.log("getUserMedia successful, camera permission likely granted. Proceeding with MediaPipe Camera - v25 debug");

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
    console.log("camera.start() called and awaited - v25 debug");
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
  if (e.key === 's' || e.key === 'S') {
    currentScaleIndex = (currentScaleIndex + 1) % scaleKeys.length;
    currentScaleName = scaleKeys[currentScaleIndex];
    console.log("Scale changed to:", SCALES[currentScaleName].name);
    turnOffAllActiveNotes(); // Turn off notes from old scale
    updateHUD();
    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
        osc.send(new OSC.Message('/global/scaleChanged', currentScaleName, SCALES[currentScaleName].name));
    }
  }
  if (e.key === 'n' || e.key === 'N') {
    currentNoteModeIndex = (currentNoteModeIndex + 1) % NOTE_MODES.length;
    currentNoteMode = NOTE_MODES[currentNoteModeIndex];
    console.log("Note mode changed to:", currentNoteMode);
    turnOffAllActiveNotes(); // Notes might change drastically
    updateHUD();
    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
        osc.send(new OSC.Message('/global/noteModeChanged', currentNoteMode));
    }
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
    drawingRadius = shape.radius * (1 + radiusModulationFactor); // Use un-smoothed radius for pulse calculation base
    drawingRadius = Math.max(10, drawingRadius); // Minimum radius
  }

  let localRightHandLandmarks = shape.rightHandLandmarks;
  // Disable liquify if another gesture is active on this shape or if global vertex pull is on for this shape
  if (shape.activeGesture && shape.activeGesture !== 'liquify') {
    localRightHandLandmarks = null;
  }
  if (vertexPullModeActive && shape.activeGesture === 'pull') { // Specifically if 'pull' is the active gesture for *this* shape
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

  // Map position X to Pan (CC10)
  shape.panValue = Math.max(0, Math.min(127, Math.round((shape.centerX / canvasElement.width) * 127)));
  // Map number of sides to Brightness (CC74) - example mapping
  const minSidesForBrightness = 3;
  const maxSidesForBrightness = 20; // Affects sensitivity
  let normalizedSides = (shape.sides - minSidesForBrightness) / (maxSidesForBrightness - minSidesForBrightness);
  normalizedSides = Math.max(0, Math.min(1, normalizedSides)); // Clamp
  if (shape.sides === 100) normalizedSides = 0.5; // Circle could be a neutral brightness
  shape.brightnessValue = Math.round(normalizedSides * 127);


  // --- MIDI NOTE GENERATION LOGIC (v25 - With Modes) ---
  if (midiEnabled && shape.sides > 0 && performance.now() - shape.lastNotePlayedTime > noteInterval) {
    // Turn off previous note if in legato mode
    const oldEdgeIndex = shape.currentEdgeIndex;
    if (shape.activeMidiNotes[oldEdgeIndex] && shape.activeMidiNotes[oldEdgeIndex].playing && !staccatoModeActive && currentNoteMode !== 'CHORD') {
        sendMidiNoteOff(shape.activeMidiNotes[oldEdgeIndex].note, shape.midiChannel, shape.id + 1);
        shape.activeMidiNotes[oldEdgeIndex].playing = false;
    }

    // Determine next note index based on mode
    let edgeIndexToPlay = shape.currentEdgeIndex; // Default for sequential
    let notesToPlay = []; // Can be multiple for CHORD mode

    switch (currentNoteMode) {
        case 'SEQUENTIAL':
        case 'ARPEGGIO': // Arpeggio uses sequential logic for now, but could be more complex (e.g. up/down patterns)
            shape.currentEdgeIndex += shape.rotationDirection;
            if (shape.currentEdgeIndex >= shape.sides) {
                shape.currentEdgeIndex = Math.max(0, shape.sides - 1);
                shape.rotationDirection = -1;
            } else if (shape.currentEdgeIndex < 0) {
                shape.currentEdgeIndex = 0;
                shape.rotationDirection = 1;
            }
            edgeIndexToPlay = shape.currentEdgeIndex;
            if (edgeIndexToPlay < shape.sides) {
                 notesToPlay.push(getNoteInScale(edgeIndexToPlay));
            }
            break;
        case 'CHORD':
            // Play a chord based on the currentEdgeIndex as the root of the chord in the scale
            // For simplicity, let's play root, 3rd, 5th OF THE SCALE
            shape.currentEdgeIndex += shape.rotationDirection; // Still advance the "trigger"
             if (shape.currentEdgeIndex >= shape.sides) {
                shape.currentEdgeIndex = Math.max(0, shape.sides - 1);
                shape.rotationDirection = -1;
            } else if (shape.currentEdgeIndex < 0) {
                shape.currentEdgeIndex = 0;
                shape.rotationDirection = 1;
            }
            edgeIndexToPlay = shape.currentEdgeIndex;

            if (edgeIndexToPlay < shape.sides) {
                const scale = SCALES[currentScaleName];
                const rootNoteInScaleIndex = edgeIndexToPlay % scale.notes.length; // Use edgeIndex to pick root from scale
                
                notesToPlay.push(getNoteInScale(edgeIndexToPlay)); // Root
                notesToPlay.push(getNoteInScale(edgeIndexToPlay + 2)); // 3rd in scale (2 steps up)
                notesToPlay.push(getNoteInScale(edgeIndexToPlay + 4)); // 5th in scale (4 steps up)
                
                // Turn off all previously sounding notes for this shape before playing new chord
                Object.keys(shape.activeMidiNotes).forEach(idx => {
                    if (shape.activeMidiNotes[idx] && shape.activeMidiNotes[idx].playing) {
                        sendMidiNoteOff(shape.activeMidiNotes[idx].note, shape.midiChannel, shape.id + 1);
                        if(shape.activeMidiNotes[idx].staccatoTimer) clearTimeout(shape.activeMidiNotes[idx].staccatoTimer);
                    }
                });
                shape.activeMidiNotes = {}; // Clear old notes
            }
            break;
        case 'RANDOM_WALK':
            // Move to an adjacent note in the scale, or stay
            let step = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
            shape.currentEdgeIndex += step;
            // Wrap around shape.sides (or scale length, depending on desired behavior)
            const numNotesInCurrentScaleContext = SCALES[currentScaleName].notes.length * 2; // Example: 2 octaves range for random walk
            shape.currentEdgeIndex = (shape.currentEdgeIndex + numNotesInCurrentScaleContext) % numNotesInCurrentScaleContext;
            
            edgeIndexToPlay = shape.currentEdgeIndex; // This index is now within the scale context
            notesToPlay.push(getNoteInScale(edgeIndexToPlay));
            break;
    }
    
    if (notesToPlay.length > 0) {
        let velocity = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * ((127-30) / (300-30)))));
        if (isPulsing) {
            let pulseVelocityFactor = 0.6 + ((pulseValue + 1) / 2) * 0.4;
            velocity = Math.round(velocity * pulseVelocityFactor);
            velocity = Math.max(0, Math.min(127, velocity));
        }

        notesToPlay.forEach((note, i) => {
            const noteKeyForActive = `${edgeIndexToPlay}_${i}`; // For chords, need unique keys

            sendMidiNoteOn(note, velocity, shape.midiChannel, shape.id + 1); // Pass shapeId for OSC
            // console.log(`v25 MIDI Note ON: Shape ${shape.id}, Ch ${shape.midiChannel}, Note ${note}, Vel ${velocity}, Mode ${currentNoteMode}`);
            
            // Clear any old staccato timer for this specific note instance
            if(shape.activeMidiNotes[noteKeyForActive] && shape.activeMidiNotes[noteKeyForActive].staccatoTimer){
                clearTimeout(shape.activeMidiNotes[noteKeyForActive].staccatoTimer);
            }

            shape.activeMidiNotes[noteKeyForActive] = {
                note: note,
                channel: shape.midiChannel,
                lastVelocity: velocity,
                lastPitchBend: shape.currentPitchBend, // Pitch bend applies to all notes in chord for simplicity
                playing: true,
                staccatoTimer: null
            };
            
            if (staccatoModeActive) {
                shape.activeMidiNotes[noteKeyForActive].staccatoTimer = setTimeout(() => {
                    if (shape.activeMidiNotes[noteKeyForActive] && shape.activeMidiNotes[noteKeyForActive].playing) {
                    sendMidiNoteOff(note, shape.midiChannel, shape.id + 1); // Pass shapeId for OSC
                        shape.activeMidiNotes[noteKeyForActive].playing = false;
                    }
                }, 150);
            }
        });
        
        if (shape.currentPitchBend !== 8192) { sendPitchBend(shape.currentPitchBend, shape.midiChannel); }
        // Send all current CCs
        if (shape.reverbAmount !== shape.lastSentReverb) { sendMidiCC(91, shape.reverbAmount, shape.midiChannel); shape.lastSentReverb = shape.reverbAmount; }
        if (shape.delayAmount !== shape.lastSentDelay) { sendMidiCC(94, shape.delayAmount, shape.midiChannel); shape.lastSentDelay = shape.delayAmount; }
        if (shape.panValue !== shape.lastSentPan) { sendMidiCC(10, shape.panValue, shape.midiChannel); shape.lastSentPan = shape.panValue; }
        if (shape.brightnessValue !== shape.lastSentBrightness) { sendMidiCC(74, shape.brightnessValue, shape.midiChannel); shape.lastSentBrightness = shape.brightnessValue; }
        
        shape.lastNotePlayedTime = performance.now();
    }
  }
  // --- END OF MIDI NOTE GENERATION LOGIC ---

  // Continuous MIDI updates (Pitch Bend and other CCs if they change)
  if (midiEnabled && shape.sides > 0) {
    let activeNoteFound = false; // Check if any note is actually playing for this shape
    Object.values(shape.activeMidiNotes).forEach(noteInfo => {
        if (noteInfo && noteInfo.playing) {
            activeNoteFound = true;
            if (Math.abs(shape.currentPitchBend - noteInfo.lastPitchBend) > 10) { // Threshold
                sendPitchBend(shape.currentPitchBend, shape.midiChannel); // Send to the shape's channel
                // Update lastPitchBend for all active notes of this shape to keep them in sync
                Object.values(shape.activeMidiNotes).forEach(ni => { if(ni) ni.lastPitchBend = shape.currentPitchBend; });
            }
            // No need to break, as pitch bend is channel-wide.
        }
    });

    if (activeNoteFound) { // Only send CCs if a note is active and values changed
        if (shape.reverbAmount !== shape.lastSentReverb) { sendMidiCC(91, shape.reverbAmount, shape.midiChannel); shape.lastSentReverb = shape.reverbAmount; }
        if (shape.delayAmount !== shape.lastSentDelay) { sendMidiCC(94, shape.delayAmount, shape.midiChannel); shape.lastSentDelay = shape.delayAmount; }
        if (shape.panValue !== shape.lastSentPan) { sendMidiCC(10, shape.panValue, shape.midiChannel); shape.lastSentPan = shape.panValue; }
        if (shape.brightnessValue !== shape.lastSentBrightness) { sendMidiCC(74, shape.brightnessValue, shape.midiChannel); shape.lastSentBrightness = shape.brightnessValue; }
    }
  }


  // Cleanup inactive notes
  // This logic needs to be robust for chord mode where multiple notes might share a trigger (edgeIndex)
  // but have unique identifiers in activeMidiNotes (e.g., `${edgeIndexToPlay}_${i}`)
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
                // This condition might need adjustment for CHORD or RANDOM_WALK modes if edgeIdxNum isn't directly comparable to shape.sides
                if (currentNoteMode === 'SEQUENTIAL' || currentNoteMode === 'ARPEGGIO') {
                    if (edgeIdxNum >= shape.sides) {
                        sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
                        noteInfo.playing = false;
                        shouldDelete = true;
                    }
                } else if (!noteInfo.playing) { // For other modes, if it's simply not playing anymore
                     shouldDelete = true;
                }
                // If the note itself is invalid (e.g. after a scale change), it should also be turned off and deleted.
                // This is partially handled by turnOffAllActiveNotes on scale/mode change.
            } else { // MIDI disabled or sides became 0 (relevant for sequential/arpeggio)
                 sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
                 noteInfo.playing = false;
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
    if (!midiEnabled || (shape.sides <= 0 && (currentNoteMode === 'SEQUENTIAL' || currentNoteMode === 'ARPEGGIO'))) {
        Object.values(shape.activeMidiNotes).forEach(noteInfo => {
            if (noteInfo.playing) {
                sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
            }
            if (noteInfo.staccatoTimer) clearTimeout(noteInfo.staccatoTimer);
        });
        shape.activeMidiNotes = {};
    }
  }
}


function onResults(results) {
  // console.log("v25 onResults: Called with results", results); // Verification log
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
    // Reset active gesture if conditions are no longer met, or do this after processing all gestures for the frame
    // For now, let's manage it within each gesture's logic.
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
    // shape.isThumbResizingActive = false; // Reset for current shape's gesture processing - replaced by activeGesture
    let gestureProcessedThisFrame = false; // Flag to ensure only one gesture logic runs if activeGesture was null

    // Update shape position based on average of assigned wrist landmarks (if any) - SMOOTHING APPLIED
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
        let targetCenterX = canvasElement.width - (normX * canvasElement.width);
        let targetCenterY = normY * canvasElement.height;
        // Apply smoothing to position
        shape.centerX = shape.centerX * 0.85 + targetCenterX * 0.15; // Increased smoothing
        shape.centerY = shape.centerY * 0.85 + targetCenterY * 0.15; // Increased smoothing
    }

    // --- GESTURE PRIORITY & HANDLING ---
    // 1. RADIUS CONTROL (Thumbs of same user) - Highest Priority
    let isCurrentlyResizing = false;
    if (shape.leftHandLandmarks && shape.rightHandLandmarks) {
        const leftThumbTip = shape.leftHandLandmarks[4];
        const rightThumbTip = shape.rightHandLandmarks[4];
        const leftIndexCurled = shape.leftHandLandmarks[8].y > shape.leftHandLandmarks[6].y;
        const leftMiddleCurled = shape.leftHandLandmarks[12].y > shape.leftHandLandmarks[10].y;
        const rightIndexCurled = shape.rightHandLandmarks[8].y > shape.rightHandLandmarks[6].y;
        const rightMiddleCurled = shape.rightHandLandmarks[12].y > shape.rightHandLandmarks[10].y;

        if (leftIndexCurled && leftMiddleCurled && rightIndexCurled && rightMiddleCurled) {
            isCurrentlyResizing = true;
            if (shape.activeGesture === null || shape.activeGesture === 'resize') {
                if (shape.activeGesture === null) {
                    shape.activeGesture = 'resize';
                    // console.log(`Shape ${shape.id} gesture: resize START`);
                    if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'resize'));
                }
                gestureProcessedThisFrame = true;
                const leftThumbX = canvasElement.width - (leftThumbTip.x * canvasElement.width);
                const leftThumbY = leftThumbTip.y * canvasElement.height;
                const rightThumbX = canvasElement.width - (rightThumbTip.x * canvasElement.width);
                const rightThumbY = rightThumbTip.y * canvasElement.height;
                const thumbDistancePixels = distance(leftThumbX, leftThumbY, rightThumbX, rightThumbY);
                const minThumbDist = canvasElement.width * 0.03;
                const maxThumbDist = canvasElement.width * 0.35;
                const normalizedThumbDist = Math.max(0, Math.min(1, (thumbDistancePixels - minThumbDist) / (maxThumbDist - minThumbDist)));
                let targetRadius = 30 + normalizedThumbDist * 270;
                shape.radius = shape.radius * 0.8 + targetRadius * 0.2; // Smoothing
            }
        }
    }
    if (shape.activeGesture === 'resize' && !isCurrentlyResizing) {
        shape.activeGesture = null;
        // console.log(`Shape ${shape.id} gesture: resize END`);
        if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'none'));
    }


    // 2. SIDE CONTROL (Left hand pinch of user)
    let isCurrentlyChangingSides = false;
    if (shape.leftHandLandmarks && (shape.activeGesture === null || shape.activeGesture === 'sides') && !gestureProcessedThisFrame) {
        const indexTip = shape.leftHandLandmarks[8];
        const thumbTip = shape.leftHandLandmarks[4];

        const ix_canvas = canvasElement.width - (indexTip.x * canvasElement.width);
        const iy_canvas = indexTip.y * canvasElement.height;
        const tx_canvas = canvasElement.width - (thumbTip.x * canvasElement.width);
        const ty_canvas = thumbTip.y * canvasElement.height;
        shape.pinchDistance = distance(ix_canvas, iy_canvas, tx_canvas, ty_canvas);

        const pinchCenterX = (ix_canvas + tx_canvas) / 2;
        const pinchCenterY = (iy_canvas + ty_canvas) / 2;

        if (isTouchingCircle(pinchCenterX, pinchCenterY, shape.centerX, shape.centerY, shape.radius, shape.radius * 0.5)) {
            isCurrentlyChangingSides = true;
            if (shape.activeGesture === null) {
                shape.activeGesture = 'sides';
                // console.log(`Shape ${shape.id} gesture: sides START`);
                if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'sides'));
            }
            gestureProcessedThisFrame = true;
            const minPinch = 10; const maxPinchDistForSides = 150;
            const sidesRangeMin = 3; const sidesRangeMax = 20;
            let newSides;
            if (shape.pinchDistance > maxPinchDistForSides * 1.2) newSides = 100;
            else {
                const normalizedPinch = Math.max(0, Math.min(1, (shape.pinchDistance - minPinch) / (maxPinchDistForSides - minPinch)));
                newSides = Math.round(sidesRangeMin + normalizedPinch * (sidesRangeMax - sidesRangeMin));
            }
            newSides = Math.max(3, Math.min(100, newSides));
            if (newSides !== shape.sides && (performance.now() - shape.lastSideChangeTime > SIDE_CHANGE_DEBOUNCE_MS)) {
                shape.sides = newSides;
                shape.lastSideChangeTime = performance.now();
                if (shape.currentEdgeIndex >= newSides) shape.currentEdgeIndex = Math.max(0, newSides - 1);
            }
        }
    }
    if (shape.activeGesture === 'sides' && !isCurrentlyChangingSides) {
        shape.activeGesture = null;
        // console.log(`Shape ${shape.id} gesture: sides END`);
        if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'none'));
    }

    // 3. VERTEX PULLING (Right hand index finger, if global mode is active)
    let isCurrentlyPulling = false;
    if (vertexPullModeActive && shape.rightHandLandmarks && (shape.activeGesture === null || shape.activeGesture === 'pull') && !gestureProcessedThisFrame) {
        const indexFingertip = shape.rightHandLandmarks[8];
        const fingertipX_canvas = canvasElement.width - (indexFingertip.x * canvasElement.width);
        const fingertipY_canvas = indexFingertip.y * canvasElement.height;
        const pullRadiusThreshold = 30;
        const fingerId = shape.id + "_idx_pull"; // Unique ID for pulling gesture

        // Check if already pulling a vertex for this shape with this fingerId
        if (shape.beingPulledByFinger[fingerId] !== undefined) {
            isCurrentlyPulling = true; // Still pulling the same vertex
            const vertexIndex = shape.beingPulledByFinger[fingerId];
            const currentDrawingRadius = pulseModeActive ? shape.radius * (1 + 0.25 * Math.sin(pulseTime * pulseFrequency * 2 * Math.PI)) : shape.radius;
            const angle = (vertexIndex / shape.sides) * Math.PI * 2;
            const originalVertexX_view = currentDrawingRadius * Math.cos(angle);
            const originalVertexY_view = currentDrawingRadius * Math.sin(angle);
            const displacementX = fingertipX_canvas - (shape.centerX + originalVertexX_view);
            const displacementY = fingertipY_canvas - (shape.centerY + originalVertexY_view);
            shape.vertexOffsets[vertexIndex] = { x: displacementX, y: displacementY, fingerId: fingerId };
        } else { // Attempt to grab a new vertex
            for (let i = 0; i < shape.sides; i++) {
                const currentDrawingRadius = pulseModeActive ? shape.radius * (1 + 0.25 * Math.sin(pulseTime * pulseFrequency * 2 * Math.PI)) : shape.radius;
                const angle = (i / shape.sides) * Math.PI * 2;
                let vertexX_orig_view = currentDrawingRadius * Math.cos(angle);
                let vertexY_orig_view = currentDrawingRadius * Math.sin(angle);
                const currentVertexCanvasX = shape.centerX + vertexX_orig_view;
                const currentVertexCanvasY = shape.centerY + vertexY_orig_view;

                if (distance(fingertipX_canvas, fingertipY_canvas, currentVertexCanvasX, currentVertexCanvasY) < pullRadiusThreshold) {
                    // Ensure this vertex is not already pulled by another finger (for future multi-finger pull)
                    let alreadyPulledByOther = Object.values(shape.beingPulledByFinger).includes(i);
                    if (!alreadyPulledByOther) {
                        isCurrentlyPulling = true;
                        const displacementX = fingertipX_canvas - currentVertexCanvasX;
                        const displacementY = fingertipY_canvas - currentVertexCanvasY;
                        shape.vertexOffsets[i] = { x: displacementX, y: displacementY, fingerId: fingerId };
                        shape.beingPulledByFinger[fingerId] = i;
                        break;
                    }
                }
            }
        }
        
        if (isCurrentlyPulling) {
            if (shape.activeGesture === null) {
                shape.activeGesture = 'pull';
                // console.log(`Shape ${shape.id} gesture: pull START`);
                if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'pull'));
            }
            gestureProcessedThisFrame = true;
        }
    }
    if (shape.activeGesture === 'pull') {
        const fingerId = shape.id + "_idx_pull";
        if (!isCurrentlyPulling || !vertexPullModeActive) { // If no longer pulling OR global mode turned off
            if (shape.beingPulledByFinger[fingerId] !== undefined) {
                const vertexIndexReleased = shape.beingPulledByFinger[fingerId];
                if (shape.vertexOffsets[vertexIndexReleased] && shape.vertexOffsets[vertexIndexReleased].fingerId === fingerId) {
                    delete shape.vertexOffsets[vertexIndexReleased];
                }
                delete shape.beingPulledByFinger[fingerId];
            }
            shape.activeGesture = null;
            // console.log(`Shape ${shape.id} gesture: pull END`);
            if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'none'));
        }
    }


    // 4. LIQUIFY (Right hand fingertips, if no other gesture is active)
    // Note: Liquify doesn't have a strong start/end like other gestures, it's more of a continuous influence.
    // We will set activeGesture to 'liquify' if it's the only potential gesture.
    let isCurrentlyLiquifying = false;
    if (shape.rightHandLandmarks && shape.activeGesture === null && !gestureProcessedThisFrame) {
        // Check if any fingertip is close enough to potentially cause liquify
        // This is a simplified check; actual liquify happens in drawShape
        const fingertipsToUse = [4, 8, 12, 16, 20];
        const maxInfluenceDistance = 150; // From drawShape
        for (const landmarkIndex of fingertipsToUse) {
            const fingertip = shape.rightHandLandmarks[landmarkIndex];
            const fingertipX = canvasElement.width - (fingertip.x * canvasElement.width);
            const fingertipY = fingertip.y * canvasElement.height;
            // A rough check: if fingertip is within influence range of the shape's bounding box
            if (Math.abs(fingertipX - shape.centerX) < shape.radius + maxInfluenceDistance &&
                Math.abs(fingertipY - shape.centerY) < shape.radius + maxInfluenceDistance) {
                isCurrentlyLiquifying = true;
                break;
            }
        }

        if (isCurrentlyLiquifying) {
            shape.activeGesture = 'liquify'; // Tentatively set, drawShape will do the work
            // console.log(`Shape ${shape.id} gesture: liquify POTENTIAL`);
            // OSC for liquify might be better based on actual distortion, not just potential
            gestureProcessedThisFrame = true;
        }
    }
    if (shape.activeGesture === 'liquify' && !isCurrentlyLiquifying && shape.rightHandLandmarks === null) {
        // If was liquifying, but no right hand or no longer interacting
        shape.activeGesture = null;
        // console.log(`Shape ${shape.id} gesture: liquify END`);
        // No specific OSC end for liquify unless distortion goes to zero.
    }

    // If no gesture was processed and some gesture was active, reset it.
    // This handles cases where hands disappear while a gesture was active.
    if (!isCurrentlyResizing && !isCurrentlyChangingSides && !isCurrentlyPulling && !isCurrentlyLiquifying && shape.activeGesture !== null) {
        // console.log(`Shape ${shape.id} gesture: ${shape.activeGesture} END (implicit due to lack of conditions)`);
        if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'none'));
        shape.activeGesture = null;
    }

  });

  // Pulse calculation
  // ... (rest of onResults remains the same for now)
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
      // const resizingStatus = shape.isThumbResizingActive ? "Redimensionando" : "Não Redim."; // Replaced by activeGesture
      const activeGestureDisplay = shape.activeGesture || "Nenhum";
      const pitchBendDisplay = shape.currentPitchBend - 8192;

      hudText += `<b>Forma ${shape.id + 1}:</b> Raio: ${radius}, Lados: ${sides}<br>`;
      hudText += `&nbsp;&nbsp;Posição: (${posX},${posY})<br>`;
      hudText += `&nbsp;&nbsp;Mãos: ${leftHandStatus}, ${rightHandStatus}<br>`;
      hudText += `&nbsp;&nbsp;Gesto Ativo: ${activeGestureDisplay}<br>`;
      hudText += `&nbsp;&nbsp;Pitch Bend Val: ${shape.currentPitchBend} (Rel: ${pitchBendDisplay})<br>`;
      hudText += `&nbsp;&nbsp;Reverb (CC91): ${shape.reverbAmount}, Delay (CC94): ${shape.delayAmount}<br>`;
      hudText += `&nbsp;&nbsp;Pan (CC10): ${shape.panValue}, Brilho (CC74): ${shape.brightnessValue}<br>`;
      hudText += `&nbsp;&nbsp;Nota Atual Idx: ${shape.currentEdgeIndex}, Dir: ${shape.rotationDirection === 1 ? 'CW' : 'CCW'}<br><br>`;
    });

    const midiStatus = midiEnabled ? 'ON' : 'OFF';
    const pulseStatus = pulseModeActive ? 'ON' : 'OFF';
    const legatoStaccatoStatus = staccatoModeActive ? 'Staccato' : 'Legato';
    const vertexPullStatus = vertexPullModeActive ? 'ON' : 'OFF';
    const currentScaleDisplayName = SCALES[currentScaleName] ? SCALES[currentScaleName].name : 'N/A';

    hudText += `<b>Geral:</b> MIDI: ${midiStatus}, Pulso: ${pulseStatus}, Articulação: ${legatoStaccatoStatus}<br>`;
    hudText += `&nbsp;&nbsp;Puxar Vértices: ${vertexPullStatus}, Escala: ${currentScaleDisplayName} (S)<br>`;
    hudText += `&nbsp;&nbsp;Modo de Nota: ${currentNoteMode} (N)<br>`;
    hudText += `<b>OSC:</b> ${oscStatus}`;
    hudElement.innerHTML = hudText;

    // OSC Sending Logic (Throttled for continuous data)
    const now = performance.now();
    if (osc && osc.status() === OSC.STATUS.IS_OPEN && (now - lastOscSendTime > OSC_SEND_INTERVAL)) {
      lastOscSendTime = now;
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
        osc.send(new OSC.Message(`/forma/${shapeId}/cc91`, parseInt(shape.reverbAmount))); // Reverb
        osc.send(new OSC.Message(`/forma/${shapeId}/cc94`, parseInt(shape.delayAmount)));   // Delay
        osc.send(new OSC.Message(`/forma/${shapeId}/cc10`, parseInt(shape.panValue)));       // Pan
        osc.send(new OSC.Message(`/forma/${shapeId}/cc74`, parseInt(shape.brightnessValue)));// Brightness
        osc.send(new OSC.Message(`/forma/${shapeId}/direction`, parseInt(shape.rotationDirection)));
      });
       // Global parameters OSC
      osc.send(new OSC.Message(`/global/pulseActive`, pulseModeActive ? 1 : 0));
      osc.send(new OSC.Message(`/global/staccatoActive`, staccatoModeActive ? 1 : 0));
      osc.send(new OSC.Message(`/global/vertexPullActive`, vertexPullModeActive ? 1 : 0));
      osc.send(new OSC.Message(`/global/midiEnabled`, midiEnabled ? 1 : 0));
      // Note: scaleChanged and noteModeChanged are sent when they change, not continuously here.
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
console.log("main25.js loaded. Attempting to initialize camera and MediaPipe Hands.");
