const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const ctx = canvasElement.getContext('2d');

function resizeCanvas() {
  canvasElement.width = window.innerWidth;
  canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Shape {
  constructor(id, midiChannel) {
    this.id = id;
    this.centerX = canvasElement.width / (this.id === 0 ? 4 : 1.333);
    this.centerY = canvasElement.height / 2;
    this.radius = 100;
    this.sides = 100; // 100 = círculo
    this.distortionFactor = 0;
    this.activeMidiNotes = {};
    this.midiChannel = midiChannel;
    this.leftHandLandmarks = null;
    this.rightHandLandmarks = null;
    this.pinchDistance = 0;
    this.lastSideChangeTime = 0;
    this.activeGesture = null; // null, 'resize', 'sides', 'liquify', 'pull'
    this.currentPitchBend = 8192;
    this.reverbAmount = 0; // CC91
    this.delayAmount = 0;  // CC94
    this.panValue = 64;    // CC10 (Pan)
    this.brightnessValue = 64; // CC74 (Brightness)
    this.lastSentReverb = -1;
    this.lastSentDelay = -1;
    this.lastSentPan = -1;
    this.lastSentBrightness = -1;
    this.vertexOffsets = {};
    this.beingPulledByFinger = {};
    this.rotationDirection = 1;
    this.currentEdgeIndex = 0;
    this.lastNotePlayedTime = 0;
    this.lastResizeRadius = this.radius;
    this.lastResizeTime = 0;
    this.lastSentActiveGesture = null; // Para enviar OSC de gesto apenas na mudança
  }
}

const shapes = [new Shape(0, 0), new Shape(1, 1)];

let operationMode = 'two_persons';
let scaleX = 1;
let scaleY = 1;
const SIDE_CHANGE_DEBOUNCE_MS = 200;
let pulseModeActive = false;
let pulseTime = 0;
let pulseFrequency = 0.5;
let lastPulseValue = 0;
let staccatoModeActive = false;
let vertexPullModeActive = false;

const maxPolyphony = 12;
let chordMode = "TRIAD"; // "TRIAD" or "VERTEX_ALL"

// OSC Setup
let osc;
let oscStatus = "OSC Desconectado";
const OSC_HOST = 'localhost';
const OSC_PORT = 8080;
let lastOscSendTime = 0;
const OSC_SEND_INTERVAL = 100; // ms, for 10Hz.
let oscHeartbeatIntervalId = null; // Para o heartbeat
const OSC_RECONNECT_TIMEOUT = 3000; // ms

function sendOSCMessage(address, ...args) {
    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
        // console.log("Sending OSC:", address, args);
        osc.send(new OSC.Message(address, ...args));
    }
}

function sendOSCHeartbeat() {
  sendOSCMessage('/ping', Date.now());
}

