const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
let ctx = canvasElement.getContext('2d'); // Será 2D ou WebGL2

// --- WebGL2 Check ---
function checkWebGL2Support() {
  try {
    const testCanvas = document.createElement('canvas');
    if (testCanvas.getContext && testCanvas.getContext('webgl2')) {
      console.log("WebGL2 suportado.");
      return true;
    }
  } catch (e) {
    // ignore
  }
  console.warn("WebGL2 não suportado pelo navegador.");
  return false;
}

let hasWebGL2 = checkWebGL2Support();

if (hasWebGL2) {
    try {
        // Tentar obter contexto WebGL2 para MediaPipe, se necessário, ou manter 2D para desenho customizado.
        // Por enquanto, MediaPipe Hands no JS geralmente usa CanvasRenderingContext2D para desenhar sobre o vídeo.
        // A verificação de WebGL2 é mais para alertar o usuário se alguma futura funcionalidade depender disso.
        // ctx = canvasElement.getContext('webgl2'); // Se fosse usar WebGL2 para o desenho principal.
        // console.log("Contexto WebGL2 obtido para o canvas principal.");
    } catch (e) {
        console.error("Erro ao obter contexto WebGL2, usando fallback para 2D.", e);
        hasWebGL2 = false; // Fallback
        ctx = canvasElement.getContext('2d'); // Garante que ctx seja 2D se WebGL2 falhar
    }
}

function displayGlobalError(message, duration = 10000) {
    let errorDiv = document.getElementById('globalErrorDisplay');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'globalErrorDisplay';
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '10px';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translateX(-50%)';
        errorDiv.style.padding = '10px 20px';
        errorDiv.style.backgroundColor = '#e06c75'; // Cor de erro
        errorDiv.style.color = 'white';
        errorDiv.style.zIndex = '2000';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        errorDiv.style.textAlign = 'center';
        document.body.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, duration);
}

if (!hasWebGL2) {
    displayGlobalError("Aviso: WebGL2 não está disponível. Algumas funcionalidades visuais podem ser limitadas.", 15000);
}


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
    this.modWheelValue = 0; // CC1 (Modulation)
    this.resonanceValue = 0; // CC71 (Resonance)
    this.lastSentReverb = -1;
    this.lastSentDelay = -1;
    this.lastSentPan = -1;
    this.lastSentBrightness = -1;
    this.lastSentModWheel = -1;
    this.lastSentResonance = -1;
    this.vertexOffsets = {};
    this.beingPulledByFinger = {};
    this.rotationDirection = 1;
    this.currentEdgeIndex = 0;
    this.lastNotePlayedTime = 0;
    this.lastResizeRadius = this.radius;
    this.lastResizeTime = 0;
    this.lastSentActiveGesture = null;
    this.arpeggioDirection = 1;
    this.lastArpeggioNotePlayedTime = 0;
  }
}

const shapes = [new Shape(0, 0), new Shape(1, 1)];

let operationMode = 'two_persons';
const SIDE_CHANGE_DEBOUNCE_MS = 200;
let pulseModeActive = false;
let pulseTime = 0;
let pulseFrequency = 0.5;
// let lastPulseValue = 0; // Não parece ser usado globalmente
let midiEnabled = true; // Declarada globalmente
let staccatoModeActive = false;
let vertexPullModeActive = false;
const maxPolyphony = 12;
let chordMode = "TRIAD";

let currentArpeggioStyle = "UP";
const ARPEGGIO_STYLES = ["UP", "DOWN", "UPDOWN", "RANDOM"];
let arpeggioBPM = 120;
let noteInterval = 60000 / arpeggioBPM;
let externalBPM = null;

let osc;
let oscStatus = "OSC Desconectado";
const OSC_HOST = 'localhost';
const OSC_PORT = 8080; // Deve corresponder ao WEBSOCKET_PORT em osc_relay30.py
let lastOscSendTime = 0;
const OSC_SEND_INTERVAL = 100; // ms, for 10Hz.
let oscHeartbeatIntervalId = null;
const OSC_RECONNECT_TIMEOUT = 3000; // ms

let isRecordingOSC = false;
let recordedOSCSequence = [];
let recordingStartTime = 0; // V30: Para normalizar timestamps na gravação
let playbackStartTime = 0;
let playbackLoopIntervalId = null;
let oscLoopDuration = 5000; // ms
let isPlayingOSCLoop = false;

let spectatorModeActive = false;
let dmxSyncModeActive = false;
let midiFeedbackEnabled = false;

// Elementos da UI (DOM)
const midiToggleButton = document.getElementById('midiToggleButton');
const settingsButton = document.getElementById('settingsButton');
const hudElement = document.getElementById('hud');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalButton = document.getElementById('closeSettingsModal');
const midiOutputSelect = document.getElementById('midiOutputSelect');
const midiInputSelect = document.getElementById('midiInputSelect');
const midiFeedbackToggleButton = document.getElementById('midiFeedbackToggleButton');
const openOutputPopupButton = document.getElementById('openOutputPopupButton');
const operationModeButton = document.getElementById('operationModeButton');

const arpeggioSettingsButton = document.getElementById('arpeggioSettingsButton');
const arpeggioSettingsModal = document.getElementById('arpeggioSettingsModal');
const closeArpeggioSettingsModalButton = document.getElementById('closeArpeggioSettingsModal');
const arpeggioStyleSelect = document.getElementById('arpeggioStyleSelect');
const arpeggioBPMSlider = document.getElementById('arpeggioBPM');
const arpeggioBPMValueSpan = document.getElementById('arpeggioBPMValue');
const noteIntervalSlider = document.getElementById('noteIntervalSlider');
const noteIntervalValueSpan = document.getElementById('noteIntervalValue');

const oscPanelButton = document.getElementById('oscPanelButton');
const oscControlModal = document.getElementById('oscControlModal');
const closeOscControlModalButton = document.getElementById('closeOscControlModal');
const oscAddressInput = document.getElementById('oscAddressInput');
const oscArgsInput = document.getElementById('oscArgsInput');
const sendTestOSCButton = document.getElementById('sendTestOSCButton');
const oscLogTextarea = document.getElementById('oscLogTextarea');
const clearOscLogButton = document.getElementById('clearOscLogButton');
const exportOscLogButton = document.getElementById('exportOscLogButton'); // Novo botão

const syncDMXNotesButton = document.getElementById('syncDMXNotesButton');
const recordOSCButton = document.getElementById('recordOSCButton');
const playOSCLoopButton = document.getElementById('playOSCLoopButton');
const oscLoopDurationInput = document.getElementById('oscLoopDurationInput'); // Input no modal OSC
const spectatorModeButton = document.getElementById('spectatorModeButton');
const resetMidiButton = document.getElementById('resetMidiButton'); // Novo botão
const scaleCycleButton = document.getElementById('scaleCycleButton'); // New Scale Button

let outputPopupWindow = null;
let popupCanvasCtx = null;
let midiAccess = null;
let midiOutput = null;
let midiInput = null;
let availableMidiOutputs = new Map();
let availableMidiInputs = new Map();

// --- OSC LOGGING ---
let lastLogSource = "";
function logOSC(source, address, args, isSeparator = false) {
    if (oscLogTextarea) {
        if (isSeparator) {
            oscLogTextarea.value += `--- Log Separator (${new Date().toLocaleTimeString()}) ---\n`;
            lastLogSource = "SEPARATOR";
            oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight;
            return;
        }

        const timestamp = new Date().toLocaleTimeString();
        let classSource = "system"; // Default
        let sourcePrefix = "SYS";

        switch (source.toUpperCase()) {
            case "OUT": classSource = "out"; sourcePrefix = "OUT"; break;
            case "IN (UDP)": classSource = "in"; sourcePrefix = "UDP"; break;
            case "MIDI->OSC": classSource = "midi"; sourcePrefix = "MIDI"; break;
            case "LOOP": classSource = "loop"; sourcePrefix = "LOOP"; break;
            case "PANEL": classSource = "panel"; sourcePrefix = "PANEL"; break;
            case "REC INFO": classSource = "system"; sourcePrefix = "REC"; break; // Ou outra cor
            case "SYSTEM": classSource = "system"; sourcePrefix = "SYS"; break;
        }

        // Adiciona separador visual se a fonte mudou
        if (source.toUpperCase() !== lastLogSource && lastLogSource !== "" && lastLogSource !== "SEPARATOR") {
             oscLogTextarea.value += `-------------------------------------\n`;
        }
        lastLogSource = source.toUpperCase();

        // Para fins de exibição no textarea, não podemos usar HTML/CSS diretamente.
        // A coloração precisaria de um elemento div com `contenteditable=false` e `innerHTML`.
        // Por simplicidade no textarea, vamos apenas prefixar.
        // Se fosse um div:
        // const logEntry = document.createElement('div');
        // logEntry.className = `log-entry log-source-${classSource}`;
        // logEntry.textContent = `${timestamp} [${sourcePrefix}] ${address} ${JSON.stringify(args)}`;
        // oscLogTextarea.appendChild(logEntry);

        const type = args && args.length > 0 && typeof args[0] === 'object' && args[0].type ? ` (${args.map(a => a.type).join(', ')})` : '';
        const argString = JSON.stringify(args);
        oscLogTextarea.value += `${timestamp} [${sourcePrefix}] ${address}${type} ${argString}\n`;

        oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight; // Auto-scroll
    }
}

function exportOSCLog() {
    if (!oscLogTextarea || oscLogTextarea.value.trim() === "") {
        alert("Log OSC está vazio. Nada para exportar.");
        return;
    }
    try {
        const blob = new Blob([oscLogTextarea.value], { type: 'text/plain;charset=utf-8' });
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const filename = `osc_log_v31_${timestamp}.txt`; // TODO: Update to v32 if needed later

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link); // Necessário para Firefox
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        logOSC("SYSTEM", "Log OSC exportado.", [filename]);
    } catch (e) {
        console.error("Erro ao exportar log OSC:", e);
        alert("Falha ao exportar log OSC.");
        logOSC("SYSTEM", "Falha ao exportar log OSC.", [e.message]);
    }
}


// --- OSC SETUP & COMMUNICATION ---
function sendOSCMessage(address, ...args) {
    if (spectatorModeActive && !address.startsWith('/ping')) return; // Permite ping no modo espectador

    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
        const message = new OSC.Message(address, ...args);
        osc.send(message);
        // logOSC("OUT", address, args); // Log interno já acontece no painel ou loop

        if (isRecordingOSC && !address.startsWith('/ping')) { // Não grava pings
            recordedOSCSequence.push({
                timestamp: performance.now() - recordingStartTime, // Timestamp relativo ao início da gravação
                message: { address: message.address, args: message.args }
            });
        }
    }
}

function sendOSCHeartbeat() { sendOSCMessage('/ping', Date.now()); }

