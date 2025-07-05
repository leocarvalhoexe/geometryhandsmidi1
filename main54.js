// ==========================================================================
// MIDI SHAPE MANIPULATOR v54 - main54.js
// Organizado para futura modularização
// ==========================================================================

// --------------------------------------------------------------------------
// SEÇÃO: CONFIGURAÇÕES E CONSTANTES GLOBAIS
// --------------------------------------------------------------------------
const DEBUG_MODE = false; // Defina como false para desabilitar logs de debug

// --- Constantes da Aplicação ---
const SIDE_CHANGE_DEBOUNCE_MS = 200;
const OSC_SEND_INTERVAL = 100;
const OSC_RECONNECT_TIMEOUT = 3000;
const GESTURE_SIM_INTERVAL = 100;

// --- Chaves de Armazenamento Local (LocalStorage) ---
const OSC_SETTINGS_KEY = 'oscConnectionSettingsV35';
const THEME_STORAGE_KEY = 'midiShapeThemeV35';
const PRESETS_STORAGE_KEY = 'midiShapePresetsV54';
const APP_SETTINGS_KEY = 'midiShapeManipulatorV54Settings';
const ARPEGGIO_SETTINGS_KEY = 'arpeggioSettingsV54';
const CAMERA_DEVICE_ID_KEY = 'midiShapeCameraDeviceIdV54';
const NOTE_MODE_STORAGE_KEY = 'midiShapeNoteModeV54';
const SYNTH_PANEL_HIDDEN_KEY = 'synthPanelHiddenV54'; // Chave para o estado do painel do synth

// --- Escalas Musicais ---
const SCALES = {
  PENTATONIC_MAJ: { name: 'Pent. Maior', notes: [0, 2, 4, 7, 9], baseMidiNote: 60 },
  DORIAN: { name: 'Dórico', notes: [0, 2, 3, 5, 7, 9, 10], baseMidiNote: 60 },
  HARMONIC_MINOR: { name: 'Menor Harm.', notes: [0, 2, 3, 5, 7, 8, 11], baseMidiNote: 57 },
  CHROMATIC: { name: 'Cromática', notes: [0,1,2,3,4,5,6,7,8,9,10,11], baseMidiNote: 60 }
};
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- Modos de Nota e Arpejo ---
const ARPEGGIO_STYLES = ["UP", "DOWN", "UPDOWN", "RANDOM"];
const NOTE_MODES = {
    SEQUENTIAL: 'SEQUENTIAL',
    ARPEGGIO: 'ARPEGGIO',
    CHORD: 'CHORD',
    RANDOM_WALK: 'RANDOM_WALK'
};

// --------------------------------------------------------------------------
// SEÇÃO: ELEMENTOS DOM
// --------------------------------------------------------------------------

// --- Elementos DOM Globais / Canvas ---
const mainCanvasContainer = document.getElementById('mainCanvasContainer');
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
let ctx = canvasElement.getContext('2d');

// --- Elementos DOM da Sidebar Esquerda (sidebarUI) ---
const sidebar = document.getElementById('sidebar');
const sidebarHandle = document.getElementById('sidebarHandle');
const infoButtonElement = document.getElementById('info');
const infoHudButton = document.getElementById('infoHudButton');
const settingsButton = document.getElementById('settingsButton');
const toggleSynthPanelButton = document.getElementById('toggleSynthPanelButton');
const noteModeSelect = document.getElementById('noteModeSelect');
const arpeggioSettingsButton = document.getElementById('arpeggioSettingsButton');
const oscConfigButton = document.getElementById('oscConfigButton');
const internalAudioToggleButton = document.getElementById('internalAudioToggleButton');
const midiToggleButton = document.getElementById('midiToggleButton');
const syncDMXNotesButton = document.getElementById('syncDMXNotesButton');
const recordOSCButton = document.getElementById('recordOSCButton');
const playOSCLoopButton = document.getElementById('playOSCLoopButton');
const shapePresetButton = document.getElementById('shapePresetButton');
const midiFeedbackToggleButton = document.getElementById('midiFeedbackToggleButton');
const spectatorModeButton = document.getElementById('spectatorModeButton');
const themeToggleButton = document.getElementById('themeToggleButton');
const gestureSimToggleButton = document.getElementById('gestureSimToggleButton');

// --- Elementos DOM da Sidebar Direita (synthUI / synthControlsSidebar) ---
let synthControlsSidebar = document.getElementById('synthControlsSidebar');
const synthSidebarHandle = document.getElementById('synthSidebarHandle'); // Novo handle
// (os elementos internos do synthControlsSidebar serão referenciados na sub-seção de UI do Synth)

// --- Elementos DOM dos Modais (modalUI) ---
// Modal de Informações
const infoModal = document.getElementById('infoModal');
const closeModalButton = document.getElementById('closeModal');

// Modal de Configurações (MIDI, Câmera, Áudio) (settingsModalUI)
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalButton = document.getElementById('closeSettingsModal');
const midiOutputSelect = document.getElementById('midiOutputSelect');
const midiInputSelect = document.getElementById('midiInputSelect');
const cameraSelectElement = document.getElementById('cameraSelect');
// Controles de Áudio no Modal de Configurações (modalSynthUI)
const audioWaveformSelect = document.getElementById('audioWaveformSelect');
const audioMasterVolumeSlider = document.getElementById('audioMasterVolume');
const audioMasterVolumeValueSpan = document.getElementById('audioMasterVolumeValue');
const audioAttackSlider = document.getElementById('audioAttackSlider');
const audioAttackValueSpan = document.getElementById('audioAttackValue');
const audioDecaySlider = document.getElementById('audioDecaySlider');
const audioDecayValueSpan = document.getElementById('audioDecayValue');
const audioSustainSlider = document.getElementById('audioSustainSlider');
const audioSustainValueSpan = document.getElementById('audioSustainValue');
const audioReleaseSlider = document.getElementById('audioReleaseSlider');
const audioReleaseValueSpan = document.getElementById('audioReleaseValue');
const audioDistortionSlider = document.getElementById('audioDistortionSlider');
const audioDistortionValueSpan = document.getElementById('audioDistortionValue');
const audioFilterCutoffSlider = document.getElementById('audioFilterCutoffSlider');
const audioFilterCutoffValueSpan = document.getElementById('audioFilterCutoffValue');
const audioFilterResonanceSlider = document.getElementById('audioFilterResonanceSlider');
const audioFilterResonanceValueSpan = document.getElementById('audioFilterResonanceValue');
const audioLfoWaveformSelect = document.getElementById('audioLfoWaveformSelect');
const audioLfoRateSlider = document.getElementById('audioLfoRateSlider');
const audioLfoRateValueSpan = document.getElementById('audioLfoRateValue');
const audioLfoPitchDepthSlider = document.getElementById('audioLfoPitchDepthSlider');
const audioLfoPitchDepthValueSpan = document.getElementById('audioLfoPitchDepthValue');
const audioLfoFilterDepthSlider = document.getElementById('audioLfoFilterDepthSlider');
const audioLfoFilterDepthValueSpan = document.getElementById('audioLfoFilterDepthValue');
const audioDelayTimeSlider = document.getElementById('audioDelayTimeSlider');
const audioDelayTimeValueSpan = document.getElementById('audioDelayTimeValue');
const audioDelayFeedbackSlider = document.getElementById('audioDelayFeedbackSlider');
const audioDelayFeedbackValueSpan = document.getElementById('audioDelayFeedbackValue');
const audioDelayMixSlider = document.getElementById('audioDelayMixSlider');
const audioDelayMixValueSpan = document.getElementById('audioDelayMixValue');
const audioReverbMixSlider = document.getElementById('audioReverbMixSlider');
const audioReverbMixValueSpan = document.getElementById('audioReverbMixValue');

// Modal de Configurações de Arpejo (modalArpeggioUI)
const arpeggioSettingsModal = document.getElementById('arpeggioSettingsModal');
const closeArpeggioSettingsModalButton = document.getElementById('closeArpeggioSettingsModal');
const arpeggioStyleSelect = document.getElementById('arpeggioStyleSelect');
const arpeggioBPMSlider = document.getElementById('arpeggioBPM');
const arpeggioBPMValueSpan = document.getElementById('arpeggioBPMValue');
const noteIntervalSlider = document.getElementById('noteIntervalSlider');
const noteIntervalValueSpan = document.getElementById('noteIntervalValue');

// Modal de Configuração OSC (modalOscConfigUI)
const oscConfigModal = document.getElementById('oscConfigModal');
const closeOscConfigModalButton = document.getElementById('closeOscConfigModal'); // Principal
const oscHostInput = document.getElementById('oscHostInput');
const oscPortInput = document.getElementById('oscPortInput');
const saveOscConfigButton = document.getElementById('saveOscConfigButton');
const closeOscConfigModalBtnGeneric = document.getElementById('closeOscConfigModalBtnGeneric'); // Botão genérico de fechar

// Modal de Controle OSC (Log, Teste) (modalOscControlUI)
const oscControlModal = document.getElementById('oscControlModal'); // Este modal é aberto pelo de Config OSC
const closeOscControlModalButton = document.getElementById('closeOscControlModal');
const oscAddressInput = document.getElementById('oscAddressInput');
const oscArgsInput = document.getElementById('oscArgsInput');
const sendTestOSCButton = document.getElementById('sendTestOSCButton');
const oscLogTextarea = document.getElementById('oscLogTextarea');
const clearOscLogButton = document.getElementById('clearOscLogButton');
const exportOscLogButton = document.getElementById('exportOscLogButton');
const oscLoopDurationInput = document.getElementById('oscLoopDurationInput');

// Modal de Presets de Formas (modalPresetUI)
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

// --- Elementos DOM do HUD (hudUI) ---
const hudElement = document.getElementById('hud');
const reconnectOSCButton = document.getElementById('reconnectOSCButton');

// --- Elementos DOM da UI do Sintetizador no Painel Direito (synthPanelUI) ---
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
let scFilterCutoffSlider = document.getElementById('scFilterCutoff');
let scFilterCutoffValue = document.getElementById('scFilterCutoffValue');
let scFilterResonanceSlider = document.getElementById('scFilterResonance');
let scFilterResonanceValue = document.getElementById('scFilterResonanceValue');
let scLfoWaveformSelect = document.getElementById('scLfoWaveform');
let scLfoRateSlider = document.getElementById('scLfoRate');
let scLfoRateValue = document.getElementById('scLfoRateValue');
let scLfoPitchDepthSlider = document.getElementById('scLfoPitchDepth');
let scLfoPitchDepthValue = document.getElementById('scLfoPitchDepthValue');
let scLfoFilterDepthSlider = document.getElementById('scLfoFilterDepth');
let scLfoFilterDepthValue = document.getElementById('scLfoFilterDepthValue');
let scDelayTimeSlider = document.getElementById('scDelayTime');
let scDelayTimeValue = document.getElementById('scDelayTimeValue');
let scDelayFeedbackSlider = document.getElementById('scDelayFeedback');
let scDelayFeedbackValue = document.getElementById('scDelayFeedbackValue');
let scDelayMixSlider = document.getElementById('scDelayMix');
let scDelayMixValue = document.getElementById('scDelayMixValue');
let scReverbMixSlider = document.getElementById('scReverbMix');
let scReverbMixValue = document.getElementById('scReverbMixValue');
let scBPMSlider = document.getElementById('scBPM');
let scBPMValueSpan = document.getElementById('scBPMValue');
// Controles de Gravação de Áudio no Painel do Synth (audioRecordingUI)
let recordAudioButton = document.getElementById('recordAudioButton');
let pauseAudioButton = document.getElementById('pauseAudioButton');
let saveAudioButton = document.getElementById('saveAudioButton');


// --------------------------------------------------------------------------
// SEÇÃO: VARIÁVEIS DE ESTADO DA APLICAÇÃO (appState)
// --------------------------------------------------------------------------
let hasWebGL2 = false;
const shapes = [new Shape(0, 0), new Shape(1, 1)]; // Instâncias da classe Shape
let operationMode = 'two_persons'; // 'one_person' ou 'two_persons'
let pulseModeActive = false;
let pulseTime = 0;
let pulseFrequency = 0.5;
let midiEnabled = true;
let internalAudioEnabled = true;
let staccatoModeActive = false;
let vertexPullModeActive = false;
let chordMode = "TRIAD"; // Ex: "TRIAD", "SEVENTH" (não totalmente implementado)

// --- Estado do Arpejador (arpeggiatorState) ---
let currentArpeggioStyle = "UP";
let arpeggioBPM = 120;
let noteInterval = 60000 / arpeggioBPM; // Calculado a partir do BPM
let externalBPM = null; // Se BPM está sendo controlado externamente

// --- Estado OSC (oscState) ---
let osc; // Instância do OSC-JS
let oscStatus = "OSC Desconectado";
let OSC_HOST = localStorage.getItem(OSC_SETTINGS_KEY) ? (JSON.parse(localStorage.getItem(OSC_SETTINGS_KEY)).host || location.hostname || "127.0.0.1") : (location.hostname || "127.0.0.1");
let OSC_PORT = localStorage.getItem(OSC_SETTINGS_KEY) ? (JSON.parse(localStorage.getItem(OSC_SETTINGS_KEY)).port || 8080) : 8080;
let lastOscSendTime = 0;
let oscHeartbeatIntervalId = null;
let isRecordingOSC = false;
let recordedOSCSequence = [];
let recordingStartTime = 0;
let playbackStartTime = 0;
let playbackLoopIntervalId = null;
let oscLoopDuration = 5000; // ms
let isPlayingOSCLoop = false;

// --- Estado Geral e de Modos (generalState) ---
let spectatorModeActive = false;
let dmxSyncModeActive = false;
let midiFeedbackEnabled = false;
let cameraError = false;
let fallbackShapes = [];
let gestureSimulationActive = false;
let gestureSimIntervalId = null;
let currentTheme = 'theme-dark';
let shapePresets = {}; // Objeto para armazenar presets de formas
let notesToVisualize = []; // Para visualização de notas na tela

// --- Estado da Câmera e MediaPipe (cameraState) ---
let currentCameraDeviceId = null;
let mediaStream = null;
let hands; // Instância do MediaPipe Hands
let camera; // Instância do MediaPipe Camera

// --- Estado MIDI (midiState) ---
let midiAccess = null;
let midiOutput = null;
let midiInput = null;
let availableMidiOutputs = new Map();
let availableMidiInputs = new Map();
let lastLogSource = ""; // Para formatação do log OSC

// --- Estado da Gravação de Áudio (WebM) (audioRecordingState) ---
let mediaRecorder;
let audioChunks = [];
let isAudioRecording = false;
let isAudioPaused = false;

// --- Estado da Plataforma (platformState) ---
let currentPlatform = 'PC'; // 'PC', 'Android', 'iOS'

// --- Estado da UI (uiState) ---
let outputPopupWindow = null; // Janela popup para visualização (se usada)
let popupCanvasCtx = null;

// --- Estado Musical (musicalState) ---
let currentScaleName = 'PENTATONIC_MAJ';
let currentScaleIndex = 0; // Índice para ciclo de escalas (se implementado)
let currentNoteMode = NOTE_MODES.SEQUENTIAL;


// --------------------------------------------------------------------------
// SEÇÃO: CLASSE SHAPE (Lógica das Formas Geométricas) (shapeLogic)
// --------------------------------------------------------------------------
class Shape {
  constructor(id, midiChannel) {
    this.id = id;
    this.centerX = canvasElement ? canvasElement.width / (this.id === 0 ? 4 : 1.333) : 320;
    this.centerY = canvasElement ? canvasElement.height / 2 : 240;
    this.radius = 100;
    this.sides = 100; // Círculo por padrão
    this.distortionFactor = 0; // Não usado ativamente, mas pode ser para efeitos futuros
    this.activeMidiNotes = {}; // Notas MIDI/áudio ativas para esta forma
    this.midiChannel = midiChannel;
    this.leftHandLandmarks = null;
    this.rightHandLandmarks = null;
    this.pinchDistance = 0; // Para controle de lados
    this.lastSideChangeTime = 0; // Debounce para mudança de lados
    this.activeGesture = null; // 'resize', 'sides', 'liquify', etc.
    this.currentPitchBend = 8192; // Valor neutro do pitch bend
    // Valores de CC MIDI controlados pela forma/gestos
    this.reverbAmount = 0; this.delayAmount = 0; this.panValue = 64;
    this.brightnessValue = 64; this.modWheelValue = 0; this.resonanceValue = 0;
    // Últimos valores enviados para evitar envios redundantes
    this.lastSentReverb = -1; this.lastSentDelay = -1; this.lastSentPan = -1;
    this.lastSentBrightness = -1; this.lastSentModWheel = -1; this.lastSentResonance = -1;
    this.vertexOffsets = {}; // Para o efeito "liquify"
    this.beingPulledByFinger = {}; // Não usado ativamente
    this.rotationDirection = 1; // Para modos de nota que ciclam
    this.currentEdgeIndex = 0; // Índice da borda/vértice atual para geração de nota
    this.lastNotePlayedTime = 0; // Timestamp da última nota (não arpejo)
    this.lastResizeRadius = this.radius; // Para debounce/lógica de resize
    this.lastResizeTime = 0;
    this.lastSentActiveGesture = null; // Para envio OSC de gestos
    this.arpeggioDirection = 1; // Para arpejos UP/DOWN
    this.lastArpeggioNotePlayedTime = 0; // Timestamp da última nota de arpejo
    this.timingVariationFactor = 1.0; // v54 - Para efeito de distorção geométrica no timing
  }
}

