// ==========================================================================
// MIDI SHAPE MANIPULATOR v60 - main60.js
// ==========================================================================

// simpleSynth e audioCtx são gerenciados e obtidos de synth60.js (ou versão compatível)
// Não há mais declarações globais de 'let simpleSynth;' ou 'let audioCtx;' aqui em main.

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
let midiEnabled = true;
let staccatoModeActive = false;
let vertexPullModeActive = false;
let chordMode = "TRIAD";

let currentArpeggioStyle = "UP";
const ARPEGGIO_STYLES = ["UP", "DOWN", "UPDOWN", "RANDOM"];
let arpeggioBPM = 120;
let noteInterval = 60000 / arpeggioBPM;
let externalBPM = null;

let osc;
let oscStatus = "OSC Desconectado";

// Variáveis audioCtx e simpleSynth globais são gerenciadas EXCLUSIVAMENTE em synth60.js.
// Em main60.js, usamos getAudioContext() e getSimpleSynthInstance() para acessá-las.
// A flag _internalAudioEnabledMaster também é gerenciada em synth60.js por setInternalAudioEnabledState().
// A flag local 'internalAudioEnabled' em main60.js serve para controlar o estado da UI e a lógica de toggle,
// mas o estado real do áudio (se está tocando ou não) depende de _internalAudioEnabledMaster em synth60.js.
let internalAudioEnabled = true; // Estado da UI e intenção do usuário para áudio interno.

let OSC_HOST = localStorage.getItem('OSC_HOST') || location.hostname || "127.0.0.1";
let OSC_PORT = parseInt(localStorage.getItem('OSC_PORT'), 10) || 8080;
const OSC_SETTINGS_KEY = 'oscConnectionSettingsV35';

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
let fallbackShapes = [];
let gestureSimulationActive = false;
let gestureSimIntervalId = null;
const GESTURE_SIM_INTERVAL = 100;

let currentTheme = 'theme-dark';
const THEME_STORAGE_KEY = 'midiShapeThemeV35';
const PRESETS_STORAGE_KEY = 'midiShapePresetsV52';
let shapePresets = {};
const APP_SETTINGS_KEY = 'midiShapeManipulatorV55Settings'; // Mantido v55 por ora
const ARPEGGIO_SETTINGS_KEY = 'arpeggioSettingsV52';
const CAMERA_DEVICE_ID_KEY = 'midiShapeCameraDeviceIdV52';

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
const arpeggioSettingsButton = document.getElementById('arpeggioSettingsButton');
const arpeggioSettingsModal = document.getElementById('arpeggioSettingsModal');
const closeArpeggioSettingsModalButton = document.getElementById('closeArpeggioSettingsModal');
const arpeggioStyleSelect = document.getElementById('arpeggioStyleSelect');
const arpeggioBPMSlider = document.getElementById('arpeggioBPM');
const arpeggioBPMValueSpan = document.getElementById('arpeggioBPMValue');
const noteIntervalSlider = document.getElementById('noteIntervalSlider');
const noteIntervalValueSpan = document.getElementById('noteIntervalValue');
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
const closeOscConfigModalButton = document.getElementById('closeOscConfigModal');
const oscHostInput = document.getElementById('oscHostInput');
const oscPortInput = document.getElementById('oscPortInput');
const saveOscConfigButton = document.getElementById('saveOscConfigButton');
const cameraSelectElement = document.getElementById('cameraSelect');
const internalAudioToggleButton = document.getElementById('internalAudioToggleButton');
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
const toggleSynthPanelButtonFixed = document.getElementById('toggleSynthPanelButtonFixed');
let scBPMSlider = document.getElementById('scBPM');
let scBPMValueSpan = document.getElementById('scBPMValue');
let recordAudioButton = document.getElementById('recordAudioButton');
let pauseAudioButton = document.getElementById('pauseAudioButton');
let saveAudioButton = document.getElementById('saveAudioButton');
let mediaRecorder;
let audioChunks = [];
let isAudioRecording = false;
let isAudioPaused = false;
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
const SCALES = { PENTATONIC_MAJ: { name: 'Pent. Maior', notes: [0, 2, 4, 7, 9], baseMidiNote: 60 }, DORIAN: { name: 'Dórico', notes: [0, 2, 3, 5, 7, 9, 10], baseMidiNote: 60 }, HARMONIC_MINOR: { name: 'Menor Harm.', notes: [0, 2, 3, 5, 7, 8, 11], baseMidiNote: 57 }, CHROMATIC: { name: 'Cromática', notes: [0,1,2,3,4,5,6,7,8,9,10,11], baseMidiNote: 60 }};
let currentScaleName = 'PENTATONIC_MAJ';
const scaleKeys = Object.keys(SCALES);
let currentScaleIndex = 0;
const NOTE_MODES = ['SEQUENTIAL', 'ARPEGGIO', 'CHORD', 'RANDOM_WALK'];
let currentNoteMode = 'SEQUENTIAL';
let currentNoteModeIndex = 0;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
let notesToVisualize = [];
let currentPlatform = 'PC';

function detectPlatform() { const ua = navigator.userAgent; if (/android/i.test(ua)) currentPlatform = 'Android'; else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) currentPlatform = 'iOS'; else currentPlatform = 'PC'; console.log(`Plataforma Detectada: ${currentPlatform}`); document.body.classList.add(`platform-${currentPlatform.toLowerCase()}`); }
function checkWebGL2Support() { try { const testCanvas = document.createElement('canvas'); if (testCanvas.getContext && testCanvas.getContext('webgl2')) { console.log("WebGL2 suportado."); return true; } } catch (e) { /* ignore */ } console.warn("WebGL2 não suportado pelo navegador."); return false; }

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

function resizeCanvas() { const dpr = window.devicePixelRatio || 1; const rect = canvasElement.getBoundingClientRect(); canvasElement.width = rect.width * dpr; canvasElement.height = rect.height * dpr; console.log(`Canvas resized to: ${canvasElement.width}x${canvasElement.height} (Display: ${rect.width}x${rect.height}, DPR: ${dpr})`); }
function distance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1)**2 + (y2 - y1)**2); }
function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) { return Math.abs(distance(x, y, cx, cy) - r) <= tolerance; }
function getNoteName(midiNote) { if (midiNote < 0 || midiNote > 127) return ""; return `${NOTE_NAMES[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`; }
const activeNoteTimers = new Set();
function clearAllNoteTimers() { activeNoteTimers.forEach(timerId => clearTimeout(timerId)); activeNoteTimers.clear(); logDebug("Todos os timers de notas (staccato, etc.) foram limpos."); }