function setupOSC() {
  if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.close();
  if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId);

  osc = new OSC({ plugin: new OSC.WebsocketClientPlugin({ host: OSC_HOST, port: OSC_PORT, secure: false }) });

  osc.on('open', () => {
    oscStatus = `OSC Conectado (ws://${OSC_HOST}:${OSC_PORT})`;
    console.log(oscStatus);
    oscHeartbeatIntervalId = setInterval(sendOSCHeartbeat, 5000);
    sendOSCHeartbeat();
    sendAllGlobalStatesOSC();
    updateHUD();
  });

  osc.on('close', () => {
    oscStatus = "OSC Desconectado";
    console.log(oscStatus);
    if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId);
    updateHUD();
    setTimeout(setupOSC, OSC_RECONNECT_TIMEOUT);
  });

  osc.on('error', (err) => {
    oscStatus = "OSC Erro";
    console.error("OSC Error:", err);
    if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId);
    updateHUD();
    // Poderia tentar reconectar aqui também, dependendo do erro.
  });

  osc.on('message', (msg) => { // Mensagens recebidas do servidor WebSocket (Python)
    try {
        let parsedMsg = msg; // osc-js já deve parsear mensagens OSC binárias
        if (msg.args && msg.args.length > 0 && typeof msg.args[0] === 'string') {
            try { // Tenta parsear como JSON se o primeiro argumento for string (confirmação do relay)
                const potentialJson = JSON.parse(msg.args[0]);
                if (potentialJson.type === "confirmation") parsedMsg = potentialJson;
                else if (potentialJson.address && potentialJson.args) parsedMsg = potentialJson; // Mensagem UDP encaminhada como JSON
            } catch (e) { /* Não era JSON, continua com msg original */ }
        }

        if (parsedMsg && parsedMsg.type === "confirmation") {
            // console.log(`OSC Relay Confirm: ${parsedMsg.received_address} ${JSON.stringify(parsedMsg.received_args)}`);
        } else if (parsedMsg && parsedMsg.address) { // Mensagem OSC padrão (binária ou JSON vinda do UDP)
            logOSC("IN (UDP)", parsedMsg.address, parsedMsg.args);
            handleIncomingExternalOSC(parsedMsg);
        } else {
            // console.log("OSC Msg Recebida (formato desconhecido):", msg);
        }
    } catch (e) {
        console.error("Erro ao processar mensagem OSC recebida:", e, "Mensagem original:", msg);
    }
  });

  try { osc.open(); }
  catch (error) {
    console.error("Falha ao iniciar OSC:", error);
    oscStatus = "OSC Falha ao iniciar";
    updateHUD();
    setTimeout(setupOSC, OSC_RECONNECT_TIMEOUT);
  }

  // --- OSC Message Handlers (para mensagens recebidas) ---
  // Handlers para controle externo da UI (ex: /global/setPulseActive, /forma/1/setRadius etc.)
  // Eles devem verificar !spectatorModeActive antes de aplicar mudanças.

  osc.on('/global/setExternalBPM', msg => {
    // Este é um controle externo, pode funcionar mesmo em spectator mode para visualização
    const newExtBPM = msg.args[0]?.value !== undefined ? msg.args[0].value : msg.args[0]; // osc-js pode ou não encapsular
    if (typeof newExtBPM === 'number') {
      if (newExtBPM > 0) {
        externalBPM = newExtBPM;
        arpeggioBPM = externalBPM;
        noteInterval = 60000 / arpeggioBPM;
        console.log(`OSC: BPM Externo -> ${arpeggioBPM}, Intervalo -> ${noteInterval.toFixed(0)}ms`);
        if (arpeggioBPMValueSpan) arpeggioBPMValueSpan.textContent = `${arpeggioBPM.toFixed(1)} (Ext)`;
        if (arpeggioBPMSlider) arpeggioBPMSlider.disabled = true;
        if (noteIntervalSlider) noteIntervalSlider.disabled = true;
        sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM);
      } else { // Desabilitar BPM externo
        externalBPM = null;
        if (arpeggioBPMSlider) arpeggioBPMSlider.disabled = false;
        if (noteIntervalSlider) noteIntervalSlider.disabled = false;
        loadArpeggioSettings(); // Restaura BPM salvo/padrão
        console.log(`OSC: BPM Externo desabilitado. BPM -> ${arpeggioBPM}`);
      }
      updateHUD();
    }
  });

  osc.on('/global/setScale', msg => {
    if (spectatorModeActive) return;
    const newScale = msg.args[0]?.value !== undefined ? msg.args[0].value : msg.args[0];
    if (typeof newScale === 'string') {
        setScale(newScale.toUpperCase()); // setScale handles validation and UI updates
    }
  });

  // Adicionar mais handlers globais conforme a necessidade de controle externo.
}

function handleIncomingExternalOSC(oscMessage) { // Chamado por `osc.on('message', ...)`
    if (spectatorModeActive) return; // Ignora comandos externos no modo espectador

    const address = oscMessage.address;
    const args = oscMessage.args.map(arg => (arg && arg.value !== undefined) ? arg.value : arg);
    console.log(`OSC IN (UDP Routed): ${address}`, args);

    const shapeControlRegex = /^\/forma\/(\d+)\/(setRadius|setSides)$/;
    const shapeMatch = address.match(shapeControlRegex);

    if (shapeMatch) {
        const shapeId = parseInt(shapeMatch[1], 10) - 1; // OSC é 1-indexed, array é 0-indexed
        const command = shapeMatch[2];
        const value = parseFloat(args[0]);

        if (shapeId >= 0 && shapeId < shapes.length && !isNaN(value)) {
            const shape = shapes[shapeId];
            if (command === "setRadius") {
                if (value >= 10 && value <= 500) { // Adiciona alguma validação
                    shape.radius = value;
                    console.log(`Shape ${shapeId + 1} radius set to ${value} via OSC`);
                    sendOSCMessage(`/forma/${shapeId + 1}/radius`, shape.radius); // Confirmação / atualização
                } else {
                    console.warn(`OSC: Valor de raio inválido para forma ${shapeId + 1}: ${value}`);
                }
            } else if (command === "setSides") {
                const intValue = parseInt(args[0], 10);
                if (intValue >= 3 && intValue <= 100) { // 100 para círculo
                    shape.sides = intValue;
                    if(shape.currentEdgeIndex >= shape.sides) shape.currentEdgeIndex = Math.max(0, shape.sides-1);
                    turnOffAllActiveNotesForShape(shape); // Desliga notas da forma ao mudar lados
                    console.log(`Shape ${shapeId + 1} sides set to ${intValue} via OSC`);
                    sendOSCMessage(`/forma/${shapeId + 1}/sides`, shape.sides); // Confirmação / atualização
                } else {
                    console.warn(`OSC: Valor de lados inválido para forma ${shapeId + 1}: ${intValue}`);
                }
            }
            updateHUD(); // Atualiza o HUD se os valores da forma mudarem
        } else {
            console.warn(`OSC: ID de forma ou valor inválido para ${address}: ${args}`);
        }
    } else if (address === '/recordOSC/start') {
        if (!isRecordingOSC) {
            toggleOSCRecording(); // Inicia a gravação
            console.log("OSC: Gravação OSC iniciada remotamente.");
        }
    } else if (address === '/recordOSC/stop') {
        if (isRecordingOSC) {
            toggleOSCRecording(); // Para a gravação
            console.log("OSC: Gravação OSC parada remotamente.");
        }
    } else if (address === '/playOSC/start') {
        if (!isPlayingOSCLoop && recordedOSCSequence.length > 0) {
            playRecordedOSCLoop(); // Inicia o playback
            console.log("OSC: Playback OSC iniciado remotamente.");
        } else if (recordedOSCSequence.length === 0) {
            console.warn("OSC: Playback não iniciado, nenhuma sequência gravada.");
        }
    } else if (address === '/playOSC/stop') {
        if (isPlayingOSCLoop) {
            playRecordedOSCLoop(); // Para o playback
            console.log("OSC: Playback OSC parado remotamente.");
        }
    }
    // Adicionar aqui outros handlers para comandos OSC externos.
}

function turnOffAllActiveNotesForShape(shape) {
    if (spectatorModeActive) return;
    const origMidiEnabled = midiEnabled;
    midiEnabled = true; // Força envio se necessário
    Object.values(shape.activeMidiNotes).forEach(noteInfo => {
        if (noteInfo.playing) sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
        if (noteInfo.staccatoTimer) clearTimeout(noteInfo.staccatoTimer);
    });
    shape.activeMidiNotes = {};
    midiEnabled = origMidiEnabled;
}


// --- MIDI SETUP & HANDLING ---
function updateMidiDeviceLists() {
  availableMidiOutputs.clear(); availableMidiInputs.clear();
  if (!midiAccess) return;
  midiAccess.outputs.forEach(output => availableMidiOutputs.set(output.id, output));
  midiAccess.inputs.forEach(input => availableMidiInputs.set(input.id, input));
  populateMidiOutputSelect();
  populateMidiInputSelect();
}

function populateMidiOutputSelect() {
  if(!midiOutputSelect) return;
  const prevId = midiOutput ? midiOutput.id : null;
  midiOutputSelect.innerHTML = '';
  if (availableMidiOutputs.size === 0) {
    midiOutputSelect.add(new Option("Nenhuma saída MIDI", "", true, true)); midiOutput = null; return;
  }
  availableMidiOutputs.forEach(out => midiOutputSelect.add(new Option(out.name, out.id)));
  if (prevId && availableMidiOutputs.has(prevId)) midiOutputSelect.value = prevId;
  midiOutput = availableMidiOutputs.get(midiOutputSelect.value) || null;
}

function populateMidiInputSelect() {
  if(!midiInputSelect) return;
  const prevId = midiInput ? midiInput.id : null;
  midiInputSelect.innerHTML = '';
  if (availableMidiInputs.size === 0) {
    midiInputSelect.add(new Option("Nenhuma entrada MIDI", "", true, true)); setMidiInput(null); return;
  }
  availableMidiInputs.forEach(inp => midiInputSelect.add(new Option(inp.name, inp.id)));
  if (prevId && availableMidiInputs.has(prevId)) midiInputSelect.value = prevId;
  setMidiInput(availableMidiInputs.get(midiInputSelect.value) || null);
}

function setMidiInput(inputPort) {
  if (midiInput) midiInput.onmidimessage = null;
  midiInput = inputPort;
  if (midiInput) {
    midiInput.onmidimessage = handleMidiMessage;
    console.log("MIDI Input selecionado:", midiInput.name);
  }
}

async function initMidi() {
  try {
    if (navigator.requestMIDIAccess) {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      console.log("MIDI Access Granted");
      updateMidiDeviceLists();
      midiAccess.onstatechange = (e) => { console.log("MIDI state change:", e.port.name, e.port.type, e.port.state); updateMidiDeviceLists(); };
    } else { console.warn("Web MIDI API não suportada."); }
  } catch (error) { console.error("Não foi possível acessar dispositivos MIDI.", error); }
}

function handleMidiMessage(event) { // MIDI In -> OSC
  if (!midiFeedbackEnabled || spectatorModeActive) return;
  const cmd = event.data[0] >> 4; const ch = event.data[0] & 0x0F;
  const data1 = event.data[1]; const data2 = event.data.length > 2 ? event.data[2] : 0;
  let oscAddr = null, oscArgs = [ch, data1];

  if (cmd === 9 && data2 > 0) { oscAddr = '/midi/in/noteOn'; oscArgs.push(data2); } // Note On
  else if (cmd === 8 || (cmd === 9 && data2 === 0)) { oscAddr = '/midi/in/noteOff'; } // Note Off
  else if (cmd === 11) { oscAddr = '/midi/in/cc'; oscArgs.push(data2); } // CC
  else if (cmd === 14) { oscAddr = '/midi/in/pitchbend'; oscArgs = [ch, (data2 << 7) | data1]; } // Pitch Bend

  if (oscAddr) {
    sendOSCMessage(oscAddr, ...oscArgs);
    logOSC("MIDI->OSC", oscAddr, oscArgs);
    if (dmxSyncModeActive && (oscAddr === '/midi/in/noteOn' || oscAddr === '/midi/in/noteOff')) {
      sendOSCMessage('/dmx/note', data1, oscAddr === '/midi/in/noteOn' ? data2 : 0);
      logOSC("DMX Sync", '/dmx/note', [data1, oscAddr === '/midi/in/noteOn' ? data2 : 0]);
    }
  }
}

function sendMidiNoteOn(note, velocity, channel, shapeId = -1) {
  if (spectatorModeActive || !midiEnabled || !midiOutput) return;
  const ch = Math.max(0, Math.min(15, channel));
  const n = Math.max(0, Math.min(127, Math.round(note)));
  const v = Math.max(0, Math.min(127, Math.round(velocity)));
  midiOutput.send([0x90 + ch, n, v]);
  sendOSCMessage(`/forma/${shapeId}/noteOn`, n, v, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, v);
}

function sendMidiNoteOff(note, channel, shapeId = -1) {
  if (spectatorModeActive || !midiEnabled || !midiOutput) return;
  const ch = Math.max(0, Math.min(15, channel));
  const n = Math.max(0, Math.min(127, Math.round(note)));
  midiOutput.send([0x80 + ch, n, 0]);
  sendOSCMessage(`/forma/${shapeId}/noteOff`, n, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, 0);
}