// --------------------------------------------------------------------------
// SEÇÃO: FUNÇÕES AUXILIARES (Helpers Diversos) (utils)
// --------------------------------------------------------------------------

// --- Debugging ---
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

// --- Detecção de Plataforma e Suporte ---
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

// --- Manipulação do Canvas ---
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvasElement.getBoundingClientRect();
  canvasElement.width = rect.width * dpr;
  canvasElement.height = rect.height * dpr;
  console.log(`Canvas resized to: ${canvasElement.width}x${canvasElement.height} (Display: ${rect.width}x${rect.height}, DPR: ${dpr})`);
}

// --- Matemática e Geometria ---
function distance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1)**2 + (y2 - y1)**2); }
function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) { return Math.abs(distance(x, y, cx, cy) - r) <= tolerance; }

// --- Conversão e Nomes de Notas ---
function getNoteName(midiNote) { if (midiNote < 0 || midiNote > 127) return ""; return `${NOTE_NAMES[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`; }
function getNoteInScale(index, baseOctaveOffset = 0) {
  const scale = SCALES[currentScaleName]; const scaleNotes = scale.notes; const len = scaleNotes.length;
  const octave = baseOctaveOffset + Math.floor(index / len); const noteIdx = index % len;
  return Math.max(0, Math.min(127, scale.baseMidiNote + scaleNotes[noteIdx] + (octave * 12)));
}

// --- Feedback Visual Global ---
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


// --------------------------------------------------------------------------
// SEÇÃO: DESENHO E ANIMAÇÃO NO CANVAS (drawingLogic)
// --------------------------------------------------------------------------
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

  // Desenha destaque da nota de arpejo
  if (currentNoteMode === 'ARPEGGIO' && shape.sides > 0 && midiEnabled) {
    const key = `arp_${shape.id}_${shape.currentEdgeIndex}`;
    if (shape.activeMidiNotes[key]?.playing) {
      const angle = (shape.currentEdgeIndex / shape.sides) * Math.PI * 2;
      let vx = r * Math.cos(angle); let vy = r * Math.sin(angle);
      let ox = 0; let oy = 0;
      if (vertexPullModeActive && shape.vertexOffsets[shape.currentEdgeIndex] && !spectatorModeActive) { ox = shape.vertexOffsets[shape.currentEdgeIndex].x; oy = shape.vertexOffsets[shape.currentEdgeIndex].y; }
      ctx.beginPath(); ctx.arc(cx + vx + ox, cy + vy + oy, 8, 0, Math.PI * 2);
      ctx.fillStyle = shape.id === 0 ? 'rgba(0,255,255,0.6)' : 'rgba(255,0,255,0.6)'; ctx.fill();
    }
  }

  // Calcula distorção e atualiza parâmetros MIDI CC e timing
  const avgDisp = (activeLiquifyPts > 0) ? totalDispMag / activeLiquifyPts : (Object.keys(shape.vertexOffsets).length > 0 ? totalDispMag / Object.keys(shape.vertexOffsets).length : 0);
  const maxDistortion = 50.0; const pitchBendSens = 4096;
  shape.currentPitchBend = 8192 + Math.round(Math.min(1.0, avgDisp / maxDistortion) * pitchBendSens);
  shape.currentPitchBend = Math.max(0, Math.min(16383, shape.currentPitchBend));
  const normDistortion = Math.min(1.0, avgDisp / maxDistortion);

  const MAX_TIMING_VARIATION = 0.2;
  shape.timingVariationFactor = 1.0 + (normDistortion * MAX_TIMING_VARIATION);

  shape.reverbAmount = Math.round(normDistortion * 127); shape.delayAmount = Math.round(normDistortion * 127);
  shape.modWheelValue = Math.round(normDistortion * 127); shape.resonanceValue = Math.round(normDistortion * 127);
  shape.panValue = Math.max(0, Math.min(127, Math.round((shape.centerX / canvasElement.width) * 127)));
  let normSides = (shape.sides - 3) / (20 - 3); normSides = Math.max(0, Math.min(1, normSides));
  if (shape.sides === 100) normSides = 0.5; // Círculo
  shape.brightnessValue = Math.round(normSides * 127);

  // Processa notas e limpa notas inativas
  processShapeNotes(shape, isPulsing, pulseValue);
  Object.keys(shape.activeMidiNotes).forEach(k => {
    const ni = shape.activeMidiNotes[k]; let del = false;
    if (!ni || !ni.playing || !midiEnabled || shape.sides <= 0 || spectatorModeActive) { if(ni) ni.playing=false; del=true; }
    else if (currentNoteMode !== NOTE_MODES.ARPEGGIO && currentNoteMode !== NOTE_MODES.CHORD && !ni.isArpeggioNote) { const edge = parseInt(k.split('_')[0]); if (isNaN(edge) || edge >= shape.sides) {ni.playing=false; del=true;} }
    else if (ni.isArpeggioNote && currentNoteMode !== 'ARPEGGIO') { ni.playing=false; del=true; }
    if(del) { if(ni) {sendMidiNoteOff(ni.note, shape.midiChannel, shape.id+1); if(ni.staccatoTimer) clearTimeout(ni.staccatoTimer);} delete shape.activeMidiNotes[k];}
  });
}

function drawLandmarks(landmarksArray, handedness = "Unknown") {
    if (!landmarksArray || landmarksArray.length === 0 || spectatorModeActive) return;
    const connections = [
        [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8],
        [5,9],[9,10],[10,11],[11,12], [9,13],[13,14],[14,15],[15,16],
        [13,17],[17,18],[18,19],[19,20], [0,17]
    ];
    ctx.strokeStyle = handedness === "Right" ? 'lime' : (handedness === "Left" ? 'cyan' : 'yellow');
    ctx.lineWidth = 2;
    for (const conn of connections) {
        const lm1 = landmarksArray[conn[0]]; const lm2 = landmarksArray[conn[1]];
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
    if (!canvasElement || canvasElement.width === 0 || canvasElement.height === 0) { console.warn("initFallbackShapes: Canvas não pronto."); return; }
    const numShapes = 5 + Math.floor(Math.random() * 5);
    const colors = ["#FF00FF", "#00FFFF", "#FFFF00", "#FF0000", "#00FF00", "#FFA500", "#800080"];
    for (let i = 0; i < numShapes; i++) {
        fallbackShapes.push({
            x: Math.random() * canvasElement.width, y: Math.random() * canvasElement.height,
            radius: 15 + Math.random() * 25, color: colors[i % colors.length],
            vx: (Math.random() - 0.5) * (2 + Math.random() * 2), vy: (Math.random() - 0.5) * (2 + Math.random() * 2),
            sides: 3 + Math.floor(Math.random() * 6), rotationSpeed: (Math.random() - 0.5) * 0.02,
            currentAngle: Math.random() * Math.PI * 2, canvasWidth: canvasElement.width, canvasHeight: canvasElement.height
        });
    }
    logDebug("Fallback shapes inicializadas:", fallbackShapes.length);
}

function drawFallbackAnimation() {
    if (!canvasElement || !ctx) { console.warn("drawFallbackAnimation: Canvas ou context não disponível."); return; }
    if (fallbackShapes.length === 0 || (fallbackShapes[0].canvasWidth !== canvasElement.width || fallbackShapes[0].canvasHeight !== canvasElement.height) ) {
        initFallbackShapes(); if (fallbackShapes.length === 0) return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    ctx.font = "bold 18px Arial"; ctx.fillStyle = "#666"; ctx.textAlign = "center";
    ctx.fillText("Detecção de mãos indisponível ou falhou.", canvasElement.width / 2, canvasElement.height / 2 - 30);
    ctx.font = "14px Arial";
    ctx.fillText("Exibindo animação alternativa. Verifique as permissões da câmera.", canvasElement.width / 2, canvasElement.height / 2);
    fallbackShapes.forEach(shape => {
        shape.x += shape.vx; shape.y += shape.vy; shape.currentAngle += shape.rotationSpeed;
        if (shape.x - shape.radius < 0 || shape.x + shape.radius > canvasElement.width) shape.vx *= -1;
        if (shape.y - shape.radius < 0 || shape.y + shape.radius > canvasElement.height) shape.vy *= -1;
        ctx.beginPath();
        for (let i = 0; i < shape.sides; i++) {
            const angle = (i / shape.sides) * Math.PI * 2 + shape.currentAngle;
            const x = shape.x + shape.radius * Math.cos(angle); const y = shape.y + shape.radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.strokeStyle = shape.color; ctx.lineWidth = 2 + Math.random(); ctx.stroke();
    });
}

function animationLoop() {
  requestAnimationFrame(animationLoop);
  // A lógica de desenho principal agora é chamada dentro de onResults ou runGestureSimulation
  // Aqui, apenas garantimos que a animação de fallback seja desenhada se a câmera falhar e não houver simulação.
  if (cameraError && !gestureSimulationActive && !camera) { // Adicionado !camera para segurança
      drawFallbackAnimation();
      updateHUD(); // HUD pode precisar ser atualizado mesmo com fallback
  }
}

// --------------------------------------------------------------------------
// SEÇÃO: MEDIAPIPE E PROCESSAMENTO DE GESTOS (gestureHandler)
// --------------------------------------------------------------------------
async function initializeCamera(deviceId = null) {
    logDebug(`Tentando inicializar câmera. Device ID: ${deviceId || 'Padrão'}`);
    console.log(`Inicializando câmera com deviceId: ${deviceId || 'Padrão'}`); cameraError = false;
    if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }
    if (camera && typeof camera.stop === 'function') { try { await camera.stop(); } catch(e) { console.warn("Erro ao parar câmera anterior:", e); } camera = null; }

    try {
        const constraints = { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false };
        if (deviceId) constraints.video.deviceId = { exact: deviceId };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoElement) {
            videoElement.srcObject = mediaStream;
            await new Promise((resolve, reject) => {
                videoElement.onloadedmetadata = () => { videoElement.play().then(resolve).catch(e => { console.error("Erro play vídeo:", e); cameraError = true; reject(e); }); };
                videoElement.onerror = (e) => { console.error("Erro vídeo (onerror):", e); cameraError = true; reject(e); };
            });
        } else { console.error("videoElement não encontrado."); cameraError = true; if (mediaStream) mediaStream.getTracks().forEach(track => track.stop()); return; }

        if (!hands) {
            hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
            hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.8, minTrackingConfidence: 0.8 });
            hands.onResults(onResults);
        } else { hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.8, minTrackingConfidence: 0.8 }); }

        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (gestureSimulationActive || cameraError || !videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                    if (cameraError && !gestureSimulationActive) { drawFallbackAnimation(); updateHUD(); } return;
                }
                if (hands && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) { try { await hands.send({ image: videoElement }); } catch (e) { console.error("Erro hands.send:", e); cameraError = true; } }
            },
            width: 640, height: 480
        });
        await camera.start();
        console.log("Camera e MediaPipe inicializados."); currentCameraDeviceId = deviceId; localStorage.setItem(CAMERA_DEVICE_ID_KEY, currentCameraDeviceId || '');
    } catch (error) {
        console.error(`Falha webcam (ID: ${deviceId || 'Padrão'}):`, error); displayGlobalError(`Falha webcam (${error.name || 'Error'}): ${error.message || 'Desconhecido'}.`, 20000);
        cameraError = true; if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
        if (camera && typeof camera.stop === 'function') { try { await camera.stop(); } catch(e) { console.warn("Erro parar MediaPipe Camera:", e); } } camera = null;
    }
}

async function populateCameraSelect() {
    logDebug("Populando lista de câmeras...");
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) { console.warn("enumerateDevices() não suportado."); if(cameraSelectElement) cameraSelectElement.disabled = true; return; }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        if(cameraSelectElement) {
            cameraSelectElement.innerHTML = '<option value="">Padrão do Navegador</option>';
            let preferredDeviceId = null;
            if (currentPlatform === 'Android') { const rearCamera = videoDevices.find(device => /back|rear|environment/i.test(device.label)); if (rearCamera) preferredDeviceId = rearCamera.deviceId; }
            videoDevices.forEach(device => {
                const option = document.createElement('option'); option.value = device.deviceId; option.text = device.label || `Câmera ${cameraSelectElement.options.length}`;
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
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0,0,canvasElement.width, canvasElement.height);
  shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; });

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    if (operationMode === 'one_person') {
      let lH = null, rH = null;
      results.multiHandLandmarks.forEach((landmarks, i) => {
        if (!spectatorModeActive) drawLandmarks(landmarks, results.multiHandedness[i]?.label);
        const handedness = results.multiHandedness[i]?.label;
        if (handedness === "Left" && !lH) lH = landmarks; else if (handedness === "Right" && !rH) rH = landmarks;
      });
      shapes[0].leftHandLandmarks = lH; shapes[0].rightHandLandmarks = rH;
      if (shapes.length > 1) { shapes[1].leftHandLandmarks = null; shapes[1].rightHandLandmarks = null; }
    } else { // two_persons
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
      shape.centerX = shape.centerX * 0.85 + targetCenterX * 0.15;
      shape.centerY = shape.centerY * 0.85 + targetCenterY * 0.15;
    }
    if (shape.leftHandLandmarks && shape.rightHandLandmarks) { // Gestos com duas mãos para a forma
      const lThumb = shape.leftHandLandmarks[4], rThumb = shape.rightHandLandmarks[4];
      const lIdxCurl = shape.leftHandLandmarks[8].y > shape.leftHandLandmarks[6].y;
      const rIdxCurl = shape.rightHandLandmarks[8].y > shape.rightHandLandmarks[6].y;
      if (lIdxCurl && rIdxCurl) { // Gesto de Resize
        currentGesture = 'resize'; gestureProcessed = true;
        const distVal = distance(lThumb.x, lThumb.y, rThumb.x, rThumb.y) * canvasElement.width;
        const normDist = Math.max(0,Math.min(1, (distVal - 50)/(canvasElement.width*0.3)));
        shape.radius = shape.radius*0.8 + (30 + normDist * 270)*0.2;
        if (Math.abs(shape.radius - shape.lastResizeRadius) > 10 && (performance.now() - shape.lastResizeTime > 500)) { shape.lastResizeRadius = shape.radius; shape.lastResizeTime = performance.now(); }
      }
    }
    if (!gestureProcessed && shape.leftHandLandmarks) { // Gesto de Lados (mão esquerda)
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
    if (!gestureProcessed && shape.rightHandLandmarks) { currentGesture = 'liquify'; } // Gesto de Liquify (mão direita)

    const oscGesture = currentGesture || 'none';
    if (shape.lastSentActiveGesture !== oscGesture) { sendOSCMessage(`/forma/${shape.id+1}/gestureActivated`, oscGesture); shape.lastSentActiveGesture = oscGesture; }
    shape.activeGesture = currentGesture;
  });

  // Desenha formas e notas
  let pVal = 0; if(pulseModeActive) { pulseTime = performance.now()*0.001; pVal = Math.sin(pulseTime*pulseFrequency*2*Math.PI); }
  shapes.forEach(s => drawShape(s, pulseModeActive, pVal));

  const visNow = performance.now(); ctx.font="15px Arial"; ctx.textAlign="center";
  notesToVisualize = notesToVisualize.filter(n => {
    const age = visNow - n.timestamp;
    if (age < 750) { ctx.fillStyle = `rgba(255,255,255,${1-(age/750)})`; ctx.fillText(n.noteName, n.x, n.y); return true; }
    return false;
  });

  updateHUD(); // Atualiza HUD
  // Atualiza popup se existir
  if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) {
    try {
      const pc = outputPopupWindow.document.getElementById('popupCanvas');
      if (pc.width !== outputPopupWindow.innerWidth || pc.height !== outputPopupWindow.innerHeight) { pc.width = outputPopupWindow.innerWidth; pc.height = outputPopupWindow.innerHeight; }
      popupCanvasCtx.fillStyle='rgba(0,0,0,0.1)'; popupCanvasCtx.fillRect(0,0,pc.width,pc.height);
      popupCanvasCtx.drawImage(canvasElement,0,0,pc.width,pc.height);
    } catch(e) { if(e.name === "InvalidStateError" || outputPopupWindow?.closed) { popupCanvasCtx=null; outputPopupWindow=null; } }
  }
}

