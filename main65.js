// ==========================================================================
// MIDI SHAPE MANIPULATOR v62 - main62.js
// ==========================================================================

// Declarações globais para audioCtx e simpleSynth, gerenciadas neste arquivo.
let audioCtx = null;
let simpleSynth = null;
let _internalAudioEnabledMaster = false; // Inicia como false, o usuário deve ativar.

// === DEBUGGING ===
const DEBUG_MODE = false; // Defina como false para desabilitar logs de debug
function logDebug(message, data = null) {
  if (DEBUG_MODE) {
    const timestamp = new Date().toLocaleTimeString();
    if (data !== null) {
      console.log(`[DEBUG ${timestamp}] ${message}`, data);
    } else {
      console.log(`[DEBUG ${timestamp}] ${message}`);
    }
  }
}

// === GLOBAL VARIABLES & CONSTANTS ===
const sidebar = document.getElementById('sidebar');
const sidebarHandle = document.getElementById('sidebarHandle');
const mainCanvasContainer = document.getElementById('mainCanvasContainer');

const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
let ctx = canvasElement.getContext('2d');

let hasWebGL2 = false;

class Shape {
  constructor(id, midiChannel) {
    this.id = id;
    this.centerX = canvasElement ? canvasElement.width / (this.id === 0 ? 4 : 1.333) : 320;
    this.centerY = canvasElement ? canvasElement.height / 2 : 240;
    this.radius = 100;
    this.sides = 100;
    this.distortionFactor = 0;
    this.activeMidiNotes = {};
    this.midiChannel = midiChannel;
    this.leftHandLandmarks = null;
    this.rightHandLandmarks = null;
    this.pinchDistance = 0;
    this.lastSideChangeTime = 0;
    this.activeGesture = null;
    this.currentPitchBend = 8192;
    this.reverbAmount = 0; this.delayAmount = 0; this.panValue = 64;
    this.brightnessValue = 64; this.modWheelValue = 0; this.resonanceValue = 0;
    this.lastSentReverb = -1; this.lastSentDelay = -1; this.lastSentPan = -1;
    this.lastSentBrightness = -1; this.lastSentModWheel = -1; this.lastSentResonance = -1;
    this.vertexOffsets = {};
    this.beingPulledByFinger = {};
    this.rotationDirection = 1;
    this.currentEdgeIndex = 0;
    this.lastNotePlayedTime = 0;
    this.lastResizeRadius = this.radius;
    this.lastResizeTime = 0;
    this.lastSentActiveGesture = null;
    this.arpeggioDirection = 1; // 1 para up/forward, -1 para down/backward
    this.lastArpeggioNotePlayedTime = 0;
    this.currentChordStepIndex = 0; // Para o novo modo CHORD sequencial
    this.arpSwingStep = 0; // V63: Para controle de Swing
  }
}

const shapes = [new Shape(0, 0), new Shape(1, 1)];

let operationMode = 'two_persons';
const SIDE_CHANGE_DEBOUNCE_MS = 200;
let pulseModeActive = false;
let pulseTime = 0;
let pulseFrequency = 0.5;
let midiEnabled = true;
let staccatoModeActive = false;
let vertexPullModeActive = false;
// let chordMode = "TRIAD"; // Esta variável não parece ser usada ativamente para o modo CHORD. O modo é determinado por currentNoteMode.

let currentArpeggioStyle = "UP"; // Será atualizado pelo select no HTML
const ARPEGGIO_STYLES = ["UP", "DOWN", "UPDOWN", "RANDOM"];
let arpeggioBPM = 120;
let noteInterval = 60000 / arpeggioBPM; // Intervalo base para notas não-arpejo e para o "tick" do arpejador
let externalBPM = null;

// V63: Arpeggiator Variations
let arpRandomness = 0; // 0-100%
let arpSwing = 0; // 0-100%
let arpGhostNoteChance = 0; // 0-100%

let osc;
let oscStatus = "OSC Desconectado";

// internalAudioEnabled (antiga flag de estado do botão) será substituída pela lógica de _internalAudioEnabledMaster

let OSC_HOST = localStorage.getItem('OSC_HOST') || location.hostname || "127.0.0.1";
let OSC_PORT = parseInt(localStorage.getItem('OSC_PORT'), 10) || 8080;
const OSC_SETTINGS_KEY = 'oscConnectionSettingsV35'; // Mantendo v35 por enquanto para retrocompatibilidade de settings

let lastOscSendTime = 0;
const OSC_SEND_INTERVAL = 100;
let oscHeartbeatIntervalId = null;
const OSC_RECONNECT_TIMEOUT = 3000;

let isRecordingOSC = false;
let recordedOSCSequence = [];
let recordingStartTime = 0;
let playbackStartTime = 0;
let playbackLoopIntervalId = null;
let oscLoopDuration = 5000;
let isPlayingOSCLoop = false;

let spectatorModeActive = false;
let dmxSyncModeActive = false;
let midiFeedbackEnabled = false;
let cameraError = false;
let fallbackShapes = []; // Será inicializado por initFallbackShapes
let gestureSimulationActive = false;
let gestureSimIntervalId = null;
const GESTURE_SIM_INTERVAL = 100;

let currentTheme = 'theme-dark';
const THEME_STORAGE_KEY = 'midiShapeThemeV35'; // Mantendo v35 por compatibilidade se não houver mudanças de tema
const PRESETS_STORAGE_KEY = 'midiShapePresetsV52';
let shapePresets = {};
const APP_SETTINGS_KEY = 'midiShapeManipulatorV62Settings'; // ATUALIZADO para v62
const ARPEGGIO_SETTINGS_KEY = 'arpeggioSettingsV52'; // Mantido se não houver mudanças
const CAMERA_DEVICE_ID_KEY = 'midiShapeCameraDeviceIdV52'; // Mantido se não houver mudanças

// DOM Elements
const hudElement = document.getElementById('hud');
const infoHudButton = document.getElementById('infoHudButton');
const midiToggleButton = document.getElementById('midiToggleButton');
const settingsButton = document.getElementById('settingsButton');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalButton = document.getElementById('closeSettingsModal');
const midiOutputSelect = document.getElementById('midiOutputSelect');
const midiInputSelect = document.getElementById('midiInputSelect');
const midiFeedbackToggleButton = document.getElementById('midiFeedbackToggleButton');
// const openOutputPopupButton = document.getElementById('openOutputPopupButton'); // Elemento não existe no HTML v52+
// const operationModeButton = document.getElementById('operationModeButton'); // Elemento não existe no HTML v52+
// V65: Arpeggiator Panel Elements
const toggleArpPanelButtonFixed = document.getElementById('toggleArpPanelButtonFixed');
const arpeggiatorControlsPanel = document.getElementById('arpeggiatorControlsPanel');
const arpPanelStyleSelect = document.getElementById('arpPanelStyleSelect');
const arpPanelBPMSlider = document.getElementById('arpPanelBPM');
const arpPanelBPMValueSpan = document.getElementById('arpPanelBPMValue');
const arpPanelNoteIntervalSlider = document.getElementById('arpPanelNoteInterval');
const arpPanelNoteIntervalValueSpan = document.getElementById('arpPanelNoteIntervalValue');
const arpPanelRandomnessSlider = document.getElementById('arpPanelRandomness');
const arpPanelRandomnessValueSpan = document.getElementById('arpPanelRandomnessValue');
const arpPanelSwingSlider = document.getElementById('arpPanelSwing');
const arpPanelSwingValueSpan = document.getElementById('arpPanelSwingValue');
const arpPanelGhostNoteChanceSlider = document.getElementById('arpPanelGhostNoteChance');
const arpPanelGhostNoteChanceValueSpan = document.getElementById('arpPanelGhostNoteChanceValue');


// const oscPanelButton = document.getElementById('oscPanelButton'); // Elemento não existe no HTML v52+ (substituído por oscConfigButton e oscControlModal)
const oscControlModal = document.getElementById('oscControlModal');
const closeOscControlModalButton = document.getElementById('closeOscControlModal');
const oscAddressInput = document.getElementById('oscAddressInput');
const oscArgsInput = document.getElementById('oscArgsInput');
const sendTestOSCButton = document.getElementById('sendTestOSCButton');
const oscLogTextarea = document.getElementById('oscLogTextarea');
const clearOscLogButton = document.getElementById('clearOscLogButton');
const exportOscLogButton = document.getElementById('exportOscLogButton');
const syncDMXNotesButton = document.getElementById('syncDMXNotesButton');
const recordOSCButton = document.getElementById('recordOSCButton');
const playOSCLoopButton = document.getElementById('playOSCLoopButton');
const oscLoopDurationInput = document.getElementById('oscLoopDurationInput');
const spectatorModeButton = document.getElementById('spectatorModeButton');
// const resetMidiButton = document.getElementById('resetMidiButton'); // Elemento não existe no HTML v52+
// const scaleCycleButton = document.getElementById('scaleCycleButton'); // Elemento não existe no HTML v52+
const themeToggleButton = document.getElementById('themeToggleButton');
const gestureSimToggleButton = document.getElementById('gestureSimToggleButton');
const reconnectOSCButton = document.getElementById('reconnectOSCButton');
const shapePresetButton = document.getElementById('shapePresetButton');
const shapePresetModal = document.getElementById('shapePresetModal');
const closeShapePresetModalButton = document.getElementById('closeShapePresetModal');
const shapeToPresetSelect = document.getElementById('shapeToPresetSelect');
const presetNameInput = document.getElementById('presetNameInput');
const saveShapePresetButton = document.getElementById('saveShapePresetButton');
const loadShapePresetButton = document.getElementById('loadShapePresetButton');
const savedPresetsSelect = document.getElementById('savedPresetsSelect');
const deleteSelectedPresetButton = document.getElementById('deleteSelectedPresetButton');
const exportAllPresetsButton = document.getElementById('exportAllPresetsButton');
const importAllPresetsButton = document.getElementById('importAllPresetsButton');
const importPresetFileInput = document.getElementById('importPresetFileInput');
const oscConfigButton = document.getElementById('oscConfigButton');
const oscConfigModal = document.getElementById('oscConfigModal');
const closeOscConfigModalButton = document.getElementById('closeOscConfigModal'); // Corrected ID reference
const oscHostInput = document.getElementById('oscHostInput');
const oscPortInput = document.getElementById('oscPortInput');
const saveOscConfigButton = document.getElementById('saveOscConfigButton');
const cameraSelectElement = document.getElementById('cameraSelect');

// === V65: Play/Pause Button Element ===
const playPauseButton = document.getElementById('playPauseButton');
const audioActivityIndicator = document.getElementById('audioActivityIndicator');
// === END V65 ===

// --- Novos elementos DOM para Áudio Interno (v45) ---
const internalAudioToggleButton = document.getElementById('internalAudioToggleButton');
const audioWaveformSelect = document.getElementById('audioWaveformSelect'); // Modal
const audioMasterVolumeSlider = document.getElementById('audioMasterVolume'); // Modal
const audioMasterVolumeValueSpan = document.getElementById('audioMasterVolumeValue'); // Modal

// --- Elementos DOM para ADSR (v47.1 / Modal) ---
const audioAttackSlider = document.getElementById('audioAttackSlider'); // Modal
const audioAttackValueSpan = document.getElementById('audioAttackValue'); // Modal
const audioDecaySlider = document.getElementById('audioDecaySlider'); // Modal
const audioDecayValueSpan = document.getElementById('audioDecayValue'); // Modal
const audioSustainSlider = document.getElementById('audioSustainSlider'); // Modal
const audioSustainValueSpan = document.getElementById('audioSustainValue'); // Modal
const audioReleaseSlider = document.getElementById('audioReleaseSlider'); // Modal
const audioReleaseValueSpan = document.getElementById('audioReleaseValue'); // Modal

// --- Elementos DOM para Distorção (v47.1 / Modal) ---
const audioDistortionSlider = document.getElementById('audioDistortionSlider'); // Modal
const audioDistortionValueSpan = document.getElementById('audioDistortionValue'); // Modal

// --- Elementos DOM para Filtro (v51 / Modal) ---
const audioFilterCutoffSlider = document.getElementById('audioFilterCutoffSlider'); // Modal
const audioFilterCutoffValueSpan = document.getElementById('audioFilterCutoffValue'); // Modal
const audioFilterResonanceSlider = document.getElementById('audioFilterResonanceSlider'); // Modal
const audioFilterResonanceValueSpan = document.getElementById('audioFilterResonanceValue'); // Modal

// --- Elementos DOM para LFO (v51 / Modal) ---
const audioLfoWaveformSelect = document.getElementById('audioLfoWaveformSelect');
const audioLfoRateSlider = document.getElementById('audioLfoRateSlider');
const audioLfoRateValueSpan = document.getElementById('audioLfoRateValue');
const audioLfoPitchDepthSlider = document.getElementById('audioLfoPitchDepthSlider');
const audioLfoPitchDepthValueSpan = document.getElementById('audioLfoPitchDepthValue');
const audioLfoFilterDepthSlider = document.getElementById('audioLfoFilterDepthSlider');
const audioLfoFilterDepthValueSpan = document.getElementById('audioLfoFilterDepthValue');

// --- Elementos DOM para Delay (v51 / Modal) ---
const audioDelayTimeSlider = document.getElementById('audioDelayTimeSlider');
const audioDelayTimeValueSpan = document.getElementById('audioDelayTimeValue');
const audioDelayFeedbackSlider = document.getElementById('audioDelayFeedbackSlider');
const audioDelayFeedbackValueSpan = document.getElementById('audioDelayFeedbackValue');
const audioDelayMixSlider = document.getElementById('audioDelayMixSlider');
const audioDelayMixValueSpan = document.getElementById('audioDelayMixValue');

// --- Elementos DOM para Reverb (v51 / Modal) ---
const audioReverbMixSlider = document.getElementById('audioReverbMixSlider');
const audioReverbMixValueSpan = document.getElementById('audioReverbMixValue');

// === V48: Synth Control Sidebar Elements ===
let synthControlsSidebar = document.getElementById('synthControlsSidebar');
let scWaveformSelect = document.getElementById('scWaveformSelect');
let scMasterVolumeSlider = document.getElementById('scMasterVolume');
let scMasterVolumeValue = document.getElementById('scMasterVolumeValue');
let scAttackSlider = document.getElementById('scAttack');
let scAttackValue = document.getElementById('scAttackValue');
let scDecaySlider = document.getElementById('scDecay');
let scDecayValue = document.getElementById('scDecayValue');
let scSustainSlider = document.getElementById('scSustain');
let scSustainValue = document.getElementById('scSustainValue');
let scReleaseSlider = document.getElementById('scRelease');
let scReleaseValue = document.getElementById('scReleaseValue');
let scDistortionSlider = document.getElementById('scDistortion');
let scDistortionValue = document.getElementById('scDistortionValue');
// V51: Synth Control Sidebar Filter Elements
let scFilterCutoffSlider = document.getElementById('scFilterCutoff');
let scFilterCutoffValue = document.getElementById('scFilterCutoffValue');
let scFilterResonanceSlider = document.getElementById('scFilterResonance');
let scFilterResonanceValue = document.getElementById('scFilterResonanceValue');
// V51: Synth Control Sidebar LFO Elements
let scLfoWaveformSelect = document.getElementById('scLfoWaveform');
let scLfoRateSlider = document.getElementById('scLfoRate');
let scLfoRateValue = document.getElementById('scLfoRateValue');
let scLfoPitchDepthSlider = document.getElementById('scLfoPitchDepth');
let scLfoPitchDepthValue = document.getElementById('scLfoPitchDepthValue');
let scLfoFilterDepthSlider = document.getElementById('scLfoFilterDepth');
let scLfoFilterDepthValue = document.getElementById('scLfoFilterDepthValue');
// V51: Synth Control Sidebar Delay Elements
let scDelayTimeSlider = document.getElementById('scDelayTime');
let scDelayTimeValue = document.getElementById('scDelayTimeValue');
let scDelayFeedbackSlider = document.getElementById('scDelayFeedback');
let scDelayFeedbackValue = document.getElementById('scDelayFeedbackValue');
let scDelayMixSlider = document.getElementById('scDelayMix');
let scDelayMixValue = document.getElementById('scDelayMixValue');
// V51: Synth Control Sidebar Reverb Elements
let scReverbMixSlider = document.getElementById('scReverbMix');
let scReverbMixValue = document.getElementById('scReverbMixValue');
const toggleSynthPanelButtonFixed = document.getElementById('toggleSynthPanelButtonFixed'); // V55: Novo botão fixo (o antigo 'toggleSynthPanelButton' da sidebar foi removido do HTML)

// V52: Synth Control Sidebar BPM Elements
let scBPMSlider = document.getElementById('scBPM');
let scBPMValueSpan = document.getElementById('scBPMValue');

// V52: Audio Recording Elements
let recordAudioButton = document.getElementById('recordAudioButton');
let pauseAudioButton = document.getElementById('pauseAudioButton');
let saveAudioButton = document.getElementById('saveAudioButton');
// === END V48/V49/V52/V55 Elements ===


// === V52: Audio Recording State ===
let mediaRecorder;
let audioChunks = [];
let isAudioRecording = false;
let isAudioPaused = false;
// === END V52: Audio Recording State ===

// === V63: Gesture Mapping State ===
const MAX_GESTURE_MAPPINGS = 3;
let gestureMappings = []; // Array de objetos, cada um com {source: '...', target: '...'}
const GESTURE_MAPPING_STORAGE_KEY = 'gestureMappingSettingsV63';

const GESTURE_SOURCES = {
  NONE: "Nenhum",
  LIQUIFY_DEGREE: "Liquify Degree",
  NUM_SIDES: "Número de Lados",
  CURRENT_RADIUS: "Raio Atual",
  AVG_VERTEX_DISTANCE: "Distância Média Vértices"
};

const SYNTH_TARGETS = {
  NONE: "Nenhum",
  FILTER_CUTOFF: "Filtro Cutoff",
  FILTER_RESONANCE: "Filtro Resonance",
  DISTORTION: "Distorção",
  LFO_RATE: "LFO Rate",
  LFO_PITCH_DEPTH: "LFO Pitch Depth",
  LFO_FILTER_DEPTH: "LFO Filter Depth",
  DELAY_TIME: "Delay Time",
  DELAY_FEEDBACK: "Delay Feedback",
  DELAY_MIX: "Delay Mix",
  REVERB_MIX: "Reverb Mix",
  ATTACK_TIME: "Attack",
  DECAY_TIME: "Decay",
  SUSTAIN_LEVEL: "Sustain",
  RELEASE_TIME: "Release"
};

// === END V63: Gesture Mapping State ===

// === V65: Play/Pause State ===
let isPlaying = false;
let globalSequencerTime = 0; // Could be used for a global clock if Tone.Transport isn't the sole timekeeper
// === END V65: Play/Pause State ===

let currentCameraDeviceId = null;
let mediaStream = null;
let hands;
let camera;

let outputPopupWindow = null;
let popupCanvasCtx = null;
let midiAccess = null;
let midiOutput = null;
let midiInput = null;
let availableMidiOutputs = new Map();
let availableMidiInputs = new Map();
let lastLogSource = "";

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
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
let notesToVisualize = [];

let currentPlatform = 'PC';
function detectPlatform() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) currentPlatform = 'Android';
    else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) currentPlatform = 'iOS';
    else currentPlatform = 'PC';
    console.log(`Plataforma Detectada: ${currentPlatform}`);
    document.body.classList.add(`platform-${currentPlatform.toLowerCase()}`);
}

function checkWebGL2Support() {
  try {
    const testCanvas = document.createElement('canvas');
    if (testCanvas.getContext && testCanvas.getContext('webgl2')) { console.log("WebGL2 suportado."); return true; }
  } catch (e) { /* ignore */ }
  console.warn("WebGL2 não suportado pelo navegador."); return false;
}

function displayGlobalError(message, duration = 10000) {
    let errorDiv = document.getElementById('globalErrorDisplay');
    if (!errorDiv) {
        errorDiv = document.createElement('div'); errorDiv.id = 'globalErrorDisplay';
        Object.assign(errorDiv.style, { position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', backgroundColor: '#e06c75', color: 'white', zIndex: '2000', borderRadius: '5px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', textAlign: 'center' });
        document.body.appendChild(errorDiv);
    }
    errorDiv.textContent = message; errorDiv.style.display = 'block';
    setTimeout(() => { errorDiv.style.display = 'none'; }, duration);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvasElement.getBoundingClientRect();
  canvasElement.width = rect.width * dpr;
  canvasElement.height = rect.height * dpr;
  console.log(`Canvas resized to: ${canvasElement.width}x${canvasElement.height} (Display: ${rect.width}x${rect.height}, DPR: ${dpr})`);
}

function distance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1)**2 + (y2 - y1)**2); }
function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) { return Math.abs(distance(x, y, cx, cy) - r) <= tolerance; }
function getNoteName(midiNote) { if (midiNote < 0 || midiNote > 127) return ""; return `${NOTE_NAMES[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`; }

// V59: Gerenciador de timers para notas (Garbage Collection)
const activeNoteTimers = new Set();

function clearAllNoteTimers() {
    activeNoteTimers.forEach(timerId => clearTimeout(timerId));
    activeNoteTimers.clear();
    logDebug("Todos os timers de notas (staccato, etc.) foram limpos.");
}