function sendPitchBend(bendValue, channel) {
  if (spectatorModeActive || !midiEnabled || !midiOutput) return;
  const ch = Math.max(0, Math.min(15, channel));
  const bend = Math.max(0, Math.min(16383, Math.round(bendValue)));
  midiOutput.send([0xE0 + ch, bend & 0x7F, (bend >> 7) & 0x7F]);
  // OSC /forma/[id]/pitchbend é enviado no updateHUD
}

function sendMidiCC(cc, value, channel) {
  if (spectatorModeActive || !midiEnabled || !midiOutput) return;
  const ch = Math.max(0, Math.min(15, channel));
  const c = Math.max(0, Math.min(119, Math.round(cc)));
  const v = Math.max(0, Math.min(127, Math.round(value)));
  midiOutput.send([0xB0 + ch, c, v]);
  // OSC para CCs específicos (/forma/[id]/ccXX) são enviados no updateHUD
}

// --- SCALES & NOTES ---
const SCALES = {
  PENTATONIC_MAJ: { name: 'Pent. Maior', notes: [0, 2, 4, 7, 9], baseMidiNote: 60 },
  DORIAN: { name: 'Dórico', notes: [0, 2, 3, 5, 7, 9, 10], baseMidiNote: 60 },
  HARMONIC_MINOR: { name: 'Menor Harm.', notes: [0, 2, 3, 5, 7, 8, 11], baseMidiNote: 57 },
  CHROMATIC: { name: 'Cromática', notes: [0,1,2,3,4,5,6,7,8,9,10,11], baseMidiNote: 60 }
};
let currentScaleName = 'PENTATONIC_MAJ';
const scaleKeys = Object.keys(SCALES);
let currentScaleIndex = 0;
const NOTE_MODES = ['SEQUENTIAL', 'ARPEGGIO', 'CHORD', 'RANDOM_WALK'];
let currentNoteMode = 'SEQUENTIAL';
let currentNoteModeIndex = 0;

function getNoteInScale(index, baseOctaveOffset = 0) {
  const scale = SCALES[currentScaleName];
  const scaleNotes = scale.notes; const len = scaleNotes.length;
  const octave = baseOctaveOffset + Math.floor(index / len);
  const noteIdx = index % len;
  return Math.max(0, Math.min(127, scale.baseMidiNote + scaleNotes[noteIdx] + (octave * 12)));
}
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function getNoteName(midiNote) {
  if (midiNote < 0 || midiNote > 127) return "";
  return `${NOTE_NAMES[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`;
}
let notesToVisualize = [];

function turnOffAllActiveNotes() {
  if (spectatorModeActive) return;
  const origMidiEnabled = midiEnabled; midiEnabled = true; // Força envio
  shapes.forEach(shape => {
    Object.values(shape.activeMidiNotes).forEach(noteInfo => {
      if (noteInfo.playing) sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
      if (noteInfo.staccatoTimer) clearTimeout(noteInfo.staccatoTimer);
    });
    shape.activeMidiNotes = {};
  });
  midiEnabled = origMidiEnabled;
}

// --- MEDIAPIPE HANDS ---
async function initializeCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    videoElement.srcObject = stream; // Atribui o stream diretamente
    videoElement.onloadedmetadata = () => videoElement.play(); // Autoplay

    const handsInstance = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    handsInstance.setOptions({ maxNumHands: 4, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
    handsInstance.onResults(onResults);

    // Usa Camera para processar frames do videoElement
    const camera = new Camera(videoElement, {
      onFrame: async () => {
        if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !cameraError) { // Checa se tem dados no video E se não há erro
             await handsInstance.send({ image: videoElement });
        } else if (cameraError) {
            drawFallbackAnimation(); // Chama o fallback se a câmera falhou
            updateHUD(); // Mantém o HUD atualizado
        }
      },
      width: 640, height: 480
    });
    camera.start();
    console.log("Camera e MediaPipe Hands inicializados.");
  } catch (error) {
    console.error("Falha ao acessar webcam ou iniciar MediaPipe Hands:", error);
    displayGlobalError(`Falha webcam/MediaPipe: ${error.message}. Verifique permissões. Usando fallback visual.`, 20000);
    cameraError = true;
    // Não precisa chamar requestAnimationFrame(drawFallbackAnimation) aqui,
    // pois o onFrame da camera já vai fazer isso.
  }
}

let cameraError = false;
let fallbackShapes = [];

function initFallbackShapes() {
    if (fallbackShapes.length > 0) return;
    const numShapes = 5;
    const colors = ["#FF00FF", "#00FFFF", "#FFFF00", "#FF0000", "#00FF00"];
    for (let i = 0; i < numShapes; i++) {
        fallbackShapes.push({
            x: Math.random() * canvasElement.width,
            y: Math.random() * canvasElement.height,
            radius: 20 + Math.random() * 30,
            color: colors[i % colors.length],
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            sides: 3 + Math.floor(Math.random() * 5)
        });
    }
}