// --------------------------------------------------------------------------
// SEÇÃO: LÓGICA DE NOTAS (MIDI E ÁUDIO INTERNO) (noteLogic)
// --------------------------------------------------------------------------
function processShapeNotes(shape, isPulsing, pulseValue) {
    if (spectatorModeActive || !midiEnabled || shape.sides <= 0) return;
    const now = performance.now();
    const currentEffectiveInterval = noteInterval * shape.timingVariationFactor;
    const canPlayNonArp = now - shape.lastNotePlayedTime > currentEffectiveInterval;
    const canPlayArp = currentNoteMode === NOTE_MODES.ARPEGGIO && shape.sides > 2 && (now - shape.lastArpeggioNotePlayedTime > currentEffectiveInterval);

    if (canPlayNonArp || canPlayArp) {
        let notesToPlay = []; let edgeIdx = shape.currentEdgeIndex; let notePlayed = false;
        if (currentNoteMode !== NOTE_MODES.CHORD && currentNoteMode !== NOTE_MODES.ARPEGGIO) {
            const oldKey = `${edgeIdx}_0`; // Chave genérica para notas não-acorde/não-arpejo
            if (shape.activeMidiNotes[oldKey]?.playing && !staccatoModeActive) { sendMidiNoteOff(shape.activeMidiNotes[oldKey].note, shape.midiChannel, shape.id + 1); shape.activeMidiNotes[oldKey].playing = false; }
        }

        switch (currentNoteMode) {
            case NOTE_MODES.SEQUENTIAL:
                if (canPlayNonArp && shape.sides > 0) {
                    if (!staccatoModeActive) { Object.keys(shape.activeMidiNotes).forEach(k => { if (k.startsWith(`seq_${shape.id}_`) && shape.activeMidiNotes[k]?.playing) { sendMidiNoteOff(shape.activeMidiNotes[k].note, shape.midiChannel, shape.id + 1); shape.activeMidiNotes[k].playing = false; if (shape.activeMidiNotes[k].staccatoTimer) clearTimeout(shape.activeMidiNotes[k].staccatoTimer); delete shape.activeMidiNotes[k]; } }); }
                    for (let i = 0; i < shape.sides; i++) { notesToPlay.push({ note: getNoteInScale(i), vertexIndex: i }); }
                    notePlayed = true; shape.lastNotePlayedTime = now;
                } break;
            case NOTE_MODES.ARPEGGIO:
                if (canPlayArp) {
                    Object.keys(shape.activeMidiNotes).forEach(k => { if (k.startsWith(`arp_${shape.id}_`) && shape.activeMidiNotes[k]?.playing && !staccatoModeActive) { sendMidiNoteOff(shape.activeMidiNotes[k].note, shape.midiChannel, shape.id + 1); shape.activeMidiNotes[k].playing = false; } });
                    if (currentArpeggioStyle === "UP") shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides;
                    else if (currentArpeggioStyle === "DOWN") shape.currentEdgeIndex = (shape.currentEdgeIndex - 1 + shape.sides) % shape.sides;
                    else if (currentArpeggioStyle === "UPDOWN") {
                        if (shape.arpeggioDirection === 1) { if (shape.currentEdgeIndex >= shape.sides - 1) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.arpeggioDirection = -1; } else shape.currentEdgeIndex++; }
                        else { if (shape.currentEdgeIndex <= 0) { shape.currentEdgeIndex = 0; shape.arpeggioDirection = 1; if (shape.sides > 1) shape.currentEdgeIndex++; } else shape.currentEdgeIndex--; }
                        if (shape.sides > 0) shape.currentEdgeIndex = Math.max(0, Math.min(shape.currentEdgeIndex, shape.sides - 1)); else shape.currentEdgeIndex = 0;
                    } else if (currentArpeggioStyle === "RANDOM") shape.currentEdgeIndex = shape.sides > 0 ? Math.floor(Math.random() * shape.sides) : 0;
                    edgeIdx = shape.currentEdgeIndex; if (shape.sides > 0) notesToPlay.push(getNoteInScale(edgeIdx));
                    notePlayed = true; shape.lastArpeggioNotePlayedTime = now;
                } break;
            case NOTE_MODES.CHORD:
                if (canPlayNonArp) {
                    shape.currentEdgeIndex += shape.rotationDirection;
                    if (shape.currentEdgeIndex >= shape.sides) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.rotationDirection = -1; }
                    else if (shape.currentEdgeIndex < 0) { shape.currentEdgeIndex = 0; shape.rotationDirection = 1; }
                    edgeIdx = shape.currentEdgeIndex;
                    if (edgeIdx < shape.sides) {
                        notesToPlay.push(getNoteInScale(edgeIdx)); notesToPlay.push(getNoteInScale(edgeIdx + 2)); notesToPlay.push(getNoteInScale(edgeIdx + 4)); // Tríade simples
                        Object.values(shape.activeMidiNotes).forEach(ni => { if (ni.playing) sendMidiNoteOff(ni.note, shape.midiChannel, shape.id + 1); if (ni.staccatoTimer) clearTimeout(ni.staccatoTimer); });
                        shape.activeMidiNotes = {}; // Limpa notas anteriores para acordes
                    } notePlayed = true; shape.lastNotePlayedTime = now;
                } break;
            case NOTE_MODES.RANDOM_WALK:
                if (canPlayNonArp) {
                    shape.currentEdgeIndex += Math.floor(Math.random() * 3) - 1; // Pequeno passo aleatório
                    const scaleNoteCount = SCALES[currentScaleName].notes.length * 2; // Exemplo de faixa
                    shape.currentEdgeIndex = (shape.currentEdgeIndex + scaleNoteCount) % scaleNoteCount;
                    edgeIdx = shape.currentEdgeIndex; notesToPlay.push(getNoteInScale(edgeIdx));
                    notePlayed = true; shape.lastNotePlayedTime = now;
                } break;
        }

        if (notePlayed && notesToPlay.length > 0) {
            let vel = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * (97 / 270))));
            if (isPulsing) vel = Math.max(0, Math.min(127, Math.round(vel * (0.6 + ((pulseValue + 1) / 2) * 0.4))));
            notesToPlay.forEach((noteObjOrNote, index) => {
                let noteToPlay, vertexIdxForKey;
                if (typeof noteObjOrNote === 'object' && noteObjOrNote.hasOwnProperty('note')) { noteToPlay = noteObjOrNote.note; vertexIdxForKey = noteObjOrNote.vertexIndex; }
                else { noteToPlay = noteObjOrNote; vertexIdxForKey = edgeIdx; }
                let key;
                if (currentNoteMode === NOTE_MODES.SEQUENTIAL) key = `seq_${shape.id}_${vertexIdxForKey}`;
                else if (currentNoteMode === NOTE_MODES.ARPEGGIO) key = `arp_${shape.id}_${vertexIdxForKey}`;
                else if (currentNoteMode === NOTE_MODES.CHORD) key = `chord_${shape.id}_${noteToPlay}_${index}`;
                else key = `${vertexIdxForKey}_0`; // Chave genérica para outros modos
                sendMidiNoteOn(noteToPlay, vel, shape.midiChannel, shape.id + 1);
                if (shape.activeMidiNotes[key]?.staccatoTimer) clearTimeout(shape.activeMidiNotes[key].staccatoTimer);
                shape.activeMidiNotes[key] = { note: noteToPlay, playing: true, lastPitchBend: shape.currentPitchBend, isArpeggioNote: currentNoteMode === NOTE_MODES.ARPEGGIO, isSequentialNote: currentNoteMode === NOTE_MODES.SEQUENTIAL };
                if (staccatoModeActive) { shape.activeMidiNotes[key].staccatoTimer = setTimeout(() => { if (shape.activeMidiNotes[key]?.playing) { sendMidiNoteOff(noteToPlay, shape.midiChannel, shape.id + 1); shape.activeMidiNotes[key].playing = false; } }, 150); }
            });
            // Envia CCs e Pitch Bend
            if (shape.currentPitchBend !== 8192) sendPitchBend(shape.currentPitchBend, shape.midiChannel);
            if (shape.reverbAmount !== shape.lastSentReverb) { sendMidiCC(91, shape.reverbAmount, shape.midiChannel); shape.lastSentReverb = shape.reverbAmount; }
            if (shape.delayAmount !== shape.lastSentDelay) { sendMidiCC(94, shape.delayAmount, shape.midiChannel); shape.lastSentDelay = shape.delayAmount; }
            if (shape.panValue !== shape.lastSentPan) { sendMidiCC(10, shape.panValue, shape.midiChannel); shape.lastSentPan = shape.panValue; }
            if (shape.brightnessValue !== shape.lastSentBrightness) { sendMidiCC(74, shape.brightnessValue, shape.midiChannel); shape.lastSentBrightness = shape.brightnessValue; }
            if (shape.modWheelValue !== shape.lastSentModWheel) { sendMidiCC(1, shape.modWheelValue, shape.midiChannel); shape.lastSentModWheel = shape.modWheelValue; }
            if (shape.resonanceValue !== shape.lastSentResonance) { sendMidiCC(71, shape.resonanceValue, shape.midiChannel); shape.lastSentResonance = shape.resonanceValue; }
        }
    }
    // Atualiza pitch bend para notas ativas se necessário
    if (Object.values(shape.activeMidiNotes).some(ni => ni.playing)) {
        if (Math.abs(shape.currentPitchBend - (shape.activeMidiNotes[Object.keys(shape.activeMidiNotes)[0]]?.lastPitchBend || 8192)) > 10) {
            sendPitchBend(shape.currentPitchBend, shape.midiChannel);
            Object.values(shape.activeMidiNotes).forEach(ni => { if(ni) ni.lastPitchBend = shape.currentPitchBend; });
        }
    }
}

// --------------------------------------------------------------------------
// SEÇÃO: CONTROLE MIDI (Saída, Entrada, Reset) (midiController)
// --------------------------------------------------------------------------
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
  const currentSimpleSynth = getSimpleSynthInstance(); // De synth54.js
  if (internalAudioEnabled && currentSimpleSynth && typeof currentSimpleSynth.noteOn === 'function') { currentSimpleSynth.noteOn(n, v); }
  sendOSCMessage(`/forma/${shapeId}/noteOn`, n, v, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, v);
}
function sendMidiNoteOff(note, channel, shapeId = -1) {
  if (spectatorModeActive) return;
  const ch = Math.max(0, Math.min(15, channel)); const n = Math.max(0, Math.min(127, Math.round(note)));
  if (midiEnabled && midiOutput) { midiOutput.send([0x80 + ch, n, 0]); }
  const currentSimpleSynth = getSimpleSynthInstance(); // De synth54.js
  if (internalAudioEnabled && currentSimpleSynth && typeof currentSimpleSynth.noteOff === 'function') { currentSimpleSynth.noteOff(n); }
  sendOSCMessage(`/forma/${shapeId}/noteOff`, n, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, 0);
}
function sendPitchBend(bendValue, channel) { if (spectatorModeActive || !midiEnabled || !midiOutput) return; const ch = Math.max(0,Math.min(15,channel)); const bend = Math.max(0,Math.min(16383,Math.round(bendValue))); midiOutput.send([0xE0+ch, bend & 0x7F, (bend>>7)&0x7F]); }
function sendMidiCC(cc, value, channel) { if (spectatorModeActive || !midiEnabled || !midiOutput) return; const ch = Math.max(0,Math.min(15,channel)); const c = Math.max(0,Math.min(119,Math.round(cc))); const v = Math.max(0,Math.min(127,Math.round(value))); midiOutput.send([0xB0+ch, c, v]); }
function turnOffAllActiveNotesForShape(shape) {
  if (spectatorModeActive) return;
  const origMidiEnabled = midiEnabled; midiEnabled = true; // Força envio de note off
  logDebug(`Desligando todas as notas ativas para a forma ${shape.id}`);
  Object.values(shape.activeMidiNotes).forEach(noteInfo => { if (noteInfo.playing) { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); } if (noteInfo.staccatoTimer) clearTimeout(noteInfo.staccatoTimer); });
  shape.activeMidiNotes = {}; midiEnabled = origMidiEnabled;
}
function turnOffAllActiveNotes() {
  if (spectatorModeActive) return;
  logDebug("Desligando todas as notas ativas (MIDI e Interno).");
  const origMidiEnabled = midiEnabled; midiEnabled = true;
  shapes.forEach(shape => turnOffAllActiveNotesForShape(shape));
  midiEnabled = origMidiEnabled;
  const currentSimpleSynth = getSimpleSynthInstance();
  if (currentSimpleSynth && typeof currentSimpleSynth.allNotesOff === 'function') { currentSimpleSynth.allNotesOff(); }
}
function resetMidiSystem() {
  if (spectatorModeActive) return; console.log("MIDI Reset."); logDebug("Sistema MIDI Resetado.");
  turnOffAllActiveNotes();
  const origMidiEnabled = midiEnabled; midiEnabled = true;
  if (midiOutput) { for (let ch = 0; ch < 16; ch++) { midiOutput.send([0xB0 + ch, 120, 0]); midiOutput.send([0xB0 + ch, 121, 0]); } } // All Sound Off, Reset All Controllers
  midiEnabled = origMidiEnabled;
  shapes.forEach(s => { s.currentPitchBend = 8192; s.reverbAmount = 0; s.delayAmount = 0; s.panValue = 64; s.brightnessValue = 64; s.modWheelValue = 0; s.resonanceValue = 0; s.lastSentReverb = -1; s.lastSentDelay = -1; s.lastSentPan = -1; s.lastSentBrightness = -1; s.lastSentModWheel = -1; s.lastSentResonance = -1; });
  updateHUD(); sendAllGlobalStatesOSC(); displayGlobalError("Sistema MIDI Resetado.", 3000); logOSC("SYSTEM", "MIDI Reset", []);
}