function stopAllNotesForShape(shape, clearActiveMidiNotesObject = true) {
    if (!shape || spectatorModeActive) return;
    logDebug(`Parando todas as notas para a forma ${shape.id}. Limpar objeto: ${clearActiveMidiNotesObject}`);
    Object.keys(shape.activeMidiNotes).forEach(key => {
        const noteInfo = shape.activeMidiNotes[key];
        if (noteInfo && noteInfo.playing) { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); noteInfo.playing = false; }
        if (noteInfo && noteInfo.staccatoTimer) { clearTimeout(noteInfo.staccatoTimer); activeNoteTimers.delete(noteInfo.staccatoTimer); }
    });
    if (clearActiveMidiNotesObject) { shape.activeMidiNotes = {}; }
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
        if (dist < maxInfluence && dist > 0) { const force = maxForce * (1 - dist / maxInfluence); dx += (vCanvasX - tipX) / dist * force; dy += (vCanvasY - tipY) / dist * force; activeLiquifyPts++; }
      }
    }
    if (vertexPullModeActive && shape.vertexOffsets[i] && !spectatorModeActive) { dx += shape.vertexOffsets[i].x; dy += shape.vertexOffsets[i].y; }
    totalDispMag += Math.sqrt(dx**2 + dy**2);
    const finalX = cx + vx + dx; const finalY = cy + vy + dy;
    if (i === 0) ctx.moveTo(finalX, finalY); else ctx.lineTo(finalX, finalY);
  }
  ctx.closePath(); ctx.strokeStyle = shape.id === 0 ? '#00FFFF' : '#FF00FF'; ctx.lineWidth = 3; ctx.stroke();
  if (currentNoteMode === 'ARPEGGIO' && shape.sides > 0 && midiEnabled) {
    const key = `shape_${shape.id}_arp_${shape.currentEdgeIndex}`;
    if (shape.activeMidiNotes[key]?.playing) {
      const angle = (shape.currentEdgeIndex / shape.sides) * Math.PI * 2;
      let vx = r * Math.cos(angle); let vy = r * Math.sin(angle);
      let ox = 0; let oy = 0;
      if (vertexPullModeActive && shape.vertexOffsets[shape.currentEdgeIndex] && !spectatorModeActive) { ox = shape.vertexOffsets[shape.currentEdgeIndex].x; oy = shape.vertexOffsets[shape.currentEdgeIndex].y; }
      ctx.beginPath(); ctx.arc(cx + vx + ox, cy + vy + oy, 8, 0, Math.PI * 2); ctx.fillStyle = shape.id === 0 ? 'rgba(0,255,255,0.6)' : 'rgba(255,0,255,0.6)'; ctx.fill();
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
  Object.keys(shape.activeMidiNotes).forEach(key => {
    const noteInfo = shape.activeMidiNotes[key]; let shouldDelete = false;
    if (!noteInfo) { shouldDelete = true; }
    else if (!noteInfo.playing || !midiEnabled || shape.sides <= 0 || spectatorModeActive) { if (noteInfo.playing) { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); noteInfo.playing = false; } if (noteInfo.staccatoTimer) { clearTimeout(noteInfo.staccatoTimer); activeNoteTimers.delete(noteInfo.staccatoTimer); } shouldDelete = true; }
    else if (noteInfo.isSequentialNote && currentNoteMode !== 'SEQUENTIAL') { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); noteInfo.playing = false; if (noteInfo.staccatoTimer) { clearTimeout(noteInfo.staccatoTimer); activeNoteTimers.delete(noteInfo.staccatoTimer); } shouldDelete = true; }
    else if (noteInfo.isArpeggioNote && currentNoteMode !== 'ARPEGGIO') { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); noteInfo.playing = false; if (noteInfo.staccatoTimer) { clearTimeout(noteInfo.staccatoTimer); activeNoteTimers.delete(noteInfo.staccatoTimer); } shouldDelete = true; }
    if (shouldDelete) { delete shape.activeMidiNotes[key]; }
  });
}

function getNoteInScale(index, baseOctaveOffset = 0) { const scale = SCALES[currentScaleName]; const scaleNotes = scale.notes; const len = scaleNotes.length; const octave = baseOctaveOffset + Math.floor(index / len); const noteIdx = index % len; return Math.max(0, Math.min(127, scale.baseMidiNote + scaleNotes[noteIdx] + (octave * 12))); }

function stopPreviousNotesIfNeeded(shape) {
    if (staccatoModeActive) return;
    Object.keys(shape.activeMidiNotes).forEach(key => {
        const noteInfo = shape.activeMidiNotes[key];
        if (noteInfo && noteInfo.playing) { if (!noteInfo.staccatoTimer || (noteInfo.staccatoTimer && !activeNoteTimers.has(noteInfo.staccatoTimer))) { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1); noteInfo.playing = false; } }
    });
}