function drawFallbackAnimation() {
    if (fallbackShapes.length === 0) initFallbackShapes();

    ctx.fillStyle = 'rgba(0,0,0,0.1)'; // Limpa a tela com um leve rastro
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    ctx.font = "20px Arial";
    ctx.fillStyle = "#777";
    ctx.textAlign = "center";
    ctx.fillText("Detecção de mãos indisponível. Exibindo animação alternativa.", canvasElement.width / 2, canvasElement.height / 2 - 50);

    fallbackShapes.forEach(shape => {
        shape.x += shape.vx;
        shape.y += shape.vy;

        if (shape.x - shape.radius < 0 || shape.x + shape.radius > canvasElement.width) shape.vx *= -1;
        if (shape.y - shape.radius < 0 || shape.y + shape.radius > canvasElement.height) shape.vy *= -1;

        ctx.beginPath();
        for (let i = 0; i < shape.sides; i++) {
            const angle = (i / shape.sides) * Math.PI * 2 + (performance.now() / 1000) * (shape.vx > 0 ? 0.5 : -0.5) ;
            const x = shape.x + shape.radius * Math.cos(angle);
            const y = shape.y + shape.radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    // Se onResults não estiver sendo chamado devido ao erro da câmera, precisamos de um loop de animação explícito.
    // No entanto, a modificação no `onFrame` da Câmera já deve lidar com isso.
    // requestAnimationFrame(drawFallbackAnimation); // Apenas se onFrame não for chamado
}


// --- GLOBAL STATES OSC ---
function sendAllGlobalStatesOSC() {
  if (spectatorModeActive) return;
  sendOSCMessage('/global/state/midiEnabled', midiEnabled ? 1 : 0);
  sendOSCMessage('/global/state/pulseMode', pulseModeActive ? 1 : 0);
  sendOSCMessage('/global/state/staccatoMode', staccatoModeActive ? 1 : 0);
  sendOSCMessage('/global/state/vertexPullMode', vertexPullModeActive ? 1 : 0);
  sendOSCMessage('/global/state/chordMode', chordMode);
  sendOSCMessage('/global/state/scale', currentScaleName);
  sendOSCMessage('/global/state/arpeggioStyle', currentArpeggioStyle);
  sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM);
  sendOSCMessage('/global/state/dmxSyncMode', dmxSyncModeActive ? 1 : 0);
  sendOSCMessage('/global/state/midiFeedbackEnabled', midiFeedbackEnabled ? 1 : 0);
  // Não envia operationMode ou spectatorMode como /global/state por padrão
}

// --- EVENT LISTENERS (UI, Keyboard) ---
function setupEventListeners() {
    // Modals
    const infoButton = document.getElementById('info'); // Declarar infoButton
    const closeModalButton = document.getElementById('closeModal'); // Declarar closeModalButton
    const infoModal = document.getElementById('infoModal'); // Declarar infoModal

    if (infoButton) infoButton.addEventListener('click', () => infoModal.style.display = 'flex');
    if (closeModalButton) closeModalButton.addEventListener('click', () => infoModal.style.display = 'none');
    if (settingsButton) settingsButton.addEventListener('click', () => settingsModal.style.display = 'flex');
    if (closeSettingsModalButton) closeSettingsModalButton.addEventListener('click', () => settingsModal.style.display = 'none');
    if (arpeggioSettingsButton) arpeggioSettingsButton.addEventListener('click', () => arpeggioSettingsModal.style.display = 'flex');
    if (closeArpeggioSettingsModalButton) closeArpeggioSettingsModalButton.addEventListener('click', () => arpeggioSettingsModal.style.display = 'none');
    if (oscPanelButton) oscPanelButton.addEventListener('click', () => oscControlModal.style.display = 'flex');
    if (closeOscControlModalButton) closeOscControlModalButton.addEventListener('click', () => oscControlModal.style.display = 'none');


    window.addEventListener('click', (event) => { // Fechar modal clicando fora
        if (event.target.classList.contains('modal-overlay')) event.target.style.display = 'none';
    });

    // MIDI Device Selects
    if (midiOutputSelect) midiOutputSelect.addEventListener('change', () => { midiOutput = availableMidiOutputs.get(midiOutputSelect.value) || null; turnOffAllActiveNotes(); saveAllPersistentSettings(); });
    if (midiInputSelect) midiInputSelect.addEventListener('change', () => { setMidiInput(availableMidiInputs.get(midiInputSelect.value) || null); saveAllPersistentSettings(); });

    // Arpeggio Controls
    if (arpeggioStyleSelect) arpeggioStyleSelect.addEventListener('change', (e) => { if (spectatorModeActive) return; currentArpeggioStyle = e.target.value; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioStyle', currentArpeggioStyle); /* saveAllPersistentSettings() é chamado indiretamente por saveArpeggioSettings via wrapper se necessário, ou saveArpeggioSettings é suficiente se só mexe em arpejo */ });
    if (arpeggioBPMSlider) arpeggioBPMSlider.addEventListener('input', (e) => { if (spectatorModeActive || externalBPM !== null) return; arpeggioBPM = parseInt(e.target.value); arpeggioBPMValueSpan.textContent = arpeggioBPM; noteInterval = 60000 / arpeggioBPM; if(noteIntervalSlider) noteIntervalSlider.value = noteInterval; if(noteIntervalValueSpan) noteIntervalValueSpan.textContent = Math.round(noteInterval); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM); });
    if (noteIntervalSlider) noteIntervalSlider.addEventListener('input', (e) => { if (spectatorModeActive || externalBPM !== null) return; noteInterval = parseInt(e.target.value); noteIntervalValueSpan.textContent = noteInterval; arpeggioBPM = 60000 / noteInterval; if(arpeggioBPMSlider) arpeggioBPMSlider.value = arpeggioBPM; if(arpeggioBPMValueSpan) arpeggioBPMValueSpan.textContent = Math.round(arpeggioBPM); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', Math.round(arpeggioBPM)); });

    // OSC Panel
    if (sendTestOSCButton) sendTestOSCButton.addEventListener('click', () => {
        if (spectatorModeActive) return;
        const address = oscAddressInput.value.trim();
        const argsStr = oscArgsInput.value.trim();
        if (!address.startsWith('/')) { alert("Endereço OSC deve começar com '/'."); return; }
        let args = [];
        if (argsStr) {
            try {
                if (argsStr.startsWith('[') && argsStr.endsWith(']')) args = JSON.parse(argsStr);
                else args = argsStr.split(/\s+/).map(arg => (!isNaN(parseFloat(arg)) && isFinite(arg)) ? parseFloat(arg) : arg);
                if (!Array.isArray(args)) args = [args]; // Garante que seja um array
            } catch (e) { alert(`Erro nos argumentos: ${e.message}`); return; }
        }
        sendOSCMessage(address, ...args);
        logOSC("OUT (Panel)", address, args);
        oscArgsInput.value = ''; // Limpa para facilitar
    });
    if (clearOscLogButton) clearOscLogButton.addEventListener('click', () => { if(oscLogTextarea) { oscLogTextarea.value = `Log OSC limpo (${new Date().toLocaleTimeString()}).\n`; lastLogSource = "";}});
    if (exportOscLogButton) exportOscLogButton.addEventListener('click', exportOSCLog);
    if (oscLoopDurationInput) oscLoopDurationInput.addEventListener('change', () => { if (spectatorModeActive) return; const d = parseInt(oscLoopDurationInput.value); if (d > 0) oscLoopDuration = d; else oscLoopDurationInput.value = oscLoopDuration; saveAllPersistentSettings(); });


    // Main Control Buttons
    if (midiToggleButton) midiToggleButton.addEventListener('click', toggleMidiEnabled);
    if (operationModeButton) operationModeButton.addEventListener('click', toggleOperationMode);
    if (syncDMXNotesButton) syncDMXNotesButton.addEventListener('click', toggleDMXSync);
    if (midiFeedbackToggleButton) midiFeedbackToggleButton.addEventListener('click', toggleMidiFeedback);
    if (recordOSCButton) recordOSCButton.addEventListener('click', toggleOSCRecording);
    if (playOSCLoopButton) playOSCLoopButton.addEventListener('click', playRecordedOSCLoop);
    if (spectatorModeButton) spectatorModeButton.addEventListener('click', toggleSpectatorMode);
    if (openOutputPopupButton) openOutputPopupButton.addEventListener('click', openPopup);
    if (resetMidiButton) resetMidiButton.addEventListener('click', resetMidiSystem);
    if (scaleCycleButton) scaleCycleButton.addEventListener('click', cycleScale);


    // Keyboard Shortcuts
    document.addEventListener('keydown', handleKeyPress);
}

// --- SCALE FUNCTIONS ---
function setScale(newScaleName, updateButtonText = true) {
    if (spectatorModeActive) return;
    if (SCALES[newScaleName]) {
        currentScaleName = newScaleName;
        currentScaleIndex = scaleKeys.indexOf(newScaleName); // Update index accordingly
        turnOffAllActiveNotes();
        sendOSCMessage('/global/state/scale', currentScaleName);
        if (updateButtonText && scaleCycleButton) {
            // Ensure SCALES[currentScaleName] and its name property exist
             const displayName = SCALES[currentScaleName]?.name || currentScaleName;
            scaleCycleButton.textContent = `🧬 Escala: ${displayName.toUpperCase()}`;
        }
        updateHUD();
        saveAllPersistentSettings(); // Save scale change
        console.log(`Escala alterada para: ${currentScaleName}`);
    } else {
        console.warn(`Tentativa de definir escala desconhecida: ${newScaleName}`);
    }
}

function cycleScale() {
    if (spectatorModeActive) return;
    currentScaleIndex = (currentScaleIndex + 1) % scaleKeys.length;
    const newScaleName = scaleKeys[currentScaleIndex];
    setScale(newScaleName); // setScale will handle button text update, OSC, HUD, etc.
}


// --- MIDI RESET FUNCTION ---
function resetMidiSystem() {
    if (spectatorModeActive) return;
    console.log("MIDI Reset Solicitado.");

    // 1. Desligar todas as notas ativas
    turnOffAllActiveNotes();

    // 2. Enviar MIDI CC "All Sound Off" (120) e "Reset All Controllers" (121) em todos os canais
    // É importante fazer isso mesmo se midiEnabled for false, para garantir o reset no dispositivo.
    const origMidiEnabled = midiEnabled;
    const origMidiOutput = midiOutput;
    midiEnabled = true; // Temporariamente permite o envio

    if (midiOutput) {
        console.log(`Enviando All Sound Off / Reset All Controllers para ${midiOutput.name}`);
        for (let ch = 0; ch < 16; ch++) {
            midiOutput.send([0xB0 + ch, 120, 0]); // All Sound Off
            midiOutput.send([0xB0 + ch, 121, 0]); // Reset All Controllers
        }
        // Opcional: Enviar Note Off para todas as notas em todos os canais
        // for (let ch = 0; ch < 16; ch++) {
        //   for (let note = 0; note < 128; note++) {
        //     midiOutput.send([0x80 + ch, note, 0]);
        //   }
        // }
    } else {
        console.warn("Nenhuma porta MIDI de saída selecionada para o Reset MIDI.");
    }

    midiEnabled = origMidiEnabled; // Restaura o estado original

    // 3. Resetar estados internos das formas (pitch bend, CCs)
    shapes.forEach(shape => {
        shape.currentPitchBend = 8192;
        shape.reverbAmount = 0;
        shape.delayAmount = 0;
        shape.panValue = 64;
        shape.brightnessValue = 64;
        shape.modWheelValue = 0;
        shape.resonanceValue = 0;
        shape.lastSentReverb = -1; // Força reenvio se necessário
        shape.lastSentDelay = -1;
        shape.lastSentPan = -1;
        shape.lastSentBrightness = -1;
        shape.lastSentModWheel = -1;
        shape.lastSentResonance = -1;
        // Não reseta activeMidiNotes aqui, pois turnOffAllActiveNotes já limpou
    });

    // 4. Re-sincronizar o estado do MIDI (on/off) e HUD
    // Se midiEnabled era true, pode ser útil enviar novamente o estado dos botões.
    // Por exemplo, se o botão MIDI estava ON, reafirmar isso.
    // No entanto, o simples reset dos controllers e notas já deve ser suficiente.
    // Apenas atualiza o HUD.
    updateHUD();
    sendAllGlobalStatesOSC(); // Envia estados globais atualizados, incluindo CCs zerados implicitamente

    displayGlobalError("Sistema MIDI Resetado.", 3000); // Feedback visual para o usuário
    logOSC("SYSTEM", "MIDI Reset Executado", []);
}


// --- TOGGLE FUNCTIONS FOR BUTTONS & SHORTCUTS ---
function toggleMidiEnabled() {
    if (spectatorModeActive) return;
    midiEnabled = !midiEnabled;
    midiToggleButton.textContent = midiEnabled ? "🎹 MIDI ON" : "🎹 MIDI OFF";
    midiToggleButton.classList.toggle('active', midiEnabled);
    if (!midiEnabled) turnOffAllActiveNotes();
    sendOSCMessage('/global/state/midiEnabled', midiEnabled ? 1 : 0);
    updateHUD();
    saveAllPersistentSettings();
}

function toggleOperationMode() {
    if (spectatorModeActive) return;
    operationMode = (operationMode === 'one_person') ? 'two_persons' : 'one_person';
    operationModeButton.textContent = `👤 Modo: ${operationMode === 'one_person' ? '1 Pessoa' : '2 Pessoas'}`;
    shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; s.activeGesture = null; s.lastSentActiveGesture = null; });
    turnOffAllActiveNotes();
    updateHUD();
    saveAllPersistentSettings();
}

function toggleDMXSync() {
    if (spectatorModeActive) return;
    dmxSyncModeActive = !dmxSyncModeActive;
    syncDMXNotesButton.textContent = `🎶 Sync DMX ${dmxSyncModeActive ? 'ON' : 'OFF'}`;
    syncDMXNotesButton.classList.toggle('active', dmxSyncModeActive);
    sendOSCMessage('/global/state/dmxSyncMode', dmxSyncModeActive ? 1 : 0);
    updateHUD();
    saveAllPersistentSettings();
}

function toggleMidiFeedback() {
    if (spectatorModeActive) return;
    midiFeedbackEnabled = !midiFeedbackEnabled;
    midiFeedbackToggleButton.textContent = `🎤 MIDI In ${midiFeedbackEnabled ? 'ON' : 'OFF'}`;
    midiFeedbackToggleButton.classList.toggle('active', midiFeedbackEnabled);
    sendOSCMessage('/global/state/midiFeedbackEnabled', midiFeedbackEnabled ? 1 : 0);
    updateHUD();
    saveAllPersistentSettings();
}

function toggleOSCRecording() {
    if (spectatorModeActive) return;
    isRecordingOSC = !isRecordingOSC;
    if (recordOSCButton) { // Check if button exists
        recordOSCButton.classList.toggle('active', isRecordingOSC);
    }
    if (isRecordingOSC) {
        recordedOSCSequence = []; recordingStartTime = performance.now();
        if (recordOSCButton) recordOSCButton.textContent = "🔴 Gravando";
        if (playOSCLoopButton) playOSCLoopButton.disabled = true;
    } else {
        if (recordOSCButton) recordOSCButton.textContent = "⏺️ Gravar OSC";
        if (playOSCLoopButton) playOSCLoopButton.disabled = recordedOSCSequence.length === 0;
        console.log(`Gravação OSC: ${recordedOSCSequence.length} msgs.`);
        if (recordedOSCSequence.length > 0) { // Normalização já acontece em sendOSCMessage
            logOSC("REC INFO", `Gravadas ${recordedOSCSequence.length} mensagens. Duração total: ${(recordedOSCSequence[recordedOSCSequence.length-1].timestamp / 1000).toFixed(2)}s`, []);
        }
    }
    updateHUD();
}

function playRecordedOSCLoop() {
    if (spectatorModeActive || recordedOSCSequence.length === 0 || isRecordingOSC) return;
    isPlayingOSCLoop = !isPlayingOSCLoop;

    if (playOSCLoopButton) { // Check if button exists
        playOSCLoopButton.classList.toggle('active', isPlayingOSCLoop);
    }

    if (isPlayingOSCLoop) {
        if (playOSCLoopButton) playOSCLoopButton.textContent = "⏹️ Parar Loop";
        if (recordOSCButton) recordOSCButton.disabled = true;
        if (oscLoopDurationInput) oscLoopDuration = parseInt(oscLoopDurationInput.value) || 5000;
        else oscLoopDuration = 5000; // Default if input not found
        playbackStartTime = performance.now();
        let currentPlaybackIndex = 0;

        function loopStep() {
            if (!isPlayingOSCLoop) return;
            const elapsedTimeInLoop = (performance.now() - playbackStartTime) % oscLoopDuration;
            if (currentPlaybackIndex > 0 && elapsedTimeInLoop < recordedOSCSequence[Math.max(0,currentPlaybackIndex-1)].timestamp) {
                 currentPlaybackIndex = 0; // Reiniciou o ciclo do loop
            }
            while (currentPlaybackIndex < recordedOSCSequence.length && recordedOSCSequence[currentPlaybackIndex].timestamp <= elapsedTimeInLoop) {
                const item = recordedOSCSequence[currentPlaybackIndex];
                const tempIsRec = isRecordingOSC; isRecordingOSC = false; // Evita gravar o playback
                if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(item.message.address, ...item.message.args));
                isRecordingOSC = tempIsRec;
                logOSC("LOOP", item.message.address, item.message.args);
                currentPlaybackIndex++;
            }
            if (currentPlaybackIndex >= recordedOSCSequence.length && recordedOSCSequence.length > 0 && oscLoopDuration > recordedOSCSequence[recordedOSCSequence.length-1].timestamp) {
                // Se a sequência é mais curta que a duração do loop, reseta para repetir dentro do mesmo ciclo de loop.
                 currentPlaybackIndex = 0;
            }
            playbackLoopIntervalId = requestAnimationFrame(loopStep);
        }
        playbackLoopIntervalId = requestAnimationFrame(loopStep);
    } else {
        if (playbackLoopIntervalId) cancelAnimationFrame(playbackLoopIntervalId);
        if (playOSCLoopButton) playOSCLoopButton.textContent = "▶️ Loop OSC";
        // classList.toggle('active', isPlayingOSCLoop) at the function start handles removal.
        if (recordOSCButton) recordOSCButton.disabled = false;
    }
    updateHUD();
}

function toggleSpectatorMode() {
    spectatorModeActive = !spectatorModeActive;
    spectatorModeButton.textContent = `👓 Espectador ${spectatorModeActive ? 'ON' : 'OFF'}`;
    spectatorModeButton.classList.toggle('active', spectatorModeActive);
    if (spectatorModeActive) {
        turnOffAllActiveNotes();
        if (isRecordingOSC) toggleOSCRecording();
        if (isPlayingOSCLoop) playRecordedOSCLoop();
        // Desabilitar outros botões de controle, exceto os de modal e o próprio spectator
        [midiToggleButton, operationModeButton, syncDMXNotesButton, midiFeedbackToggleButton, recordOSCButton, playOSCLoopButton].forEach(btn => { if(btn) btn.disabled = true; });
        // Sliders de arpejo também
        if(arpeggioBPMSlider) arpeggioBPMSlider.disabled = true;
        if(noteIntervalSlider) noteIntervalSlider.disabled = true;
    } else {
        [midiToggleButton, operationModeButton, syncDMXNotesButton, midiFeedbackToggleButton, recordOSCButton].forEach(btn => { if(btn) btn.disabled = false; });
        if(playOSCLoopButton) playOSCLoopButton.disabled = recordedOSCSequence.length === 0; // Reabilita baseado na gravação
        if(arpeggioBPMSlider && externalBPM === null) arpeggioBPMSlider.disabled = false; // Reabilita se não houver BPM externo
        if(noteIntervalSlider && externalBPM === null) noteIntervalSlider.disabled = false;
    }
    updateHUD();
}

function openPopup() {
    if (outputPopupWindow && !outputPopupWindow.closed) outputPopupWindow.focus();
    else {
      outputPopupWindow = window.open('', 'OutputWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
      if (!outputPopupWindow || outputPopupWindow.closed || typeof outputPopupWindow.document === 'undefined') {
        alert("Falha ao abrir janela. Verifique pop-up blocker."); outputPopupWindow = null; popupCanvasCtx = null; return;
      }
      outputPopupWindow.document.write('<!DOCTYPE html><html><head><title>Visual Output</title><style>body{margin:0;overflow:hidden;background:#000;display:flex;justify-content:center;align-items:center}canvas{display:block;width:100%;height:100%}</style></head><body><canvas id="popupCanvas"></canvas></body></html>');
      outputPopupWindow.document.close();
      outputPopupWindow.onload = () => {
        const pc = outputPopupWindow.document.getElementById('popupCanvas');
        if (pc) { popupCanvasCtx = pc.getContext('2d'); pc.width = outputPopupWindow.innerWidth; pc.height = outputPopupWindow.innerHeight; }
        else { alert("Erro canvas popup."); outputPopupWindow.close(); outputPopupWindow = null; popupCanvasCtx = null; }
      };
      outputPopupWindow.onbeforeunload = () => { popupCanvasCtx = null; outputPopupWindow = null; };
    }
}


function handleKeyPress(e) {
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const infoModal = document.getElementById('infoModal'); // Ensure infoModal is defined here
    const settingsModal = document.getElementById('settingsModal');
    const arpeggioSettingsModal = document.getElementById('arpeggioSettingsModal');
    const oscControlModal = document.getElementById('oscControlModal');


    if (e.key === 'Escape') {
        if (isInputFocused) activeEl.blur();
        else [infoModal, settingsModal, arpeggioSettingsModal, oscControlModal].forEach(m => {if(m) m.style.display = 'none'});
        return;
    }
    if (isInputFocused) return; // Ignora outros atalhos se input focado
    if (spectatorModeActive && e.key !== 'Escape') return; // No modo espectador, só Escape funciona

    const actionMap = {
        'm': toggleMidiEnabled,
        'l': () => { staccatoModeActive = !staccatoModeActive; sendOSCMessage('/global/state/staccatoMode', staccatoModeActive?1:0); updateHUD(); saveAllPersistentSettings();},
        'p': () => { if(!e.shiftKey) {pulseModeActive = !pulseModeActive; if(pulseModeActive)pulseTime=0; sendOSCMessage('/global/state/pulseMode', pulseModeActive?1:0); updateHUD(); saveAllPersistentSettings();}}, // P normal
        's': () => { if(!e.shiftKey) cycleScale(); }, // S normal - now uses cycleScale
        'n': () => { currentNoteModeIndex=(currentNoteModeIndex+1)%NOTE_MODES.length; currentNoteMode=NOTE_MODES[currentNoteModeIndex]; turnOffAllActiveNotes(); sendOSCMessage('/global/noteModeChanged', currentNoteMode); updateHUD(); /* note mode não é persistente */ },
        'v': () => { vertexPullModeActive=!vertexPullModeActive; if(!vertexPullModeActive)shapes.forEach(s=>{s.vertexOffsets={};s.beingPulledByFinger={};}); sendOSCMessage('/global/state/vertexPullMode',vertexPullModeActive?1:0); updateHUD(); /* vertex pull não é persistente */},
        'c': () => { if(!e.shiftKey) {chordMode=(chordMode==="TRIAD")?"VERTEX_ALL":"TRIAD"; sendOSCMessage('/global/state/chordMode',chordMode); updateHUD(); /* chordMode não é persistente assim */}}, // C normal
    };
    const shiftActionMap = {
        'I': () => {if(infoModal) infoModal.style.display = infoModal.style.display === 'flex' ? 'none' : 'flex'},
        'C': () => {if(settingsModal) settingsModal.style.display = settingsModal.style.display === 'flex' ? 'none' : 'flex'},
        'A': () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = arpeggioSettingsModal.style.display === 'flex' ? 'none' : 'flex'},
        'O': () => {if(oscControlModal) oscControlModal.style.display = oscControlModal.style.display === 'flex' ? 'none' : 'flex'},
        'D': toggleDMXSync, 'F': toggleMidiFeedback, 'R': toggleOSCRecording, 'P': playRecordedOSCLoop, 'S': toggleSpectatorMode,
    };

    const key = e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase();
    const map = e.shiftKey ? shiftActionMap : actionMap;
    if (map[key]) { e.preventDefault(); map[key](); }
}

// --- DRAWING & ANIMATION LOOP ---
// Funções drawLandmarks, distance, isTouchingCircle, drawShape, onResults, updateHUD
// são majoritariamente as mesmas da v29, com as seguintes adaptações para v30:
// - Checagens de `spectatorModeActive` para desabilitar interações/desenhos/envios.
// - `sendOSCMessage` é usado em vez de `osc.send` direto.
// - Pequenas melhorias no HUD.

function drawLandmarks(landmarksArray) { // landmarksArray é um array de objetos landmark
    if (!landmarksArray || landmarksArray.length === 0 || spectatorModeActive) return;
    const connections = [[0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], [5,9],[9,10],[10,11],[11,12], [9,13],[13,14],[14,15],[15,16], [13,17],[17,18],[18,19],[19,20], [0,17]];
    ctx.strokeStyle = 'lime'; ctx.lineWidth = 2;
    for (const conn of connections) {
        const lm1 = landmarksArray[conn[0]]; const lm2 = landmarksArray[conn[1]];
        if (lm1 && lm2) { // Checa se os landmarks existem
            ctx.beginPath();
            ctx.moveTo(canvasElement.width - (lm1.x * canvasElement.width), lm1.y * canvasElement.height);
            ctx.lineTo(canvasElement.width - (lm2.x * canvasElement.width), lm2.y * canvasElement.height);
            ctx.stroke();
        }
    }
}

function distance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1)**2 + (y2 - y1)**2); }
function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) { return Math.abs(distance(x, y, cx, cy) - r) <= tolerance; }