// --------------------------------------------------------------------------
// SEÇÃO: CONTROLE OSC (Conexão, Envio, Recebimento, Log, Gravação) (oscController)
// --------------------------------------------------------------------------
function loadOscSettings() { const stored = localStorage.getItem(OSC_SETTINGS_KEY); let loadedHost = location.hostname; let loadedPort = 8080; if (stored) { try { const s = JSON.parse(stored); if (s.host) loadedHost = s.host; if (s.port) loadedPort = parseInt(s.port,10); } catch(e){ loadedHost = location.hostname || "127.0.0.1"; loadedPort = 8080; }} else { loadedHost = location.hostname || "127.0.0.1"; loadedPort = 8080; } OSC_HOST = loadedHost || "127.0.0.1"; OSC_PORT = loadedPort || 8080; if (oscHostInput) oscHostInput.value = OSC_HOST; if (oscPortInput) oscPortInput.value = OSC_PORT; console.log(`OSC Config: ${OSC_HOST}:${OSC_PORT}`); }
function saveOscSettings(host, port) { const newPort = parseInt(port,10); if (isNaN(newPort) || newPort<1 || newPort>65535) { displayGlobalError("Porta OSC inválida.",5000); return false; } if (!host || host.trim()==="") { displayGlobalError("Host OSC vazio.",5000); return false; } const settings = {host:host.trim(), port:newPort}; try { localStorage.setItem(OSC_SETTINGS_KEY, JSON.stringify(settings)); OSC_HOST=settings.host; OSC_PORT=settings.port; console.log(`OSC Salvo: ${OSC_HOST}:${OSC_PORT}`); if(oscHostInput) oscHostInput.value = OSC_HOST; if(oscPortInput) oscPortInput.value = OSC_PORT; if (osc && typeof setupOSC === 'function') setupOSC(); return true; } catch(e) { displayGlobalError("Erro salvar OSC.",5000); return false; } }
function sendOSCMessage(address, ...args) { logDebug(`Enviando OSC: ${address}`, args); if (spectatorModeActive && !address.startsWith('/ping')) return; if (osc && osc.status() === OSC.STATUS.IS_OPEN) { const message = new OSC.Message(address, ...args); try { osc.send(message); } catch (error) { logDebug("Erro ao enviar OSC", { address, args, error }); if (osc.status() !== OSC.STATUS.IS_OPEN && reconnectOSCButton) { reconnectOSCButton.style.display = 'inline-block'; oscStatus = "OSC Erro Envio"; updateHUD(); } } } else { logDebug("OSC não conectado, não foi possível enviar.", { address, args, oscStatus: osc?.status() }); if (reconnectOSCButton && osc && osc.status() !== OSC.STATUS.IS_OPEN) { reconnectOSCButton.style.display = 'inline-block'; } } if (isRecordingOSC && !address.startsWith('/ping')) { recordedOSCSequence.push({ timestamp: performance.now() - recordingStartTime, message: { address: address, args: args } }); } }
function sendOSCHeartbeat() { sendOSCMessage('/ping', Date.now()); }
function setupOSC() { logDebug(`Configurando OSC para ws://${OSC_HOST}:${OSC_PORT}`); if (osc && osc.status() === OSC.STATUS.IS_OPEN) { logDebug("Fechando conexão OSC existente."); osc.close(); } if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; console.log(`Conectando OSC: ws://${OSC_HOST}:${OSC_PORT}`); osc = new OSC({ plugin: new OSC.WebsocketClientPlugin({ host: OSC_HOST, port: OSC_PORT, secure: false }) }); osc.on('open', () => { oscStatus = `OSC Conectado (ws://${OSC_HOST}:${OSC_PORT})`; console.log(oscStatus); logDebug("OSC conectado."); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = setInterval(sendOSCHeartbeat, 5000); sendOSCHeartbeat(); sendAllGlobalStatesOSC(); if (reconnectOSCButton) reconnectOSCButton.style.display = 'none'; updateHUD(); }); osc.on('close', (event) => { oscStatus = "OSC Desconectado"; logDebug("OSC desconectado.", event); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); }); osc.on('error', (err) => { oscStatus = "OSC Erro Conexão"; logDebug("OSC Erro Conexão.", err); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); }); osc.on('message', (msg) => { logDebug("OSC Mensagem recebida (bruta):", msg); try { let pMsg = msg; if (msg.args && msg.args.length > 0 && typeof msg.args[0] === 'string') { try { const pJson = JSON.parse(msg.args[0]); if (pJson.type === "confirmation" || (pJson.address && pJson.args)) { pMsg = pJson; logDebug("OSC Mensagem (após parse JSON de args[0]):", pMsg); } } catch (e) { /* não era JSON, ignora */ } } if (pMsg && pMsg.address) { logOSC("IN (UDP)", pMsg.address, pMsg.args); handleIncomingExternalOSC(pMsg); } else { logDebug("Mensagem OSC recebida ignorada (sem endereço após processamento):", pMsg); } } catch (e) { logDebug("Erro ao processar mensagem OSC recebida:", { error: e, originalMessage: msg }); } }); try { osc.open(); } catch (error) { oscStatus = `OSC Falha: ${error.message}`; logDebug("Falha ao abrir conexão OSC.", error); if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); } osc.on('/global/setExternalBPM', msg => { /* ... (implementação futura) */ }); osc.on('/global/setScale', msg => { /* ... (implementação futura) */ }); }
function handleIncomingExternalOSC(oscMessage) { logDebug("Processando OSC Externo:", oscMessage); /* ... (implementação futura para controle externo) */ }
function sendAllGlobalStatesOSC() { if (spectatorModeActive) return; logDebug("Enviando todos os estados globais via OSC."); sendOSCMessage('/global/state/midiEnabled', midiEnabled?1:0); sendOSCMessage('/global/state/internalAudioEnabled', internalAudioEnabled?1:0); sendOSCMessage('/global/state/pulseMode', pulseModeActive?1:0); sendOSCMessage('/global/state/staccatoMode', staccatoModeActive?1:0); sendOSCMessage('/global/state/operationMode', operationMode); sendOSCMessage('/global/state/currentScale', currentScaleName); sendOSCMessage('/global/state/currentNoteMode', currentNoteMode); sendOSCMessage('/global/state/arpeggioStyle', currentArpeggioStyle); sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM); /* ... e outros estados relevantes ... */ }
function logOSC(source, address, args, isSeparator = false) { if (oscLogTextarea) { if (isSeparator) { oscLogTextarea.value += `--- Log Separator (${new Date().toLocaleTimeString()}) ---\n`; lastLogSource = "SEPARATOR"; oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight; return; } const timestamp = new Date().toLocaleTimeString(); let sourcePrefix = "SYS"; switch(source.toUpperCase()){ case "OUT": sourcePrefix="OUT"; break; case "IN (UDP)": sourcePrefix="UDP"; break; case "MIDI->OSC": sourcePrefix="MIDI"; break; case "LOOP": sourcePrefix="LOOP"; break; case "PANEL": sourcePrefix="PANEL"; break; case "REC INFO": sourcePrefix="REC"; break;} if (source.toUpperCase() !== lastLogSource && lastLogSource !== "" && lastLogSource !== "SEPARATOR") oscLogTextarea.value += `-------------------------------------\n`; lastLogSource = source.toUpperCase(); const type = args && args.length > 0 && typeof args[0] === 'object' && args[0].type ? ` (${args.map(a => a.type).join(', ')})` : ''; oscLogTextarea.value += `${timestamp} [${sourcePrefix}] ${address}${type} ${JSON.stringify(args)}\n`; oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight; } }
function exportOSCLog() { if (!oscLogTextarea || !oscLogTextarea.value) { alert("Log OSC vazio."); return; } const blob = new Blob([oscLogTextarea.value], {type: 'text/plain'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`osc_log_${new Date().toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(url); displayGlobalError("Log OSC exportado.", 3000); }
function toggleOSCRecording(){if(spectatorModeActive)return;isRecordingOSC=!isRecordingOSC;if(recordOSCButton)recordOSCButton.classList.toggle('active',isRecordingOSC);if(isRecordingOSC){recordedOSCSequence=[];recordingStartTime=performance.now();if(recordOSCButton)recordOSCButton.textContent="🔴 Gravando";if(playOSCLoopButton)playOSCLoopButton.disabled=true;}else{if(recordOSCButton)recordOSCButton.textContent="⏺️ Gravar OSC";if(playOSCLoopButton)playOSCLoopButton.disabled=recordedOSCSequence.length===0;if(recordedOSCSequence.length>0)logOSC("REC INFO",`Gravadas ${recordedOSCSequence.length} msgs. Duração: ${(recordedOSCSequence[recordedOSCSequence.length-1].timestamp/1000).toFixed(2)}s`,[]); } updateHUD();}
function playRecordedOSCLoop(){if(spectatorModeActive||recordedOSCSequence.length===0||isRecordingOSC)return;isPlayingOSCLoop=!isPlayingOSCLoop;if(playOSCLoopButton)playOSCLoopButton.classList.toggle('active',isPlayingOSCLoop);if(isPlayingOSCLoop){if(playOSCLoopButton)playOSCLoopButton.textContent="⏹️ Parar Loop";if(recordOSCButton)recordOSCButton.disabled=true;oscLoopDuration=parseInt(oscLoopDurationInput.value)||5000;playbackStartTime=performance.now();let currentPlaybackIndex=0;function loopStep(){if(!isPlayingOSCLoop)return;const elapsedTimeInLoop=(performance.now()-playbackStartTime)%oscLoopDuration;if(currentPlaybackIndex>0&&elapsedTimeInLoop<recordedOSCSequence[Math.max(0,currentPlaybackIndex-1)].timestamp)currentPlaybackIndex=0;while(currentPlaybackIndex<recordedOSCSequence.length&&recordedOSCSequence[currentPlaybackIndex].timestamp<=elapsedTimeInLoop){const item=recordedOSCSequence[currentPlaybackIndex];const tempIsRec=isRecordingOSC;isRecordingOSC=false;if(osc&&osc.status()===OSC.STATUS.IS_OPEN)osc.send(new OSC.Message(item.message.address,...item.message.args));isRecordingOSC=tempIsRec;logOSC("LOOP",item.message.address,item.message.args);currentPlaybackIndex++;} if(currentPlaybackIndex>=recordedOSCSequence.length&&recordedOSCSequence.length>0&&oscLoopDuration>recordedOSCSequence[recordedOSCSequence.length-1].timestamp)currentPlaybackIndex=0;playbackLoopIntervalId=requestAnimationFrame(loopStep);} playbackLoopIntervalId=requestAnimationFrame(loopStep);}else{if(playbackLoopIntervalId)cancelAnimationFrame(playbackLoopIntervalId);if(playOSCLoopButton)playOSCLoopButton.textContent="▶️ Loop OSC";if(recordOSCButton)recordOSCButton.disabled=false;} updateHUD();}

// --------------------------------------------------------------------------
// SEÇÃO: GERENCIAMENTO DE PRESETS DE FORMAS (presetManager)
// --------------------------------------------------------------------------
function getShapeState(shape) { return { radius: shape.radius, sides: shape.sides, reverbAmount: shape.reverbAmount, delayAmount: shape.delayAmount, panValue: shape.panValue, brightnessValue: shape.brightnessValue, modWheelValue: shape.modWheelValue, resonanceValue: shape.resonanceValue, }; }
function applyShapeState(shape, state) { if (!state) return; shape.radius = state.radius !== undefined ? state.radius : shape.radius; shape.sides = state.sides !== undefined ? state.sides : shape.sides; /* ... mais parâmetros se necessário ... */ if (state.sides !== undefined) { if(shape.currentEdgeIndex >= shape.sides) shape.currentEdgeIndex = Math.max(0, shape.sides-1); turnOffAllActiveNotesForShape(shape); } updateHUD(); }
function saveShapePreset() { if (spectatorModeActive) return; const presetName = presetNameInput.value.trim(); if (!presetName) { alert("Insira nome para preset."); return; } const selectedShapeIndex = parseInt(shapeToPresetSelect.value,10); if (isNaN(selectedShapeIndex) || selectedShapeIndex<0 || selectedShapeIndex>=shapes.length) return; const shape = shapes[selectedShapeIndex]; const shapeState = getShapeState(shape); if (!shapePresets[presetName]) shapePresets[presetName] = {}; shapePresets[presetName][`shape${selectedShapeIndex}`] = shapeState; localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(shapePresets)); populateSavedPresetsSelect(); savedPresetsSelect.value = presetName; displayGlobalError(`Preset '${presetName}' salvo.`,3000); }
function loadShapePreset() { if (spectatorModeActive) return; const presetName = savedPresetsSelect.value; if (!presetName || !shapePresets[presetName]) return; const selectedShapeIndex = parseInt(shapeToPresetSelect.value,10); if (isNaN(selectedShapeIndex) || selectedShapeIndex<0 || selectedShapeIndex>=shapes.length) return; const presetData = shapePresets[presetName]; const shapeStateToApply = presetData[`shape${selectedShapeIndex}`]; if (shapeStateToApply) { applyShapeState(shapes[selectedShapeIndex], shapeStateToApply); presetNameInput.value = presetName; displayGlobalError(`Preset '${presetName}' carregado.`,3000); } }
function deleteSelectedPreset() { if (spectatorModeActive) return; const presetName = savedPresetsSelect.value; if (!presetName || !shapePresets[presetName]) return; if (confirm(`Deletar '${presetName}'?`)) { delete shapePresets[presetName]; localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(shapePresets)); populateSavedPresetsSelect(); presetNameInput.value = ""; displayGlobalError(`Preset '${presetName}' deletado.`,3000); } }
function populateSavedPresetsSelect() { if (!savedPresetsSelect) return; const currentSelection = savedPresetsSelect.value; savedPresetsSelect.innerHTML = ''; Object.keys(shapePresets).sort().forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; savedPresetsSelect.appendChild(option); }); if (shapePresets[currentSelection]) savedPresetsSelect.value = currentSelection; else if (savedPresetsSelect.options.length > 0) savedPresetsSelect.selectedIndex = 0; presetNameInput.value = (savedPresetsSelect.value && shapePresets[savedPresetsSelect.value]) ? savedPresetsSelect.value : ""; }
function exportAllPresets() { if (Object.keys(shapePresets).length === 0) { alert("Nenhum preset."); return; } const jsonString = JSON.stringify(shapePresets, null, 2); const blob = new Blob([jsonString],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `midiShapePresets_v54_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); displayGlobalError("Presets exportados.",3000); }
function importAllPresets() { if (!spectatorModeActive) importPresetFileInput.click(); }
function handleImportPresetFile(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const imported = JSON.parse(e.target.result); if (typeof imported !== 'object' || imported === null) throw new Error("JSON inválido."); let imp=0,ovr=0; for(const pN in imported){if(shapePresets[pN])ovr++;else imp++; shapePresets[pN]=imported[pN];} localStorage.setItem(PRESETS_STORAGE_KEY,JSON.stringify(shapePresets)); populateSavedPresetsSelect(); displayGlobalError(`Importados. Novos:${imp}, Sobrescritos:${ovr}.`,5000); } catch (error) { alert(`Erro importar: ${error.message}`);} finally {importPresetFileInput.value='';} }; reader.readAsText(file); }
function loadPresetsFromStorage() { const stored = localStorage.getItem(PRESETS_STORAGE_KEY); if (stored) { try { shapePresets = JSON.parse(stored); } catch (e) { shapePresets = {}; localStorage.removeItem(PRESETS_STORAGE_KEY); } } else shapePresets = {}; populateSavedPresetsSelect(); }
function populateShapeToPresetSelect() { if (!shapeToPresetSelect) return; shapeToPresetSelect.innerHTML = ''; shapes.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `Forma ${i + 1}`; shapeToPresetSelect.appendChild(o); }); if (shapes.length > 0) shapeToPresetSelect.value = "0"; }
function initPresetManager() { loadPresetsFromStorage(); populateShapeToPresetSelect(); if (shapePresetButton) shapePresetButton.addEventListener('click', () => {if(shapePresetModal) shapePresetModal.style.display = 'flex'; populateSavedPresetsSelect(); if (savedPresetsSelect.value) presetNameInput.value = savedPresetsSelect.value;}); if (closeShapePresetModalButton) closeShapePresetModalButton.addEventListener('click', () => {if(shapePresetModal) shapePresetModal.style.display = 'none';}); if (saveShapePresetButton) saveShapePresetButton.addEventListener('click', saveShapePreset); if (loadShapePresetButton) loadShapePresetButton.addEventListener('click', loadShapePreset); if (deleteSelectedPresetButton) deleteSelectedPresetButton.addEventListener('click', deleteSelectedPreset); if (exportAllPresetsButton) exportAllPresetsButton.addEventListener('click', exportAllPresets); if (importAllPresetsButton) importAllPresetsButton.addEventListener('click', importAllPresets); if (importPresetFileInput) importPresetFileInput.addEventListener('change', handleImportPresetFile); if (savedPresetsSelect) savedPresetsSelect.addEventListener('change', () => { if (savedPresetsSelect.value) presetNameInput.value = savedPresetsSelect.value; }); }

// --------------------------------------------------------------------------
// SEÇÃO: CONTROLE DE TEMAS (Claro/Escuro) (themeController)
// --------------------------------------------------------------------------
function applyTheme(theme) { document.body.classList.remove('theme-dark','theme-light'); document.body.classList.add(theme); currentTheme = theme; if (themeToggleButton) themeToggleButton.textContent = theme === 'theme-dark' ? '🌙' : '☀️'; }
function toggleTheme() { if(spectatorModeActive) return; const newTheme = currentTheme === 'theme-dark' ? 'theme-light' : 'theme-dark'; applyTheme(newTheme); localStorage.setItem(THEME_STORAGE_KEY, newTheme); logOSC("SYSTEM","Tema Alterado",[newTheme]); }
function loadTheme() { const savedTheme = localStorage.getItem(THEME_STORAGE_KEY); applyTheme((savedTheme && (savedTheme==='theme-dark'||savedTheme==='theme-light')) ? savedTheme : 'theme-dark'); }

// --------------------------------------------------------------------------
// SEÇÃO: SIMULAÇÃO DE GESTOS (Modo Desenvolvedor) (gestureSimulator)
// --------------------------------------------------------------------------
function generateMockLandmarks(hand="Right",shapeCenterX,shapeCenterY){const landmarks=[];const time=performance.now()/1000;const wristX=(canvasElement.width-shapeCenterX)/canvasElement.width+Math.sin(time*0.5+(hand==="Left"?Math.PI:0))*0.05;const wristY=shapeCenterY/canvasElement.height+Math.cos(time*0.5+(hand==="Left"?Math.PI:0))*0.05;landmarks.push({x:wristX,y:wristY,z:0});const fingerBaseRadius=0.08;const fingerTipRadiusVariance=0.02;const thumbAngle=Math.PI*1.5+Math.sin(time*1.2+(hand==="Left"?0.5:0))*0.3;landmarks[4]={x:wristX+(fingerBaseRadius+Math.cos(time*1.5)*fingerTipRadiusVariance)*Math.cos(thumbAngle),y:wristY+(fingerBaseRadius+Math.cos(time*1.5)*fingerTipRadiusVariance)*Math.sin(thumbAngle)*(canvasElement.width/canvasElement.height),z:0.01};const indexAngle=Math.PI*1.8+Math.cos(time*1.0+(hand==="Left"?0.7:0.2))*0.4;landmarks[8]={x:wristX+(fingerBaseRadius+0.02+Math.sin(time*1.7)*fingerTipRadiusVariance)*Math.cos(indexAngle),y:wristY+(fingerBaseRadius+0.02+Math.sin(time*1.7)*fingerTipRadiusVariance)*Math.sin(indexAngle)*(canvasElement.width/canvasElement.height),z:0.02};landmarks[12]={x:wristX+fingerBaseRadius*0.9,y:wristY-fingerBaseRadius*0.5,z:0.03};landmarks[16]={x:wristX+fingerBaseRadius*0.8,y:wristY-fingerBaseRadius*0.6,z:0.02};landmarks[20]={x:wristX+fingerBaseRadius*0.7,y:wristY-fingerBaseRadius*0.7,z:0.01};for(let i=0;i<21;i++){if(!landmarks[i]){if(i>0&&landmarks[i-1])landmarks[i]={...landmarks[i-1],z:landmarks[i-1].z+0.005};else if(landmarks[0])landmarks[i]={...landmarks[0],z:landmarks[0].z+i*0.005};else landmarks[i]={x:0.5,y:0.5,z:0.05};}} return landmarks;}
function runGestureSimulation(){if(!gestureSimulationActive)return;const results={multiHandLandmarks:[],multiHandedness:[]};if(operationMode==='one_person'||operationMode==='two_persons'){results.multiHandLandmarks.push(generateMockLandmarks("Right",shapes[0].centerX,shapes[0].centerY));results.multiHandedness.push({score:0.9,index:0,label:"Right"});if(operationMode==='one_person'){results.multiHandLandmarks.push(generateMockLandmarks("Left",shapes[0].centerX-150,shapes[0].centerY));results.multiHandedness.push({score:0.9,index:1,label:"Left"});}else if(operationMode==='two_persons'&&shapes.length>1){results.multiHandLandmarks.push(generateMockLandmarks("Left",shapes[1].centerX,shapes[1].centerY));results.multiHandedness.push({score:0.9,index:1,label:"Left"});}} onResults(results);} // Chama onResults com dados simulados
function toggleGestureSimulation(){if(spectatorModeActive){displayGlobalError("Simulação indisponível em modo espectador.",3000);return;} gestureSimulationActive=!gestureSimulationActive;if(gestureSimToggleButton){gestureSimToggleButton.textContent=gestureSimulationActive?"🤖 Sim ON":"🤖 Sim OFF";gestureSimToggleButton.classList.toggle('active',gestureSimulationActive);} if(gestureSimulationActive){if(cameraError)console.log("Simulação ATIVADA (câmera erro).");else console.log("Simulação ATIVADA.");if(gestureSimIntervalId)clearInterval(gestureSimIntervalId);gestureSimIntervalId=setInterval(runGestureSimulation,GESTURE_SIM_INTERVAL);}else{console.log("Simulação DESATIVADA.");if(gestureSimIntervalId){clearInterval(gestureSimIntervalId);gestureSimIntervalId=null;} shapes.forEach(s=>{s.leftHandLandmarks=null;s.rightHandLandmarks=null;s.activeGesture=null;});} updateHUD();logOSC("SYSTEM","Simulação Gestos",[gestureSimulationActive?"ON":"OFF"]);}