function processShapeNotes(shape, isPulsing, pulseValue) {
    if (spectatorModeActive || !midiEnabled || shape.sides <= 0) return;
    const now = performance.now();
    const canPlayNonArp = now - shape.lastNotePlayedTime > noteInterval;
    const canPlayArp = currentNoteMode === 'ARPEGGIO' && shape.sides > 2 && now - shape.lastArpeggioNotePlayedTime > noteInterval;
    if (canPlayNonArp || canPlayArp) {
        let notesToPlay = []; let edgeIdx = shape.currentEdgeIndex; let notePlayed = false;
        stopPreviousNotesIfNeeded(shape);
        if (currentNoteMode === 'CHORD' && canPlayNonArp) { stopAllNotesForShape(shape, true); }
        switch (currentNoteMode) {
            case 'SEQUENTIAL': if (canPlayNonArp && shape.sides > 0) { for (let i = 0; i < shape.sides; i++) { notesToPlay.push({ note: getNoteInScale(i), vertexIndex: i, isSequential: true }); } notePlayed = true; shape.lastNotePlayedTime = now; } break;
            case 'ARPEGGIO': if (canPlayArp && shape.sides > 0) { if (currentArpeggioStyle === "UP") shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides; else if (currentArpeggioStyle === "DOWN") shape.currentEdgeIndex = (shape.currentEdgeIndex - 1 + shape.sides) % shape.sides; else if (currentArpeggioStyle === "UPDOWN") { if (shape.arpeggioDirection === 1) { if (shape.currentEdgeIndex >= shape.sides - 1) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.arpeggioDirection = -1; } else shape.currentEdgeIndex++; } else { if (shape.currentEdgeIndex <= 0) { shape.currentEdgeIndex = 0; shape.arpeggioDirection = 1; if (shape.sides > 1) shape.currentEdgeIndex++; } else shape.currentEdgeIndex--; } shape.currentEdgeIndex = Math.max(0, Math.min(shape.currentEdgeIndex, shape.sides - 1)); } else if (currentArpeggioStyle === "RANDOM") shape.currentEdgeIndex = Math.floor(Math.random() * shape.sides); edgeIdx = shape.currentEdgeIndex; notesToPlay.push({ note: getNoteInScale(edgeIdx), vertexIndex: edgeIdx, isArpeggio: true }); notePlayed = true; shape.lastArpeggioNotePlayedTime = now; } break;
            case 'CHORD': if (canPlayNonArp && shape.sides > 0) { shape.currentEdgeIndex += shape.rotationDirection; if (shape.currentEdgeIndex >= shape.sides) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.rotationDirection = -1; } else if (shape.currentEdgeIndex < 0) { shape.currentEdgeIndex = 0; shape.rotationDirection = 1; } edgeIdx = shape.currentEdgeIndex; notesToPlay.push({ note: getNoteInScale(edgeIdx), vertexIndex: edgeIdx, isChordNote: true, chordPart: 0 }); notesToPlay.push({ note: getNoteInScale(edgeIdx + 2), vertexIndex: edgeIdx, isChordNote: true, chordPart: 1 }); notesToPlay.push({ note: getNoteInScale(edgeIdx + 4), vertexIndex: edgeIdx, isChordNote: true, chordPart: 2 }); notePlayed = true; shape.lastNotePlayedTime = now; } break;
            case 'RANDOM_WALK': if (canPlayNonArp) { shape.currentEdgeIndex += Math.floor(Math.random() * 3) - 1; const scaleNoteCount = SCALES[currentScaleName].notes.length * 2; shape.currentEdgeIndex = (shape.currentEdgeIndex + scaleNoteCount) % scaleNoteCount; edgeIdx = shape.currentEdgeIndex; notesToPlay.push({ note: getNoteInScale(edgeIdx), vertexIndex: edgeIdx }); notePlayed = true; shape.lastNotePlayedTime = now; } break;
        }
        if (notePlayed && notesToPlay.length > 0) {
            let vel = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * (97 / 270))));
            if (isPulsing) vel = Math.max(0, Math.min(127, Math.round(vel * (0.6 + ((pulseValue + 1) / 2) * 0.4))));
            notesToPlay.forEach((noteData) => {
                const noteToPlay = noteData.note; const vertexIndex = noteData.vertexIndex; let key;
                if (noteData.isSequential) { key = `shape_${shape.id}_seq_${vertexIndex}`; }
                else if (noteData.isArpeggio) { key = `shape_${shape.id}_arp_${vertexIndex}`; }
                else if (noteData.isChordNote) { key = `shape_${shape.id}_chord_${vertexIndex}_part_${noteData.chordPart}`; }
                else { key = `shape_${shape.id}_vtx_${vertexIndex}_note_${noteToPlay}`; }
                if (shape.activeMidiNotes[key]?.staccatoTimer) { clearTimeout(shape.activeMidiNotes[key].staccatoTimer); activeNoteTimers.delete(shape.activeMidiNotes[key].staccatoTimer); }
                sendMidiNoteOn(noteToPlay, vel, shape.midiChannel, shape.id + 1);
                shape.activeMidiNotes[key] = { note: noteToPlay, playing: true, staccatoTimer: null, isSequentialNote: !!noteData.isSequential, isArpeggioNote: !!noteData.isArpeggio, timestamp: now };
                if (staccatoModeActive) { const timerId = setTimeout(() => { if (shape.activeMidiNotes[key]?.playing) { sendMidiNoteOff(noteToPlay, shape.midiChannel, shape.id + 1); shape.activeMidiNotes[key].playing = false; } activeNoteTimers.delete(timerId); }, 150); shape.activeMidiNotes[key].staccatoTimer = timerId; activeNoteTimers.add(timerId); }
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
    let activeNotesExist = false; let lastKnownPitchBend = 8192;
    for (const key in shape.activeMidiNotes) { if (shape.activeMidiNotes[key]?.playing) { activeNotesExist = true; lastKnownPitchBend = shape.activeMidiNotes[key].lastPitchBend || 8192; break; } }
    if (activeNotesExist) { if (Math.abs(shape.currentPitchBend - lastKnownPitchBend) > 10) { sendPitchBend(shape.currentPitchBend, shape.midiChannel); Object.values(shape.activeMidiNotes).forEach(ni => { if (ni && ni.playing) ni.lastPitchBend = shape.currentPitchBend; }); } }
}

async function initializeCamera(deviceId = null) { /* ... (conteúdo original de main59.js) ... */ }
async function populateCameraSelect() { /* ... (conteúdo original de main59.js) ... */ }
function onResults(results) { /* ... (conteúdo original de main59.js) ... */ }
function drawLandmarks(landmarksArray, handedness = "Unknown") { /* ... (conteúdo original de main59.js) ... */ }
function initFallbackShapes() { /* ... (conteúdo original de main59.js) ... */ }
function drawFallbackAnimation() { /* ... (conteúdo original de main59.js) ... */ }
function updateMidiDeviceLists() { /* ... (conteúdo original de main59.js) ... */ }
function populateMidiOutputSelect() { /* ... (conteúdo original de main59.js) ... */ }
function populateMidiInputSelect() { /* ... (conteúdo original de main59.js) ... */ }
function setMidiInput(inputPort) { /* ... (conteúdo original de main59.js) ... */ }
async function initMidi() { /* ... (conteúdo original de main59.js) ... */ }
function handleMidiMessage(event) { /* ... (conteúdo original de main59.js) ... */ }

function sendMidiNoteOn(note, velocity, channel, shapeId = -1) {
  if (spectatorModeActive) return;
  const ch = Math.max(0, Math.min(15, channel));
  const n = Math.max(0, Math.min(127, Math.round(note)));
  const v = Math.max(0, Math.min(127, Math.round(velocity)));
  if (midiEnabled && midiOutput) { midiOutput.send([0x90 + ch, n, v]); }
  const currentSimpleSynth = getSimpleSynthInstance(); // Definido em synth60.js
  // A flag internalAudioEnabled (local de main60.js) controla se tentamos usar o synth.
  // A flag _internalAudioEnabledMaster (em synth60.js) controla se o synth realmente toca.
  if (internalAudioEnabled && currentSimpleSynth && typeof currentSimpleSynth.noteOn === 'function') {
    currentSimpleSynth.noteOn(n, v);
  }
  sendOSCMessage(`/forma/${shapeId}/noteOn`, n, v, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, v);
}

function sendMidiNoteOff(note, channel, shapeId = -1) {
  if (spectatorModeActive) return;
  const ch = Math.max(0, Math.min(15, channel));
  const n = Math.max(0, Math.min(127, Math.round(note)));
  if (midiEnabled && midiOutput) { midiOutput.send([0x80 + ch, n, 0]); }
  const currentSimpleSynth = getSimpleSynthInstance(); // Definido em synth60.js
  if (internalAudioEnabled && currentSimpleSynth && typeof currentSimpleSynth.noteOff === 'function') {
    currentSimpleSynth.noteOff(n);
  }
  sendOSCMessage(`/forma/${shapeId}/noteOff`, n, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, 0);
}

function sendPitchBend(bendValue, channel) { /* ... (conteúdo original de main59.js) ... */ }
function sendMidiCC(cc, value, channel) { /* ... (conteúdo original de main59.js) ... */ }
function turnOffAllActiveNotesForShape(shape) { stopAllNotesForShape(shape, true); }

function turnOffAllActiveNotes() {
    if (spectatorModeActive) return;
    logDebug("Desligando todas as notas ativas para todas as formas (MIDI e Interno).");
    const origMidiEnabled = midiEnabled; midiEnabled = true;
    shapes.forEach(shape => stopAllNotesForShape(shape, true));
    midiEnabled = origMidiEnabled;
    const currentSimpleSynth = getSimpleSynthInstance(); // Definido em synth60.js
    if (currentSimpleSynth && typeof currentSimpleSynth.allNotesOff === 'function') {
        currentSimpleSynth.allNotesOff();
    }
    clearAllNoteTimers();
}

function resetMidiSystem() { /* ... (conteúdo original de main59.js) ... */ }
function loadOscSettings() { /* ... (conteúdo original de main59.js) ... */ }
function saveOscSettings(host, port) { /* ... (conteúdo original de main59.js) ... */ }
function sendOSCMessage(address, ...args) { /* ... (conteúdo original de main59.js) ... */ }
function sendOSCHeartbeat() { /* ... (conteúdo original de main59.js) ... */ }
function setupOSC() { /* ... (conteúdo original de main59.js) ... */ }
function handleIncomingExternalOSC(oscMessage) { /* ... (conteúdo original de main59.js) ... */ }
function sendAllGlobalStatesOSC() { /* ... (conteúdo original de main59.js) ... */ }
function logOSC(source, address, args, isSeparator = false) { /* ... (conteúdo original de main59.js) ... */ }
function exportOSCLog() { /* ... (conteúdo original de main59.js) ... */ }
function getShapeState(shape) { /* ... (conteúdo original de main59.js) ... */ }
function applyShapeState(shape, state) { /* ... (conteúdo original de main59.js) ... */ }
function saveShapePreset() { /* ... (conteúdo original de main59.js) ... */ }
function loadShapePreset() { /* ... (conteúdo original de main59.js) ... */ }
function deleteSelectedPreset() { /* ... (conteúdo original de main59.js) ... */ }
function populateSavedPresetsSelect() { /* ... (conteúdo original de main59.js) ... */ }
function exportAllPresets() { /* ... (conteúdo original de main59.js) ... */ }
function importAllPresets() { /* ... (conteúdo original de main59.js) ... */ }
function handleImportPresetFile(event) { /* ... (conteúdo original de main59.js) ... */ }
function loadPresetsFromStorage() { /* ... (conteúdo original de main59.js) ... */ }
function populateShapeToPresetSelect() { /* ... (conteúdo original de main59.js) ... */ }
function initPresetManager() { /* ... (conteúdo original de main59.js) ... */ }
function applyTheme(theme) { /* ... (conteúdo original de main59.js) ... */ }
function toggleTheme() { /* ... (conteúdo original de main59.js) ... */ }
function loadTheme() { /* ... (conteúdo original de main59.js) ... */ }
function generateMockLandmarks(hand="Right",shapeCenterX,shapeCenterY){ /* ... (conteúdo original de main59.js) ... */ }
function runGestureSimulation(){ /* ... (conteúdo original de main59.js) ... */ }
function toggleGestureSimulation(){ /* ... (conteúdo original de main59.js) ... */ }

function setupEventListeners() {
    const closeModalButton = document.getElementById('closeModal');
    const infoModal = document.getElementById('infoModal');
    if (sidebar && sidebarHandle) { /* ... (conteúdo original de main59.js) ... */ }
    const infoButtonElement = document.getElementById('info');
    if (infoButtonElement && infoModal) infoButtonElement.addEventListener('click', () => { infoModal.style.display = 'flex'; });
    if (closeModalButton && infoModal) closeModalButton.addEventListener('click', () => { infoModal.style.display = 'none'; });
    if (infoHudButton && hudElement) { /* ... (conteúdo original de main59.js) ... */ }
    if (settingsButton && settingsModal) settingsButton.addEventListener('click', () => { settingsModal.style.display = 'flex'; updateModalSynthControls(); });
    if (closeSettingsModalButton && settingsModal) closeSettingsModalButton.addEventListener('click', () => { settingsModal.style.display = 'none'; });
    if (oscConfigButton && oscConfigModal) { /* ... (conteúdo original de main59.js) ... */ }
    if (closeOscConfigModalButton && oscConfigModal) closeOscConfigModalButton.addEventListener('click', () => { oscConfigModal.style.display = 'none'; });
    const closeOscConfigModalBtnGeneric = document.getElementById('closeOscConfigModalBtnGeneric');
    if(closeOscConfigModalBtnGeneric && oscConfigModal) closeOscConfigModalBtnGeneric.addEventListener('click', () => oscConfigModal.style.display = 'none');
    if (saveOscConfigButton && oscConfigModal) saveOscConfigButton.addEventListener('click', () => { /* ... (conteúdo original de main59.js) ... */ });
    if (arpeggioSettingsButton) arpeggioSettingsButton.addEventListener('click', () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = 'flex'});
    if (closeArpeggioSettingsModalButton) closeArpeggioSettingsModalButton.addEventListener('click', () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = 'none'});
    if (closeOscControlModalButton) closeOscControlModalButton.addEventListener('click', () => {if(oscControlModal) oscControlModal.style.display = 'none'});
    window.addEventListener('click', (event) => { if (event.target.classList.contains('modal-overlay')) event.target.style.display = 'none'; });
    if (midiOutputSelect) midiOutputSelect.addEventListener('change', () => { /* ... (conteúdo original de main59.js) ... */ });
    if (midiInputSelect) midiInputSelect.addEventListener('change', () => { /* ... (conteúdo original de main59.js) ... */ });
    if (arpeggioStyleSelect) arpeggioStyleSelect.addEventListener('change', (e) => { /* ... (conteúdo original de main59.js) ... */ });
    if (arpeggioBPMSlider) arpeggioBPMSlider.addEventListener('input', (e) => { /* ... (conteúdo original de main59.js) ... */ });
    if (noteIntervalSlider) noteIntervalSlider.addEventListener('input', (e) => { /* ... (conteúdo original de main59.js) ... */ });
    if (sendTestOSCButton) sendTestOSCButton.addEventListener('click', () => { /* ... (conteúdo original de main59.js) ... */ });
    if (clearOscLogButton) clearOscLogButton.addEventListener('click', () => { /* ... (conteúdo original de main59.js) ... */ });
    if (exportOscLogButton) exportOscLogButton.addEventListener('click', exportOSCLog);
    if (oscLoopDurationInput) oscLoopDurationInput.addEventListener('change', () => { /* ... (conteúdo original de main59.js) ... */ });
    if (midiToggleButton) midiToggleButton.addEventListener('click', toggleMidiEnabled);
    if (syncDMXNotesButton) syncDMXNotesButton.addEventListener('click', toggleDMXSync);
    if (midiFeedbackToggleButton) midiFeedbackToggleButton.addEventListener('click', toggleMidiFeedback);
    if (recordOSCButton) recordOSCButton.addEventListener('click', toggleOSCRecording);
    if (playOSCLoopButton) playOSCLoopButton.addEventListener('click', playRecordedOSCLoop);
    if (spectatorModeButton) spectatorModeButton.addEventListener('click', toggleSpectatorMode);
    if (themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
    if (gestureSimToggleButton) gestureSimToggleButton.addEventListener('click', toggleGestureSimulation);
    if (reconnectOSCButton) reconnectOSCButton.addEventListener('click', () => { /* ... (conteúdo original de main59.js) ... */ });
    if (cameraSelectElement) cameraSelectElement.addEventListener('change', (event) => { /* ... (conteúdo original de main59.js) ... */ });

    // Listener para Áudio Interno (MODIFICADO PARA V60)
    // Listener para Áudio Interno (MODIFICADO PARA V60)
    if (internalAudioToggleButton) {
        // A função internalAudioButtonClickHandler é definida mais abaixo
        internalAudioToggleButton.addEventListener("click", internalAudioButtonClickHandler);
    } else {
        console.warn("Botão internalAudioToggleButton não encontrado durante setupEventListeners.");
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
    if (toggleSynthPanelButtonFixed && synthControlsSidebar) { /* ... (conteúdo original de main59.js) ... */ }
    document.addEventListener('keydown', handleKeyPress);
    logDebug("Ouvintes de eventos configurados.");
}

function handleSynthControlChange(param, value) { /* ... (conteúdo original de main59.js) ... */ }
function updateModalSynthControls() { /* ... (conteúdo original de main59.js) ... */ }
function updateSidebarSynthControls() { /* ... (conteúdo original de main59.js) ... */ }
function initSynthControlsSidebar() { /* ... (conteúdo original de main59.js) ... */ }

// LÓGICA DO BOTÃO DE ÁUDIO - CORRIGIDA PARA V60
async function internalAudioButtonClickHandler() {
  if (spectatorModeActive) {
    console.log("Modo espectador ativo, toggle de áudio ignorado.");
    return;
  }

  console.log("internalAudioButtonClickHandler chamado.");

  // As variáveis audioCtx e simpleSynth são gerenciadas em synth60.js
  // Usamos as funções getAudioContext() e getSimpleSynthInstance() para acessá-las/criá-las.
  let audioCtx = getAudioContext(); // Tenta obter/criar AudioContext de synth60.js
  let simpleSynth = getSimpleSynthInstance(); // Tenta obter/criar SimpleSynth de synth60.js

  try {
    // 1. Criar AudioContext se não existir
    if (!audioCtx) {
      console.log("AudioContext não existe, tentando criar via getAudioContext()...");
      audioCtx = getAudioContext(); // Deve criar se synth60.js estiver correto
      if (!audioCtx) {
        console.error("Falha crítica: getAudioContext() não retornou um AudioContext.");
        displayGlobalError("Falha crítica ao inicializar o motor de áudio.");
        return; // Não podemos prosseguir
      }
      console.log("AudioContext obtido/criado:", audioCtx.state);
    }

    // 2. Criar SimpleSynth se não existir (e AudioContext estiver pronto)
    if (audioCtx && !simpleSynth) {
      // Se o audioCtx acabou de ser criado, pode estar 'suspended'.
      // SimpleSynth só é criado por getSimpleSynthInstance se audioCtx estiver 'running'.
      // Então, primeiro tentamos resumir o contexto se necessário.
      if (audioCtx.state === "suspended") {
        console.log("AudioContext está suspenso, tentando resumir antes de criar SimpleSynth...");
        try {
          await audioCtx.resume();
          console.log("AudioContext resumido com sucesso antes de criar SimpleSynth.");
        } catch (resumeError) {
          console.error("Erro ao resumir AudioContext antes de criar SimpleSynth:", resumeError);
          displayGlobalError("Falha ao ativar o áudio. Interaja com a página e tente novamente.");
          return; // Não podemos prosseguir sem um contexto ativo
        }
      }
      // Agora que o contexto deve estar 'running' (ou houve erro), tentamos obter/criar o synth.
      simpleSynth = getSimpleSynthInstance();
      if (!simpleSynth) {
         console.error("Falha crítica: SimpleSynth não pôde ser instanciado mesmo após garantir AudioContext.");
         displayGlobalError("Erro ao criar o sintetizador interno.");
         return; // Não podemos prosseguir
      }
      console.log("SimpleSynth instanciado com sucesso.");
      // Se o synth foi recém-criado, aplicar configurações salvas (se houver)
      // Esta lógica já existe no DOMContentLoaded, mas pode ser útil aqui também se o primeiro clique for no botão.
      const { audioSettings } = loadAllPersistentSettings(); // Recarrega para garantir que temos as mais recentes
      Object.keys(audioSettings).forEach(key => {
          const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
          if (simpleSynth && typeof simpleSynth[setterName] === 'function') {
              simpleSynth[setterName](audioSettings[key]);
          } else if (simpleSynth && key === 'masterVolume' && typeof simpleSynth.setMasterVolume === 'function') {
              simpleSynth.setMasterVolume(audioSettings[key]);
          }
      });
      updateModalSynthControls();
      updateSidebarSynthControls();
      console.log("Configurações de áudio aplicadas ao SimpleSynth recém-criado.");
    }

    // 3. Resumir AudioContext se estiver suspenso (caso já existisse mas estivesse suspenso)
    if (audioCtx && audioCtx.state === "suspended") {
      console.log("AudioContext existente está suspenso, tentando resumir...");
      await audioCtx.resume();
      console.log("AudioContext (existente) resumido com sucesso via botão de áudio.");
    }

    // Se chegamos aqui, audioCtx e simpleSynth devem existir e audioCtx deve estar 'running'.
    if (!audioCtx || audioCtx.state !== 'running' || !simpleSynth) {
        console.error("Estado inesperado: audioCtx ou simpleSynth não estão prontos após as tentativas.");
        displayGlobalError("Não foi possível ativar o áudio completamente.");
        return;
    }

    // 4. Alternar o estado de 'internalAudioEnabled' (flag local de main60.js)
    internalAudioEnabled = !internalAudioEnabled;
    console.log(`internalAudioEnabled (main60.js) alternado para: ${internalAudioEnabled}`);

    // 5. Atualizar a UI do botão
    if (internalAudioToggleButton) {
      internalAudioToggleButton.textContent = internalAudioEnabled ? "🔊 Áudio ON" : "🔊 Áudio OFF";
      internalAudioToggleButton.classList.toggle('active', internalAudioEnabled);
    }

    // 6. Atualizar o estado mestre de áudio em synth60.js (variável _internalAudioEnabledMaster)
    if (typeof setInternalAudioEnabledState === "function") {
      setInternalAudioEnabledState(internalAudioEnabled); // Esta função em synth60.js controla _internalAudioEnabledMaster
      console.log(`Estado mestre de áudio em synth60.js atualizado para: ${internalAudioEnabled}`);
    } else {
      console.error("Função setInternalAudioEnabledState não encontrada em synth60.js!");
    }

    // 7. Se o áudio foi desativado, desligar todas as notas
    if (!internalAudioEnabled && simpleSynth) {
      console.log("Áudio desativado, parando todas as notas do synth.");
      simpleSynth.allNotesOff();
    }

    // 8. Enviar mensagem OSC e atualizar HUD/Configurações
    sendOSCMessage('/global/state/internalAudioEnabled', internalAudioEnabled ? 1 : 0);
    updateHUD();
    saveAllPersistentSettings();
    console.log("Manipulador do botão de áudio concluído.");

  } catch (e) {
    console.error("Erro no internalAudioButtonClickHandler:", e);
    displayGlobalError("Erro ao processar o clique no botão de áudio.");
    // Tentar reverter o estado da UI para OFF em caso de erro
    internalAudioEnabled = false;
    if (internalAudioToggleButton) {
      internalAudioToggleButton.textContent = "🔊 Áudio OFF";
      internalAudioToggleButton.classList.remove('active');
    }
    if (typeof setInternalAudioEnabledState === "function") {
      setInternalAudioEnabledState(false);
    }
    updateHUD();
  }
}

// A função toggleInternalAudio original foi completamente substituída pela lógica acima.

function updateHUD() {
  if (!hudElement) { logDebug("Elemento HUD não encontrado."); return; }
  if (hudElement.classList.contains('hidden')) { let textSpan = hudElement.querySelector('span#hudTextContent'); if (textSpan) { textSpan.innerHTML = ""; } return; }
  let txt = "";
  if (spectatorModeActive) txt += `<b>👓 MODO ESPECTADOR</b><br>`;

  const currentAudioCtx = getAudioContext(); // De synth60.js
  const audioIcon = internalAudioEnabled && currentAudioCtx && currentAudioCtx.state === 'running' ? '🟢' : '🔴';
  const currentSimpleSynth = getSimpleSynthInstance(); // De synth60.js
  const audioStatusText = internalAudioEnabled && currentAudioCtx && currentAudioCtx.state === 'running' ? (currentSimpleSynth?.waveform || 'ON') : 'OFF';
  const audioStatusClass = internalAudioEnabled && currentAudioCtx && currentAudioCtx.state === 'running' ? 'status-ok' : 'status-error';
  txt += `Áudio: ${audioIcon} <span class="${audioStatusClass}">${audioStatusText}</span> | `;

  const midiStatusIcon = midiAccess && midiOutput ? '🟢' : '🔴';
  txt += `MIDI: ${midiStatusIcon} <span class="${midiAccess && midiOutput ? 'status-ok':'status-error'}">${midiEnabled && midiOutput ? (midiOutput.name || 'ON') : 'OFF'}</span> | `;

  const oscConnected = osc && osc.status() === OSC.STATUS.IS_OPEN;
  const oscStatusIcon = oscConnected ? '🟢' : (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? '🟠' : '🔴');
  txt += `OSC: ${oscStatusIcon} <span class="${oscConnected ? 'status-ok': (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? 'status-warn' : 'status-error')}">${oscStatus}</span><br>`;

  shapes.forEach(s => { txt += `<b>F${s.id+1}:</b> R:${s.radius.toFixed(0)} L:${s.sides===100?"○":s.sides} Gest:${spectatorModeActive?"-":(s.activeGesture||"Nenhum")}<br>`; });
  txt += `<b>Global:</b> Pulso:${pulseModeActive?'ON':'OFF'} Artic:${staccatoModeActive?'Stac':'Leg'} VtxPull:${vertexPullModeActive?'ON':'OFF'}<br>`;
  txt += `&nbsp;&nbsp;Escala:${SCALES[currentScaleName].name} Nota:${currentNoteMode} Acorde:${chordMode} Oper:${operationMode==='one_person'?'1P':'2P'}<br>`;
  if (currentNoteMode === 'ARPEGGIO') txt += `&nbsp;&nbsp;Arp: ${currentArpeggioStyle} BPM:${arpeggioBPM.toFixed(0)}${externalBPM!==null?'(Ext)':''} Idx:${shapes.map(s=>s.currentEdgeIndex).join('/')}<br>`;
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
  if (!spectatorModeActive && osc && osc.status() === OSC.STATUS.IS_OPEN && (now - lastOscSendTime > OSC_SEND_INTERVAL)) { /* ... (conteúdo original de main59.js) ... */ }
}

function toggleMidiEnabled(){ /* ... (conteúdo original de main59.js) ... */ }
function toggleOperationMode(){ /* ... (conteúdo original de main59.js) ... */ }
function toggleDMXSync(){ /* ... (conteúdo original de main59.js) ... */ }
function toggleMidiFeedback(){ /* ... (conteúdo original de main59.js) ... */ }
function toggleOSCRecording(){ /* ... (conteúdo original de main59.js) ... */ }
function playRecordedOSCLoop(){ /* ... (conteúdo original de main59.js) ... */ }
function toggleSpectatorMode(){ /* ... (conteúdo original de main59.js) ... */ }
function openPopup(){ /* ... (conteúdo original de main59.js) ... */ }
function handleKeyPress(e) { /* ... (conteúdo original de main59.js, mas 'V' agora usa internalAudioButtonClickHandler indiretamente) ... */
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
    'K': () => { if (oscConfigModal) {oscConfigModal.style.display = oscConfigModal.style.display === 'flex' ? 'none' : 'flex'; if(oscConfigModal.style.display === 'flex') {oscHostInput.value = OSC_HOST; oscPortInput.value = OSC_PORT;}}},
    'B': () => { if (shapePresetModal) shapePresetModal.style.display = shapePresetModal.style.display === 'flex' ? 'none' : 'flex'; },
    'V': () => { if (internalAudioToggleButton) internalAudioButtonClickHandler(); }, // MODIFICADO para v60
    'D': toggleDMXSync,
    'R': toggleOSCRecording,
    'P': playRecordedOSCLoop,
    'F': toggleMidiFeedback,
    'S': toggleSpectatorMode,
    'T': toggleTheme,
    'Y': () => { if (toggleSynthPanelButtonFixed) toggleSynthPanelButtonFixed.click(); },
  };
  const key = e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase();
  const mapToUse = e.shiftKey ? correctedShiftActionMap : actionMap;
  if (mapToUse[key]) { e.preventDefault(); mapToUse[key](); }
}