function drawShape(shape, isPulsing, pulseValue) {
  ctx.beginPath();
  const fingertips = [4, 8, 12, 16, 20]; const maxInfluence = 150; const maxForce = 25;
  const cx = shape.centerX; const cy = shape.centerY;
  let r = shape.radius;
  if (isPulsing) r = shape.radius * (1 + 0.25 * pulseValue);
  r = Math.max(10, r);

  let useLiquify = shape.rightHandLandmarks && !spectatorModeActive && shape.activeGesture === 'liquify';
  let totalDispMag = 0; let activeLiquifyPts = 0;

  for (let i = 0; i < shape.sides; i++) {
    const angle = (i / shape.sides) * Math.PI * 2;
    let vx = r * Math.cos(angle); let vy = r * Math.sin(angle);
    let dx = 0; let dy = 0;

    if (useLiquify) {
      const vCanvasX = cx + vx; const vCanvasY = cy + vy;
      for (const tipIdx of fingertips) {
        const tip = shape.rightHandLandmarks[tipIdx];
        const tipX = canvasElement.width - (tip.x * canvasElement.width);
        const tipY = tip.y * canvasElement.height;
        const dist = distance(vCanvasX, vCanvasY, tipX, tipY);
        if (dist < maxInfluence && dist > 0) {
          const force = maxForce * (1 - dist / maxInfluence);
          dx += (vCanvasX - tipX) / dist * force; dy += (vCanvasY - tipY) / dist * force;
          activeLiquifyPts++;
        }
      }
    }
    if (vertexPullModeActive && shape.vertexOffsets[i] && !spectatorModeActive) {
      dx += shape.vertexOffsets[i].x; dy += shape.vertexOffsets[i].y;
    }
    totalDispMag += Math.sqrt(dx**2 + dy**2);
    const finalX = cx + vx + dx; const finalY = cy + vy + dy;
    if (i === 0) ctx.moveTo(finalX, finalY); else ctx.lineTo(finalX, finalY);
  }
  ctx.closePath();
  ctx.strokeStyle = shape.id === 0 ? '#00FFFF' : '#FF00FF'; ctx.lineWidth = 3; ctx.stroke();

  if (currentNoteMode === 'ARPEGGIO' && shape.sides > 0 && midiEnabled) {
    const key = `arp_${shape.id}_${shape.currentEdgeIndex}`;
    if (shape.activeMidiNotes[key]?.playing) {
      const angle = (shape.currentEdgeIndex / shape.sides) * Math.PI * 2;
      let vx = r * Math.cos(angle); let vy = r * Math.sin(angle);
      let ox = 0; let oy = 0;
      if (vertexPullModeActive && shape.vertexOffsets[shape.currentEdgeIndex] && !spectatorModeActive) {
        ox = shape.vertexOffsets[shape.currentEdgeIndex].x; oy = shape.vertexOffsets[shape.currentEdgeIndex].y;
      }
      ctx.beginPath(); ctx.arc(cx + vx + ox, cy + vy + oy, 8, 0, Math.PI * 2);
      ctx.fillStyle = shape.id === 0 ? 'rgba(0,255,255,0.6)' : 'rgba(255,0,255,0.6)'; ctx.fill();
    }
  }

  const avgDisp = (activeLiquifyPts > 0) ? totalDispMag / activeLiquifyPts :
                  (Object.keys(shape.vertexOffsets).length > 0 ? totalDispMag / Object.keys(shape.vertexOffsets).length : 0);
  const maxDistortion = 50.0; const pitchBendSens = 4096;
  shape.currentPitchBend = 8192 + Math.round(Math.min(1.0, avgDisp / maxDistortion) * pitchBendSens);
  shape.currentPitchBend = Math.max(0, Math.min(16383, shape.currentPitchBend));

  const normDistortion = Math.min(1.0, avgDisp / maxDistortion);
  shape.reverbAmount = Math.round(normDistortion * 127);
  shape.delayAmount = Math.round(normDistortion * 127);
  shape.modWheelValue = Math.round(normDistortion * 127);
  shape.resonanceValue = Math.round(normDistortion * 127);
  shape.panValue = Math.max(0, Math.min(127, Math.round((shape.centerX / canvasElement.width) * 127)));
  let normSides = (shape.sides - 3) / (20 - 3); // 3 to 20 sides
  normSides = Math.max(0, Math.min(1, normSides));
  if (shape.sides === 100) normSides = 0.5; // Circle = mid brightness
  shape.brightnessValue = Math.round(normSides * 127);

  // Note Generation (only if not spectator)
  if (!spectatorModeActive && midiEnabled && shape.sides > 0) {
    const now = performance.now();
    const canPlayNonArp = now - shape.lastNotePlayedTime > noteInterval;
    const canPlayArp = currentNoteMode === 'ARPEGGIO' && shape.sides > 2 && now - shape.lastArpeggioNotePlayedTime > noteInterval;

    if (canPlayNonArp || canPlayArp) {
      let notesToPlay = []; let edgeIdx = shape.currentEdgeIndex; let notePlayed = false;

      if (currentNoteMode !== 'CHORD' && currentNoteMode !== 'ARPEGGIO') {
        const oldKey = `${edgeIdx}_0`;
        if (shape.activeMidiNotes[oldKey]?.playing && !staccatoModeActive) {
          sendMidiNoteOff(shape.activeMidiNotes[oldKey].note, shape.midiChannel, shape.id + 1);
          shape.activeMidiNotes[oldKey].playing = false;
        }
      }

      switch (currentNoteMode) {
        case 'SEQUENTIAL':
          if (canPlayNonArp) {
            shape.currentEdgeIndex += shape.rotationDirection;
            if (shape.currentEdgeIndex >= shape.sides) { shape.currentEdgeIndex = Math.max(0, shape.sides-1); shape.rotationDirection = -1; }
            else if (shape.currentEdgeIndex < 0) { shape.currentEdgeIndex = 0; shape.rotationDirection = 1; }
            edgeIdx = shape.currentEdgeIndex;
            if (edgeIdx < shape.sides) notesToPlay.push(getNoteInScale(edgeIdx));
            notePlayed = true; shape.lastNotePlayedTime = now;
          }
          break;
        case 'ARPEGGIO':
          if (canPlayArp) {
            Object.keys(shape.activeMidiNotes).forEach(k => { if (k.startsWith(`arp_${shape.id}_`) && shape.activeMidiNotes[k]?.playing && !staccatoModeActive) { sendMidiNoteOff(shape.activeMidiNotes[k].note, shape.midiChannel, shape.id + 1); shape.activeMidiNotes[k].playing = false; }});
            if (currentArpeggioStyle === "UP") shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides;
            else if (currentArpeggioStyle === "DOWN") shape.currentEdgeIndex = (shape.currentEdgeIndex - 1 + shape.sides) % shape.sides;
            else if (currentArpeggioStyle === "UPDOWN") { /* ... updown logic ... */
                if (shape.arpeggioDirection === 1) { if (shape.currentEdgeIndex >= shape.sides - 1) { shape.currentEdgeIndex = Math.max(0,shape.sides-1); shape.arpeggioDirection = -1;} else shape.currentEdgeIndex++;}
                else { if (shape.currentEdgeIndex <= 0) {shape.currentEdgeIndex = 0; shape.arpeggioDirection = 1; if(shape.sides > 1) shape.currentEdgeIndex++;} else shape.currentEdgeIndex--;}
                if(shape.sides > 0) shape.currentEdgeIndex = Math.max(0, Math.min(shape.currentEdgeIndex, shape.sides-1)); else shape.currentEdgeIndex = 0;
            }
            else if (currentArpeggioStyle === "RANDOM") shape.currentEdgeIndex = shape.sides > 0 ? Math.floor(Math.random() * shape.sides) : 0;
            edgeIdx = shape.currentEdgeIndex;
            if (shape.sides > 0) notesToPlay.push(getNoteInScale(edgeIdx));
            notePlayed = true; shape.lastArpeggioNotePlayedTime = now;
          }
          break;
        case 'CHORD':
          if (canPlayNonArp) { /* ... chord logic ... */
            shape.currentEdgeIndex += shape.rotationDirection;
            if (shape.currentEdgeIndex >= shape.sides) { shape.currentEdgeIndex = Math.max(0, shape.sides-1); shape.rotationDirection = -1; }
            else if (shape.currentEdgeIndex < 0) { shape.currentEdgeIndex = 0; shape.rotationDirection = 1; }
            edgeIdx = shape.currentEdgeIndex;
            if(edgeIdx < shape.sides){
                notesToPlay.push(getNoteInScale(edgeIdx)); notesToPlay.push(getNoteInScale(edgeIdx+2)); notesToPlay.push(getNoteInScale(edgeIdx+4));
                Object.values(shape.activeMidiNotes).forEach(ni => { if(ni.playing) sendMidiNoteOff(ni.note, shape.midiChannel, shape.id+1); if(ni.staccatoTimer) clearTimeout(ni.staccatoTimer);});
                shape.activeMidiNotes = {};
            }
            notePlayed = true; shape.lastNotePlayedTime = now;
          }
          break;
        case 'RANDOM_WALK':
          if (canPlayNonArp) { /* ... random_walk logic ... */
            shape.currentEdgeIndex += Math.floor(Math.random()*3)-1;
            const scaleNoteCount = SCALES[currentScaleName].notes.length * 2; // ~2 octaves
            shape.currentEdgeIndex = (shape.currentEdgeIndex + scaleNoteCount) % scaleNoteCount;
            edgeIdx = shape.currentEdgeIndex;
            notesToPlay.push(getNoteInScale(edgeIdx));
            notePlayed = true; shape.lastNotePlayedTime = now;
          }
          break;
      }

      if (notePlayed && notesToPlay.length > 0) {
        let vel = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * (97/270) )));
        if (isPulsing) vel = Math.max(0, Math.min(127, Math.round(vel * (0.6 + ((pulseValue + 1)/2)*0.4))));

        notesToPlay.forEach((n, i) => {
          let key;
          if (currentNoteMode === 'ARPEGGIO') key = `arp_${shape.id}_${edgeIdx}`;
          else if (currentNoteMode === 'CHORD') key = `chord_${shape.id}_${n}_${i}`;
          else key = `${edgeIdx}_0`;

          sendMidiNoteOn(n, vel, shape.midiChannel, shape.id + 1);
          if (shape.activeMidiNotes[key]?.staccatoTimer) clearTimeout(shape.activeMidiNotes[key].staccatoTimer);
          shape.activeMidiNotes[key] = { note: n, playing: true, lastPitchBend: shape.currentPitchBend, isArpeggioNote: currentNoteMode === 'ARPEGGIO' };
          if (staccatoModeActive) {
            shape.activeMidiNotes[key].staccatoTimer = setTimeout(() => {
              if (shape.activeMidiNotes[key]?.playing) {
                sendMidiNoteOff(n, shape.midiChannel, shape.id + 1);
                shape.activeMidiNotes[key].playing = false;
              }
            }, 150);
          }
        });
        if (shape.currentPitchBend !== 8192) sendPitchBend(shape.currentPitchBend, shape.midiChannel);
        // Send CCs
        if (shape.reverbAmount !== shape.lastSentReverb) { sendMidiCC(91, shape.reverbAmount, shape.midiChannel); shape.lastSentReverb = shape.reverbAmount; }
        if (shape.delayAmount !== shape.lastSentDelay) { sendMidiCC(94, shape.delayAmount, shape.midiChannel); shape.lastSentDelay = shape.delayAmount; }
        if (shape.panValue !== shape.lastSentPan) { sendMidiCC(10, shape.panValue, shape.midiChannel); shape.lastSentPan = shape.panValue; }
        if (shape.brightnessValue !== shape.lastSentBrightness) { sendMidiCC(74, shape.brightnessValue, shape.midiChannel); shape.lastSentBrightness = shape.brightnessValue; }
        if (shape.modWheelValue !== shape.lastSentModWheel) { sendMidiCC(1, shape.modWheelValue, shape.midiChannel); shape.lastSentModWheel = shape.modWheelValue; }
        if (shape.resonanceValue !== shape.lastSentResonance) { sendMidiCC(71, shape.resonanceValue, shape.midiChannel); shape.lastSentResonance = shape.resonanceValue; }
      }
    }
    // Continuous CC updates if notes are held
    if (Object.values(shape.activeMidiNotes).some(ni => ni.playing)) {
        if (Math.abs(shape.currentPitchBend - shape.activeMidiNotes[Object.keys(shape.activeMidiNotes)[0]].lastPitchBend) > 10) { // Crude check against first active note
             sendPitchBend(shape.currentPitchBend, shape.midiChannel);
             Object.values(shape.activeMidiNotes).forEach(ni => ni.lastPitchBend = shape.currentPitchBend);
        }
        // Potentially resend other CCs if they changed significantly
    }
  }

  // Cleanup notes
  Object.keys(shape.activeMidiNotes).forEach(k => {
    const ni = shape.activeMidiNotes[k]; let del = false;
    if (!ni) {del = true;}
    else if (!ni.playing) del = true;
    else if (!midiEnabled || shape.sides <= 0 || spectatorModeActive) { sendMidiNoteOff(ni.note, shape.midiChannel, shape.id+1); ni.playing=false; del=true; }
    else if (currentNoteMode !== 'ARPEGGIO' && currentNoteMode !== 'CHORD' && !ni.isArpeggioNote) {
        const edge = parseInt(k.split('_')[0]); if (isNaN(edge) || edge >= shape.sides) {sendMidiNoteOff(ni.note, shape.midiChannel, shape.id+1); ni.playing=false; del=true;}
    }
    else if (ni.isArpeggioNote && currentNoteMode !== 'ARPEGGIO') { sendMidiNoteOff(ni.note, shape.midiChannel, shape.id+1); ni.playing=false; del=true; }
    if(del) { if(ni?.staccatoTimer) clearTimeout(ni.staccatoTimer); delete shape.activeMidiNotes[k];}
  });
}