// --------------------------------------------------------------------------
// SEÇÃO: CONTROLE DA INTERFACE DO USUÁRIO (UI) (uiController)
// --------------------------------------------------------------------------

// --- Controle das Sidebars (sidebarLeftUI, sidebarRightUI) ---
function setupSidebarEventListeners() {
    // Sidebar Esquerda
    if (sidebar && sidebarHandle) {
        sidebarHandle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = sidebar.classList.toggle('open');
            sidebarHandle.textContent = isOpen ? '←' : '☰';
            // Não salva estado da sidebar esquerda, é apenas visual
        });
        document.addEventListener('click', (event) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && event.target !== sidebarHandle) {
                sidebar.classList.remove('open');
                sidebarHandle.textContent = '☰';
            }
        });
        sidebar.addEventListener('click', (event) => event.stopPropagation() );
    }

    // Sidebar Direita (Synth Controls)
    if (synthControlsSidebar && synthSidebarHandle) {
        // Carregar estado salvo ou definir padrão (fechado)
        const isSynthPanelInitiallyHidden = loadPersistentSetting(SYNTH_PANEL_HIDDEN_KEY, true); // true = hidden by default
        if (!isSynthPanelInitiallyHidden) {
            synthControlsSidebar.classList.add('open');
            synthSidebarHandle.textContent = '→'; // Ícone de fechar
            if(toggleSynthPanelButton) toggleSynthPanelButton.classList.add('active');
        } else {
            synthControlsSidebar.classList.remove('open');
            synthSidebarHandle.textContent = '🎛️'; // Ícone de abrir
            if(toggleSynthPanelButton) toggleSynthPanelButton.classList.remove('active');
        }

        synthSidebarHandle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = synthControlsSidebar.classList.toggle('open');
            synthSidebarHandle.textContent = isOpen ? '→' : '🎛️';
            savePersistentSetting(SYNTH_PANEL_HIDDEN_KEY, !isOpen);
            if (toggleSynthPanelButton) toggleSynthPanelButton.classList.toggle('active', isOpen);
            logOSC("SYSTEM", "Painel Synth (Direito) Alternado", [isOpen ? "Mostrando" : "Ocultando"]);
        });

        // Sincronizar com o botão da sidebar esquerda (toggleSynthPanelButton)
        if (toggleSynthPanelButton) {
            toggleSynthPanelButton.addEventListener('click', () => {
                // Não precisa de event.stopPropagation() aqui pois é um botão de controle
                const isOpen = synthControlsSidebar.classList.toggle('open');
                synthSidebarHandle.textContent = isOpen ? '→' : '🎛️';
                toggleSynthPanelButton.classList.toggle('active', isOpen);
                savePersistentSetting(SYNTH_PANEL_HIDDEN_KEY, !isOpen);
                logOSC("SYSTEM", "Painel Synth (Esquerdo) Alternado", [isOpen ? "Mostrando" : "Ocultando"]);
            });
        }
        // Não adicionar fechamento ao clicar fora para a sidebar direita,
        // pois ela já tem um botão de handle dedicado e um botão na outra sidebar.
        // Isso evita comportamentos inesperados se o usuário clicar em um modal, por exemplo.
        synthControlsSidebar.addEventListener('click', (event) => event.stopPropagation() );

    } else {
        console.warn("Elementos da sidebar do synth (direita ou handle) não encontrados.");
    }
}

// --- Controle de Modais (modalUI) ---
function setupModalEventListeners() {
    if (infoButtonElement && infoModal) infoButtonElement.addEventListener('click', () => { infoModal.style.display = 'flex'; });
    if (closeModalButton && infoModal) closeModalButton.addEventListener('click', () => { infoModal.style.display = 'none'; });

    if (settingsButton && settingsModal) settingsButton.addEventListener('click', () => { settingsModal.style.display = 'flex'; updateModalSynthControls(); });
    if (closeSettingsModalButton && settingsModal) closeSettingsModalButton.addEventListener('click', () => { settingsModal.style.display = 'none'; });

    if (oscConfigButton && oscConfigModal) { oscConfigButton.addEventListener('click', () => { oscHostInput.value = OSC_HOST; oscPortInput.value = OSC_PORT; oscConfigModal.style.display = 'flex'; }); }
    if (closeOscConfigModalButton && oscConfigModal) closeOscConfigModalButton.addEventListener('click', () => { oscConfigModal.style.display = 'none'; }); // Close button on OSC Config Modal
    if(closeOscConfigModalBtnGeneric && oscConfigModal) closeOscConfigModalBtnGeneric.addEventListener('click', () => oscConfigModal.style.display = 'none'); // Generic close button in OSC Config Modal

    if (arpeggioSettingsButton && arpeggioSettingsModal) arpeggioSettingsButton.addEventListener('click', () => { arpeggioSettingsModal.style.display = 'flex'});
    if (closeArpeggioSettingsModalButton && arpeggioSettingsModal) closeArpeggioSettingsModalButton.addEventListener('click', () => { arpeggioSettingsModal.style.display = 'none'});

    // O oscControlModal é geralmente aberto a partir do oscConfigModal, não diretamente por um botão principal.
    // No entanto, o botão de fechar dele precisa ser configurado.
    if (closeOscControlModalButton && oscControlModal) closeOscControlModalButton.addEventListener('click', () => { oscControlModal.style.display = 'none'});

    // Fechar modais ao clicar no overlay
    window.addEventListener('click', (event) => { if (event.target.classList.contains('modal-overlay')) event.target.style.display = 'none'; });
}

// --- Controle do HUD (hudUI) ---
function setupHudEventListeners() {
    if (infoHudButton && hudElement) {
        infoHudButton.addEventListener('click', () => {
            const isHidden = hudElement.classList.toggle('hidden');
            infoHudButton.textContent = isHidden ? "ℹ️ Mostrar HUD" : "ℹ️ Ocultar HUD";
            infoHudButton.classList.toggle('active', !isHidden);
            if (!isHidden) updateHUD(); // Atualiza o HUD se estiver sendo mostrado
        });
        // Estado inicial do botão do HUD
        if (hudElement.classList.contains('hidden')) { infoHudButton.textContent = "ℹ️ Mostrar HUD"; infoHudButton.classList.remove('active'); }
        else { infoHudButton.textContent = "ℹ️ Ocultar HUD"; infoHudButton.classList.add('active'); }
    }
}

// --- Atualização do HUD (hudUI) ---
function updateHUD() {
  if (!hudElement) { logDebug("Elemento HUD não encontrado."); return; }
  if (hudElement.classList.contains('hidden')) { let textSpan = hudElement.querySelector('span#hudTextContent'); if (textSpan) { textSpan.innerHTML = ""; } return; }
  let txt = "";
  if (spectatorModeActive) txt += `<b>👓 MODO ESPECTADOR</b><br>`;
  const currentAudioCtx = getAudioContext(); const audioIcon = internalAudioEnabled && currentAudioCtx && currentAudioCtx.state === 'running' ? '🟢' : '🔴';
  const currentSimpleSynth = getSimpleSynthInstance(); const audioStatusText = internalAudioEnabled && currentAudioCtx && currentAudioCtx.state === 'running' ? (currentSimpleSynth?.waveform || 'ON') : 'OFF';
  const audioStatusClass = internalAudioEnabled && currentAudioCtx && currentAudioCtx.state === 'running' ? 'status-ok' : 'status-error';
  txt += `Áudio: ${audioIcon} <span class="${audioStatusClass}">${audioStatusText}</span> | `;
  const midiStatusIcon = midiAccess && midiOutput ? '🟢' : '🔴';
  txt += `MIDI: ${midiStatusIcon} <span class="${midiAccess && midiOutput ? 'status-ok':'status-error'}">${midiEnabled && midiOutput ? (midiOutput.name || 'ON') : 'OFF'}</span> | `;
  const oscConnected = osc && osc.status() === OSC.STATUS.IS_OPEN; const oscStatusIcon = oscConnected ? '🟢' : (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? '🟠' : '🔴');
  txt += `OSC: ${oscStatusIcon} <span class="${oscConnected ? 'status-ok': (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? 'status-warn' : 'status-error')}">${oscStatus}</span><br>`;
  shapes.forEach(s => { txt += `<b>F${s.id+1}:</b> R:${s.radius.toFixed(0)} L:${s.sides===100?"○":s.sides} Gest:${spectatorModeActive?"-":(s.activeGesture||"Nenhum")}<br>`; });
  txt += `<b>Global:</b> Pulso:${pulseModeActive?'ON':'OFF'} Artic:${staccatoModeActive?'Stac':'Leg'} VtxPull:${vertexPullModeActive?'ON':'OFF'}<br>`;
  txt += `&nbsp;&nbsp;Escala:${SCALES[currentScaleName].name} Modo:${currentNoteMode} Acorde:${chordMode} Oper:${operationMode==='one_person'?'1P':'2P'}<br>`;
  if (currentNoteMode === NOTE_MODES.ARPEGGIO) txt += `&nbsp;&nbsp;Arp: ${currentArpeggioStyle} BPM:${arpeggioBPM.toFixed(0)}${externalBPM!==null?'(Ext)':''} Idx:${shapes.map(s=>s.currentEdgeIndex).join('/')}<br>`;
  txt += `&nbsp;&nbsp;DMX Sync:${dmxSyncModeActive?'<span class="status-ok">ON</span>':'OFF'} | MIDI In:${midiFeedbackEnabled?'<span class="status-ok">ON</span>':'OFF'} | Sim:${gestureSimulationActive?'<span class="status-warn">ON</span>':'OFF'}<br>`;
  if (isRecordingOSC) txt += `&nbsp;&nbsp;<span class="status-error">🔴 Gravando OSC</span> (${recordedOSCSequence.length})<br>`;
  if (isPlayingOSCLoop) { const loopProgress = ((performance.now() - playbackStartTime) % oscLoopDuration) / oscLoopDuration; const progressBar = ' ['.padEnd(Math.floor(loopProgress * 10) + 2, '■').padEnd(12, '□') + ']'; txt += `&nbsp;&nbsp;<span class="status-warn">▶️ Loop OSC Ativo${progressBar}</span> (${(oscLoopDuration/1000).toFixed(1)}s)<br>`; }
  else if (recordedOSCSequence.length > 0) txt += `&nbsp;&nbsp;Loop OSC Pronto (${recordedOSCSequence.length} msgs, ${(oscLoopDuration/1000).toFixed(1)}s)<br>`;
  if (cameraError) txt += `<span class="status-error">⚠️ Falha na Câmera.</span><br>`;
  let textSpan = hudElement.querySelector('span#hudTextContent'); if (!textSpan) { textSpan = document.createElement('span'); textSpan.id = 'hudTextContent'; hudElement.prepend(textSpan); }
  textSpan.innerHTML = txt;
  if (reconnectOSCButton && reconnectOSCButton.style.display === 'inline-block' && !hudElement.contains(reconnectOSCButton)) { hudElement.appendChild(reconnectOSCButton); }
  const now = performance.now(); // Envio OSC periódico de estados das formas
  if (!spectatorModeActive && osc && osc.status() === OSC.STATUS.IS_OPEN && (now - lastOscSendTime > OSC_SEND_INTERVAL)) { lastOscSendTime = now; shapes.forEach(s => { const sid = s.id + 1; sendOSCMessage(`/forma/${sid}/radius`, parseFloat(s.radius.toFixed(2))); sendOSCMessage(`/forma/${sid}/sides`, s.sides); /* ... mais envios OSC aqui ... */ }); }
}

// --- Funções de Toggle para Botões da UI (uiToggles) ---
function toggleMidiEnabled(){if(spectatorModeActive)return;midiEnabled=!midiEnabled;midiToggleButton.textContent=midiEnabled?"🎹 MIDI ON":"🎹 MIDI OFF";midiToggleButton.classList.toggle('active',midiEnabled);if(!midiEnabled)turnOffAllActiveNotes();sendOSCMessage('/global/state/midiEnabled',midiEnabled?1:0);updateHUD();saveAllPersistentSettings();}
function toggleOperationMode(){if(spectatorModeActive)return;operationMode=(operationMode==='one_person')?'two_persons':'one_person';/*if(operationModeButton)operationModeButton.textContent=`👤 Modo: ${operationMode==='one_person'?'1P':'2P'}`;*/ shapes.forEach(s=>{s.leftHandLandmarks=null;s.rightHandLandmarks=null;s.activeGesture=null;s.lastSentActiveGesture=null;});turnOffAllActiveNotes();updateHUD();saveAllPersistentSettings(); sendOSCMessage('/global/state/operationMode', operationMode);}
function toggleDMXSync(){if(spectatorModeActive)return;dmxSyncModeActive=!dmxSyncModeActive;syncDMXNotesButton.textContent=`🎶 Sync DMX ${dmxSyncModeActive?'ON':'OFF'}`;syncDMXNotesButton.classList.toggle('active',dmxSyncModeActive);sendOSCMessage('/global/state/dmxSyncMode',dmxSyncModeActive?1:0);updateHUD();saveAllPersistentSettings();}
function toggleMidiFeedback(){if(spectatorModeActive)return;midiFeedbackEnabled=!midiFeedbackEnabled;midiFeedbackToggleButton.textContent=`🎤 MIDI In ${midiFeedbackEnabled?'ON':'OFF'}`;midiFeedbackToggleButton.classList.toggle('active',midiFeedbackEnabled);sendOSCMessage('/global/state/midiFeedbackEnabled',midiFeedbackEnabled?1:0);updateHUD();saveAllPersistentSettings();}
function toggleSpectatorMode(){spectatorModeActive=!spectatorModeActive;spectatorModeButton.textContent=`👓 Espectador ${spectatorModeActive?'ON':'OFF'}`;spectatorModeButton.classList.toggle('active',spectatorModeActive);const controlElements=[midiToggleButton,/*operationModeButton,*/syncDMXNotesButton,midiFeedbackToggleButton,recordOSCButton,playOSCLoopButton,gestureSimToggleButton,infoHudButton, themeToggleButton, internalAudioToggleButton, oscConfigButton, arpeggioSettingsButton, shapePresetButton, settingsButton, noteModeSelect, toggleSynthPanelButton ];if(spectatorModeActive){turnOffAllActiveNotes();if(isRecordingOSC)toggleOSCRecording();if(isPlayingOSCLoop)playRecordedOSCLoop();controlElements.forEach(btn=>{if(btn)btn.disabled=true;});if(arpeggioBPMSlider)arpeggioBPMSlider.disabled=true;if(noteIntervalSlider)noteIntervalSlider.disabled=true;}else{controlElements.forEach(btn=>{if(btn&&btn!==playOSCLoopButton&&btn!==gestureSimToggleButton)btn.disabled=false;});if(playOSCLoopButton)playOSCLoopButton.disabled=recordedOSCSequence.length===0;if(gestureSimToggleButton)gestureSimToggleButton.disabled=false;if(arpeggioBPMSlider&&externalBPM===null)arpeggioBPMSlider.disabled=false;if(noteIntervalSlider&&externalBPM===null)noteIntervalSlider.disabled=false;} updateHUD();}

// --- Popup de Saída (outputPopup) ---
function openPopup(){ /* ... (implementação futura ou remoção se não usado) ... */ }

// --- Manipulador de Teclado (keyboardInput) ---
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
    'A': () => { if (arpeggioSettingsModal) arpeggioSettingsModal.style.display = arpeggioSettingsModal.style.display === 'flex' ? 'none' : 'flex'; },
    'K': () => { if (oscConfigModal) oscConfigModal.style.display = oscConfigModal.style.display === 'flex' ? 'none' : 'flex'; },
    'B': () => { if (shapePresetModal) shapePresetModal.style.display = shapePresetModal.style.display === 'flex' ? 'none' : 'flex'; },
    'V': toggleInternalAudio,
    'D': toggleDMXSync,
    'R': toggleOSCRecording,
    'P': playRecordedOSCLoop,
    'F': toggleMidiFeedback,
    'S': toggleSpectatorMode,
    'T': toggleTheme,
    'Y': () => { if (toggleSynthPanelButton) toggleSynthPanelButton.click(); },
  };
  const key = e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase();
  const mapToUse = e.shiftKey ? correctedShiftActionMap : actionMap;
  if (mapToUse[key]) { e.preventDefault(); mapToUse[key](); }
}

// --------------------------------------------------------------------------
// SEÇÃO: CONTROLE DE ÁUDIO INTERNO (Interface com synth54.js) (internalAudioController)
// --------------------------------------------------------------------------
function toggleInternalAudio() {
  if (spectatorModeActive) return;
  internalAudioEnabled = !internalAudioEnabled;
  if (internalAudioToggleButton) {
    internalAudioToggleButton.textContent = internalAudioEnabled ? "🔊 Áudio ON" : "🔊 Áudio OFF";
    internalAudioToggleButton.classList.toggle('active', internalAudioEnabled);
  }
  const currentSimpleSynth = getSimpleSynthInstance(); // De synth54.js
  if (typeof setInternalAudioEnabledState === "function") { // De synth54.js
      setInternalAudioEnabledState(internalAudioEnabled);
  }
  if (!internalAudioEnabled && currentSimpleSynth) {
    currentSimpleSynth.allNotesOff();
  }
  sendOSCMessage('/global/state/internalAudioEnabled', internalAudioEnabled ? 1 : 0);
  updateHUD();
  saveAllPersistentSettings();
}