function savePersistentSetting(key,value){ /* ... (conteúdo original de main59.js) ... */ }
function loadPersistentSetting(key,defaultValue){ /* ... (conteúdo original de main59.js) ... */ }
function saveAllPersistentSettings(){ /* ... (conteúdo original de main59.js) ... */ }

function loadAllPersistentSettings(){
  operationMode = loadPersistentSetting('operationMode','two_persons');
  midiEnabled = loadPersistentSetting('midiEnabled',true);
  internalAudioEnabled = loadPersistentSetting('internalAudioEnabled', true); // Flag da UI

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
      internalAudioToggleButton.textContent = internalAudioEnabled ? "🔊 Áudio ON" : "🔊 Áudio OFF";
      internalAudioToggleButton.classList.toggle('active', internalAudioEnabled);
  }

  loadOscSettings();
  loadArpeggioSettings();

  console.log("Configs V55 (ou compatível) carregadas do localStorage para main60.js.");
  // Garante que o objeto retornado sempre tenha a estrutura esperada
  return {
    savedMidiOutputId: loadPersistentSetting('midiOutputId', null),
    savedMidiInputId: loadPersistentSetting('midiInputId', null),
    audioSettings: {
        waveform: savedWaveform || 'sine',
        masterVolume: savedMasterVolume !== undefined ? savedMasterVolume : 0.5,
        attack: savedAttack !== undefined ? savedAttack : 0.01,
        decay: savedDecay !== undefined ? savedDecay : 0.1,
        sustain: savedSustain !== undefined ? savedSustain : 0.7,
        release: savedRelease !== undefined ? savedRelease : 0.2,
        distortion: savedDistortion !== undefined ? savedDistortion : 0,
        filterCutoff: savedFilterCutoff !== undefined ? savedFilterCutoff : 20000,
        filterResonance: savedFilterResonance !== undefined ? savedFilterResonance : 1,
        lfoWaveform: savedLfoWaveform || 'sine',
        lfoRate: savedLfoRate !== undefined ? savedLfoRate : 5,
        lfoPitchDepth: savedLfoPitchDepth !== undefined ? savedLfoPitchDepth : 0,
        lfoFilterDepth: savedLfoFilterDepth !== undefined ? savedLfoFilterDepth : 0,
        delayTime: savedDelayTime !== undefined ? savedDelayTime : 0.5,
        delayFeedback: savedDelayFeedback !== undefined ? savedDelayFeedback : 0.3,
        delayMix: savedDelayMix !== undefined ? savedDelayMix : 0,
        reverbMix: savedReverbMix !== undefined ? savedReverbMix : 0
    }
  };
}