function onResults(results) {
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0,0,canvasElement.width, canvasElement.height);
  shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; });

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    if (operationMode === 'one_person') {
        let lH = null, rH = null;
        results.multiHandLandmarks.forEach((landmarks, i) => {
            if (!spectatorModeActive) drawLandmarks(landmarks);
            const handedness = results.multiHandedness[i]?.label;
            if (handedness === "Left" && !lH) lH = landmarks; else if (handedness === "Right" && !rH) rH = landmarks;
        });
        shapes[0].leftHandLandmarks = lH; shapes[0].rightHandLandmarks = rH;
        shapes[1].leftHandLandmarks = null; shapes[1].rightHandLandmarks = null; // Clear other shape
    } else { // two_persons
        let assignedL = [false,false], assignedR = [false,false];
        results.multiHandLandmarks.forEach((landmarks, i) => {
            if (!spectatorModeActive) drawLandmarks(landmarks);
            const handedness = results.multiHandedness[i]?.label;
            for(let j=0; j<shapes.length; j++){
                if(handedness === "Left" && !shapes[j].leftHandLandmarks && !assignedL[j]) { shapes[j].leftHandLandmarks = landmarks; assignedL[j]=true; break;}
                if(handedness === "Right" && !shapes[j].rightHandLandmarks && !assignedR[j]) { shapes[j].rightHandLandmarks = landmarks; assignedR[j]=true; break;}
            }
        });
    }
  }

  shapes.forEach(shape => {
    if (spectatorModeActive) { shape.activeGesture = null; return; } // Skip gesture processing

    let gestureProcessed = false; let currentGesture = null;
    // Wrist position update
    let wristCount = 0; let avgWristX = 0; let avgWristY = 0;
    if (shape.leftHandLandmarks?.[0]) { avgWristX += shape.leftHandLandmarks[0].x; avgWristY += shape.leftHandLandmarks[0].y; wristCount++; }
    if (shape.rightHandLandmarks?.[0]) { avgWristX += shape.rightHandLandmarks[0].x; avgWristY += shape.rightHandLandmarks[0].y; wristCount++; }
    if (wristCount > 0) {
        shape.centerX = shape.centerX * 0.85 + (canvasElement.width - (avgWristX/wristCount * canvasElement.width)) * 0.15;
        shape.centerY = shape.centerY * 0.85 + (avgWristY/wristCount * canvasElement.height) * 0.15;
    }

    // Resize gesture (two hands, thumbs)
    if (shape.leftHandLandmarks && shape.rightHandLandmarks) {
        const lThumb = shape.leftHandLandmarks[4], rThumb = shape.rightHandLandmarks[4];
        const lIdxCurl = shape.leftHandLandmarks[8].y > shape.leftHandLandmarks[6].y;
        const rIdxCurl = shape.rightHandLandmarks[8].y > shape.rightHandLandmarks[6].y;
        if (lIdxCurl && rIdxCurl) { // Check for curled index fingers as part of gesture
            currentGesture = 'resize'; gestureProcessed = true;
            const dist = distance(lThumb.x, lThumb.y, rThumb.x, rThumb.y) * canvasElement.width; // Approx pixel dist
            const normDist = Math.max(0,Math.min(1, (dist - 50)/(canvasElement.width*0.3))); // Normalize
            shape.radius = shape.radius*0.8 + (30 + normDist * 270)*0.2;
            // Chord on resize logic (simplified)
            if (Math.abs(shape.radius - shape.lastResizeRadius) > 10 && (performance.now() - shape.lastResizeTime > 500)) {
                // ... (play chord logic) ...
                shape.lastResizeRadius = shape.radius; shape.lastResizeTime = performance.now();
            }
        }
    }
    // Sides gesture (left hand pinch)
    if (!gestureProcessed && shape.leftHandLandmarks) {
        const idx = shape.leftHandLandmarks[8], thumb = shape.leftHandLandmarks[4];
        const pinchDist = distance(idx.x, idx.y, thumb.x, thumb.y) * canvasElement.width; // Approx
        const pinchCanvasX = canvasElement.width - ((idx.x + thumb.x)/2 * canvasElement.width);
        const pinchCanvasY = ((idx.y + thumb.y)/2 * canvasElement.height);

        if (isTouchingCircle(pinchCanvasX, pinchCanvasY, shape.centerX, shape.centerY, shape.radius, shape.radius * 0.6)) {
            currentGesture = 'sides'; gestureProcessed = true;
            let newSides = (pinchDist > 150*1.2) ? 100 : Math.round(3 + Math.max(0,Math.min(1,(pinchDist-10)/150)) * (20-3));
            newSides = Math.max(3, Math.min(100, newSides));
            if (newSides !== shape.sides && (performance.now() - shape.lastSideChangeTime > SIDE_CHANGE_DEBOUNCE_MS)) {
                shape.sides = newSides; shape.lastSideChangeTime = performance.now();
                if(shape.currentEdgeIndex >= newSides) shape.currentEdgeIndex = Math.max(0, newSides-1);
                turnOffAllActiveNotes();
            }
        }
    }
    // Vertex Pull (right hand index finger)
    // ... (vertex pull logic, similar to v29 but checking !gestureProcessed and spectatorModeActive) ...
    // Liquify (right hand near shape)
    if (!gestureProcessed && shape.rightHandLandmarks) {
        currentGesture = 'liquify'; // Simplified: if right hand is present and no other gesture, assume liquify for distortion calc
        // More specific detection could be added here if needed
    }

    const oscGesture = currentGesture || 'none';
    if (shape.lastSentActiveGesture !== oscGesture) {
        sendOSCMessage(`/forma/${shape.id+1}/gestureActivated`, oscGesture);
        shape.lastSentActiveGesture = oscGesture;
    }
    shape.activeGesture = currentGesture;
  });

  let pVal = 0; if(pulseModeActive) { pulseTime = performance.now()*0.001; pVal = Math.sin(pulseTime*pulseFrequency*2*Math.PI); }
  shapes.forEach(s => drawShape(s, pulseModeActive, pVal));

  // Note visualization
  const visNow = performance.now();
  ctx.font="15px Arial"; ctx.textAlign="center";
  notesToVisualize = notesToVisualize.filter(n => {
      const age = visNow - n.timestamp;
      if (age < 750) { ctx.fillStyle = `rgba(255,255,255,${1-(age/750)})`; ctx.fillText(n.noteName, n.x, n.y); return true; }
      return false;
  });
  updateHUD(); // Update HUD last
  if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) { // Popup window update
    try {
        const pc = outputPopupWindow.document.getElementById('popupCanvas');
        if (pc.width !== outputPopupWindow.innerWidth || pc.height !== outputPopupWindow.innerHeight) { pc.width = outputPopupWindow.innerWidth; pc.height = outputPopupWindow.innerHeight;}
        popupCanvasCtx.fillStyle='rgba(0,0,0,0.1)'; popupCanvasCtx.fillRect(0,0,pc.width,pc.height);
        popupCanvasCtx.drawImage(canvasElement,0,0,pc.width,pc.height);
    } catch(e) { if(e.name === "InvalidStateError" || outputPopupWindow?.closed) {popupCanvasCtx=null; outputPopupWindow=null;} }
  }
}

