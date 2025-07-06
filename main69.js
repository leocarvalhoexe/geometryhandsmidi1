// ==========================================================================
// MIDI SHAPE MANIPULATOR v69 - main69.js (Integrando Beat Matrix)
// ==========================================================================

// === CONFIGURAÇÕES GLOBAIS INICIAIS E ÁUDIO CONTEXT ===
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

// === CONSTANTES E VARIÁVEIS GLOBAIS DE ESTADO ===
// --- Elementos Principais da UI ---
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
    this.currentGestureName = ""; // V66: Para feedback visual do gesto
    this.avgDisp = 0; // V66: Para mapeamento de gestos e suavização de liquify
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
const OSC_SEND_INTERVAL = 100; // V66: Reduzido para maior responsividade OSC (era 100)
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
const APP_SETTINGS_KEY = 'midiShapeManipulatorV69Settings'; // ATUALIZADO para v69
const ARPEGGIO_SETTINGS_KEY = 'arpeggioSettingsV52';
const CAMERA_DEVICE_ID_KEY = 'midiShapeCameraDeviceIdV52';
const BEAT_MATRIX_SETTINGS_KEY = 'beatMatrixSettingsV69';


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


// === V69: Beat Matrix State ===
let beatMatrixContainer = null;
let toggleBeatMatrixButton = null;
let isBeatMatrixVisible = false;

// --- Controles da Beat Matrix ---
let midiOutSelectMatrix = null;
let playStopButtonMatrix = null;
let bpmDisplayMatrix = null;
let horizontalBpmFaderSVGMatrix = null;
let faderThumbMatrix = null;
let bpmTextDisplayMatrix = null;

// --- Controles de Configuração da Matriz ---
let matrixConfigControls = null;
let rowsFaderSVGMatrix = null;
let rowsFaderThumbMatrix = null;
let rowsValueDisplayMatrix = null;
let colsFaderSVGMatrix = null;
let colsFaderThumbMatrix = null;
let colsValueDisplayMatrix = null;
let padSizeFaderSVGMatrix = null;
let padSizeFaderThumbMatrix = null;
let padSizeValueDisplayMatrix = null;

// --- Variáveis Globais da Beat Matrix ---
let matrixMidiOut = null; // Saída MIDI específica para a matrix, pode ser a mesma do global
let isMatrixPlaying = false;
let currentMatrixColumn = 0;
let matrixBPM = 120;
let matrixTimerId = null;
const matrixPads = []; // Array para os elementos DOM dos pads da matrix
let currentMatrixNumRows = 4;
let currentMatrixNumCols = 4;
let currentMatrixPadSize = 60;

// --- Constantes para Faders da Matrix (adaptadas de beatmatrixexe.js) ---
const H_BPM_FADER_SVG_WIDTH_MATRIX = 200;
const H_BPM_FADER_TRACK_X_MATRIX = 5;
const H_BPM_FADER_TRACK_WIDTH_MATRIX = 190;
const H_BPM_FADER_THUMB_WIDTH_MATRIX = 16;
const MATRIX_MIN_BPM = 60;
const MATRIX_MAX_BPM = 300; // Ajustado para um range mais comum para beats
let isDraggingMatrixBPM = false;

const MATRIX_ROWS_FADER_TRACK_X = 5;
const MATRIX_ROWS_FADER_TRACK_WIDTH = 190;
const MATRIX_ROWS_FADER_THUMB_WIDTH = 14;
const MATRIX_MIN_ROWS = 1;
const MATRIX_MAX_ROWS = 8; // Ajustado para um valor mais gerenciável inicialmente
let isDraggingMatrixRows = false;

const MATRIX_COLS_FADER_TRACK_X = 5;
const MATRIX_COLS_FADER_TRACK_WIDTH = 190;
const MATRIX_COLS_FADER_THUMB_WIDTH = 14;
const MATRIX_MIN_COLS = 1;
const MATRIX_MAX_COLS = 16;
let isDraggingMatrixCols = false;

const MATRIX_PAD_SIZE_FADER_TRACK_X = 5;
const MATRIX_PAD_SIZE_FADER_TRACK_WIDTH = 190;
const MATRIX_PAD_SIZE_FADER_THUMB_WIDTH = 14;
const MATRIX_MIN_PAD_SIZE = 20;
const MATRIX_MAX_PAD_SIZE = 100;
let isDraggingMatrixPadSize = false;

// --- Variáveis de Estado de Gestos para Beat Matrix (se aplicável) ---
// Se a interação por gestos com a beat matrix for implementada,
// variáveis como isGesturingMatrixBPM, etc., seriam necessárias.
// Por enquanto, focaremos na interação por mouse/UI.
// === END V69: Beat Matrix State ===


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

/**
 * Atualiza o valor de um elemento slider e o texto de um elemento span associado.
 * @param {HTMLInputElement} sliderElement - O elemento slider.
 * @param {HTMLElement} valueElement - O elemento para exibir o valor formatado.
 * @param {number|string} value - O valor a ser definido.
 * @param {function} [formatFn=null] - Uma função opcional para formatar o valor para exibição.
 */
function updateControlValue(sliderElement, valueElement, value, formatFn = null) {
    if (sliderElement) {
        // Para sliders, o valor geralmente é numérico.
        // Se o valor recebido for string e puder ser convertido, ótimo. Caso contrário, pode dar problema se não for compatível.
        sliderElement.value = value;
    }
    if (valueElement) {
        valueElement.textContent = formatFn ? formatFn(value) : value;
    }
}

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
  let currentTotalDispMag = 0; // V66: Renomeado para evitar conflito com avgDisp da forma
  let activeLiquifyPts = 0;

  for (let i = 0; i < shape.sides; i++) {
    const angle = (i / shape.sides) * Math.PI * 2;
    let vx = r * Math.cos(angle); let vy = r * Math.sin(angle);
    let dx = 0; let dy = 0;
    if (useLiquify) {
      const vCanvasX = cx + vx; const vCanvasY = cy + vy;
      for (const tipIdx of fingertips) {
        if (!shape.rightHandLandmarks[tipIdx]) continue; // V66: Checagem de segurança
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
    currentTotalDispMag += Math.sqrt(dx**2 + dy**2); // V66: Usando currentTotalDispMag
    const finalX = cx + vx + dx; const finalY = cy + vy + dy;
    if (i === 0) ctx.moveTo(finalX, finalY); else ctx.lineTo(finalX, finalY);
  }
  ctx.closePath(); ctx.strokeStyle = shape.id === 0 ? '#00FFFF' : '#FF00FF'; ctx.lineWidth = 2.5; ctx.stroke(); // V66: Linha da forma um pouco mais fina

  // V66: Feedback visual para gestos
  if (shape.currentGestureName && !spectatorModeActive) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      // Posição do feedback: um pouco acima do centro da forma
      ctx.fillText(shape.currentGestureName, shape.centerX, shape.centerY - shape.radius - 15);
  }


  if ((currentNoteMode === 'ARPEGGIO' || currentNoteMode === 'SEQUENTIAL' || currentNoteMode === 'CHORD') && shape.sides > 0 && midiEnabled) {
    // V61: Visualização de nota ativa para ARPEGGIO, SEQUENTIAL, e CHORD (baseado no currentEdgeIndex)
    // Para CHORD, isso mostrará o vértice base do "acorde sequencial"
    let key;
    if (currentNoteMode === 'ARPEGGIO') {
        key = `shape_${shape.id}_arp_${shape.currentEdgeIndex}`;
    } else if (currentNoteMode === 'SEQUENTIAL') {
        key = `shape_${shape.id}_seq_${shape.currentEdgeIndex}`;
    } else { // CHORD
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
      const angle = (shape.currentEdgeIndex / shape.sides) * Math.PI * 2;
      let vx = r * Math.cos(angle); let vy = r * Math.sin(angle);
      let ox = 0; let oy = 0;
      if (vertexPullModeActive && shape.vertexOffsets[shape.currentEdgeIndex] && !spectatorModeActive) { ox = shape.vertexOffsets[shape.currentEdgeIndex].x; oy = shape.vertexOffsets[shape.currentEdgeIndex].y; }
      ctx.beginPath(); ctx.arc(cx + vx + ox, cy + vy + oy, 8, 0, Math.PI * 2);
      ctx.fillStyle = shape.id === 0 ? 'rgba(0,255,255,0.6)' : 'rgba(255,0,255,0.6)'; ctx.fill();
    }
  }
  // V66: Suavização do avgDisp para liquify e mapeamento de gestos
  // A variável 'totalDispMag' foi renomeada para 'currentTotalDispMag' anteriormente.
  // Esta linha estava incorreta, usando 'totalDispMag' que não é mais definido nesse escopo.
  // Corrigido para usar 'currentTotalDispMag'.
  const rawAvgDisp = (activeLiquifyPts > 0) ? currentTotalDispMag / activeLiquifyPts : (Object.keys(shape.vertexOffsets).length > 0 ? currentTotalDispMag / Object.keys(shape.vertexOffsets).length : 0);
  shape.avgDisp = shape.avgDisp * 0.8 + rawAvgDisp * 0.2; // Suavização exponencial

  const maxDistortion = 50.0; const pitchBendSens = 4096;
  shape.currentPitchBend = 8192 + Math.round(Math.min(1.0, shape.avgDisp / maxDistortion) * pitchBendSens);
  shape.currentPitchBend = Math.max(0, Math.min(16383, shape.currentPitchBend));
  const normDistortion = Math.min(1.0, shape.avgDisp / maxDistortion);
  shape.reverbAmount = Math.round(normDistortion * 127); shape.delayAmount = Math.round(normDistortion * 127);
  shape.modWheelValue = Math.round(normDistortion * 127); shape.resonanceValue = Math.round(normDistortion * 127);
  shape.panValue = Math.max(0, Math.min(127, Math.round((shape.centerX / canvasElement.width) * 127)));
  let normSides = (shape.sides - 3) / (20 - 3); normSides = Math.max(0, Math.min(1, normSides));
  if (shape.sides === 100) normSides = 0.5;
  shape.brightnessValue = Math.round(normSides * 127);
  processShapeNotes(shape, isPulsing, pulseValue);

  Object.keys(shape.activeMidiNotes).forEach(key => {
    const noteInfo = shape.activeMidiNotes[key];
    let shouldDelete = false;

    if (!noteInfo) { shouldDelete = true;
    } else if (!noteInfo.playing || !midiEnabled || shape.sides <= 0 || spectatorModeActive) {
        if (noteInfo.playing) { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); noteInfo.playing = false; }
        if (noteInfo.staccatoTimer) { clearTimeout(noteInfo.staccatoTimer); activeNoteTimers.delete(noteInfo.staccatoTimer); }
        shouldDelete = true;
    } else if (noteInfo.isSequentialNote && currentNoteMode !== 'SEQUENTIAL') {
        sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); noteInfo.playing = false;
        if (noteInfo.staccatoTimer) { clearTimeout(noteInfo.staccatoTimer); activeNoteTimers.delete(noteInfo.staccatoTimer); }
        shouldDelete = true;
    } else if (noteInfo.isArpeggioNote && currentNoteMode !== 'ARPEGGIO') {
        sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); noteInfo.playing = false;
        if (noteInfo.staccatoTimer) { clearTimeout(noteInfo.staccatoTimer); activeNoteTimers.delete(noteInfo.staccatoTimer); }
        shouldDelete = true;
    }
    if (shouldDelete) { delete shape.activeMidiNotes[key]; }
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
            if (!noteInfo.staccatoTimer || (noteInfo.staccatoTimer && !activeNoteTimers.has(noteInfo.staccatoTimer))) {
                 sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
                 noteInfo.playing = false;
            }
        }
    });
}