// V59: Função centralizada para desligar notas de uma forma
function stopAllNotesForShape(shape, clearActiveMidiNotesObject = true) {
    if (!shape || spectatorModeActive) return;
    logDebug(`Parando todas as notas para a forma ${shape.id}. Limpar objeto: ${clearActiveMidiNotesObject}`);

    Object.keys(shape.activeMidiNotes).forEach(key => {
        const noteInfo = shape.activeMidiNotes[key];
        if (noteInfo && noteInfo.playing) {
            sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
            noteInfo.playing = false; // Essencial para consistência
        }
        if (noteInfo && noteInfo.staccatoTimer) {
            clearTimeout(noteInfo.staccatoTimer);
            activeNoteTimers.delete(noteInfo.staccatoTimer); // V59: Remover do Set
        }
    });

    if (clearActiveMidiNotesObject) {
        shape.activeMidiNotes = {};
    }
}


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
    if (vertexPullModeActive && shape.vertexOffsets[i] && !spectatorModeActive) { dx += shape.vertexOffsets[i].x; dy += shape.vertexOffsets[i].y; }
    totalDispMag += Math.sqrt(dx**2 + dy**2);
    const finalX = cx + vx + dx; const finalY = cy + vy + dy;
    if (i === 0) ctx.moveTo(finalX, finalY); else ctx.lineTo(finalX, finalY);
  }
  ctx.closePath(); ctx.strokeStyle = shape.id === 0 ? '#00FFFF' : '#FF00FF'; ctx.lineWidth = 3; ctx.stroke();
  if ((currentNoteMode === 'ARPEGGIO' || currentNoteMode === 'SEQUENTIAL' || currentNoteMode === 'CHORD') && shape.sides > 0 && midiEnabled) {
    // V61: Visualização de nota ativa para ARPEGGIO, SEQUENTIAL, e CHORD (baseado no currentEdgeIndex)
    // Para CHORD, isso mostrará o vértice base do "acorde sequencial"
    let key;
    if (currentNoteMode === 'ARPEGGIO') {
        key = `shape_${shape.id}_arp_${shape.currentEdgeIndex}`;
    } else if (currentNoteMode === 'SEQUENTIAL') {
        key = `shape_${shape.id}_seq_${shape.currentEdgeIndex}`;
    } else { // CHORD
        // A chave para CHORD é mais complexa (inclui chordPart), mas para visualização do vértice base,
        // podemos tentar encontrar uma nota ativa que corresponda ao currentEdgeIndex como vertexIndex.
        // Ou, mais simples, apenas desenhar se houver alguma nota ativa para o shape.
        // Para maior precisão, idealmente a lógica de `processShapeNotes` marcaria a nota base do acorde.
        // Por ora, vamos usar uma heurística ou simplificar.
        // Tentativa: buscar uma nota ativa que tenha o vertexIndex igual ao currentEdgeIndex.
        const activeChordNoteKey = Object.keys(shape.activeMidiNotes).find(k => {
            const noteInfo = shape.activeMidiNotes[k];
            return noteInfo && noteInfo.playing && noteInfo.isChordNote && noteInfo.vertexIndex === shape.currentEdgeIndex;
        });
        if (activeChordNoteKey) key = activeChordNoteKey; // Usa a chave encontrada se houver
    }

    if (key && shape.activeMidiNotes[key]?.playing) {
      const angle = (shape.currentEdgeIndex / shape.sides) * Math.PI * 2;
      let vx = r * Math.cos(angle); let vy = r * Math.sin(angle);
      let ox = 0; let oy = 0;
      if (vertexPullModeActive && shape.vertexOffsets[shape.currentEdgeIndex] && !spectatorModeActive) {
        ox = shape.vertexOffsets[shape.currentEdgeIndex].x;
        oy = shape.vertexOffsets[shape.currentEdgeIndex].y;
      }
      ctx.beginPath(); ctx.arc(cx + vx + ox, cy + vy + oy, 8, 0, Math.PI * 2);
      ctx.fillStyle = shape.id === 0 ? 'rgba(0,255,255,0.6)' : 'rgba(255,0,255,0.6)';
      ctx.fill();
    } else if (currentNoteMode === 'CHORD' && shape.sides > 0 && Object.values(shape.activeMidiNotes).some(ni => ni.playing && ni.isChordNote && ni.vertexIndex === shape.currentEdgeIndex) ) {
      // Fallback para CHORD: se alguma parte do acorde no vértice atual estiver tocando.
      const angle = (shape.currentEdgeIndex / shape.sides) * Math.PI * 2;
      let vx = r * Math.cos(angle); let vy = r * Math.sin(angle);
      let ox = 0; let oy = 0;
      if (vertexPullModeActive && shape.vertexOffsets[shape.currentEdgeIndex] && !spectatorModeActive) { ox = shape.vertexOffsets[shape.currentEdgeIndex].x; oy = shape.vertexOffsets[shape.currentEdgeIndex].y; }
      ctx.beginPath(); ctx.arc(cx + vx + ox, cy + vy + oy, 8, 0, Math.PI * 2);
      ctx.fillStyle = shape.id === 0 ? 'rgba(0,255,255,0.6)' : 'rgba(255,0,255,0.6)'; ctx.fill();
    }
  }
  const avgDisp = (activeLiquifyPts > 0) ? totalDispMag / activeLiquifyPts : (Object.keys(shape.vertexOffsets).length > 0 ? totalDispMag / Object.keys(shape.vertexOffsets).length : 0);
  const maxDistortion = 50.0; const pitchBendSens = 4096;
  shape.currentPitchBend = 8192 + Math.round(Math.min(1.0, avgDisp / maxDistortion) * pitchBendSens);
  shape.currentPitchBend = Math.max(0, Math.min(16383, shape.currentPitchBend));
  const normDistortion = Math.min(1.0, avgDisp / maxDistortion);
  shape.reverbAmount = Math.round(normDistortion * 127); shape.delayAmount = Math.round(normDistortion * 127);
  shape.modWheelValue = Math.round(normDistortion * 127); shape.resonanceValue = Math.round(normDistortion * 127);
  shape.panValue = Math.max(0, Math.min(127, Math.round((shape.centerX / canvasElement.width) * 127)));
  let normSides = (shape.sides - 3) / (20 - 3); normSides = Math.max(0, Math.min(1, normSides));
  if (shape.sides === 100) normSides = 0.5;
  shape.brightnessValue = Math.round(normSides * 127);
  processShapeNotes(shape, isPulsing, pulseValue);

  // V59: Lógica de limpeza de notas centralizada e aprimorada
  Object.keys(shape.activeMidiNotes).forEach(key => {
    const noteInfo = shape.activeMidiNotes[key];
    let shouldDelete = false;

    if (!noteInfo) { // Caso raro, mas seguro
        shouldDelete = true;
    } else if (!noteInfo.playing || !midiEnabled || shape.sides <= 0 || spectatorModeActive) {
        if (noteInfo.playing) { // Se estava tocando, mas agora não deve mais
            sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
            noteInfo.playing = false;
        }
        if (noteInfo.staccatoTimer) {
            clearTimeout(noteInfo.staccatoTimer);
            activeNoteTimers.delete(noteInfo.staccatoTimer);
        }
        shouldDelete = true;
    } else if (noteInfo.isSequentialNote && currentNoteMode !== 'SEQUENTIAL') {
        // Nota sequencial, mas mudou de modo
        sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
        noteInfo.playing = false;
        if (noteInfo.staccatoTimer) { clearTimeout(noteInfo.staccatoTimer); activeNoteTimers.delete(noteInfo.staccatoTimer); }
        shouldDelete = true;
    } else if (noteInfo.isArpeggioNote && currentNoteMode !== 'ARPEGGIO') {
        // Nota de arpejo, mas mudou de modo
        sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
        noteInfo.playing = false;
        if (noteInfo.staccatoTimer) { clearTimeout(noteInfo.staccatoTimer); activeNoteTimers.delete(noteInfo.staccatoTimer); }
        shouldDelete = true;
    } else if (currentNoteMode === 'SEQUENTIAL' && noteInfo.isSequentialNote) {
        // Para notas sequenciais, elas devem ser desligadas se não corresponderem a um vértice ativo.
        // No modo SEQUENTIAL, todas as notas são tocadas/desligadas a cada step, então a limpeza principal ocorre em processShapeNotes.
        // Aqui, apenas garantimos que, se uma nota sequencial persistir indevidamente, ela seja limpa.
        // A lógica em processShapeNotes já deve cuidar disso.
    }
    // Adicionar mais condições de limpeza se necessário para outros modos.

    if (shouldDelete) {
        delete shape.activeMidiNotes[key];
    }
  });
}

function getNoteInScale(index, baseOctaveOffset = 0) {
  const scale = SCALES[currentScaleName]; const scaleNotes = scale.notes; const len = scaleNotes.length;
  const octave = baseOctaveOffset + Math.floor(index / len); const noteIdx = index % len;
  return Math.max(0, Math.min(127, scale.baseMidiNote + scaleNotes[noteIdx] + (octave * 12)));
}


// V59: Função centralizada para desligar notas ativas de uma forma antes de tocar novas notas (exceto staccato)
function stopPreviousNotesIfNeeded(shape) {
    if (staccatoModeActive) return; // Não desliga em staccato

    Object.keys(shape.activeMidiNotes).forEach(key => {
        const noteInfo = shape.activeMidiNotes[key];
        if (noteInfo && noteInfo.playing) {
            // Apenas desliga se não for uma nota de staccato que ainda não terminou seu timer.
            // Se for staccato, o timer próprio cuidará do noteOff.
            // No entanto, se a nota for ser REINICIADA, o timer será limpo e a nota desligada.
            // Esta lógica aqui é para o caso geral de mudança de nota.
            if (!noteInfo.staccatoTimer || (noteInfo.staccatoTimer && !activeNoteTimers.has(noteInfo.staccatoTimer))) {
                 sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
                 noteInfo.playing = false;
            }
            // Não deletar de activeMidiNotes aqui; a limpeza principal ocorre em drawShape ou
            // a nota pode ser substituída.
        }
    });
}


function processShapeNotes(shape, isPulsing, pulseValue) {
    // V65: Only process notes if isPlaying is true
    if (spectatorModeActive || !midiEnabled || shape.sides <= 0 || !isPlaying) {
        // If not playing, ensure all notes for this shape are turned off
        // This can be redundant if turnOffAllActiveNotes() is called in togglePlayPause's pause branch,
        // but it's a safeguard.
        if (!isPlaying) {
            stopAllNotesForShape(shape, true); // Clear activeMidiNotes object as well
        }
        return;
    }
    const now = performance.now();

    let baseNoteIntervalForArp = 60000 / arpeggioBPM;
    let currentEffectiveNoteInterval = baseNoteIntervalForArp;

    if (currentNoteMode === 'ARPEGGIO' && arpSwing > 0) {
        const swingRatio = arpSwing / 100; // 0 to 1
        // Simple two-step swing: long-short ou short-long
        // Example: 66% swing means first note is 1.33x base, second is 0.66x base
        const swingFactor = swingRatio * 0.66; // Max deviation for swing (e.g. 0.33 means 1.33 and 0.67)
        if (shape.arpSwingStep % 2 === 0) { // Long
            currentEffectiveNoteInterval = baseNoteIntervalForArp * (1 + swingFactor);
        } else { // Short
            currentEffectiveNoteInterval = baseNoteIntervalForArp * (1 - swingFactor);
        }
    } else {
        currentEffectiveNoteInterval = (currentNoteMode === 'ARPEGGIO') ? baseNoteIntervalForArp : noteInterval;
    }

    const canPlayArp = currentNoteMode === 'ARPEGGIO' && shape.sides > 0 && (now - shape.lastArpeggioNotePlayedTime > currentEffectiveNoteInterval);
    const canPlayNonArp = currentNoteMode !== 'ARPEGGIO' && (now - shape.lastNotePlayedTime > currentEffectiveNoteInterval); // Non-arp also uses currentEffective for consistency if ever needed

    if (canPlayArp || canPlayNonArp) {
        let notesToPlayData = []; // V62: Renomeado para evitar conflito com notesToPlay (que é um array de MIDI notes)
        let edgeIdx = shape.currentEdgeIndex;
        let notePlayedThisTick = false;

        if (!staccatoModeActive) {
            Object.keys(shape.activeMidiNotes).forEach(key => {
                const noteInfo = shape.activeMidiNotes[key];
                if (noteInfo && noteInfo.playing && !noteInfo.staccatoTimer) {
                    sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
                    noteInfo.playing = false;
                }
            });
        }

        let calculatedNote;

        switch (currentNoteMode) {
            case 'SEQUENTIAL':
                if (canPlayNonArp && shape.sides > 0) {
                    shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides;
                    edgeIdx = shape.currentEdgeIndex;
                    if (shape.sides === 100) {
                        // Mapeia o índice da borda (0-99) para uma nota MIDI (0-127)
                        calculatedNote = Math.min(127, Math.max(0, Math.round((edgeIdx / (shape.sides - 1)) * 127)));
                    } else {
                        calculatedNote = getNoteInScale(edgeIdx);
                    }
                    notesToPlayData.push({ note: calculatedNote, vertexIndex: edgeIdx, isSequential: true });
                    notePlayedThisTick = true;
                    shape.lastNotePlayedTime = now;
                }
                break;

            case 'ARPEGGIO':
                if (canPlayArp && shape.sides > 0) {
                    if (shape.sides < 1) break;
                    shape.arpSwingStep++; // Increment swing step

                    // V63: Arp Randomness
                    if (arpRandomness > 0 && Math.random() < arpRandomness / 100) {
                        shape.currentEdgeIndex = Math.floor(Math.random() * shape.sides);
                    } else {
                        // Original Arp Style Logic
                        if (currentArpeggioStyle === "UP") {
                            shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides;
                        } else if (currentArpeggioStyle === "DOWN") {
                            shape.currentEdgeIndex = (shape.currentEdgeIndex - 1 + shape.sides) % shape.sides;
                        } else if (currentArpeggioStyle === "UPDOWN") {
                            if (shape.sides === 1) {
                                shape.currentEdgeIndex = 0;
                            } else {
                                if (shape.arpeggioDirection === 1) {
                                    if (shape.currentEdgeIndex >= shape.sides - 1) {
                                        shape.currentEdgeIndex = Math.max(0, shape.sides - 1);
                                        shape.arpeggioDirection = -1;
                                    } else {
                                        shape.currentEdgeIndex++;
                                    }
                                } else { // direction -1
                                    if (shape.currentEdgeIndex <= 0) {
                                        shape.currentEdgeIndex = 0;
                                        shape.arpeggioDirection = 1;
                                    } else {
                                        shape.currentEdgeIndex--;
                                    }
                                }
                            }
                        } else if (currentArpeggioStyle === "RANDOM") { // This is the built-in random, distinct from arpRandomness slider
                            shape.currentEdgeIndex = Math.floor(Math.random() * shape.sides);
                        }
                    }
                    edgeIdx = shape.currentEdgeIndex;

                    if (shape.sides === 100) { // Circle mode
                        calculatedNote = Math.min(127, Math.max(0, Math.round((edgeIdx / (shape.sides -1)) * 127)));
                    } else {
                        calculatedNote = getNoteInScale(edgeIdx);
                    }
                    notesToPlayData.push({ note: calculatedNote, vertexIndex: edgeIdx, isArpeggio: true });
                    notePlayedThisTick = true;
                    shape.lastArpeggioNotePlayedTime = now;
                }
                break;

            case 'CHORD':
                if (canPlayNonArp && shape.sides > 0) {
                    const baseVertexIndex = shape.currentEdgeIndex;
                    const chordNotesDefinition = [0, 2, 4]; // Ex: Tônica, Terça, Quinta da escala

                    let baseNoteForChordPart;
                    if (shape.sides === 100) {
                        // Nota base do acorde (0-99) mapeada para MIDI (0-127)
                        const baseMidiNoteForCircleChord = Math.min(127, Math.max(0, Math.round((baseVertexIndex / (shape.sides - 1)) * 127)));
                        // Adiciona o intervalo do acorde à nota base MIDI
                        baseNoteForChordPart = baseMidiNoteForCircleChord + chordNotesDefinition[shape.currentChordStepIndex];
                        // Garante que a nota final do acorde esteja no range MIDI
                        calculatedNote = Math.max(0, Math.min(127, baseNoteForChordPart));
                    } else {
                        // Lógica original para escalas
                        calculatedNote = getNoteInScale(baseVertexIndex + chordNotesDefinition[shape.currentChordStepIndex]);
                    }

                    notesToPlayData.push({
                        note: calculatedNote,
                        vertexIndex: baseVertexIndex, // Vértice base do acorde
                        isChordNote: true,
                        chordPart: shape.currentChordStepIndex
                    });

                    shape.currentChordStepIndex++;
                    if (shape.currentChordStepIndex >= chordNotesDefinition.length) {
                        shape.currentChordStepIndex = 0;
                        // Avança para o próximo vértice base do acorde
                        shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides;
                    }
                    notePlayedThisTick = true;
                    shape.lastNotePlayedTime = now;
                }
                break;

            case 'RANDOM_WALK':
                if (canPlayNonArp) {
                    let randomWalkIndex = shape.currentEdgeIndex; // Usaremos currentEdgeIndex para o "local" do random walk
                    randomWalkIndex += Math.floor(Math.random() * 3) - 1; // -1, 0, ou 1

                    if (shape.sides === 100) {
                        // Para o círculo, o random walk acontece diretamente no espectro MIDI 0-127
                        // Assegura que o índice permaneça dentro de 0-127
                        randomWalkIndex = Math.max(0, Math.min(127, randomWalkIndex));
                        calculatedNote = randomWalkIndex;
                    } else {
                        // Lógica original para escalas: o randomWalkIndex é um índice na escala
                        const scaleNoteCount = SCALES[currentScaleName].notes.length * 2; // Ex: 2 oitavas
                        randomWalkIndex = (randomWalkIndex % scaleNoteCount + scaleNoteCount) % scaleNoteCount; // Garante que é positivo e dentro do range
                        calculatedNote = getNoteInScale(randomWalkIndex);
                    }
                    shape.currentEdgeIndex = randomWalkIndex; // Salva o novo índice/nota

                    notesToPlayData.push({ note: calculatedNote, vertexIndex: randomWalkIndex, isRandomWalk: true }); // vertexIndex aqui pode ser a própria nota MIDI ou o índice na escala
                    notePlayedThisTick = true;
                    shape.lastNotePlayedTime = now;
                }
                break;
        }

        if (notePlayedThisTick && notesToPlayData.length > 0) {
            let baseVel = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * (97 / 270))));
            if (isPulsing) baseVel = Math.max(0, Math.min(127, Math.round(baseVel * (0.6 + ((pulseValue + 1) / 2) * 0.4))));

            notesToPlayData.forEach((noteData) => {
                let finalVel = baseVel;
                let playThisNote = true;

                // V63: Arp Ghost Note Chance (only for arpeggio notes)
                if (noteData.isArpeggio && arpGhostNoteChance > 0 && Math.random() < arpGhostNoteChance / 100) {
                    // Ghost note triggered
                    if (Math.random() < 0.3) { // 30% chance of completely omitting the note
                        playThisNote = false;
                    } else { // 70% chance of playing with very low velocity
                        finalVel = Math.max(1, Math.round(baseVel * 0.1)); // e.g., 10% of original velocity
                    }
                }

                if (playThisNote) {
                    const noteToPlay = noteData.note;
                    const vertexIndex = noteData.vertexIndex;

                    let key;
                    if (noteData.isSequential) {
                        key = `shape_${shape.id}_seq_${vertexIndex}`;
                    } else if (noteData.isArpeggio) {
                        key = `shape_${shape.id}_arp_${vertexIndex}`;
                    } else if (noteData.isChordNote) {
                        key = `shape_${shape.id}_chord_${vertexIndex}_part_${noteData.chordPart}`;
                    } else if (noteData.isRandomWalk) {
                        key = `shape_${shape.id}_rw_${vertexIndex}_note_${noteToPlay}`;
                    } else {
                        key = `shape_${shape.id}_other_${vertexIndex}_note_${noteToPlay}`;
                    }

                    if (shape.activeMidiNotes[key]?.staccatoTimer) {
                        clearTimeout(shape.activeMidiNotes[key].staccatoTimer);
                        activeNoteTimers.delete(shape.activeMidiNotes[key].staccatoTimer);
                    }

                    sendMidiNoteOn(noteToPlay, finalVel, shape.midiChannel, shape.id + 1);

                    shape.activeMidiNotes[key] = {
                        note: noteToPlay,
                        playing: true,
                        staccatoTimer: null,
                        isSequentialNote: !!noteData.isSequential,
                        isArpeggioNote: !!noteData.isArpeggio,
                        isChordNote: !!noteData.isChordNote,
                        isRandomWalkNote: !!noteData.isRandomWalk,
                        vertexIndex: vertexIndex,
                        timestamp: now
                    };

                    if (staccatoModeActive) {
                        const timerId = setTimeout(() => {
                            if (shape.activeMidiNotes[key]?.playing) {
                                sendMidiNoteOff(noteToPlay, shape.midiChannel, shape.id + 1);
                                if (shape.activeMidiNotes[key]) shape.activeMidiNotes[key].playing = false;
                            }
                            activeNoteTimers.delete(timerId);
                        }, 150);
                        shape.activeMidiNotes[key].staccatoTimer = timerId;
                        activeNoteTimers.add(timerId);
                    }
                }
            });

            if (shape.currentPitchBend !== 8192) sendPitchBend(shape.currentPitchBend, shape.midiChannel);
            if (shape.reverbAmount !== shape.lastSentReverb) { sendMidiCC(91, shape.reverbAmount, shape.midiChannel); shape.lastSentReverb = shape.reverbAmount; }
            if (shape.delayAmount !== shape.lastSentDelay) { sendMidiCC(94, shape.delayAmount, shape.midiChannel); shape.lastSentDelay = shape.delayAmount; }
            if (shape.panValue !== shape.lastSentPan) { sendMidiCC(10, shape.panValue, shape.midiChannel); shape.lastSentPan = shape.panValue; }
            if (shape.brightnessValue !== shape.lastSentBrightness) { sendMidiCC(74, shape.brightnessValue, shape.midiChannel); shape.lastSentBrightness = shape.brightnessValue; }
            if (shape.modWheelValue !== shape.lastSentModWheel) { sendMidiCC(1, shape.modWheelValue, shape.midiChannel); shape.lastSentModWheel = shape.modWheelValue; }
            if (shape.resonanceValue !== shape.lastSentResonance) { sendMidiCC(71, shape.resonanceValue, shape.midiChannel); shape.lastSentResonance = shape.resonanceValue; }
        }
    } // Esta chave fecha o if (canPlayArp || canPlayNonArp)

    // A lógica de pitch bend e CCs deve estar DENTRO do if (notePlayedThisTick && notesToPlayData.length > 0)
    // E a lógica de activeNotesExistForPitchBend também.
    // No entanto, a estrutura atual tem um erro de sintaxe com um `playing: true` solto.
    // A correção ideal envolve reestruturar a parte final de processShapeNotes.

    // Tentativa de correção mantendo a lógica o mais próximo possível, mas eliminando o erro de sintaxe imediato.
    // A lógica de envio de CCs e pitch bend será movida para dentro do bloco `if (notePlayedThisTick ...)`
    // e a verificação de `activeNotesExistForPitchBend` será ajustada.
    // CORREÇÃO FINAL: Mover a lógica de pitch bend para dentro do bloco if (notePlayedThisTick && notesToPlayData.length > 0)
    // Isso já foi feito implicitamente ao remover o bloco duplicado. A lógica restante de pitch bend e CCs está no local correto,
    // dentro do forEach(noteData) e do if (notePlayedThisTick && notesToPlayData.length > 0)

    // A verificação de activeNotesExistForPitchBend e o envio condicional de pitch bend
    // também devem estar dentro do contexto onde as notas são realmente tocadas ou manipuladas.
    // No entanto, a lógica atual de pitch bend já está dentro do `if (notePlayedThisTick && notesToPlayData.length > 0)`
    // e o envio de CCs também. A verificação adicional de `activeNotesExistForPitchBend` no final
    // parece ser uma tentativa de garantir que o pitch bend seja enviado se alguma nota estiver tocando,
    // o que é razoável. Vamos manter essa parte, pois não causa erro de sintaxe.

    let activeNotesExistForPitchBend = false;
    let lastKnownPitchBendForShape = 8192;
    for (const key in shape.activeMidiNotes) {
        if (shape.activeMidiNotes[key]?.playing) {
            activeNotesExistForPitchBend = true;
            lastKnownPitchBendForShape = shape.activeMidiNotes[key].lastPitchBend || 8192;
            break;
        }
    }

    if (activeNotesExistForPitchBend) {
        if (Math.abs(shape.currentPitchBend - lastKnownPitchBendForShape) > 10) { // Limiar para evitar envios excessivos
            sendPitchBend(shape.currentPitchBend, shape.midiChannel);
            Object.values(shape.activeMidiNotes).forEach(ni => {
                if (ni && ni.playing) ni.lastPitchBend = shape.currentPitchBend;
            });
        }
    }
}


async function initializeCamera(deviceId = null) {
    logDebug(`Tentando inicializar câmera. Device ID: ${deviceId || 'Padrão'}`);
    console.log(`Inicializando câmera com deviceId: ${deviceId || 'Padrão'}`); cameraError = false;
    if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }

    if (camera && typeof camera.stop === 'function') {
        try {
          await camera.stop();
        } catch(e) {
          console.warn("Erro ao parar câmera anterior:", e);
        }
        camera = null;
    }

    try {
        const constraints = { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false };
        if (deviceId) constraints.video.deviceId = { exact: deviceId };

        console.log("Solicitando permissão da câmera com constraints:", constraints);
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Permissão da câmera obtida. MediaStream:", mediaStream);

        if (videoElement) {
            videoElement.srcObject = mediaStream;
            console.log("videoElement.srcObject atribuído.");
            await new Promise((resolve, reject) => {
                videoElement.onloadedmetadata = () => {
                    console.log("videoElement metadata carregado.");
                    videoElement.play().then(() => {
                        console.log("videoElement.play() bem-sucedido.");
                        resolve();
                    }).catch(e => {
                        console.error("Erro ao tentar dar play no vídeo:", e);
                        cameraError = true;
                        reject(e);
                    });
                };
                videoElement.onerror = (e) => {
                    console.error("Erro no elemento de vídeo (onerror):", e);
                    cameraError = true;
                    reject(e);
                };
            });
        } else {
            console.error("videoElement não encontrado no DOM.");
            cameraError = true;
            if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
            return;
        }

        if (!hands) {
            console.log("Instanciando MediaPipe Hands...");
            hands = new Hands({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
            });
            hands.setOptions({
                maxNumHands: 2, modelComplexity: 1,
                minDetectionConfidence: 0.8, minTrackingConfidence: 0.8
            });
            hands.onResults(onResults);
        } else {
             hands.setOptions({
                maxNumHands: 2, modelComplexity: 1,
                minDetectionConfidence: 0.8, minTrackingConfidence: 0.8
            });
        }

        console.log("Instanciando MediaPipe Camera...");
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (gestureSimulationActive || cameraError || !videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                    if (cameraError && !gestureSimulationActive) {
                        drawFallbackAnimation();
                        updateHUD();
                    }
                    return;
                }
                if (hands && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                    try {
                        await hands.send({ image: videoElement });
                    } catch (e) {
                        console.error("Erro ao enviar frame para hands.send:", e);
                        cameraError = true;
                    }
                }
            },
            width: 640, height: 480
        });

        console.log("Iniciando MediaPipe Camera (camera.start())...");
        await camera.start();

        console.log("Camera e MediaPipe inicializados com sucesso.");
        logDebug("Câmera e MediaPipe inicializados com sucesso.", { deviceId: deviceId });
        currentCameraDeviceId = deviceId;
        localStorage.setItem(CAMERA_DEVICE_ID_KEY, currentCameraDeviceId || '');

    } catch (error) {
        console.error(`Falha ao inicializar webcam (ID: ${deviceId || 'Padrão'}):`, error);
        logDebug("Falha ao inicializar webcam.", { deviceId: deviceId, error: error });
        displayGlobalError(`Falha webcam (${error.name || 'Error'}): ${error.message || 'Desconhecido'}. Verifique permissões.`, 20000);
        cameraError = true;
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
        if (camera && typeof camera.stop === 'function') {
            try {
                await camera.stop();
            } catch(e) {
                console.warn("Erro ao tentar parar MediaPipe Camera após falha:", e);
            }
        }
        camera = null;
    }
}