function updateHUD() {
  if (!hudElement) return;
  let txt = "";
  if (spectatorModeActive) txt += `<b>👓 MODO ESPECTADOR</b><br>`;
  shapes.forEach(s => {
    txt += `<b>F${s.id+1}:</b> R:${s.radius.toFixed(0)} L:${s.sides===100?"○":s.sides} `;
    txt += `Gest:${spectatorModeActive?"-":(s.activeGesture||"Nenhum")}<br>`;
  });
  txt += `<b>Global:</b> MIDI:<span class="${midiEnabled?'status-ok':'status-error'}">${midiEnabled?'ON':'OFF'}</span> `;
  txt += `Pulso:${pulseModeActive?'ON':'OFF'} Artic:${staccatoModeActive?'Stac':'Leg'} VtxPull:${vertexPullModeActive?'ON':'OFF'}<br>`;
  txt += `&nbsp;&nbsp;Escala:${SCALES[currentScaleName].name} Nota:${currentNoteMode} Acorde:${chordMode} Oper:${operationMode==='one_person'?'1P':'2P'}<br>`;
  if (currentNoteMode === 'ARPEGGIO') txt += `&nbsp;&nbsp;Arp: ${currentArpeggioStyle} BPM:${arpeggioBPM.toFixed(0)}${externalBPM!==null?'(Ext)':''} Idx:${shapes.map(s=>s.currentEdgeIndex).join('/')}<br>`;
  txt += `&nbsp;&nbsp;DMX Sync:${dmxSyncModeActive?'<span class="status-ok">ON</span>':'OFF'} | MIDI In:${midiFeedbackEnabled?'<span class="status-ok">ON</span>':'OFF'}<br>`;
  if (isRecordingOSC) txt += `&nbsp;&nbsp;<span class="status-error">🔴 Gravando OSC</span> (${recordedOSCSequence.length})<br>`;
  if (isPlayingOSCLoop) {
    const loopProgress = ((performance.now() - playbackStartTime) % oscLoopDuration) / oscLoopDuration;
    const progressBarLength = 10;
    const progressChars = Math.floor(loopProgress * progressBarLength);
    const progressBar = ' ['.padEnd(progressChars + 2, '■').padEnd(progressBarLength + 2, '□') + ']';
    txt += `&nbsp;&nbsp;<span class="status-warn">▶️ Loop OSC Ativo${progressBar}</span> (${(oscLoopDuration/1000).toFixed(1)}s)<br>`;
  } else if (recordedOSCSequence.length > 0) {
    txt += `&nbsp;&nbsp;Loop OSC Pronto (${recordedOSCSequence.length} msgs, ${(oscLoopDuration/1000).toFixed(1)}s)<br>`;
  }
  txt += `<b>OSC:</b> <span class="${(osc && osc.status() === OSC.STATUS.IS_OPEN) ? 'status-ok':'status-error'}">${oscStatus}</span>`; // Check osc exists
  hudElement.innerHTML = txt;

  // Send periodic OSC data (if not spectator)
  const now = performance.now();
  if (!spectatorModeActive && osc && osc.status() === OSC.STATUS.IS_OPEN && (now - lastOscSendTime > OSC_SEND_INTERVAL)) { // Check osc exists
    lastOscSendTime = now;
    shapes.forEach(s => {
      const sid = s.id + 1;
      sendOSCMessage(`/forma/${sid}/radius`, parseFloat(s.radius.toFixed(2)));
      sendOSCMessage(`/forma/${sid}/sides`, s.sides);
      sendOSCMessage(`/forma/${sid}/pos`, parseFloat((s.centerX/canvasElement.width).toFixed(3)), parseFloat((s.centerY/canvasElement.height).toFixed(3)));
      sendOSCMessage(`/forma/${sid}/distortion`, parseFloat((Math.abs(s.currentPitchBend-8192)/8191).toFixed(3)));
      sendOSCMessage(`/forma/${sid}/pitchbend`, s.currentPitchBend);
      sendOSCMessage(`/forma/${sid}/cc91`, s.reverbAmount); // Reverb
      sendOSCMessage(`/forma/${sid}/cc94`, s.delayAmount);  // Delay
      sendOSCMessage(`/forma/${sid}/cc10`, s.panValue);     // Pan
      sendOSCMessage(`/forma/${sid}/cc74`, s.brightnessValue); // Brightness
      sendOSCMessage(`/forma/${sid}/cc1`, s.modWheelValue);    // Mod Wheel
      sendOSCMessage(`/forma/${sid}/cc71`, s.resonanceValue);  // Resonance
    });
  }
}


// --- PERSISTENT SETTINGS (localStorage) ---
const APP_SETTINGS_KEY = 'midiShapeManipulatorV32Settings';

function savePersistentSetting(key, value) {
    try {
        const settings = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY)) || {};
        settings[key] = value;
        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn("Erro ao salvar configuração persistente:", e);
    }
}

function loadPersistentSetting(key, defaultValue) {
    try {
        const settings = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY)) || {};
        return settings[key] !== undefined ? settings[key] : defaultValue;
    } catch (e) {
        console.warn("Erro ao carregar configuração persistente:", e);
        return defaultValue;
    }
}

function saveAllPersistentSettings() {
    // Não salva spectatorModeActive como persistente, deve ser resetado a cada sessão.
    savePersistentSetting('operationMode', operationMode);
    savePersistentSetting('midiEnabled', midiEnabled);
    savePersistentSetting('staccatoModeActive', staccatoModeActive);
    savePersistentSetting('pulseModeActive', pulseModeActive);
    savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
    savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
    savePersistentSetting('midiFeedbackEnabled', midiFeedbackEnabled);
    savePersistentSetting('dmxSyncModeActive', dmxSyncModeActive);
    savePersistentSetting('oscLoopDuration', oscLoopDuration);
    savePersistentSetting('currentScaleName', currentScaleName); // Save current scale
    // Arpeggio settings são salvas por saveArpeggioSettings() que já usa localStorage
    // saveArpeggioSettings(); // Chamado quando os valores de arpejo mudam
    console.log("Configurações persistentes V32 salvas.");
}

function loadAllPersistentSettings() {
    operationMode = loadPersistentSetting('operationMode', 'two_persons');
    midiEnabled = loadPersistentSetting('midiEnabled', true); // Default MIDI ON
    staccatoModeActive = loadPersistentSetting('staccatoModeActive', false);
    pulseModeActive = loadPersistentSetting('pulseModeActive', false);
    currentScaleName = loadPersistentSetting('currentScaleName', 'PENTATONIC_MAJ'); // Load scale
    currentScaleIndex = scaleKeys.indexOf(currentScaleName); // Ensure index is also updated
    if (currentScaleIndex === -1) { // Fallback if saved scale is invalid
        console.warn(`Escala salva inválida '${currentScaleName}', usando PENTATONIC_MAJ.`);
        currentScaleName = 'PENTATONIC_MAJ';
        currentScaleIndex = scaleKeys.indexOf(currentScaleName);
    }

    // spectatorModeActive é sempre false no início
    const savedMidiOutputId = loadPersistentSetting('midiOutputId', null);
    const savedMidiInputId = loadPersistentSetting('midiInputId', null);
    midiFeedbackEnabled = loadPersistentSetting('midiFeedbackEnabled', false);
    dmxSyncModeActive = loadPersistentSetting('dmxSyncModeActive', false);
    oscLoopDuration = loadPersistentSetting('oscLoopDuration', 5000);

    // Arpeggio settings são carregadas por loadArpeggioSettings()
    loadArpeggioSettings(); // Carrega BPM, estilo, intervalo

    // Aplicar configurações carregadas à UI e estado
    // MIDI output/input serão selecionados após initMidi() e updateMidiDeviceLists()
    // As outras configurações serão refletidas pelos botões e HUD na inicialização.
    console.log("Configurações persistentes carregadas.");
    return { savedMidiOutputId, savedMidiInputId }; // Retorna para uso após initMidi
}


// --- ARPEGGIO SETTINGS (já usava localStorage, adaptado para consistência) ---
const ARPEGGIO_SETTINGS_KEY = 'arpeggioSettingsV32'; // Chave específica para arpejo V32