function setupOSC() {
  if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
    osc.close(); // Fecha conexão anterior se existir
  }
  if (oscHeartbeatIntervalId) {
    clearInterval(oscHeartbeatIntervalId);
    oscHeartbeatIntervalId = null;
  }

  osc = new OSC({
    plugin: new OSC.WebsocketClientPlugin({
      host: OSC_HOST,
      port: OSC_PORT,
      secure: false
    })
  });

  osc.on('open', () => {
    oscStatus = `OSC Conectado a ws://${OSC_HOST}:${OSC_PORT}`;
    console.log(oscStatus);
    if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId);
    oscHeartbeatIntervalId = setInterval(sendOSCHeartbeat, 5000);
    sendOSCHeartbeat(); // Envia um ping imediato
    // Envia estados globais iniciais ao conectar
    sendAllGlobalStatesOSC();
    updateHUD();
  });

  osc.on('close', () => {
    oscStatus = "OSC Desconectado";
    console.log(oscStatus);
    if (oscHeartbeatIntervalId) {
      clearInterval(oscHeartbeatIntervalId);
      oscHeartbeatIntervalId = null;
    }
    updateHUD();
    setTimeout(setupOSC, OSC_RECONNECT_TIMEOUT); // Tenta reconectar
  });

  osc.on('error', (err) => {
    oscStatus = "OSC Erro";
    console.error("OSC Error:", err);
    if (oscHeartbeatIntervalId) {
      clearInterval(oscHeartbeatIntervalId);
      oscHeartbeatIntervalId = null;
    }
    updateHUD();
    // Considerar reconexão em certos tipos de erro também
    // setTimeout(setupOSC, OSC_RECONNECT_TIMEOUT);
  });

  osc.on('message', (msg) => {
    // Verifica se é uma mensagem de confirmação do osc_relay28.py
    // Ou uma mensagem encaminhada do UDP
    try {
        const messageData = JSON.parse(msg.args[0]); // Assumindo que a mensagem é uma string JSON no primeiro argumento
                                                     // Se o osc_relay28.py enviar JSON diretamente como corpo da mensagem,
                                                     // então msg já seria o objeto.
                                                     // O osc.js pode encapsular a mensagem de maneiras diferentes.
                                                     // Se o osc_relay envia uma string JSON:
                                                     // msg = { address: '/reply', args: [{type: 's', value: '{"type": "confirmation", ...}'}]}
                                                     // Se o osc_relay envia um objeto OSC.js:
                                                     // msg = { address: '/web/confirmation', args: [{type:'s', value:'received_address'}, {type:'s', value:'arg1'} ...]}

        // Ajuste baseado em como o osc_relay28.py envia a confirmação/mensagem UDP
        // O osc_relay28.py atual envia JSON.dumps(confirmation_payload) como uma string.
        // OSC.js pode passar isso como um único argumento string.
        let parsedMsg;
        if (typeof msg === 'string') { // Se o websocket passou uma string direto (improvável com osc-js)
             parsedMsg = JSON.parse(msg);
        } else if (msg.args && msg.args.length > 0 && typeof msg.args[0] === 'string') { // Mais provável
             parsedMsg = JSON.parse(msg.args[0]);
        } else if (msg.address) { // Se for uma mensagem OSC padrão vinda do relay (ex: de UDP)
            parsedMsg = msg; // já é um objeto OSC
        }


        if (parsedMsg && parsedMsg.type === "confirmation") {
            console.log(`OSC Relay Confirmação: Addr: ${parsedMsg.received_address}, Args: ${JSON.stringify(parsedMsg.received_args)}, Status: ${parsedMsg.status}`);
        } else if (parsedMsg && parsedMsg.address) { // Mensagem encaminhada do UDP
            console.log(`OSC via UDP Recebido: Addr: ${parsedMsg.address}, Args: ${JSON.stringify(parsedMsg.args)}`);
            // Aqui você pode adicionar lógica para manipular comandos recebidos via UDP
            // Ex: if (parsedMsg.address === '/external/controlX') { ... }
            handleIncomingExternalOSC(parsedMsg);
        } else {
            // console.log("OSC Mensagem Recebida (não-confirmação/não-JSON string):", msg);
        }
    } catch (e) {
        // console.log("OSC Mensagem Recebida (não JSON ou formato inesperado):", msg, "Erro:", e);
    }
  });


  try {
    osc.open();
  } catch (error) {
    console.error("Falha ao iniciar OSC:", error);
    oscStatus = "OSC Falha ao iniciar";
    updateHUD();
    setTimeout(setupOSC, OSC_RECONNECT_TIMEOUT); // Tenta reconectar
  }

  // Listeners para comandos OSC específicos (vindos do relay ou UDP)
  // (Mantém os listeners existentes e adiciona novos se necessário para UDP)
  osc.on('/forma/+/setRadius', msg => {
    const shapeIndex = parseInt(msg.address.split('/')[2]) - 1;
    if (shapes[shapeIndex] && typeof msg.args[0] === 'number') {
      shapes[shapeIndex].radius = Math.max(10, Math.min(300, msg.args[0]));
      console.log(`OSC: Forma ${shapeIndex + 1} raio definido para ${shapes[shapeIndex].radius}`);
      updateHUD();
    }
  });

  osc.on('/forma/+/setSides', msg => {
    const shapeIndex = parseInt(msg.address.split('/')[2]) - 1;
    if (shapes[shapeIndex] && typeof msg.args[0] === 'number') {
      shapes[shapeIndex].sides = Math.max(3, Math.min(100, Math.round(msg.args[0])));
      console.log(`OSC: Forma ${shapeIndex + 1} lados definidos para ${shapes[shapeIndex].sides}`);
      if (shapes[shapeIndex].currentEdgeIndex >= shapes[shapeIndex].sides) {
        shapes[shapeIndex].currentEdgeIndex = Math.max(0, shapes[shapeIndex].sides - 1);
      }
      turnOffAllActiveNotes();
      updateHUD();
    }
  });

  osc.on('/global/setPulseActive', msg => {
    const value = msg.args[0];
    if (typeof value === 'number' || typeof value === 'boolean') {
        const newState = !!value;
        if (pulseModeActive !== newState) {
            pulseModeActive = newState;
            if (pulseModeActive) pulseTime = 0;
            console.log(`OSC: Modo Pulso definido para ${pulseModeActive}`);
            sendOSCMessage('/global/state/pulseMode', pulseModeActive ? 1 : 0);
            updateHUD();
        }
    }
  });

  osc.on('/global/setStaccatoActive', msg => {
    const value = msg.args[0];
    if (typeof value === 'number' || typeof value === 'boolean') {
        const newState = !!value;
        if (staccatoModeActive !== newState) {
            staccatoModeActive = newState;
            console.log(`OSC: Modo Staccato definido para ${staccatoModeActive}`);
            sendOSCMessage('/global/state/staccatoMode', staccatoModeActive ? 1 : 0);
            updateHUD();
        }
    }
  });

   osc.on('/global/setVertexPullActive', msg => {
    const value = msg.args[0];
    if (typeof value === 'number' || typeof value === 'boolean') {
        const newState = !!value;
        if (vertexPullModeActive !== newState) {
            vertexPullModeActive = newState;
            console.log(`OSC: Modo Puxar Vértices definido para ${vertexPullModeActive}`);
            if (!vertexPullModeActive) {
              shapes.forEach(shape => {
                shape.vertexOffsets = {};
                shape.beingPulledByFinger = {};
              });
            }
            sendOSCMessage('/global/state/vertexPullMode', vertexPullModeActive ? 1 : 0);
            updateHUD();
        }
    }
  });

  osc.on('/global/setMidiEnabled', msg => {
    const value = msg.args[0];
    if (typeof value === 'number' || typeof value === 'boolean') {
        const newState = !!value;
        if (midiEnabled !== newState) {
            midiEnabled = newState;
            updateMidiButtonText();
            if (!midiEnabled) turnOffAllActiveNotes();
            console.log(`OSC: MIDI definido para ${midiEnabled}`);
            sendOSCMessage('/global/state/midiEnabled', midiEnabled ? 1 : 0);
            updateHUD();
        }
    }
  });

  osc.on('/global/setScale', msg => {
    const newScaleName = msg.args[0];
    if (typeof newScaleName === 'string' && SCALES[newScaleName]) {
      if (currentScaleName !== newScaleName) {
        currentScaleName = newScaleName;
        currentScaleIndex = scaleKeys.indexOf(newScaleName);
        console.log(`OSC: Escala definida para ${SCALES[currentScaleName].name}`);
        turnOffAllActiveNotes();
        sendOSCMessage('/global/state/scale', currentScaleName);
        updateHUD();
      }
    } else {
      console.warn(`OSC: Tentativa de definir escala para valor inválido/desconhecido: ${newScaleName}`);
    }
  });

  osc.on('/global/setNoteMode', msg => {
    const newNoteMode = msg.args[0];
    if (typeof newNoteMode === 'string' && NOTE_MODES.includes(newNoteMode)) {
      if (currentNoteMode !== newNoteMode) {
        currentNoteMode = newNoteMode;
        currentNoteModeIndex = NOTE_MODES.indexOf(newNoteMode);
        console.log(`OSC: Modo de nota definido para ${currentNoteMode}`);
        turnOffAllActiveNotes();
        // Não há um /global/state/noteMode, mas poderia ser adicionado se necessário
        updateHUD();
      }
    } else {
      console.warn(`OSC: Tentativa de definir modo de nota para valor inválido/desconhecido: ${newNoteMode}`);
    }
  });

  osc.on('/global/setChordMode', msg => {
    const newChordMode = msg.args[0];
    if (typeof newChordMode === 'string' && (newChordMode === "TRIAD" || newChordMode === "VERTEX_ALL")) {
      if (chordMode !== newChordMode) {
        chordMode = newChordMode;
        console.log(`OSC: Modo de Acorde definido para ${chordMode}`);
        sendOSCMessage('/global/state/chordMode', chordMode);
        updateHUD();
      }
    } else {
      console.warn(`OSC: Tentativa de definir modo de acorde para valor inválido: ${newChordMode}`);
    }
  });
}

function handleIncomingExternalOSC(oscMessage) {
    // Este é um placeholder. Implemente a lógica baseada nos endereços OSC
    // que você espera receber de fontes externas via UDP.
    // Por exemplo:
    // if (oscMessage.address === '/external/control/shape/1/radius') {
    //     const newRadius = oscMessage.args[0]?.value; // Supondo que o valor é o primeiro argumento
    //     if (typeof newRadius === 'number' && shapes[0]) {
    //         shapes[0].radius = Math.max(10, Math.min(300, newRadius));
    //         updateHUD(); // Para refletir a mudança visualmente e enviar OSC de estado se necessário
    //     }
    // }
    // Adicione mais handlers conforme necessário.
}


setupOSC();

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 4,
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
    errorDiv.style.position = 'fixed'; errorDiv.style.top = '50%'; errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translate(-50%, -50%)'; errorDiv.style.backgroundColor = 'red';
    errorDiv.style.color = 'white'; errorDiv.style.padding = '20px'; errorDiv.style.borderRadius = '10px';
    errorDiv.style.zIndex = '2000'; errorDiv.style.textAlign = 'center';
    document.body.appendChild(errorDiv);
  }
  errorDiv.innerHTML = message;
}

let midiAccess = null;
let midiOutput = null;
let availableMidiOutputs = new Map();
let midiEnabled = true;

const midiToggleButton = document.getElementById('midiToggleButton');
const settingsButton = document.getElementById('settingsButton');
const hudElement = document.getElementById('hud');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalButton = document.getElementById('closeSettingsModal');
const midiOutputSelect = document.getElementById('midiOutputSelect');
const openOutputPopupButton = document.getElementById('openOutputPopupButton');
const operationModeButton = document.getElementById('operationModeButton');
let outputPopupWindow = null;
let popupCanvasCtx = null;

function updateMidiOutputList() {
  availableMidiOutputs.clear();
  if (midiAccess) {
    midiAccess.outputs.forEach(output => availableMidiOutputs.set(output.id, output));
  }
  populateMidiOutputSelect();
}