function saveArpeggioSettings(){const s={currentArpeggioStyle,arpeggioBPM,noteInterval,externalBPM};try{localStorage.setItem(ARPEGGIO_SETTINGS_KEY,JSON.stringify(s));}catch(e){console.error("Erro ao salvar config de arpejo:", e);}}
function loadArpeggioSettings(){
    try{
        const s=JSON.parse(localStorage.getItem(ARPEGGIO_SETTINGS_KEY));
        if(s){
            currentArpeggioStyle = s.currentArpeggioStyle || "UP";
            arpeggioBPM = parseInt(s.arpeggioBPM, 10) || 120;
            noteInterval = parseInt(s.noteInterval, 10) || (60000 / arpeggioBPM); // Adicionado fallback para noteInterval
        } else { // Valores padrão se não houver nada salvo
            currentArpeggioStyle = "UP";
            arpeggioBPM = 120;
            noteInterval = 60000 / arpeggioBPM;
        }
    }catch(e){ // Valores padrão em caso de erro de parse
        currentArpeggioStyle = "UP";
        arpeggioBPM = 120;
        noteInterval = 60000 / arpeggioBPM;
        console.error("Erro ao carregar configs de arpejo:", e);
    }
    if(arpeggioStyleSelect) arpeggioStyleSelect.value = currentArpeggioStyle;
    updateBPMValues(arpeggioBPM); // Garante que os sliders e displays sejam atualizados
}