// --- Manipulador Centralizado para Controles do Sintetizador (synthControlHandler) ---
function handleSynthControlChange(param, value) {
    if (spectatorModeActive) return;
    const synth = getSimpleSynthInstance(); // De synth54.js
    if (!synth) return;

    switch (param) {
        case 'waveform':
            synth.setWaveform(value);
            if (audioWaveformSelect) audioWaveformSelect.value = value;
            if (scWaveformSelect) scWaveformSelect.value = value;
            break;
        case 'masterVolume':
            synth.setMasterVolume(value);
            if (audioMasterVolumeSlider) audioMasterVolumeSlider.value = value;
            if (audioMasterVolumeValueSpan) audioMasterVolumeValueSpan.textContent = value.toFixed(2);
            if (scMasterVolumeSlider) scMasterVolumeSlider.value = value;
            if (scMasterVolumeValue) scMasterVolumeValue.textContent = value.toFixed(2);
            break;
        // ... (casos para attack, decay, sustain, release, distortion, filter, lfo, delay, reverb) ...
        // (O código completo para todos os parâmetros do synth foi omitido para brevidade, mas segue o mesmo padrão)
        case 'attack': synth.setAttack(value); if(audioAttackSlider)audioAttackSlider.value=value; if(audioAttackValueSpan)audioAttackValueSpan.textContent=`${value.toFixed(3)}s`; if(scAttackSlider)scAttackSlider.value=value; if(scAttackValue)scAttackValue.textContent=`${value.toFixed(3)}s`; break;
        case 'decay': synth.setDecay(value); if(audioDecaySlider)audioDecaySlider.value=value; if(audioDecayValueSpan)audioDecayValueSpan.textContent=`${value.toFixed(3)}s`; if(scDecaySlider)scDecaySlider.value=value; if(scDecayValue)scDecayValue.textContent=`${value.toFixed(3)}s`; break;
        case 'sustain': synth.setSustain(value); if(audioSustainSlider)audioSustainSlider.value=value; if(audioSustainValueSpan)audioSustainValueSpan.textContent=value.toFixed(2); if(scSustainSlider)scSustainSlider.value=value; if(scSustainValue)scSustainValue.textContent=value.toFixed(2); break;
        case 'release': synth.setRelease(value); if(audioReleaseSlider)audioReleaseSlider.value=value; if(audioReleaseValueSpan)audioReleaseValueSpan.textContent=`${value.toFixed(3)}s`; if(scReleaseSlider)scReleaseSlider.value=value; if(scReleaseValue)scReleaseValue.textContent=`${value.toFixed(3)}s`; break;
        case 'distortion': synth.setDistortion(value); if(audioDistortionSlider)audioDistortionSlider.value=value; if(audioDistortionValueSpan)audioDistortionValueSpan.textContent=`${value.toFixed(0)}%`; if(scDistortionSlider)scDistortionSlider.value=value; if(scDistortionValue)scDistortionValue.textContent=`${value.toFixed(0)}%`; break;
        case 'filterCutoff': synth.setFilterCutoff(value); if(audioFilterCutoffSlider)audioFilterCutoffSlider.value=value; if(audioFilterCutoffValueSpan)audioFilterCutoffValueSpan.textContent=`${value.toFixed(0)} Hz`; if(scFilterCutoffSlider)scFilterCutoffSlider.value=value; if(scFilterCutoffValue)scFilterCutoffValue.textContent=`${value.toFixed(0)} Hz`; break;
        case 'filterResonance': synth.setFilterResonance(value); if(audioFilterResonanceSlider)audioFilterResonanceSlider.value=value; if(audioFilterResonanceValueSpan)audioFilterResonanceValueSpan.textContent=value.toFixed(1); if(scFilterResonanceSlider)scFilterResonanceSlider.value=value; if(scFilterResonanceValue)scFilterResonanceValue.textContent=value.toFixed(1); break;
        case 'lfoWaveform': synth.setLfoWaveform(value); if(audioLfoWaveformSelect)audioLfoWaveformSelect.value=value; if(scLfoWaveformSelect)scLfoWaveformSelect.value=value; break;
        case 'lfoRate': synth.setLfoRate(value); if(audioLfoRateSlider)audioLfoRateSlider.value=value; if(audioLfoRateValueSpan)audioLfoRateValueSpan.textContent=`${value.toFixed(1)} Hz`; if(scLfoRateSlider)scLfoRateSlider.value=value; if(scLfoRateValue)scLfoRateValue.textContent=`${value.toFixed(1)} Hz`; break;
        case 'lfoPitchDepth': synth.setLfoPitchDepth(value); if(audioLfoPitchDepthSlider)audioLfoPitchDepthSlider.value=value; if(audioLfoPitchDepthValueSpan)audioLfoPitchDepthValueSpan.textContent=`${value.toFixed(1)} Hz`; if(scLfoPitchDepthSlider)scLfoPitchDepthSlider.value=value; if(scLfoPitchDepthValue)scLfoPitchDepthValue.textContent=`${value.toFixed(1)} Hz`; break;
        case 'lfoFilterDepth': synth.setLfoFilterDepth(value); if(audioLfoFilterDepthSlider)audioLfoFilterDepthSlider.value=value; if(audioLfoFilterDepthValueSpan)audioLfoFilterDepthValueSpan.textContent=`${value.toFixed(0)} Hz`; if(scLfoFilterDepthSlider)scLfoFilterDepthSlider.value=value; if(scLfoFilterDepthValue)scLfoFilterDepthValue.textContent=`${value.toFixed(0)} Hz`; break;
        case 'delayTime': synth.setDelayTime(value); if(audioDelayTimeSlider)audioDelayTimeSlider.value=value; if(audioDelayTimeValueSpan)audioDelayTimeValueSpan.textContent=`${value.toFixed(2)} s`; if(scDelayTimeSlider)scDelayTimeSlider.value=value; if(scDelayTimeValue)scDelayTimeValue.textContent=`${value.toFixed(2)} s`; break;
        case 'delayFeedback': synth.setDelayFeedback(value); if(audioDelayFeedbackSlider)audioDelayFeedbackSlider.value=value; if(audioDelayFeedbackValueSpan)audioDelayFeedbackValueSpan.textContent=value.toFixed(2); if(scDelayFeedbackSlider)scDelayFeedbackSlider.value=value; if(scDelayFeedbackValue)scDelayFeedbackValue.textContent=value.toFixed(2); break;
        case 'delayMix': synth.setDelayMix(value); if(audioDelayMixSlider)audioDelayMixSlider.value=value; if(audioDelayMixValueSpan)audioDelayMixValueSpan.textContent=value.toFixed(2); if(scDelayMixSlider)scDelayMixSlider.value=value; if(scDelayMixValue)scDelayMixValue.textContent=value.toFixed(2); break;
        case 'reverbMix': synth.setReverbMix(value); if(audioReverbMixSlider)audioReverbMixSlider.value=value; if(audioReverbMixValueSpan)audioReverbMixValueSpan.textContent=value.toFixed(2); if(scReverbMixSlider)scReverbMixSlider.value=value; if(scReverbMixValue)scReverbMixValue.textContent=value.toFixed(2); break;
    }
    saveAllPersistentSettings();
    updateHUD();
}

// --- Atualização dos Controles de Synth nos Modais e Sidebar (synthUIUpdater) ---
function updateModalSynthControls() {
    const synth = getSimpleSynthInstance(); if (!synth || !settingsModal || settingsModal.style.display !== 'flex') return;
    if (audioWaveformSelect) audioWaveformSelect.value = synth.waveform;
    if (audioMasterVolumeSlider) audioMasterVolumeSlider.value = synth.masterGainNode.gain.value; if (audioMasterVolumeValueSpan) audioMasterVolumeValueSpan.textContent = synth.masterGainNode.gain.value.toFixed(2);
    // ... (atualização para todos os outros controles do synth no modal)
    if(audioAttackSlider)audioAttackSlider.value=synth.attackTime; if(audioAttackValueSpan)audioAttackValueSpan.textContent=`${synth.attackTime.toFixed(3)}s`;
    if(audioDecaySlider)audioDecaySlider.value=synth.decayTime; if(audioDecayValueSpan)audioDecayValueSpan.textContent=`${synth.decayTime.toFixed(3)}s`;
    if(audioSustainSlider)audioSustainSlider.value=synth.sustainLevel; if(audioSustainValueSpan)audioSustainValueSpan.textContent=synth.sustainLevel.toFixed(2);
    if(audioReleaseSlider)audioReleaseSlider.value=synth.releaseTime; if(audioReleaseValueSpan)audioReleaseValueSpan.textContent=`${synth.releaseTime.toFixed(3)}s`;
    if(audioDistortionSlider)audioDistortionSlider.value=synth.distortionAmount; if(audioDistortionValueSpan)audioDistortionValueSpan.textContent=`${synth.distortionAmount.toFixed(0)}%`;
    if(audioFilterCutoffSlider)audioFilterCutoffSlider.value=synth.filterNode.frequency.value; if(audioFilterCutoffValueSpan)audioFilterCutoffValueSpan.textContent=`${synth.filterNode.frequency.value.toFixed(0)} Hz`;
    if(audioFilterResonanceSlider)audioFilterResonanceSlider.value=synth.filterNode.Q.value; if(audioFilterResonanceValueSpan)audioFilterResonanceValueSpan.textContent=synth.filterNode.Q.value.toFixed(1);
    if(audioLfoWaveformSelect)audioLfoWaveformSelect.value=synth.lfo.type;
    if(audioLfoRateSlider)audioLfoRateSlider.value=synth.lfo.frequency.value; if(audioLfoRateValueSpan)audioLfoRateValueSpan.textContent=`${synth.lfo.frequency.value.toFixed(1)} Hz`;
    if(audioLfoPitchDepthSlider)audioLfoPitchDepthSlider.value=synth.lfoGainPitch.gain.value; if(audioLfoPitchDepthValueSpan)audioLfoPitchDepthValueSpan.textContent=`${synth.lfoGainPitch.gain.value.toFixed(1)} Hz`;
    if(audioLfoFilterDepthSlider)audioLfoFilterDepthSlider.value=synth.lfoGainFilter.gain.value; if(audioLfoFilterDepthValueSpan)audioLfoFilterDepthValueSpan.textContent=`${synth.lfoGainFilter.gain.value.toFixed(0)} Hz`;
    if(audioDelayTimeSlider)audioDelayTimeSlider.value=synth.delayNode.delayTime.value; if(audioDelayTimeValueSpan)audioDelayTimeValueSpan.textContent=`${synth.delayNode.delayTime.value.toFixed(2)} s`;
    if(audioDelayFeedbackSlider)audioDelayFeedbackSlider.value=synth.delayFeedbackGain.gain.value; if(audioDelayFeedbackValueSpan)audioDelayFeedbackValueSpan.textContent=synth.delayFeedbackGain.gain.value.toFixed(2);
    if(audioDelayMixSlider && synth.delayDryGain)audioDelayMixSlider.value=Math.acos(synth.delayDryGain.gain.value)/(0.5*Math.PI); if(audioDelayMixValueSpan && synth.delayDryGain)audioDelayMixValueSpan.textContent=(Math.acos(synth.delayDryGain.gain.value)/(0.5*Math.PI)).toFixed(2);
    if(audioReverbMixSlider && synth.reverbDryGain)audioReverbMixSlider.value=Math.acos(synth.reverbDryGain.gain.value)/(0.5*Math.PI); if(audioReverbMixValueSpan && synth.reverbDryGain)audioReverbMixValueSpan.textContent=(Math.acos(synth.reverbDryGain.gain.value)/(0.5*Math.PI)).toFixed(2);
}

function updateSidebarSynthControls() {
    const synth = getSimpleSynthInstance(); if (!synth || !synthControlsSidebar) return;
    if (scWaveformSelect) scWaveformSelect.value = synth.waveform;
    if (scMasterVolumeSlider) scMasterVolumeSlider.value = synth.masterGainNode.gain.value; if (scMasterVolumeValue) scMasterVolumeValue.textContent = synth.masterGainNode.gain.value.toFixed(2);
    // ... (atualização para todos os outros controles do synth na sidebar)
    if(scAttackSlider)scAttackSlider.value=synth.attackTime; if(scAttackValue)scAttackValue.textContent=`${synth.attackTime.toFixed(3)}s`;
    if(scDecaySlider)scDecaySlider.value=synth.decayTime; if(scDecayValue)scDecayValue.textContent=`${synth.decayTime.toFixed(3)}s`;
    if(scSustainSlider)scSustainSlider.value=synth.sustainLevel; if(scSustainValue)scSustainValue.textContent=synth.sustainLevel.toFixed(2);
    if(scReleaseSlider)scReleaseSlider.value=synth.releaseTime; if(scReleaseValue)scReleaseValue.textContent=`${synth.releaseTime.toFixed(3)}s`;
    if(scDistortionSlider)scDistortionSlider.value=synth.distortionAmount; if(scDistortionValue)scDistortionValue.textContent=`${synth.distortionAmount.toFixed(0)}%`;
    if(scFilterCutoffSlider)scFilterCutoffSlider.value=synth.filterNode.frequency.value; if(scFilterCutoffValue)scFilterCutoffValue.textContent=`${synth.filterNode.frequency.value.toFixed(0)} Hz`;
    if(scFilterResonanceSlider)scFilterResonanceSlider.value=synth.filterNode.Q.value; if(scFilterResonanceValue)scFilterResonanceValue.textContent=synth.filterNode.Q.value.toFixed(1);
    if(scLfoWaveformSelect)scLfoWaveformSelect.value=synth.lfo.type;
    if(scLfoRateSlider)scLfoRateSlider.value=synth.lfo.frequency.value; if(scLfoRateValue)scLfoRateValue.textContent=`${synth.lfo.frequency.value.toFixed(1)} Hz`;
    if(scLfoPitchDepthSlider)scLfoPitchDepthSlider.value=synth.lfoGainPitch.gain.value; if(scLfoPitchDepthValue)scLfoPitchDepthValue.textContent=`${synth.lfoGainPitch.gain.value.toFixed(1)} Hz`;
    if(scLfoFilterDepthSlider)scLfoFilterDepthSlider.value=synth.lfoGainFilter.gain.value; if(scLfoFilterDepthValue)scLfoFilterDepthValue.textContent=`${synth.lfoGainFilter.gain.value.toFixed(0)} Hz`;
    if(scDelayTimeSlider)scDelayTimeSlider.value=synth.delayNode.delayTime.value; if(scDelayTimeValue)scDelayTimeValue.textContent=`${synth.delayNode.delayTime.value.toFixed(2)} s`;
    if(scDelayFeedbackSlider)scDelayFeedbackSlider.value=synth.delayFeedbackGain.gain.value; if(scDelayFeedbackValue)scDelayFeedbackValue.textContent=synth.delayFeedbackGain.gain.value.toFixed(2);
    if(scDelayMixSlider && synth.delayDryGain)scDelayMixSlider.value=Math.acos(synth.delayDryGain.gain.value)/(0.5*Math.PI); if(scDelayMixValue && synth.delayDryGain)scDelayMixValue.textContent=(Math.acos(synth.delayDryGain.gain.value)/(0.5*Math.PI)).toFixed(2);
    if(scReverbMixSlider && synth.reverbDryGain)scReverbMixSlider.value=Math.acos(synth.reverbDryGain.gain.value)/(0.5*Math.PI); if(scReverbMixValue && synth.reverbDryGain)scReverbMixValue.textContent=(Math.acos(synth.reverbDryGain.gain.value)/(0.5*Math.PI)).toFixed(2);
}