function populateMidiOutputSelect() {
  const previouslySelectedId = midiOutput ? midiOutput.id : null;
  midiOutputSelect.innerHTML = '';
  if (availableMidiOutputs.size === 0) {
    const option = document.createElement('option');
    option.textContent = 'Nenhuma porta MIDI encontrada'; option.disabled = true;
    midiOutputSelect.appendChild(option); midiOutput = null; return;
  }
  availableMidiOutputs.forEach(output => {
    const option = document.createElement('option');
    option.value = output.id; option.textContent = output.name;
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
    turnOffAllActiveNotes();
  } else {
    console.warn("Selected MIDI output ID not found in available list:", selectedId);
    midiOutput = null;
  }
});

function sendMidiNoteOn(note, velocity, channel, shapeId = -1) {
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validNote = Math.max(0, Math.min(127, Math.round(note)));
    const validVelocity = Math.max(0, Math.min(127, Math.round(velocity)));
    midiOutput.send([0x90 + currentChannel, validNote, validVelocity]);
    sendOSCMessage(`/forma/${shapeId}/noteOn`, validNote, validVelocity, currentChannel);
  }
}

function sendMidiNoteOff(note, channel, shapeId = -1) {
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validNote = Math.max(0, Math.min(127, Math.round(note)));
    midiOutput.send([0x80 + currentChannel, validNote, 0]);
    sendOSCMessage(`/forma/${shapeId}/noteOff`, validNote, currentChannel);
  }
}

function sendPitchBend(bendValue, channel) {
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validBendValue = Math.max(0, Math.min(16383, Math.round(bendValue)));
    const lsb = validBendValue & 0x7F; const msb = (validBendValue >> 7) & 0x7F;
    midiOutput.send([0xE0 + currentChannel, lsb, msb]);
  }
}

function sendMidiCC(controlNumber, value, channel) {
  if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
    const currentChannel = Math.max(0, Math.min(15, channel));
    const validControlNumber = Math.max(0, Math.min(119, Math.round(controlNumber)));
    const validValue = Math.max(0, Math.min(127, Math.round(value)));
    midiOutput.send([0xB0 + currentChannel, validControlNumber, validValue]);
  }
}

initMidi();

const SCALES = {
  PENTATONIC_MAJ: { name: 'Pentatônica Maior', notes: [0, 2, 4, 7, 9], baseMidiNote: 60 },
  DORIAN: { name: 'Dórico', notes: [0, 2, 3, 5, 7, 9, 10], baseMidiNote: 60 },
  HARMONIC_MINOR: { name: 'Menor Harmônica', notes: [0, 2, 3, 5, 7, 8, 11], baseMidiNote: 57 },
  CHROMATIC: { name: 'Cromática', notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], baseMidiNote: 60 }
};
let currentScaleName = 'PENTATONIC_MAJ';
const scaleKeys = Object.keys(SCALES);
let currentScaleIndex = 0;

const NOTE_MODES = ['SEQUENTIAL', 'ARPEGGIO', 'CHORD', 'RANDOM_WALK'];
let currentNoteMode = 'SEQUENTIAL';
let currentNoteModeIndex = 0;