function processShapeNotes(shape, isPulsing, pulseValue) {
    if (spectatorModeActive || !midiEnabled || shape.sides <= 0 || !isPlaying) {
        if (!isPlaying) { stopAllNotesForShape(shape, true); }
        return;
    }
    const now = performance.now();

    let baseNoteIntervalForArp = 60000 / arpeggioBPM;
    let currentEffectiveNoteInterval = baseNoteIntervalForArp;

    if (currentNoteMode === 'ARPEGGIO' && arpSwing > 0) {
        const swingRatio = arpSwing / 100;
        const swingFactor = swingRatio * 0.66;
        if (shape.arpSwingStep % 2 === 0) { currentEffectiveNoteInterval = baseNoteIntervalForArp * (1 + swingFactor);
        } else { currentEffectiveNoteInterval = baseNoteIntervalForArp * (1 - swingFactor); }
    } else {
        currentEffectiveNoteInterval = (currentNoteMode === 'ARPEGGIO') ? baseNoteIntervalForArp : noteInterval;
    }

    const canPlayArp = currentNoteMode === 'ARPEGGIO' && shape.sides > 0 && (now - shape.lastArpeggioNotePlayedTime > currentEffectiveNoteInterval);
    const canPlayNonArp = currentNoteMode !== 'ARPEGGIO' && (now - shape.lastNotePlayedTime > currentEffectiveNoteInterval);

    if (canPlayArp || canPlayNonArp) {
        let notesToPlayData = [];
        let edgeIdx = shape.currentEdgeIndex;
        let notePlayedThisTick = false;
        let calculatedNote;

        if (!staccatoModeActive) {
            Object.keys(shape.activeMidiNotes).forEach(key => {
                const noteInfo = shape.activeMidiNotes[key];
                if (noteInfo && noteInfo.playing && !noteInfo.staccatoTimer) {
                    sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
                    noteInfo.playing = false;
                }
            });
        }

        switch (currentNoteMode) {
            case 'SEQUENTIAL':
                if (canPlayNonArp && shape.sides > 0) {
                    shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides;
                    edgeIdx = shape.currentEdgeIndex;
                    if (shape.sides === 100) {
                        calculatedNote = Math.min(127, Math.max(0, Math.round((edgeIdx / (shape.sides - 1)) * 127)));
                    } else { calculatedNote = getNoteInScale(edgeIdx); }
                    notesToPlayData.push({ note: calculatedNote, vertexIndex: edgeIdx, isSequential: true });
                    notePlayedThisTick = true; shape.lastNotePlayedTime = now;
                }
                break;
            case 'ARPEGGIO':
                if (canPlayArp && shape.sides > 0) {
                    if (shape.sides < 1) break;
                    shape.arpSwingStep++;
                    if (arpRandomness > 0 && Math.random() < arpRandomness / 100) {
                        shape.currentEdgeIndex = Math.floor(Math.random() * shape.sides);
                    } else {
                        if (currentArpeggioStyle === "UP") { shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides;
                        } else if (currentArpeggioStyle === "DOWN") { shape.currentEdgeIndex = (shape.currentEdgeIndex - 1 + shape.sides) % shape.sides;
                        } else if (currentArpeggioStyle === "UPDOWN") {
                            if (shape.sides === 1) { shape.currentEdgeIndex = 0;
                            } else {
                                if (shape.arpeggioDirection === 1) {
                                    if (shape.currentEdgeIndex >= shape.sides - 1) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.arpeggioDirection = -1; }
                                    else { shape.currentEdgeIndex++; }
                                } else {
                                    if (shape.currentEdgeIndex <= 0) { shape.currentEdgeIndex = 0; shape.arpeggioDirection = 1; }
                                    else { shape.currentEdgeIndex--; }
                                }
                            }
                        } else if (currentArpeggioStyle === "RANDOM") { shape.currentEdgeIndex = Math.floor(Math.random() * shape.sides); }
                    }
                    edgeIdx = shape.currentEdgeIndex;
                    if (shape.sides === 100) { calculatedNote = Math.min(127, Math.max(0, Math.round((edgeIdx / (shape.sides -1)) * 127)));
                    } else { calculatedNote = getNoteInScale(edgeIdx); }
                    notesToPlayData.push({ note: calculatedNote, vertexIndex: edgeIdx, isArpeggio: true });
                    notePlayedThisTick = true; shape.lastArpeggioNotePlayedTime = now;
                }
                break;
            case 'CHORD':
                if (canPlayNonArp && shape.sides > 0) {
                    const baseVertexIndex = shape.currentEdgeIndex;
                    const chordNotesDefinition = [0, 2, 4];
                    let baseNoteForChordPart;
                    if (shape.sides === 100) {
                        const baseMidiNoteForCircleChord = Math.min(127, Math.max(0, Math.round((baseVertexIndex / (shape.sides - 1)) * 127)));
                        baseNoteForChordPart = baseMidiNoteForCircleChord + chordNotesDefinition[shape.currentChordStepIndex];
                        calculatedNote = Math.max(0, Math.min(127, baseNoteForChordPart));
                    } else { calculatedNote = getNoteInScale(baseVertexIndex + chordNotesDefinition[shape.currentChordStepIndex]); }
                    notesToPlayData.push({ note: calculatedNote, vertexIndex: baseVertexIndex, isChordNote: true, chordPart: shape.currentChordStepIndex });
                    shape.currentChordStepIndex++;
                    if (shape.currentChordStepIndex >= chordNotesDefinition.length) {
                        shape.currentChordStepIndex = 0;
                        shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides;
                    }
                    notePlayedThisTick = true; shape.lastNotePlayedTime = now;
                }
                break;
            case 'RANDOM_WALK':
                if (canPlayNonArp) {
                    let randomWalkIndex = shape.currentEdgeIndex;
                    randomWalkIndex += Math.floor(Math.random() * 3) - 1;
                    if (shape.sides === 100) {
                        randomWalkIndex = Math.max(0, Math.min(127, randomWalkIndex));
                        calculatedNote = randomWalkIndex;
                    } else {
                        const scaleNoteCount = SCALES[currentScaleName].notes.length * 2;
                        randomWalkIndex = (randomWalkIndex % scaleNoteCount + scaleNoteCount) % scaleNoteCount;
                        calculatedNote = getNoteInScale(randomWalkIndex);
                    }
                    shape.currentEdgeIndex = randomWalkIndex;
                    notesToPlayData.push({ note: calculatedNote, vertexIndex: randomWalkIndex, isRandomWalk: true });
                    notePlayedThisTick = true; shape.lastNotePlayedTime = now;
                }
                break;
        }

        if (notePlayedThisTick && notesToPlayData.length > 0) {
            let baseVel = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * (97 / 270))));
            if (isPulsing) baseVel = Math.max(0, Math.min(127, Math.round(baseVel * (0.6 + ((pulseValue + 1) / 2) * 0.4))));

            notesToPlayData.forEach((noteData) => {
                let finalVel = baseVel; let playThisNote = true;
                if (noteData.isArpeggio && arpGhostNoteChance > 0 && Math.random() < arpGhostNoteChance / 100) {
                    if (Math.random() < 0.3) { playThisNote = false; }
                    else { finalVel = Math.max(1, Math.round(baseVel * 0.1)); }
                }
                if (playThisNote) {
                    const noteToPlay = noteData.note; const vertexIndex = noteData.vertexIndex;
                    let key;
                    if (noteData.isSequential) { key = `shape_${shape.id}_seq_${vertexIndex}`;
                    } else if (noteData.isArpeggio) { key = `shape_${shape.id}_arp_${vertexIndex}`;
                    } else if (noteData.isChordNote) { key = `shape_${shape.id}_chord_${vertexIndex}_part_${noteData.chordPart}`;
                    } else if (noteData.isRandomWalk) { key = `shape_${shape.id}_rw_${vertexIndex}_note_${noteToPlay}`;
                    } else { key = `shape_${shape.id}_other_${vertexIndex}_note_${noteToPlay}`; }

                    if (shape.activeMidiNotes[key]?.staccatoTimer) { clearTimeout(shape.activeMidiNotes[key].staccatoTimer); activeNoteTimers.delete(shape.activeMidiNotes[key].staccatoTimer); }
                    sendMidiNoteOn(noteToPlay, finalVel, shape.midiChannel, shape.id + 1);
                    shape.activeMidiNotes[key] = { note: noteToPlay, playing: true, staccatoTimer: null, isSequentialNote: !!noteData.isSequential, isArpeggioNote: !!noteData.isArpeggio, isChordNote: !!noteData.isChordNote, isRandomWalkNote: !!noteData.isRandomWalk, vertexIndex: vertexIndex, timestamp: now };
                    if (staccatoModeActive) {
                        const timerId = setTimeout(() => {
                            if (shape.activeMidiNotes[key]?.playing) { sendMidiNoteOff(noteToPlay, shape.midiChannel, shape.id + 1); if (shape.activeMidiNotes[key]) shape.activeMidiNotes[key].playing = false; }
                            activeNoteTimers.delete(timerId);
                        }, 150); // V66: Staccato duration (150ms)
                        shape.activeMidiNotes[key].staccatoTimer = timerId; activeNoteTimers.add(timerId);
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
    }
    let activeNotesExistForPitchBend = false; let lastKnownPitchBendForShape = 8192;
    for (const key in shape.activeMidiNotes) {
        if (shape.activeMidiNotes[key]?.playing) { activeNotesExistForPitchBend = true; lastKnownPitchBendForShape = shape.activeMidiNotes[key].lastPitchBend || 8192; break; }
    }
    if (activeNotesExistForPitchBend) {
        if (Math.abs(shape.currentPitchBend - lastKnownPitchBendForShape) > 10) {
            sendPitchBend(shape.currentPitchBend, shape.midiChannel);
            Object.values(shape.activeMidiNotes).forEach(ni => { if (ni && ni.playing) ni.lastPitchBend = shape.currentPitchBend; });
        }
    }
}


// V68: Funções de processamento de gestos refatoradas a partir de onResults
/**
 * Processa o gesto de redimensionamento (Zoom) para uma forma.
 * Este gesto é ativado quando ambas as mãos estão visíveis e os dedos indicadores
 * de ambas as mãos estão relativamente esticados.
 * A distância entre os polegares das duas mãos controla o raio da forma.
 * @param {Shape} shape - O objeto da forma a ser processado.
 * @returns {boolean} - True se o gesto de redimensionamento foi detectado e processado, false caso contrário.
 */
function processResizeGesture(shape) {
    if (!shape.leftHandLandmarks || !shape.rightHandLandmarks) {
        return false; // Ambas as mãos são necessárias
    }

    const lThumb = shape.leftHandLandmarks[4]; // Ponta do polegar esquerdo
    const rThumb = shape.rightHandLandmarks[4]; // Ponta do polegar direito

    // Condição para dedos indicadores esticados: ponta do dedo (landmark 8) está "acima" (menor valor Y)
    // da segunda junta do dedo (landmark 6). Isso indica que o dedo não está curvado para dentro da palma.
    const lIdxStretched = shape.leftHandLandmarks[8].y < shape.leftHandLandmarks[6].y;
    const rIdxStretched = shape.rightHandLandmarks[8].y < shape.rightHandLandmarks[6].y;

    if (lIdxStretched && rIdxStretched) {
        shape.currentGestureName = "Zoom"; // Define o nome do gesto para feedback visual na tela

        // Calcula a distância euclidiana entre os polegares, escalada pela largura do canvas
        const dist = distance(lThumb.x, lThumb.y, rThumb.x, rThumb.y) * canvasElement.width;

        // Normaliza a distância para um valor entre 0 e 1.
        // '20' é uma pequena "dead zone" para evitar ativação com polegares muito próximos.
        // 'canvasElement.width * 0.35' define a sensibilidade ou o range máximo da distância útil para o zoom.
        const normDist = Math.max(0, Math.min(1, (dist - 20) / (canvasElement.width * 0.35)));

        // Atualiza o raio da forma.
        // O raio é uma combinação suavizada do raio anterior e do novo raio calculado.
        // Mínimo raio: 20. Máximo raio: 20 + 280 = 300.
        // Os fatores 0.85 e 0.15 controlam a suavidade da transição do raio.
        shape.radius = shape.radius * 0.85 + (20 + normDist * 280) * 0.15;

        // Debounce para registrar a mudança de raio.
        // Evita atualizações de estado excessivas se a mudança for pequena ou muito rápida.
        if (Math.abs(shape.radius - shape.lastResizeRadius) > 3 && (performance.now() - shape.lastResizeTime > 100)) {
            shape.lastResizeRadius = shape.radius; // Atualiza o último raio registrado
            shape.lastResizeTime = performance.now(); // Atualiza o tempo da última mudança significativa
        }
        return true; // Indica que o gesto de zoom foi processado
    }
    return false; // Gesto de zoom não aplicável ou não detectado nesta iteração
}

/**
 * Processa o gesto de mudança de lados para uma forma (pinça com a mão esquerda).
 * Este gesto é ativado quando a mão esquerda está visível e a pinça formada pelo
 * polegar e indicador está tocando a área da forma.
 * A distância da pinça controla o número de lados da forma.
 * @param {Shape} shape - O objeto da forma a ser processado.
 * @returns {boolean} - True se o gesto de mudança de lados foi detectado e processado, false caso contrário.
 */
function processSidesGesture(shape) {
    if (!shape.leftHandLandmarks) {
        return false; // Mão esquerda é necessária para este gesto
    }

    const idx = shape.leftHandLandmarks[8];   // Landmark da ponta do dedo indicador esquerdo
    const thumb = shape.leftHandLandmarks[4]; // Landmark da ponta do polegar esquerdo

    // Calcula a posição média da pinça (entre polegar e indicador) no espaço do canvas.
    // A coordenada X é invertida (canvasElement.width - ...) porque os landmarks de mão são tipicamente espelhados.
    const pinchCanvasX = canvasElement.width - ((idx.x + thumb.x) / 2 * canvasElement.width);
    const pinchCanvasY = ((idx.y + thumb.y) / 2 * canvasElement.height);

    // Verifica se a posição da pinça está dentro de uma área de tolerância ao redor da circunferência da forma.
    // 'shape.radius * 0.8' define uma tolerância de 80% do raio da forma para o toque.
    const isTouching = isTouchingCircle(pinchCanvasX, pinchCanvasY, shape.centerX, shape.centerY, shape.radius, shape.radius * 0.8);

    if (isTouching) {
        shape.currentGestureName = "Lados"; // Define o nome do gesto para feedback visual

        // Calcula a distância euclidiana da pinça (entre polegar e indicador), escalada pela largura do canvas.
        const pinchDist = distance(idx.x, idx.y, thumb.x, thumb.y) * canvasElement.width;

        let newSides;
        // Mapeia a distância da pinça para o número de lados da forma.
        if (pinchDist > 140) { // Pinça muito aberta: forma se torna um círculo (representado por 100 lados).
            newSides = 100;
        } else if (pinchDist < 20) { // Pinça muito fechada: forma se torna um triângulo (3 lados).
            newSides = 3;
        } else {
            // Para distâncias intermediárias, mapeia linearmente a distância da pinça (entre 20 e 140)
            // para um número de lados (entre 3 e 20).
            const normPinch = (pinchDist - 20) / (140 - 20); // Normaliza a distância para o intervalo [0, 1]
            newSides = Math.round(3 + normPinch * (20 - 3)); // Mapeia para o range de 3 a 20 lados.
        }
        newSides = Math.max(3, Math.min(100, newSides)); // Garante que o número de lados permaneça no intervalo válido [3, 100].

        // Aplica a mudança no número de lados somente se houver uma alteração e após um debounce.
        if (newSides !== shape.sides) {
            if (performance.now() - shape.lastSideChangeTime > (SIDE_CHANGE_DEBOUNCE_MS - 100)) {
                 shape.sides = newSides; // Atualiza o número de lados da forma
                 shape.lastSideChangeTime = performance.now(); // Registra o tempo da mudança

                 // Ajusta o índice da borda/nota atual se estiver fora dos limites do novo número de lados.
                 if(shape.currentEdgeIndex >= newSides && newSides > 0) {
                     shape.currentEdgeIndex = Math.max(0, newSides-1);
                 } else if (newSides === 0 && shape.currentEdgeIndex !== 0) { // Caso raro, mas seguro
                     shape.currentEdgeIndex = 0;
                 }
                 turnOffAllActiveNotesForShape(shape); // Importante: desliga notas ativas ao mudar a forma,
                                                      // pois a nota/borda anterior pode não existir mais.
            }
        }
        return true; // Indica que o gesto de mudança de lados foi processado
    }
    return false; // Gesto de mudança de lados não aplicável ou não detectado
}
// Fim das funções de processamento de gestos refatoradas V68

async function initializeCamera(deviceId = null) {
    logDebug(`Tentando inicializar câmera. Device ID: ${deviceId || 'Padrão'}`);
    console.log(`Inicializando câmera com deviceId: ${deviceId || 'Padrão'}`); cameraError = false;
    if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }

    if (camera && typeof camera.stop === 'function') {
        try { await camera.stop(); }
        catch(e) { console.warn("Erro ao parar câmera anterior:", e); }
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
                    videoElement.play().then(() => { console.log("videoElement.play() bem-sucedido."); resolve(); })
                    .catch(e => { console.error("Erro ao tentar dar play no vídeo:", e); cameraError = true; reject(e); });
                };
                videoElement.onerror = (e) => { console.error("Erro no elemento de vídeo (onerror):", e); cameraError = true; reject(e); };
            });
        } else {
            console.error("videoElement não encontrado no DOM."); cameraError = true;
            if (mediaStream) mediaStream.getTracks().forEach(track => track.stop()); return;
        }

        if (!hands) {
            console.log("Instanciando MediaPipe Hands...");
            hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
            hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.6 }); // V66: Reduzir um pouco a confiança mínima para maior detecção
            hands.onResults(onResults);
        } else {
             hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.6 }); // V66: Reduzir um pouco a confiança mínima
        }

        console.log("Instanciando MediaPipe Camera...");
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (gestureSimulationActive || cameraError || !videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                    if (cameraError && !gestureSimulationActive) { drawFallbackAnimation(); updateHUD(); } return;
                }
                if (hands && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                    try { await hands.send({ image: videoElement }); }
                    catch (e) { console.error("Erro ao enviar frame para hands.send:", e); cameraError = true; }
                }
            },
            width: 640, height: 480
        });
        console.log("Iniciando MediaPipe Camera (camera.start())...");
        await camera.start();
        console.log("Camera e MediaPipe inicializados com sucesso.");
        logDebug("Câmera e MediaPipe inicializados com sucesso.", { deviceId: deviceId });
        currentCameraDeviceId = deviceId; localStorage.setItem(CAMERA_DEVICE_ID_KEY, currentCameraDeviceId || '');

    } catch (error) {
        console.error(`Falha ao inicializar webcam (ID: ${deviceId || 'Padrão'}):`, error);
        logDebug("Falha ao inicializar webcam.", { deviceId: deviceId, error: error });
        displayGlobalError(`Falha webcam (${error.name || 'Error'}): ${error.message || 'Desconhecido'}. Verifique permissões.`, 20000);
        cameraError = true;
        if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); }
        if (camera && typeof camera.stop === 'function') { try { await camera.stop(); } catch(e) { console.warn("Erro ao tentar parar MediaPipe Camera após falha:", e); } }
        camera = null;
    }
}

async function populateCameraSelect() {
    logDebug("Populando lista de câmeras...");
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn("navigator.mediaDevices.enumerateDevices() não é suportado.");
        if(cameraSelectElement) cameraSelectElement.disabled = true; return;
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
                const option = document.createElement('option'); option.value = device.deviceId;
                option.text = device.label || `Câmera ${cameraSelectElement.options.length}`;
                if (device.deviceId === currentCameraDeviceId) option.selected = true;
                else if (!currentCameraDeviceId && preferredDeviceId && device.deviceId === preferredDeviceId) { option.selected = true; currentCameraDeviceId = device.deviceId; }
                cameraSelectElement.appendChild(option);
            });
            cameraSelectElement.disabled = videoDevices.length <= 1 && !videoDevices.find(d => d.deviceId === currentCameraDeviceId && currentCameraDeviceId !== '');
        }
    } catch (err) { console.error("Erro ao listar câmeras: ", err); if(cameraSelectElement) cameraSelectElement.disabled = true; }
}

function onResults(results) {
  logDebug("onResults chamado.", { numHands: results.multiHandLandmarks?.length });
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; // V66: Suaviza o rastro (era 0.08)
  ctx.fillRect(0,0,canvasElement.width,canvasElement.height);

  shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; s.currentGestureName = ""; }); // V66: Reseta nome do gesto

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
          if(handedness === "Left" && !shapes[j].leftHandLandmarks && !assignedL[j]) { shapes[j].leftHandLandmarks = landmarks; assignedL[j]=true; break; }
          if(handedness === "Right" && !shapes[j].rightHandLandmarks && !assignedR[j]) { shapes[j].rightHandLandmarks = landmarks; assignedR[j]=true; break; }
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
      // V66: Ajuste de suavização para posição da forma (0.95 para muito suave, 0.8 para mais responsivo)
      shape.centerX = shape.centerX * 0.92 + targetCenterX * 0.08;
      shape.centerY = shape.centerY * 0.92 + targetCenterY * 0.08;
    }

    // V68: Lógica de gestos refatorada para funções separadas.
    // Tenta processar o gesto de redimensionamento (ambas as mãos).
    if (!gestureProcessed) {
        if (processResizeGesture(shape)) {
            currentGesture = 'resize';
            gestureProcessed = true;
        }
    }
    // Se não foi redimensionamento, tenta processar o gesto de mudança de lados (mão esquerda).
    if (!gestureProcessed) {
        if (processSidesGesture(shape)) {
            currentGesture = 'sides';
            gestureProcessed = true;
        }
    }
    // Se nenhum gesto específico foi processado e a mão direita está presente, assume-se o gesto de 'liquify'.
    if (!gestureProcessed && shape.rightHandLandmarks) {
        currentGesture = 'liquify';
        shape.currentGestureName = "Distorcer";
        // A lógica efetiva de 'liquify' (distorção dos vértices) ocorre na função drawShape.
        // Aqui, apenas marcamos que este é o gesto ativo para a forma.
    }

    const oscGesture = currentGesture || 'none'; // Define a string do gesto para OSC.
    // Envia mensagem OSC se o gesto ativo mudou.
    if (shape.lastSentActiveGesture !== oscGesture) {
      sendOSCMessage(`/forma/${shape.id+1}/gestureActivated`, oscGesture);
      shape.lastSentActiveGesture = oscGesture;
    }
    shape.activeGesture = currentGesture; // Atualiza o gesto ativo na forma.
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
      if (pc.width !== outputPopupWindow.innerWidth || pc.height !== outputPopupWindow.innerHeight) { pc.width = outputPopupWindow.innerWidth; pc.height = outputPopupWindow.innerHeight; }
      popupCanvasCtx.fillStyle='rgba(0,0,0,0.1)'; popupCanvasCtx.fillRect(0,0,pc.width,pc.height);
      popupCanvasCtx.drawImage(canvasElement,0,0,pc.width,pc.height);
    } catch(e) { if(e.name === "InvalidStateError" || outputPopupWindow?.closed) { popupCanvasCtx=null; outputPopupWindow=null; } }
  }
}

function drawLandmarks(landmarksArray, handedness = "Unknown") {
    if (!landmarksArray || landmarksArray.length === 0 || spectatorModeActive) return;
    const connections = [ [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], [5,9],[9,10],[10,11],[11,12], [9,13],[13,14],[14,15],[15,16], [13,17],[17,18],[18,19],[19,20], [0,17] ];
    ctx.strokeStyle = handedness === "Right" ? 'lime' : (handedness === "Left" ? 'cyan' : 'yellow');
    ctx.lineWidth = 2; // V66: Linhas um pouco mais finas para landmarks

    for (const conn of connections) {
        const lm1 = landmarksArray[conn[0]]; const lm2 = landmarksArray[conn[1]];
        if (lm1 && lm2) {
            ctx.beginPath();
            ctx.moveTo(canvasElement.width - (lm1.x * canvasElement.width), lm1.y * canvasElement.height);
            ctx.lineTo(canvasElement.width - (lm2.x * canvasElement.width), lm2.y * canvasElement.height);
            ctx.stroke();
        }
    }
    // V66: Desenha círculos nos fingertips para melhor visualização
    const fingertipsIndices = [4, 8, 12, 16, 20];
    ctx.fillStyle = handedness === "Right" ? 'rgba(0, 255, 0, 0.6)' : (handedness === "Left" ? 'rgba(0, 255, 255, 0.6)' : 'rgba(255, 255, 0, 0.6)');
    for (const tipIdx of fingertipsIndices) {
        const landmark = landmarksArray[tipIdx];
        if (landmark) {
            ctx.beginPath();
            ctx.arc(canvasElement.width - (landmark.x * canvasElement.width), landmark.y * canvasElement.height, 5, 0, Math.PI * 2); // Raio 5 para os círculos
            ctx.fill();
        }
    }
}

function initFallbackShapes() {
    if (fallbackShapes.length > 0 && canvasElement && fallbackShapes[0].canvasWidth === canvasElement.width && fallbackShapes[0].canvasHeight === canvasElement.height) return;
    fallbackShapes = [];
    if (!canvasElement || canvasElement.width === 0 || canvasElement.height === 0) { console.warn("initFallbackShapes: Canvas não pronto ou sem dimensões."); return; }
    const numShapes = 5 + Math.floor(Math.random() * 5);
    const colors = ["#FF00FF", "#00FFFF", "#FFFF00", "#FF0000", "#00FF00", "#FFA500", "#800080"];
    for (let i = 0; i < numShapes; i++) {
        fallbackShapes.push({ x: Math.random() * canvasElement.width, y: Math.random() * canvasElement.height, radius: 15 + Math.random() * 25, color: colors[i % colors.length], vx: (Math.random() - 0.5) * (2 + Math.random() * 2), vy: (Math.random() - 0.5) * (2 + Math.random() * 2), sides: 3 + Math.floor(Math.random() * 6), rotationSpeed: (Math.random() - 0.5) * 0.02, currentAngle: Math.random() * Math.PI * 2, canvasWidth: canvasElement.width, canvasHeight: canvasElement.height });
    }
    logDebug("Fallback shapes inicializadas:", fallbackShapes.length);
}