async function populateCameraSelect() {
    logDebug("Populando lista de câmeras...");
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn("navigator.mediaDevices.enumerateDevices() não é suportado.");
        if(cameraSelectElement) cameraSelectElement.disabled = true;
        return;
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        if(cameraSelectElement) {
            cameraSelectElement.innerHTML = '<option value="">Padrão do Navegador</option>';
            let preferredDeviceId = null;
            if (currentPlatform === 'Android') {
                const rearCamera = videoDevices.find(device => /back|rear|environment/i.test(device.label));
                if (rearCamera) preferredDeviceId = rearCamera.deviceId;
            }
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Câmera ${cameraSelectElement.options.length}`;
                if (device.deviceId === currentCameraDeviceId) option.selected = true;
                else if (!currentCameraDeviceId && preferredDeviceId && device.deviceId === preferredDeviceId) {
                    option.selected = true; currentCameraDeviceId = device.deviceId;
                }
                cameraSelectElement.appendChild(option);
            });
            cameraSelectElement.disabled = videoDevices.length <= 1 && !videoDevices.find(d => d.deviceId === currentCameraDeviceId && currentCameraDeviceId !== '');
        }
    } catch (err) {
        console.error("Erro ao listar câmeras: ", err);
        if(cameraSelectElement) cameraSelectElement.disabled = true;
    }
}

function onResults(results) {
  logDebug("onResults chamado.", { numHands: results.multiHandLandmarks?.length });
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0,0,canvasElement.width,canvasElement.height);

  shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; });

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    if (operationMode === 'one_person') {
      let lH = null, rH = null;
      results.multiHandLandmarks.forEach((landmarks, i) => {
        if (!spectatorModeActive) drawLandmarks(landmarks, results.multiHandedness[i]?.label);
        const handedness = results.multiHandedness[i]?.label;
        if (handedness === "Left" && !lH) lH = landmarks;
        else if (handedness === "Right" && !rH) rH = landmarks;
      });
      shapes[0].leftHandLandmarks = lH; shapes[0].rightHandLandmarks = rH;
      if (shapes.length > 1) { shapes[1].leftHandLandmarks = null; shapes[1].rightHandLandmarks = null; }
    } else {
      let assignedL = [false,false], assignedR = [false,false];
      results.multiHandLandmarks.forEach((landmarks, i) => {
        if (!spectatorModeActive) drawLandmarks(landmarks, results.multiHandedness[i]?.label);
        const handedness = results.multiHandedness[i]?.label;
        for(let j=0; j<shapes.length; j++){
          if(handedness === "Left" && !shapes[j].leftHandLandmarks && !assignedL[j]) {
            shapes[j].leftHandLandmarks = landmarks; assignedL[j]=true; break;
          }
          if(handedness === "Right" && !shapes[j].rightHandLandmarks && !assignedR[j]) {
            shapes[j].rightHandLandmarks = landmarks; assignedR[j]=true; break;
          }
        }
      });
    }
  }

  shapes.forEach(shape => {
    if (spectatorModeActive) { shape.activeGesture = null; return; }
    let gestureProcessed = false; let currentGesture = null;
    let wristCount = 0; let avgWristX = 0; let avgWristY = 0;
    if (shape.leftHandLandmarks?.[0]) { avgWristX += shape.leftHandLandmarks[0].x; avgWristY += shape.leftHandLandmarks[0].y; wristCount++; }
    if (shape.rightHandLandmarks?.[0]) { avgWristX += shape.rightHandLandmarks[0].x; avgWristY += shape.rightHandLandmarks[0].y; wristCount++; }
    if (wristCount > 0) {
      const targetCenterX = canvasElement.width - (avgWristX/wristCount * canvasElement.width);
      const targetCenterY = avgWristY/wristCount * canvasElement.height;
      shape.centerX = shape.centerX * 0.85 + targetCenterX * 0.15;
      shape.centerY = shape.centerY * 0.85 + targetCenterY * 0.15;
    }
    if (shape.leftHandLandmarks && shape.rightHandLandmarks) {
      const lThumb = shape.leftHandLandmarks[4], rThumb = shape.rightHandLandmarks[4];
      const lIdxCurl = shape.leftHandLandmarks[8].y > shape.leftHandLandmarks[6].y;
      const rIdxCurl = shape.rightHandLandmarks[8].y > shape.rightHandLandmarks[6].y;
      if (lIdxCurl && rIdxCurl) {
        currentGesture = 'resize'; gestureProcessed = true;
        const dist = distance(lThumb.x, lThumb.y, rThumb.x, rThumb.y) * canvasElement.width;
        const normDist = Math.max(0,Math.min(1, (dist - 50)/(canvasElement.width*0.3)));
        shape.radius = shape.radius*0.8 + (30 + normDist * 270)*0.2;
        if (Math.abs(shape.radius - shape.lastResizeRadius) > 10 && (performance.now() - shape.lastResizeTime > 500)) {
          shape.lastResizeRadius = shape.radius; shape.lastResizeTime = performance.now();
        }
      }
    }
    if (!gestureProcessed && shape.leftHandLandmarks) {
      const idx = shape.leftHandLandmarks[8], thumb = shape.leftHandLandmarks[4];
      const pinchDist = distance(idx.x, idx.y, thumb.x, thumb.y) * canvasElement.width;
      const pinchCanvasX = canvasElement.width - ((idx.x + thumb.x)/2 * canvasElement.width);
      const pinchCanvasY = ((idx.y + thumb.y)/2 * canvasElement.height);
      const isTouching = isTouchingCircle(pinchCanvasX, pinchCanvasY, shape.centerX, shape.centerY, shape.radius, shape.radius * 0.6);
      if (isTouching) {
        currentGesture = 'sides'; gestureProcessed = true;
        let newSides = (pinchDist > 150*1.2) ? 100 : Math.round(3 + Math.max(0,Math.min(1,(pinchDist-10)/150)) * (20-3));
        newSides = Math.max(3, Math.min(100, newSides));
        if (newSides !== shape.sides && (performance.now() - shape.lastSideChangeTime > SIDE_CHANGE_DEBOUNCE_MS)) {
          shape.sides = newSides; shape.lastSideChangeTime = performance.now();
          if(shape.currentEdgeIndex >= newSides) shape.currentEdgeIndex = Math.max(0, newSides-1);
          turnOffAllActiveNotesForShape(shape);
        }
      }
    }
    if (!gestureProcessed && shape.rightHandLandmarks) { currentGesture = 'liquify'; }
    const oscGesture = currentGesture || 'none';
    if (shape.lastSentActiveGesture !== oscGesture) {
      sendOSCMessage(`/forma/${shape.id+1}/gestureActivated`, oscGesture);
      shape.lastSentActiveGesture = oscGesture;
    }
    shape.activeGesture = currentGesture;
  });

  let pVal = 0; if(pulseModeActive) { pulseTime = performance.now()*0.001; pVal = Math.sin(pulseTime*pulseFrequency*2*Math.PI); }
  shapes.forEach(s => drawShape(s, pulseModeActive, pVal));

  const visNow = performance.now(); ctx.font="15px Arial"; ctx.textAlign="center";
  notesToVisualize = notesToVisualize.filter(n => {
    const age = visNow - n.timestamp;
    if (age < 750) { ctx.fillStyle = `rgba(255,255,255,${1-(age/750)})`; ctx.fillText(n.noteName, n.x, n.y); return true; }
    return false;
  });
  updateHUD();
  if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) {
    try {
      const pc = outputPopupWindow.document.getElementById('popupCanvas');
      if (pc.width !== outputPopupWindow.innerWidth || pc.height !== outputPopupWindow.innerHeight) {
        pc.width = outputPopupWindow.innerWidth; pc.height = outputPopupWindow.innerHeight;
      }
      popupCanvasCtx.fillStyle='rgba(0,0,0,0.1)'; popupCanvasCtx.fillRect(0,0,pc.width,pc.height);
      popupCanvasCtx.drawImage(canvasElement,0,0,pc.width,pc.height);
    } catch(e) { if(e.name === "InvalidStateError" || outputPopupWindow?.closed) { popupCanvasCtx=null; outputPopupWindow=null; } }
  }
}

function drawLandmarks(landmarksArray, handedness = "Unknown") {
    if (!landmarksArray || landmarksArray.length === 0 || spectatorModeActive) return;
    const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [5,9],[9,10],[10,11],[11,12],
        [9,13],[13,14],[14,15],[15,16],
        [13,17],[17,18],[18,19],[19,20],
        [0,17]
    ];
    ctx.strokeStyle = handedness === "Right" ? 'lime' : (handedness === "Left" ? 'cyan' : 'yellow');
    ctx.lineWidth = 2;

    for (const conn of connections) {
        const lm1 = landmarksArray[conn[0]];
        const lm2 = landmarksArray[conn[1]];
        if (lm1 && lm2) {
            ctx.beginPath();
            ctx.moveTo(canvasElement.width - (lm1.x * canvasElement.width), lm1.y * canvasElement.height);
            ctx.lineTo(canvasElement.width - (lm2.x * canvasElement.width), lm2.y * canvasElement.height);
            ctx.stroke();
        }
    }
}

function initFallbackShapes() {
    if (fallbackShapes.length > 0 && canvasElement && fallbackShapes[0].canvasWidth === canvasElement.width && fallbackShapes[0].canvasHeight === canvasElement.height) return;

    fallbackShapes = [];
    if (!canvasElement || canvasElement.width === 0 || canvasElement.height === 0) {
        console.warn("initFallbackShapes: Canvas não pronto ou sem dimensões.");
        return;
    }
    const numShapes = 5 + Math.floor(Math.random() * 5);
    const colors = ["#FF00FF", "#00FFFF", "#FFFF00", "#FF0000", "#00FF00", "#FFA500", "#800080"];
    for (let i = 0; i < numShapes; i++) {
        fallbackShapes.push({
            x: Math.random() * canvasElement.width,
            y: Math.random() * canvasElement.height,
            radius: 15 + Math.random() * 25,
            color: colors[i % colors.length],
            vx: (Math.random() - 0.5) * (2 + Math.random() * 2),
            vy: (Math.random() - 0.5) * (2 + Math.random() * 2),
            sides: 3 + Math.floor(Math.random() * 6),
            rotationSpeed: (Math.random() - 0.5) * 0.02,
            currentAngle: Math.random() * Math.PI * 2,
            canvasWidth: canvasElement.width,
            canvasHeight: canvasElement.height
        });
    }
    logDebug("Fallback shapes inicializadas:", fallbackShapes.length);
}

function drawFallbackAnimation() {
    if (!canvasElement || !ctx) {
        console.warn("drawFallbackAnimation: Canvas ou context não disponível.");
        return;
    }
    if (fallbackShapes.length === 0 || (fallbackShapes[0].canvasWidth !== canvasElement.width || fallbackShapes[0].canvasHeight !== canvasElement.height) ) {
        initFallbackShapes();
        if (fallbackShapes.length === 0) return;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    ctx.fillText("Detecção de mãos indisponível ou falhou.", canvasElement.width / 2, canvasElement.height / 2 - 30);
    ctx.font = "14px Arial";
    ctx.fillText("Exibindo animação alternativa. Verifique as permissões da câmera.", canvasElement.width / 2, canvasElement.height / 2);

    fallbackShapes.forEach(shape => {
        shape.x += shape.vx;
        shape.y += shape.vy;
        shape.currentAngle += shape.rotationSpeed;

        if (shape.x - shape.radius < 0) { shape.x = shape.radius; shape.vx *= -1; }
        if (shape.x + shape.radius > canvasElement.width) { shape.x = canvasElement.width - shape.radius; shape.vx *= -1; }
        if (shape.y - shape.radius < 0) { shape.y = shape.radius; shape.vy *= -1; }
        if (shape.y + shape.radius > canvasElement.height) { shape.y = canvasElement.height - shape.radius; shape.vy *= -1; }

        ctx.beginPath();
        for (let i = 0; i < shape.sides; i++) {
            const angle = (i / shape.sides) * Math.PI * 2 + shape.currentAngle;
            const x = shape.x + shape.radius * Math.cos(angle);
            const y = shape.y + shape.radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = 2 + Math.random();
        ctx.stroke();
    });
}

function updateMidiDeviceLists() { availableMidiOutputs.clear(); availableMidiInputs.clear(); if (!midiAccess) return; midiAccess.outputs.forEach(output => availableMidiOutputs.set(output.id, output)); midiAccess.inputs.forEach(input => availableMidiInputs.set(input.id, input)); populateMidiOutputSelect(); populateMidiInputSelect(); }
function populateMidiOutputSelect() { if(!midiOutputSelect) return; const prevId = midiOutput ? midiOutput.id : null; midiOutputSelect.innerHTML = ''; if (availableMidiOutputs.size === 0) { midiOutputSelect.add(new Option("Nenhuma saída MIDI", "", true, true)); midiOutput = null; return; } availableMidiOutputs.forEach(out => midiOutputSelect.add(new Option(out.name, out.id))); if (prevId && availableMidiOutputs.has(prevId)) midiOutputSelect.value = prevId; midiOutput = availableMidiOutputs.get(midiOutputSelect.value) || null; }
function populateMidiInputSelect() { if(!midiInputSelect) return; const prevId = midiInput ? midiInput.id : null; midiInputSelect.innerHTML = ''; if (availableMidiInputs.size === 0) { midiInputSelect.add(new Option("Nenhuma entrada MIDI", "", true, true)); setMidiInput(null); return; } availableMidiInputs.forEach(inp => midiInputSelect.add(new Option(inp.name, inp.id))); if (prevId && availableMidiInputs.has(prevId)) midiInputSelect.value = prevId; setMidiInput(availableMidiInputs.get(midiInputSelect.value) || null); }
function setMidiInput(inputPort) { if (midiInput) midiInput.onmidimessage = null; midiInput = inputPort; if (midiInput) { midiInput.onmidimessage = handleMidiMessage; console.log("MIDI Input:", midiInput.name); } }
async function initMidi() { try { if (navigator.requestMIDIAccess) { midiAccess = await navigator.requestMIDIAccess({ sysex: false }); console.log("MIDI Access Granted"); updateMidiDeviceLists(); midiAccess.onstatechange = (e) => { console.log("MIDI state change:", e.port.name, e.port.type, e.port.state); updateMidiDeviceLists(); }; } else console.warn("Web MIDI API não suportada."); } catch (error) { console.error("Não foi possível acessar MIDI.", error); } }
function handleMidiMessage(event) { if (!midiFeedbackEnabled || spectatorModeActive) return; const cmd = event.data[0] >> 4; const ch = event.data[0] & 0x0F; const data1 = event.data[1]; const data2 = event.data.length > 2 ? event.data[2] : 0; let oscAddr = null, oscArgs = [ch, data1]; if (cmd === 9 && data2 > 0) { oscAddr = '/midi/in/noteOn'; oscArgs.push(data2); } else if (cmd === 8 || (cmd === 9 && data2 === 0)) { oscAddr = '/midi/in/noteOff'; } else if (cmd === 11) { oscAddr = '/midi/in/cc'; oscArgs.push(data2); } else if (cmd === 14) { oscAddr = '/midi/in/pitchbend'; oscArgs = [ch, (data2 << 7) | data1]; } if (oscAddr) { sendOSCMessage(oscAddr, ...oscArgs); logOSC("MIDI->OSC", oscAddr, oscArgs); if (dmxSyncModeActive && (oscAddr === '/midi/in/noteOn' || oscAddr === '/midi/in/noteOff')) { sendOSCMessage('/dmx/note', data1, oscAddr === '/midi/in/noteOn' ? data2 : 0); logOSC("DMX Sync", '/dmx/note', [data1, oscAddr === '/midi/in/noteOn' ? data2 : 0]); } } }
function sendMidiNoteOn(note, velocity, channel, shapeId = -1) {
  if (spectatorModeActive) return;
  const ch = Math.max(0, Math.min(15, channel));
  const n = Math.max(0, Math.min(127, Math.round(note)));
  const v = Math.max(0, Math.min(127, Math.round(velocity)));

  if (midiEnabled && midiOutput) {
    midiOutput.send([0x90 + ch, n, v]);
  }
  if (_internalAudioEnabledMaster && simpleSynth && typeof simpleSynth.noteOn === 'function') {
    simpleSynth.noteOn(n, v);
  }
  sendOSCMessage(`/forma/${shapeId}/noteOn`, n, v, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, v);
}

function sendMidiNoteOff(note, channel, shapeId = -1) {
  if (spectatorModeActive) return;
  const ch = Math.max(0, Math.min(15, channel));
  const n = Math.max(0, Math.min(127, Math.round(note)));

  if (midiEnabled && midiOutput) {
    midiOutput.send([0x80 + ch, n, 0]);
  }
  if (_internalAudioEnabledMaster && simpleSynth && typeof simpleSynth.noteOff === 'function') {
    simpleSynth.noteOff(n);
  }
  sendOSCMessage(`/forma/${shapeId}/noteOff`, n, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, 0);
}

function sendPitchBend(bendValue, channel) { if (spectatorModeActive || !midiEnabled || !midiOutput) return; const ch = Math.max(0,Math.min(15,channel)); const bend = Math.max(0,Math.min(16383,Math.round(bendValue))); midiOutput.send([0xE0+ch, bend & 0x7F, (bend>>7)&0x7F]); }
function sendMidiCC(cc, value, channel) { if (spectatorModeActive || !midiEnabled || !midiOutput) return; const ch = Math.max(0,Math.min(15,channel)); const c = Math.max(0,Math.min(119,Math.round(cc))); const v = Math.max(0,Math.min(127,Math.round(value))); midiOutput.send([0xB0+ch, c, v]); }

function turnOffAllActiveNotesForShape(shape) {
    stopAllNotesForShape(shape, true);
}

function turnOffAllActiveNotes() {
    if (spectatorModeActive) return;
    logDebug("Desligando todas as notas ativas para todas as formas (MIDI e Interno).");

    const origMidiEnabled = midiEnabled;
    midiEnabled = true;

    shapes.forEach(shape => stopAllNotesForShape(shape, true));

    midiEnabled = origMidiEnabled;

    if (simpleSynth && typeof simpleSynth.allNotesOff === 'function') {
        simpleSynth.allNotesOff();
    }
    clearAllNoteTimers();
}

function resetMidiSystem() {
    if (spectatorModeActive) return;
    console.log("MIDI Reset.");
    logDebug("Sistema MIDI Resetado.");
    turnOffAllActiveNotes();

    const origMidiEnabled = midiEnabled;
    midiEnabled = true;
    if (midiOutput) {
        for (let ch = 0; ch < 16; ch++) {
            sendMidiCC(120, 0, ch); // All Sound Off
            sendMidiCC(123, 0, ch); // All Notes Off
            sendMidiCC(121, 0, ch); // Reset All Controllers
            sendPitchBend(8192, ch); // Reset Pitch Bend
        }
    }
    midiEnabled = origMidiEnabled;

  shapes.forEach(s => {
    s.currentPitchBend = 8192;
    s.reverbAmount = 0; s.delayAmount = 0; s.panValue = 64;
    s.brightnessValue = 64; s.modWheelValue = 0; s.resonanceValue = 0;
    s.lastSentReverb = -1; s.lastSentDelay = -1; s.lastSentPan = -1;
    s.lastSentBrightness = -1; s.lastSentModWheel = -1; s.lastSentResonance = -1;
  });
  updateHUD();
  sendAllGlobalStatesOSC();
  displayGlobalError("Sistema MIDI Resetado.", 3000);
  logOSC("SYSTEM", "MIDI Reset", []);
}

function loadOscSettings() { const stored = localStorage.getItem(OSC_SETTINGS_KEY); let loadedHost = location.hostname; let loadedPort = 8080; if (stored) { try { const s = JSON.parse(stored); if (s.host) loadedHost = s.host; if (s.port) loadedPort = parseInt(s.port,10); } catch(e){ loadedHost = location.hostname || "127.0.0.1"; loadedPort = 8080; }} else { loadedHost = location.hostname || "127.0.0.1"; loadedPort = 8080; } OSC_HOST = loadedHost || "127.0.0.1"; OSC_PORT = loadedPort || 8080; if (oscHostInput) oscHostInput.value = OSC_HOST; if (oscPortInput) oscPortInput.value = OSC_PORT; console.log(`OSC Config: ${OSC_HOST}:${OSC_PORT}`); }
function saveOscSettings(host, port) { const newPort = parseInt(port,10); if (isNaN(newPort) || newPort<1 || newPort>65535) { displayGlobalError("Porta OSC inválida.",5000); return false; } if (!host || host.trim()==="") { displayGlobalError("Host OSC vazio.",5000); return false; } const settings = {host:host.trim(), port:newPort}; try { localStorage.setItem(OSC_SETTINGS_KEY, JSON.stringify(settings)); OSC_HOST=settings.host; OSC_PORT=settings.port; console.log(`OSC Salvo: ${OSC_HOST}:${OSC_PORT}`); if(oscHostInput) oscHostInput.value = OSC_HOST; if(oscPortInput) oscPortInput.value = OSC_PORT; if (osc && typeof setupOSC === 'function') setupOSC(); return true; } catch(e) { displayGlobalError("Erro salvar OSC.",5000); return false; } }
function sendOSCMessage(address, ...args) { logDebug(`Enviando OSC: ${address}`, args); if (spectatorModeActive && !address.startsWith('/ping')) return; if (osc && osc.status() === OSC.STATUS.IS_OPEN) { const message = new OSC.Message(address, ...args); try { osc.send(message); } catch (error) { logDebug("Erro ao enviar OSC", { address, args, error }); if (osc.status() !== OSC.STATUS.IS_OPEN && reconnectOSCButton) { reconnectOSCButton.style.display = 'inline-block'; oscStatus = "OSC Erro Envio"; updateHUD(); } } } else { logDebug("OSC não conectado, não foi possível enviar.", { address, args, oscStatus: osc?.status() }); if (reconnectOSCButton && osc && osc.status() !== OSC.STATUS.IS_OPEN) { reconnectOSCButton.style.display = 'inline-block'; } } if (isRecordingOSC && !address.startsWith('/ping')) { recordedOSCSequence.push({ timestamp: performance.now() - recordingStartTime, message: { address: address, args: args } }); } }
function sendOSCHeartbeat() { sendOSCMessage('/ping', Date.now()); }
function setupOSC() { logDebug(`Configurando OSC para ws://${OSC_HOST}:${OSC_PORT}`); if (osc && osc.status() === OSC.STATUS.IS_OPEN) { logDebug("Fechando conexão OSC existente."); osc.close(); } if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; console.log(`Conectando OSC: ws://${OSC_HOST}:${OSC_PORT}`); osc = new OSC({ plugin: new OSC.WebsocketClientPlugin({ host: OSC_HOST, port: OSC_PORT, secure: false }) }); osc.on('open', () => { oscStatus = `OSC Conectado (ws://${OSC_HOST}:${OSC_PORT})`; console.log(oscStatus); logDebug("OSC conectado."); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = setInterval(sendOSCHeartbeat, 5000); sendOSCHeartbeat(); sendAllGlobalStatesOSC(); if (reconnectOSCButton) reconnectOSCButton.style.display = 'none'; updateHUD(); }); osc.on('close', (event) => { oscStatus = "OSC Desconectado"; logDebug("OSC desconectado.", event); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); }); osc.on('error', (err) => { oscStatus = "OSC Erro Conexão"; logDebug("OSC Erro Conexão.", err); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); }); osc.on('message', (msg) => { logDebug("OSC Mensagem recebida (bruta):", msg); try { let pMsg = msg; if (msg.args && msg.args.length > 0 && typeof msg.args[0] === 'string') { try { const pJson = JSON.parse(msg.args[0]); if (pJson.type === "confirmation" || (pJson.address && pJson.args)) { pMsg = pJson; logDebug("OSC Mensagem (após parse JSON de args[0]):", pMsg); } } catch (e) { /* não era JSON, ignora */ } } if (pMsg && pMsg.address) { logOSC("IN (UDP)", pMsg.address, pMsg.args); handleIncomingExternalOSC(pMsg); } else { logDebug("Mensagem OSC recebida ignorada (sem endereço após processamento):", pMsg); } } catch (e) { logDebug("Erro ao processar mensagem OSC recebida:", { error: e, originalMessage: msg }); } }); try { osc.open(); } catch (error) { oscStatus = `OSC Falha: ${error.message}`; logDebug("Falha ao abrir conexão OSC.", error); if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); } osc.on('/global/setExternalBPM', msg => { /* ... */ }); osc.on('/global/setScale', msg => { /* ... */ }); }
function handleIncomingExternalOSC(oscMessage) { logDebug("Processando OSC Externo:", oscMessage); /* ... */ }
function sendAllGlobalStatesOSC() { if (spectatorModeActive) return; logDebug("Enviando todos os estados globais via OSC."); sendOSCMessage('/global/state/midiEnabled', midiEnabled?1:0); sendOSCMessage('/global/state/pulseMode', pulseModeActive?1:0); sendOSCMessage('/global/state/staccatoMode', staccatoModeActive?1:0); /* ... more ... */ }
function logOSC(source, address, args, isSeparator = false) { if (oscLogTextarea) { if (isSeparator) { oscLogTextarea.value += `--- Log Separator (${new Date().toLocaleTimeString()}) ---\n`; lastLogSource = "SEPARATOR"; oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight; return; } const timestamp = new Date().toLocaleTimeString(); let sourcePrefix = "SYS"; switch(source.toUpperCase()){ case "OUT": sourcePrefix="OUT"; break; case "IN (UDP)": sourcePrefix="UDP"; break; case "MIDI->OSC": sourcePrefix="MIDI"; break; case "LOOP": sourcePrefix="LOOP"; break; case "PANEL": sourcePrefix="PANEL"; break; case "REC INFO": sourcePrefix="REC"; break;} if (source.toUpperCase() !== lastLogSource && lastLogSource !== "" && lastLogSource !== "SEPARATOR") oscLogTextarea.value += `-------------------------------------\n`; lastLogSource = source.toUpperCase(); const type = args && args.length > 0 && typeof args[0] === 'object' && args[0].type ? ` (${args.map(a => a.type).join(', ')})` : ''; oscLogTextarea.value += `${timestamp} [${sourcePrefix}] ${address}${type} ${JSON.stringify(args)}\n`; oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight; } }
function exportOSCLog() { /* ... */ }

function getShapeState(shape) { return { radius: shape.radius, sides: shape.sides, reverbAmount: shape.reverbAmount, delayAmount: shape.delayAmount, panValue: shape.panValue, brightnessValue: shape.brightnessValue, modWheelValue: shape.modWheelValue, resonanceValue: shape.resonanceValue, }; }
function applyShapeState(shape, state) { if (!state) return; shape.radius = state.radius !== undefined ? state.radius : shape.radius; shape.sides = state.sides !== undefined ? state.sides : shape.sides; /* ... more ... */ if (state.sides !== undefined) { if(shape.currentEdgeIndex >= shape.sides) shape.currentEdgeIndex = Math.max(0, shape.sides-1); turnOffAllActiveNotesForShape(shape); } updateHUD(); }
function saveShapePreset() { if (spectatorModeActive) return; const presetName = presetNameInput.value.trim(); if (!presetName) { alert("Insira nome para preset."); return; } const selectedShapeIndex = parseInt(shapeToPresetSelect.value,10); if (isNaN(selectedShapeIndex) || selectedShapeIndex<0 || selectedShapeIndex>=shapes.length) return; const shape = shapes[selectedShapeIndex]; const shapeState = getShapeState(shape); if (!shapePresets[presetName]) shapePresets[presetName] = {}; shapePresets[presetName][`shape${selectedShapeIndex}`] = shapeState; localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(shapePresets)); populateSavedPresetsSelect(); savedPresetsSelect.value = presetName; displayGlobalError(`Preset '${presetName}' salvo.`,3000); }
function loadShapePreset() { if (spectatorModeActive) return; const presetName = savedPresetsSelect.value; if (!presetName || !shapePresets[presetName]) return; const selectedShapeIndex = parseInt(shapeToPresetSelect.value,10); if (isNaN(selectedShapeIndex) || selectedShapeIndex<0 || selectedShapeIndex>=shapes.length) return; const presetData = shapePresets[presetName]; const shapeStateToApply = presetData[`shape${selectedShapeIndex}`]; if (shapeStateToApply) { applyShapeState(shapes[selectedShapeIndex], shapeStateToApply); presetNameInput.value = presetName; displayGlobalError(`Preset '${presetName}' carregado.`,3000); } }
function deleteSelectedPreset() { if (spectatorModeActive) return; const presetName = savedPresetsSelect.value; if (!presetName || !shapePresets[presetName]) return; if (confirm(`Deletar '${presetName}'?`)) { delete shapePresets[presetName]; localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(shapePresets)); populateSavedPresetsSelect(); presetNameInput.value = ""; displayGlobalError(`Preset '${presetName}' deletado.`,3000); } }
function populateSavedPresetsSelect() { if (!savedPresetsSelect) return; const currentSelection = savedPresetsSelect.value; savedPresetsSelect.innerHTML = ''; Object.keys(shapePresets).sort().forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; savedPresetsSelect.appendChild(option); }); if (shapePresets[currentSelection]) savedPresetsSelect.value = currentSelection; else if (savedPresetsSelect.options.length > 0) savedPresetsSelect.selectedIndex = 0; presetNameInput.value = (savedPresetsSelect.value && shapePresets[savedPresetsSelect.value]) ? savedPresetsSelect.value : ""; }
function exportAllPresets() { if (Object.keys(shapePresets).length === 0) { alert("Nenhum preset."); return; } const jsonString = JSON.stringify(shapePresets, null, 2); const blob = new Blob([jsonString],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `midiShapePresets_v48_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); displayGlobalError("Presets exportados.",3000); } // V48 update
function importAllPresets() { if (!spectatorModeActive) importPresetFileInput.click(); }
function handleImportPresetFile(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const imported = JSON.parse(e.target.result); if (typeof imported !== 'object' || imported === null) throw new Error("JSON inválido."); let imp=0,ovr=0; for(const pN in imported){if(shapePresets[pN])ovr++;else imp++; shapePresets[pN]=imported[pN];} localStorage.setItem(PRESETS_STORAGE_KEY,JSON.stringify(shapePresets)); populateSavedPresetsSelect(); displayGlobalError(`Importados. Novos:${imp}, Sobrescritos:${ovr}.`,5000); } catch (error) { alert(`Erro importar: ${error.message}`);} finally {importPresetFileInput.value='';} }; reader.readAsText(file); }
function loadPresetsFromStorage() { const stored = localStorage.getItem(PRESETS_STORAGE_KEY); if (stored) { try { shapePresets = JSON.parse(stored); } catch (e) { shapePresets = {}; localStorage.removeItem(PRESETS_STORAGE_KEY); } } else shapePresets = {}; populateSavedPresetsSelect(); }
function populateShapeToPresetSelect() { if (!shapeToPresetSelect) return; shapeToPresetSelect.innerHTML = ''; shapes.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `Forma ${i + 1}`; shapeToPresetSelect.appendChild(o); }); if (shapes.length > 0) shapeToPresetSelect.value = "0"; }
function initPresetManager() { loadPresetsFromStorage(); populateShapeToPresetSelect(); if (shapePresetButton) shapePresetButton.addEventListener('click', () => {if(shapePresetModal) shapePresetModal.style.display = 'flex'; populateSavedPresetsSelect(); if (savedPresetsSelect.value) presetNameInput.value = savedPresetsSelect.value;}); if (closeShapePresetModalButton) closeShapePresetModalButton.addEventListener('click', () => {if(shapePresetModal) shapePresetModal.style.display = 'none';}); if (saveShapePresetButton) saveShapePresetButton.addEventListener('click', saveShapePreset); if (loadShapePresetButton) loadShapePresetButton.addEventListener('click', loadShapePreset); if (deleteSelectedPresetButton) deleteSelectedPresetButton.addEventListener('click', deleteSelectedPreset); if (exportAllPresetsButton) exportAllPresetsButton.addEventListener('click', exportAllPresets); if (importAllPresetsButton) importAllPresetsButton.addEventListener('click', importAllPresets); if (importPresetFileInput) importPresetFileInput.addEventListener('change', handleImportPresetFile); if (savedPresetsSelect) savedPresetsSelect.addEventListener('change', () => { if (savedPresetsSelect.value) presetNameInput.value = savedPresetsSelect.value; }); }

function applyTheme(theme) { document.body.classList.remove('theme-dark','theme-light'); document.body.classList.add(theme); currentTheme = theme; if (themeToggleButton) themeToggleButton.textContent = theme === 'theme-dark' ? '🌙' : '☀️'; }
function toggleTheme() { if(spectatorModeActive) return; const newTheme = currentTheme === 'theme-dark' ? 'theme-light' : 'theme-dark'; applyTheme(newTheme); localStorage.setItem(THEME_STORAGE_KEY, newTheme); logOSC("SYSTEM","Tema Alterado",[newTheme]); }
function loadTheme() { const savedTheme = localStorage.getItem(THEME_STORAGE_KEY); applyTheme((savedTheme && (savedTheme==='theme-dark'||savedTheme==='theme-light')) ? savedTheme : 'theme-dark'); }

function generateMockLandmarks(hand="Right",shapeCenterX,shapeCenterY){const landmarks=[];const time=performance.now()/1000;const wristX=(canvasElement.width-shapeCenterX)/canvasElement.width+Math.sin(time*0.5+(hand==="Left"?Math.PI:0))*0.05;const wristY=shapeCenterY/canvasElement.height+Math.cos(time*0.5+(hand==="Left"?Math.PI:0))*0.05;landmarks.push({x:wristX,y:wristY,z:0});const fingerBaseRadius=0.08;const fingerTipRadiusVariance=0.02;const thumbAngle=Math.PI*1.5+Math.sin(time*1.2+(hand==="Left"?0.5:0))*0.3;landmarks[4]={x:wristX+(fingerBaseRadius+Math.cos(time*1.5)*fingerTipRadiusVariance)*Math.cos(thumbAngle),y:wristY+(fingerBaseRadius+Math.cos(time*1.5)*fingerTipRadiusVariance)*Math.sin(thumbAngle)*(canvasElement.width/canvasElement.height),z:0.01};const indexAngle=Math.PI*1.8+Math.cos(time*1.0+(hand==="Left"?0.7:0.2))*0.4;landmarks[8]={x:wristX+(fingerBaseRadius+0.02+Math.sin(time*1.7)*fingerTipRadiusVariance)*Math.cos(indexAngle),y:wristY+(fingerBaseRadius+0.02+Math.sin(time*1.7)*fingerTipRadiusVariance)*Math.sin(indexAngle)*(canvasElement.width/canvasElement.height),z:0.02};landmarks[12]={x:wristX+fingerBaseRadius*0.9,y:wristY-fingerBaseRadius*0.5,z:0.03};landmarks[16]={x:wristX+fingerBaseRadius*0.8,y:wristY-fingerBaseRadius*0.6,z:0.02};landmarks[20]={x:wristX+fingerBaseRadius*0.7,y:wristY-fingerBaseRadius*0.7,z:0.01};for(let i=0;i<21;i++){if(!landmarks[i]){if(i>0&&landmarks[i-1])landmarks[i]={...landmarks[i-1],z:landmarks[i-1].z+0.005};else if(landmarks[0])landmarks[i]={...landmarks[0],z:landmarks[0].z+i*0.005};else landmarks[i]={x:0.5,y:0.5,z:0.05};}} return landmarks;}
function runGestureSimulation(){if(!gestureSimulationActive)return;const results={multiHandLandmarks:[],multiHandedness:[]};if(operationMode==='one_person'||operationMode==='two_persons'){results.multiHandLandmarks.push(generateMockLandmarks("Right",shapes[0].centerX,shapes[0].centerY));results.multiHandedness.push({score:0.9,index:0,label:"Right"});if(operationMode==='one_person'){results.multiHandLandmarks.push(generateMockLandmarks("Left",shapes[0].centerX-150,shapes[0].centerY));results.multiHandedness.push({score:0.9,index:1,label:"Left"});}else if(operationMode==='two_persons'&&shapes.length>1){results.multiHandLandmarks.push(generateMockLandmarks("Left",shapes[1].centerX,shapes[1].centerY));results.multiHandedness.push({score:0.9,index:1,label:"Left"});}} onResults(results);}
function toggleGestureSimulation(){if(spectatorModeActive){displayGlobalError("Simulação indisponível em modo espectador.",3000);return;} gestureSimulationActive=!gestureSimulationActive;if(gestureSimToggleButton){gestureSimToggleButton.textContent=gestureSimulationActive?"🤖 Sim ON":"🤖 Sim OFF";gestureSimToggleButton.classList.toggle('active',gestureSimulationActive);} if(gestureSimulationActive){if(cameraError)console.log("Simulação ATIVADA (câmera erro).");else console.log("Simulação ATIVADA.");if(gestureSimIntervalId)clearInterval(gestureSimIntervalId);gestureSimIntervalId=setInterval(runGestureSimulation,GESTURE_SIM_INTERVAL);}else{console.log("Simulação DESATIVADA.");if(gestureSimIntervalId){clearInterval(gestureSimIntervalId);gestureSimIntervalId=null;} shapes.forEach(s=>{s.leftHandLandmarks=null;s.rightHandLandmarks=null;s.activeGesture=null;});} updateHUD();logOSC("SYSTEM","Simulação Gestos",[gestureSimulationActive?"ON":"OFF"]);}

function setupEventListeners() {
    const closeModalButton = document.getElementById('closeModal');
    const infoModal = document.getElementById('infoModal');

    if (sidebar && sidebarHandle) {
        sidebarHandle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = sidebar.classList.toggle('open');
            sidebarHandle.textContent = isOpen ? '←' : '☰';
        });
        document.addEventListener('click', (event) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && event.target !== sidebarHandle) {
                sidebar.classList.remove('open');
                sidebarHandle.textContent = '☰';
            }
        });
        sidebar.addEventListener('click', (event) => event.stopPropagation() );
    }

    const infoButtonElement = document.getElementById('info');
    if (infoButtonElement && infoModal) infoButtonElement.addEventListener('click', () => { infoModal.style.display = 'flex'; });
    if (closeModalButton && infoModal) closeModalButton.addEventListener('click', () => { infoModal.style.display = 'none'; });
    if (infoHudButton && hudElement) { infoHudButton.addEventListener('click', () => { const isHidden = hudElement.classList.toggle('hidden'); if (isHidden) { infoHudButton.textContent = "ℹ️ Mostrar HUD"; infoHudButton.classList.remove('active'); } else { infoHudButton.textContent = "ℹ️ Ocultar HUD"; infoHudButton.classList.add('active'); updateHUD(); } }); if (hudElement.classList.contains('hidden')) { infoHudButton.textContent = "ℹ️ Mostrar HUD"; infoHudButton.classList.remove('active'); } else { infoHudButton.textContent = "ℹ️ Ocultar HUD"; infoHudButton.classList.add('active'); } }
    if (settingsButton && settingsModal) settingsButton.addEventListener('click', () => { settingsModal.style.display = 'flex'; updateModalSynthControls(); });
    if (closeSettingsModalButton && settingsModal) closeSettingsModalButton.addEventListener('click', () => { settingsModal.style.display = 'none'; });
    if (oscConfigButton && oscConfigModal) { oscConfigButton.addEventListener('click', () => { oscHostInput.value = OSC_HOST; oscPortInput.value = OSC_PORT; oscConfigModal.style.display = 'flex'; }); }
    if (closeOscConfigModalButton && oscConfigModal) closeOscConfigModalButton.addEventListener('click', () => { oscConfigModal.style.display = 'none'; }); // Corrected ID
    const closeOscConfigModalBtnGeneric = document.getElementById('closeOscConfigModalBtnGeneric');
    if(closeOscConfigModalBtnGeneric && oscConfigModal) closeOscConfigModalBtnGeneric.addEventListener('click', () => oscConfigModal.style.display = 'none');

    if (saveOscConfigButton && oscConfigModal) saveOscConfigButton.addEventListener('click', () => { const newHost = oscHostInput.value.trim(); const newPort = parseInt(oscPortInput.value,10); if(!newHost){alert("IP OSC vazio.");return;} if(isNaN(newPort)||newPort<1||newPort>65535){alert("Porta OSC inválida.");return;} if(saveOscSettings(newHost,newPort)){logOSC("SYSTEM","Config OSC salva",{host:newHost,port:newPort});displayGlobalError(`Config OSC: ${newHost}:${newPort}. Reconectando...`,3000);if(oscConfigModal)oscConfigModal.style.display='none';setupOSC();}});

    // V65: Arp Panel Button Listener
    if (toggleArpPanelButtonFixed && arpeggiatorControlsPanel) {
        const arpPanelInitiallyHidden = loadPersistentSetting('arpPanelHidden', true);
        if (arpPanelInitiallyHidden) {
            arpeggiatorControlsPanel.classList.remove('open');
            toggleArpPanelButtonFixed.classList.remove('active');
        } else {
            arpeggiatorControlsPanel.classList.add('open');
            toggleArpPanelButtonFixed.classList.add('active');
        }
        toggleArpPanelButtonFixed.addEventListener('click', () => {
            const isOpen = arpeggiatorControlsPanel.classList.toggle('open');
            toggleArpPanelButtonFixed.classList.toggle('active', isOpen);
            savePersistentSetting('arpPanelHidden', !isOpen);
            logOSC("SYSTEM", "Painel Arp Alternado", [isOpen ? "Mostrando" : "Ocultando"]);
        });
    }

    // V65: Arp Panel Control Listeners (replaces old modal listeners)
    if (arpPanelStyleSelect) arpPanelStyleSelect.addEventListener('change', (e) => { if(spectatorModeActive)return; currentArpeggioStyle = e.target.value; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioStyle', currentArpeggioStyle);});
    if (arpPanelBPMSlider) arpPanelBPMSlider.addEventListener('input', (e) => { if(spectatorModeActive||externalBPM!==null)return; arpeggioBPM = parseInt(e.target.value); updateBPMValues(arpeggioBPM); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM); });
    if (arpPanelNoteIntervalSlider) arpPanelNoteIntervalSlider.addEventListener('input', (e) => { if(spectatorModeActive||externalBPM!==null)return; noteInterval = parseInt(e.target.value); updateNoteIntervalValues(noteInterval); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', Math.round(arpeggioBPM)); });
    if (arpPanelRandomnessSlider) arpPanelRandomnessSlider.addEventListener('input', (e) => { if(spectatorModeActive) return; arpRandomness = parseInt(e.target.value); if(arpPanelRandomnessValueSpan) arpPanelRandomnessValueSpan.textContent = arpRandomness; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpRandomness', arpRandomness); });
    if (arpPanelSwingSlider) arpPanelSwingSlider.addEventListener('input', (e) => { if(spectatorModeActive) return; arpSwing = parseInt(e.target.value); if(arpPanelSwingValueSpan) arpPanelSwingValueSpan.textContent = arpSwing; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpSwing', arpSwing); });
    if (arpPanelGhostNoteChanceSlider) arpPanelGhostNoteChanceSlider.addEventListener('input', (e) => { if(spectatorModeActive) return; arpGhostNoteChance = parseInt(e.target.value); if(arpPanelGhostNoteChanceValueSpan) arpPanelGhostNoteChanceValueSpan.textContent = arpGhostNoteChance; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpGhostNoteChance', arpGhostNoteChance); });

    // if (arpeggioSettingsButton) arpeggioSettingsButton.addEventListener('click', () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = 'flex'}); // V65: REMOVED
    // if (closeArpeggioSettingsModalButton) closeArpeggioSettingsModalButton.addEventListener('click', () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = 'none'}); // V65: REMOVED

    if (closeOscControlModalButton) closeOscControlModalButton.addEventListener('click', () => {if(oscControlModal) oscControlModal.style.display = 'none'});
    window.addEventListener('click', (event) => { if (event.target.classList.contains('modal-overlay')) event.target.style.display = 'none'; });
    if (midiOutputSelect) midiOutputSelect.addEventListener('change', () => { midiOutput = availableMidiOutputs.get(midiOutputSelect.value) || null; turnOffAllActiveNotes(); saveAllPersistentSettings(); });
    if (midiInputSelect) midiInputSelect.addEventListener('change', () => { setMidiInput(availableMidiInputs.get(midiInputSelect.value) || null); saveAllPersistentSettings(); });

    if (sendTestOSCButton) sendTestOSCButton.addEventListener('click', () => { /* ... */ });
    if (clearOscLogButton) clearOscLogButton.addEventListener('click', () => { if(oscLogTextarea) { oscLogTextarea.value = `Log OSC limpo (${new Date().toLocaleTimeString()}).\n`; lastLogSource = "";}});
    if (exportOscLogButton) exportOscLogButton.addEventListener('click', exportOSCLog);
    if (oscLoopDurationInput) oscLoopDurationInput.addEventListener('change', () => { if(spectatorModeActive)return; const d = parseInt(oscLoopDurationInput.value); if (d > 0) oscLoopDuration = d; else oscLoopDurationInput.value = oscLoopDuration; saveAllPersistentSettings(); });
    if (midiToggleButton) midiToggleButton.addEventListener('click', toggleMidiEnabled);
    if (syncDMXNotesButton) syncDMXNotesButton.addEventListener('click', toggleDMXSync);
    if (midiFeedbackToggleButton) midiFeedbackToggleButton.addEventListener('click', toggleMidiFeedback);
    if (recordOSCButton) recordOSCButton.addEventListener('click', toggleOSCRecording);
    if (playOSCLoopButton) playOSCLoopButton.addEventListener('click', playRecordedOSCLoop);
    if (spectatorModeButton) spectatorModeButton.addEventListener('click', toggleSpectatorMode);
    if (themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
    if (gestureSimToggleButton) gestureSimToggleButton.addEventListener('click', toggleGestureSimulation);
    if (reconnectOSCButton) reconnectOSCButton.addEventListener('click', () => { logOSC("SYSTEM","Reconectando OSC...",[]); if(reconnectOSCButton)reconnectOSCButton.disabled=true; setupOSC(); setTimeout(()=>{if(osc && osc.status() !== OSC.STATUS.IS_OPEN && reconnectOSCButton)reconnectOSCButton.disabled=false;}, OSC_RECONNECT_TIMEOUT+500); });
    if (cameraSelectElement) cameraSelectElement.addEventListener('change', (event) => { const newDeviceId = event.target.value; if (newDeviceId === currentCameraDeviceId && mediaStream) return; initializeCamera(newDeviceId || null).then(() => updateHUD()); });

    // === V65: Play/Pause Button Event Listener ===
    if (playPauseButton) {
        playPauseButton.addEventListener('click', togglePlayPause);
    }
    // === END V65 ===

    // V63: Initialize Gesture Mapping UI
    // initGestureMappingControls(); // Removido, pois renderGestureMappingUI é chamado conforme necessário.
    renderGestureMappingUI(); // Chamada inicial para configurar a UI do modal
    updateActiveGestureMappingsList(); // Atualiza a lista de mapeamentos ativos

    if (internalAudioToggleButton) {
        internalAudioToggleButton.addEventListener("click", async () => {
            try {
                if (!_internalAudioEnabledMaster) {
                    if (!audioCtx) {
                        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        console.log("AudioContext inicializado via botão de áudio.");
                    }
                    if (!simpleSynth && audioCtx) {
                        simpleSynth = new SimpleSynth(audioCtx);
                        console.log("SimpleSynth inicializado via botão de áudio.");
                        const loadedSettings = loadAllPersistentSettings();
                        if (simpleSynth && loadedSettings.audioSettings) {
                             Object.keys(loadedSettings.audioSettings).forEach(key => {
                                const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
                                if (typeof simpleSynth[setterName] === 'function') {
                                    simpleSynth[setterName](loadedSettings.audioSettings[key]);
                                } else if (key === 'masterVolume' && typeof simpleSynth.setMasterVolume === 'function') {
                                    simpleSynth.setMasterVolume(loadedSettings.audioSettings[key]);
                                }
                            });
                            updateModalSynthControls();
                            updateSidebarSynthControls();
                            console.log("Configurações do synth aplicadas após criação via botão.");
                        }
                    }
                    if (audioCtx && audioCtx.state === "suspended") {
                        await audioCtx.resume();
                        console.log("AudioContext resumed via botão de áudio.");
                    }
                    _internalAudioEnabledMaster = true;
                    internalAudioToggleButton.textContent = "🔊 Áudio ON";
                    internalAudioToggleButton.classList.add("active");
                } else {
                    if (simpleSynth) {
                        simpleSynth.allNotesOff();
                    }
                    _internalAudioEnabledMaster = false;
                    internalAudioToggleButton.textContent = "🔊 Áudio OFF";
                    internalAudioToggleButton.classList.remove("active");
                    console.log("Áudio interno desativado via botão.");
                }
                updateHUD();
                saveAllPersistentSettings();
            } catch (e) {
                console.error("Erro ao ativar/desativar áudio:", e);
                displayGlobalError("Erro ao ativar/desativar áudio interno.");
                _internalAudioEnabledMaster = false;
                internalAudioToggleButton.textContent = "🔊 Áudio OFF";
                internalAudioToggleButton.classList.remove("active");
                updateHUD();
            }
        });
    }

    if (audioWaveformSelect) audioWaveformSelect.addEventListener('change', (e) => handleSynthControlChange('waveform', e.target.value));
    if (audioMasterVolumeSlider) audioMasterVolumeSlider.addEventListener('input', (e) => handleSynthControlChange('masterVolume', parseFloat(e.target.value)));
    if (audioAttackSlider) audioAttackSlider.addEventListener('input', (e) => handleSynthControlChange('attack', parseFloat(e.target.value)));
    if (audioDecaySlider) audioDecaySlider.addEventListener('input', (e) => handleSynthControlChange('decay', parseFloat(e.target.value)));
    if (audioSustainSlider) audioSustainSlider.addEventListener('input', (e) => handleSynthControlChange('sustain', parseFloat(e.target.value)));
    if (audioReleaseSlider) audioReleaseSlider.addEventListener('input', (e) => handleSynthControlChange('release', parseFloat(e.target.value)));
    if (audioDistortionSlider) audioDistortionSlider.addEventListener('input', (e) => handleSynthControlChange('distortion', parseFloat(e.target.value)));

    if (audioFilterCutoffSlider) audioFilterCutoffSlider.addEventListener('input', (e) => handleSynthControlChange('filterCutoff', parseFloat(e.target.value)));
    if (audioFilterResonanceSlider) audioFilterResonanceSlider.addEventListener('input', (e) => handleSynthControlChange('filterResonance', parseFloat(e.target.value)));

    if (audioLfoWaveformSelect) audioLfoWaveformSelect.addEventListener('change', (e) => handleSynthControlChange('lfoWaveform', e.target.value));
    if (audioLfoRateSlider) audioLfoRateSlider.addEventListener('input', (e) => handleSynthControlChange('lfoRate', parseFloat(e.target.value)));
    if (audioLfoPitchDepthSlider) audioLfoPitchDepthSlider.addEventListener('input', (e) => handleSynthControlChange('lfoPitchDepth', parseFloat(e.target.value)));
    if (audioLfoFilterDepthSlider) audioLfoFilterDepthSlider.addEventListener('input', (e) => handleSynthControlChange('lfoFilterDepth', parseFloat(e.target.value)));

    if (audioDelayTimeSlider) audioDelayTimeSlider.addEventListener('input', (e) => handleSynthControlChange('delayTime', parseFloat(e.target.value)));
    if (audioDelayFeedbackSlider) audioDelayFeedbackSlider.addEventListener('input', (e) => handleSynthControlChange('delayFeedback', parseFloat(e.target.value)));
    if (audioDelayMixSlider) audioDelayMixSlider.addEventListener('input', (e) => handleSynthControlChange('delayMix', parseFloat(e.target.value)));

    if (audioReverbMixSlider) audioReverbMixSlider.addEventListener('input', (e) => handleSynthControlChange('reverbMix', parseFloat(e.target.value)));

    if (toggleSynthPanelButtonFixed && synthControlsSidebar) {
        // V64: Adicionar botão para abrir o modal de mapeamento de gestos na sidebar principal (exemplo)
        // Ou poderia ser um novo botão dedicado. Por ora, vamos adicionar ao painel do synth.
        const gestureMappingButtonSidebar = document.createElement('button');
        gestureMappingButtonSidebar.id = 'openGestureMappingModalButton';
        gestureMappingButtonSidebar.className = 'control-button';
        gestureMappingButtonSidebar.title = 'Configurar Mapeamento de Gestos (Shift+G)';
        gestureMappingButtonSidebar.innerHTML = '🖐️⇢🎹 Mapear Gestos';

        const synthControlsContainer = document.getElementById('synthControlsSidebar'); // Onde adicionar o botão
        const gestureMappingControlsContainer = document.getElementById('gestureMappingControlsContainer'); // Referência ao container de mapeamento

        if (synthControlsContainer && gestureMappingControlsContainer) {
             // Adiciona o botão antes do container de mapeamento de gestos existente, ou no final se não existir
            synthControlsContainer.insertBefore(gestureMappingButtonSidebar, gestureMappingControlsContainer);
        } else if (synthControlsContainer) {
            synthControlsContainer.appendChild(gestureMappingButtonSidebar); // Fallback: adiciona no final
        }

        gestureMappingButtonSidebar.addEventListener('click', () => {
            const modal = document.getElementById('gestureMappingModal');
            if (modal) {
                renderGestureMappingUI(); // Garante que a UI do modal está atualizada
                updateActiveGestureMappingsList();
                modal.style.display = 'flex';
            }
        });

        const closeGestureMappingModalButton = document.getElementById('closeGestureMappingModal');
        if (closeGestureMappingModalButton) {
            closeGestureMappingModalButton.addEventListener('click', () => {
                const modal = document.getElementById('gestureMappingModal');
                if (modal) modal.style.display = 'none';
            });
        }

        const addMappingButton = document.getElementById('addGestureMappingButton');
        if (addMappingButton) {
            addMappingButton.addEventListener('click', addGestureMappingSlot);
        }

        const resetMappingsButton = document.getElementById('resetGestureMappingsButton');
        if (resetMappingsButton) {
            resetMappingsButton.addEventListener('click', resetAllGestureMappings);
        }


        const synthPanelInitiallyHidden = loadPersistentSetting('synthPanelHidden', true);
        if (synthPanelInitiallyHidden) {
            synthControlsSidebar.classList.remove('open');
            toggleSynthPanelButtonFixed.classList.remove('active');
        } else {
            synthControlsSidebar.classList.add('open');
            toggleSynthPanelButtonFixed.classList.add('active');
        }

        toggleSynthPanelButtonFixed.addEventListener('click', () => {
            const isOpen = synthControlsSidebar.classList.toggle('open');
            toggleSynthPanelButtonFixed.classList.toggle('active', isOpen);
            savePersistentSetting('synthPanelHidden', !isOpen);
            logOSC("SYSTEM", "Painel Synth Alternado (Fixo)", [isOpen ? "Mostrando" : "Ocultando"]);
        });
    } else {
        if (!toggleSynthPanelButtonFixed) console.warn("Botão #toggleSynthPanelButtonFixed não encontrado.");
        if (!synthControlsSidebar) console.warn("Elemento #synthControlsSidebar não encontrado.");
    }


    document.addEventListener('keydown', handleKeyPress);
    logDebug("Ouvintes de eventos configurados.");
}

function handleSynthControlChange(param, value) {
    if (spectatorModeActive) return;
    if (!simpleSynth) return;

    switch (param) {
        case 'waveform':
            simpleSynth.setWaveform(value);
            if (audioWaveformSelect) audioWaveformSelect.value = value;
            if (scWaveformSelect) scWaveformSelect.value = value;
            break;
        case 'masterVolume':
            simpleSynth.setMasterVolume(value);
            if (audioMasterVolumeSlider) audioMasterVolumeSlider.value = value;
            if (audioMasterVolumeValueSpan) audioMasterVolumeValueSpan.textContent = value.toFixed(2);
            if (scMasterVolumeSlider) scMasterVolumeSlider.value = value;
            if (scMasterVolumeValue) scMasterVolumeValue.textContent = value.toFixed(2);
            break;
        case 'attack':
            simpleSynth.setAttack(value);
            if (audioAttackSlider) audioAttackSlider.value = value;
            if (audioAttackValueSpan) audioAttackValueSpan.textContent = `${value.toFixed(3)}s`;
            if (scAttackSlider) scAttackSlider.value = value;
            if (scAttackValue) scAttackValue.textContent = `${value.toFixed(3)}s`;
            break;
        case 'decay':
            simpleSynth.setDecay(value);
            if (audioDecaySlider) audioDecaySlider.value = value;
            if (audioDecayValueSpan) audioDecayValueSpan.textContent = `${value.toFixed(3)}s`;
            if (scDecaySlider) scDecaySlider.value = value;
            if (scDecayValue) scDecayValue.textContent = `${value.toFixed(3)}s`;
            break;
        case 'sustain':
            simpleSynth.setSustain(value);
            if (audioSustainSlider) audioSustainSlider.value = value;
            if (audioSustainValueSpan) audioSustainValueSpan.textContent = value.toFixed(2);
            if (scSustainSlider) scSustainSlider.value = value;
            if (scSustainValue) scSustainValue.textContent = value.toFixed(2);
            break;
        case 'release':
            simpleSynth.setRelease(value);
            if (audioReleaseSlider) audioReleaseSlider.value = value;
            if (audioReleaseValueSpan) audioReleaseValueSpan.textContent = `${value.toFixed(3)}s`;
            if (scReleaseSlider) scReleaseSlider.value = value;
            if (scReleaseValue) scReleaseValue.textContent = `${value.toFixed(3)}s`;
            break;
        case 'distortion':
            simpleSynth.setDistortion(value);
            if (audioDistortionSlider) audioDistortionSlider.value = value;
            if (audioDistortionValueSpan) audioDistortionValueSpan.textContent = `${value.toFixed(0)}%`;
            if (scDistortionSlider) scDistortionSlider.value = value;
            if (scDistortionValue) scDistortionValue.textContent = `${value.toFixed(0)}%`;
            break;
        case 'filterCutoff':
            simpleSynth.setFilterCutoff(value);
            if (audioFilterCutoffSlider) audioFilterCutoffSlider.value = value;
            if (audioFilterCutoffValueSpan) audioFilterCutoffValueSpan.textContent = `${value.toFixed(0)} Hz`;
            if (scFilterCutoffSlider) scFilterCutoffSlider.value = value;
            if (scFilterCutoffValue) scFilterCutoffValue.textContent = `${value.toFixed(0)} Hz`;
            break;
        case 'filterResonance':
            simpleSynth.setFilterResonance(value);
            if (audioFilterResonanceSlider) audioFilterResonanceSlider.value = value;
            if (audioFilterResonanceValueSpan) audioFilterResonanceValueSpan.textContent = value.toFixed(1);
            if (scFilterResonanceSlider) scFilterResonanceSlider.value = value;
            if (scFilterResonanceValue) scFilterResonanceValue.textContent = value.toFixed(1);
            break;
        case 'lfoWaveform':
            simpleSynth.setLfoWaveform(value);
            if (audioLfoWaveformSelect) audioLfoWaveformSelect.value = value;
            if (scLfoWaveformSelect) scLfoWaveformSelect.value = value;
            break;
        case 'lfoRate':
            simpleSynth.setLfoRate(value);
            if (audioLfoRateSlider) audioLfoRateSlider.value = value;
            if (audioLfoRateValueSpan) audioLfoRateValueSpan.textContent = `${value.toFixed(1)} Hz`;
            if (scLfoRateSlider) scLfoRateSlider.value = value;
            if (scLfoRateValue) scLfoRateValue.textContent = `${value.toFixed(1)} Hz`;
            break;
        case 'lfoPitchDepth':
            simpleSynth.setLfoPitchDepth(value);
            if (audioLfoPitchDepthSlider) audioLfoPitchDepthSlider.value = value;
            if (audioLfoPitchDepthValueSpan) audioLfoPitchDepthValueSpan.textContent = `${value.toFixed(1)} Hz`;
            if (scLfoPitchDepthSlider) scLfoPitchDepthSlider.value = value;
            if (scLfoPitchDepthValue) scLfoPitchDepthValue.textContent = `${value.toFixed(1)} Hz`;
            break;
        case 'lfoFilterDepth':
            simpleSynth.setLfoFilterDepth(value);
            if (audioLfoFilterDepthSlider) audioLfoFilterDepthSlider.value = value;
            if (audioLfoFilterDepthValueSpan) audioLfoFilterDepthValueSpan.textContent = `${value.toFixed(0)} Hz`;
            if (scLfoFilterDepthSlider) scLfoFilterDepthSlider.value = value;
            if (scLfoFilterDepthValue) scLfoFilterDepthValue.textContent = `${value.toFixed(0)} Hz`;
            break;
        case 'delayTime':
            simpleSynth.setDelayTime(value);
            if (audioDelayTimeSlider) audioDelayTimeSlider.value = value;
            if (audioDelayTimeValueSpan) audioDelayTimeValueSpan.textContent = `${value.toFixed(2)} s`;
            if (scDelayTimeSlider) scDelayTimeSlider.value = value;
            if (scDelayTimeValue) scDelayTimeValue.textContent = `${value.toFixed(2)} s`;
            break;
        case 'delayFeedback':
            simpleSynth.setDelayFeedback(value);
            if (audioDelayFeedbackSlider) audioDelayFeedbackSlider.value = value;
            if (audioDelayFeedbackValueSpan) audioDelayFeedbackValueSpan.textContent = value.toFixed(2);
            if (scDelayFeedbackSlider) scDelayFeedbackSlider.value = value;
            if (scDelayFeedbackValue) scDelayFeedbackValue.textContent = value.toFixed(2);
            break;
        case 'delayMix':
            simpleSynth.setDelayMix(value);
            if (audioDelayMixSlider) audioDelayMixSlider.value = value;
            if (audioDelayMixValueSpan) audioDelayMixValueSpan.textContent = value.toFixed(2);
            if (scDelayMixSlider) scDelayMixSlider.value = value;
            if (scDelayMixValue) scDelayMixValue.textContent = value.toFixed(2);
            break;
        case 'reverbMix':
            simpleSynth.setReverbMix(value);
            if (audioReverbMixSlider) audioReverbMixSlider.value = value;
            if (audioReverbMixValueSpan) audioReverbMixValueSpan.textContent = value.toFixed(2);
            if (scReverbMixSlider) scReverbMixSlider.value = value;
            if (scReverbMixValue) scReverbMixValue.textContent = value.toFixed(2);
            break;
    }
    saveAllPersistentSettings();
    updateHUD();
}

function updateModalSynthControls() {
    if (!simpleSynth || !settingsModal || settingsModal.style.display !== 'flex') return;

    if (audioWaveformSelect) audioWaveformSelect.value = simpleSynth.waveform;
    if (audioMasterVolumeSlider) audioMasterVolumeSlider.value = simpleSynth.masterGainNode.gain.value;
    if (audioMasterVolumeValueSpan) audioMasterVolumeValueSpan.textContent = simpleSynth.masterGainNode.gain.value.toFixed(2);
    if (audioAttackSlider) audioAttackSlider.value = simpleSynth.attackTime;
    if (audioAttackValueSpan) audioAttackValueSpan.textContent = `${simpleSynth.attackTime.toFixed(3)}s`;
    if (audioDecaySlider) audioDecaySlider.value = simpleSynth.decayTime;
    if (audioDecayValueSpan) audioDecayValueSpan.textContent = `${simpleSynth.decayTime.toFixed(3)}s`;
    if (audioSustainSlider) audioSustainSlider.value = simpleSynth.sustainLevel;
    if (audioSustainValueSpan) audioSustainValueSpan.textContent = simpleSynth.sustainLevel.toFixed(2);
    if (audioReleaseSlider) audioReleaseSlider.value = simpleSynth.releaseTime;
    if (audioReleaseValueSpan) audioReleaseValueSpan.textContent = `${simpleSynth.releaseTime.toFixed(3)}s`;
    if (audioDistortionSlider) audioDistortionSlider.value = simpleSynth.distortionAmount;
    if (audioDistortionValueSpan) audioDistortionValueSpan.textContent = `${simpleSynth.distortionAmount.toFixed(0)}%`;

    if (audioFilterCutoffSlider) audioFilterCutoffSlider.value = simpleSynth.filterNode.frequency.value;
    if (audioFilterCutoffValueSpan) audioFilterCutoffValueSpan.textContent = `${simpleSynth.filterNode.frequency.value.toFixed(0)} Hz`;
    if (audioFilterResonanceSlider) audioFilterResonanceSlider.value = simpleSynth.filterNode.Q.value;
    if (audioFilterResonanceValueSpan) audioFilterResonanceValueSpan.textContent = simpleSynth.filterNode.Q.value.toFixed(1);

    if (audioLfoWaveformSelect) audioLfoWaveformSelect.value = simpleSynth.lfo.type;
    if (audioLfoRateSlider) audioLfoRateSlider.value = simpleSynth.lfo.frequency.value;
    if (audioLfoRateValueSpan) audioLfoRateValueSpan.textContent = `${simpleSynth.lfo.frequency.value.toFixed(1)} Hz`;
    if (audioLfoPitchDepthSlider) audioLfoPitchDepthSlider.value = simpleSynth.lfoGainPitch.gain.value;
    if (audioLfoPitchDepthValueSpan) audioLfoPitchDepthValueSpan.textContent = `${simpleSynth.lfoGainPitch.gain.value.toFixed(1)} Hz`;
    if (audioLfoFilterDepthSlider) audioLfoFilterDepthSlider.value = simpleSynth.lfoGainFilter.gain.value;
    if (audioLfoFilterDepthValueSpan) audioLfoFilterDepthValueSpan.textContent = `${simpleSynth.lfoGainFilter.gain.value.toFixed(0)} Hz`;

    if (audioDelayTimeSlider) audioDelayTimeSlider.value = simpleSynth.delayNode.delayTime.value;
    if (audioDelayTimeValueSpan) audioDelayTimeValueSpan.textContent = `${simpleSynth.delayNode.delayTime.value.toFixed(2)} s`;
    if (audioDelayFeedbackSlider) audioDelayFeedbackSlider.value = simpleSynth.delayFeedbackGain.gain.value;
    if (audioDelayFeedbackValueSpan) audioDelayFeedbackValueSpan.textContent = simpleSynth.delayFeedbackGain.gain.value.toFixed(2);
    if (audioDelayMixSlider) audioDelayMixSlider.value = Math.acos(simpleSynth.delayDryGain.gain.value) / (0.5 * Math.PI);
    if (audioDelayMixValueSpan) audioDelayMixValueSpan.textContent = (Math.acos(simpleSynth.delayDryGain.gain.value) / (0.5 * Math.PI)).toFixed(2);

    if (audioReverbMixSlider && simpleSynth.reverbDryGain) audioReverbMixSlider.value = Math.acos(simpleSynth.reverbDryGain.gain.value) / (0.5 * Math.PI);
    if (audioReverbMixValueSpan && simpleSynth.reverbDryGain) audioReverbMixValueSpan.textContent = (Math.acos(simpleSynth.reverbDryGain.gain.value) / (0.5 * Math.PI)).toFixed(2);
}

function updateSidebarSynthControls() {
    if (!simpleSynth || !synthControlsSidebar) return;

    if (scWaveformSelect) scWaveformSelect.value = simpleSynth.waveform;
    if (scMasterVolumeSlider) scMasterVolumeSlider.value = simpleSynth.masterGainNode.gain.value;
    if (scMasterVolumeValue) scMasterVolumeValue.textContent = simpleSynth.masterGainNode.gain.value.toFixed(2);
    if (scAttackSlider) scAttackSlider.value = simpleSynth.attackTime;
    if (scAttackValue) scAttackValue.textContent = `${simpleSynth.attackTime.toFixed(3)}s`;
    if (scDecaySlider) scDecaySlider.value = simpleSynth.decayTime;
    if (scDecayValue) scDecayValue.textContent = `${simpleSynth.decayTime.toFixed(3)}s`;
    if (scSustainSlider) scSustainSlider.value = simpleSynth.sustainLevel;
    if (scSustainValue) scSustainValue.textContent = simpleSynth.sustainLevel.toFixed(2);
    if (scReleaseSlider) scReleaseSlider.value = simpleSynth.releaseTime;
    if (scReleaseValue) scReleaseValue.textContent = `${simpleSynth.releaseTime.toFixed(3)}s`;
    if (scDistortionSlider) scDistortionSlider.value = simpleSynth.distortionAmount;
    if (scDistortionValue) scDistortionValue.textContent = `${simpleSynth.distortionAmount.toFixed(0)}%`;

    if (scFilterCutoffSlider) scFilterCutoffSlider.value = simpleSynth.filterNode.frequency.value;
    if (scFilterCutoffValue) scFilterCutoffValue.textContent = `${simpleSynth.filterNode.frequency.value.toFixed(0)} Hz`;
    if (scFilterResonanceSlider) scFilterResonanceSlider.value = simpleSynth.filterNode.Q.value;
    if (scFilterResonanceValue) scFilterResonanceValue.textContent = simpleSynth.filterNode.Q.value.toFixed(1);

    if (scLfoWaveformSelect) scLfoWaveformSelect.value = simpleSynth.lfo.type;
    if (scLfoRateSlider) scLfoRateSlider.value = simpleSynth.lfo.frequency.value;
    if (scLfoRateValue) scLfoRateValue.textContent = `${simpleSynth.lfo.frequency.value.toFixed(1)} Hz`;
    if (scLfoPitchDepthSlider) scLfoPitchDepthSlider.value = simpleSynth.lfoGainPitch.gain.value;
    if (scLfoPitchDepthValue) scLfoPitchDepthValue.textContent = `${simpleSynth.lfoGainPitch.gain.value.toFixed(1)} Hz`;
    if (scLfoFilterDepthSlider) scLfoFilterDepthSlider.value = simpleSynth.lfoGainFilter.gain.value;
    if (scLfoFilterDepthValue) scLfoFilterDepthValue.textContent = `${simpleSynth.lfoGainFilter.gain.value.toFixed(0)} Hz`;

    if (scDelayTimeSlider) scDelayTimeSlider.value = simpleSynth.delayNode.delayTime.value;
    if (scDelayTimeValue) scDelayTimeValue.textContent = `${simpleSynth.delayNode.delayTime.value.toFixed(2)} s`;
    if (scDelayFeedbackSlider) scDelayFeedbackSlider.value = simpleSynth.delayFeedbackGain.gain.value;
    if (scDelayFeedbackValue) scDelayFeedbackValue.textContent = simpleSynth.delayFeedbackGain.gain.value.toFixed(2);
    if (scDelayMixSlider) scDelayMixSlider.value = Math.acos(simpleSynth.delayDryGain.gain.value) / (0.5 * Math.PI);
    if (scDelayMixValue) scDelayMixValue.textContent = (Math.acos(simpleSynth.delayDryGain.gain.value) / (0.5 * Math.PI)).toFixed(2);

    if (scReverbMixSlider && simpleSynth.reverbDryGain) scReverbMixSlider.value = Math.acos(simpleSynth.reverbDryGain.gain.value) / (0.5 * Math.PI);
    if (scReverbMixValue && simpleSynth.reverbDryGain) scReverbMixValue.textContent = (Math.acos(simpleSynth.reverbDryGain.gain.value) / (0.5 * Math.PI)).toFixed(2);
}

function initSynthControlsSidebar() {
    synthControlsSidebar = document.getElementById('synthControlsSidebar');
    if (!synthControlsSidebar) {
        console.error("Synth Control Sidebar element not found!");
        return;
    }

    scWaveformSelect = document.getElementById('scWaveformSelect');
    scMasterVolumeSlider = document.getElementById('scMasterVolume');
    scMasterVolumeValue = document.getElementById('scMasterVolumeValue');
    scAttackSlider = document.getElementById('scAttack');
    scAttackValue = document.getElementById('scAttackValue');
    scDecaySlider = document.getElementById('scDecay');
    scDecayValue = document.getElementById('scDecayValue');
    scSustainSlider = document.getElementById('scSustain');
    scSustainValue = document.getElementById('scSustainValue');
    scReleaseSlider = document.getElementById('scRelease');
    scReleaseValue = document.getElementById('scReleaseValue');
    scDistortionSlider = document.getElementById('scDistortion');
    scDistortionValue = document.getElementById('scDistortionValue');

    if (scWaveformSelect) scWaveformSelect.addEventListener('change', (e) => handleSynthControlChange('waveform', e.target.value));
    if (scMasterVolumeSlider) scMasterVolumeSlider.addEventListener('input', (e) => handleSynthControlChange('masterVolume', parseFloat(e.target.value)));
    if (scAttackSlider) scAttackSlider.addEventListener('input', (e) => handleSynthControlChange('attack', parseFloat(e.target.value)));
    if (scDecaySlider) scDecaySlider.addEventListener('input', (e) => handleSynthControlChange('decay', parseFloat(e.target.value)));
    if (scSustainSlider) scSustainSlider.addEventListener('input', (e) => handleSynthControlChange('sustain', parseFloat(e.target.value)));
    if (scReleaseSlider) scReleaseSlider.addEventListener('input', (e) => handleSynthControlChange('release', parseFloat(e.target.value)));
    if (scDistortionSlider) scDistortionSlider.addEventListener('input', (e) => handleSynthControlChange('distortion', parseFloat(e.target.value)));

    if (scFilterCutoffSlider) scFilterCutoffSlider.addEventListener('input', (e) => handleSynthControlChange('filterCutoff', parseFloat(e.target.value)));
    if (scFilterResonanceSlider) scFilterResonanceSlider.addEventListener('input', (e) => handleSynthControlChange('filterResonance', parseFloat(e.target.value)));

    if (scLfoWaveformSelect) scLfoWaveformSelect.addEventListener('change', (e) => handleSynthControlChange('lfoWaveform', e.target.value));
    if (scLfoRateSlider) scLfoRateSlider.addEventListener('input', (e) => handleSynthControlChange('lfoRate', parseFloat(e.target.value)));
    if (scLfoPitchDepthSlider) scLfoPitchDepthSlider.addEventListener('input', (e) => handleSynthControlChange('lfoPitchDepth', parseFloat(e.target.value)));
    if (scLfoFilterDepthSlider) scLfoFilterDepthSlider.addEventListener('input', (e) => handleSynthControlChange('lfoFilterDepth', parseFloat(e.target.value)));

    if (scDelayTimeSlider) scDelayTimeSlider.addEventListener('input', (e) => handleSynthControlChange('delayTime', parseFloat(e.target.value)));
    if (scDelayFeedbackSlider) scDelayFeedbackSlider.addEventListener('input', (e) => handleSynthControlChange('delayFeedback', parseFloat(e.target.value)));
    if (scDelayMixSlider) scDelayMixSlider.addEventListener('input', (e) => handleSynthControlChange('delayMix', parseFloat(e.target.value)));

    if (scReverbMixSlider) scReverbMixSlider.addEventListener('input', (e) => handleSynthControlChange('reverbMix', parseFloat(e.target.value)));

    if (scBPMSlider) {
        scBPMSlider.addEventListener('input', (e) => {
            if (spectatorModeActive || externalBPM !== null) return;
            arpeggioBPM = parseInt(e.target.value);
            updateBPMValues(arpeggioBPM);
            saveArpeggioSettings();
            updateHUD();
            sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM);
        });
    }

    if (recordAudioButton) {
        recordAudioButton.addEventListener('click', () => {
            if (!isAudioRecording) {
                startAudioRecording();
            } else {
                stopAudioRecording();
            }
        });
    }
    if (pauseAudioButton) {
        pauseAudioButton.addEventListener('click', () => {
            if (!mediaRecorder) return;
            if (isAudioRecording && !isAudioPaused) {
                mediaRecorder.pause();
                pauseAudioButton.textContent = "▶️ Retomar Gravação";
                isAudioPaused = true;
                logOSC("SYSTEM", "Gravação de Áudio Pausada", []);
            } else if (isAudioRecording && isAudioPaused) {
                mediaRecorder.resume();
                pauseAudioButton.textContent = "⏸️ Pausar Gravação";
                isAudioPaused = false;
                logOSC("SYSTEM", "Gravação de Áudio Retomada", []);
            }
        });
    }
    if (saveAudioButton) {
        saveAudioButton.addEventListener('click', () => {
            saveRecordedAudio();
        });
    }
    updateSidebarSynthControls();
    console.log("Synth Control Sidebar initialized.");
}

function updateHUD() {
  if (!hudElement) { logDebug("Elemento HUD não encontrado."); return; }
  if (hudElement.classList.contains('hidden')) { let textSpan = hudElement.querySelector('span#hudTextContent'); if (textSpan) { textSpan.innerHTML = ""; } return; }
  let txt = "";
  if (spectatorModeActive) txt += `<b>👓 MODO ESPECTADOR</b><br>`;

  // V63: Add gesture mapping info to HUD
  let activeMappingsCount = gestureMappings.filter(m => m.source !== 'NONE' && m.target !== 'NONE').length;
  if (activeMappingsCount > 0) {
    txt += `Mapeamentos Ativos: <span class="status-ok">${activeMappingsCount}</span> | `;
  }

  const audioIcon = _internalAudioEnabledMaster && audioCtx && audioCtx.state === 'running' ? '🟢' : '🔴';
  const audioStatusText = _internalAudioEnabledMaster && audioCtx && audioCtx.state === 'running' ? (simpleSynth?.waveform || 'ON') : 'OFF';
  const audioStatusClass = _internalAudioEnabledMaster && audioCtx && audioCtx.state === 'running' ? 'status-ok' : 'status-error';
  txt += `Áudio: ${audioIcon} <span class="${audioStatusClass}">${audioStatusText}</span> | `;

  const midiStatusIcon = midiAccess && midiOutput ? '🟢' : '🔴';
  txt += `MIDI: ${midiStatusIcon} <span class="${midiAccess && midiOutput ? 'status-ok':'status-error'}">${midiEnabled && midiOutput ? (midiOutput.name || 'ON') : 'OFF'}</span> | `;

  const oscConnected = osc && osc.status() === OSC.STATUS.IS_OPEN;
  const oscStatusIcon = oscConnected ? '🟢' : (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? '🟠' : '🔴');
  txt += `OSC: ${oscStatusIcon} <span class="${oscConnected ? 'status-ok': (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? 'status-warn' : 'status-error')}">${oscStatus}</span><br>`;

  shapes.forEach(s => { txt += `<b>F${s.id+1}:</b> R:${s.radius.toFixed(0)} L:${s.sides===100?"○":s.sides} Gest:${spectatorModeActive?"-":(s.activeGesture||"Nenhum")} Idx:${s.currentEdgeIndex} ${currentNoteMode === 'CHORD' ? `ChordStep:${s.currentChordStepIndex}` : ''}<br>`; });
  txt += `<b>Global:</b> Pulso:${pulseModeActive?'ON':'OFF'} Artic:${staccatoModeActive?'Stac':'Leg'} VtxPull:${vertexPullModeActive?'ON':'OFF'}<br>`;
  txt += `&nbsp;&nbsp;Escala:${SCALES[currentScaleName].name} Nota:${currentNoteMode} Oper:${operationMode==='one_person'?'1P':'2P'}<br>`;
  if (currentNoteMode === 'ARPEGGIO') txt += `&nbsp;&nbsp;Arp: ${currentArpeggioStyle} BPM:${arpeggioBPM.toFixed(0)}${externalBPM!==null?'(Ext)':''}<br>`;
  txt += `&nbsp;&nbsp;DMX Sync:${dmxSyncModeActive?'<span class="status-ok">ON</span>':'OFF'} | MIDI In:${midiFeedbackEnabled?'<span class="status-ok">ON</span>':'OFF'} | Sim:${gestureSimulationActive?'<span class="status-warn">ON</span>':'OFF'}<br>`;
  if (isRecordingOSC) txt += `&nbsp;&nbsp;<span class="status-error">🔴 Gravando OSC</span> (${recordedOSCSequence.length})<br>`;
  if (isPlayingOSCLoop) { const loopProgress = ((performance.now() - playbackStartTime) % oscLoopDuration) / oscLoopDuration; const progressBar = ' ['.padEnd(Math.floor(loopProgress * 10) + 2, '■').padEnd(12, '□') + ']'; txt += `&nbsp;&nbsp;<span class="status-warn">▶️ Loop OSC Ativo${progressBar}</span> (${(oscLoopDuration/1000).toFixed(1)}s)<br>`; }
  else if (recordedOSCSequence.length > 0) txt += `&nbsp;&nbsp;Loop OSC Pronto (${recordedOSCSequence.length} msgs, ${(oscLoopDuration/1000).toFixed(1)}s)<br>`;
  if (cameraError) txt += `<span class="status-error">⚠️ Falha na Câmera.</span><br>`;
  let textSpan = hudElement.querySelector('span#hudTextContent');
  if (!textSpan) { textSpan = document.createElement('span'); textSpan.id = 'hudTextContent'; hudElement.prepend(textSpan); }
  textSpan.innerHTML = txt;
  if (reconnectOSCButton && reconnectOSCButton.style.display === 'inline-block' && !hudElement.contains(reconnectOSCButton)) { hudElement.appendChild(reconnectOSCButton); }
  const now = performance.now();
  if (!spectatorModeActive && osc && osc.status() === OSC.STATUS.IS_OPEN && (now - lastOscSendTime > OSC_SEND_INTERVAL)) { lastOscSendTime = now; shapes.forEach(s => { const sid = s.id + 1; sendOSCMessage(`/forma/${sid}/radius`, parseFloat(s.radius.toFixed(2))); sendOSCMessage(`/forma/${sid}/sides`, s.sides); /* ... more OSC ... */ }); }
}

function toggleMidiEnabled(){if(spectatorModeActive)return;midiEnabled=!midiEnabled;midiToggleButton.textContent=midiEnabled?"🎹 MIDI ON":"🎹 MIDI OFF";midiToggleButton.classList.toggle('active',midiEnabled);if(!midiEnabled)turnOffAllActiveNotes();sendOSCMessage('/global/state/midiEnabled',midiEnabled?1:0);updateHUD();saveAllPersistentSettings();}
function toggleOperationMode(){if(spectatorModeActive)return;operationMode=(operationMode==='one_person')?'two_persons':'one_person';shapes.forEach(s=>{s.leftHandLandmarks=null;s.rightHandLandmarks=null;s.activeGesture=null;s.lastSentActiveGesture=null;});turnOffAllActiveNotes();updateHUD();saveAllPersistentSettings();}
function toggleDMXSync(){if(spectatorModeActive)return;dmxSyncModeActive=!dmxSyncModeActive;syncDMXNotesButton.textContent=`🎶 Sync DMX ${dmxSyncModeActive?'ON':'OFF'}`;syncDMXNotesButton.classList.toggle('active',dmxSyncModeActive);sendOSCMessage('/global/state/dmxSyncMode',dmxSyncModeActive?1:0);updateHUD();saveAllPersistentSettings();}
function toggleMidiFeedback(){if(spectatorModeActive)return;midiFeedbackEnabled=!midiFeedbackEnabled;midiFeedbackToggleButton.textContent=`🎤 MIDI In ${midiFeedbackEnabled?'ON':'OFF'}`;midiFeedbackToggleButton.classList.toggle('active',midiFeedbackEnabled);sendOSCMessage('/global/state/midiFeedbackEnabled',midiFeedbackEnabled?1:0);updateHUD();saveAllPersistentSettings();}
function toggleOSCRecording(){if(spectatorModeActive)return;isRecordingOSC=!isRecordingOSC;if(recordOSCButton)recordOSCButton.classList.toggle('active',isRecordingOSC);if(isRecordingOSC){recordedOSCSequence=[];recordingStartTime=performance.now();if(recordOSCButton)recordOSCButton.textContent="🔴 Gravando";if(playOSCLoopButton)playOSCLoopButton.disabled=true;}else{if(recordOSCButton)recordOSCButton.textContent="⏺️ Gravar OSC";if(playOSCLoopButton)playOSCLoopButton.disabled=recordedOSCSequence.length===0;if(recordedOSCSequence.length>0)logOSC("REC INFO",`Gravadas ${recordedOSCSequence.length} msgs. Duração: ${(recordedOSCSequence[recordedOSCSequence.length-1].timestamp/1000).toFixed(2)}s`,[]); } updateHUD();}
function playRecordedOSCLoop(){if(spectatorModeActive||recordedOSCSequence.length===0||isRecordingOSC)return;isPlayingOSCLoop=!isPlayingOSCLoop;if(playOSCLoopButton)playOSCLoopButton.classList.toggle('active',isPlayingOSCLoop);if(isPlayingOSCLoop){if(playOSCLoopButton)playOSCLoopButton.textContent="⏹️ Parar Loop";if(recordOSCButton)recordOSCButton.disabled=true;oscLoopDuration=parseInt(oscLoopDurationInput.value)||5000;playbackStartTime=performance.now();let currentPlaybackIndex=0;function loopStep(){if(!isPlayingOSCLoop)return;const elapsedTimeInLoop=(performance.now()-playbackStartTime)%oscLoopDuration;if(currentPlaybackIndex>0&&elapsedTimeInLoop<recordedOSCSequence[Math.max(0,currentPlaybackIndex-1)].timestamp)currentPlaybackIndex=0;while(currentPlaybackIndex<recordedOSCSequence.length&&recordedOSCSequence[currentPlaybackIndex].timestamp<=elapsedTimeInLoop){const item=recordedOSCSequence[currentPlaybackIndex];const tempIsRec=isRecordingOSC;isRecordingOSC=false;if(osc&&osc.status()===OSC.STATUS.IS_OPEN)osc.send(new OSC.Message(item.message.address,...item.message.args));isRecordingOSC=tempIsRec;logOSC("LOOP",item.message.address,item.message.args);currentPlaybackIndex++;} if(currentPlaybackIndex>=recordedOSCSequence.length&&recordedOSCSequence.length>0&&oscLoopDuration>recordedOSCSequence[recordedOSCSequence.length-1].timestamp)currentPlaybackIndex=0;playbackLoopIntervalId=requestAnimationFrame(loopStep);} playbackLoopIntervalId=requestAnimationFrame(loopStep);}else{if(playbackLoopIntervalId)cancelAnimationFrame(playbackLoopIntervalId);if(playOSCLoopButton)playOSCLoopButton.textContent="▶️ Loop OSC";if(recordOSCButton)recordOSCButton.disabled=false;} updateHUD();}
function toggleSpectatorMode(){spectatorModeActive=!spectatorModeActive;spectatorModeButton.textContent=`👓 Espectador ${spectatorModeActive?'ON':'OFF'}`;spectatorModeButton.classList.toggle('active',spectatorModeActive);const controlElements=[midiToggleButton,syncDMXNotesButton,midiFeedbackToggleButton,recordOSCButton,playOSCLoopButton,gestureSimToggleButton,infoHudButton];if(spectatorModeActive){turnOffAllActiveNotes();if(isRecordingOSC)toggleOSCRecording();if(isPlayingOSCLoop)playRecordedOSCLoop();controlElements.forEach(btn=>{if(btn)btn.disabled=true;});if(arpeggioBPMSlider)arpeggioBPMSlider.disabled=true;if(noteIntervalSlider)noteIntervalSlider.disabled=true;}else{controlElements.forEach(btn=>{if(btn&&btn!==playOSCLoopButton&&btn!==gestureSimToggleButton)btn.disabled=false;});if(playOSCLoopButton)playOSCLoopButton.disabled=recordedOSCSequence.length===0;if(gestureSimToggleButton)gestureSimToggleButton.disabled=false;if(arpeggioBPMSlider&&externalBPM===null)arpeggioBPMSlider.disabled=false;if(noteIntervalSlider&&externalBPM===null)noteIntervalSlider.disabled=false;} updateHUD();}
function openPopup(){ /* ... */ }

function handleKeyPress(e) {
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
    if (e.key === 'Escape') { if (isInputFocused) activeEl.blur(); else if (anyModalOpen) [infoModal, settingsModal, arpeggioSettingsModal, oscControlModal, shapePresetModal, oscConfigModal].forEach(m => {if(m)m.style.display='none'}); return; }
    if (isInputFocused || (spectatorModeActive && e.key !== 'Escape')) return;

  const actionMap = { 'm': toggleMidiEnabled };
  const correctedShiftActionMap = {
    'I': () => { if (infoModal) infoModal.style.display = infoModal.style.display === 'flex' ? 'none' : 'flex'; },
    'C': () => { if (settingsModal) { settingsModal.style.display = settingsModal.style.display === 'flex' ? 'none' : 'flex'; if(settingsModal.style.display === 'flex') updateModalSynthControls(); } },
    'A': () => { if (toggleArpPanelButtonFixed) toggleArpPanelButtonFixed.click(); }, // V65: Changed to toggle panel
    'K': () => { if (oscConfigModal) {oscConfigModal.style.display = oscConfigModal.style.display === 'flex' ? 'none' : 'flex'; if(oscConfigModal.style.display === 'flex') {oscHostInput.value = OSC_HOST; oscPortInput.value = OSC_PORT;}}},
    'B': () => { if (shapePresetModal) shapePresetModal.style.display = shapePresetModal.style.display === 'flex' ? 'none' : 'flex'; },
    'V': () => internalAudioToggleButton.click(), // V62: Simula clique no botão
    'D': toggleDMXSync,
    'R': toggleOSCRecording,
    'P': playRecordedOSCLoop,
    'F': toggleMidiFeedback,
    'S': toggleSpectatorMode,
    'T': toggleTheme,
    'Y': () => { if (toggleSynthPanelButtonFixed) toggleSynthPanelButtonFixed.click(); },
    'G': () => { // V64: Atalho para modal de mapeamento de gestos
        const modal = document.getElementById('gestureMappingModal');
        if (modal) {
            if (modal.style.display === 'flex') {
                modal.style.display = 'none';
            } else {
                renderGestureMappingUI();
                updateActiveGestureMappingsList();
                modal.style.display = 'flex';
            }
        }
    },
  };

  const key = e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase();
  const mapToUse = e.shiftKey ? correctedShiftActionMap : actionMap;

  if (mapToUse[key]) { e.preventDefault(); mapToUse[key](); }

  // V65: Spacebar to toggle Play/Pause
  if (key === ' ' && !isInputFocused && !anyModalOpen) { // Spacebar
    e.preventDefault();
    togglePlayPause();
  }
}

function savePersistentSetting(key,value){try{const s=JSON.parse(localStorage.getItem(APP_SETTINGS_KEY))||{};s[key]=value;localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(s));}catch(e){console.error("Erro ao salvar configuração:", key, value, e);}}
function loadPersistentSetting(key,defaultValue){try{const s=JSON.parse(localStorage.getItem(APP_SETTINGS_KEY))||{};return s[key]!==undefined?s[key]:defaultValue;}catch(e){console.error("Erro ao carregar configuração:", key, e);return defaultValue;}}

function saveAllPersistentSettings(){
  savePersistentSetting('operationMode',operationMode);
  savePersistentSetting('midiEnabled',midiEnabled);
  savePersistentSetting('internalAudioEnabled', _internalAudioEnabledMaster);
  if(simpleSynth) {
    savePersistentSetting('audioWaveform', simpleSynth.waveform);
    savePersistentSetting('audioMasterVolume', simpleSynth.masterGainNode.gain.value);
    savePersistentSetting('audioAttack', simpleSynth.attackTime);
    savePersistentSetting('audioDecay', simpleSynth.decayTime);
    savePersistentSetting('audioSustain', simpleSynth.sustainLevel);
    savePersistentSetting('audioRelease', simpleSynth.releaseTime);
    savePersistentSetting('audioDistortion', simpleSynth.distortionAmount);
    if (simpleSynth.filterNode) {
      savePersistentSetting('audioFilterCutoff', simpleSynth.filterNode.frequency.value);
      savePersistentSetting('audioFilterResonance', simpleSynth.filterNode.Q.value);
    }
    if (simpleSynth.lfo) {
      savePersistentSetting('lfoWaveform', simpleSynth.lfo.type);
      savePersistentSetting('lfoRate', simpleSynth.lfo.frequency.value);
      savePersistentSetting('lfoPitchDepth', simpleSynth.lfoGainPitch.gain.value);
      savePersistentSetting('lfoFilterDepth', simpleSynth.lfoGainFilter.gain.value);
    }
    if (simpleSynth.delayNode) {
      savePersistentSetting('delayTime', simpleSynth.delayNode.delayTime.value);
      savePersistentSetting('delayFeedback', simpleSynth.delayFeedbackGain.gain.value);
      savePersistentSetting('delayMix', Math.acos(simpleSynth.delayDryGain.gain.value) / (0.5 * Math.PI));
    }
    if (simpleSynth.reverbDryGain) {
      savePersistentSetting('reverbMix', Math.acos(simpleSynth.reverbDryGain.gain.value) / (0.5 * Math.PI));
    }
  }
  savePersistentSetting('dmxSyncModeActive',dmxSyncModeActive);
  savePersistentSetting('midiFeedbackEnabled',midiFeedbackEnabled);
  savePersistentSetting('spectatorModeActive',spectatorModeActive);
  savePersistentSetting('currentTheme', currentTheme);
  savePersistentSetting('oscLoopDuration', oscLoopDuration);
  savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
  savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
  savePersistentSetting('synthPanelHidden', synthControlsSidebar ? !synthControlsSidebar.classList.contains('open') : true);
  savePersistentSetting('arpPanelHidden', arpeggiatorControlsPanel ? !arpeggiatorControlsPanel.classList.contains('open') : true); // V65
  // V63: Save gesture mappings
  savePersistentSetting(GESTURE_MAPPING_STORAGE_KEY, gestureMappings);
  console.log("Configs V63 salvas no localStorage.");
}

function loadAllPersistentSettings(){
  operationMode = loadPersistentSetting('operationMode','two_persons');
  midiEnabled = loadPersistentSetting('midiEnabled',true);
  _internalAudioEnabledMaster = loadPersistentSetting('internalAudioEnabled', false);
  const savedWaveform = loadPersistentSetting('audioWaveform', 'sine');
  const savedMasterVolume = loadPersistentSetting('audioMasterVolume', 0.5);
  const savedAttack = loadPersistentSetting('audioAttack', 0.01);
  const savedDecay = loadPersistentSetting('audioDecay', 0.1);
  const savedSustain = loadPersistentSetting('audioSustain', 0.7);
  const savedRelease = loadPersistentSetting('audioRelease', 0.2);
  const savedDistortion = loadPersistentSetting('audioDistortion', 0);
    const savedFilterCutoff = loadPersistentSetting('audioFilterCutoff', 20000);
    const savedFilterResonance = loadPersistentSetting('audioFilterResonance', 1);
    const savedLfoWaveform = loadPersistentSetting('lfoWaveform', 'sine');
    const savedLfoRate = loadPersistentSetting('lfoRate', 5);
    const savedLfoPitchDepth = loadPersistentSetting('lfoPitchDepth', 0);
    const savedLfoFilterDepth = loadPersistentSetting('lfoFilterDepth', 0);
    const savedDelayTime = loadPersistentSetting('delayTime', 0.5);
    const savedDelayFeedback = loadPersistentSetting('delayFeedback', 0.3);
    const savedDelayMix = loadPersistentSetting('delayMix', 0);
    const savedReverbMix = loadPersistentSetting('reverbMix', 0);

  dmxSyncModeActive = loadPersistentSetting('dmxSyncModeActive',false);
  midiFeedbackEnabled = loadPersistentSetting('midiFeedbackEnabled',false);
  spectatorModeActive = false;
  currentTheme = loadPersistentSetting('currentTheme','theme-dark');
  oscLoopDuration = loadPersistentSetting('oscLoopDuration',5000);

  if (internalAudioToggleButton) {
      internalAudioToggleButton.textContent = _internalAudioEnabledMaster ? "🔊 Áudio ON" : "🔊 Áudio OFF";
      internalAudioToggleButton.classList.toggle('active', _internalAudioEnabledMaster);
  }

  loadOscSettings();
  loadArpeggioSettings();
  // V63: Load gesture mappings
  gestureMappings = loadPersistentSetting(GESTURE_MAPPING_STORAGE_KEY, Array(MAX_GESTURE_MAPPINGS).fill({source: 'NONE', target: 'NONE'}));
  // Ensure gestureMappings is an array of the correct size, fill with defaults if not
  if (!Array.isArray(gestureMappings) || gestureMappings.length !== MAX_GESTURE_MAPPINGS) {
    console.warn("Gesture mappings from localStorage are invalid or missing. Resetting to defaults.");
    gestureMappings = Array(MAX_GESTURE_MAPPINGS).fill(null).map(() => ({ source: 'NONE', target: 'NONE' }));
    savePersistentSetting(GESTURE_MAPPING_STORAGE_KEY, gestureMappings);
  }


  console.log("Configs V63 carregadas do localStorage.");
  return {
    savedMidiOutputId: loadPersistentSetting('midiOutputId',null),
    savedMidiInputId: loadPersistentSetting('midiInputId',null),
    audioSettings: {
        waveform: savedWaveform,
        masterVolume: savedMasterVolume,
        attack: savedAttack,
        decay: savedDecay,
        sustain: savedSustain,
        release: savedRelease,
        distortion: savedDistortion,
        filterCutoff: savedFilterCutoff,
        filterResonance: savedFilterResonance,
        lfoWaveform: savedLfoWaveform,
        lfoRate: savedLfoRate,
        lfoPitchDepth: savedLfoPitchDepth,
        lfoFilterDepth: savedLfoFilterDepth,
        delayTime: savedDelayTime,
        delayFeedback: savedDelayFeedback,
        delayMix: savedDelayMix,
        reverbMix: savedReverbMix
    }
  };
}

function saveArpeggioSettings() {
    const s = {
        currentArpeggioStyle,
        arpeggioBPM,
        noteInterval,
        externalBPM,
        arpRandomness, // V63
        arpSwing,      // V63
        arpGhostNoteChance // V63
    };
    try { localStorage.setItem(ARPEGGIO_SETTINGS_KEY, JSON.stringify(s)); } catch (e) { console.error("Error saving arpeggio settings:", e); }
}
function loadArpeggioSettings(){
    try{
        const s=JSON.parse(localStorage.getItem(ARPEGGIO_SETTINGS_KEY));
        if(s){
            currentArpeggioStyle = s.currentArpeggioStyle || "UP";
            arpeggioBPM = parseInt(s.arpeggioBPM, 10) || 120;
            noteInterval = parseInt(s.noteInterval, 10) || (60000 / arpeggioBPM);
            // V63: Load Arpeggiator Variations
            arpRandomness = parseInt(s.arpRandomness, 10) || 0;
            arpSwing = parseInt(s.arpSwing, 10) || 0;
            arpGhostNoteChance = parseInt(s.arpGhostNoteChance, 10) || 0;
        }
    }catch(e){
         // Reset to defaults if loading fails
        currentArpeggioStyle = "UP";
        arpeggioBPM = 120;
        noteInterval = 60000 / arpeggioBPM;
        arpRandomness = 0;
        arpSwing = 0;
        arpGhostNoteChance = 0;
    }
    // V65: Update Arp Panel UI
    if(arpPanelStyleSelect) arpPanelStyleSelect.value = currentArpeggioStyle;
    updateBPMValues(arpeggioBPM); // This also updates noteInterval display in the panel

    if(arpPanelRandomnessSlider) arpPanelRandomnessSlider.value = arpRandomness;
    if(arpPanelRandomnessValueSpan) arpPanelRandomnessValueSpan.textContent = arpRandomness;
    if(arpPanelSwingSlider) arpPanelSwingSlider.value = arpSwing;
    if(arpPanelSwingValueSpan) arpPanelSwingValueSpan.textContent = arpSwing;
    if(arpPanelGhostNoteChanceSlider) arpPanelGhostNoteChanceSlider.value = arpGhostNoteChance;
    if(arpPanelGhostNoteChanceValueSpan) arpPanelGhostNoteChanceValueSpan.textContent = arpGhostNoteChance;
}

function updateBPMValues(newBPM) {
    arpeggioBPM = parseInt(newBPM, 10);
    noteInterval = Math.round(60000 / arpeggioBPM);

    // V65: Update Arp Panel BPM and Interval sliders/values
    if (arpPanelBPMSlider) arpPanelBPMSlider.value = arpeggioBPM;
    if (arpPanelBPMValueSpan) arpPanelBPMValueSpan.textContent = arpeggioBPM;
    if (arpPanelNoteIntervalSlider) arpPanelNoteIntervalSlider.value = noteInterval;
    if (arpPanelNoteIntervalValueSpan) arpPanelNoteIntervalValueSpan.textContent = noteInterval;

    // Keep updating old modal controls if they exist, for now (or remove if modal is fully deprecated)
    // const oldArpeggioBPMSlider = document.getElementById('arpeggioBPM');
    // const oldArpeggioBPMValueSpan = document.getElementById('arpeggioBPMValue');
    // const oldNoteIntervalSlider = document.getElementById('noteIntervalSlider');
    // const oldNoteIntervalValueSpan = document.getElementById('noteIntervalValue');
    // if (oldArpeggioBPMSlider) oldArpeggioBPMSlider.value = arpeggioBPM;
    // if (oldArpeggioBPMValueSpan) oldArpeggioBPMValueSpan.textContent = arpeggioBPM;
    // if (oldNoteIntervalSlider) oldNoteIntervalSlider.value = noteInterval;
    // if (oldNoteIntervalValueSpan) oldNoteIntervalValueSpan.textContent = noteInterval;


    if (scBPMSlider) scBPMSlider.value = arpeggioBPM; // Synth panel BPM
    if (scBPMValueSpan) scBPMValueSpan.textContent = arpeggioBPM;
}

function updateNoteIntervalValues(newInterval) {
    noteInterval = parseInt(newInterval, 10);
    arpeggioBPM = Math.round(60000 / noteInterval);

    // V65: Update Arp Panel BPM and Interval sliders/values
    if (arpPanelNoteIntervalSlider) arpPanelNoteIntervalSlider.value = noteInterval;
    if (arpPanelNoteIntervalValueSpan) arpPanelNoteIntervalValueSpan.textContent = noteInterval;
    if (arpPanelBPMSlider) arpPanelBPMSlider.value = arpeggioBPM;
    if (arpPanelBPMValueSpan) arpPanelBPMValueSpan.textContent = arpeggioBPM;

    // Keep updating old modal controls if they exist
    // const oldNoteIntervalSlider = document.getElementById('noteIntervalSlider');
    // const oldNoteIntervalValueSpan = document.getElementById('noteIntervalValue');
    // const oldArpeggioBPMSlider = document.getElementById('arpeggioBPM');
    // const oldArpeggioBPMValueSpan = document.getElementById('arpeggioBPMValue');
    // if (oldNoteIntervalSlider) oldNoteIntervalSlider.value = noteInterval;
    // if (oldNoteIntervalValueSpan) oldNoteIntervalValueSpan.textContent = noteInterval;
    // if (oldArpeggioBPMSlider) oldArpeggioBPMSlider.value = arpeggioBPM;
    // if (oldArpeggioBPMValueSpan) oldArpeggioBPMValueSpan.textContent = arpeggioBPM;

    if (scBPMSlider) scBPMSlider.value = arpeggioBPM; // Synth panel BPM
    if (scBPMValueSpan) scBPMValueSpan.textContent = arpeggioBPM;
}


function populateArpeggioStyleSelect(){ // V65: Updated to target new panel select
    const selectToPopulate = arpPanelStyleSelect || document.getElementById('arpeggioStyleSelect'); // Fallback to old if new one not found
    if(!selectToPopulate)return;
    selectToPopulate.innerHTML='';
    ARPEGGIO_STYLES.forEach(s=>{
        const o=document.createElement('option');
        o.value=s;
        o.textContent=s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();
        selectToPopulate.appendChild(o);
    });
    selectToPopulate.value=currentArpeggioStyle;
}

window.addEventListener('DOMContentLoaded', () => {
    logDebug("DOM Carregado. Iniciando main62.js..."); // ATUALIZADO
  console.log("DOM Carregado. Iniciando main62.js (v62)..."); // ATUALIZADO
    detectPlatform();
    hasWebGL2 = checkWebGL2Support();
    if (!hasWebGL2) displayGlobalError("Aviso: WebGL2 não disponível. Alguns recursos visuais podem ser limitados.", 15000);

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    initFallbackShapes();

    const { savedMidiOutputId, savedMidiInputId, audioSettings } = loadAllPersistentSettings();

    loadTheme();
    applyTheme(currentTheme);

    initPresetManager();
    setupEventListeners();
    initSynthControlsSidebar();

    if (audioCtx && audioCtx.state === 'running') {
        console.log("AudioContext já estava rodando na inicialização da página (v62).");
        if (!simpleSynth) {
            simpleSynth = new SimpleSynth(audioCtx);
            console.log("SimpleSynth instanciado porque AudioContext já rodava (v62).");
        }
        if (simpleSynth && audioSettings) {
             Object.keys(audioSettings).forEach(key => {
                const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
                if (typeof simpleSynth[setterName] === 'function') {
                    simpleSynth[setterName](audioSettings[key]);
                } else if (key === 'masterVolume' && typeof simpleSynth.setMasterVolume === 'function') {
                     simpleSynth.setMasterVolume(audioSettings[key]);
                }
            });
            updateModalSynthControls();
            updateSidebarSynthControls();
            console.log("Configurações do synth aplicadas (AudioContext já rodava) (v62).");
        }
    } else if (audioCtx && audioCtx.state === 'suspended') {
        console.log("AudioContext existe mas está suspenso na inicialização. Aguardando clique no botão de áudio. (v62)");
    } else {
        console.log("AudioContext não existe ou não está rodando na inicialização. Aguardando clique no botão de áudio. (v62)");
    }


    setupOSC();

    currentCameraDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || null;
    if (currentCameraDeviceId === "null" || currentCameraDeviceId === "undefined") currentCameraDeviceId = null;

    initMidi().then(async () => {
        if (savedMidiOutputId && availableMidiOutputs.has(savedMidiOutputId)) { if(midiOutputSelect) midiOutputSelect.value = savedMidiOutputId; midiOutput = availableMidiOutputs.get(savedMidiOutputId); }
        else if (availableMidiOutputs.size > 0 && midiOutputSelect) { midiOutputSelect.selectedIndex = 0; midiOutput = availableMidiOutputs.get(midiOutputSelect.value); }

        if (savedMidiInputId && availableMidiInputs.has(savedMidiInputId)) { if(midiInputSelect) midiInputSelect.value = savedMidiInputId; setMidiInput(availableMidiInputs.get(savedMidiInputId)); }
        else if (availableMidiInputs.size > 0 && midiInputSelect) { midiInputSelect.selectedIndex = 0; setMidiInput(availableMidiInputs.get(midiInputSelect.value)); }

        savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
        savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);

        await populateCameraSelect();
        initializeCamera(currentCameraDeviceId).catch(err => {
            displayGlobalError(`Erro ao inicializar câmera: ${err.message}. Tente outra ou verifique permissões.`, 15000);
        });
    }).catch(err => {
        displayGlobalError(`Erro na inicialização MIDI: ${err.message}`, 10000);
        console.error("Erro MIDI init:", err);
        populateCameraSelect().then(() => initializeCamera(currentCameraDeviceId)).catch(camErr => {
            displayGlobalError(`Erro ao inicializar câmera (fallback): ${camErr.message}.`, 15000);
        });
    });

    populateArpeggioStyleSelect();
    if(oscLoopDurationInput) oscLoopDurationInput.value = oscLoopDuration;
    if(hudElement && !loadPersistentSetting('hudHidden', false) ) {
        hudElement.classList.remove('hidden');
        if(infoHudButton) {
            infoHudButton.textContent = "ℹ️ Ocultar HUD";
            infoHudButton.classList.add('active');
        }
    } else if (hudElement) {
        hudElement.classList.add('hidden');
         if(infoHudButton) {
            infoHudButton.textContent = "ℹ️ Mostrar HUD";
            infoHudButton.classList.remove('active');
        }
    }


    updateHUD();
    sendAllGlobalStatesOSC();

  if (oscLogTextarea) oscLogTextarea.value = `Log OSC - ${new Date().toLocaleTimeString()} - Configs Carregadas (v62).\n`; // ATUALIZADO

  // V65: Load initial play/pause state
  loadPlayPauseState();

  console.log("Iniciando loop de animação (v62) e finalizando DOMContentLoaded."); // ATUALIZADO
    animationLoop();
});

function animationLoop() {
  requestAnimationFrame(animationLoop);
  if (cameraError && !gestureSimulationActive) {
      // updateHUD(); // HUD is updated by onResults or drawFallbackAnimation
  }
   // V63: Apply gesture mappings continuously
   applyActiveGestureMappings();

   // V65: Update audio activity indicator based on actual sound output (conceptual)
   // This is a placeholder. A more robust solution would involve checking if the synth is actively producing sound.
   if (isPlaying && _internalAudioEnabledMaster && simpleSynth && Object.keys(simpleSynth.oscillators).length > 0) {
    if (audioActivityIndicator && audioActivityIndicator.style.backgroundColor !== 'var(--success-color)') { // Only update if changed
        // audioActivityIndicator.style.backgroundColor = 'var(--success-color)';
    }
   } else if (audioActivityIndicator && audioActivityIndicator.style.backgroundColor !== '#555' && !isPlaying) { // Only update if changed and paused
    // audioActivityIndicator.style.backgroundColor = '#555';
   }
   // A note on the indicator: The current logic in togglePlayPause directly sets the color.
   // This animationLoop section could be used for a more dynamic indicator (e.g., blinking if audio is passing through MeterNode)
   // For now, the direct update in togglePlayPause is sufficient for a basic visual cue.
}

// === V63: Gesture Mapping Functions ===
function initGestureMappingControls() {
    const container = document.getElementById('gestureMappingControlsContainer');
    if (!container) {
        console.error("Gesture mapping container not found!");
        return;
    }
    container.innerHTML = ''; // Clear previous controls

    for (let i = 0; i < MAX_GESTURE_MAPPINGS; i++) {
        const mapping = gestureMappings[i] || { source: 'NONE', target: 'NONE' };

        const groupDiv = document.createElement('div');
        groupDiv.className = 'control-group gesture-mapping-item';
        groupDiv.innerHTML = `<h5>Mapeamento ${i + 1}</h5>`;

        // Source select
        const sourceLabel = document.createElement('label');
        sourceLabel.htmlFor = `gestureSourceSelect${i}`;
        sourceLabel.textContent = 'Origem (Gesto/Forma):';
        const sourceSelect = document.createElement('select');
        sourceSelect.id = `gestureSourceSelect${i}`;
        sourceSelect.dataset.index = i;
        for (const key in GESTURE_SOURCES) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = GESTURE_SOURCES[key];
            sourceSelect.appendChild(option);
        }
        sourceSelect.value = mapping.source;
        sourceSelect.addEventListener('change', handleGestureMappingChange);

        // Target select
        const targetLabel = document.createElement('label');
        targetLabel.htmlFor = `synthTargetSelect${i}`;
        targetLabel.textContent = 'Destino (Sintetizador):';
        const targetSelect = document.createElement('select');
        targetSelect.id = `synthTargetSelect${i}`;
        targetSelect.dataset.index = i;
        for (const key in SYNTH_TARGETS) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = SYNTH_TARGETS[key];
            targetSelect.appendChild(option);
        }
        targetSelect.value = mapping.target;
        targetSelect.addEventListener('change', handleGestureMappingChange);

        groupDiv.appendChild(sourceLabel);
        groupDiv.appendChild(sourceSelect);
        groupDiv.appendChild(targetLabel);
        groupDiv.appendChild(targetSelect);
        container.appendChild(groupDiv);
    }
    console.log("Gesture mapping controls initialized.");
}

function handleGestureMappingChange(event) {
    const index = parseInt(event.target.dataset.index, 10);
    const type = event.target.id.includes('Source') ? 'source' : 'target';

    if (gestureMappings[index]) {
        gestureMappings[index][type] = event.target.value;
    } else {
        // Should not happen if initialized correctly
        gestureMappings[index] = {
            source: type === 'source' ? event.target.value : 'NONE',
            target: type === 'target' ? event.target.value : 'NONE'
        };
    }
    saveAllPersistentSettings(); // Saves all settings, including gesture mappings
    updateHUD();
    console.log(`Gesture mapping ${index} ${type} changed to: ${event.target.value}`);
}

function getGestureSourceValue(sourceName, shape) {
    if (!shape) return 0; // Default value if shape is not available

    switch (sourceName) {
        case 'LIQUIFY_DEGREE':
            // Assuming avgDisp (average displacement) is calculated in drawShape and normalized
            // Placeholder: needs actual avgDisp from shape, or a similar metric
            const avgDisp = shape.avgDisp !== undefined ? shape.avgDisp : 0; // Requires shape.avgDisp to be set
            const maxDistortion = 50.0; // Consistent with drawShape
            return Math.min(1.0, avgDisp / maxDistortion); // Normalized 0-1
        case 'NUM_SIDES':
            // Normalize number of sides (e.g., 3-20 maps to 0-1, 100 (circle) could be 0.5 or 1)
            if (shape.sides === 100) return 0.5; // Mid-point for circle
            return (shape.sides - 3) / (20 - 3); // Normalized 0-1 for 3-20 sides
        case 'CURRENT_RADIUS':
            // Normalize radius (e.g., 30-300 maps to 0-1)
            return (shape.radius - 30) / (300 - 30); // Normalized 0-1
        case 'AVG_VERTEX_DISTANCE':
            // This requires calculating the average distance of vertices from the center
            // Placeholder - this calculation should ideally happen in onResults or drawShape
            // For now, let's use radius as a proxy, or return a fixed value
            if (shape.sides > 0 && shape.radius > 0) {
                let totalDistance = 0;
                // Simplified: assume vertices are roughly at shape.radius distance.
                // A more accurate calculation would sum actual vertex distances.
                // This is a conceptual placeholder.
                return (shape.radius - 30) / (300-30); // proxy
            }
            return 0;
        // case 'ROTATION_SPEED': // If implemented
        //     return normalizeRotationSpeed(shape.rotationSpeed);
        default:
            return 0;
    }
}

function applySynthParameter(targetName, normalizedValue) {
    if (!simpleSynth) return;
    if (normalizedValue < 0 || normalizedValue > 1) {
        // console.warn(`Normalized value for ${targetName} is out of bounds: ${normalizedValue}. Clamping.`);
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));
    }

    // console.log(`Applying to ${targetName}: ${normalizedValue.toFixed(3)}`);

    switch (targetName) {
        case 'FILTER_CUTOFF':
            // Map 0-1 to 20-20000 Hz (logarithmic or linear based on preference)
            // Linear mapping for simplicity first:
            const cutoff = 20 + normalizedValue * (20000 - 20);
            simpleSynth.setFilterCutoff(cutoff);
            if (scFilterCutoffSlider) scFilterCutoffSlider.value = cutoff; // Update UI
            if (scFilterCutoffValue) scFilterCutoffValue.textContent = `${cutoff.toFixed(0)} Hz`;
            break;
        case 'FILTER_RESONANCE':
            // Map 0-1 to 0.1-30
            const resonance = 0.1 + normalizedValue * (30 - 0.1);
            simpleSynth.setFilterResonance(resonance);
            if (scFilterResonanceSlider) scFilterResonanceSlider.value = resonance;
            if (scFilterResonanceValue) scFilterResonanceValue.textContent = resonance.toFixed(1);
            break;
        case 'DISTORTION':
            // Map 0-1 to 0-100%
            const distortion = normalizedValue * 100;
            simpleSynth.setDistortion(distortion);
            if (scDistortionSlider) scDistortionSlider.value = distortion;
            if (scDistortionValue) scDistortionValue.textContent = `${distortion.toFixed(0)}%`;
            break;
        case 'LFO_RATE':
            // Map 0-1 to 0.1-20 Hz
            const lfoRate = 0.1 + normalizedValue * (20 - 0.1);
            simpleSynth.setLfoRate(lfoRate);
            if (scLfoRateSlider) scLfoRateSlider.value = lfoRate;
            if (scLfoRateValue) scLfoRateValue.textContent = `${lfoRate.toFixed(1)} Hz`;
            break;
        case 'LFO_PITCH_DEPTH':
            // Map 0-1 to 0-50 Hz (or appropriate range for pitch depth)
            const lfoPitchDepth = normalizedValue * 50;
            simpleSynth.setLfoPitchDepth(lfoPitchDepth);
            if (scLfoPitchDepthSlider) scLfoPitchDepthSlider.value = lfoPitchDepth;
            if (scLfoPitchDepthValue) scLfoPitchDepthValue.textContent = `${lfoPitchDepth.toFixed(1)} Hz`;
            break;
        case 'LFO_FILTER_DEPTH':
            // Map 0-1 to 0-5000 Hz (or appropriate range for filter depth)
            const lfoFilterDepth = normalizedValue * 5000;
            simpleSynth.setLfoFilterDepth(lfoFilterDepth);
            if (scLfoFilterDepthSlider) scLfoFilterDepthSlider.value = lfoFilterDepth;
            if (scLfoFilterDepthValue) scLfoFilterDepthValue.textContent = `${lfoFilterDepth.toFixed(0)} Hz`;
            break;
        case 'DELAY_TIME':
            // Map 0-1 to 0.01-2 s
            const delayTime = 0.01 + normalizedValue * (2.0 - 0.01);
            simpleSynth.setDelayTime(delayTime);
            if (scDelayTimeSlider) scDelayTimeSlider.value = delayTime;
            if (scDelayTimeValue) scDelayTimeValue.textContent = `${delayTime.toFixed(2)} s`;
            break;
        case 'DELAY_FEEDBACK':
            // Map 0-1 to 0-0.95
            const delayFeedback = normalizedValue * 0.95;
            simpleSynth.setDelayFeedback(delayFeedback);
            if (scDelayFeedbackSlider) scDelayFeedbackSlider.value = delayFeedback;
            if (scDelayFeedbackValue) scDelayFeedbackValue.textContent = delayFeedback.toFixed(2);
            break;
        case 'DELAY_MIX':
            // Map 0-1 to 0-1
            simpleSynth.setDelayMix(normalizedValue);
            if (scDelayMixSlider) scDelayMixSlider.value = normalizedValue;
            if (scDelayMixValue) scDelayMixValue.textContent = normalizedValue.toFixed(2);
            break;
        case 'REVERB_MIX':
            // Map 0-1 to 0-1
            simpleSynth.setReverbMix(normalizedValue);
            if (scReverbMixSlider) scReverbMixSlider.value = normalizedValue;
            if (scReverbMixValue) scReverbMixValue.textContent = normalizedValue.toFixed(2);
            break;
        default:
            break;
    }
}

function applyActiveGestureMappings() {
    if (spectatorModeActive || !simpleSynth) return;

    shapes.forEach((shape, shapeIndex) => { // Assuming first shape for now, or needs logic to pick a shape
      // Update shape.avgDisp if it's used by LIQUIFY_DEGREE
      // This is a bit of a hack; avgDisp is calculated in drawShape.
      // For now, let's assume it's available or use a placeholder.
      // A better approach would be to ensure all gesture source values are calculated
      // before this function is called, perhaps in onResults.
      // TEMPORARY: If liquify is active, use its current distortion for avgDisp
      if (shape.activeGesture === 'liquify' && shape.rightHandLandmarks) {
          const fingertips = [4, 8, 12, 16, 20]; // Ponto e vírgula removido daqui
          const maxInfluence = 150;
          const maxForce = 25;
          const cx = shape.centerX; const cy = shape.centerY; let r = shape.radius;
          let totalDispMag = 0; let activeLiquifyPts = 0;
          for (let i = 0; i < shape.sides; i++) {
            const angle = (i / shape.sides) * Math.PI * 2;
            let vx = r * Math.cos(angle); let vy = r * Math.sin(angle);
            let dx = 0; let dy = 0;
            const vCanvasX = cx + vx; const vCanvasY = cy + vy;
            for (const tipIdx of fingertips) {
                if (!shape.rightHandLandmarks[tipIdx]) continue;
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
            totalDispMag += Math.sqrt(dx**2 + dy**2);
          }
          shape.avgDisp = (activeLiquifyPts > 0) ? totalDispMag / activeLiquifyPts : 0;
      } else {
          // If not liquify, ensure avgDisp is 0 or its last known non-liquify value
          // For simplicity, if not actively liquifying, consider avgDisp to be low.
          // This might need refinement based on how avgDisp is intended to behave outside liquify.
          if (shape.activeGesture !== 'liquify') shape.avgDisp = 0;
      }


        gestureMappings.forEach(mapping => {
            if (mapping.source !== 'NONE' && mapping.target !== 'NONE') {
                const sourceValue = getGestureSourceValue(mapping.source, shape);
                applySynthParameter(mapping.target, sourceValue);
            }
        });
    });
}
// === END V63: Gesture Mapping Functions ===

// Funções de Mapeamento de Gestos (V64)

function getGestureSourceValue(sourceName, shape) {
    if (!shape) return 0;

    let normalizedValue = 0;

    switch (sourceName) {
        case 'LIQUIFY_DEGREE':
            const avgDisp = shape.avgDisp !== undefined ? shape.avgDisp : 0;
            const maxDistortion = 50.0; // Consistente com drawShape
            normalizedValue = Math.min(1.0, avgDisp / maxDistortion);
            break;
        case 'NUM_SIDES':
            if (shape.sides === 100) normalizedValue = 0.5; // Ponto médio para círculo
            else normalizedValue = (shape.sides - 3) / (20 - 3); // Normalizado 0-1 para 3-20 lados
            break;
        case 'CURRENT_RADIUS':
            normalizedValue = (shape.radius - 30) / (270); // Normalizado 0-1 para raio 30-300
            break;
        case 'AVG_VERTEX_DISTANCE':
            // Placeholder: Esta métrica precisa ser calculada e atualizada na forma (shape).
            // Por enquanto, vamos simular com base no raio.
            // Idealmente, seria a média das distâncias dos vértices ao centro da forma.
            normalizedValue = (shape.radius - 30) / (270); // Proxy usando raio
            break;
        default:
            normalizedValue = 0;
    }
    return Math.max(0, Math.min(1, normalizedValue)); // Garante que o valor esteja entre 0 e 1
}

function applyMappedGestureToSynth(targetName, normalizedValue) {
    if (!simpleSynth) return;
    if (normalizedValue < 0 || normalizedValue > 1) {
        normalizedValue = Math.max(0, Math.min(1, normalizedValue));
    }

    // logDebug(`Aplicando ao synth ${targetName}: ${normalizedValue.toFixed(3)}`);

    switch (targetName) {
        case 'FILTER_CUTOFF':
            const cutoff = 20 + normalizedValue * (18000 - 20); // 20Hz a ~18kHz
            simpleSynth.setFilterCutoff(cutoff);
            if (scFilterCutoffSlider) scFilterCutoffSlider.value = cutoff;
            if (scFilterCutoffValue) scFilterCutoffValue.textContent = `${cutoff.toFixed(0)} Hz`;
            break;
        case 'FILTER_RESONANCE':
            const resonance = 0.1 + normalizedValue * (29.9); // 0.1 a 30
            simpleSynth.setFilterResonance(resonance);
            if (scFilterResonanceSlider) scFilterResonanceSlider.value = resonance;
            if (scFilterResonanceValue) scFilterResonanceValue.textContent = resonance.toFixed(1);
            break;
        case 'DISTORTION':
            const distortion = normalizedValue * 100; // 0 a 100%
            simpleSynth.setDistortion(distortion);
            if (scDistortionSlider) scDistortionSlider.value = distortion;
            if (scDistortionValue) scDistortionValue.textContent = `${distortion.toFixed(0)}%`;
            break;
        case 'LFO_RATE':
            const lfoRate = 0.1 + normalizedValue * (19.9); // 0.1Hz a 20Hz
            simpleSynth.setLfoRate(lfoRate);
            if (scLfoRateSlider) scLfoRateSlider.value = lfoRate;
            if (scLfoRateValue) scLfoRateValue.textContent = `${lfoRate.toFixed(1)} Hz`;
            break;
        case 'LFO_PITCH_DEPTH':
            const lfoPitchDepth = normalizedValue * 50; // 0 a 50 (sem unidade específica, depende da implementação do synth)
            simpleSynth.setLfoPitchDepth(lfoPitchDepth);
            if (scLfoPitchDepthSlider) scLfoPitchDepthSlider.value = lfoPitchDepth;
            if (scLfoPitchDepthValue) scLfoPitchDepthValue.textContent = `${lfoPitchDepth.toFixed(1)}`;
            break;
        case 'LFO_FILTER_DEPTH':
            const lfoFilterDepth = normalizedValue * 5000; // 0 a 5000 (sem unidade específica)
            simpleSynth.setLfoFilterDepth(lfoFilterDepth);
            if (scLfoFilterDepthSlider) scLfoFilterDepthSlider.value = lfoFilterDepth;
            if (scLfoFilterDepthValue) scLfoFilterDepthValue.textContent = `${lfoFilterDepth.toFixed(0)}`;
            break;
        case 'DELAY_TIME':
            const delayTime = 0.01 + normalizedValue * (1.99); // 0.01s a 2s
            simpleSynth.setDelayTime(delayTime);
            if (scDelayTimeSlider) scDelayTimeSlider.value = delayTime;
            if (scDelayTimeValue) scDelayTimeValue.textContent = `${delayTime.toFixed(2)} s`;
            break;
        case 'DELAY_FEEDBACK':
            const delayFeedback = normalizedValue * 0.95; // 0 a 0.95
            simpleSynth.setDelayFeedback(delayFeedback);
            if (scDelayFeedbackSlider) scDelayFeedbackSlider.value = delayFeedback;
            if (scDelayFeedbackValue) scDelayFeedbackValue.textContent = delayFeedback.toFixed(2);
            break;
        case 'DELAY_MIX':
            simpleSynth.setDelayMix(normalizedValue); // 0 a 1
            if (scDelayMixSlider) scDelayMixSlider.value = normalizedValue;
            if (scDelayMixValue) scDelayMixValue.textContent = normalizedValue.toFixed(2);
            break;
        case 'REVERB_MIX':
            simpleSynth.setReverbMix(normalizedValue); // 0 a 1
            if (scReverbMixSlider) scReverbMixSlider.value = normalizedValue;
            if (scReverbMixValue) scReverbMixValue.textContent = normalizedValue.toFixed(2);
            break;
        case 'ATTACK_TIME':
            const attackTime = 0.001 + normalizedValue * (1.999); // 0.001s a 2s
            simpleSynth.setAttack(attackTime);
            if (scAttackSlider) scAttackSlider.value = attackTime;
            if (scAttackValue) scAttackValue.textContent = `${attackTime.toFixed(3)}s`;
            break;
        case 'DECAY_TIME':
            const decayTime = 0.001 + normalizedValue * (1.999); // 0.001s a 2s
            simpleSynth.setDecay(decayTime);
            if (scDecaySlider) scDecaySlider.value = decayTime;
            if (scDecayValue) scDecayValue.textContent = `${decayTime.toFixed(3)}s`;
            break;
        case 'SUSTAIN_LEVEL':
            simpleSynth.setSustain(normalizedValue); // 0 a 1
            if (scSustainSlider) scSustainSlider.value = normalizedValue;
            if (scSustainValue) scSustainValue.textContent = normalizedValue.toFixed(2);
            break;
        case 'RELEASE_TIME':
            const releaseTime = 0.001 + normalizedValue * (2.999); // 0.001s a 3s
            simpleSynth.setRelease(releaseTime);
            if (scReleaseSlider) scReleaseSlider.value = releaseTime;
            if (scReleaseValue) scReleaseValue.textContent = `${releaseTime.toFixed(3)}s`;
            break;
        default:
            // console.warn(`Alvo de sintetizador desconhecido: ${targetName}`);
            break;
    }
}

function updateActiveGestureMappingsList() {
    const listElement = document.getElementById('activeGestureMappingsList');
    if (!listElement) return;

    listElement.innerHTML = ''; // Limpa a lista

    const activeMappings = gestureMappings.filter(m => m.source !== 'NONE' && m.target !== 'NONE');

    if (activeMappings.length === 0) {
        const listItem = document.createElement('li');
        listItem.textContent = 'Nenhum mapeamento ativo.';
        listElement.appendChild(listItem);
        return;
    }

    activeMappings.forEach((mapping, index) => {
        const listItem = document.createElement('li');
        const sourceText = GESTURE_SOURCES[mapping.source] || mapping.source;
        const targetText = SYNTH_TARGETS[mapping.target] || mapping.target;
        listItem.textContent = `Mapeamento ${index + 1}: "${sourceText}" → "${targetText}"`;
        listElement.appendChild(listItem);
    });
}


function createGestureMappingSlot(index, mappingData = { source: 'NONE', target: 'NONE' }) {
    const slotDiv = document.createElement('div');
    slotDiv.className = 'gesture-mapping-slot control-group';
    slotDiv.dataset.index = index;

    const title = document.createElement('h5');
    title.textContent = `Mapeamento ${index + 1}`;
    slotDiv.appendChild(title);

    // Source select
    const sourceLabel = document.createElement('label');
    sourceLabel.htmlFor = `gestureSourceSelect_${index}`;
    sourceLabel.textContent = 'Origem do Gesto:';
    const sourceSelect = document.createElement('select');
    sourceSelect.id = `gestureSourceSelect_${index}`;
    sourceSelect.dataset.index = index;
    sourceSelect.className = 'gesture-source-select';
    for (const key in GESTURE_SOURCES) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = GESTURE_SOURCES[key];
        sourceSelect.appendChild(option);
    }
    sourceSelect.value = mappingData.source;
    sourceSelect.addEventListener('change', handleGestureMappingChange);

    // Target select
    const targetLabel = document.createElement('label');
    targetLabel.htmlFor = `synthTargetSelect_${index}`;
    targetLabel.textContent = 'Alvo do Sintetizador:';
    const targetSelect = document.createElement('select');
    targetSelect.id = `synthTargetSelect_${index}`;
    targetSelect.dataset.index = index;
    targetSelect.className = 'synth-target-select';
    for (const key in SYNTH_TARGETS) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = SYNTH_TARGETS[key];
        targetSelect.appendChild(option);
    }
    targetSelect.value = mappingData.target;
    targetSelect.addEventListener('change', handleGestureMappingChange);

    // Botão de remover
    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remover Mapeamento';
    removeButton.className = 'control-button remove-mapping-button';
    removeButton.dataset.index = index;
    removeButton.addEventListener('click', removeGestureMappingSlot);

    slotDiv.appendChild(sourceLabel);
    slotDiv.appendChild(sourceSelect);
    slotDiv.appendChild(targetLabel);
    slotDiv.appendChild(targetSelect);
    slotDiv.appendChild(removeButton);

    return slotDiv;
}

function addGestureMappingSlot() {
    if (gestureMappings.filter(m => m.source !== 'NONE' || m.target !== 'NONE').length >= MAX_GESTURE_MAPPINGS) {
        displayGlobalError(`Máximo de ${MAX_GESTURE_MAPPINGS} mapeamentos atingido.`, 3000);
        return;
    }

    // Encontra o primeiro índice disponível ou adiciona um novo se abaixo do limite
    let newIndex = gestureMappings.findIndex(m => m.source === 'NONE' && m.target === 'NONE');
    if (newIndex === -1 && gestureMappings.length < MAX_GESTURE_MAPPINGS) {
        newIndex = gestureMappings.length;
    } else if (newIndex === -1) { // Já no máximo e todos ocupados
         displayGlobalError(`Não é possível adicionar mais mapeamentos. Limite de ${MAX_GESTURE_MAPPINGS} preenchido.`, 3000);
        return;
    }

    if (!gestureMappings[newIndex]) {
        gestureMappings[newIndex] = { source: 'NONE', target: 'NONE' };
    }
    // Se o slot já existe (foi 'NONE', 'NONE'), ele será atualizado/reconstruído.
    // Se é um novo slot (gestureMappings.length cresce), ele é adicionado.

    renderGestureMappingUI(); // Re-renderiza a UI para adicionar o novo slot
    updateActiveGestureMappingsList();
    saveAllPersistentSettings();
}

function removeGestureMappingSlot(event) {
    const indexToRemove = parseInt(event.target.dataset.index, 10);
    if (gestureMappings[indexToRemove]) {
        gestureMappings[indexToRemove] = { source: 'NONE', target: 'NONE' }; // Reseta em vez de remover do array
    }
    renderGestureMappingUI();
    updateActiveGestureMappingsList();
    saveAllPersistentSettings();
}

function resetAllGestureMappings() {
    gestureMappings = Array(MAX_GESTURE_MAPPINGS).fill(null).map(() => ({ source: 'NONE', target: 'NONE' }));
    renderGestureMappingUI();
    updateActiveGestureMappingsList();
    saveAllPersistentSettings();
    displayGlobalError("Todos os mapeamentos de gestos foram resetados.", 3000);
}


function renderGestureMappingUI() {
    const modalContent = document.getElementById('gestureMappingModalContent');
    if (!modalContent) return;
    modalContent.innerHTML = ''; // Limpa o conteúdo anterior

    // Garante que gestureMappings tenha sempre MAX_GESTURE_MAPPINGS items
    while(gestureMappings.length < MAX_GESTURE_MAPPINGS) {
        gestureMappings.push({ source: 'NONE', target: 'NONE' });
    }
    if(gestureMappings.length > MAX_GESTURE_MAPPINGS) {
        gestureMappings = gestureMappings.slice(0, MAX_GESTURE_MAPPINGS);
    }

    let activeSlots = 0;
    gestureMappings.forEach((mapping, index) => {
        if (mapping.source !== 'NONE' || mapping.target !== 'NONE' || activeSlots < 1) { // Mostra pelo menos 1 slot
            const slotElement = createGestureMappingSlot(index, mapping);
            modalContent.appendChild(slotElement);
            if (mapping.source !== 'NONE' || mapping.target !== 'NONE') {
                 activeSlots++;
            }
        }
    });
     if (activeSlots === 0 && modalContent.children.length === 0) { // Se nenhum slot ativo e nada renderizado
        const slotElement = createGestureMappingSlot(0, { source: 'NONE', target: 'NONE' });
        modalContent.appendChild(slotElement);
    }

    const addButton = document.getElementById('addGestureMappingButton');
    if(addButton) {
      const currentActiveMappings = gestureMappings.filter(m => m.source !== 'NONE' || m.target !== 'NONE').length;
      addButton.disabled = currentActiveMappings >= MAX_GESTURE_MAPPINGS;
    }
}


// Modificado de initGestureMappingControls para renderGestureMappingUI
// e chamado em locais apropriados (DOMContentLoaded, add, remove, reset)


// === V52: Audio Recording Functions ===
let isStoppingDueToError = false;
let isSavingAudio = false;

function startAudioRecording() {
    if (!simpleSynth || !simpleSynth.masterGainNode || !audioCtx) {
        displayGlobalError("Sintetizador ou contexto de áudio não inicializado.", 5000);
        return;
    }
    if (audioCtx.state === 'suspended') {
        displayGlobalError("Contexto de áudio suspenso. Interaja com a página primeiro.", 5000);
        return;
    }

    try {
        const destinationNode = audioCtx.createMediaStreamDestination();
        simpleSynth.masterGainNode.connect(destinationNode);

        const options = { mimeType: 'audio/webm; codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn(`${options.mimeType} não é suportado. Tentando audio/ogg...`);
            options.mimeType = 'audio/ogg; codecs=opus';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                console.warn(`${options.mimeType} não é suportado. Tentando audio/webm (default)...`);
                options.mimeType = 'audio/webm';
                 if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    console.error("Nenhum tipo MIME suportado para MediaRecorder (webm, ogg).");
                    displayGlobalError("Gravação de áudio não suportada neste navegador.", 7000);
                    simpleSynth.masterGainNode.disconnect(destinationNode);
                    return;
                 }
            }
        }
        console.log(`Usando mimeType: ${options.mimeType}`);

        mediaRecorder = new MediaRecorder(destinationNode.stream, options);

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstart = () => {
            audioChunks = [];
            isAudioRecording = true;
            isAudioPaused = false;
            if (recordAudioButton) {
                recordAudioButton.innerHTML = '<span class="recording-dot">🔴</span> Parar Gravação';
                recordAudioButton.classList.add('active', 'recording');
            }
            if (pauseAudioButton) {
                pauseAudioButton.disabled = false;
                pauseAudioButton.textContent = "⏸️ Pausar Gravação";
            }
            if (saveAudioButton) saveAudioButton.disabled = true;
            updateAudioRecordingHUD(true, false, 0);
            logOSC("SYSTEM", "Gravação de Áudio Iniciada", []);
            displayGlobalError("Gravação de áudio iniciada.", 3000);
        };

        mediaRecorder.onstop = () => {
            isAudioPaused = false;
            if (recordAudioButton) {
                recordAudioButton.innerHTML = "⏺️ Gravar Áudio";
                recordAudioButton.classList.remove('active', 'recording', 'paused');
            }
            if (pauseAudioButton) {
                pauseAudioButton.disabled = true;
                pauseAudioButton.textContent = "⏸️ Pausar Gravação";
            }
            if (saveAudioButton) saveAudioButton.disabled = audioChunks.length === 0;

            updateAudioRecordingHUD(false, false, 0);
            if (audioChunks.length === 0 && !isSavingAudio) {
                 logOSC("SYSTEM", "Gravação de Áudio Parada (sem dados)", []);
                 displayGlobalError("Gravação de áudio parada (sem dados).", 3000);
            } else if (!isSavingAudio) {
                 logOSC("SYSTEM", "Gravação de Áudio Parada (dados disponíveis)", []);
                 displayGlobalError("Gravação de áudio parada. Pronto para salvar.", 3000);
            }

            try {
              if(simpleSynth && simpleSynth.masterGainNode && destinationNode && destinationNode.numberOfOutputs > 0) {
                simpleSynth.masterGainNode.disconnect(destinationNode);
                console.log("masterGainNode desconectado do destinationNode da gravação.");
              }
            } catch (e) {
              console.warn("Erro ao desconectar destinationNode (pode já estar desconectado):", e);
            }
        };

        mediaRecorder.onpause = () => {
            if (pauseAudioButton) pauseAudioButton.innerHTML = "▶️ Retomar";
            if (recordAudioButton) recordAudioButton.classList.add('paused');
            isAudioPaused = true;
            updateAudioRecordingHUD(true, true, mediaRecorder.stream.currentTime);
            logOSC("SYSTEM", "Gravação de Áudio Pausada (onpause)", []);
        };

        mediaRecorder.onresume = () => {
            if (pauseAudioButton) pauseAudioButton.innerHTML = "⏸️ Pausar";
            if (recordAudioButton) recordAudioButton.classList.remove('paused');
            isAudioPaused = false;
            updateAudioRecordingHUD(true, false, mediaRecorder.stream.currentTime);
            logOSC("SYSTEM", "Gravação de Áudio Retomada (onresume)", []);
        };

        mediaRecorder.onerror = (event) => {
            console.error("Erro no MediaRecorder:", event.error);
            displayGlobalError(`Erro na gravação: ${event.error.name || 'Erro desconhecido'}.`, 7000);
            stopAudioRecording(true);
        };

        mediaRecorder.start(1000);

    } catch (e) {
        console.error("Falha ao iniciar MediaRecorder:", e);
        displayGlobalError(`Falha ao iniciar gravação: ${e.message || 'Erro desconhecido'}. Verifique as permissões e o console.`, 7000);
        isAudioRecording = false;
        updateAudioRecordingHUD(false, false, 0);
    }
}


function stopAudioRecording(dueToError = false) {
    isStoppingDueToError = dueToError;
    if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
        try {
            mediaRecorder.stop();
        } catch (e) {
            console.error("Erro ao chamar mediaRecorder.stop():", e);
            displayGlobalError("Erro ao parar gravação.", 5000);
        }
    }
    isAudioRecording = false;
    isAudioPaused = false;

    if (recordAudioButton) {
        recordAudioButton.innerHTML = "⏺️ Gravar Áudio";
        recordAudioButton.classList.remove('active', 'recording', 'paused');
    }
    if (pauseAudioButton) {
        pauseAudioButton.disabled = true;
        pauseAudioButton.innerHTML = "⏸️ Pausar";
    }
    if (saveAudioButton) {
        saveAudioButton.disabled = (audioChunks.length === 0);
    }
    updateAudioRecordingHUD(false, false, 0);
    if (dueToError) {
        logOSC("SYSTEM", "Gravação de Áudio Interrompida por Erro", []);
    }
}

function saveRecordedAudio() {
    if (audioChunks.length === 0) {
        displayGlobalError("Nenhum áudio gravado para salvar.", 3000);
        if (saveAudioButton) saveAudioButton.disabled = true;
        return;
    }

    let mimeType = 'audio/webm; codecs=opus';
    if (mediaRecorder && mediaRecorder.mimeType) {
        mimeType = mediaRecorder.mimeType;
    } else if (audioChunks.length > 0 && audioChunks[0].type && MediaRecorder.isTypeSupported(audioChunks[0].type)) {
        mimeType = audioChunks[0].type;
    }
    console.log("Salvando blob com mimeType:", mimeType);
    isSavingAudio = true;

    const blob = new Blob(audioChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style.display = 'none';
    a.href = url;
    const fileExtension = mimeType.includes('ogg') ? 'ogg' : (mimeType.includes('mp4') ? 'mp4' : 'webm');
    a.download = `gravacao_msm_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.${fileExtension}`;
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    logOSC("SYSTEM", `Áudio Salvo: ${a.download}`, []);
    displayGlobalError(`Áudio salvo como ${a.download}!`, 5000);
    updateAudioRecordingHUD(false, false, 0, true);

    audioChunks = [];
    if (saveAudioButton) saveAudioButton.disabled = true;
    if (recordAudioButton) recordAudioButton.classList.remove('active', 'recording', 'paused');

    isSavingAudio = false;
}


let audioRecordingHUDTimer = null;
function updateAudioRecordingHUD(isRecording, isPaused, durationSeconds = 0, isSaved = false) {
    let hudRecordDiv = document.getElementById('audioRecordingHUD');
    if (!hudRecordDiv) {
        hudRecordDiv = document.createElement('div');
        hudRecordDiv.id = 'audioRecordingHUD';
        Object.assign(hudRecordDiv.style, {
            position: 'fixed',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 15px',
            backgroundColor: 'rgba(200, 0, 0, 0.7)',
            color: 'white',
            zIndex: '1005',
            borderRadius: '5px',
            boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
            textAlign: 'center',
            fontSize: '13px',
            display: 'none',
            transition: 'background-color 0.3s, opacity 0.3s'
        });
        document.body.appendChild(hudRecordDiv);
    }

    if (audioRecordingHUDTimer) {
        clearInterval(audioRecordingHUDTimer);
        audioRecordingHUDTimer = null;
    }

    if (isRecording) {
        hudRecordDiv.style.display = 'block';
        hudRecordDiv.style.opacity = '1';
        let startTime = performance.now() - (durationSeconds * 1000);

        audioRecordingHUDTimer = setInterval(() => {
            const elapsedMs = performance.now() - startTime;
            const currentDurationSec = Math.floor(elapsedMs / 1000);
            const minutes = Math.floor(currentDurationSec / 60);
            const seconds = currentDurationSec % 60;
            const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            if (isPaused) {
                hudRecordDiv.textContent = `⏸️ GRAVAÇÃO PAUSADA (${timeStr})`;
                hudRecordDiv.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
            } else {
                hudRecordDiv.textContent = `🔴 GRAVANDO (${timeStr})`;
                hudRecordDiv.style.backgroundColor = 'rgba(200, 0, 0, 0.7)';
            }
        }, 1000);
        const initialDurationSec = Math.floor((performance.now() - startTime) / 1000);
        const initialMinutes = Math.floor(initialDurationSec / 60);
        const initialSeconds = initialDurationSec % 60;
        const initialTimeStr = `${initialMinutes.toString().padStart(2, '0')}:${initialSeconds.toString().padStart(2, '0')}`;
        if (isPaused) {
            hudRecordDiv.textContent = `⏸️ GRAVAÇÃO PAUSADA (${initialTimeStr})`;
            hudRecordDiv.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
        } else {
            hudRecordDiv.textContent = `🔴 GRAVANDO (${initialTimeStr})`;
            hudRecordDiv.style.backgroundColor = 'rgba(200, 0, 0, 0.7)';
        }

    } else if (isSaved) {
        hudRecordDiv.style.display = 'block';
        hudRecordDiv.style.opacity = '1';
        hudRecordDiv.textContent = '💾 ÁUDIO SALVO!';
        hudRecordDiv.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';
        setTimeout(() => {
            hudRecordDiv.style.opacity = '0';
            setTimeout(() => { hudRecordDiv.style.display = 'none'; }, 300);
        }, 2700);
    } else {
        if (hudRecordDiv.style.display === 'block') {
            hudRecordDiv.style.opacity = '0';
            setTimeout(() => { hudRecordDiv.style.display = 'none'; }, 300);
        }
    }
}
// === END V52/V59: Audio Recording Functions ===

// === V65: Play/Pause Functionality ===
async function togglePlayPause() {
    if (spectatorModeActive) return;

    // Ensure AudioContext is running, especially for the first user interaction
    if (!audioCtx) {
        console.log("AudioContext não existe. Tentando criar um novo.");
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (!simpleSynth && audioCtx) { // Initialize synth if it wasn't (e.g. if internal audio was off)
            simpleSynth = new SimpleSynth(audioCtx);
            const loadedSettings = loadAllPersistentSettings(); // Apply saved settings
            if (simpleSynth && loadedSettings.audioSettings) {
                Object.keys(loadedSettings.audioSettings).forEach(key => {
                    const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
                    if (typeof simpleSynth[setterName] === 'function') {
                        simpleSynth[setterName](loadedSettings.audioSettings[key]);
                    } else if (key === 'masterVolume' && typeof simpleSynth.setMasterVolume === 'function') {
                        simpleSynth.setMasterVolume(loadedSettings.audioSettings[key]);
                    }
                });
                updateModalSynthControls();
                updateSidebarSynthControls();
            }
        }
    }

    if (audioCtx && audioCtx.state === "suspended") {
        try {
            await audioCtx.resume();
            console.log("AudioContext resumed by Play/Pause button.");
        } catch (e) {
            console.error("Error resuming AudioContext:", e);
            displayGlobalError("Falha ao iniciar o áudio. Interaja com a página.");
            return; // Don't proceed if audio can't start
        }
    }

    // If using Tone.js, Tone.start() is the modern way to resume AudioContext
    // and should be called once per user interaction.
    // It's safe to call multiple times.
    if (typeof Tone !== 'undefined' && typeof Tone.start === 'function') {
        try {
            await Tone.start();
            console.log("Tone.start() chamado com sucesso.");
        } catch (e) {
            console.error("Erro ao chamar Tone.start():", e);
            // Fallback or alternative if Tone.start() is not available/fails
            if (audioCtx && audioCtx.state === "suspended") {
                 await audioCtx.resume();
            }
        }
    }


    isPlaying = !isPlaying;

    if (isPlaying) {
        // Start or resume sequencer/arpeggiator
        // If using Tone.Transport:
        if (typeof Tone !== 'undefined' && Tone.Transport) {
            Tone.Transport.start();
            console.log("Tone.Transport started.");
        }
        // Add custom sequencer start logic here if not using Tone.Transport
        // For example, reset lastNotePlayedTime or lastArpeggioNotePlayedTime for shapes
        // to allow immediate note generation if conditions are met.
        const now = performance.now();
        shapes.forEach(shape => {
            shape.lastNotePlayedTime = now - (noteInterval + 100); // Allow immediate play for non-arp
            shape.lastArpeggioNotePlayedTime = now - (60000 / arpeggioBPM + 100); // Allow immediate play for arp
        });


        if (playPauseButton) playPauseButton.innerHTML = "⏸️ Pause";
        if (audioActivityIndicator) audioActivityIndicator.style.backgroundColor = 'var(--success-color)'; // Green
        logOSC("SYSTEM", "Sequencer/Arpeggiator Started", []);
    } else {
        // Pause or stop sequencer/arpeggiator
        // If using Tone.Transport:
        if (typeof Tone !== 'undefined' && Tone.Transport) {
            Tone.Transport.pause(); // Or .stop() and .cancel() if you want to clear scheduled events
            console.log("Tone.Transport paused.");
        }
        // Add custom sequencer stop logic here
        turnOffAllActiveNotes(); // Stop any sounding notes

        if (playPauseButton) playPauseButton.innerHTML = "▶️ Play";
        if (audioActivityIndicator) audioActivityIndicator.style.backgroundColor = '#555'; // Grey
        logOSC("SYSTEM", "Sequencer/Arpeggiator Paused", []);
    }
    updateHUD();
    savePersistentSetting('isPlaying', isPlaying); // Optionally save play state
}

function loadPlayPauseState() { // Call this during initialization if you save play state
    const savedIsPlaying = loadPersistentSetting('isPlaying', false);
    if (savedIsPlaying && audioCtx && audioCtx.state === 'running') { // Only resume if audio context is already running
        //isPlaying = false; // Ensure togglePlayPause sets it correctly
        //togglePlayPause(); // This will set isPlaying to true and start transport
    } else {
        isPlaying = false; // Default to paused
        if (playPauseButton) playPauseButton.innerHTML = "▶️ Play";
        if (audioActivityIndicator) audioActivityIndicator.style.backgroundColor = '#555';
    }
}
// === END V65 ===