function updateBPMValues(newBPM) { /* ... (conteúdo original de main59.js) ... */ }
function updateNoteIntervalValues(newInterval) { /* ... (conteúdo original de main59.js) ... */ }
function populateArpeggioStyleSelect(){ /* ... (conteúdo original de main59.js) ... */ }

window.addEventListener('DOMContentLoaded', () => {
    logDebug("DOM Carregado. Iniciando main60.js...");
    console.log("DOM Carregado. Iniciando main60.js (v60)...");
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
    setupEventListeners(); // Configura o novo internalAudioButtonClickHandler para o botão
    initSynthControlsSidebar();

    // Lógica de inicialização de áudio e synth no DOMContentLoaded:
    // A principal inicialização de áudio agora ocorre através do internalAudioButtonClickHandler.
    // No entanto, se o AudioContext já estiver 'running' (ex: após um reload rápido da página
    // onde o navegador preservou o estado do AudioContext, ou se outra interação já o ativou),
    // queremos garantir que o SimpleSynth seja instanciado (se ainda não for) e que as
    // configurações de áudio salvas sejam aplicadas a ele.

    let audioCtx = getAudioContext(); // Tenta obter/criar via synth60.js
    if (audioCtx) { // Se audioCtx foi obtido/criado
        if (audioCtx.state === 'running') {
            console.log("DOMContentLoaded: AudioContext já está 'running'. Verificando SimpleSynth e aplicando configurações.");
            let synthInstance = getSimpleSynthInstance(); // Tenta obter/criar SimpleSynth
            if (synthInstance) {
                Object.keys(audioSettings).forEach(key => {
                    const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
                    if (typeof synthInstance[setterName] === 'function') {
                        synthInstance[setterName](audioSettings[key]);
                    } else if (key === 'masterVolume' && typeof synthInstance.setMasterVolume === 'function') {
                        synthInstance.setMasterVolume(audioSettings[key]);
                    }
                });
                updateModalSynthControls();
                updateSidebarSynthControls();
                console.log("DOMContentLoaded: Configurações do synth aplicadas (AudioContext já estava 'running').");
            } else {
                console.warn("DOMContentLoaded: AudioContext está 'running', mas SimpleSynth não pôde ser instanciado. O usuário precisará clicar no botão de áudio.");
            }
        } else if (audioCtx.state === 'suspended') {
            console.log("DOMContentLoaded: AudioContext está 'suspended'. O usuário precisará interagir (ex: clicar no botão de áudio) para ativá-lo.");
            // Nenhuma ação adicional aqui; o internalAudioButtonClickHandler lidará com o resume e criação do synth.
        }
    } else {
        console.warn("DOMContentLoaded: AudioContext não pôde ser obtido/criado inicialmente. O usuário precisará clicar no botão de áudio.");
    }

    setupOSC();
    currentCameraDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || null;
    if (currentCameraDeviceId === "null" || currentCameraDeviceId === "undefined") currentCameraDeviceId = null;
    initMidi().then(async () => { /* ... (conteúdo original de main59.js) ... */ }).catch(err => { /* ... (conteúdo original de main59.js) ... */ });
    populateArpeggioStyleSelect();
    if(oscLoopDurationInput) oscLoopDurationInput.value = oscLoopDuration;
    if(hudElement && !loadPersistentSetting('hudHidden', false) ) { /* ... (conteúdo original de main59.js) ... */ }
    else if (hudElement) { /* ... (conteúdo original de main59.js) ... */ }
    updateHUD();
    sendAllGlobalStatesOSC();
    if (oscLogTextarea) oscLogTextarea.value = `Log OSC - ${new Date().toLocaleTimeString()} - Configs Carregadas (v60).\n`;
    console.log("Iniciando loop de animação (v60) e finalizando DOMContentLoaded.");
    animationLoop();
});

function animationLoop() { /* ... (conteúdo original de main59.js) ... */ }
function startAudioRecording() { /* ... (conteúdo original de main59.js) ... */ }
let isStoppingDueToError = false;
function stopAudioRecording(dueToError = false) { /* ... (conteúdo original de main59.js) ... */ }
let isSavingAudio = false;
function saveRecordedAudio() { /* ... (conteúdo original de main59.js) ... */ }
let audioRecordingHUDTimer = null;
function updateAudioRecordingHUD(isRecording, isPaused, durationSeconds = 0, isSaved = false) { /* ... (conteúdo original de main59.js) ... */ }
// FINAL DO ARQUIVO main60.js
// Os comentários /* ... (conteúdo original de main59.js) ... */ indicam que o corpo dessas funções
// deve ser copiado da versão main59.js, pois não foram alterados por esta solicitação.
// As funções modificadas ou novas estão explícitas.
// As funções de synth60.js (getSimpleSynthInstance, getAudioContext, setInternalAudioEnabledState, SimpleSynth, etc.)
// são chamadas como se estivessem disponíveis globalmente, pois synth60.js é carregado antes.