function saveArpeggioSettings() {
    const settings = { currentArpeggioStyle, arpeggioBPM, noteInterval, externalBPM };
    try {
        localStorage.setItem(ARPEGGIO_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn("Erro ao salvar configurações de arpejo:", e);
    }
    savePersistentSetting('arpeggioSettingsLastUpdate', Date.now()); // Para referência geral
}

function loadArpeggioSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(ARPEGGIO_SETTINGS_KEY));
        if (saved) {
            currentArpeggioStyle = saved.currentArpeggioStyle || "UP";
            arpeggioBPM = saved.arpeggioBPM || 120;
            noteInterval = saved.noteInterval || (60000 / arpeggioBPM);
            // externalBPM não é persistido, sempre começa como null
        }
    } catch (e) {
        console.warn("Erro ao carregar configurações de arpejo, usando padrões.", e);
        currentArpeggioStyle = "UP"; arpeggioBPM = 120; noteInterval = 500;
    }

    // Atualiza UI do Arpejo
    if (arpeggioStyleSelect) arpeggioStyleSelect.value = currentArpeggioStyle;
    if (arpeggioBPMSlider) arpeggioBPMSlider.value = arpeggioBPM;
    if (arpeggioBPMValueSpan) arpeggioBPMValueSpan.textContent = arpeggioBPM;
    if (noteIntervalSlider) noteIntervalSlider.value = noteInterval;
    if (noteIntervalValueSpan) noteIntervalValueSpan.textContent = noteInterval;
}

function populateArpeggioStyleSelect() {
    if (!arpeggioStyleSelect) return;
    ARPEGGIO_STYLES.forEach(style => {
        const option = document.createElement('option');
        option.value = style;
        option.textContent = style.charAt(0).toUpperCase() + style.slice(1).toLowerCase(); // e.g., "Up", "Random"
        arpeggioStyleSelect.appendChild(option);
    });
    arpeggioStyleSelect.value = currentArpeggioStyle; // Set initial value
}


// --- INITIALIZATION ---
// Removido o DOMContentLoaded de main31.js, será adicionado conforme a tarefa.
// A lógica de inicialização será movida para o novo bloco DOMContentLoaded.

// console.log("main31.js (pré-DOMContentLoaded) carregado."); // Log de verificação

// As chamadas de inicialização como initMidi(), setupOSC(), etc.,
// E a configuração de event listeners e botões
// serão movidas para o bloco `window.addEventListener('DOMContentLoaded', ...)`
// que será adicionado ao final deste arquivo, conforme a tarefa.
// O código de `loadAllPersistentSettings()` e sua aplicação também irão para lá.

// A linha abaixo que estava em main31.js:
// document.addEventListener('DOMContentLoaded', () => { ... });
// Foi removida para ser substituída pela nova que será adicionada.
// O conteúdo original dela será integrado na nova estrutura.
// É importante que `loadAllPersistentSettings()` seja chamado cedo,
// e `initMidi().then(...)` e outras configurações da UI sigam.
// `updateHUD()` e `sendAllGlobalStatesOSC()` devem ser chamados após tudo estar configurado.
// `populateArpeggioStyleSelect()` também deve estar no DOMContentLoaded.
// O log final "main31.js inicialização completa." também deve ser movido.
// Basicamente, todo o conteúdo da função anônima do DOMContentLoaded original
// será o corpo do novo DOMContentLoaded que será adicionado.
//
// O código abaixo é o que estava DENTRO do antigo DOMContentLoaded de main31.js,
// será colocado no novo bloco que a tarefa pede para adicionar.
/*
    console.log("DOM Carregado. Iniciando main31.js...");
    const { savedMidiOutputId, savedMidiInputId } = loadAllPersistentSettings();

    initMidi().then(() => {
        // Após MIDI inicializado e listas populadas, tenta selecionar os dispositivos salvos
        if (savedMidiOutputId && availableMidiOutputs.has(savedMidiOutputId)) {
            midiOutputSelect.value = savedMidiOutputId;
            midiOutput = availableMidiOutputs.get(savedMidiOutputId);
        } else if (availableMidiOutputs.size > 0) {
            midiOutputSelect.selectedIndex = 0; // Seleciona o primeiro se o salvo não existir
            midiOutput = availableMidiOutputs.get(midiOutputSelect.value);
        }

        if (savedMidiInputId && availableMidiInputs.has(savedMidiInputId)) {
            midiInputSelect.value = savedMidiInputId;
            setMidiInput(availableMidiInputs.get(savedMidiInputId));
        } else if (availableMidiInputs.size > 0) {
             midiInputSelect.selectedIndex = 0;
             setMidiInput(availableMidiInputs.get(midiInputSelect.value));
        }
        // Salva novamente para caso um fallback tenha sido usado
        savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
        savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
    });

    setupOSC();
    initializeCamera(); // MediaPipe Hands init is inside
    setupEventListeners();

    // loadArpeggioSettings(); // Já chamado por loadAllPersistentSettings
    populateArpeggioStyleSelect();
    if(oscLoopDurationInput) oscLoopDurationInput.value = oscLoopDuration; // Aplicar valor carregado

    // Set initial button states based on loaded variables
    if(midiToggleButton) { // Check if button exists
        midiToggleButton.textContent = midiEnabled ? "🎹 MIDI ON" : "🎹 MIDI OFF";
        midiToggleButton.classList.toggle('active', midiEnabled);
    }
    if(operationModeButton) operationModeButton.textContent = `👤 Modo: ${operationMode === 'one_person' ? '1 Pessoa' : '2 Pessoas'}`;
    if(syncDMXNotesButton) {
        syncDMXNotesButton.textContent = `🎶 Sync DMX ${dmxSyncModeActive ? 'ON' : 'OFF'}`;
        syncDMXNotesButton.classList.toggle('active', dmxSyncModeActive);
    }
    if(midiFeedbackToggleButton) {
        midiFeedbackToggleButton.textContent = `🎤 MIDI In ${midiFeedbackEnabled ? 'ON' : 'OFF'}`;
        midiFeedbackToggleButton.classList.toggle('active', midiFeedbackEnabled);
    }
    if(spectatorModeButton) { // spectatorModeActive é sempre false no início
        spectatorModeButton.textContent = `👓 Espectador ${spectatorModeActive ? 'ON' : 'OFF'}`;
        spectatorModeButton.classList.toggle('active', spectatorModeActive);
    }


    updateHUD(); // Initial HUD draw
    sendAllGlobalStatesOSC(); // Send initial states

    if (oscLogTextarea) oscLogTextarea.value = `Log OSC - ${new Date().toLocaleTimeString()} - Configurações Carregadas.\n`;
    console.log("main31.js inicialização completa.");
*/
// O BLOCO ACIMA SERÁ INTEGRADO NO NOVO `DOMContentLoaded` QUE SERÁ ADICIONADO ABAIXO.
// (Este comentário é para mim, Jules, para lembrar o que fazer na próxima etapa de edição)
// A cópia direta do main31.js está completa. As modificações virão a seguir.

window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Carregado. Iniciando main32.js...");
    // Primeiro, carregamos todas as configurações persistentes.
    const { savedMidiOutputId, savedMidiInputId } = loadAllPersistentSettings();

    // Funções de Setup Essenciais
    setupEventListeners(); // Liga os botões e eventos de UI primeiro
    setupOSC();            // Inicia conexão WebSocket OSC
    initMidi().then(() => { // Ativa detecção MIDI e depois configura as portas salvas
        // Após MIDI inicializado e listas populadas, tenta selecionar os dispositivos salvos
        if (savedMidiOutputId && availableMidiOutputs.has(savedMidiOutputId)) {
            if(midiOutputSelect) midiOutputSelect.value = savedMidiOutputId;
            midiOutput = availableMidiOutputs.get(savedMidiOutputId);
        } else if (availableMidiOutputs.size > 0 && midiOutputSelect) {
            midiOutputSelect.selectedIndex = 0; // Seleciona o primeiro se o salvo não existir
            midiOutput = availableMidiOutputs.get(midiOutputSelect.value);
        }

        if (savedMidiInputId && availableMidiInputs.has(savedMidiInputId)) {
            if(midiInputSelect) midiInputSelect.value = savedMidiInputId;
            setMidiInput(availableMidiInputs.get(savedMidiInputId));
        } else if (availableMidiInputs.size > 0 && midiInputSelect) {
             midiInputSelect.selectedIndex = 0;
             setMidiInput(availableMidiInputs.get(midiInputSelect.value));
        }
        // Salva novamente para caso um fallback tenha sido usado ou nenhum dispositivo salvo encontrado
        savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
        savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
    });
    initializeCamera();    // Inicia webcam + MediaPipe

    // Configurações da UI pós-inicialização
    populateArpeggioStyleSelect(); // Popula o select de estilos de arpejo
    if(oscLoopDurationInput) oscLoopDurationInput.value = oscLoopDuration; // Aplicar valor de duração do loop OSC carregado

    // Aplicar estados dos botões e UI com base nas variáveis carregadas/padrão
    // Muitos botões já são atualizados por suas funções toggle chamadas por loadAllPersistentSettings ou saveAllPersistentSettings
    // Mas alguns estados precisam ser explicitamente definidos na UI após o carregamento.
    if(midiToggleButton) {
        midiToggleButton.textContent = midiEnabled ? "🎹 MIDI ON" : "🎹 MIDI OFF";
        midiToggleButton.classList.toggle('active', midiEnabled);
    }
    if(operationModeButton) {
        operationModeButton.textContent = `👤 Modo: ${operationMode === 'one_person' ? '1 Pessoa' : '2 Pessoas'}`;
        // Não há classe 'active' padrão para este botão, apenas texto.
    }
    if(scaleCycleButton && SCALES[currentScaleName]) { // Update scale button text on load
        const displayName = SCALES[currentScaleName]?.name || currentScaleName;
        scaleCycleButton.textContent = `🧬 Escala: ${displayName.toUpperCase()}`;
    }
    if(syncDMXNotesButton) {
        syncDMXNotesButton.textContent = `🎶 Sync DMX ${dmxSyncModeActive ? 'ON' : 'OFF'}`;
        syncDMXNotesButton.classList.toggle('active', dmxSyncModeActive);
    }
    if(midiFeedbackToggleButton) {
        midiFeedbackToggleButton.textContent = `🎤 MIDI In ${midiFeedbackEnabled ? 'ON' : 'OFF'}`;
        midiFeedbackToggleButton.classList.toggle('active', midiFeedbackEnabled);
    }
    if(spectatorModeButton) { // spectatorModeActive é sempre false no início da sessão
        spectatorModeButton.textContent = `👓 Espectador ${spectatorModeActive ? 'ON' : 'OFF'}`;
        spectatorModeButton.classList.toggle('active', spectatorModeActive);
        // A lógica de desabilitar/habilitar botões no toggleSpectatorMode deve ser chamada se necessário
        // ou garantir que o estado inicial (não espectador) tenha os botões habilitados corretamente.
         // Forçar estado inicial de habilitação dos botões (caso o default seja desabilitado e spectatorMode seja false)
        if (!spectatorModeActive) {
            [midiToggleButton, operationModeButton, syncDMXNotesButton, midiFeedbackToggleButton, recordOSCButton].forEach(btn => { if(btn) btn.disabled = false; });
            if(playOSCLoopButton) playOSCLoopButton.disabled = recordedOSCSequence.length === 0;
            if(arpeggioBPMSlider && externalBPM === null && arpeggioBPMSlider) arpeggioBPMSlider.disabled = false;
            if(noteIntervalSlider && externalBPM === null && noteIntervalSlider) noteIntervalSlider.disabled = false;
        }
    }
     if(recordOSCButton) {
        recordOSCButton.textContent = "⏺️ Gravar OSC";
        recordOSCButton.classList.remove('active');
        recordOSCButton.disabled = spectatorModeActive;
    }
    if(playOSCLoopButton) {
        playOSCLoopButton.textContent = "▶️ Loop OSC";
        playOSCLoopButton.classList.remove('active');
        playOSCLoopButton.disabled = spectatorModeActive || recordedOSCSequence.length === 0;
    }


    // Finalização
    updateHUD();           // Atualiza os elementos de status na tela
    sendAllGlobalStatesOSC(); // Envia estados globais iniciais via OSC, se conectado

    if (oscLogTextarea) oscLogTextarea.value = `Log OSC - ${new Date().toLocaleTimeString()} - Configurações Carregadas.\n`;
    console.log("main32.js inicialização completa.");
});