// --- Inicialização e Listeners da Sidebar do Sintetizador (synthPanelUI) ---
function initSynthControlsSidebar() {
    synthControlsSidebar = document.getElementById('synthControlsSidebar');
    if (!synthControlsSidebar) { console.error("Synth Control Sidebar element not found!"); return; }

    // Atribuição dos elementos DOM do painel do synth (já feita na seção Elementos DOM)
    // Adicionar listeners
    if (scWaveformSelect) scWaveformSelect.addEventListener('change', (e) => handleSynthControlChange('waveform', e.target.value));
    if (scMasterVolumeSlider) scMasterVolumeSlider.addEventListener('input', (e) => handleSynthControlChange('masterVolume', parseFloat(e.target.value)));
    // ... (listeners para todos os outros controles do synth na sidebar) ...
    if(scAttackSlider)scAttackSlider.addEventListener('input',(e)=>handleSynthControlChange('attack',parseFloat(e.target.value)));
    if(scDecaySlider)scDecaySlider.addEventListener('input',(e)=>handleSynthControlChange('decay',parseFloat(e.target.value)));
    if(scSustainSlider)scSustainSlider.addEventListener('input',(e)=>handleSynthControlChange('sustain',parseFloat(e.target.value)));
    if(scReleaseSlider)scReleaseSlider.addEventListener('input',(e)=>handleSynthControlChange('release',parseFloat(e.target.value)));
    if(scDistortionSlider)scDistortionSlider.addEventListener('input',(e)=>handleSynthControlChange('distortion',parseFloat(e.target.value)));
    if(scFilterCutoffSlider)scFilterCutoffSlider.addEventListener('input',(e)=>handleSynthControlChange('filterCutoff',parseFloat(e.target.value)));
    if(scFilterResonanceSlider)scFilterResonanceSlider.addEventListener('input',(e)=>handleSynthControlChange('filterResonance',parseFloat(e.target.value)));
    if(scLfoWaveformSelect)scLfoWaveformSelect.addEventListener('change',(e)=>handleSynthControlChange('lfoWaveform',e.target.value));
    if(scLfoRateSlider)scLfoRateSlider.addEventListener('input',(e)=>handleSynthControlChange('lfoRate',parseFloat(e.target.value)));
    if(scLfoPitchDepthSlider)scLfoPitchDepthSlider.addEventListener('input',(e)=>handleSynthControlChange('lfoPitchDepth',parseFloat(e.target.value)));
    if(scLfoFilterDepthSlider)scLfoFilterDepthSlider.addEventListener('input',(e)=>handleSynthControlChange('lfoFilterDepth',parseFloat(e.target.value)));
    if(scDelayTimeSlider)scDelayTimeSlider.addEventListener('input',(e)=>handleSynthControlChange('delayTime',parseFloat(e.target.value)));
    if(scDelayFeedbackSlider)scDelayFeedbackSlider.addEventListener('input',(e)=>handleSynthControlChange('delayFeedback',parseFloat(e.target.value)));
    if(scDelayMixSlider)scDelayMixSlider.addEventListener('input',(e)=>handleSynthControlChange('delayMix',parseFloat(e.target.value)));
    if(scReverbMixSlider)scReverbMixSlider.addEventListener('input',(e)=>handleSynthControlChange('reverbMix',parseFloat(e.target.value)));
    if (scBPMSlider) { scBPMSlider.addEventListener('input', (e) => { if (spectatorModeActive || externalBPM !== null) return; arpeggioBPM = parseInt(e.target.value); updateBPMValues(arpeggioBPM); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM); }); }
    if (recordAudioButton) recordAudioButton.addEventListener('click', () => { if (!isAudioRecording) startAudioRecording(); else stopAudioRecording(); });
    if (pauseAudioButton) pauseAudioButton.addEventListener('click', () => { if (!mediaRecorder) return; if (isAudioRecording && !isAudioPaused) { mediaRecorder.pause(); isAudioPaused = true; logOSC("SYSTEM", "Gravação de Áudio Pausada", []); } else if (isAudioRecording && isAudioPaused) { mediaRecorder.resume(); isAudioPaused = false; logOSC("SYSTEM", "Gravação de Áudio Retomada", []); } if (pauseAudioButton) pauseAudioButton.textContent = isAudioPaused ? "▶️ Retomar" : "⏸️ Pausar";});
    if (saveAudioButton) saveAudioButton.addEventListener('click', saveRecordedAudio);

    // Lógica para o botão toggleSynthPanelButton (da sidebar esquerda)
    if (toggleSynthPanelButton && synthControlsSidebar) {
        const isSynthPanelHidden = loadPersistentSetting(SYNTH_PANEL_HIDDEN_KEY, false); // Usa nova chave
        if (isSynthPanelHidden) {
            synthControlsSidebar.style.display = 'none'; // Ou remove classe 'open'
        }
        toggleSynthPanelButton.classList.toggle('active', !isSynthPanelHidden);

        toggleSynthPanelButton.addEventListener('click', () => {
            const isHidden = synthControlsSidebar.style.display === 'none';
            synthControlsSidebar.style.display = isHidden ? 'block' : 'none';
            toggleSynthPanelButton.classList.toggle('active', isHidden);
            savePersistentSetting(SYNTH_PANEL_HIDDEN_KEY, !isHidden);
            logOSC("SYSTEM", "Painel Synth Alternado (Botão Esquerdo)", [isHidden ? "Mostrando" : "Ocultando"]);
        });
    } else { console.warn("toggleSynthPanelButton ou synthControlsSidebar não encontrado no initSynthControlsSidebar."); }

    updateSidebarSynthControls(); // Popula com valores iniciais
    console.log("Synth Control Sidebar initialized.");
}

// --------------------------------------------------------------------------
// SEÇÃO: PERSISTÊNCIA DE DADOS (localStorage) (settingsPersistence)
// --------------------------------------------------------------------------
function savePersistentSetting(key,value){try{const s=JSON.parse(localStorage.getItem(APP_SETTINGS_KEY))||{};s[key]=value;localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(s));}catch(e){console.error("Erro ao salvar configuração:", key, value, e);}}
function loadPersistentSetting(key,defaultValue){try{const s=JSON.parse(localStorage.getItem(APP_SETTINGS_KEY))||{};return s[key]!==undefined?s[key]:defaultValue;}catch(e){console.error("Erro ao carregar configuração:", key, e);return defaultValue;}}
function saveAllPersistentSettings(){
  savePersistentSetting('operationMode',operationMode);
  savePersistentSetting('midiEnabled',midiEnabled);
  savePersistentSetting('internalAudioEnabled', internalAudioEnabled);
  const currentSimpleSynth = getSimpleSynthInstance();
  if(currentSimpleSynth) {
    savePersistentSetting('audioWaveform', currentSimpleSynth.waveform);
    savePersistentSetting('audioMasterVolume', currentSimpleSynth.masterGainNode.gain.value);
    savePersistentSetting('audioAttack', currentSimpleSynth.attackTime);
    savePersistentSetting('audioDecay', currentSimpleSynth.decayTime);
    savePersistentSetting('audioSustain', currentSimpleSynth.sustainLevel);
    savePersistentSetting('audioRelease', currentSimpleSynth.releaseTime);
    savePersistentSetting('audioDistortion', currentSimpleSynth.distortionAmount);
    if (currentSimpleSynth.filterNode) { savePersistentSetting('audioFilterCutoff', currentSimpleSynth.filterNode.frequency.value); savePersistentSetting('audioFilterResonance', currentSimpleSynth.filterNode.Q.value); }
    if (currentSimpleSynth.lfo) { savePersistentSetting('lfoWaveform', currentSimpleSynth.lfo.type); savePersistentSetting('lfoRate', currentSimpleSynth.lfo.frequency.value); savePersistentSetting('lfoPitchDepth', currentSimpleSynth.lfoGainPitch.gain.value); savePersistentSetting('lfoFilterDepth', currentSimpleSynth.lfoGainFilter.gain.value); }
    if (currentSimpleSynth.delayNode) { savePersistentSetting('delayTime', currentSimpleSynth.delayNode.delayTime.value); savePersistentSetting('delayFeedback', currentSimpleSynth.delayFeedbackGain.gain.value); if(currentSimpleSynth.delayDryGain) savePersistentSetting('delayMix', Math.acos(currentSimpleSynth.delayDryGain.gain.value) / (0.5 * Math.PI)); }
    if (currentSimpleSynth.reverbDryGain) { savePersistentSetting('reverbMix', Math.acos(currentSimpleSynth.reverbDryGain.gain.value) / (0.5 * Math.PI)); }
  }
  savePersistentSetting('dmxSyncModeActive',dmxSyncModeActive);
  savePersistentSetting('midiFeedbackEnabled',midiFeedbackEnabled);
  // spectatorModeActive não é persistido intencionalmente
  savePersistentSetting('currentTheme', currentTheme);
  savePersistentSetting('oscLoopDuration', oscLoopDuration);
  savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
  savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
  savePersistentSetting(NOTE_MODE_STORAGE_KEY, currentNoteMode);
  if(synthControlsSidebar) savePersistentSetting(SYNTH_PANEL_HIDDEN_KEY, synthControlsSidebar.style.display === 'none'); // Salva estado do painel do synth
  console.log("Configs V54 salvas no localStorage.");
}
function loadAllPersistentSettings(){
  operationMode = loadPersistentSetting('operationMode','two_persons');
  midiEnabled = loadPersistentSetting('midiEnabled',true);
  internalAudioEnabled = loadPersistentSetting('internalAudioEnabled', true);
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
  spectatorModeActive = false; // Não persistido
  currentTheme = loadPersistentSetting('currentTheme','theme-dark');
  oscLoopDuration = loadPersistentSetting('oscLoopDuration',5000);
  currentNoteMode = loadPersistentSetting(NOTE_MODE_STORAGE_KEY, NOTE_MODES.SEQUENTIAL);

  if (internalAudioToggleButton) { internalAudioToggleButton.textContent = internalAudioEnabled ? "🔊 Áudio ON" : "🔊 Áudio OFF"; internalAudioToggleButton.classList.toggle('active', internalAudioEnabled); }
  if (noteModeSelect) { noteModeSelect.value = currentNoteMode; }

  loadOscSettings();
  loadArpeggioSettings();
  // O estado do painel do synth (synthPanelHidden) é carregado em initSynthControlsSidebar

  console.log("Configs V54 carregadas do localStorage.");
  return {
    savedMidiOutputId: loadPersistentSetting('midiOutputId',null),
    savedMidiInputId: loadPersistentSetting('midiInputId',null),
    audioSettings: { waveform: savedWaveform, masterVolume: savedMasterVolume, attack: savedAttack, decay: savedDecay, sustain: savedSustain, release: savedRelease, distortion: savedDistortion, filterCutoff: savedFilterCutoff, filterResonance: savedFilterResonance, lfoWaveform: savedLfoWaveform, lfoRate: savedLfoRate, lfoPitchDepth: savedLfoPitchDepth, lfoFilterDepth: savedLfoFilterDepth, delayTime: savedDelayTime, delayFeedback: savedDelayFeedback, delayMix: savedDelayMix, reverbMix: savedReverbMix }
  };
}
function saveArpeggioSettings(){const s={currentArpeggioStyle,arpeggioBPM,noteInterval,externalBPM};try{localStorage.setItem(ARPEGGIO_SETTINGS_KEY,JSON.stringify(s));}catch(e){console.error("Erro salvar config arpejo:", e);}}
function loadArpeggioSettings(){ try{ const s=JSON.parse(localStorage.getItem(ARPEGGIO_SETTINGS_KEY)); if(s){ currentArpeggioStyle = s.currentArpeggioStyle || "UP"; arpeggioBPM = parseInt(s.arpeggioBPM, 10) || 120; noteInterval = parseInt(s.noteInterval, 10) || (60000 / arpeggioBPM); /* externalBPM não é persistido */ } }catch(e){} if(arpeggioStyleSelect) arpeggioStyleSelect.value = currentArpeggioStyle; updateBPMValues(arpeggioBPM); }
function updateBPMValues(newBPM) { arpeggioBPM = Math.max(3, Math.min(900, parseInt(newBPM, 10))); noteInterval = Math.round(60000 / arpeggioBPM); if (arpeggioBPMSlider) arpeggioBPMSlider.value = arpeggioBPM; if (arpeggioBPMValueSpan) arpeggioBPMValueSpan.textContent = arpeggioBPM; if (scBPMSlider) scBPMSlider.value = arpeggioBPM; if (scBPMValueSpan) scBPMValueSpan.textContent = arpeggioBPM; if (noteIntervalSlider) { noteIntervalSlider.value = Math.max(parseInt(noteIntervalSlider.min), Math.min(parseInt(noteIntervalSlider.max), noteInterval)); } if (noteIntervalValueSpan) noteIntervalValueSpan.textContent = noteIntervalSlider.value; }
function updateNoteIntervalValues(newInterval) { noteInterval = parseInt(newInterval, 10); let calculatedBPM = Math.round(60000 / noteInterval); arpeggioBPM = Math.max(3, Math.min(900, calculatedBPM)); noteInterval = Math.round(60000 / arpeggioBPM); if (noteIntervalSlider) noteIntervalSlider.value = noteInterval; if (noteIntervalValueSpan) noteIntervalValueSpan.textContent = noteInterval; if (arpeggioBPMSlider) arpeggioBPMSlider.value = arpeggioBPM; if (arpeggioBPMValueSpan) arpeggioBPMValueSpan.textContent = arpeggioBPM; if (scBPMSlider) scBPMSlider.value = arpeggioBPM; if (scBPMValueSpan) scBPMValueSpan.textContent = arpeggioBPM; }
function populateArpeggioStyleSelect(){if(!arpeggioStyleSelect)return;arpeggioStyleSelect.innerHTML='';ARPEGGIO_STYLES.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();arpeggioStyleSelect.appendChild(o);});arpeggioStyleSelect.value=currentArpeggioStyle;}