function getNoteInScale(index, baseOctaveOffset = 0) {
  const scale = SCALES[currentScaleName];
  if (!scale) return SCALES.PENTATONIC_MAJ.notes[0] + SCALES.PENTATONIC_MAJ.baseMidiNote;
  const scaleNotes = scale.notes; const scaleLength = scaleNotes.length;
  const octave = baseOctaveOffset + Math.floor(index / scaleLength);
  const noteIndexInScale = index % scaleLength;
  let note = scale.baseMidiNote + scaleNotes[noteIndexInScale] + (octave * 12);
  return Math.max(0, Math.min(127, note));
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function getNoteName(midiNote) {
  if (midiNote < 0 || midiNote > 127) return "";
  const note = NOTE_NAMES[midiNote % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${note}${octave}`;
}

let notesToVisualize = [];

function turnOffAllActiveNotes() {
  if (midiOutput) {
    const originalMidiEnabledState = midiEnabled;
    midiEnabled = true;
    shapes.forEach(shape => {
      Object.keys(shape.activeMidiNotes).forEach(edgeIdx => {
        const noteInfo = shape.activeMidiNotes[edgeIdx];
        if (noteInfo && noteInfo.playing) {
          sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); // Added shapeId
          if (noteInfo.staccatoTimer) clearTimeout(noteInfo.staccatoTimer);
        }
      });
      shape.activeMidiNotes = {};
    });
    midiEnabled = originalMidiEnabledState;
  }
}

async function initializeCamera() {
  console.log("Attempting to initialize camera - v28");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach(track => track.stop());
    console.log("getUserMedia successful, camera permission likely granted. Proceeding with MediaPipe Camera - v28");
    const camera = new Camera(videoElement, {
      onFrame: async () => {
        if (videoElement.readyState >= 2) await hands.send({ image: videoElement });
      },
      width: 640, height: 480
    });
    await camera.start();
    console.log("camera.start() called and awaited - v28");
  } catch (error) {
    console.error("Failed to access webcam or start MediaPipe camera:", error);
    displayGlobalError(`Falha ao acessar a webcam. <br>Verifique permissões.<br><br>Erro: ${error.message}`);
  }
}
initializeCamera();

function sendAllGlobalStatesOSC() {
    sendOSCMessage('/global/state/midiEnabled', midiEnabled ? 1 : 0);
    sendOSCMessage('/global/state/pulseMode', pulseModeActive ? 1 : 0);
    sendOSCMessage('/global/state/staccatoMode', staccatoModeActive ? 1 : 0);
    sendOSCMessage('/global/state/vertexPullMode', vertexPullModeActive ? 1 : 0);
    sendOSCMessage('/global/state/chordMode', chordMode);
    sendOSCMessage('/global/state/scale', currentScaleName);
    // Note: operationMode não está na lista de OSC globais, mas poderia ser adicionado.
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') {
    pulseModeActive = !pulseModeActive;
    if (pulseModeActive) pulseTime = 0;
    sendOSCMessage('/global/state/pulseMode', pulseModeActive ? 1 : 0);
    updateHUD();
  }
  if (e.key === 'm' || e.key === 'M') {
    midiEnabled = !midiEnabled;
    updateMidiButtonText();
    if (!midiEnabled) turnOffAllActiveNotes();
    sendOSCMessage('/global/state/midiEnabled', midiEnabled ? 1 : 0);
    updateHUD();
  }
  if (e.key === 'l' || e.key === 'L') {
    staccatoModeActive = !staccatoModeActive;
    sendOSCMessage('/global/state/staccatoMode', staccatoModeActive ? 1 : 0);
    updateHUD();
  }
  if (e.key === 's' || e.key === 'S') {
    currentScaleIndex = (currentScaleIndex + 1) % scaleKeys.length;
    currentScaleName = scaleKeys[currentScaleIndex];
    console.log("Scale changed to:", SCALES[currentScaleName].name);
    turnOffAllActiveNotes();
    sendOSCMessage('/global/state/scale', currentScaleName);
    // O sendOSCMessage abaixo foi removido pois /global/state/scale é mais específico
    // if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
    //     osc.send(new OSC.Message('/global/scaleChanged', currentScaleName, SCALES[currentScaleName].name));
    // }
    updateHUD();
  }
  if (e.key === 'n' || e.key === 'N') {
    currentNoteModeIndex = (currentNoteModeIndex + 1) % NOTE_MODES.length;
    currentNoteMode = NOTE_MODES[currentNoteModeIndex];
    console.log("Note mode changed to:", currentNoteMode);
    turnOffAllActiveNotes();
    // Não há /global/state/noteMode definido, mas /global/noteModeChanged é enviado
    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
        osc.send(new OSC.Message('/global/noteModeChanged', currentNoteMode));
    }
    updateHUD();
  }
  if (e.key === 'v' || e.key === 'V') {
    vertexPullModeActive = !vertexPullModeActive;
    if (!vertexPullModeActive) {
      shapes.forEach(shape => {
        shape.vertexOffsets = {}; shape.beingPulledByFinger = {};
      });
    }
    sendOSCMessage('/global/state/vertexPullMode', vertexPullModeActive ? 1 : 0);
    updateHUD();
  }
  if (e.key === 'c' || e.key === 'C') {
    chordMode = (chordMode === "TRIAD") ? "VERTEX_ALL" : "TRIAD";
    console.log("Chord mode changed to:", chordMode);
    sendOSCMessage('/global/state/chordMode', chordMode);
    // O sendOSCMessage abaixo foi removido pois /global/state/chordMode é mais específico
    // if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
    //     osc.send(new OSC.Message('/global/chordModeChanged', chordMode));
    // }
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
} else { console.error("Settings modal elements not found."); }

window.addEventListener('click', (event) => {
  if (event.target === infoModal) infoModal.style.display = 'none';
  if (event.target === settingsModal) settingsModal.style.display = 'none';
});

const drawLandmarks = (landmarks) => {
  const connections = [
    [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16], [13,17],[17,18],[18,19],[19,20], [0,17]
  ];
  ctx.strokeStyle = 'lime'; ctx.lineWidth = 2;
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
  const maxInfluenceDistance = 150; const maxForce = 25;
  const fingertipsToUse = [4, 8, 12, 16, 20];
  const noteInterval = 200; // ms between notes in sequential/arpeggio modes

  const cx = shape.centerX; const cy = shape.centerY;
  let drawingRadius = shape.radius;
  if (isPulsing) {
    let radiusModulationFactor = 0.25 * pulseValue;
    drawingRadius = shape.radius * (1 + radiusModulationFactor);
    drawingRadius = Math.max(10, drawingRadius);
  }

  let localRightHandLandmarks = shape.rightHandLandmarks;
  if (shape.activeGesture && shape.activeGesture !== 'liquify') localRightHandLandmarks = null;
  if (vertexPullModeActive && shape.activeGesture === 'pull') localRightHandLandmarks = null;

  let totalDisplacementMagnitude = 0; let activeLiquifyPoints = 0;

  for (let i = 0; i < shape.sides; i++) {
    const angle = (i / shape.sides) * Math.PI * 2;
    let vertexX_orig = drawingRadius * Math.cos(angle);
    let vertexY_orig = drawingRadius * Math.sin(angle);
    let totalDisplacementX = 0; let totalDisplacementY = 0;

    if (localRightHandLandmarks) {
      const currentVertexCanvasX = cx + vertexX_orig;
      const currentVertexCanvasY = cy + vertexY_orig;
      for (const landmarkIndex of fingertipsToUse) {
        const fingertip = localRightHandLandmarks[landmarkIndex];
        const fingertipX = canvasElement.width - (fingertip.x * canvasElement.width);
        const fingertipY = fingertip.y * canvasElement.height;
        const distToFingertip = distance(currentVertexCanvasX, currentVertexCanvasY, fingertipX, fingertipY);
        if (distToFingertip < maxInfluenceDistance && distToFingertip > 0) {
          const vecX = currentVertexCanvasX - fingertipX; const vecY = currentVertexCanvasY - fingertipY;
          const normVecX = vecX / distToFingertip; const normVecY = vecY / distToFingertip;
          const forceMagnitude = maxForce * (1 - distToFingertip / maxInfluenceDistance);
          totalDisplacementX += normVecX * forceMagnitude; totalDisplacementY += normVecY * forceMagnitude;
          activeLiquifyPoints++;
        }
      }
    }
    if (vertexPullModeActive && shape.vertexOffsets[i]) {
        totalDisplacementX += shape.vertexOffsets[i].x;
        totalDisplacementY += shape.vertexOffsets[i].y;
    }
    totalDisplacementMagnitude += Math.sqrt(totalDisplacementX**2 + totalDisplacementY**2);
    const finalX = cx + vertexX_orig + totalDisplacementX;
    const finalY = cy + vertexY_orig + totalDisplacementY;
    if (i === 0) ctx.moveTo(finalX, finalY); else ctx.lineTo(finalX, finalY);
  }
  ctx.closePath();
  ctx.strokeStyle = shape.id === 0 ? 'cyan' : 'magenta'; ctx.lineWidth = 4; ctx.stroke();

  const averageDisplacement = (shape.sides > 0 && activeLiquifyPoints > 0) ? totalDisplacementMagnitude / activeLiquifyPoints : (shape.sides > 0 && Object.keys(shape.vertexOffsets).length > 0 ? totalDisplacementMagnitude / Object.keys(shape.vertexOffsets).length : 0) ;
  const maxObservedDistortion = 50.0; const pitchBendSensitivity = 4096;
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
  const minSidesForBrightness = 3; const maxSidesForBrightness = 20;
  let normalizedSides = (shape.sides - minSidesForBrightness) / (maxSidesForBrightness - minSidesForBrightness);
  normalizedSides = Math.max(0, Math.min(1, normalizedSides));
  if (shape.sides === 100) normalizedSides = 0.5;
  shape.brightnessValue = Math.round(normalizedSides * 127);

  // Note Generation Logic
  if (midiEnabled && shape.sides > 0 && performance.now() - shape.lastNotePlayedTime > noteInterval) {
    const oldEdgeIndex = shape.currentEdgeIndex; // Used for sequential/random to turn off previous note
    if (shape.activeMidiNotes[oldEdgeIndex] && shape.activeMidiNotes[oldEdgeIndex].playing &&
        !staccatoModeActive && currentNoteMode !== 'CHORD' && currentNoteMode !== 'ARPEGGIO') { // ARPEGGIO (chord) handles its own note offs
        sendMidiNoteOff(shape.activeMidiNotes[oldEdgeIndex].note, shape.midiChannel, shape.id + 1);
        shape.activeMidiNotes[oldEdgeIndex].playing = false;
    }

    let notesToPlayThisTick = [];
    let edgeIndexForThisTick = shape.currentEdgeIndex; // For single note modes

    switch (currentNoteMode) {
        case 'SEQUENTIAL':
            shape.currentEdgeIndex += shape.rotationDirection;
            if (shape.currentEdgeIndex >= shape.sides) {
                shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.rotationDirection = -1;
            } else if (shape.currentEdgeIndex < 0) {
                shape.currentEdgeIndex = 0; shape.rotationDirection = 1;
            }
            edgeIndexForThisTick = shape.currentEdgeIndex;
            if (edgeIndexForThisTick < shape.sides) {
                 notesToPlayThisTick.push(getNoteInScale(edgeIndexForThisTick));
            }
            break;

        case 'ARPEGGIO': // MODIFIED: Play all notes as a chord
            if (shape.sides > 0) {
                // Clear previously playing arpeggio notes for this shape to avoid stuck notes
                Object.keys(shape.activeMidiNotes).forEach(idx => {
                    if (shape.activeMidiNotes[idx] && shape.activeMidiNotes[idx].playing && shape.activeMidiNotes[idx].isArpeggioNote) {
                        sendMidiNoteOff(shape.activeMidiNotes[idx].note, shape.midiChannel, shape.id + 1);
                        if(shape.activeMidiNotes[idx].staccatoTimer) clearTimeout(shape.activeMidiNotes[idx].staccatoTimer);
                    }
                });
                shape.activeMidiNotes = Object.fromEntries(
                    Object.entries(shape.activeMidiNotes).filter(([key, value]) => !value.isArpeggioNote)
                );


                const numNotesInArpeggio = Math.min(shape.sides, maxPolyphony);
                for (let i = 0; i < numNotesInArpeggio; i++) {
                    notesToPlayThisTick.push(getNoteInScale(i));
                }
                // No edge index progression needed for chordal arpeggio in this tick-based system
                // If arpeggio should only trigger once per "activation" or change, this logic needs to move
            }
            break;

        case 'CHORD': // Plays a triad based on currentEdgeIndex
            shape.currentEdgeIndex += shape.rotationDirection;
             if (shape.currentEdgeIndex >= shape.sides) {
                shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.rotationDirection = -1;
            } else if (shape.currentEdgeIndex < 0) {
                shape.currentEdgeIndex = 0; shape.rotationDirection = 1;
            }
            edgeIndexForThisTick = shape.currentEdgeIndex;

            if (edgeIndexForThisTick < shape.sides) {
                notesToPlayThisTick.push(getNoteInScale(edgeIndexForThisTick));
                notesToPlayThisTick.push(getNoteInScale(edgeIndexForThisTick + 2)); // Major/Minor third depending on scale
                notesToPlayThisTick.push(getNoteInScale(edgeIndexForThisTick + 4)); // Perfect fifth / diminished/augmented depending on scale

                // Turn off all previous notes for CHORD mode before playing new ones
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
            let step = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
            shape.currentEdgeIndex += step;
            // Ensure currentEdgeIndex wraps around within a reasonable range (e.g., 2 octaves of the scale)
            const numNotesInContext = SCALES[currentScaleName].notes.length * 2;
            shape.currentEdgeIndex = (shape.currentEdgeIndex + numNotesInContext) % numNotesInContext;
            edgeIndexForThisTick = shape.currentEdgeIndex;
            notesToPlayThisTick.push(getNoteInScale(edgeIndexForThisTick));
            break;
    }

    if (notesToPlayThisTick.length > 0) {
        let velocity = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * ((127-30) / (300-30)))));
        if (isPulsing) {
            let pulseVelocityFactor = 0.6 + ((pulseValue + 1) / 2) * 0.4; // pulseValue is -1 to 1
            velocity = Math.round(velocity * pulseVelocityFactor);
            velocity = Math.max(0, Math.min(127, velocity));
        }

        notesToPlayThisTick.forEach((note, i) => {
            // Use a unique key for each note, esp. for polyphonic modes like ARPEGGIO (chord)
            const noteKeyForActive = (currentNoteMode === 'ARPEGGIO' || currentNoteMode === 'CHORD') ? `${note}_${i}` : `${edgeIndexForThisTick}_0`;

            sendMidiNoteOn(note, velocity, shape.midiChannel, shape.id + 1);

            if(shape.activeMidiNotes[noteKeyForActive] && shape.activeMidiNotes[noteKeyForActive].staccatoTimer){
                clearTimeout(shape.activeMidiNotes[noteKeyForActive].staccatoTimer);
            }

            shape.activeMidiNotes[noteKeyForActive] = {
                note: note, channel: shape.midiChannel, lastVelocity: velocity,
                lastPitchBend: shape.currentPitchBend, playing: true, staccatoTimer: null,
                isArpeggioNote: currentNoteMode === 'ARPEGGIO' // Flag for arpeggio notes
            };

            if (staccatoModeActive) {
                shape.activeMidiNotes[noteKeyForActive].staccatoTimer = setTimeout(() => {
                    if (shape.activeMidiNotes[noteKeyForActive] && shape.activeMidiNotes[noteKeyForActive].playing) {
                        sendMidiNoteOff(note, shape.midiChannel, shape.id + 1);
                        shape.activeMidiNotes[noteKeyForActive].playing = false;
                    }
                }, 150); // Staccato duration
            }
        });

        // Send CCs if any notes were played
        if (shape.currentPitchBend !== 8192) sendPitchBend(shape.currentPitchBend, shape.midiChannel);
        if (shape.reverbAmount !== shape.lastSentReverb) { sendMidiCC(91, shape.reverbAmount, shape.midiChannel); shape.lastSentReverb = shape.reverbAmount; }
        if (shape.delayAmount !== shape.lastSentDelay) { sendMidiCC(94, shape.delayAmount, shape.midiChannel); shape.lastSentDelay = shape.delayAmount; }
        if (shape.panValue !== shape.lastSentPan) { sendMidiCC(10, shape.panValue, shape.midiChannel); shape.lastSentPan = shape.panValue; }
        if (shape.brightnessValue !== shape.lastSentBrightness) { sendMidiCC(74, shape.brightnessValue, shape.midiChannel); shape.lastSentBrightness = shape.brightnessValue; }

        shape.lastNotePlayedTime = performance.now();
    }
  }

  // Continuous CC updates and note-off logic for non-staccato notes
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

    if (activeNoteFound) { // Send CCs if any note is active
        if (shape.reverbAmount !== shape.lastSentReverb) { sendMidiCC(91, shape.reverbAmount, shape.midiChannel); shape.lastSentReverb = shape.reverbAmount; }
        if (shape.delayAmount !== shape.lastSentDelay) { sendMidiCC(94, shape.delayAmount, shape.midiChannel); shape.lastSentDelay = shape.delayAmount; }
        if (shape.panValue !== shape.lastSentPan) { sendMidiCC(10, shape.panValue, shape.midiChannel); shape.lastSentPan = shape.panValue; }
        if (shape.brightnessValue !== shape.lastSentBrightness) { sendMidiCC(74, shape.brightnessValue, shape.midiChannel); shape.lastSentBrightness = shape.brightnessValue; }
    }
  }

  // Cleanup notes that are no longer valid (e.g., index out of bounds for SEQUENTIAL, or MIDI disabled)
  if (Object.keys(shape.activeMidiNotes).length > 0) {
    Object.keys(shape.activeMidiNotes).forEach(noteKeyStr => {
        const noteInfo = shape.activeMidiNotes[noteKeyStr];
        let shouldDelete = false;

        if (noteInfo) {
            if (!noteInfo.playing) { // Already marked as not playing (e.g., by staccato timer)
                shouldDelete = true;
            } else if (midiEnabled && shape.sides > 0) {
                // For sequential modes, if note index is out of current shape sides (unless it's an arpeggio/chord note)
                if ((currentNoteMode === 'SEQUENTIAL' || currentNoteMode === 'RANDOM_WALK') && !noteInfo.isArpeggioNote) {
                    // This logic is tricky because noteKeyStr might be 'note_i' for chords/arpeggios
                    // For sequential, it's 'edgeIndex_0'. We need to parse edgeIndex.
                    const edgeIdxNum = parseInt(noteKeyStr.split('_')[0]);
                    if (edgeIdxNum >= shape.sides) {
                        sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
                        noteInfo.playing = false; shouldDelete = true;
                    }
                }
                // ARPEGGIO (chordal) notes are managed by their own play cycle or staccato.
                // CHORD notes are also managed by their own play cycle (all off then all on).
            } else { // MIDI disabled or sides <= 0, turn off and delete
                 sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
                 noteInfo.playing = false; shouldDelete = true;
            }

            if (shouldDelete) {
                if (noteInfo.staccatoTimer) clearTimeout(noteInfo.staccatoTimer);
                delete shape.activeMidiNotes[noteKeyStr];
            }
        }
    });
    // If MIDI disabled or no sides, ensure all notes are off (redundant but safe)
    if (!midiEnabled || (shape.sides <= 0 && (currentNoteMode === 'SEQUENTIAL' || currentNoteMode === 'ARPEGGIO' || currentNoteMode === 'RANDOM_WALK'))) {
        Object.values(shape.activeMidiNotes).forEach(noteInfo => {
            if (noteInfo.playing) sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
            if (noteInfo.staccatoTimer) clearTimeout(noteInfo.staccatoTimer);
        });
        shape.activeMidiNotes = {};
    }
  }
}


function onResults(results) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

  shapes.forEach(shape => {
    shape.leftHandLandmarks = null; shape.rightHandLandmarks = null;
  });

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    if (operationMode === 'one_person') {
        let firstLeftHand = null; let firstRightHand = null;
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i] ? results.multiHandedness[i].label : null;
            drawLandmarks(landmarks);
            if (handedness === "Left" && !firstLeftHand) firstLeftHand = landmarks;
            else if (handedness === "Right" && !firstRightHand) firstRightHand = landmarks;
            if (firstLeftHand && firstRightHand) break;
        }
        shapes[0].leftHandLandmarks = firstLeftHand; shapes[0].rightHandLandmarks = firstRightHand;
        shapes[1].leftHandLandmarks = null; shapes[1].rightHandLandmarks = null;
    } else { // two_persons
        let assignedToShape0L = false, assignedToShape0R = false;
        let assignedToShape1L = false, assignedToShape1R = false;
        results.multiHandLandmarks.forEach((landmarks, i) => {
            const handedness = results.multiHandedness[i] ? results.multiHandedness[i].label : null;
            drawLandmarks(landmarks);
            if (handedness === "Left") {
                if (!shapes[0].leftHandLandmarks && !assignedToShape0L) { shapes[0].leftHandLandmarks = landmarks; assignedToShape0L = true; }
                else if (shapes.length > 1 && !shapes[1].leftHandLandmarks && !assignedToShape1L) { shapes[1].leftHandLandmarks = landmarks; assignedToShape1L = true; }
            } else if (handedness === "Right") {
                if (!shapes[0].rightHandLandmarks && !assignedToShape0R) { shapes[0].rightHandLandmarks = landmarks; assignedToShape0R = true; }
                else if (shapes.length > 1 && !shapes[1].rightHandLandmarks && !assignedToShape1R) { shapes[1].rightHandLandmarks = landmarks; assignedToShape1R = true; }
            }
        });
    }
  }

  shapes.forEach(shape => {
    let gestureProcessedThisFrame = false;
    let currentActiveGesture = null; // Temporarily store the active gesture for this frame

    let wristCount = 0; let avgWristX = 0; let avgWristY = 0;
    if (shape.leftHandLandmarks && shape.leftHandLandmarks[0]) { avgWristX += shape.leftHandLandmarks[0].x; avgWristY += shape.leftHandLandmarks[0].y; wristCount++; }
    if (shape.rightHandLandmarks && shape.rightHandLandmarks[0]) { avgWristX += shape.rightHandLandmarks[0].x; avgWristY += shape.rightHandLandmarks[0].y; wristCount++; }
    if (wristCount > 0) {
        let normX = avgWristX / wristCount; let normY = avgWristY / wristCount;
        let targetCenterX = canvasElement.width - (normX * canvasElement.width);
        let targetCenterY = normY * canvasElement.height;
        shape.centerX = shape.centerX * 0.85 + targetCenterX * 0.15;
        shape.centerY = shape.centerY * 0.85 + targetCenterY * 0.15;
    }

    // Resize Gesture
    if (shape.leftHandLandmarks && shape.rightHandLandmarks) {
        const leftThumbTip = shape.leftHandLandmarks[4]; const rightThumbTip = shape.rightHandLandmarks[4];
        const leftIndexCurled = shape.leftHandLandmarks[8].y > shape.leftHandLandmarks[6].y;
        const leftMiddleCurled = shape.leftHandLandmarks[12].y > shape.leftHandLandmarks[10].y;
        const rightIndexCurled = shape.rightHandLandmarks[8].y > shape.rightHandLandmarks[6].y;
        const rightMiddleCurled = shape.rightHandLandmarks[12].y > shape.rightHandLandmarks[10].y;

        if (leftIndexCurled && leftMiddleCurled && rightIndexCurled && rightMiddleCurled) {
            currentActiveGesture = 'resize';
            gestureProcessedThisFrame = true;
            const leftThumbX = canvasElement.width - (leftThumbTip.x * canvasElement.width); const leftThumbY = leftThumbTip.y * canvasElement.height;
            const rightThumbX = canvasElement.width - (rightThumbTip.x * canvasElement.width); const rightThumbY = rightThumbTip.y * canvasElement.height;
            const thumbDistancePixels = distance(leftThumbX, leftThumbY, rightThumbX, rightThumbY);
            const minThumbDist = canvasElement.width * 0.03; const maxThumbDist = canvasElement.width * 0.35;
            const normalizedThumbDist = Math.max(0, Math.min(1, (thumbDistancePixels - minThumbDist) / (maxThumbDist - minThumbDist)));
            let targetRadius = 30 + normalizedThumbDist * 270;
            shape.radius = shape.radius * 0.8 + targetRadius * 0.2;

            const currentTime = performance.now();
            const radiusDifference = Math.abs(shape.radius - shape.lastResizeRadius);
            const timeDifference = currentTime - shape.lastResizeTime;
            const MIN_RADIUS_CHANGE_FOR_CHORD = 10; const MIN_TIME_BETWEEN_CHORDS_MS = 500;

            if (radiusDifference > MIN_RADIUS_CHANGE_FOR_CHORD && timeDifference > MIN_TIME_BETWEEN_CHORDS_MS) {
              if (midiEnabled && midiOutput && shape.sides > 0) {
                const velocity = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * ((127-30) / (300-30)))));
                let notesToPlay = []; const CHORD_NOTE_DURATION_MS = 250;
                if (chordMode === "TRIAD") {
                  const fundamentalNoteIndex = 0; // Or derive from currentEdgeIndex
                  notesToPlay.push(getNoteInScale(fundamentalNoteIndex, 1));
                  notesToPlay.push(getNoteInScale(fundamentalNoteIndex + 2, 1));
                  notesToPlay.push(getNoteInScale(fundamentalNoteIndex + 4, 1));
                } else if (chordMode === "VERTEX_ALL") {
                  const numNotes = Math.min(shape.sides, maxPolyphony);
                  for (let i = 0; i < numNotes; i++) notesToPlay.push(getNoteInScale(i));
                }
                if (notesToPlay.length > 0) {
                  const currentTimeForVis = performance.now();
                  notesToPlay.forEach((note, index) => {
                    sendMidiNoteOn(note, velocity, shape.midiChannel, shape.id + 1);
                    setTimeout(() => sendMidiNoteOff(note, shape.midiChannel, shape.id + 1), CHORD_NOTE_DURATION_MS);
                    // Visualization logic
                    const angle = (index / Math.min(shape.sides, notesToPlay.length, maxPolyphony)) * Math.PI * 2;
                    const visRadius = shape.radius + (chordMode === "TRIAD" ? -20 : 20);
                    const x = shape.centerX + visRadius * Math.cos(angle);
                    const y = shape.centerY + visRadius * Math.sin(angle);
                    notesToVisualize.push({ noteName: getNoteName(note), x, y, timestamp: currentTimeForVis, shapeId: shape.id });
                  });
                  sendOSCMessage(`/forma/${shape.id + 1}/chord`, ...notesToPlay.map(n => parseInt(n)));
                }
                shape.lastResizeRadius = shape.radius; shape.lastResizeTime = currentTime;
              }
            }
        }
    }

    // Sides Gesture
    if (!gestureProcessedThisFrame && shape.leftHandLandmarks) {
        const indexTip = shape.leftHandLandmarks[8]; const thumbTip = shape.leftHandLandmarks[4];
        const ix_canvas = canvasElement.width-(indexTip.x*canvasElement.width); const iy_canvas = indexTip.y*canvasElement.height;
        const tx_canvas = canvasElement.width-(thumbTip.x*canvasElement.width); const ty_canvas = thumbTip.y*canvasElement.height;
        shape.pinchDistance = distance(ix_canvas, iy_canvas, tx_canvas, ty_canvas);
        const pinchCenterX = (ix_canvas+tx_canvas)/2; const pinchCenterY = (iy_canvas+ty_canvas)/2;

        if (isTouchingCircle(pinchCenterX,pinchCenterY, shape.centerX,shape.centerY, shape.radius,shape.radius*0.5)) {
            currentActiveGesture = 'sides';
            gestureProcessedThisFrame = true;
            const minPinch=10; const maxPinchDistForSides=150;
            const sidesRangeMin=3; const sidesRangeMax=20;
            let newSides = (shape.pinchDistance > maxPinchDistForSides*1.2) ? 100 :
                Math.round(sidesRangeMin + Math.max(0,Math.min(1,(shape.pinchDistance-minPinch)/(maxPinchDistForSides-minPinch))) * (sidesRangeMax-sidesRangeMin));
            newSides = Math.max(3,Math.min(100,newSides));
            if (newSides !== shape.sides && (performance.now() - shape.lastSideChangeTime > SIDE_CHANGE_DEBOUNCE_MS)) {
                shape.sides = newSides; shape.lastSideChangeTime = performance.now();
                if (shape.currentEdgeIndex >= newSides) shape.currentEdgeIndex = Math.max(0,newSides-1);
            }
        }
    }

    // Vertex Pull Gesture
    if (!gestureProcessedThisFrame && vertexPullModeActive && shape.rightHandLandmarks) {
        const indexFingertip = shape.rightHandLandmarks[8];
        const fingertipX_canvas = canvasElement.width-(indexFingertip.x*canvasElement.width);
        const fingertipY_canvas = indexFingertip.y*canvasElement.height;
        const pullRadiusThreshold = 30; const fingerId = shape.id + "_idx_pull";

        if (shape.beingPulledByFinger[fingerId] !== undefined) { // Already pulling a vertex
            currentActiveGesture = 'pull'; gestureProcessedThisFrame = true;
            const vertexIndex = shape.beingPulledByFinger[fingerId];
            const currentDrawingRadius = pulseModeActive ? shape.radius * (1 + 0.25 * Math.sin(pulseTime * pulseFrequency * 2 * Math.PI)) : shape.radius;
            const angle = (vertexIndex / shape.sides) * Math.PI * 2;
            const originalVertexX_view = currentDrawingRadius * Math.cos(angle);
            const originalVertexY_view = currentDrawingRadius * Math.sin(angle);
            const displacementX = fingertipX_canvas - (shape.centerX + originalVertexX_view);
            const displacementY = fingertipY_canvas - (shape.centerY + originalVertexY_view);
            shape.vertexOffsets[vertexIndex] = { x: displacementX, y: displacementY, fingerId: fingerId };
        } else { // Check if starting to pull a new vertex
            for (let i = 0; i < shape.sides; i++) {
                const currentDrawingRadius = pulseModeActive ? shape.radius * (1 + 0.25 * Math.sin(pulseTime * pulseFrequency * 2 * Math.PI)) : shape.radius;
                const angle = (i / shape.sides) * Math.PI * 2;
                const vertexX_orig_view = currentDrawingRadius * Math.cos(angle);
                const vertexY_orig_view = currentDrawingRadius * Math.sin(angle);
                const currentVertexCanvasX = shape.centerX + vertexX_orig_view;
                const currentVertexCanvasY = shape.centerY + vertexY_orig_view;
                if (distance(fingertipX_canvas, fingertipY_canvas, currentVertexCanvasX, currentVertexCanvasY) < pullRadiusThreshold) {
                    if (!Object.values(shape.beingPulledByFinger).includes(i)) { // Not pulled by another finger
                        currentActiveGesture = 'pull'; gestureProcessedThisFrame = true;
                        const displacementX = fingertipX_canvas - currentVertexCanvasX;
                        const displacementY = fingertipY_canvas - currentVertexCanvasY;
                        shape.vertexOffsets[i] = { x: displacementX, y: displacementY, fingerId: fingerId };
                        shape.beingPulledByFinger[fingerId] = i;
                        break;
                    }
                }
            }
        }
        // If was pulling but no longer (finger moved away or mode deactivated)
        if (shape.activeGesture === 'pull' && currentActiveGesture !== 'pull') {
             if (shape.beingPulledByFinger[fingerId] !== undefined) {
                const vertexIndexReleased = shape.beingPulledByFinger[fingerId];
                if (shape.vertexOffsets[vertexIndexReleased] && shape.vertexOffsets[vertexIndexReleased].fingerId === fingerId) {
                    delete shape.vertexOffsets[vertexIndexReleased];
                }
                delete shape.beingPulledByFinger[fingerId];
            }
        }
    }
     // If vertex pull mode is turned off while a vertex is being pulled
    if (!vertexPullModeActive && shape.activeGesture === 'pull') {
        const fingerId = shape.id + "_idx_pull";
        if (shape.beingPulledByFinger[fingerId] !== undefined) {
            const vertexIndexReleased = shape.beingPulledByFinger[fingerId];
            if (shape.vertexOffsets[vertexIndexReleased] && shape.vertexOffsets[vertexIndexReleased].fingerId === fingerId) {
                delete shape.vertexOffsets[vertexIndexReleased];
            }
            delete shape.beingPulledByFinger[fingerId];
        }
    }


    // Liquify Gesture
    if (!gestureProcessedThisFrame && shape.rightHandLandmarks) {
        const fingertipsToUse = [4, 8, 12, 16, 20]; const maxInfluenceDistance = 150;
        for (const landmarkIndex of fingertipsToUse) {
            const fingertip = shape.rightHandLandmarks[landmarkIndex];
            const fingertipX = canvasElement.width-(fingertip.x*canvasElement.width);
            const fingertipY = fingertip.y*canvasElement.height;
            if (Math.abs(fingertipX-shape.centerX) < shape.radius+maxInfluenceDistance &&
                Math.abs(fingertipY-shape.centerY) < shape.radius+maxInfluenceDistance) {
                currentActiveGesture = 'liquify'; gestureProcessedThisFrame = true;
                break;
            }
        }
    }

    // Update activeGesture and send OSC if changed
    const newGestureForOSC = currentActiveGesture || 'none';
    if (shape.lastSentActiveGesture !== newGestureForOSC) {
        sendOSCMessage(`/forma/${shape.id + 1}/gestureActivated`, newGestureForOSC);
        shape.lastSentActiveGesture = newGestureForOSC;
    }
    shape.activeGesture = currentActiveGesture; // Set for current frame logic

  });

  let currentPulseValue = 0;
  if (pulseModeActive) {
      pulseTime = performance.now() * 0.001;
      currentPulseValue = Math.sin(pulseTime * pulseFrequency * 2 * Math.PI);
      lastPulseValue = currentPulseValue;
  }

  shapes.forEach(shape => drawShape(shape, pulseModeActive, currentPulseValue));

  const now = performance.now(); const VISUALIZATION_DURATION_MS = 750;
  ctx.font = "16px Arial"; ctx.textAlign = "center";
  notesToVisualize = notesToVisualize.filter(visNote => {
    const age = now - visNote.timestamp;
    if (age < VISUALIZATION_DURATION_MS) {
      const alpha = 1.0 - (age / VISUALIZATION_DURATION_MS);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
      ctx.fillText(visNote.noteName, visNote.x, visNote.y);
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
            popupCanvas.width = outputPopupWindow.innerWidth; popupCanvas.height = outputPopupWindow.innerHeight;
        }
        popupCanvasCtx.fillStyle = 'rgba(0,0,0,0.1)'; popupCanvasCtx.fillRect(0,0,popupCanvas.width,popupCanvas.height);
        popupCanvasCtx.drawImage(canvasElement, 0, 0, popupCanvas.width, popupCanvas.height);
      }
    } catch (e) {
      if (e.name === "InvalidStateError" || (outputPopupWindow && outputPopupWindow.closed)) {
        popupCanvasCtx = null; outputPopupWindow = null;
      }
    }
  }
}

if (openOutputPopupButton) {
  openOutputPopupButton.addEventListener('click', () => {
    if (outputPopupWindow && !outputPopupWindow.closed) outputPopupWindow.focus();
    else {
      outputPopupWindow = window.open('', 'OutputWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
      if (!outputPopupWindow || outputPopupWindow.closed || typeof outputPopupWindow.document === 'undefined') {
        alert("Falha ao abrir janela. Verifique pop-up blocker."); outputPopupWindow = null; popupCanvasCtx = null;
      } else {
        outputPopupWindow.document.write('<!DOCTYPE html><html><head><title>Visual Output</title><style>body{margin:0;overflow:hidden;background:#111;display:flex;justify-content:center;align-items:center}canvas{display:block;width:100%;height:100%}</style></head><body><canvas id="popupCanvas"></canvas></body></html>');
        outputPopupWindow.document.close();
        outputPopupWindow.onload = () => {
            const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
            if (popupCanvas) {
              popupCanvasCtx = popupCanvas.getContext('2d');
              try { popupCanvas.width = outputPopupWindow.innerWidth; popupCanvas.height = outputPopupWindow.innerHeight; } catch (e) { console.warn("Error popup size:", e); }
            } else { alert("Erro canvas popup."); outputPopupWindow.close(); outputPopupWindow = null; popupCanvasCtx = null; }
        };
        outputPopupWindow.addEventListener('beforeunload', () => { popupCanvasCtx = null; outputPopupWindow = null; });
      }
    }
  });
} else console.error("openOutputPopupButton not found.");

function updateHUD() {
  if (hudElement) {
    let hudText = "";
    shapes.forEach(shape => {
      hudText += `<b>Forma ${shape.id + 1}:</b> R:${Math.round(shape.radius)}, L:${shape.sides===100?'Circ':shape.sides} `;
      hudText += `Gest:${shape.activeGesture || "Nenhum"}<br>`;
      // hudText += `&nbsp;&nbsp;Pos:(${Math.round(shape.centerX)},${Math.round(shape.centerY)}) Pitch:${shape.currentPitchBend-8192}<br>`;
    });
    hudText += `<b>Geral:</b> MIDI:${midiEnabled?'ON':'OFF'} Pulso:${pulseModeActive?'ON':'OFF'} Artic:${staccatoModeActive?'Stac':'Leg'}<br>`;
    hudText += `&nbsp;&nbsp;VtxPull:${vertexPullModeActive?'ON':'OFF'} Escala:${SCALES[currentScaleName]?SCALES[currentScaleName].name:'N/A'} (S)<br>`;
    hudText += `&nbsp;&nbsp;Nota:${currentNoteMode}(N) Acorde:${chordMode}(C) Oper:${operationMode==='one_person'?'1P':'2P'}<br>`;
    hudText += `<b>OSC:</b> ${oscStatus}`;
    hudElement.innerHTML = hudText;

    const now = performance.now();
    if (osc && osc.status() === OSC.STATUS.IS_OPEN && (now - lastOscSendTime > OSC_SEND_INTERVAL)) {
      lastOscSendTime = now;
      shapes.forEach(shape => {
        const sid = shape.id + 1;
        sendOSCMessage(`/forma/${sid}/radius`, parseFloat(shape.radius.toFixed(2)));
        sendOSCMessage(`/forma/${sid}/sides`, parseInt(shape.sides));
        sendOSCMessage(`/forma/${sid}/pos`, parseFloat((shape.centerX/canvasElement.width).toFixed(3)), parseFloat((shape.centerY/canvasElement.height).toFixed(3)));
        sendOSCMessage(`/forma/${sid}/distortion`, parseFloat((Math.abs(shape.currentPitchBend-8192)/8191).toFixed(3)));
        sendOSCMessage(`/forma/${sid}/pitchbend`, parseInt(shape.currentPitchBend));
        sendOSCMessage(`/forma/${sid}/cc91`, parseInt(shape.reverbAmount));
        sendOSCMessage(`/forma/${sid}/cc94`, parseInt(shape.delayAmount));
        sendOSCMessage(`/forma/${sid}/cc10`, parseInt(shape.panValue));
        sendOSCMessage(`/forma/${sid}/cc74`, parseInt(shape.brightnessValue));
        sendOSCMessage(`/forma/${sid}/direction`, parseInt(shape.rotationDirection));
      });
      // Global states are now sent on change, but could be sent periodically too if needed.
      // sendOSCMessage(`/global/pulseActive`, pulseModeActive ? 1 : 0);
      // sendOSCMessage(`/global/staccatoActive`, staccatoModeActive ? 1 : 0);
      // sendOSCMessage(`/global/vertexPullActive`, vertexPullModeActive ? 1 : 0);
      // sendOSCMessage(`/global/midiEnabled`, midiEnabled ? 1 : 0);
    }
  }
}

function updateMidiButtonText() {
  if (midiToggleButton) midiToggleButton.textContent = midiEnabled ? "🎹 MIDI ON" : "🎹 MIDI OFF";
}
updateMidiButtonText();

if (midiToggleButton) {
  midiToggleButton.addEventListener('click', () => {
    midiEnabled = !midiEnabled; updateMidiButtonText();
    if (!midiEnabled) turnOffAllActiveNotes();
    sendOSCMessage('/global/state/midiEnabled', midiEnabled ? 1 : 0);
    updateHUD();
  });
}

if (operationModeButton) {
    operationModeButton.addEventListener('click', () => {
        operationMode = (operationMode === 'one_person') ? 'two_persons' : 'one_person';
        operationModeButton.textContent = `👤 Modo: ${operationMode === 'one_person' ? '1 Pessoa' : '2 Pessoas'}`;
        shapes.forEach(shape => { shape.leftHandLandmarks = null; shape.rightHandLandmarks = null; shape.activeGesture = null; shape.lastSentActiveGesture = null;});
        console.log("Operation mode changed to:", operationMode);
        turnOffAllActiveNotes();
        // sendOSCMessage('/global/state/operationMode', operationMode); // If we decide to send this
        updateHUD();
    });
}

updateHUD();
console.log("main28.js loaded. Attempting to initialize camera and MediaPipe Hands.");
sendAllGlobalStatesOSC(); // Send initial states once everything is loaded
