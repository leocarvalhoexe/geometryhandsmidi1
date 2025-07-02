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
    this.lastResizeRadius = this.radius; // For resize chord logic
    this.lastResizeTime = 0;             // For resize chord logic
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

let operationMode = 'two_persons'; // 'one_person' or 'two_persons'
let scaleX = 1; // These seem generic, might need review later if they become shape-specific
let scaleY = 1;
const SIDE_CHANGE_DEBOUNCE_MS = 200;
let pulseModeActive = false; // Global for now, could be per-shape later
let pulseTime = 0;
let pulseFrequency = 0.5; // cycles per second
let lastPulseValue = 0;
let staccatoModeActive = false; // Default is legato
let vertexPullModeActive = false; // New mode

const maxPolyphony = 12; // New global for polyphony limit
let chordMode = "TRIAD"; // "TRIAD" or "VERTEX_ALL"

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

  osc.on('/global/setChordMode', msg => {
    const newChordMode = msg.args[0];
    if (typeof newChordMode === 'string' && (newChordMode === "TRIAD" || newChordMode === "VERTEX_ALL")) {
      chordMode = newChordMode;
      console.log(`OSC: Modo de Acorde definido para ${chordMode}`);
      updateHUD();
      // Optionally send confirmation back
      // if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
      //   osc.send(new OSC.Message('/global/chordModeChanged', chordMode));
      // }
    } else {
      console.warn(`OSC: Tentativa de definir modo de acorde para valor inválido: ${newChordMode}`);
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
const operationModeButton = document.getElementById('operationModeButton'); // New button
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

// Helper function to get note name from MIDI number
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function getNoteName(midiNote) {
  if (midiNote < 0 || midiNote > 127) return "";
  const note = NOTE_NAMES[midiNote % 12];
  const octave = Math.floor(midiNote / 12) - 1; // MIDI note 0 is C-1, 12 is C0, 24 is C1, etc. C4 is 60.
  return `${note}${octave}`;
}

let notesToVisualize = []; // Array to store { noteName, x, y, timestamp, shapeId }

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
  console.log("Attempting to initialize camera - v26");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach(track => track.stop());
    console.log("getUserMedia successful, camera permission likely granted. Proceeding with MediaPipe Camera - v26");

    const camera = new Camera(videoElement, {
      onFrame: async () => {
        if (videoElement.readyState >= 2) {
            await hands.send({ image: videoElement });
        }
      },
      width: 640,
      height: 480
    });
    await camera.start();
    console.log("camera.start() called and awaited - v26");
  } catch (error) {
    console.error("Failed to access webcam or start MediaPipe camera:", error);
    displayGlobalError("Falha ao acessar a webcam. <br>É necessário permitir o acesso à câmera para manipular a forma.<br><br>Erro: " + error.message + "<br><br>Por favor, verifique as permissões da câmera no seu navegador e tente recarregar a página.");
  }
}
initializeCamera(); // Called globally

document.addEventListener('keydown', (e) => {
  if (e.key === '+') {
    updateHUD();
  }
  if (e.key === '-') {
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
    updateHUD();
  }
  if (e.key === 's' || e.key === 'S') {
    currentScaleIndex = (currentScaleIndex + 1) % scaleKeys.length;
    currentScaleName = scaleKeys[currentScaleIndex];
    console.log("Scale changed to:", SCALES[currentScaleName].name);
    turnOffAllActiveNotes();
    updateHUD();
    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
        osc.send(new OSC.Message('/global/scaleChanged', currentScaleName, SCALES[currentScaleName].name));
    }
  }
  if (e.key === 'n' || e.key === 'N') {
    currentNoteModeIndex = (currentNoteModeIndex + 1) % NOTE_MODES.length;
    currentNoteMode = NOTE_MODES[currentNoteModeIndex];
    console.log("Note mode changed to:", currentNoteMode);
    turnOffAllActiveNotes();
    updateHUD();
    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
        osc.send(new OSC.Message('/global/noteModeChanged', currentNoteMode));
    }
  }
  if (e.key === 'v' || e.key === 'V') {
    vertexPullModeActive = !vertexPullModeActive;
    if (!vertexPullModeActive) {
      shapes.forEach(shape => {
        shape.vertexOffsets = {};
        shape.beingPulledByFinger = {};
      });
    }
    updateHUD();
  }
  if (e.key === 'c' || e.key === 'C') {
    if (chordMode === "TRIAD") {
      chordMode = "VERTEX_ALL";
    } else {
      chordMode = "TRIAD";
    }
    console.log("Chord mode changed to:", chordMode);
    updateHUD();
    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
        osc.send(new OSC.Message('/global/chordModeChanged', chordMode));
    }
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

function drawShape(shape, isPulsing, pulseValue) {
  ctx.beginPath();
  const maxInfluenceDistance = 150;
  const maxForce = 25;
  const fingertipsToUse = [4, 8, 12, 16, 20];
  const noteInterval = 200;

  const cx = shape.centerX;
  const cy = shape.centerY;
  let drawingRadius = shape.radius;

  if (isPulsing) {
    let radiusModulationFactor = 0.25 * pulseValue;
    drawingRadius = shape.radius * (1 + radiusModulationFactor);
    drawingRadius = Math.max(10, drawingRadius);
  }

  let localRightHandLandmarks = shape.rightHandLandmarks;
  if (shape.activeGesture && shape.activeGesture !== 'liquify') {
    localRightHandLandmarks = null;
  }
  if (vertexPullModeActive && shape.activeGesture === 'pull') {
      localRightHandLandmarks = null;
  }

  let totalDisplacementMagnitude = 0;
  let activeLiquifyPoints = 0;

  for (let i = 0; i < shape.sides; i++) {
    const angle = (i / shape.sides) * Math.PI * 2;
    let vertexX_orig = drawingRadius * Math.cos(angle);
    let vertexY_orig = drawingRadius * Math.sin(angle);
    let totalDisplacementX = 0;
    let totalDisplacementY = 0;

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
  }

  ctx.closePath();
  ctx.strokeStyle = shape.id === 0 ? 'cyan' : 'magenta';
  ctx.lineWidth = 4;
  ctx.stroke();

  const averageDisplacement = (shape.sides > 0 && activeLiquifyPoints > 0) ? totalDisplacementMagnitude / activeLiquifyPoints : (shape.sides > 0 && Object.keys(shape.vertexOffsets).length > 0 ? totalDisplacementMagnitude / Object.keys(shape.vertexOffsets).length : 0) ;
  const maxObservedDistortion = 50.0;
  const pitchBendSensitivity = 4096;

  let calculatedPitchBend = 8192;
  if (averageDisplacement > 0.1) {
      const bendAmount = Math.min(1.0, averageDisplacement / maxObservedDistortion) * pitchBendSensitivity;
      calculatedPitchBend = 8192 + Math.round(bendAmount);
      calculatedPitchBend = Math.max(0, Math.min(16383, calculatedPitchBend));
  }
  shape.currentPitchBend = calculatedPitchBend;

  const distortionNormalizedForCC = Math.min(1.0, averageDisplacement / maxObservedDistortion);
  shape.reverbAmount = Math.round(distortionNormalizedForCC * 127);
  shape.delayAmount = Math.round(distortionNormalizedForCC * 127);

  shape.panValue = Math.max(0, Math.min(127, Math.round((shape.centerX / canvasElement.width) * 127)));
  const minSidesForBrightness = 3;
  const maxSidesForBrightness = 20;
  let normalizedSides = (shape.sides - minSidesForBrightness) / (maxSidesForBrightness - minSidesForBrightness);
  normalizedSides = Math.max(0, Math.min(1, normalizedSides));
  if (shape.sides === 100) normalizedSides = 0.5;
  shape.brightnessValue = Math.round(normalizedSides * 127);

  if (midiEnabled && shape.sides > 0 && performance.now() - shape.lastNotePlayedTime > noteInterval) {
    const oldEdgeIndex = shape.currentEdgeIndex;
    if (shape.activeMidiNotes[oldEdgeIndex] && shape.activeMidiNotes[oldEdgeIndex].playing && !staccatoModeActive && currentNoteMode !== 'CHORD') {
        sendMidiNoteOff(shape.activeMidiNotes[oldEdgeIndex].note, shape.midiChannel, shape.id + 1);
        shape.activeMidiNotes[oldEdgeIndex].playing = false;
    }

    let edgeIndexToPlay = shape.currentEdgeIndex;
    let notesToPlay = [];

    switch (currentNoteMode) {
        case 'SEQUENTIAL':
        case 'ARPEGGIO':
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
                const scale = SCALES[currentScaleName];
                const rootNoteInScaleIndex = edgeIndexToPlay % scale.notes.length;

                notesToPlay.push(getNoteInScale(edgeIndexToPlay));
                notesToPlay.push(getNoteInScale(edgeIndexToPlay + 2));
                notesToPlay.push(getNoteInScale(edgeIndexToPlay + 4));

                Object.keys(shape.activeMidiNotes).forEach(idx => {
                    if (shape.activeMidiNotes[idx] && shape.activeMidiNotes[idx].playing) {
                        sendMidiNoteOff(shape.activeMidiNotes[idx].note, shape.midiChannel, shape.id + 1);
                        if(shape.activeMidiNotes[idx].staccatoTimer) clearTimeout(shape.activeMidiNotes[idx].staccatoTimer);
                    }
                });
                shape.activeMidiNotes = {};
            }
            break;
        case 'RANDOM_WALK':
            let step = Math.floor(Math.random() * 3) - 1;
            shape.currentEdgeIndex += step;
            const numNotesInCurrentScaleContext = SCALES[currentScaleName].notes.length * 2;
            shape.currentEdgeIndex = (shape.currentEdgeIndex + numNotesInCurrentScaleContext) % numNotesInCurrentScaleContext;

            edgeIndexToPlay = shape.currentEdgeIndex;
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
            const noteKeyForActive = `${edgeIndexToPlay}_${i}`;

            sendMidiNoteOn(note, velocity, shape.midiChannel, shape.id + 1);

            if(shape.activeMidiNotes[noteKeyForActive] && shape.activeMidiNotes[noteKeyForActive].staccatoTimer){
                clearTimeout(shape.activeMidiNotes[noteKeyForActive].staccatoTimer);
            }

            shape.activeMidiNotes[noteKeyForActive] = {
                note: note,
                channel: shape.midiChannel,
                lastVelocity: velocity,
                lastPitchBend: shape.currentPitchBend,
                playing: true,
                staccatoTimer: null
            };

            if (staccatoModeActive) {
                shape.activeMidiNotes[noteKeyForActive].staccatoTimer = setTimeout(() => {
                    if (shape.activeMidiNotes[noteKeyForActive] && shape.activeMidiNotes[noteKeyForActive].playing) {
                    sendMidiNoteOff(note, shape.midiChannel, shape.id + 1);
                        shape.activeMidiNotes[noteKeyForActive].playing = false;
                    }
                }, 150);
            }
        });

        if (shape.currentPitchBend !== 8192) { sendPitchBend(shape.currentPitchBend, shape.midiChannel); }
        if (shape.reverbAmount !== shape.lastSentReverb) { sendMidiCC(91, shape.reverbAmount, shape.midiChannel); shape.lastSentReverb = shape.reverbAmount; }
        if (shape.delayAmount !== shape.lastSentDelay) { sendMidiCC(94, shape.delayAmount, shape.midiChannel); shape.lastSentDelay = shape.delayAmount; }
        if (shape.panValue !== shape.lastSentPan) { sendMidiCC(10, shape.panValue, shape.midiChannel); shape.lastSentPan = shape.panValue; }
        if (shape.brightnessValue !== shape.lastSentBrightness) { sendMidiCC(74, shape.brightnessValue, shape.midiChannel); shape.lastSentBrightness = shape.brightnessValue; }

        shape.lastNotePlayedTime = performance.now();
    }
  }

  if (midiEnabled && shape.sides > 0) {
    let activeNoteFound = false;
    Object.values(shape.activeMidiNotes).forEach(noteInfo => {
        if (noteInfo && noteInfo.playing) {
            activeNoteFound = true;
            if (Math.abs(shape.currentPitchBend - noteInfo.lastPitchBend) > 10) {
                sendPitchBend(shape.currentPitchBend, shape.midiChannel);
                Object.values(shape.activeMidiNotes).forEach(ni => { if(ni) ni.lastPitchBend = shape.currentPitchBend; });
            }
        }
    });

    if (activeNoteFound) {
        if (shape.reverbAmount !== shape.lastSentReverb) { sendMidiCC(91, shape.reverbAmount, shape.midiChannel); shape.lastSentReverb = shape.reverbAmount; }
        if (shape.delayAmount !== shape.lastSentDelay) { sendMidiCC(94, shape.delayAmount, shape.midiChannel); shape.lastSentDelay = shape.delayAmount; }
        if (shape.panValue !== shape.lastSentPan) { sendMidiCC(10, shape.panValue, shape.midiChannel); shape.lastSentPan = shape.panValue; }
        if (shape.brightnessValue !== shape.lastSentBrightness) { sendMidiCC(74, shape.brightnessValue, shape.midiChannel); shape.lastSentBrightness = shape.brightnessValue; }
    }
  }

  if (Object.keys(shape.activeMidiNotes).length > 0) {
    Object.keys(shape.activeMidiNotes).forEach(edgeIdxStr => {
        const edgeIdxNum = Number(edgeIdxStr);
        const noteInfo = shape.activeMidiNotes[edgeIdxNum];
        let shouldDelete = false;

        if (noteInfo) {
            if (!noteInfo.playing) {
                shouldDelete = true;
            } else if (midiEnabled && shape.sides > 0) {
                if (currentNoteMode === 'SEQUENTIAL' || currentNoteMode === 'ARPEGGIO') {
                    if (edgeIdxNum >= shape.sides) {
                        sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
                        noteInfo.playing = false;
                        shouldDelete = true;
                    }
                } else if (!noteInfo.playing) {
                     shouldDelete = true;
                }
            } else {
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
  if (!midiEnabled) {
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

  shapes.forEach(shape => {
    shape.leftHandLandmarks = null;
    shape.rightHandLandmarks = null;
  });

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    if (operationMode === 'one_person') {
        let firstLeftHand = null;
        let firstRightHand = null;

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i] ? results.multiHandedness[i].label : null;
            drawLandmarks(landmarks);

            if (handedness === "Left" && !firstLeftHand) {
                firstLeftHand = landmarks;
            } else if (handedness === "Right" && !firstRightHand) {
                firstRightHand = landmarks;
            }
            if (firstLeftHand && firstRightHand) break;
        }

        shapes[0].leftHandLandmarks = firstLeftHand;
        shapes[0].rightHandLandmarks = firstRightHand;

        // Ensure Shape 2 is inactive in 1-person mode
        shapes[1].leftHandLandmarks = null;
        shapes[1].rightHandLandmarks = null;
        // Optionally, reset other interactive properties of shape[1] if needed,
        // e.g., shape[1].activeGesture = null;
        // For now, just detaching hands should be sufficient as gesture processing relies on landmarks.

    } else { // two_persons mode
        let assignedToShape0L = false;
        let assignedToShape0R = false;
        let assignedToShape1L = false;
        let assignedToShape1R = false;

        results.multiHandLandmarks.forEach((landmarks, i) => {
            const handedness = results.multiHandedness[i] ? results.multiHandedness[i].label : null;
            drawLandmarks(landmarks);

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
  }

  shapes.forEach(shape => {
    let gestureProcessedThisFrame = false;

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
        let targetCenterX = canvasElement.width - (normX * canvasElement.width);
        let targetCenterY = normY * canvasElement.height;
        shape.centerX = shape.centerX * 0.85 + targetCenterX * 0.15;
        shape.centerY = shape.centerY * 0.85 + targetCenterY * 0.15;
    }

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
                const previousRadiusForChord = shape.radius;
                shape.radius = shape.radius * 0.8 + targetRadius * 0.2;

                const currentTime = performance.now();
                const radiusDifference = Math.abs(shape.radius - shape.lastResizeRadius);
                const timeDifference = currentTime - shape.lastResizeTime;
                const MIN_RADIUS_CHANGE_FOR_CHORD = 10;
                const MIN_TIME_BETWEEN_CHORDS_MS = 500;

                if (radiusDifference > MIN_RADIUS_CHANGE_FOR_CHORD && timeDifference > MIN_TIME_BETWEEN_CHORDS_MS) {
                  if (midiEnabled && midiOutput && shape.sides > 0) { // Ensure shape.sides is valid
                    const velocity = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * ((127-30) / (300-30)))));
                    let notesToPlay = [];
                    const CHORD_NOTE_DURATION_MS = 250;

                    if (chordMode === "TRIAD") {
                      const fundamentalNoteIndex = 0; // Or derive from shape.currentEdgeIndex or a fixed root
                      notesToPlay.push(getNoteInScale(fundamentalNoteIndex, 1));
                      notesToPlay.push(getNoteInScale(fundamentalNoteIndex + 2, 1));
                      notesToPlay.push(getNoteInScale(fundamentalNoteIndex + 4, 1));
                    } else if (chordMode === "VERTEX_ALL") {
                      const numNotes = Math.min(shape.sides, maxPolyphony);
                      for (let i = 0; i < numNotes; i++) {
                        // Ensure getNoteInScale can handle cases where i might be large if shape.sides is large
                        // The current getNoteInScale handles this with modulo, so it's okay.
                        notesToPlay.push(getNoteInScale(i));
                      }
                    }

                    if (notesToPlay.length > 0) {
                      const currentTimeForVis = performance.now();
                      notesToPlay.forEach((note, index) => {
                        sendMidiNoteOn(note, velocity, shape.midiChannel, shape.id + 1);
                        setTimeout(() => {
                          sendMidiNoteOff(note, shape.midiChannel, shape.id + 1);
                        }, CHORD_NOTE_DURATION_MS);

                        // Add to visualization
                        if (shape.sides > 0 && chordMode === "VERTEX_ALL") { // Only for VERTEX_ALL for now, or could be adapted for TRIAD
                            const angle = (index / Math.min(shape.sides, maxPolyphony)) * Math.PI * 2; // Use index from notesToPlay
                            const visRadius = shape.radius + 20; // Display slightly outside the shape
                            const x = shape.centerX + visRadius * Math.cos(angle);
                            const y = shape.centerY + visRadius * Math.sin(angle);
                            notesToVisualize.push({
                                noteName: getNoteName(note),
                                x: x,
                                y: y,
                                timestamp: currentTimeForVis,
                                shapeId: shape.id
                            });
                        } else if (chordMode === "TRIAD") { // Simple visualization for TRIAD near center
                            const visRadius = shape.radius * 0.5;
                             const angle = (index / notesToPlay.length) * Math.PI * 2 - Math.PI / 2; // Spread them out
                            const x = shape.centerX + visRadius * Math.cos(angle);
                            const y = shape.centerY + visRadius * Math.sin(angle);
                             notesToVisualize.push({
                                noteName: getNoteName(note),
                                x: x,
                                y: y,
                                timestamp: currentTimeForVis,
                                shapeId: shape.id
                            });
                        }
                      });

                      if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
                        // OSC message: /forma/X/chord note1 note2 ...
                        // Ensure notes are sent as separate arguments, not an array
                        osc.send(new OSC.Message(`/forma/${shape.id + 1}/chord`, ...notesToPlay.map(n => parseInt(n))));
                      }
                    }

                    shape.lastResizeRadius = shape.radius;
                    shape.lastResizeTime = currentTime;
                  }
                }
            }
        }
    }
    if (shape.activeGesture === 'resize' && !isCurrentlyResizing) {
        shape.activeGesture = null;
        if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'none'));
    }

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
        if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'none'));
    }

    let isCurrentlyPulling = false;
    if (vertexPullModeActive && shape.rightHandLandmarks && (shape.activeGesture === null || shape.activeGesture === 'pull') && !gestureProcessedThisFrame) {
        const indexFingertip = shape.rightHandLandmarks[8];
        const fingertipX_canvas = canvasElement.width - (indexFingertip.x * canvasElement.width);
        const fingertipY_canvas = indexFingertip.y * canvasElement.height;
        const pullRadiusThreshold = 30;
        const fingerId = shape.id + "_idx_pull";

        if (shape.beingPulledByFinger[fingerId] !== undefined) {
            isCurrentlyPulling = true;
            const vertexIndex = shape.beingPulledByFinger[fingerId];
            const currentDrawingRadius = pulseModeActive ? shape.radius * (1 + 0.25 * Math.sin(pulseTime * pulseFrequency * 2 * Math.PI)) : shape.radius;
            const angle = (vertexIndex / shape.sides) * Math.PI * 2;
            const originalVertexX_view = currentDrawingRadius * Math.cos(angle);
            const originalVertexY_view = currentDrawingRadius * Math.sin(angle);
            const displacementX = fingertipX_canvas - (shape.centerX + originalVertexX_view);
            const displacementY = fingertipY_canvas - (shape.centerY + originalVertexY_view);
            shape.vertexOffsets[vertexIndex] = { x: displacementX, y: displacementY, fingerId: fingerId };
        } else {
            for (let i = 0; i < shape.sides; i++) {
                const currentDrawingRadius = pulseModeActive ? shape.radius * (1 + 0.25 * Math.sin(pulseTime * pulseFrequency * 2 * Math.PI)) : shape.radius;
                const angle = (i / shape.sides) * Math.PI * 2;
                let vertexX_orig_view = currentDrawingRadius * Math.cos(angle);
                let vertexY_orig_view = currentDrawingRadius * Math.sin(angle);
                const currentVertexCanvasX = shape.centerX + vertexX_orig_view;
                const currentVertexCanvasY = shape.centerY + vertexY_orig_view;

                if (distance(fingertipX_canvas, fingertipY_canvas, currentVertexCanvasX, currentVertexCanvasY) < pullRadiusThreshold) {
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
                if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'pull'));
            }
            gestureProcessedThisFrame = true;
        }
    }
    if (shape.activeGesture === 'pull') {
        const fingerId = shape.id + "_idx_pull";
        if (!isCurrentlyPulling || !vertexPullModeActive) {
            if (shape.beingPulledByFinger[fingerId] !== undefined) {
                const vertexIndexReleased = shape.beingPulledByFinger[fingerId];
                if (shape.vertexOffsets[vertexIndexReleased] && shape.vertexOffsets[vertexIndexReleased].fingerId === fingerId) {
                    delete shape.vertexOffsets[vertexIndexReleased];
                }
                delete shape.beingPulledByFinger[fingerId];
            }
            shape.activeGesture = null;
            if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'none'));
        }
    }

    let isCurrentlyLiquifying = false;
    if (shape.rightHandLandmarks && shape.activeGesture === null && !gestureProcessedThisFrame) {
        const fingertipsToUse = [4, 8, 12, 16, 20];
        const maxInfluenceDistance = 150;
        for (const landmarkIndex of fingertipsToUse) {
            const fingertip = shape.rightHandLandmarks[landmarkIndex];
            const fingertipX = canvasElement.width - (fingertip.x * canvasElement.width);
            const fingertipY = fingertip.y * canvasElement.height;
            if (Math.abs(fingertipX - shape.centerX) < shape.radius + maxInfluenceDistance &&
                Math.abs(fingertipY - shape.centerY) < shape.radius + maxInfluenceDistance) {
                isCurrentlyLiquifying = true;
                break;
            }
        }

        if (isCurrentlyLiquifying) {
            shape.activeGesture = 'liquify';
            gestureProcessedThisFrame = true;
        }
    }
    if (shape.activeGesture === 'liquify' && !isCurrentlyLiquifying && shape.rightHandLandmarks === null) {
        shape.activeGesture = null;
    }

    if (!isCurrentlyResizing && !isCurrentlyChangingSides && !isCurrentlyPulling && !isCurrentlyLiquifying && shape.activeGesture !== null) {
        if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(`/forma/${shape.id + 1}/gestureActivated`, 'none'));
        shape.activeGesture = null;
    }

  });

  let currentPulseValue = 0;
  if (pulseModeActive) {
      pulseTime = performance.now() * 0.001;
      currentPulseValue = Math.sin(pulseTime * pulseFrequency * 2 * Math.PI);
      lastPulseValue = currentPulseValue;
  }

  shapes.forEach(shape => {
    drawShape(shape, pulseModeActive, currentPulseValue);
  });

  // Draw visualized notes
  const now = performance.now();
  const VISUALIZATION_DURATION_MS = 750; // How long to show the note names
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  notesToVisualize = notesToVisualize.filter(visNote => {
    const age = now - visNote.timestamp;
    if (age < VISUALIZATION_DURATION_MS) {
      const alpha = 1.0 - (age / VISUALIZATION_DURATION_MS);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
      // Adjust text position slightly if it's for shape 0 or 1 to avoid overlap if they are close
      let textY = visNote.y;
      // if (visNote.shapeId === 0) textY -= 5; else textY += 5;
      ctx.fillText(visNote.noteName, visNote.x, textY);
      return true;
    }
    return false;
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
    } catch (e) {
      if (e.name === "InvalidStateError" || (outputPopupWindow && outputPopupWindow.closed)) {
        popupCanvasCtx = null;
        outputPopupWindow = null;
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
        outputPopupWindow.document.close();

        outputPopupWindow.onload = () => {
            const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
            if (popupCanvas) {
              popupCanvasCtx = popupCanvas.getContext('2d');
              try {
                popupCanvas.width = outputPopupWindow.innerWidth;
                popupCanvas.height = outputPopupWindow.innerHeight;
              } catch (e) { console.warn("Error setting initial popup canvas size:", e); }
            } else {
              alert("Erro ao configurar o canvas na janela de saída.");
              outputPopupWindow.close(); outputPopupWindow = null; popupCanvasCtx = null;
            }
        };

        outputPopupWindow.addEventListener('beforeunload', () => {
          popupCanvasCtx = null; outputPopupWindow = null;
        });
      }
    }
  });
} else {
  console.error("openOutputPopupButton not found.");
}

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
    const operationModeDisplay = operationMode === 'one_person' ? '1 Pessoa' : '2 Pessoas';
    const chordModeDisplay = chordMode; // Directly use the value "TRIAD" or "VERTEX_ALL"

    hudText += `<b>Geral:</b> MIDI: ${midiStatus}, Pulso: ${pulseStatus}, Articulação: ${legatoStaccatoStatus}<br>`;
    hudText += `&nbsp;&nbsp;Puxar Vértices: ${vertexPullStatus}, Escala: ${currentScaleDisplayName} (S)<br>`;
    hudText += `&nbsp;&nbsp;Modo de Nota: ${currentNoteMode} (N), Modo Acorde: ${chordModeDisplay} (C)<br>`;
    hudText += `&nbsp;&nbsp;Modo Oper.: ${operationModeDisplay}<br>`;
    hudText += `<b>OSC:</b> ${oscStatus}`;
    hudElement.innerHTML = hudText;

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
        osc.send(new OSC.Message(`/forma/${shapeId}/cc91`, parseInt(shape.reverbAmount)));
        osc.send(new OSC.Message(`/forma/${shapeId}/cc94`, parseInt(shape.delayAmount)));
        osc.send(new OSC.Message(`/forma/${shapeId}/cc10`, parseInt(shape.panValue)));
        osc.send(new OSC.Message(`/forma/${shapeId}/cc74`, parseInt(shape.brightnessValue)));
        osc.send(new OSC.Message(`/forma/${shapeId}/direction`, parseInt(shape.rotationDirection)));
      });
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
        turnOffAllActiveNotes();
    }
    updateHUD();
  });
}

if (operationModeButton) {
    operationModeButton.addEventListener('click', () => {
        if (operationMode === 'one_person') {
            operationMode = 'two_persons';
            operationModeButton.textContent = '👤 Modo: 2 Pessoas';
        } else {
            operationMode = 'one_person';
            operationModeButton.textContent = '👤 Modo: 1 Pessoa';
        }
        shapes.forEach(shape => {
            shape.leftHandLandmarks = null;
            shape.rightHandLandmarks = null;
            shape.activeGesture = null;
        });
        console.log("Operation mode changed to:", operationMode);
        turnOffAllActiveNotes();
        updateHUD();
    });
}

updateHUD();
console.log("main26.js loaded. Attempting to initialize camera and MediaPipe Hands.");