function drawFallbackAnimation() {
    if (!canvasElement || !ctx) { console.warn("drawFallbackAnimation: Canvas ou context não disponível."); return; }
    if (fallbackShapes.length === 0 || (fallbackShapes[0].canvasWidth !== canvasElement.width || fallbackShapes[0].canvasHeight !== canvasElement.height) ) { initFallbackShapes(); if (fallbackShapes.length === 0) return; }
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    ctx.font = "bold 18px Arial"; ctx.fillStyle = "#666"; ctx.textAlign = "center";
    ctx.fillText("Detecção de mãos indisponível ou falhou.", canvasElement.width / 2, canvasElement.height / 2 - 30);
    ctx.font = "14px Arial";
    ctx.fillText("Exibindo animação alternativa. Verifique as permissões da câmera.", canvasElement.width / 2, canvasElement.height / 2);
    fallbackShapes.forEach(shape => {
        shape.x += shape.vx; shape.y += shape.vy; shape.currentAngle += shape.rotationSpeed;
        if (shape.x - shape.radius < 0) { shape.x = shape.radius; shape.vx *= -1; }
        if (shape.x + shape.radius > canvasElement.width) { shape.x = canvasElement.width - shape.radius; shape.vx *= -1; }
        if (shape.y - shape.radius < 0) { shape.y = shape.radius; shape.vy *= -1; }
        if (shape.y + shape.radius > canvasElement.height) { shape.y = canvasElement.height - shape.radius; shape.vy *= -1; }
        ctx.beginPath();
        for (let i = 0; i < shape.sides; i++) {
            const angle = (i / shape.sides) * Math.PI * 2 + shape.currentAngle;
            const x = shape.x + shape.radius * Math.cos(angle); const y = shape.y + shape.radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.strokeStyle = shape.color; ctx.lineWidth = 2 + Math.random(); ctx.stroke();
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
  const ch = Math.max(0, Math.min(15, channel)); const n = Math.max(0, Math.min(127, Math.round(note))); const v = Math.max(0, Math.min(127, Math.round(velocity)));
  if (midiEnabled && midiOutput) { midiOutput.send([0x90 + ch, n, v]); }
  if (_internalAudioEnabledMaster && simpleSynth && typeof simpleSynth.noteOn === 'function') { simpleSynth.noteOn(n, v); }
  sendOSCMessage(`/forma/${shapeId}/noteOn`, n, v, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, v);
}
function sendMidiNoteOff(note, channel, shapeId = -1) {
  if (spectatorModeActive) return;
  const ch = Math.max(0, Math.min(15, channel)); const n = Math.max(0, Math.min(127, Math.round(note)));
  if (midiEnabled && midiOutput) { midiOutput.send([0x80 + ch, n, 0]); }
  if (_internalAudioEnabledMaster && simpleSynth && typeof simpleSynth.noteOff === 'function') { simpleSynth.noteOff(n); }
  sendOSCMessage(`/forma/${shapeId}/noteOff`, n, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, 0);
}
function sendPitchBend(bendValue, channel) { if (spectatorModeActive || !midiEnabled || !midiOutput) return; const ch = Math.max(0,Math.min(15,channel)); const bend = Math.max(0,Math.min(16383,Math.round(bendValue))); midiOutput.send([0xE0+ch, bend & 0x7F, (bend>>7)&0x7F]); }
function sendMidiCC(cc, value, channel) { if (spectatorModeActive || !midiEnabled || !midiOutput) return; const ch = Math.max(0,Math.min(15,channel)); const c = Math.max(0,Math.min(119,Math.round(cc))); const v = Math.max(0,Math.min(127,Math.round(value))); midiOutput.send([0xB0+ch, c, v]); }

function turnOffAllActiveNotesForShape(shape) { stopAllNotesForShape(shape, true); }
function turnOffAllActiveNotes() {
    if (spectatorModeActive) return; logDebug("Desligando todas as notas ativas para todas as formas (MIDI e Interno).");
    const origMidiEnabled = midiEnabled; midiEnabled = true;
    shapes.forEach(shape => stopAllNotesForShape(shape, true));
    midiEnabled = origMidiEnabled;
    if (simpleSynth && typeof simpleSynth.allNotesOff === 'function') { simpleSynth.allNotesOff(); }
    clearAllNoteTimers();
}
function resetMidiSystem() {
    if (spectatorModeActive) return; console.log("MIDI Reset."); logDebug("Sistema MIDI Resetado."); turnOffAllActiveNotes();
    const origMidiEnabled = midiEnabled; midiEnabled = true;
    if (midiOutput) { for (let ch = 0; ch < 16; ch++) { sendMidiCC(120, 0, ch); sendMidiCC(123, 0, ch); sendMidiCC(121, 0, ch); sendPitchBend(8192, ch); } }
    midiEnabled = origMidiEnabled;
    shapes.forEach(s => { s.currentPitchBend = 8192; s.reverbAmount = 0; s.delayAmount = 0; s.panValue = 64; s.brightnessValue = 64; s.modWheelValue = 0; s.resonanceValue = 0; s.lastSentReverb = -1; s.lastSentDelay = -1; s.lastSentPan = -1; s.lastSentBrightness = -1; s.lastSentModWheel = -1; s.lastSentResonance = -1; });
    updateHUD(); sendAllGlobalStatesOSC(); displayGlobalError("Sistema MIDI Resetado.", 3000); logOSC("SYSTEM", "MIDI Reset", []);
}

function loadOscSettings() { const stored = localStorage.getItem(OSC_SETTINGS_KEY); let loadedHost = location.hostname; let loadedPort = 8080; if (stored) { try { const s = JSON.parse(stored); if (s.host) loadedHost = s.host; if (s.port) loadedPort = parseInt(s.port,10); } catch(e){ loadedHost = location.hostname || "127.0.0.1"; loadedPort = 8080; }} else { loadedHost = location.hostname || "127.0.0.1"; loadedPort = 8080; } OSC_HOST = loadedHost || "127.0.0.1"; OSC_PORT = loadedPort || 8080; if (oscHostInput) oscHostInput.value = OSC_HOST; if (oscPortInput) oscPortInput.value = OSC_PORT; console.log(`OSC Config: ${OSC_HOST}:${OSC_PORT}`); }
function saveOscSettings(host, port) { const newPort = parseInt(port,10); if (isNaN(newPort) || newPort<1 || newPort>65535) { displayGlobalError("Porta OSC inválida.",5000); return false; } if (!host || host.trim()==="") { displayGlobalError("Host OSC vazio.",5000); return false; } const settings = {host:host.trim(), port:newPort}; try { localStorage.setItem(OSC_SETTINGS_KEY, JSON.stringify(settings)); OSC_HOST=settings.host; OSC_PORT=settings.port; console.log(`OSC Salvo: ${OSC_HOST}:${OSC_PORT}`); if(oscHostInput) oscHostInput.value = OSC_HOST; if(oscPortInput) oscPortInput.value = OSC_PORT; if (osc && typeof setupOSC === 'function') setupOSC(); return true; } catch(e) { displayGlobalError("Erro salvar OSC.",5000); return false; } }
function sendOSCMessage(address, ...args) { logDebug(`Enviando OSC: ${address}`, args); if (spectatorModeActive && !address.startsWith('/ping')) return; if (osc && osc.status() === OSC.STATUS.IS_OPEN) { const message = new OSC.Message(address, ...args); try { osc.send(message); } catch (error) { logDebug("Erro ao enviar OSC", { address, args, error }); if (osc.status() !== OSC.STATUS.IS_OPEN && reconnectOSCButton) { reconnectOSCButton.style.display = 'inline-block'; oscStatus = "OSC Erro Envio"; updateHUD(); } } } else { logDebug("OSC não conectado, não foi possível enviar.", { address, args, oscStatus: osc?.status() }); if (reconnectOSCButton && osc && osc.status() !== OSC.STATUS.IS_OPEN) { reconnectOSCButton.style.display = 'inline-block'; } } if (isRecordingOSC && !address.startsWith('/ping')) { recordedOSCSequence.push({ timestamp: performance.now() - recordingStartTime, message: { address: address, args: args } }); } }
function sendOSCHeartbeat() { sendOSCMessage('/ping', Date.now()); }
function setupOSC() { logDebug(`Configurando OSC para ws://${OSC_HOST}:${OSC_PORT}`); if (osc && osc.status() === OSC.STATUS.IS_OPEN) { logDebug("Fechando conexão OSC existente."); osc.close(); } if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; console.log(`Conectando OSC: ws://${OSC_HOST}:${OSC_PORT}`); osc = new OSC({ plugin: new OSC.WebsocketClientPlugin({ host: OSC_HOST, port: OSC_PORT, secure: false }) }); osc.on('open', () => { oscStatus = `OSC Conectado (ws://${OSC_HOST}:${OSC_PORT})`; console.log(oscStatus); logDebug("OSC conectado."); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = setInterval(sendOSCHeartbeat, 5000); sendOSCHeartbeat(); sendAllGlobalStatesOSC(); if (reconnectOSCButton) reconnectOSCButton.style.display = 'none'; updateHUD(); }); osc.on('close', (event) => { oscStatus = "OSC Desconectado"; logDebug("OSC desconectado.", event); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); }); osc.on('error', (err) => { oscStatus = "OSC Erro Conexão"; logDebug("OSC Erro Conexão.", err); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); }); osc.on('message', (msg) => { logDebug("OSC Mensagem recebida (bruta):", msg); try { let pMsg = msg; if (msg.args && msg.args.length > 0 && typeof msg.args[0] === 'string') { try { const pJson = JSON.parse(msg.args[0]); if (pJson.type === "confirmation" || (pJson.address && pJson.args)) { pMsg = pJson; logDebug("OSC Mensagem (após parse JSON de args[0]):", pMsg); } } catch (e) { /* não era JSON, ignora */ } } if (pMsg && pMsg.address) { logOSC("IN (UDP)", pMsg.address, pMsg.args); handleIncomingExternalOSC(pMsg); } else { logDebug("Mensagem OSC recebida ignorada (sem endereço após processamento):", pMsg); } } catch (e) { logDebug("Erro ao processar mensagem OSC recebida:", { error: e, originalMessage: msg }); } }); try { osc.open(); } catch (error) { oscStatus = `OSC Falha: ${error.message}`; logDebug("Falha ao abrir conexão OSC.", error); if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); } osc.on('/global/setExternalBPM', msg => { /* ... */ }); osc.on('/global/setScale', msg => { /* ... */ }); }
function handleIncomingExternalOSC(oscMessage) { logDebug("Processando OSC Externo:", oscMessage); /* ... */ }
function sendAllGlobalStatesOSC() { if (spectatorModeActive) return; logDebug("Enviando todos os estados globais via OSC."); sendOSCMessage('/global/state/midiEnabled',midiEnabled?1:0); sendOSCMessage('/global/state/pulseMode', pulseModeActive?1:0); sendOSCMessage('/global/state/staccatoMode',staccatoModeActive?1:0); /* ... more ... */ }
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
            event.stopPropagation(); const isOpen = sidebar.classList.toggle('open');
            sidebarHandle.textContent = isOpen ? '←' : '☰';
            // V66: Adicionar classe ao body para deslocar botões fixos quando sidebar abrir
            document.body.classList.toggle('sidebar-open', isOpen);
        });
        document.addEventListener('click', (event) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && event.target !== sidebarHandle) {
                sidebar.classList.remove('open'); sidebarHandle.textContent = '☰';
                document.body.classList.remove('sidebar-open'); // V66
            }
        });
        sidebar.addEventListener('click', (event) => event.stopPropagation() );
    }

    const infoButtonElement = document.getElementById('info');
    if (infoButtonElement && infoModal) infoButtonElement.addEventListener('click', () => { infoModal.style.display = 'flex'; });
    if (closeModalButton && infoModal) closeModalButton.addEventListener('click', () => { infoModal.style.display = 'none'; });
    if (infoHudButton && hudElement) { infoHudButton.addEventListener('click', () => { const isHidden = hudElement.classList.toggle('hidden'); infoHudButton.innerHTML = isHidden ? "ℹ️ Mostrar HUD" : "ℹ️ <span style='color:var(--info-color)'>Ocultar HUD</span>"; infoHudButton.classList.toggle('active', !isHidden); updateHUD(); savePersistentSetting('hudHidden', isHidden); }); }
    if (settingsButton && settingsModal) settingsButton.addEventListener('click', () => { settingsModal.style.display = 'flex'; updateModalSynthControls(); });
    if (closeSettingsModalButton && settingsModal) closeSettingsModalButton.addEventListener('click', () => { settingsModal.style.display = 'none'; });
    if (oscConfigButton && oscConfigModal) { oscConfigButton.addEventListener('click', () => { oscHostInput.value = OSC_HOST; oscPortInput.value = OSC_PORT; oscConfigModal.style.display = 'flex'; }); }
    if (closeOscConfigModalButton && oscConfigModal) closeOscConfigModalButton.addEventListener('click', () => { oscConfigModal.style.display = 'none'; });
    const closeOscConfigModalBtnGeneric = document.getElementById('closeOscConfigModalBtnGeneric');
    if(closeOscConfigModalBtnGeneric && oscConfigModal) closeOscConfigModalBtnGeneric.addEventListener('click', () => oscConfigModal.style.display = 'none');

    if (saveOscConfigButton && oscConfigModal) saveOscConfigButton.addEventListener('click', () => { const newHost = oscHostInput.value.trim(); const newPort = parseInt(oscPortInput.value,10); if(!newHost){alert("IP OSC vazio.");return;} if(isNaN(newPort)||newPort<1||newPort>65535){alert("Porta OSC inválida.");return;} if(saveOscSettings(newHost,newPort)){logOSC("SYSTEM","Config OSC salva",{host:newHost,port:newPort});displayGlobalError(`Config OSC: ${newHost}:${newPort}. Reconectando...`,3000);if(oscConfigModal)oscConfigModal.style.display='none';setupOSC();}});

    if (toggleArpPanelButtonFixed && arpeggiatorControlsPanel) {
        const arpPanelInitiallyHidden = loadPersistentSetting('arpPanelHidden', true);
        if (arpPanelInitiallyHidden) { arpeggiatorControlsPanel.classList.remove('open'); toggleArpPanelButtonFixed.classList.remove('active');
        } else { arpeggiatorControlsPanel.classList.add('open'); toggleArpPanelButtonFixed.classList.add('active'); }
        toggleArpPanelButtonFixed.addEventListener('click', () => {
            const isOpen = arpeggiatorControlsPanel.classList.toggle('open'); toggleArpPanelButtonFixed.classList.toggle('active', isOpen);
            savePersistentSetting('arpPanelHidden', !isOpen); logOSC("SYSTEM", "Painel Arp Alternado", [isOpen ? "Mostrando" : "Ocultando"]);
        });
    }

    // Listener para o botão de toggle do painel do Sintetizador
    if (toggleSynthPanelButtonFixed && synthControlsSidebar) {
        const synthPanelInitiallyHidden = loadPersistentSetting('synthPanelHidden', true);
        if (synthPanelInitiallyHidden) {
            synthControlsSidebar.classList.remove('open');
            toggleSynthPanelButtonFixed.classList.remove('active');
        } else {
            synthControlsSidebar.classList.add('open');
            toggleSynthPanelButtonFixed.classList.add('active');
            updateSidebarSynthControls(); // Atualizar controles se abrir no load
        }
        toggleSynthPanelButtonFixed.addEventListener('click', () => {
            const isOpen = synthControlsSidebar.classList.toggle('open');
            toggleSynthPanelButtonFixed.classList.toggle('active', isOpen);
            if (isOpen) {
                updateSidebarSynthControls(); // Atualiza os valores ao abrir
            }
            savePersistentSetting('synthPanelHidden', !isOpen);
            logOSC("SYSTEM", "Painel Sintetizador Alternado", [isOpen ? "Mostrando" : "Ocultando"]);
        });
    }


    if (arpPanelStyleSelect) arpPanelStyleSelect.addEventListener('change', (e) => { if(spectatorModeActive)return; currentArpeggioStyle = e.target.value; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioStyle', currentArpeggioStyle);});
    if (arpPanelBPMSlider) arpPanelBPMSlider.addEventListener('input', (e) => { if(spectatorModeActive||externalBPM!==null)return; arpeggioBPM = parseInt(e.target.value); updateBPMValues(arpeggioBPM); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM); });
    if (arpPanelNoteIntervalSlider) arpPanelNoteIntervalSlider.addEventListener('input', (e) => { if(spectatorModeActive||externalBPM!==null)return; noteInterval = parseInt(e.target.value); updateNoteIntervalValues(noteInterval); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', Math.round(arpeggioBPM)); });
    if (arpPanelRandomnessSlider) arpPanelRandomnessSlider.addEventListener('input', (e) => { if(spectatorModeActive) return; arpRandomness = parseInt(e.target.value); if(arpPanelRandomnessValueSpan) arpPanelRandomnessValueSpan.textContent = arpRandomness; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpRandomness', arpRandomness); });
    if (arpPanelSwingSlider) arpPanelSwingSlider.addEventListener('input', (e) => { if(spectatorModeActive) return; arpSwing = parseInt(e.target.value); if(arpPanelSwingValueSpan) arpPanelSwingValueSpan.textContent = arpSwing; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpSwing', arpSwing); });
    if (arpPanelGhostNoteChanceSlider) arpPanelGhostNoteChanceSlider.addEventListener('input', (e) => { if(spectatorModeActive) return; arpGhostNoteChance = parseInt(e.target.value); if(arpPanelGhostNoteChanceValueSpan) arpPanelGhostNoteChanceValueSpan.textContent = arpGhostNoteChance; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpGhostNoteChance', arpGhostNoteChance); });

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

    if (playPauseButton) {
        playPauseButton.addEventListener('click', togglePlayPause);
    }

    // V66: Listener para o botão de abrir o modal de mapeamento de gestos (já está no HTML da sidebar)
    const openGestureMappingModalButton = document.getElementById('openGestureMappingModalButton');
    if (openGestureMappingModalButton) {
        openGestureMappingModalButton.addEventListener('click', () => {
            const modal = document.getElementById('gestureMappingModal');
            if (modal) {
                renderGestureMappingUI(); // Garante que a UI do modal está atualizada
                updateActiveGestureMappingsList();
                modal.style.display = 'flex';
            }
        });
    }
    // Listeners para botões DENTRO do modal de mapeamento de gestos
    const closeGestureMappingModalButton = document.getElementById('closeGestureMappingModal');
    if (closeGestureMappingModalButton) { closeGestureMappingModalButton.addEventListener('click', () => { const modal = document.getElementById('gestureMappingModal'); if (modal) modal.style.display = 'none'; }); }
    const addMappingButton = document.getElementById('addGestureMappingButton');
    if (addMappingButton) { addMappingButton.addEventListener('click', addGestureMappingSlot); }
    const resetMappingsButton = document.getElementById('resetGestureMappingsButton');
    if (resetMappingsButton) { resetMappingsButton.addEventListener('click', resetAllGestureMappings); }


    if (internalAudioToggleButton) {
        internalAudioToggleButton.addEventListener("click", async () => {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }
            if (typeof Tone !== 'undefined' && Tone.context.state === 'suspended') {
                await Tone.start();
            }

            _internalAudioEnabledMaster = !_internalAudioEnabledMaster;
            if (_internalAudioEnabledMaster) {
                if (!simpleSynth && audioCtx) {
                    simpleSynth = new SimpleSynth(audioCtx);
                    const settingsToApply = loadAllPersistentSettings().audioSettings;
                    if (simpleSynth && settingsToApply) {
                        Object.keys(settingsToApply).forEach(key => {
                            const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
                            if (typeof simpleSynth[setterName] === 'function') {
                                simpleSynth[setterName](settingsToApply[key]);
                            } else if (key === 'masterVolume' && typeof simpleSynth.setMasterVolume === 'function') {
                                simpleSynth.setMasterVolume(settingsToApply[key]);
                            }
                        });
                        updateModalSynthControls();
                        updateSidebarSynthControls();
                    }
                }
                internalAudioToggleButton.textContent = "🔊 Áudio ON";
                internalAudioToggleButton.classList.add('active');
            } else {
                if (simpleSynth) simpleSynth.allNotesOff();
                internalAudioToggleButton.textContent = "🔊 Áudio OFF";
                internalAudioToggleButton.classList.remove('active');
            }
            updateHUD();
            saveAllPersistentSettings();
            sendOSCMessage('/global/state/internalAudio', _internalAudioEnabledMaster ? 1 : 0);
        });
    }

    // V69: Event listener para o botão de toggle da Beat Matrix
    if (toggleBeatMatrixButton && beatMatrixContainer) {
        toggleBeatMatrixButton.addEventListener('click', toggleBeatMatrixVisibility);
    }
    // V69: Event listeners para controles da Beat Matrix
    if (playStopButtonMatrix) playStopButtonMatrix.addEventListener('click', toggleMatrixPlayback);
    if (horizontalBpmFaderSVGMatrix) horizontalBpmFaderSVGMatrix.addEventListener('mousedown', matrixBPMFaderMouseDownHandler);
    if (rowsFaderSVGMatrix) rowsFaderSVGMatrix.addEventListener('mousedown', matrixRowsFaderMouseDownHandler);
    if (colsFaderSVGMatrix) colsFaderSVGMatrix.addEventListener('mousedown', matrixColsFaderMouseDownHandler);
    if (padSizeFaderSVGMatrix) padSizeFaderSVGMatrix.addEventListener('mousedown', matrixPadSizeFaderMouseDownHandler);
    if (midiOutSelectMatrix) midiOutSelectMatrix.addEventListener('change', () => {
        matrixMidiOut = availableMidiOutputs.get(midiOutSelectMatrix.value) || null;
        // Poderia salvar essa preferência específica da matrix se desejado
    });


} // END OF setupEventListeners FUNCTION.


function handleSynthControlChange(param, value) {
    if (spectatorModeActive || !simpleSynth) return;
    switch (param) {
        case 'waveform':
            simpleSynth.setWaveform(value);
            if (audioWaveformSelect) audioWaveformSelect.value = value;
            if (scWaveformSelect) scWaveformSelect.value = value;
            break;
        case 'masterVolume':
            simpleSynth.setMasterVolume(value);
            updateControlValue(audioMasterVolumeSlider, audioMasterVolumeValueSpan, value, v => v.toFixed(2));
            updateControlValue(scMasterVolumeSlider, scMasterVolumeValue, value, v => v.toFixed(2));
            break;
        case 'attack':
            simpleSynth.setAttack(value);
            updateControlValue(audioAttackSlider, audioAttackValueSpan, value, v => `${v.toFixed(3)}s`);
            updateControlValue(scAttackSlider, scAttackValue, value, v => `${v.toFixed(3)}s`);
            break;
        case 'decay':
            simpleSynth.setDecay(value);
            updateControlValue(audioDecaySlider, audioDecayValueSpan, value, v => `${v.toFixed(3)}s`);
            updateControlValue(scDecaySlider, scDecayValue, value, v => `${v.toFixed(3)}s`);
            break;
        case 'sustain':
            simpleSynth.setSustain(value);
            updateControlValue(audioSustainSlider, audioSustainValueSpan, value, v => v.toFixed(2));
            updateControlValue(scSustainSlider, scSustainValue, value, v => v.toFixed(2));
            break;
        case 'release':
            simpleSynth.setRelease(value);
            updateControlValue(audioReleaseSlider, audioReleaseValueSpan, value, v => `${v.toFixed(3)}s`);
            updateControlValue(scReleaseSlider, scReleaseValue, value, v => `${v.toFixed(3)}s`);
            break;
        case 'distortion':
            simpleSynth.setDistortion(value);
            updateControlValue(audioDistortionSlider, audioDistortionValueSpan, value, v => `${v.toFixed(0)}%`);
            updateControlValue(scDistortionSlider, scDistortionValue, value, v => `${v.toFixed(0)}%`);
            break;
        case 'filterCutoff':
            simpleSynth.setFilterCutoff(value);
            updateControlValue(audioFilterCutoffSlider, audioFilterCutoffValueSpan, value, v => `${v.toFixed(0)} Hz`);
            updateControlValue(scFilterCutoffSlider, scFilterCutoffValue, value, v => `${v.toFixed(0)} Hz`);
            break;
        case 'filterResonance':
            simpleSynth.setFilterResonance(value);
            updateControlValue(audioFilterResonanceSlider, audioFilterResonanceValueSpan, value, v => v.toFixed(1));
            updateControlValue(scFilterResonanceSlider, scFilterResonanceValue, value, v => v.toFixed(1));
            break;
        case 'lfoWaveform': // LFO Waveform é um select, não um slider+span numérico típico
            simpleSynth.setLfoWaveform(value);
            if (audioLfoWaveformSelect) audioLfoWaveformSelect.value = value;
            if (scLfoWaveformSelect) scLfoWaveformSelect.value = value;
            break;
        case 'lfoRate':
            simpleSynth.setLfoRate(value);
            updateControlValue(audioLfoRateSlider, audioLfoRateValueSpan, value, v => `${v.toFixed(1)} Hz`);
            updateControlValue(scLfoRateSlider, scLfoRateValue, value, v => `${v.toFixed(1)} Hz`);
            break;
        case 'lfoPitchDepth':
            simpleSynth.setLfoPitchDepth(value);
            updateControlValue(audioLfoPitchDepthSlider, audioLfoPitchDepthValueSpan, value, v => `${v.toFixed(1)} Hz`);
            updateControlValue(scLfoPitchDepthSlider, scLfoPitchDepthValue, value, v => `${v.toFixed(1)} Hz`);
            break;
        case 'lfoFilterDepth':
            simpleSynth.setLfoFilterDepth(value);
            updateControlValue(audioLfoFilterDepthSlider, audioLfoFilterDepthValueSpan, value, v => `${v.toFixed(0)} Hz`);
            updateControlValue(scLfoFilterDepthSlider, scLfoFilterDepthValue, value, v => `${v.toFixed(0)} Hz`);
            break;
        case 'delayTime':
            simpleSynth.setDelayTime(value);
            updateControlValue(audioDelayTimeSlider, audioDelayTimeValueSpan, value, v => `${v.toFixed(2)} s`);
            updateControlValue(scDelayTimeSlider, scDelayTimeValue, value, v => `${v.toFixed(2)} s`);
            break;
        case 'delayFeedback':
            simpleSynth.setDelayFeedback(value);
            updateControlValue(audioDelayFeedbackSlider, audioDelayFeedbackValueSpan, value, v => v.toFixed(2));
            updateControlValue(scDelayFeedbackSlider, scDelayFeedbackValue, value, v => v.toFixed(2));
            break;
        case 'delayMix':
            simpleSynth.setDelayMix(value);
            updateControlValue(audioDelayMixSlider, audioDelayMixValueSpan, value, v => v.toFixed(2));
            updateControlValue(scDelayMixSlider, scDelayMixValue, value, v => v.toFixed(2));
            break;
        case 'reverbMix':
            simpleSynth.setReverbMix(value);
            updateControlValue(audioReverbMixSlider, audioReverbMixValueSpan, value, v => v.toFixed(2));
            updateControlValue(scReverbMixSlider, scReverbMixValue, value, v => v.toFixed(2));
            break;
    }
    saveAllPersistentSettings(); updateHUD();
}

function updateModalSynthControls() {
    if (!simpleSynth || !settingsModal || settingsModal.style.display !== 'flex') return;
    if (audioWaveformSelect) audioWaveformSelect.value = simpleSynth.waveform; // Select, não slider
    updateControlValue(audioMasterVolumeSlider, audioMasterVolumeValueSpan, simpleSynth.masterGainNode.gain.value, v => v.toFixed(2));
    updateControlValue(audioAttackSlider, audioAttackValueSpan, simpleSynth.attackTime, v => `${v.toFixed(3)}s`);
    updateControlValue(audioDecaySlider, audioDecayValueSpan, simpleSynth.decayTime, v => `${v.toFixed(3)}s`);
    updateControlValue(audioSustainSlider, audioSustainValueSpan, simpleSynth.sustainLevel, v => v.toFixed(2));
    updateControlValue(audioReleaseSlider, audioReleaseValueSpan, simpleSynth.releaseTime, v => `${v.toFixed(3)}s`);
    updateControlValue(audioDistortionSlider, audioDistortionValueSpan, simpleSynth.distortionAmount, v => `${v.toFixed(0)}%`);
    updateControlValue(audioFilterCutoffSlider, audioFilterCutoffValueSpan, simpleSynth.filterNode.frequency.value, v => `${v.toFixed(0)} Hz`);
    updateControlValue(audioFilterResonanceSlider, audioFilterResonanceValueSpan, simpleSynth.filterNode.Q.value, v => v.toFixed(1));
    if (audioLfoWaveformSelect) audioLfoWaveformSelect.value = simpleSynth.lfo.type; // Select
    updateControlValue(audioLfoRateSlider, audioLfoRateValueSpan, simpleSynth.lfo.frequency.value, v => `${v.toFixed(1)} Hz`);
    updateControlValue(audioLfoPitchDepthSlider, audioLfoPitchDepthValueSpan, simpleSynth.lfoGainPitch.gain.value, v => `${v.toFixed(1)} Hz`);
    updateControlValue(audioLfoFilterDepthSlider, audioLfoFilterDepthValueSpan, simpleSynth.lfoGainFilter.gain.value, v => `${v.toFixed(0)} Hz`);
    updateControlValue(audioDelayTimeSlider, audioDelayTimeValueSpan, simpleSynth.delayNode.delayTime.value, v => `${v.toFixed(2)} s`);
    updateControlValue(audioDelayFeedbackSlider, audioDelayFeedbackValueSpan, simpleSynth.delayFeedbackGain.gain.value, v => v.toFixed(2));
    updateControlValue(audioDelayMixSlider, audioDelayMixValueSpan, Math.acos(simpleSynth.delayDryGain.gain.value) / (0.5 * Math.PI), v => v.toFixed(2));
    if (simpleSynth.reverbDryGain) {
        updateControlValue(audioReverbMixSlider, audioReverbMixValueSpan, Math.acos(simpleSynth.reverbDryGain.gain.value) / (0.5 * Math.PI), v => v.toFixed(2));
    }
}

function updateSidebarSynthControls() {
    if (!simpleSynth || !synthControlsSidebar) return;
    if (scWaveformSelect) scWaveformSelect.value = simpleSynth.waveform; // Select
    updateControlValue(scMasterVolumeSlider, scMasterVolumeValue, simpleSynth.masterGainNode.gain.value, v => v.toFixed(2));
    updateControlValue(scAttackSlider, scAttackValue, simpleSynth.attackTime, v => `${v.toFixed(3)}s`);
    updateControlValue(scDecaySlider, scDecayValue, simpleSynth.decayTime, v => `${v.toFixed(3)}s`);
    updateControlValue(scSustainSlider, scSustainValue, simpleSynth.sustainLevel, v => v.toFixed(2));
    updateControlValue(scReleaseSlider, scReleaseValue, simpleSynth.releaseTime, v => `${v.toFixed(3)}s`);
    updateControlValue(scDistortionSlider, scDistortionValue, simpleSynth.distortionAmount, v => `${v.toFixed(0)}%`);
    updateControlValue(scFilterCutoffSlider, scFilterCutoffValue, simpleSynth.filterNode.frequency.value, v => `${v.toFixed(0)} Hz`);
    updateControlValue(scFilterResonanceSlider, scFilterResonanceValue, simpleSynth.filterNode.Q.value, v => v.toFixed(1));
    if (scLfoWaveformSelect) scLfoWaveformSelect.value = simpleSynth.lfo.type; // Select
    updateControlValue(scLfoRateSlider, scLfoRateValue, simpleSynth.lfo.frequency.value, v => `${v.toFixed(1)} Hz`);
    updateControlValue(scLfoPitchDepthSlider, scLfoPitchDepthValue, simpleSynth.lfoGainPitch.gain.value, v => `${v.toFixed(1)} Hz`);
    updateControlValue(scLfoFilterDepthSlider, scLfoFilterDepthValue, simpleSynth.lfoGainFilter.gain.value, v => `${v.toFixed(0)} Hz`);
    updateControlValue(scDelayTimeSlider, scDelayTimeValue, simpleSynth.delayNode.delayTime.value, v => `${v.toFixed(2)} s`);
    updateControlValue(scDelayFeedbackSlider, scDelayFeedbackValue, simpleSynth.delayFeedbackGain.gain.value, v => v.toFixed(2));
    updateControlValue(scDelayMixSlider, scDelayMixValue, Math.acos(simpleSynth.delayDryGain.gain.value) / (0.5 * Math.PI), v => v.toFixed(2));
    if (simpleSynth.reverbDryGain) {
        updateControlValue(scReverbMixSlider, scReverbMixValue, Math.acos(simpleSynth.reverbDryGain.gain.value) / (0.5 * Math.PI), v => v.toFixed(2));
    }
}

function initSynthControlsSidebar() {
    synthControlsSidebar = document.getElementById('synthControlsSidebar'); if (!synthControlsSidebar) { console.error("Synth Control Sidebar element not found!"); return; }
    scWaveformSelect = document.getElementById('scWaveformSelect'); scMasterVolumeSlider = document.getElementById('scMasterVolume'); scMasterVolumeValue = document.getElementById('scMasterVolumeValue'); scAttackSlider = document.getElementById('scAttack'); scAttackValue = document.getElementById('scAttackValue'); scDecaySlider = document.getElementById('scDecay'); scDecayValue = document.getElementById('scDecayValue'); scSustainSlider = document.getElementById('scSustain'); scSustainValue = document.getElementById('scSustainValue'); scReleaseSlider = document.getElementById('scRelease'); scReleaseValue = document.getElementById('scReleaseValue'); scDistortionSlider = document.getElementById('scDistortion'); scDistortionValue = document.getElementById('scDistortionValue');
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
    if (scBPMSlider) { scBPMSlider.addEventListener('input', (e) => { if (spectatorModeActive || externalBPM !== null) return; arpeggioBPM = parseInt(e.target.value); updateBPMValues(arpeggioBPM); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM); }); }
    if (recordAudioButton) { recordAudioButton.addEventListener('click', () => { if (!isAudioRecording) { startAudioRecording(); } else { stopAudioRecording(); } }); }
    if (pauseAudioButton) { pauseAudioButton.addEventListener('click', () => { if (!mediaRecorder) return; if (isAudioRecording && !isAudioPaused) { mediaRecorder.pause(); pauseAudioButton.textContent = "▶️ Retomar Gravação"; isAudioPaused = true; logOSC("SYSTEM", "Gravação de Áudio Pausada", []); } else if (isAudioRecording && isAudioPaused) { mediaRecorder.resume(); pauseAudioButton.textContent = "⏸️ Pausar Gravação"; isAudioPaused = false; logOSC("SYSTEM", "Gravação de Áudio Retomada", []); } }); }
    if (saveAudioButton) { saveAudioButton.addEventListener('click', () => { saveRecordedAudio(); }); }

    // V68: Adicionar listener para o botão de mapeamento de gestos dentro do painel do synth
    const openGestureMappingModalFromSynthPanelButton = document.getElementById('openGestureMappingModalFromSynthPanel');
    if (openGestureMappingModalFromSynthPanelButton) {
        openGestureMappingModalFromSynthPanelButton.addEventListener('click', () => {
            const modal = document.getElementById('gestureMappingModal');
            if (modal) {
                renderGestureMappingUI();
                updateActiveGestureMappingsList();
                modal.style.display = 'flex';
            }
        });
    }

    updateSidebarSynthControls(); console.log("Synth Control Sidebar initialized.");
}

function updateHUD() {
  if (!hudElement) { logDebug("Elemento HUD não encontrado."); return; }
  if (hudElement.classList.contains('hidden')) { let textSpan = hudElement.querySelector('span#hudTextContent'); if (textSpan) { textSpan.innerHTML = ""; } return; }
  let txt = "";
  if (spectatorModeActive) txt += `<b>👓 MODO ESPECTADOR</b><br>`;
  let activeMappingsCount = gestureMappings.filter(m => m.source !== 'NONE' && m.target !== 'NONE').length;
  if (activeMappingsCount > 0) { txt += `Mapeamentos Ativos: <span class="status-ok">${activeMappingsCount}</span> | `; }
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
function toggleDMXSync(){if(spectatorModeActive)return;dmxSyncModeActive=!dmxSyncModeActive;syncDMXNotesButton.querySelector('.status-indicator').textContent = dmxSyncModeActive ? 'ON' : 'OFF'; syncDMXNotesButton.classList.toggle('active',dmxSyncModeActive); syncDMXNotesButton.classList.toggle('info-active',dmxSyncModeActive); sendOSCMessage('/global/state/dmxSyncMode',dmxSyncModeActive?1:0);updateHUD();saveAllPersistentSettings();}
function toggleMidiFeedback(){if(spectatorModeActive)return;midiFeedbackEnabled=!midiFeedbackEnabled;midiFeedbackToggleButton.textContent=`🎤 MIDI In ${midiFeedbackEnabled?'ON':'OFF'}`;midiFeedbackToggleButton.classList.toggle('active',midiFeedbackEnabled); midiFeedbackToggleButton.classList.toggle('info-active',midiFeedbackEnabled); sendOSCMessage('/global/state/midiFeedbackEnabled',midiFeedbackEnabled?1:0);updateHUD();saveAllPersistentSettings();}
function toggleOSCRecording(){if(spectatorModeActive)return;isRecordingOSC=!isRecordingOSC;if(recordOSCButton){recordOSCButton.classList.toggle('active',isRecordingOSC); recordOSCButton.classList.toggle('error-active',isRecordingOSC); recordOSCButton.querySelector('.button-text').textContent = isRecordingOSC ? "Gravando..." : "Gravar OSC";} if(isRecordingOSC){recordedOSCSequence=[];recordingStartTime=performance.now();if(playOSCLoopButton)playOSCLoopButton.disabled=true;}else{if(playOSCLoopButton)playOSCLoopButton.disabled=recordedOSCSequence.length===0;if(recordedOSCSequence.length>0)logOSC("REC INFO",`Gravadas ${recordedOSCSequence.length} msgs. Duração: ${(recordedOSCSequence[recordedOSCSequence.length-1].timestamp/1000).toFixed(2)}s`,[]); } updateHUD();}
function playRecordedOSCLoop(){if(spectatorModeActive||recordedOSCSequence.length===0||isRecordingOSC)return;isPlayingOSCLoop=!isPlayingOSCLoop;if(playOSCLoopButton){playOSCLoopButton.classList.toggle('active',isPlayingOSCLoop); playOSCLoopButton.classList.toggle('warning-active',isPlayingOSCLoop); playOSCLoopButton.querySelector('.button-text').textContent = isPlayingOSCLoop ? "Parar Loop" : "Loop OSC";} if(isPlayingOSCLoop){if(recordOSCButton)recordOSCButton.disabled=true;oscLoopDuration=parseInt(oscLoopDurationInput.value)||5000;playbackStartTime=performance.now();let currentPlaybackIndex=0;function loopStep(){if(!isPlayingOSCLoop)return;const elapsedTimeInLoop=(performance.now()-playbackStartTime)%oscLoopDuration;if(currentPlaybackIndex>0&&elapsedTimeInLoop<recordedOSCSequence[Math.max(0,currentPlaybackIndex-1)].timestamp)currentPlaybackIndex=0;while(currentPlaybackIndex<recordedOSCSequence.length&&recordedOSCSequence[currentPlaybackIndex].timestamp<=elapsedTimeInLoop){const item=recordedOSCSequence[currentPlaybackIndex];const tempIsRec=isRecordingOSC;isRecordingOSC=false;if(osc&&osc.status()===OSC.STATUS.IS_OPEN)osc.send(new OSC.Message(item.message.address,...item.message.args));isRecordingOSC=tempIsRec;logOSC("LOOP",item.message.address,item.message.args);currentPlaybackIndex++;} if(currentPlaybackIndex>=recordedOSCSequence.length&&recordedOSCSequence.length>0&&oscLoopDuration>recordedOSCSequence[recordedOSCSequence.length-1].timestamp)currentPlaybackIndex=0;playbackLoopIntervalId=requestAnimationFrame(loopStep);} playbackLoopIntervalId=requestAnimationFrame(loopStep);}else{if(playbackLoopIntervalId)cancelAnimationFrame(playbackLoopIntervalId);if(recordOSCButton)recordOSCButton.disabled=false;} updateHUD();}
function toggleSpectatorMode(){spectatorModeActive=!spectatorModeActive;spectatorModeButton.innerHTML=`👓 <span class="button-text">Espectador</span> <span class="status-indicator">${spectatorModeActive?'ON':'OFF'}</span>`;spectatorModeButton.classList.toggle('active',spectatorModeActive); spectatorModeButton.classList.toggle('info-active',spectatorModeActive); const controlElements=[midiToggleButton,syncDMXNotesButton,midiFeedbackToggleButton,recordOSCButton,playOSCLoopButton,gestureSimToggleButton,infoHudButton, document.getElementById('openGestureMappingModalButton'),themeToggleButton, oscConfigButton, settingsButton, shapePresetButton];if(spectatorModeActive){turnOffAllActiveNotes();if(isRecordingOSC)toggleOSCRecording();if(isPlayingOSCLoop)playRecordedOSCLoop();controlElements.forEach(btn=>{if(btn)btn.disabled=true;});if(arpeggioBPMSlider)arpeggioBPMSlider.disabled=true;if(noteIntervalSlider)noteIntervalSlider.disabled=true; if(toggleArpPanelButtonFixed) toggleArpPanelButtonFixed.disabled = true; if(toggleSynthPanelButtonFixed) toggleSynthPanelButtonFixed.disabled = true;}else{controlElements.forEach(btn=>{if(btn&&btn!==playOSCLoopButton )btn.disabled=false;});if(playOSCLoopButton)playOSCLoopButton.disabled=recordedOSCSequence.length===0;if(arpeggioBPMSlider&&externalBPM===null)arpeggioBPMSlider.disabled=false;if(noteIntervalSlider&&externalBPM===null)noteIntervalSlider.disabled=false; if(toggleArpPanelButtonFixed) toggleArpPanelButtonFixed.disabled = false; if(toggleSynthPanelButtonFixed) toggleSynthPanelButtonFixed.disabled = false;} updateHUD(); saveAllPersistentSettings(); sendOSCMessage('/global/state/spectatorMode', spectatorModeActive ? 1 : 0);}
function openPopup(){ /* ... */ }

function handleKeyPress(e) {
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
    if (e.key === 'Escape') { if (isInputFocused) activeEl.blur(); else if (anyModalOpen) { [infoModal, settingsModal, oscControlModal, shapePresetModal, oscConfigModal, document.getElementById('gestureMappingModal')].forEach(m => {if(m)m.style.display='none'}); } return; } // V66: Adicionado gestureMappingModal
    if (isInputFocused || (spectatorModeActive && e.key !== 'Escape')) return;

  const actionMap = { 'm': toggleMidiEnabled };
  const correctedShiftActionMap = {
    'I': () => { if (infoModal) infoModal.style.display = infoModal.style.display === 'flex' ? 'none' : 'flex'; },
    'C': () => { if (settingsModal) { settingsModal.style.display = settingsModal.style.display === 'flex' ? 'none' : 'flex'; if(settingsModal.style.display === 'flex') updateModalSynthControls(); } },
    'A': () => { if (toggleArpPanelButtonFixed) toggleArpPanelButtonFixed.click(); },
    'K': () => { if (oscConfigModal) {oscConfigModal.style.display = oscConfigModal.style.display === 'flex' ? 'none' : 'flex'; if(oscConfigModal.style.display === 'flex') {oscHostInput.value = OSC_HOST; oscPortInput.value = OSC_PORT;}}},
    'B': () => { if (shapePresetModal) shapePresetModal.style.display = shapePresetModal.style.display === 'flex' ? 'none' : 'flex'; },
    'V': () => internalAudioToggleButton.click(),
    'D': toggleDMXSync,
    'R': toggleOSCRecording,
    'P': playRecordedOSCLoop,
    'F': toggleMidiFeedback,
    'S': toggleSpectatorMode,
    'T': toggleTheme,
    'Y': () => { if (toggleSynthPanelButtonFixed) toggleSynthPanelButtonFixed.click(); },
    'G': () => {
        const modal = document.getElementById('gestureMappingModal');
        if (modal) {
            if (modal.style.display === 'flex') { modal.style.display = 'none'; }
            else { renderGestureMappingUI(); updateActiveGestureMappingsList(); modal.style.display = 'flex'; }
        }
    },
  };
  const key = e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase();
  const mapToUse = e.shiftKey ? correctedShiftActionMap : actionMap;
  if (mapToUse[key]) { e.preventDefault(); mapToUse[key](); }
  if (key === ' ' && !isInputFocused && !anyModalOpen) { e.preventDefault(); togglePlayPause(); }
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
    if (simpleSynth.filterNode) { savePersistentSetting('audioFilterCutoff', simpleSynth.filterNode.frequency.value); savePersistentSetting('audioFilterResonance', simpleSynth.filterNode.Q.value); }
    if (simpleSynth.lfo) { savePersistentSetting('lfoWaveform', simpleSynth.lfo.type); savePersistentSetting('lfoRate', simpleSynth.lfo.frequency.value); savePersistentSetting('lfoPitchDepth', simpleSynth.lfoGainPitch.gain.value); savePersistentSetting('lfoFilterDepth', simpleSynth.lfoGainFilter.gain.value); }
    if (simpleSynth.delayNode) { savePersistentSetting('delayTime', simpleSynth.delayNode.delayTime.value); savePersistentSetting('delayFeedback', simpleSynth.delayFeedbackGain.gain.value); savePersistentSetting('delayMix', Math.acos(simpleSynth.delayDryGain.gain.value) / (0.5 * Math.PI)); }
    if (simpleSynth.reverbDryGain) { savePersistentSetting('reverbMix', Math.acos(simpleSynth.reverbDryGain.gain.value) / (0.5 * Math.PI)); }
  }
  savePersistentSetting('dmxSyncModeActive',dmxSyncModeActive);
  savePersistentSetting('midiFeedbackEnabled',midiFeedbackEnabled);
  savePersistentSetting('spectatorModeActive',spectatorModeActive);
  savePersistentSetting('currentTheme', currentTheme);
  savePersistentSetting('oscLoopDuration', oscLoopDuration);
  savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
  savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
  savePersistentSetting('synthPanelHidden', synthControlsSidebar ? !synthControlsSidebar.classList.contains('open') : true);
  savePersistentSetting('arpPanelHidden', arpeggiatorControlsPanel ? !arpeggiatorControlsPanel.classList.contains('open') : true);
  savePersistentSetting(GESTURE_MAPPING_STORAGE_KEY, gestureMappings);
  savePersistentSetting('beatMatrixVisible', isBeatMatrixVisible); // V69
  saveBeatMatrixSettings(); // V69: Salva configurações específicas da matrix
  console.log("Configs V69 salvas no localStorage."); // Updated version
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
  spectatorModeActive = false; currentTheme = loadPersistentSetting('currentTheme','theme-dark'); oscLoopDuration = loadPersistentSetting('oscLoopDuration',5000);
  if (internalAudioToggleButton) { internalAudioToggleButton.textContent = _internalAudioEnabledMaster ? "🔊 Áudio ON" : "🔊 Áudio OFF"; internalAudioToggleButton.classList.toggle('active', _internalAudioEnabledMaster); }
  loadOscSettings(); loadArpeggioSettings();
  gestureMappings = loadPersistentSetting(GESTURE_MAPPING_STORAGE_KEY, Array(MAX_GESTURE_MAPPINGS).fill({source: 'NONE', target: 'NONE'}));
  if (!Array.isArray(gestureMappings) || gestureMappings.length !== MAX_GESTURE_MAPPINGS) {
    console.warn("Gesture mappings from localStorage are invalid or missing. Resetting to defaults.");
    gestureMappings = Array(MAX_GESTURE_MAPPINGS).fill(null).map(() => ({ source: 'NONE', target: 'NONE' }));
    savePersistentSetting(GESTURE_MAPPING_STORAGE_KEY, gestureMappings);
  }
  console.log("Configs V68 carregadas do localStorage."); // Updated version
  return {
    savedMidiOutputId: loadPersistentSetting('midiOutputId',null), savedMidiInputId: loadPersistentSetting('midiInputId',null),
    audioSettings: { waveform: savedWaveform, masterVolume: savedMasterVolume, attack: savedAttack, decay: savedDecay, sustain: savedSustain, release: savedRelease, distortion: savedDistortion, filterCutoff: savedFilterCutoff, filterResonance: savedFilterResonance, lfoWaveform: savedLfoWaveform, lfoRate: savedLfoRate, lfoPitchDepth: savedLfoPitchDepth, lfoFilterDepth: savedLfoFilterDepth, delayTime: savedDelayTime, delayFeedback: savedDelayFeedback, delayMix: savedDelayMix, reverbMix: savedReverbMix }
  };
}

function saveArpeggioSettings() { const s = { currentArpeggioStyle, arpeggioBPM, noteInterval, externalBPM, arpRandomness, arpSwing, arpGhostNoteChance }; try { localStorage.setItem(ARPEGGIO_SETTINGS_KEY, JSON.stringify(s)); } catch (e) { console.error("Error saving arpeggio settings:", e); } }
function loadArpeggioSettings(){
    try{ const s=JSON.parse(localStorage.getItem(ARPEGGIO_SETTINGS_KEY));
        if(s){ currentArpeggioStyle = s.currentArpeggioStyle || "UP"; arpeggioBPM = parseInt(s.arpeggioBPM, 10) || 120; noteInterval = parseInt(s.noteInterval, 10) || (60000 / arpeggioBPM); arpRandomness = parseInt(s.arpRandomness, 10) || 0; arpSwing = parseInt(s.arpSwing, 10) || 0; arpGhostNoteChance = parseInt(s.arpGhostNoteChance, 10) || 0; }
    }catch(e){ currentArpeggioStyle = "UP"; arpeggioBPM = 120; noteInterval = 60000 / arpeggioBPM; arpRandomness = 0; arpSwing = 0; arpGhostNoteChance = 0; }
    if(arpPanelStyleSelect) arpPanelStyleSelect.value = currentArpeggioStyle; updateBPMValues(arpeggioBPM);
    if(arpPanelRandomnessSlider) arpPanelRandomnessSlider.value = arpRandomness; if(arpPanelRandomnessValueSpan) arpPanelRandomnessValueSpan.textContent = arpRandomness;
    if(arpPanelSwingSlider) arpPanelSwingSlider.value = arpSwing; if(arpPanelSwingValueSpan) arpPanelSwingValueSpan.textContent = arpSwing;
    if(arpPanelGhostNoteChanceSlider) arpPanelGhostNoteChanceSlider.value = arpGhostNoteChance; if(arpPanelGhostNoteChanceValueSpan) arpPanelGhostNoteChanceValueSpan.textContent = arpGhostNoteChance;
}
function updateBPMValues(newBPM) {
    arpeggioBPM = parseInt(newBPM, 10); noteInterval = Math.round(60000 / arpeggioBPM);
    if (arpPanelBPMSlider) arpPanelBPMSlider.value = arpeggioBPM; if (arpPanelBPMValueSpan) arpPanelBPMValueSpan.textContent = arpeggioBPM;
    if (arpPanelNoteIntervalSlider) arpPanelNoteIntervalSlider.value = noteInterval; if (arpPanelNoteIntervalValueSpan) arpPanelNoteIntervalValueSpan.textContent = noteInterval;
    if (scBPMSlider) scBPMSlider.value = arpeggioBPM; if (scBPMValueSpan) scBPMValueSpan.textContent = arpeggioBPM;
}
function updateNoteIntervalValues(newInterval) {
    noteInterval = parseInt(newInterval, 10); arpeggioBPM = Math.round(60000 / noteInterval);
    if (arpPanelNoteIntervalSlider) arpPanelNoteIntervalSlider.value = noteInterval; if (arpPanelNoteIntervalValueSpan) arpPanelNoteIntervalValueSpan.textContent = noteInterval;
    if (arpPanelBPMSlider) arpPanelBPMSlider.value = arpeggioBPM; if (arpPanelBPMValueSpan) arpPanelBPMValueSpan.textContent = arpeggioBPM;
    if (scBPMSlider) scBPMSlider.value = arpeggioBPM; if (scBPMValueSpan) scBPMValueSpan.textContent = arpeggioBPM;
}
function populateArpeggioStyleSelect(){ const selectToPopulate = arpPanelStyleSelect || document.getElementById('arpeggioStyleSelect'); if(!selectToPopulate)return; selectToPopulate.innerHTML=''; ARPEGGIO_STYLES.forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s.charAt(0).toUpperCase()+s.slice(1).toLowerCase(); selectToPopulate.appendChild(o); }); selectToPopulate.value=currentArpeggioStyle; }

window.addEventListener('DOMContentLoaded', () => {
    logDebug("DOM Carregado. Iniciando main69.js..."); // Updated version
    console.log("DOM Carregado. Iniciando main69.js (v69)..."); // Updated version
    detectPlatform(); hasWebGL2 = checkWebGL2Support(); if (!hasWebGL2) displayGlobalError("Aviso: WebGL2 não disponível. Alguns recursos visuais podem ser limitados.", 15000);
    resizeCanvas(); window.addEventListener('resize', resizeCanvas);
    initFallbackShapes();
    const { savedMidiOutputId, savedMidiInputId, audioSettings } = loadAllPersistentSettings();
    loadTheme(); applyTheme(currentTheme);
    initializeBeatMatrixElements(); // V69: Inicializa elementos da Beat Matrix
    initPresetManager(); setupEventListeners(); initSynthControlsSidebar(); // setupEventListeners agora inclui os da Beat Matrix
    if (audioCtx && audioCtx.state === 'running') {
        console.log("AudioContext já estava rodando na inicialização da página (v68)."); // Updated version
        if (!simpleSynth) { simpleSynth = new SimpleSynth(audioCtx); console.log("SimpleSynth instanciado porque AudioContext já rodava (v68)."); } // Updated version
        if (simpleSynth && audioSettings) {
             Object.keys(audioSettings).forEach(key => {
                const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
                if (typeof simpleSynth[setterName] === 'function') { simpleSynth[setterName](audioSettings[key]);
                } else if (key === 'masterVolume' && typeof simpleSynth.setMasterVolume === 'function') { simpleSynth.setMasterVolume(audioSettings[key]); }
            });
            updateModalSynthControls(); updateSidebarSynthControls(); console.log("Configurações do synth aplicadas (AudioContext já rodava) (v68)."); // Updated version
        }
    } else if (audioCtx && audioCtx.state === 'suspended') { console.log("AudioContext existe mas está suspenso na inicialização. Aguardando clique no botão de áudio. (v68)"); // Updated version
    } else { console.log("AudioContext não existe ou não está rodando na inicialização. Aguardando clique no botão de áudio. (v68)"); } // Updated version
    setupOSC();
    currentCameraDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || null; if (currentCameraDeviceId === "null" || currentCameraDeviceId === "undefined") currentCameraDeviceId = null;
    initMidi().then(async () => {
        if (savedMidiOutputId && availableMidiOutputs.has(savedMidiOutputId)) { if(midiOutputSelect) midiOutputSelect.value = savedMidiOutputId; midiOutput = availableMidiOutputs.get(savedMidiOutputId); }
        else if (availableMidiOutputs.size > 0 && midiOutputSelect) { midiOutputSelect.selectedIndex = 0; midiOutput = availableMidiOutputs.get(midiOutputSelect.value); }
        if (savedMidiInputId && availableMidiInputs.has(savedMidiInputId)) { if(midiInputSelect) midiInputSelect.value = savedMidiInputId; setMidiInput(availableMidiInputs.get(savedMidiInputId)); }
        else if (availableMidiInputs.size > 0 && midiInputSelect) { midiInputSelect.selectedIndex = 0; setMidiInput(availableMidiInputs.get(midiInputSelect.value)); }
        savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null); savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
        await populateCameraSelect(); initializeCamera(currentCameraDeviceId).catch(err => { displayGlobalError(`Erro ao inicializar câmera: ${err.message}. Tente outra ou verifique permissões.`, 15000); });
    }).catch(err => {
        displayGlobalError(`Erro na inicialização MIDI: ${err.message}`, 10000); console.error("Erro MIDI init:", err);
        populateCameraSelect().then(() => initializeCamera(currentCameraDeviceId)).catch(camErr => { displayGlobalError(`Erro ao inicializar câmera (fallback): ${camErr.message}.`, 15000); });
    });
    populateArpeggioStyleSelect(); if(oscLoopDurationInput) oscLoopDurationInput.value = oscLoopDuration;
    if(hudElement && !loadPersistentSetting('hudHidden', false) ) { hudElement.classList.remove('hidden'); if(infoHudButton) { infoHudButton.innerHTML = "ℹ️ <span style='color:var(--info-color)'>Ocultar HUD</span>"; infoHudButton.classList.add('active'); } // V69: Usar innerHTML para cor
    } else if (hudElement) { hudElement.classList.add('hidden'); if(infoHudButton) { infoHudButton.innerHTML = "ℹ️ Mostrar HUD"; infoHudButton.classList.remove('active'); } } // V69: Usar innerHTML

    // V69: Carregar e aplicar estado de visibilidade da Beat Matrix
    isBeatMatrixVisible = loadPersistentSetting('beatMatrixVisible', false);
    if (beatMatrixContainer) beatMatrixContainer.classList.toggle('visible', isBeatMatrixVisible);
    if (toggleBeatMatrixButton) {
        toggleBeatMatrixButton.classList.toggle('active', isBeatMatrixVisible);
        toggleBeatMatrixButton.classList.toggle('info-active', isBeatMatrixVisible);
    }
    if (isBeatMatrixVisible) loadBeatMatrixSettings(); // Carrega configurações se estiver visível


    updateHUD(); sendAllGlobalStatesOSC();
    if (oscLogTextarea) oscLogTextarea.value = `Log OSC - ${new Date().toLocaleTimeString()} - Configs Carregadas (v69).\n`; // Updated version
    loadPlayPauseState();
    console.log("Iniciando loop de animação (v69) e finalizando DOMContentLoaded."); // Updated version
    animationLoop();
});

function animationLoop() {
  requestAnimationFrame(animationLoop);
  if (cameraError && !gestureSimulationActive) { /* HUD is updated by onResults or drawFallbackAnimation */ }
   applyActiveGestureMappings();
   if (isPlaying && _internalAudioEnabledMaster && simpleSynth && Object.keys(simpleSynth.oscillators).length > 0) {
    if (audioActivityIndicator && audioActivityIndicator.style.backgroundColor !== 'var(--success-color)') { /* Dynamic indicator placeholder */ }
   } else if (audioActivityIndicator && audioActivityIndicator.style.backgroundColor !== '#555' && !isPlaying) { /* Dynamic indicator placeholder */ }
}

function handleGestureMappingChange(event) {
    const index = parseInt(event.target.dataset.index, 10); const type = event.target.id.includes('Source') ? 'source' : 'target';
    if (gestureMappings[index]) { gestureMappings[index][type] = event.target.value;
    } else { gestureMappings[index] = { source: type === 'source' ? event.target.value : 'NONE', target: type === 'target' ? event.target.value : 'NONE' }; }
    saveAllPersistentSettings(); updateHUD(); console.log(`Gesture mapping ${index} ${type} changed to: ${event.target.value}`);
}
function getGestureSourceValue(sourceName, shape) {
    if (!shape) return 0; let normalizedValue = 0;
    switch (sourceName) {
        case 'LIQUIFY_DEGREE': const avgDisp = shape.avgDisp !== undefined ? shape.avgDisp : 0; const maxDistortion = 50.0; normalizedValue = Math.min(1.0, avgDisp / maxDistortion); break;
        case 'NUM_SIDES': if (shape.sides === 100) normalizedValue = 0.5; else normalizedValue = (shape.sides - 3) / (20 - 3); break;
        case 'CURRENT_RADIUS': normalizedValue = (shape.radius - 30) / (270); break;
        case 'AVG_VERTEX_DISTANCE': normalizedValue = (shape.radius - 30) / (270); break; // Proxy
        default: normalizedValue = 0;
    }
    return Math.max(0, Math.min(1, normalizedValue));
}
function applySynthParameter(targetName, normalizedValue) {
    if (!simpleSynth) return; if (normalizedValue < 0 || normalizedValue > 1) { normalizedValue = Math.max(0, Math.min(1, normalizedValue)); }
    switch (targetName) {
        case 'FILTER_CUTOFF': const cutoff = 20 + normalizedValue * (18000 - 20); simpleSynth.setFilterCutoff(cutoff); if (scFilterCutoffSlider) scFilterCutoffSlider.value = cutoff; if (scFilterCutoffValue) scFilterCutoffValue.textContent = `${cutoff.toFixed(0)} Hz`; break;
        case 'FILTER_RESONANCE': const resonance = 0.1 + normalizedValue * (29.9); simpleSynth.setFilterResonance(resonance); if (scFilterResonanceSlider) scFilterResonanceSlider.value = resonance; if (scFilterResonanceValue) scFilterResonanceValue.textContent = resonance.toFixed(1); break;
        case 'DISTORTION': const distortion = normalizedValue * 100; simpleSynth.setDistortion(distortion); if (scDistortionSlider) scDistortionSlider.value = distortion; if (scDistortionValue) scDistortionValue.textContent = `${distortion.toFixed(0)}%`; break;
        case 'LFO_RATE': const lfoRate = 0.1 + normalizedValue * (19.9); simpleSynth.setLfoRate(lfoRate); if (scLfoRateSlider) scLfoRateSlider.value = lfoRate; if (scLfoRateValue) scLfoRateValue.textContent = `${lfoRate.toFixed(1)} Hz`; break;
        case 'LFO_PITCH_DEPTH': const lfoPitchDepth = normalizedValue * 50; simpleSynth.setLfoPitchDepth(lfoPitchDepth); if (scLfoPitchDepthSlider) scLfoPitchDepthSlider.value = lfoPitchDepth; if (scLfoPitchDepthValue) scLfoPitchDepthValue.textContent = `${lfoPitchDepth.toFixed(1)}`; break;
        case 'LFO_FILTER_DEPTH': const lfoFilterDepth = normalizedValue * 5000; simpleSynth.setLfoFilterDepth(lfoFilterDepth); if (scLfoFilterDepthSlider) scLfoFilterDepthSlider.value = lfoFilterDepth; if (scLfoFilterDepthValue) scLfoFilterDepthValue.textContent = `${lfoFilterDepth.toFixed(0)}`; break;
        case 'DELAY_TIME': const delayTime = 0.01 + normalizedValue * (1.99); simpleSynth.setDelayTime(delayTime); if (scDelayTimeSlider) scDelayTimeSlider.value = delayTime; if (scDelayTimeValue) scDelayTimeValue.textContent = `${delayTime.toFixed(2)} s`; break;
        case 'DELAY_FEEDBACK': const delayFeedback = normalizedValue * 0.95; simpleSynth.setDelayFeedback(delayFeedback); if (scDelayFeedbackSlider) scDelayFeedbackSlider.value = delayFeedback; if (scDelayFeedbackValue) scDelayFeedbackValue.textContent = delayFeedback.toFixed(2); break;
        case 'DELAY_MIX': simpleSynth.setDelayMix(normalizedValue); if (scDelayMixSlider) scDelayMixSlider.value = normalizedValue; if (scDelayMixValue) scDelayMixValue.textContent = normalizedValue.toFixed(2); break;
        case 'REVERB_MIX': simpleSynth.setReverbMix(normalizedValue); if (scReverbMixSlider) scReverbMixSlider.value = normalizedValue; if (scReverbMixValue) scReverbMixValue.textContent = normalizedValue.toFixed(2); break;
        case 'ATTACK_TIME': const attackTime = 0.001 + normalizedValue * (1.999); simpleSynth.setAttack(attackTime); if (scAttackSlider) scAttackSlider.value = attackTime; if (scAttackValue) scAttackValue.textContent = `${attackTime.toFixed(3)}s`; break;
        case 'DECAY_TIME': const decayTime = 0.001 + normalizedValue * (1.999); simpleSynth.setDecay(decayTime); if (scDecaySlider) scDecaySlider.value = decayTime; if (scDecayValue) scDecayValue.textContent = `${decayTime.toFixed(3)}s`; break;
        case 'SUSTAIN_LEVEL': simpleSynth.setSustain(normalizedValue); if (scSustainSlider) scSustainSlider.value = normalizedValue; if (scSustainValue) scSustainValue.textContent = normalizedValue.toFixed(2); break;
        case 'RELEASE_TIME': const releaseTime = 0.001 + normalizedValue * (2.999); simpleSynth.setRelease(releaseTime); if (scReleaseSlider) scReleaseSlider.value = releaseTime; if (scReleaseValue) scReleaseValue.textContent = `${releaseTime.toFixed(3)}s`; break;
        default: break;
    }
}
function applyActiveGestureMappings() {
    if (spectatorModeActive || !simpleSynth) return;
    shapes.forEach((shape, shapeIndex) => {
      if (shape.activeGesture === 'liquify' && shape.rightHandLandmarks) {
          const fingertips = [4, 8, 12, 16, 20]; const maxInfluence = 150; const maxForce = 25; const cx = shape.centerX; const cy = shape.centerY; let r = shape.radius;
          let totalDispMag = 0; let activeLiquifyPts = 0;
          for (let i = 0; i < shape.sides; i++) {
            const angle = (i / shape.sides) * Math.PI * 2; let vx = r * Math.cos(angle); let vy = r * Math.sin(angle); let dx = 0; let dy = 0;
            const vCanvasX = cx + vx; const vCanvasY = cy + vy;
            for (const tipIdx of fingertips) {
                if (!shape.rightHandLandmarks[tipIdx]) continue; const tip = shape.rightHandLandmarks[tipIdx];
                const tipX = canvasElement.width - (tip.x * canvasElement.width); const tipY = tip.y * canvasElement.height;
                const dist = distance(vCanvasX, vCanvasY, tipX, tipY);
                if (dist < maxInfluence && dist > 0) { const force = maxForce * (1 - dist / maxInfluence); dx += (vCanvasX - tipX) / dist * force; dy += (vCanvasY - tipY) / dist * force; activeLiquifyPts++; }
            }
            totalDispMag += Math.sqrt(dx**2 + dy**2);
          }
          shape.avgDisp = (activeLiquifyPts > 0) ? totalDispMag / activeLiquifyPts : 0;
      } else { if (shape.activeGesture !== 'liquify') shape.avgDisp = 0; }
        gestureMappings.forEach(mapping => {
            if (mapping.source !== 'NONE' && mapping.target !== 'NONE') { const sourceValue = getGestureSourceValue(mapping.source, shape); applySynthParameter(mapping.target, sourceValue); }
        });
    });
}
function updateActiveGestureMappingsList() {
    const listElement = document.getElementById('activeGestureMappingsList'); if (!listElement) return; listElement.innerHTML = '';
    const activeMappings = gestureMappings.filter(m => m.source !== 'NONE' && m.target !== 'NONE');
    if (activeMappings.length === 0) { const listItem = document.createElement('li'); listItem.textContent = 'Nenhum mapeamento ativo.'; listElement.appendChild(listItem); return; }
    activeMappings.forEach((mapping, index) => {
        const listItem = document.createElement('li'); const sourceText = GESTURE_SOURCES[mapping.source] || mapping.source; const targetText = SYNTH_TARGETS[mapping.target] || mapping.target;
        listItem.textContent = `Mapeamento ${index + 1}: "${sourceText}" → "${targetText}"`; listElement.appendChild(listItem);
    });
}
function createGestureMappingSlot(index, mappingData = { source: 'NONE', target: 'NONE' }) {
    const slotDiv = document.createElement('div'); slotDiv.className = 'gesture-mapping-slot control-group'; slotDiv.dataset.index = index;
    const title = document.createElement('h5'); title.textContent = `Mapeamento ${index + 1}`; slotDiv.appendChild(title);
    const sourceLabel = document.createElement('label'); sourceLabel.htmlFor = `gestureSourceSelect_${index}`; sourceLabel.textContent = 'Origem do Gesto:';
    const sourceSelect = document.createElement('select'); sourceSelect.id = `gestureSourceSelect_${index}`; sourceSelect.dataset.index = index; sourceSelect.className = 'gesture-source-select';
    for (const key in GESTURE_SOURCES) { const option = document.createElement('option'); option.value = key; option.textContent = GESTURE_SOURCES[key]; sourceSelect.appendChild(option); }
    sourceSelect.value = mappingData.source; sourceSelect.addEventListener('change', handleGestureMappingChange);
    const targetLabel = document.createElement('label'); targetLabel.htmlFor = `synthTargetSelect_${index}`; targetLabel.textContent = 'Alvo do Sintetizador:';
    const targetSelect = document.createElement('select'); targetSelect.id = `synthTargetSelect_${index}`; targetSelect.dataset.index = index; targetSelect.className = 'synth-target-select';
    for (const key in SYNTH_TARGETS) { const option = document.createElement('option'); option.value = key; option.textContent = SYNTH_TARGETS[key]; targetSelect.appendChild(option); }
    targetSelect.value = mappingData.target; targetSelect.addEventListener('change', handleGestureMappingChange);
    const removeButton = document.createElement('button'); removeButton.textContent = 'Remover Mapeamento'; removeButton.className = 'control-button remove-mapping-button'; removeButton.dataset.index = index; removeButton.addEventListener('click', removeGestureMappingSlot);
    slotDiv.appendChild(sourceLabel); slotDiv.appendChild(sourceSelect); slotDiv.appendChild(targetLabel); slotDiv.appendChild(targetSelect); slotDiv.appendChild(removeButton);
    return slotDiv;
}
function addGestureMappingSlot() {
    if (gestureMappings.filter(m => m.source !== 'NONE' || m.target !== 'NONE').length >= MAX_GESTURE_MAPPINGS) { displayGlobalError(`Máximo de ${MAX_GESTURE_MAPPINGS} mapeamentos atingido.`, 3000); return; }
    let newIndex = gestureMappings.findIndex(m => m.source === 'NONE' && m.target === 'NONE');
    if (newIndex === -1 && gestureMappings.length < MAX_GESTURE_MAPPINGS) { newIndex = gestureMappings.length; }
    else if (newIndex === -1) { displayGlobalError(`Não é possível adicionar mais mapeamentos. Limite de ${MAX_GESTURE_MAPPINGS} preenchido.`, 3000); return; }
    if (!gestureMappings[newIndex]) { gestureMappings[newIndex] = { source: 'NONE', target: 'NONE' }; }
    renderGestureMappingUI(); updateActiveGestureMappingsList(); saveAllPersistentSettings();
}
function removeGestureMappingSlot(event) {
    const indexToRemove = parseInt(event.target.dataset.index, 10);
    if (gestureMappings[indexToRemove]) { gestureMappings[indexToRemove] = { source: 'NONE', target: 'NONE' }; }
    renderGestureMappingUI(); updateActiveGestureMappingsList(); saveAllPersistentSettings();
}
function resetAllGestureMappings() {
    gestureMappings = Array(MAX_GESTURE_MAPPINGS).fill(null).map(() => ({ source: 'NONE', target: 'NONE' }));
    renderGestureMappingUI(); updateActiveGestureMappingsList(); saveAllPersistentSettings(); displayGlobalError("Todos os mapeamentos de gestos foram resetados.", 3000);
}
function renderGestureMappingUI() {
    const modalContent = document.getElementById('gestureMappingModalContent'); if (!modalContent) return; modalContent.innerHTML = '';
    while(gestureMappings.length < MAX_GESTURE_MAPPINGS) { gestureMappings.push({ source: 'NONE', target: 'NONE' }); }
    if(gestureMappings.length > MAX_GESTURE_MAPPINGS) { gestureMappings = gestureMappings.slice(0, MAX_GESTURE_MAPPINGS); }
    let activeSlots = 0;
    gestureMappings.forEach((mapping, index) => {
        if (mapping.source !== 'NONE' || mapping.target !== 'NONE' || activeSlots < 1) {
            const slotElement = createGestureMappingSlot(index, mapping); modalContent.appendChild(slotElement);
            if (mapping.source !== 'NONE' || mapping.target !== 'NONE') { activeSlots++; }
        }
    });
     if (activeSlots === 0 && modalContent.children.length === 0) { const slotElement = createGestureMappingSlot(0, { source: 'NONE', target: 'NONE' }); modalContent.appendChild(slotElement); }
    const addButton = document.getElementById('addGestureMappingButton');
    if(addButton) { const currentActiveMappings = gestureMappings.filter(m => m.source !== 'NONE' || m.target !== 'NONE').length; addButton.disabled = currentActiveMappings >= MAX_GESTURE_MAPPINGS; }
}

let isStoppingDueToError = false; let isSavingAudio = false;
function startAudioRecording() {
    if (!simpleSynth || !simpleSynth.masterGainNode || !audioCtx) { displayGlobalError("Sintetizador ou contexto de áudio não inicializado.", 5000); return; }
    if (audioCtx.state === 'suspended') { displayGlobalError("Contexto de áudio suspenso. Interaja com a página primeiro.", 5000); return; }
    try {
        const destinationNode = audioCtx.createMediaStreamDestination(); simpleSynth.masterGainNode.connect(destinationNode);
        const options = { mimeType: 'audio/webm; codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn(`${options.mimeType} não é suportado. Tentando audio/ogg...`); options.mimeType = 'audio/ogg; codecs=opus';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                console.warn(`${options.mimeType} não é suportado. Tentando audio/webm (default)...`); options.mimeType = 'audio/webm';
                 if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    console.error("Nenhum tipo MIME suportado para MediaRecorder (webm, ogg)."); displayGlobalError("Gravação de áudio não suportada neste navegador.", 7000);
                    simpleSynth.masterGainNode.disconnect(destinationNode); return;
                 }
            }
        }
        console.log(`Usando mimeType: ${options.mimeType}`); mediaRecorder = new MediaRecorder(destinationNode.stream, options);
        mediaRecorder.ondataavailable = event => { if (event.data.size > 0) { audioChunks.push(event.data); } };
        mediaRecorder.onstart = () => {
            audioChunks = []; isAudioRecording = true; isAudioPaused = false;
            if (recordAudioButton) { recordAudioButton.innerHTML = '<span class="recording-dot">🔴</span> Parar Gravação'; recordAudioButton.classList.add('active', 'recording'); }
            if (pauseAudioButton) { pauseAudioButton.disabled = false; pauseAudioButton.textContent = "⏸️ Pausar Gravação"; }
            if (saveAudioButton) saveAudioButton.disabled = true; updateAudioRecordingHUD(true, false, 0); logOSC("SYSTEM", "Gravação de Áudio Iniciada", []); displayGlobalError("Gravação de áudio iniciada.", 3000);
        };
        mediaRecorder.onstop = () => {
            isAudioPaused = false;
            if (recordAudioButton) { recordAudioButton.innerHTML = "⏺️ Gravar Áudio"; recordAudioButton.classList.remove('active', 'recording', 'paused'); }
            if (pauseAudioButton) { pauseAudioButton.disabled = true; pauseAudioButton.textContent = "⏸️ Pausar Gravação"; }
            if (saveAudioButton) saveAudioButton.disabled = audioChunks.length === 0;
            updateAudioRecordingHUD(false, false, 0);
            if (audioChunks.length === 0 && !isSavingAudio) { logOSC("SYSTEM", "Gravação de Áudio Parada (sem dados)", []); displayGlobalError("Gravação de áudio parada (sem dados).", 3000);
            } else if (!isSavingAudio) { logOSC("SYSTEM", "Gravação de Áudio Parada (dados disponíveis)", []); displayGlobalError("Gravação de áudio parada. Pronto para salvar.", 3000); }
            try { if(simpleSynth && simpleSynth.masterGainNode && destinationNode && destinationNode.numberOfOutputs > 0) { simpleSynth.masterGainNode.disconnect(destinationNode); console.log("masterGainNode desconectado do destinationNode da gravação."); }
            } catch (e) { console.warn("Erro ao desconectar destinationNode (pode já estar desconectado):", e); }
        };
        mediaRecorder.onpause = () => { if (pauseAudioButton) pauseAudioButton.innerHTML = "▶️ Retomar"; if (recordAudioButton) recordAudioButton.classList.add('paused'); isAudioPaused = true; updateAudioRecordingHUD(true, true, mediaRecorder.stream.currentTime); logOSC("SYSTEM", "Gravação de Áudio Pausada (onpause)", []); };
        mediaRecorder.onresume = () => { if (pauseAudioButton) pauseAudioButton.innerHTML = "⏸️ Pausar"; if (recordAudioButton) recordAudioButton.classList.remove('paused'); isAudioPaused = false; updateAudioRecordingHUD(true, false, mediaRecorder.stream.currentTime); logOSC("SYSTEM", "Gravação de Áudio Retomada (onresume)", []); };
        mediaRecorder.onerror = (event) => { console.error("Erro no MediaRecorder:", event.error); displayGlobalError(`Erro na gravação: ${event.error.name || 'Erro desconhecido'}.`, 7000); stopAudioRecording(true); };
        mediaRecorder.start(1000);
    } catch (e) { console.error("Falha ao iniciar MediaRecorder:", e); displayGlobalError(`Falha ao iniciar gravação: ${e.message || 'Erro desconhecido'}. Verifique as permissões e o console.`, 7000); isAudioRecording = false; updateAudioRecordingHUD(false, false, 0); }
}
function stopAudioRecording(dueToError = false) {
    isStoppingDueToError = dueToError; if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) { try { mediaRecorder.stop(); } catch (e) { console.error("Erro ao chamar mediaRecorder.stop():", e); displayGlobalError("Erro ao parar gravação.", 5000); } }
    isAudioRecording = false; isAudioPaused = false;
    if (recordAudioButton) { recordAudioButton.innerHTML = "⏺️ Gravar Áudio"; recordAudioButton.classList.remove('active', 'recording', 'paused'); }
    if (pauseAudioButton) { pauseAudioButton.disabled = true; pauseAudioButton.innerHTML = "⏸️ Pausar"; }
    if (saveAudioButton) { saveAudioButton.disabled = (audioChunks.length === 0); }
    updateAudioRecordingHUD(false, false, 0); if (dueToError) { logOSC("SYSTEM", "Gravação de Áudio Interrompida por Erro", []); }
}
function saveRecordedAudio() {
    if (audioChunks.length === 0) { displayGlobalError("Nenhum áudio gravado para salvar.", 3000); if (saveAudioButton) saveAudioButton.disabled = true; return; }
    let mimeType = 'audio/webm; codecs=opus';
    if (mediaRecorder && mediaRecorder.mimeType) { mimeType = mediaRecorder.mimeType; }
    else if (audioChunks.length > 0 && audioChunks[0].type && MediaRecorder.isTypeSupported(audioChunks[0].type)) { mimeType = audioChunks[0].type; }
    console.log("Salvando blob com mimeType:", mimeType); isSavingAudio = true;
    const blob = new Blob(audioChunks, { type: mimeType }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); document.body.appendChild(a); a.style.display = 'none'; a.href = url;
    const fileExtension = mimeType.includes('ogg') ? 'ogg' : (mimeType.includes('mp4') ? 'mp4' : 'webm');
    a.download = `gravacao_msm_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.${fileExtension}`; a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
    logOSC("SYSTEM", `Áudio Salvo: ${a.download}`, []); displayGlobalError(`Áudio salvo como ${a.download}!`, 5000); updateAudioRecordingHUD(false, false, 0, true);
    audioChunks = []; if (saveAudioButton) saveAudioButton.disabled = true; if (recordAudioButton) recordAudioButton.classList.remove('active', 'recording', 'paused');
    isSavingAudio = false;
}
let audioRecordingHUDTimer = null;
function updateAudioRecordingHUD(isRecording, isPaused, durationSeconds = 0, isSaved = false) {
    let hudRecordDiv = document.getElementById('audioRecordingHUD');
    if (!hudRecordDiv) {
        hudRecordDiv = document.createElement('div'); hudRecordDiv.id = 'audioRecordingHUD';
        Object.assign(hudRecordDiv.style, { position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)', padding: '8px 15px', backgroundColor: 'rgba(200, 0, 0, 0.7)', color: 'white', zIndex: '1005', borderRadius: '5px', boxShadow: '0 1px 5px rgba(0,0,0,0.2)', textAlign: 'center', fontSize: '13px', display: 'none', transition: 'background-color 0.3s, opacity 0.3s' });
        document.body.appendChild(hudRecordDiv);
    }
    if (audioRecordingHUDTimer) { clearInterval(audioRecordingHUDTimer); audioRecordingHUDTimer = null; }
    if (isRecording) {
        hudRecordDiv.style.display = 'block'; hudRecordDiv.style.opacity = '1'; let startTime = performance.now() - (durationSeconds * 1000);
        audioRecordingHUDTimer = setInterval(() => {
            const elapsedMs = performance.now() - startTime; const currentDurationSec = Math.floor(elapsedMs / 1000);
            const minutes = Math.floor(currentDurationSec / 60); const seconds = currentDurationSec % 60; const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            if (isPaused) { hudRecordDiv.textContent = `⏸️ GRAVAÇÃO PAUSADA (${timeStr})`; hudRecordDiv.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
            } else { hudRecordDiv.textContent = `🔴 GRAVANDO (${timeStr})`; hudRecordDiv.style.backgroundColor = 'rgba(200, 0, 0, 0.7)'; }
        }, 1000);
        const initialDurationSec = Math.floor((performance.now() - startTime) / 1000); const initialMinutes = Math.floor(initialDurationSec / 60); const initialSeconds = initialDurationSec % 60; const initialTimeStr = `${initialMinutes.toString().padStart(2, '0')}:${initialSeconds.toString().padStart(2, '0')}`;
        if (isPaused) { hudRecordDiv.textContent = `⏸️ GRAVAÇÃO PAUSADA (${initialTimeStr})`; hudRecordDiv.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
        } else { hudRecordDiv.textContent = `🔴 GRAVANDO (${initialTimeStr})`; hudRecordDiv.style.backgroundColor = 'rgba(200, 0, 0, 0.7)'; }
    } else if (isSaved) {
        hudRecordDiv.style.display = 'block'; hudRecordDiv.style.opacity = '1'; hudRecordDiv.textContent = '💾 ÁUDIO SALVO!'; hudRecordDiv.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';
        setTimeout(() => { hudRecordDiv.style.opacity = '0'; setTimeout(() => { hudRecordDiv.style.display = 'none'; }, 300); }, 2700);
    } else { if (hudRecordDiv.style.display === 'block') { hudRecordDiv.style.opacity = '0'; setTimeout(() => { hudRecordDiv.style.display = 'none'; }, 300); } }
}
async function togglePlayPause() {
    if (spectatorModeActive) return;
    if (!audioCtx) {
        console.log("AudioContext não existe. Tentando criar um novo."); audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (!simpleSynth && audioCtx) {
            simpleSynth = new SimpleSynth(audioCtx); const loadedSettings = loadAllPersistentSettings();
            if (simpleSynth && loadedSettings.audioSettings) {
                Object.keys(loadedSettings.audioSettings).forEach(key => {
                    const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
                    if (typeof simpleSynth[setterName] === 'function') { simpleSynth[setterName](loadedSettings.audioSettings[key]);
                    } else if (key === 'masterVolume' && typeof simpleSynth.setMasterVolume === 'function') { simpleSynth.setMasterVolume(loadedSettings.audioSettings[key]); }
                });
                updateModalSynthControls(); updateSidebarSynthControls();
            }
        }
    }
    if (audioCtx && audioCtx.state === "suspended") { try { await audioCtx.resume(); console.log("AudioContext resumed by Play/Pause button."); } catch (e) { console.error("Error resuming AudioContext:", e); displayGlobalError("Falha ao iniciar o áudio. Interaja com a página."); return; } }
    if (typeof Tone !== 'undefined' && typeof Tone.start === 'function') { try { await Tone.start(); console.log("Tone.start() chamado com sucesso."); } catch (e) { console.error("Erro ao chamar Tone.start():", e); if (audioCtx && audioCtx.state === "suspended") { await audioCtx.resume(); } } }
    isPlaying = !isPlaying;
    if (isPlaying) {
        if (typeof Tone !== 'undefined' && Tone.Transport) { Tone.Transport.start(); console.log("Tone.Transport started."); }
        const now = performance.now(); shapes.forEach(shape => { shape.lastNotePlayedTime = now - (noteInterval + 100); shape.lastArpeggioNotePlayedTime = now - (60000 / arpeggioBPM + 100); });
        if (playPauseButton) playPauseButton.innerHTML = "⏸️ Pause"; if (audioActivityIndicator) audioActivityIndicator.style.backgroundColor = 'var(--success-color)';
        logOSC("SYSTEM", "Sequencer/Arpeggiator Started", []);
    } else {
        if (typeof Tone !== 'undefined' && Tone.Transport) { Tone.Transport.pause(); console.log("Tone.Transport paused."); }
        turnOffAllActiveNotes();
        if (playPauseButton) playPauseButton.innerHTML = "▶️ Play"; if (audioActivityIndicator) audioActivityIndicator.style.backgroundColor = '#555';
        logOSC("SYSTEM", "Sequencer/Arpeggiator Paused", []);
    }
    updateHUD(); savePersistentSetting('isPlaying', isPlaying);
}
function loadPlayPauseState() {
    const savedIsPlaying = loadPersistentSetting('isPlaying', false);
    if (savedIsPlaying && audioCtx && audioCtx.state === 'running') { /* Potentially auto-play if desired, currently no-op */ }
    else { isPlaying = false; if (playPauseButton) playPauseButton.innerHTML = "▶️ Play"; if (audioActivityIndicator) audioActivityIndicator.style.backgroundColor = '#555'; }
}


// ==========================================================================
// V69: FUNÇÕES DA BEAT MATRIX (adaptadas de beatmatrixexe.js)
// ==========================================================================

function initializeBeatMatrixElements() {
    beatMatrixContainer = document.getElementById('beatMatrixContainer');
    toggleBeatMatrixButton = document.getElementById('toggleBeatMatrixButton');

    midiOutSelectMatrix = document.getElementById('midiOutSelectMatrix');
    playStopButtonMatrix = document.getElementById('playStopButtonMatrix');
    bpmDisplayMatrix = document.getElementById('bpm-display-matrix');
    horizontalBpmFaderSVGMatrix = document.getElementById('horizontalBpmFaderSVGMatrix');
    if (horizontalBpmFaderSVGMatrix) {
        faderThumbMatrix = horizontalBpmFaderSVGMatrix.querySelector('#faderThumbMatrix'); // Corrigido para buscar dentro do SVG correto
        bpmTextDisplayMatrix = horizontalBpmFaderSVGMatrix.querySelector('#bpmTextDisplayMatrix'); // Corrigido
    }

    matrixConfigControls = document.getElementById('matrixConfigControls');
    rowsFaderSVGMatrix = document.getElementById('rowsFaderSVGMatrix');
    if (rowsFaderSVGMatrix) rowsFaderThumbMatrix = rowsFaderSVGMatrix.querySelector('#rowsFaderThumbMatrix'); // Corrigido
    rowsValueDisplayMatrix = document.getElementById('rowsValueDisplayMatrix');

    colsFaderSVGMatrix = document.getElementById('colsFaderSVGMatrix');
    if (colsFaderSVGMatrix) colsFaderThumbMatrix = colsFaderSVGMatrix.querySelector('#colsFaderThumbMatrix'); // Corrigido
    colsValueDisplayMatrix = document.getElementById('colsValueDisplayMatrix');

    padSizeFaderSVGMatrix = document.getElementById('padSizeFaderSVGMatrix');
    if (padSizeFaderSVGMatrix) padSizeFaderThumbMatrix = padSizeFaderSVGMatrix.querySelector('#padSizeFaderThumbMatrix'); // Corrigido
    padSizeValueDisplayMatrix = document.getElementById('padSizeValueDisplayMatrix');

    // Populate MIDI output select for Beat Matrix
    if (midiOutSelectMatrix && midiAccess) {
        midiOutSelectMatrix.innerHTML = '';
        availableMidiOutputs.forEach((port, id) => {
            const option = document.createElement('option');
            option.value = id;
            option.text = port.name;
            midiOutSelectMatrix.appendChild(option);
        });
        if (midiOutSelectMatrix.options.length > 0) {
             // Tenta carregar a saída MIDI salva para a matrix, ou usa a global, ou a primeira da lista
            const savedMatrixMidiId = loadPersistentSetting('matrixMidiOutputId', midiOutput ? midiOutput.id : null);
            if (savedMatrixMidiId && availableMidiOutputs.has(savedMatrixMidiId)) {
                midiOutSelectMatrix.value = savedMatrixMidiId;
            } else if (midiOutput && availableMidiOutputs.has(midiOutput.id)) {
                 midiOutSelectMatrix.value = midiOutput.id;
            } else {
                midiOutSelectMatrix.selectedIndex = 0;
            }
            matrixMidiOut = availableMidiOutputs.get(midiOutSelectMatrix.value);
        }
    }
}

function toggleBeatMatrixVisibility() {
    isBeatMatrixVisible = !isBeatMatrixVisible;
    if (beatMatrixContainer) {
        beatMatrixContainer.classList.toggle('visible', isBeatMatrixVisible);
    }
    if (toggleBeatMatrixButton) {
        toggleBeatMatrixButton.classList.toggle('active', isBeatMatrixVisible);
        toggleBeatMatrixButton.classList.toggle('info-active', isBeatMatrixVisible);
    }
    // Opcional: Pausar/parar a outra visualização (formas) quando a matrix é mostrada, e vice-versa.
    if (isBeatMatrixVisible) {
        if (isPlaying) { // Pausa o sequenciador de formas se estiver tocando
            togglePlayPause();
        }
        // Garante que a matrix comece com os valores corretos dos faders
        loadBeatMatrixSettings(); // Carrega e aplica configurações
        updateMatrixVisuals(currentMatrixNumRows, currentMatrixNumCols, currentMatrixPadSize);
        updateMatrixBPMVisuals(matrixBPM);
    } else {
        if (isMatrixPlaying) { // Pausa a matrix se estiver tocando
            toggleMatrixPlayback();
        }
    }
    savePersistentSetting('beatMatrixVisible', isBeatMatrixVisible);
    updateHUD(); // Atualiza o HUD para refletir o estado
}


function updateMatrixVisuals(numRows, numCols, padSize) {
    const grid = document.getElementById('grid'); // Este é o grid da Beat Matrix
    if (!grid) {
        console.error("Elemento grid da Beat Matrix não encontrado!");
        return;
    }
    grid.innerHTML = '';
    matrixPads.length = 0;

    currentMatrixNumRows = Math.max(MATRIX_MIN_ROWS, Math.min(MATRIX_MAX_ROWS, numRows));
    currentMatrixNumCols = Math.max(MATRIX_MIN_COLS, Math.min(MATRIX_MAX_COLS, numCols));
    currentMatrixPadSize = Math.max(MATRIX_MIN_PAD_SIZE, Math.min(MATRIX_MAX_PAD_SIZE, padSize));

    grid.style.gridTemplateColumns = `repeat(${currentMatrixNumCols}, 1fr)`;
    const baseNote = 36; // C2 - Nota MIDI inicial para os pads

    for (let i = 0; i < currentMatrixNumRows * currentMatrixNumCols; i++) {
        const pad = document.createElement('div');
        pad.classList.add('pad');
        pad.style.width = `${currentMatrixPadSize}px`;
        pad.style.height = `${currentMatrixPadSize}px`;
        // let colIndex = i % currentMatrixNumCols;
        // let rowIndex = Math.floor(i / currentMatrixNumCols);
        // pad.textContent = `${rowIndex + 1}-${colIndex + 1}`; // Ex: 1-1, 1-2
        pad.textContent = i + 1;


        pad.dataset.note = baseNote + i; // Atribui nota MIDI sequencialmente
        pad.onclick = () => triggerMatrixPad(pad);

        grid.appendChild(pad);
        matrixPads.push(pad);
    }

    if (isMatrixPlaying) {
        currentMatrixColumn = 0; // Reseta a coluna atual se a matrix estiver tocando
        // Poderia reiniciar o timer se necessário, mas updateMatrixBPMVisuals já faz isso
    }
}

function triggerMatrixPad(pad) {
    const note = parseInt(pad.dataset.note);
    const isActive = pad.classList.toggle('active');
    const velocity = isActive ? 100 : 0; // Liga com 100, desliga com 0 (note off)

    // Usar o SimpleSynth interno se o áudio interno estiver habilitado E não houver saída MIDI específica para a matrix
    // OU se a saída MIDI da matrix for a mesma global e o áudio interno estiver ligado.
    const useInternalSynthForMatrix = _internalAudioEnabledMaster && simpleSynth && (!matrixMidiOut || (matrixMidiOut === midiOutput));

    if (isActive) {
        if (matrixMidiOut) {
            matrixMidiOut.send([0x90, note, velocity]); // Note On para MIDI externo
        }
        if (useInternalSynthForMatrix) {
            simpleSynth.noteOn(note, velocity);
        }
        // Para OSC, se desejado:
        // sendOSCMessage(`/beatmatrix/pad/${pad.dataset.note}/on`, velocity);
    } else {
        if (matrixMidiOut) {
            matrixMidiOut.send([0x80, note, 0]); // Note Off para MIDI externo
        }
        if (useInternalSynthForMatrix) {
            simpleSynth.noteOff(note);
        }
        // Para OSC, se desejado:
        // sendOSCMessage(`/beatmatrix/pad/${pad.dataset.note}/off`);
    }
}

function toggleMatrixPlayback() {
    if (spectatorModeActive) return;
    isMatrixPlaying = !isMatrixPlaying;
    if (playStopButtonMatrix) playStopButtonMatrix.textContent = isMatrixPlaying ? 'Stop' : 'Play';

    if (isMatrixPlaying) {
        if (currentMatrixNumCols <= 0) { // Impede loop infinito se não houver colunas
             isMatrixPlaying = false;
             if (playStopButtonMatrix) playStopButtonMatrix.textContent = 'Play';
             console.warn("Beat Matrix: Não é possível iniciar, número de colunas é zero.");
             return;
        }
        currentMatrixColumn = 0;
        stepMatrixSequencer(); // Primeira batida imediata
        const columnInterval = 60000 / matrixBPM;
        if (matrixTimerId) clearInterval(matrixTimerId);
        matrixTimerId = setInterval(stepMatrixSequencer, columnInterval);
    } else {
        clearInterval(matrixTimerId);
        matrixTimerId = null;
        matrixPads.forEach(pad => pad.classList.remove('sequencer-column-indicator'));
    }
    updateHUD();
}

function stepMatrixSequencer() {
    if (!isMatrixPlaying || currentMatrixNumCols <= 0) {
        if (isMatrixPlaying) toggleMatrixPlayback(); // Para o sequenciador se não houver colunas
        return;
    }

    // Limpa o indicador da coluna anterior
    matrixPads.forEach(p => p.classList.remove('sequencer-column-indicator'));

    // Destaca a coluna atual
    for (let r = 0; r < currentMatrixNumRows; r++) {
        const padIndex = r * currentMatrixNumCols + currentMatrixColumn;
        if (matrixPads[padIndex]) {
            matrixPads[padIndex].classList.add('sequencer-column-indicator');
        }
    }

    // Toca os pads ativos na coluna atual
    for (let r = 0; r < currentMatrixNumRows; r++) {
        const padIndex = r * currentMatrixNumCols + currentMatrixColumn;
        const pad = matrixPads[padIndex];
        if (pad && pad.classList.contains('active')) {
            const note = parseInt(pad.dataset.note);
            const velocity = 100; // Velocity fixa para o sequenciador por enquanto

            const useInternalSynthForMatrix = _internalAudioEnabledMaster && simpleSynth && (!matrixMidiOut || (matrixMidiOut === midiOutput));

            if (matrixMidiOut) {
                matrixMidiOut.send([0x90, note, velocity]); // Note On
                // Envia Note Off um pouco depois (duração curta)
                // A duração pode ser configurável no futuro
                setTimeout(() => {
                    if (matrixMidiOut) matrixMidiOut.send([0x80, note, 0]); // Note Off
                }, 100); // Duração de 100ms
            }
            if (useInternalSynthForMatrix) {
                simpleSynth.noteOn(note, velocity);
                 setTimeout(() => {
                    if (simpleSynth) simpleSynth.noteOff(note);
                }, 100);
            }
            // OSC se necessário
            // sendOSCMessage(`/beatmatrix/seq/${note}/on`, velocity);
            // setTimeout(() => sendOSCMessage(`/beatmatrix/seq/${note}/off`), 100);
        }
    }
    currentMatrixColumn = (currentMatrixColumn + 1) % currentMatrixNumCols;
}


function updateMatrixBPMVisuals(newBpmValue) {
    let clampedBpm = Math.max(MATRIX_MIN_BPM, Math.min(MATRIX_MAX_BPM, newBpmValue));
    matrixBPM = clampedBpm;

    if (bpmDisplayMatrix) bpmDisplayMatrix.textContent = `BPM: ${Math.round(clampedBpm)}`;
    if (faderThumbMatrix && bpmTextDisplayMatrix) {
        const normalizedBpm = (MATRIX_MAX_BPM === MATRIX_MIN_BPM) ? 0 : (clampedBpm - MATRIX_MIN_BPM) / (MATRIX_MAX_BPM - MATRIX_MIN_BPM);
        const availableTrackWidthForThumb = H_BPM_FADER_TRACK_WIDTH_MATRIX - H_BPM_FADER_THUMB_WIDTH_MATRIX;
        let thumbX = H_BPM_FADER_TRACK_X_MATRIX + normalizedBpm * availableTrackWidthForThumb;
        thumbX = Math.max(H_BPM_FADER_TRACK_X_MATRIX, Math.min(thumbX, H_BPM_FADER_TRACK_X_MATRIX + availableTrackWidthForThumb));
        faderThumbMatrix.setAttribute('x', thumbX);
        bpmTextDisplayMatrix.textContent = `BPM: ${Math.round(clampedBpm)}`;
    }

    if (isMatrixPlaying) {
        clearInterval(matrixTimerId);
        const columnInterval = 60000 / matrixBPM;
        if (columnInterval > 0 && isFinite(columnInterval)) { // Verifica se o intervalo é válido
             matrixTimerId = setInterval(stepMatrixSequencer, columnInterval);
        } else {
            console.warn("Beat Matrix: Intervalo de coluna inválido. Pausando o sequenciador.");
            toggleMatrixPlayback(); // Pausa se o BPM for inválido
        }
    }
    saveBeatMatrixSettings();
}

// --- Funções genéricas de fader (adaptadas de beatmatrixexe.js) ---
function calculateMatrixValueFromX(svgX, trackX, trackWidth, minValue, maxValue, thumbWidth) {
    let normalizedPosition = (svgX - trackX - (thumbWidth / 2)) / (trackWidth - thumbWidth);
    normalizedPosition = Math.max(0, Math.min(1, normalizedPosition));
    let value = minValue + normalizedPosition * (maxValue - minValue);
    return Math.round(value);
}

function updateMatrixFaderVisualsDOM(currentValue, thumbElement, textElement, trackX, trackWidth, minValue, maxValue, thumbWidth, labelPrefix, unitSuffix = '') {
    if (!thumbElement || !textElement) return currentValue;
    let clampedValue = Math.max(minValue, Math.min(maxValue, currentValue));
    let normalizedValue = (maxValue === minValue) ? 0 : (clampedValue - minValue) / (maxValue - minValue);
    const availableTrackWidthForThumb = trackWidth - thumbWidth;
    let thumbX = trackX + normalizedValue * availableTrackWidthForThumb;
    thumbX = Math.max(trackX, Math.min(thumbX, trackX + availableTrackWidthForThumb));
    thumbElement.setAttribute('x', thumbX);
    textElement.textContent = labelPrefix + Math.round(clampedValue) + unitSuffix;
    return clampedValue;
}

// --- Handlers de Mouse para Faders da Matrix ---
function matrixBPMFaderMouseDownHandler(event) {
    if (spectatorModeActive) return;
    isDraggingMatrixBPM = true;
    const svgRect = horizontalBpmFaderSVGMatrix.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateMatrixValueFromX(svgX, H_BPM_FADER_TRACK_X_MATRIX, H_BPM_FADER_TRACK_WIDTH_MATRIX, MATRIX_MIN_BPM, MATRIX_MAX_BPM, H_BPM_FADER_THUMB_WIDTH_MATRIX);
    updateMatrixBPMVisuals(newBpm);
    document.addEventListener('mousemove', matrixBPMFaderMouseMoveHandler);
    document.addEventListener('mouseup', matrixBPMFaderMouseUpHandler);
}
function matrixBPMFaderMouseMoveHandler(event) {
    if (!isDraggingMatrixBPM) return;
    event.preventDefault();
    const svgRect = horizontalBpmFaderSVGMatrix.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateMatrixValueFromX(svgX, H_BPM_FADER_TRACK_X_MATRIX, H_BPM_FADER_TRACK_WIDTH_MATRIX, MATRIX_MIN_BPM, MATRIX_MAX_BPM, H_BPM_FADER_THUMB_WIDTH_MATRIX);
    updateMatrixBPMVisuals(newBpm);
}
function matrixBPMFaderMouseUpHandler() {
    if (isDraggingMatrixBPM) {
        isDraggingMatrixBPM = false;
        document.removeEventListener('mousemove', matrixBPMFaderMouseMoveHandler);
        document.removeEventListener('mouseup', matrixBPMFaderMouseUpHandler);
        saveBeatMatrixSettings();
    }
}

function handleMatrixRowsChange(newValue) {
    currentMatrixNumRows = updateMatrixFaderVisualsDOM(newValue, rowsFaderThumbMatrix, rowsValueDisplayMatrix, MATRIX_ROWS_FADER_TRACK_X, MATRIX_ROWS_FADER_TRACK_WIDTH, MATRIX_MIN_ROWS, MATRIX_MAX_ROWS, MATRIX_ROWS_FADER_THUMB_WIDTH, "Rows: ");
    if (currentMatrixNumRows > 0 && currentMatrixNumCols > 0 && currentMatrixPadSize > 0) {
        updateMatrixVisuals(currentMatrixNumRows, currentMatrixNumCols, currentMatrixPadSize);
    }
    saveBeatMatrixSettings();
}
function matrixRowsFaderMouseDownHandler(event) {
    if (spectatorModeActive) return;
    isDraggingMatrixRows = true; document.body.style.cursor = 'grabbing';
    let svgX = event.clientX - rowsFaderSVGMatrix.getBoundingClientRect().left;
    handleMatrixRowsChange(calculateMatrixValueFromX(svgX, MATRIX_ROWS_FADER_TRACK_X, MATRIX_ROWS_FADER_TRACK_WIDTH, MATRIX_MIN_ROWS, MATRIX_MAX_ROWS, MATRIX_ROWS_FADER_THUMB_WIDTH));
    document.addEventListener('mousemove', matrixRowsFaderMouseMoveHandler);
    document.addEventListener('mouseup', matrixRowsFaderMouseUpHandler);
}
function matrixRowsFaderMouseMoveHandler(event) {
    if (isDraggingMatrixRows) { event.preventDefault(); let svgX = event.clientX - rowsFaderSVGMatrix.getBoundingClientRect().left; handleMatrixRowsChange(calculateMatrixValueFromX(svgX, MATRIX_ROWS_FADER_TRACK_X, MATRIX_ROWS_FADER_TRACK_WIDTH, MATRIX_MIN_ROWS, MATRIX_MAX_ROWS, MATRIX_ROWS_FADER_THUMB_WIDTH)); }
}
function matrixRowsFaderMouseUpHandler() {
    if (isDraggingMatrixRows) { isDraggingMatrixRows = false; document.body.style.cursor = 'default'; document.removeEventListener('mousemove', matrixRowsFaderMouseMoveHandler); document.removeEventListener('mouseup', matrixRowsFaderMouseUpHandler); saveBeatMatrixSettings(); }
}

function handleMatrixColsChange(newValue) {
    currentMatrixNumCols = updateMatrixFaderVisualsDOM(newValue, colsFaderThumbMatrix, colsValueDisplayMatrix, MATRIX_COLS_FADER_TRACK_X, MATRIX_COLS_FADER_TRACK_WIDTH, MATRIX_MIN_COLS, MATRIX_MAX_COLS, MATRIX_COLS_FADER_THUMB_WIDTH, "Cols: ");
    if (currentMatrixNumRows > 0 && currentMatrixNumCols > 0 && currentMatrixPadSize > 0) {
        updateMatrixVisuals(currentMatrixNumRows, currentMatrixNumCols, currentMatrixPadSize);
    }
    saveBeatMatrixSettings();
}
function matrixColsFaderMouseDownHandler(event) {
    if (spectatorModeActive) return;
    isDraggingMatrixCols = true; document.body.style.cursor = 'grabbing';
    let svgX = event.clientX - colsFaderSVGMatrix.getBoundingClientRect().left;
    handleMatrixColsChange(calculateMatrixValueFromX(svgX, MATRIX_COLS_FADER_TRACK_X, MATRIX_COLS_FADER_TRACK_WIDTH, MATRIX_MIN_COLS, MATRIX_MAX_COLS, MATRIX_COLS_FADER_THUMB_WIDTH));
    document.addEventListener('mousemove', matrixColsFaderMouseMoveHandler);
    document.addEventListener('mouseup', matrixColsFaderMouseUpHandler);
}
function matrixColsFaderMouseMoveHandler(event) {
    if (isDraggingMatrixCols) { event.preventDefault(); let svgX = event.clientX - colsFaderSVGMatrix.getBoundingClientRect().left; handleMatrixColsChange(calculateMatrixValueFromX(svgX, MATRIX_COLS_FADER_TRACK_X, MATRIX_COLS_FADER_TRACK_WIDTH, MATRIX_MIN_COLS, MATRIX_MAX_COLS, MATRIX_COLS_FADER_THUMB_WIDTH)); }
}
function matrixColsFaderMouseUpHandler() {
    if (isDraggingMatrixCols) { isDraggingMatrixCols = false; document.body.style.cursor = 'default'; document.removeEventListener('mousemove', matrixColsFaderMouseMoveHandler); document.removeEventListener('mouseup', matrixColsFaderMouseUpHandler); saveBeatMatrixSettings(); }
}

function handleMatrixPadSizeChange(newValue) {
    currentMatrixPadSize = updateMatrixFaderVisualsDOM(newValue, padSizeFaderThumbMatrix, padSizeValueDisplayMatrix, MATRIX_PAD_SIZE_FADER_TRACK_X, MATRIX_PAD_SIZE_FADER_TRACK_WIDTH, MATRIX_MIN_PAD_SIZE, MATRIX_MAX_PAD_SIZE, MATRIX_PAD_SIZE_FADER_THUMB_WIDTH, "Size: ", "px");
    if (currentMatrixNumRows > 0 && currentMatrixNumCols > 0 && currentMatrixPadSize > 0) {
        updateMatrixVisuals(currentMatrixNumRows, currentMatrixNumCols, currentMatrixPadSize);
    }
    saveBeatMatrixSettings();
}
function matrixPadSizeFaderMouseDownHandler(event) {
    if (spectatorModeActive) return;
    isDraggingMatrixPadSize = true; document.body.style.cursor = 'grabbing';
    let svgX = event.clientX - padSizeFaderSVGMatrix.getBoundingClientRect().left;
    handleMatrixPadSizeChange(calculateMatrixValueFromX(svgX, MATRIX_PAD_SIZE_FADER_TRACK_X, MATRIX_PAD_SIZE_FADER_TRACK_WIDTH, MATRIX_MIN_PAD_SIZE, MATRIX_MAX_PAD_SIZE, MATRIX_PAD_SIZE_FADER_THUMB_WIDTH));
    document.addEventListener('mousemove', matrixPadSizeFaderMouseMoveHandler);
    document.addEventListener('mouseup', matrixPadSizeFaderMouseUpHandler);
}
function matrixPadSizeFaderMouseMoveHandler(event) {
    if (isDraggingMatrixPadSize) { event.preventDefault(); let svgX = event.clientX - padSizeFaderSVGMatrix.getBoundingClientRect().left; handleMatrixPadSizeChange(calculateMatrixValueFromX(svgX, MATRIX_PAD_SIZE_FADER_TRACK_X, MATRIX_PAD_SIZE_FADER_TRACK_WIDTH, MATRIX_MIN_PAD_SIZE, MATRIX_MAX_PAD_SIZE, MATRIX_PAD_SIZE_FADER_THUMB_WIDTH)); }
}
function matrixPadSizeFaderMouseUpHandler() {
    if (isDraggingMatrixPadSize) { isDraggingMatrixPadSize = false; document.body.style.cursor = 'default'; document.removeEventListener('mousemove', matrixPadSizeFaderMouseMoveHandler); document.removeEventListener('mouseup', matrixPadSizeFaderMouseUpHandler); saveBeatMatrixSettings(); }
}


// --- Salvar e Carregar Configurações da Beat Matrix ---
function saveBeatMatrixSettings() {
    const settings = {
        bpm: matrixBPM,
        rows: currentMatrixNumRows,
        cols: currentMatrixNumCols,
        padSize: currentMatrixPadSize,
        // Poderia salvar o estado dos pads ativos (matrixPads.map(p => p.classList.contains('active')))
        // mas isso pode ser grande. Por enquanto, salvamos apenas a configuração.
        midiOutputId: matrixMidiOut ? matrixMidiOut.id : null,
    };
    savePersistentSetting(BEAT_MATRIX_SETTINGS_KEY, settings);
}

function loadBeatMatrixSettings() {
    const settings = loadPersistentSetting(BEAT_MATRIX_SETTINGS_KEY, {});
    matrixBPM = settings.bpm || 120;
    currentMatrixNumRows = settings.rows || 4;
    currentMatrixNumCols = settings.cols || 4;
    currentMatrixPadSize = settings.padSize || 60;

    updateMatrixBPMVisuals(matrixBPM); // Isso também atualiza o fader de BPM
    // Atualiza os faders de configuração da matrix
    currentMatrixNumRows = updateMatrixFaderVisualsDOM(currentMatrixNumRows, rowsFaderThumbMatrix, rowsValueDisplayMatrix, MATRIX_ROWS_FADER_TRACK_X, MATRIX_ROWS_FADER_TRACK_WIDTH, MATRIX_MIN_ROWS, MATRIX_MAX_ROWS, MATRIX_ROWS_FADER_THUMB_WIDTH, "Rows: ");
    currentMatrixNumCols = updateMatrixFaderVisualsDOM(currentMatrixNumCols, colsFaderThumbMatrix, colsValueDisplayMatrix, MATRIX_COLS_FADER_TRACK_X, MATRIX_COLS_FADER_TRACK_WIDTH, MATRIX_MIN_COLS, MATRIX_MAX_COLS, MATRIX_COLS_FADER_THUMB_WIDTH, "Cols: ");
    currentMatrixPadSize = updateMatrixFaderVisualsDOM(currentMatrixPadSize, padSizeFaderThumbMatrix, padSizeValueDisplayMatrix, MATRIX_PAD_SIZE_FADER_TRACK_X, MATRIX_PAD_SIZE_FADER_TRACK_WIDTH, MATRIX_MIN_PAD_SIZE, MATRIX_MAX_PAD_SIZE, MATRIX_PAD_SIZE_FADER_THUMB_WIDTH, "Size: ", "px");

    // Recria a matrix com as configurações carregadas
    updateMatrixVisuals(currentMatrixNumRows, currentMatrixNumCols, currentMatrixPadSize);

    // Restaura a saída MIDI da matrix
    if (settings.midiOutputId && midiOutSelectMatrix && availableMidiOutputs.has(settings.midiOutputId)) {
        midiOutSelectMatrix.value = settings.midiOutputId;
        matrixMidiOut = availableMidiOutputs.get(settings.midiOutputId);
    } else if (midiOutSelectMatrix && midiOutSelectMatrix.options.length > 0) {
        // Fallback para a primeira opção se a salva não existir ou não for especificada
        matrixMidiOut = availableMidiOutputs.get(midiOutSelectMatrix.value);
    }

    // Nota: O estado dos pads ativos (quais estão 'acesos') não está sendo salvo/restaurado aqui
    // para simplificar. Isso pode ser adicionado se necessário.
}

// Chamar initializeBeatMatrixElements e loadBeatMatrixSettings no DOMContentLoaded
// Isso será feito na função principal de inicialização.

// ==========================================================================
// FIM DAS FUNÇÕES DA BEAT MATRIX V69
// ==========================================================================