// --------------------------------------------------------------------------
// SEÇÃO: INICIALIZAÇÃO DA APLICAÇÃO (appInit / main)
// --------------------------------------------------------------------------
function setupGlobalEventListeners() {
    // Combina todos os event listeners em uma função para clareza
    setupSidebarEventListeners();
    setupModalEventListeners();
    setupHudEventListeners();

    // Listeners de botões e controles principais
    if (saveOscConfigButton && oscConfigModal) saveOscConfigButton.addEventListener('click', () => { const newHost = oscHostInput.value.trim(); const newPort = parseInt(oscPortInput.value,10); if(!newHost){alert("IP OSC vazio.");return;} if(isNaN(newPort)||newPort<1||newPort>65535){alert("Porta OSC inválida.");return;} if(saveOscSettings(newHost,newPort)){logOSC("SYSTEM","Config OSC salva",{host:newHost,port:newPort});displayGlobalError(`Config OSC: ${newHost}:${newPort}. Reconectando...`,3000);if(oscConfigModal)oscConfigModal.style.display='none';setupOSC();}});
    if (midiOutputSelect) midiOutputSelect.addEventListener('change', () => { midiOutput = availableMidiOutputs.get(midiOutputSelect.value) || null; turnOffAllActiveNotes(); saveAllPersistentSettings(); });
    if (midiInputSelect) midiInputSelect.addEventListener('change', () => { setMidiInput(availableMidiInputs.get(midiInputSelect.value) || null); saveAllPersistentSettings(); });
    if (arpeggioStyleSelect) arpeggioStyleSelect.addEventListener('change', (e) => { if(spectatorModeActive)return; currentArpeggioStyle = e.target.value; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioStyle', currentArpeggioStyle);});
    if (arpeggioBPMSlider) arpeggioBPMSlider.addEventListener('input', (e) => { if(spectatorModeActive||externalBPM!==null)return; arpeggioBPM = parseInt(e.target.value); updateBPMValues(arpeggioBPM); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM); });
    if (noteIntervalSlider) noteIntervalSlider.addEventListener('input', (e) => { if(spectatorModeActive||externalBPM!==null)return; noteInterval = parseInt(e.target.value); updateNoteIntervalValues(noteInterval); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', Math.round(arpeggioBPM)); });
    if (sendTestOSCButton) sendTestOSCButton.addEventListener('click', () => { const addr = oscAddressInput.value.trim(); const argsStr = oscArgsInput.value.trim(); let args = []; try { if (argsStr.startsWith('[') && argsStr.endsWith(']')) args = JSON.parse(argsStr); else if (argsStr) args = argsStr.split(/\s+/).map(a => isNaN(parseFloat(a)) ? a : parseFloat(a)); if (addr) { sendOSCMessage(addr, ...args); logOSC("PANEL", addr, args); } else alert("Endereço OSC vazio."); } catch(e) { alert("Erro ao parsear argumentos OSC (use JSON Array ou string separada por espaço): "+e.message); } });
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
    if (noteModeSelect) { noteModeSelect.addEventListener('change', (e) => { if (spectatorModeActive) return; currentNoteMode = e.target.value; turnOffAllActiveNotes(); savePersistentSetting(NOTE_MODE_STORAGE_KEY, currentNoteMode); updateHUD(); sendOSCMessage('/global/state/noteMode', currentNoteMode); console.log(`Note Mode alterado para: ${currentNoteMode}`); }); }
    if (internalAudioToggleButton) internalAudioToggleButton.addEventListener('click', toggleInternalAudio);
    // Listeners para controles de áudio no modal de configurações (já cobertos por handleSynthControlChange)
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

    document.addEventListener('keydown', handleKeyPress);
    logDebug("Ouvintes de eventos globais configurados.");
}

window.addEventListener('DOMContentLoaded', () => {
    logDebug("DOM Carregado. Iniciando main54.js...");
    console.log("DOM Carregado. Iniciando main54.js...");
    detectPlatform();
    hasWebGL2 = checkWebGL2Support();
    if (!hasWebGL2) displayGlobalError("Aviso: WebGL2 não disponível.", 15000);

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    initFallbackShapes(); // Para animação se a câmera falhar

    const { savedMidiOutputId, savedMidiInputId, audioSettings } = loadAllPersistentSettings();

    loadTheme(); // Carrega e aplica tema salvo

    initPresetManager(); // Gerenciador de presets de formas
    setupGlobalEventListeners(); // Configura todos os event listeners da UI
    initSynthControlsSidebar(); // Configura listeners e estado inicial do painel do synth

    // Handler para primeiro gesto do usuário para inicializar o AudioContext
    const firstGestureHandler = () => {
        console.log("Primeiro gesto detectado, inicializando áudio via synth54.js...");
        if (typeof initAudioContextOnGesture === "function") { // de synth54.js
            const audioReady = initAudioContextOnGesture();
            if (audioReady) {
                const synthAfterGesture = getSimpleSynthInstance(); // de synth54.js
                if (synthAfterGesture) {
                    // Aplicar configurações de áudio carregadas
                    synthAfterGesture.setMasterVolume(audioSettings.masterVolume);
                    synthAfterGesture.setWaveform(audioSettings.waveform);
                    synthAfterGesture.setAttack(audioSettings.attack);
                    synthAfterGesture.setDecay(audioSettings.decay);
                    synthAfterGesture.setSustain(audioSettings.sustain);
                    synthAfterGesture.setRelease(audioSettings.release);
                    synthAfterGesture.setDistortion(audioSettings.distortion);
                    synthAfterGesture.setFilterCutoff(audioSettings.filterCutoff);
                    synthAfterGesture.setFilterResonance(audioSettings.filterResonance);
                    synthAfterGesture.setLfoWaveform(audioSettings.lfoWaveform);
                    synthAfterGesture.setLfoRate(audioSettings.lfoRate);
                    synthAfterGesture.setLfoPitchDepth(audioSettings.lfoPitchDepth);
                    synthAfterGesture.setLfoFilterDepth(audioSettings.lfoFilterDepth);
                    synthAfterGesture.setDelayTime(audioSettings.delayTime);
                    synthAfterGesture.setDelayFeedback(audioSettings.delayFeedback);
                    synthAfterGesture.setDelayMix(audioSettings.delayMix);
                    synthAfterGesture.setReverbMix(audioSettings.reverbMix);

                    updateModalSynthControls(); // Sincroniza UI do modal
                    updateSidebarSynthControls(); // Sincroniza UI da sidebar do synth
                    console.log("Áudio inicializado/resumido e synth configurado.");
                } else { console.error("Falha ao obter instância do SimpleSynth pós-gesto."); }
                updateHUD();
                document.removeEventListener('click', firstGestureHandler);
                document.removeEventListener('keydown', firstGestureHandler);
            } else { console.warn("initAudioContextOnGesture() não retornou sucesso."); }
        } else { console.error("initAudioContextOnGesture não definida (esperada de synth54.js)."); }
    };
    document.addEventListener('click', firstGestureHandler, { once: false }); // {once: false} para garantir que funcione se o primeiro clique for em um botão que já tem listener
    document.addEventListener('keydown', firstGestureHandler, { once: false });

    // Se o AudioContext já estiver rodando (ex: autoplay permitido), configura o synth
    const currentSynth = getSimpleSynthInstance(); // de synth54.js
    if (currentSynth && getAudioContext()?.state === 'running') { // getAudioContext de synth54.js
        currentSynth.setMasterVolume(audioSettings.masterVolume);
        // ... (aplicar todas as audioSettings ao currentSynth)
        currentSynth.setWaveform(audioSettings.waveform); currentSynth.setAttack(audioSettings.attack); currentSynth.setDecay(audioSettings.decay); currentSynth.setSustain(audioSettings.sustain); currentSynth.setRelease(audioSettings.release); currentSynth.setDistortion(audioSettings.distortion); currentSynth.setFilterCutoff(audioSettings.filterCutoff); currentSynth.setFilterResonance(audioSettings.filterResonance); currentSynth.setLfoWaveform(audioSettings.lfoWaveform); currentSynth.setLfoRate(audioSettings.lfoRate); currentSynth.setLfoPitchDepth(audioSettings.lfoPitchDepth); currentSynth.setLfoFilterDepth(audioSettings.lfoFilterDepth); currentSynth.setDelayTime(audioSettings.delayTime); currentSynth.setDelayFeedback(audioSettings.delayFeedback); currentSynth.setDelayMix(audioSettings.delayMix); currentSynth.setReverbMix(audioSettings.reverbMix);

        updateModalSynthControls(); updateSidebarSynthControls();
        console.log("AudioContext já rodando, synth configurado.");
        document.removeEventListener('click', firstGestureHandler);
        document.removeEventListener('keydown', firstGestureHandler);
    }

    setupOSC(); // Inicializa conexão OSC

    currentCameraDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || null;
    if (currentCameraDeviceId === "null" || currentCameraDeviceId === "undefined") currentCameraDeviceId = null;

    initMidi().then(async () => { // Inicializa MIDI
        if (savedMidiOutputId && availableMidiOutputs.has(savedMidiOutputId)) { if(midiOutputSelect) midiOutputSelect.value = savedMidiOutputId; midiOutput = availableMidiOutputs.get(savedMidiOutputId); }
        else if (availableMidiOutputs.size > 0 && midiOutputSelect) { midiOutputSelect.selectedIndex = 0; midiOutput = availableMidiOutputs.get(midiOutputSelect.value); }
        if (savedMidiInputId && availableMidiInputs.has(savedMidiInputId)) { if(midiInputSelect) midiInputSelect.value = savedMidiInputId; setMidiInput(availableMidiInputs.get(savedMidiInputId)); }
        else if (availableMidiInputs.size > 0 && midiInputSelect) { midiInputSelect.selectedIndex = 0; setMidiInput(availableMidiInputs.get(midiInputSelect.value)); }
        savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
        savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
        await populateCameraSelect();
        initializeCamera(currentCameraDeviceId); // Inicializa câmera
    }).catch(err => { console.error("Erro MIDI/Câmera init:", err); populateCameraSelect().then(() => initializeCamera(currentCameraDeviceId)); });

    populateArpeggioStyleSelect(); // Popula select de estilo de arpejo
    if(oscLoopDurationInput) oscLoopDurationInput.value = oscLoopDuration;
    if(hudElement) hudElement.classList.remove('hidden'); // Mostra HUD
    if(infoHudButton && hudElement && !hudElement.classList.contains('hidden')) { infoHudButton.textContent = "ℹ️ Ocultar HUD"; infoHudButton.classList.add('active'); }

    updateHUD(); // Atualiza HUD com informações iniciais
    sendAllGlobalStatesOSC(); // Envia estados iniciais para OSC

  if (oscLogTextarea) oscLogTextarea.value = `Log OSC - ${new Date().toLocaleTimeString()} - Configs Carregadas (v54).\n`;
  console.log("Iniciando loop de animação (v54) e finalizando DOMContentLoaded.");
  animationLoop(); // Inicia loop principal de animação/renderização
});


// --------------------------------------------------------------------------
// SEÇÃO: GRAVAÇÃO DE ÁUDIO (audioRecording)
// --------------------------------------------------------------------------
function startAudioRecording() {
    const currentSimpleSynth = getSimpleSynthInstance(); const currentAudioCtx = getAudioContext();
    if (!currentSimpleSynth || !currentSimpleSynth.masterGainNode || !currentAudioCtx) { displayGlobalError("Sintetizador ou contexto de áudio não inicializado.", 5000); return; }
    if (currentAudioCtx.state === 'suspended') { displayGlobalError("Contexto de áudio suspenso. Interaja com a página primeiro.", 5000); return; }
    try {
        const destinationNode = currentAudioCtx.createMediaStreamDestination();
        currentSimpleSynth.masterGainNode.connect(destinationNode);
        const options = { mimeType: 'audio/webm; codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) { options.mimeType = 'audio/ogg; codecs=opus'; if (!MediaRecorder.isTypeSupported(options.mimeType)) { options.mimeType = 'audio/webm'; if (!MediaRecorder.isTypeSupported(options.mimeType)) { console.error("Nenhum tipo MIME suportado para MediaRecorder."); displayGlobalError("Gravação de áudio não suportada.", 7000); currentSimpleSynth.masterGainNode.disconnect(destinationNode); return; } } }
        console.log(`Usando mimeType: ${options.mimeType}`);
        mediaRecorder = new MediaRecorder(destinationNode.stream, options);
        mediaRecorder.ondataavailable = event => { if (event.data.size > 0) audioChunks.push(event.data); };
        mediaRecorder.onstart = () => { audioChunks = []; isAudioRecording = true; isAudioPaused = false; if (recordAudioButton) {recordAudioButton.textContent = "⏹️ Parar Gravação"; recordAudioButton.classList.add('active');} if (pauseAudioButton) {pauseAudioButton.disabled = false; pauseAudioButton.textContent = "⏸️ Pausar";} if (saveAudioButton) saveAudioButton.disabled = true; logOSC("SYSTEM", "Gravação de Áudio Iniciada", []); displayGlobalError("Gravação de áudio iniciada.", 3000); };
        mediaRecorder.onstop = () => { if (isAudioRecording) { isAudioRecording = false; isAudioPaused = false; if (recordAudioButton) {recordAudioButton.textContent = "⏺️ Gravar Áudio"; recordAudioButton.classList.remove('active');} if (pauseAudioButton) {pauseAudioButton.disabled = true; pauseAudioButton.textContent = "⏸️ Pausar";} if (saveAudioButton) saveAudioButton.disabled = audioChunks.length === 0; logOSC("SYSTEM", "Gravação de Áudio Parada (onstop)", []); displayGlobalError("Gravação de áudio parada.", 3000); } try { if(currentSimpleSynth && currentSimpleSynth.masterGainNode && destinationNode) { currentSimpleSynth.masterGainNode.disconnect(destinationNode); console.log("masterGainNode desconectado do destinationNode da gravação."); } } catch (e) { console.warn("Erro ao desconectar destinationNode:", e); } };
        mediaRecorder.onpause = () => { if (pauseAudioButton) pauseAudioButton.textContent = "▶️ Retomar"; isAudioPaused = true; logOSC("SYSTEM", "Gravação de Áudio Pausada (onpause)", []); };
        mediaRecorder.onresume = () => { if (pauseAudioButton) pauseAudioButton.textContent = "⏸️ Pausar"; isAudioPaused = false; logOSC("SYSTEM", "Gravação de Áudio Retomada (onresume)", []); };
        mediaRecorder.onerror = (event) => { console.error("Erro no MediaRecorder:", event.error); displayGlobalError(`Erro na gravação: ${event.error.name}`, 7000); stopAudioRecording(); };
        mediaRecorder.start();
    } catch (e) { console.error("Falha ao iniciar MediaRecorder:", e); displayGlobalError("Falha ao iniciar gravação: " + e.message, 7000); isAudioRecording = false; }
}
function stopAudioRecording() {
    if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) { mediaRecorder.stop(); }
    isAudioRecording = false; isAudioPaused = false;
    if (recordAudioButton) {recordAudioButton.textContent = "⏺️ Gravar Áudio"; recordAudioButton.classList.remove('active');}
    if (pauseAudioButton) {pauseAudioButton.disabled = true; pauseAudioButton.textContent = "⏸️ Pausar";}
    if (saveAudioButton) saveAudioButton.disabled = (audioChunks.length === 0);
}
function saveRecordedAudio() {
    if (audioChunks.length === 0) { displayGlobalError("Nenhum áudio gravado para salvar.", 3000); if (saveAudioButton) saveAudioButton.disabled = true; return; }
    let mimeType = 'audio/webm; codecs=opus';
    if (mediaRecorder && mediaRecorder.mimeType) { mimeType = mediaRecorder.mimeType; }
    else if (audioChunks.length > 0 && audioChunks[0].type && MediaRecorder.isTypeSupported(audioChunks[0].type)) { mimeType = audioChunks[0].type; }
    console.log("Salvando blob com mimeType:", mimeType);
    const blob = new Blob(audioChunks, { type: mimeType }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); document.body.appendChild(a); a.style.display = 'none'; a.href = url;
    const fileExtension = mimeType.includes('ogg') ? 'ogg' : (mimeType.includes('mp4') ? 'mp4' : 'webm'); // Adicionado mp4 como possibilidade
    a.download = `gravacao_audio_msm_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.${fileExtension}`;
    a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
    logOSC("SYSTEM", `Áudio Salvo: ${a.download}`, []); displayGlobalError("Áudio salvo!", 3000);
    audioChunks = []; if (saveAudioButton) saveAudioButton.disabled = true;
}

// --------------------------------------------------------------------------
// SEÇÃO: COMENTÁRIO SOBRE MODULARIZAÇÃO FUTURA
// --------------------------------------------------------------------------
/*
COMENTÁRIO DE ORIENTAÇÃO PARA MODULARIZAÇÃO FUTURA:

Este arquivo (main54.js) foi organizado internamente em seções funcionais para facilitar
uma futura transição para módulos JavaScript (ESM - ECMAScript Modules). A estrutura atual
agrupa código por responsabilidade, o que é o primeiro passo para a separação em arquivos.

Passos Sugeridos para Modularização:

1.  **Ativar Módulos no HTML:**
    Alterar a tag script no `index54.html` para:
    `<script src="main54.js" type="module" defer></script>`
    Isso permitirá o uso de `import` e `export` nos arquivos JavaScript.

2.  **Criar Arquivos para Módulos:**
    Com base nas seções atuais, os seguintes arquivos de módulo poderiam ser criados:

    *   `config.js`: Conteria constantes globais, chaves de localStorage, definições de escalas, etc.
        (da seção: CONFIGURAÇÕES E CONSTANTES GLOBAIS)
    *   `dom-elements.js`: Poderia exportar referências para os elementos DOM mais utilizados.
        (da seção: ELEMENTOS DOM)
    *   `app-state.js`: Gerenciaria o estado global da aplicação, exportando variáveis de estado e
        funções para modificá-las de forma controlada (se desejado, ou apenas exportar as vars).
        (da seção: VARIÁVEIS DE ESTADO DA APLICAÇÃO)
    *   `shape-logic.js`: Conteria a classe `Shape` e funções relacionadas à sua lógica interna.
        (da seção: CLASSE SHAPE)
    *   `utils.js`: Funções auxiliares genéricas (matemática, debug, detecção de plataforma, etc.).
        (da seção: FUNÇÕES AUXILIARES)
    *   `drawing-logic.js`: Funções responsáveis pelo desenho no canvas (`drawShape`, `drawLandmarks`,
        `drawFallbackAnimation`, `animationLoop`).
        (da seção: DESENHO E ANIMAÇÃO NO CANVAS)
    *   `gesture-handler.js`: Lógica de MediaPipe, `initializeCamera`, `populateCameraSelect`, `onResults`.
        (da seção: MEDIAPIPE E PROCESSAMENTO DE GESTOS)
    *   `note-logic.js`: `processShapeNotes` e funções relacionadas à geração de notas musicais.
        (da seção: LÓGICA DE NOTAS)
    *   `midi-controller.js`: Funções para inicialização MIDI, envio/recebimento de mensagens,
        listagem de dispositivos (`initMidi`, `sendMidiNoteOn`, `handleMidiMessage`, etc.).
        (da seção: CONTROLE MIDI)
    *   `osc-controller.js`: Funções para OSC (`setupOSC`, `sendOSCMessage`, `logOSC`, gravação/loop).
        (da seção: CONTROLE OSC)
    *   `preset-manager.js`: Funções para salvar, carregar, importar/exportar presets de formas.
        (da seção: GERENCIAMENTO DE PRESETS DE FORMAS)
    *   `theme-controller.js`: Lógica para alternar e carregar temas.
        (da seção: CONTROLE DE TEMAS)
    *   `gesture-simulator.js`: Funções para o modo de simulação de gestos.
        (da seção: SIMULAÇÃO DE GESTOS)
    *   `ui-controller.js`: Funções gerais de controle da UI, incluindo toggles de botões principais,
        manipulação de sidebars e modais. Poderia ser subdividido (ex: `sidebar-left-ui.js`,
        `sidebar-synth-ui.js`, `modal-ui.js`, `hud-ui.js`).
        (da seção: CONTROLE DA INTERFACE DO USUÁRIO)
    *   `internal-audio-controller.js`: Funções de interface com `synth54.js` e controles de áudio.
        (da seção: CONTROLE DE ÁUDIO INTERNO)
    *   `audio-recording.js`: Funções para gravação de áudio.
        (da seção: GRAVAÇÃO DE ÁUDIO)
    *   `settings-persistence.js`: Funções para salvar e carregar configurações do localStorage.
        (da seção: PERSISTÊNCIA DE DADOS)
    *   `main-init.js` (ou manter em `main54.js`): Conteria o listener `DOMContentLoaded` e a
        orquestração da inicialização da aplicação, importando e chamando funções dos outros módulos.
        (da seção: INICIALIZAÇÃO DA APLICAÇÃO)

3.  **Usar `export` e `import`:**
    *   Em cada novo arquivo de módulo, usar `export` para disponibilizar funções e variáveis
        necessárias para outros módulos. Ex: `export class Shape { ... }`, `export function initializeCamera() { ... }`.
    *   No arquivo principal (`main-init.js` ou `main54.js`) e em outros módulos que precisem de
        funcionalidades externas, usar `import`. Ex: `import { Shape } from './shape-logic.js';`,
        `import { initializeCamera, onResults } from './gesture-handler.js';`.

4.  **Gerenciamento de Dependências:**
    Identificar cuidadosamente as dependências entre as funções e variáveis. A modularização
    ajudará a visualizar e gerenciar melhor essas dependências. Variáveis de estado globais
    (da seção `appState`) poderiam ser gerenciadas em um módulo `app-state.js` e importadas
    onde necessário, ou passadas como parâmetros para funções.

5.  **Testes Incrementais:**
    Realizar a modularização de forma incremental, testando a aplicação a cada etapa para
    garantir que nenhuma funcionalidade seja quebrada.

Essa abordagem tornará o código mais organizado, fácil de manter, testar e colaborar,
além de permitir o carregamento otimizado pelo navegador.
*/
>>>>>>> REPLACE
