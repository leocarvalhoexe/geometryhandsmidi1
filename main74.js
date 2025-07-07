// ==========================================================================
// MIDI SHAPE MANIPULATOR v74 - main74.js
// ==========================================================================

// === CONFIGURAÇÕES GLOBAIS INICIAIS E ÁUDIO CONTEXT ===
let audioCtx = null;
let simpleSynth = null; // Instância do SimpleSynth de synth74.js
let _internalAudioEnabledMaster = false;
let currentAudioSourceView = 'shapes'; // 'shapes' ou 'beatmatrix'

// === DEBUGGING ===
const DEBUG_MODE = true; // Habilitado para desenvolvimento da v74
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
const sidebar = document.getElementById('sidebar');
const sidebarHandle = document.getElementById('sidebarHandle');
const mainCanvasContainer = document.getElementById('mainCanvasContainer');
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
let ctx = canvasElement ? canvasElement.getContext('2d') : null;
let hasWebGL2 = false;

class Shape {
  constructor(id, midiChannel) {
    this.id = id;
    this.centerX = canvasElement ? canvasElement.width / (this.id === 0 ? 4 : 1.333) : 320;
    this.centerY = canvasElement ? canvasElement.height / 2 : 240;
    this.radius = 100;
    this.sides = 100;
    this.activeMidiNotes = {};
    this.midiChannel = midiChannel;
    this.leftHandLandmarks = null;
    this.rightHandLandmarks = null;
    this.lastSideChangeTime = 0;
    this.activeGesture = null;
    this.currentPitchBend = 8192;
    this.reverbAmount = 0; this.delayAmount = 0; this.panValue = 64;
    this.brightnessValue = 64; this.modWheelValue = 0; this.resonanceValue = 0;
    this.lastSentReverb = -1; this.lastSentDelay = -1; this.lastSentPan = -1;
    this.lastSentBrightness = -1; this.lastSentModWheel = -1; this.lastSentResonance = -1;
    this.vertexOffsets = {};
    this.currentEdgeIndex = 0;
    this.lastNotePlayedTime = 0;
    this.lastArpeggioNotePlayedTime = 0;
    this.currentGestureName = "";
    this.avgDisp = 0;
    this.arpeggioDirection = 1;
    this.currentChordStepIndex = 0;
    this.arpSwingStep = 0;
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

let currentArpeggioStyle = "UP";
const ARPEGGIO_STYLES = ["UP", "DOWN", "UPDOWN", "RANDOM"];
let arpeggioBPM = 120;
let noteInterval = 60000 / arpeggioBPM;
let globalBPM = 120;
let arpRandomness = 0;
let arpSwing = 0;
let arpGhostNoteChance = 0;

let osc;
let oscStatus = "OSC Desconectado";
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
const APP_SETTINGS_KEY = 'midiShapeManipulatorV74Settings'; // ATUALIZADO para v74
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

let globalBpmSlider = null;
let globalBpmValueDisplay = null;

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
const closeOscConfigModal = document.getElementById('closeOscConfigModal'); // Renomeado para consistência
const oscHostInput = document.getElementById('oscHostInput');
const oscPortInput = document.getElementById('oscPortInput');
const saveOscConfigButton = document.getElementById('saveOscConfigButton');
const cameraSelectElement = document.getElementById('cameraSelect');
const playPauseButton = document.getElementById('playPauseButton');
const internalAudioToggleButton = document.getElementById('internalAudioToggleButton');

// V74: Beat Matrix elements (alguns já existem, outros são novos)
const toggleBeatMatrixButton = document.getElementById('toggleBeatMatrixButton');
const beatMatrixContainer = document.getElementById('beatMatrixContainer');
// Elementos de controle da Beat Matrix que main74.js pode precisar interagir ou inicializar
// Os IDs vêm de index74.html, que é uma fusão de index73 e beatmatrixexe_v77
const bmPlayStopButton = document.getElementById('bmPlayStopButton'); // Principal
const playStopButtonSecondary = document.getElementById('play-stop-button-secondary'); // Secundária
const bmBpmDisplay = document.getElementById('bmBpmDisplay'); // Principal
const bpmDisplaySecondary = document.getElementById('bpm-display-secondary'); // Secundária
const horizontalBpmFaderSVG = document.getElementById('horizontalBpmFaderSVG'); // Principal
const secondaryBpmFaderSVG = document.getElementById('secondaryBpmFaderSVG'); // Secundária
const bmBpmSlider = document.getElementById('bmBpmSlider'); // Slider de BPM da BM (se mantido como fallback ou controle direto)
const bmGlobalBpmSyncButton = document.getElementById('bmGlobalBpmSyncButton');
const bmMidiOutputSelect = document.getElementById('bmMidiOutputSelect');
// Controles da Barra Secundária (v77)
const secondaryNoteOffsetInput = document.getElementById('secondaryNoteOffsetInput');
const orientationBar2Select = document.getElementById('orientationBar2Select');
const directionBar2Select = document.getElementById('directionBar2Select');
// Controles de Barras Extras (v77)
const addExtraBarButton = document.getElementById('add-extra-bar-button');
const extraBarsControlsContainer = document.getElementById('extra-bars-controls-container');
// Controles da Grid (alguns podem ser gerenciados por beatmatrix74.js, mas IDs são úteis)
const bmRowsInput = document.getElementById('bmRowsInput');
const bmColsInput = document.getElementById('bmColsInput');
const bmPadSizeInput = document.getElementById('bmPadSizeInput');


let currentCameraDeviceId = null;
let mediaStream = null;
let hands;
let camera;

let midiAccess = null;
let midiOutput = null; // Saída MIDI principal (para formas)
let midiInput = null;
let availableMidiOutputs = new Map();
let availableMidiInputs = new Map();

const SCALES = { PENTATONIC_MAJ: { name: 'Pent. Maior', notes: [0, 2, 4, 7, 9], baseMidiNote: 60 }, DORIAN: { name: 'Dórico', notes: [0, 2, 3, 5, 7, 9, 10], baseMidiNote: 60 }, HARMONIC_MINOR: { name: 'Menor Harm.', notes: [0, 2, 3, 5, 7, 8, 11], baseMidiNote: 57 }, CHROMATIC: { name: 'Cromática', notes: [0,1,2,3,4,5,6,7,8,9,10,11], baseMidiNote: 60 } };
let currentScaleName = 'PENTATONIC_MAJ';
const NOTE_MODES = ['SEQUENTIAL', 'ARPEGGIO', 'CHORD', 'RANDOM_WALK'];
let currentNoteMode = 'SEQUENTIAL';
let isPlayingShapes = false;

const MAX_GESTURE_MAPPINGS = 3;
let gestureMappings = [];
const GESTURE_MAPPING_STORAGE_KEY = 'gestureMappingSettingsV63';

let mediaRecorder;
let audioChunks = [];
let isAudioRecording = false;
let isAudioPaused = false;

// --- Inicialização e Funções ---
function resizeCanvas() {
  if (!canvasElement || !mainCanvasContainer) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = mainCanvasContainer.getBoundingClientRect();
  canvasElement.width = rect.width * dpr;
  canvasElement.height = rect.height * dpr;
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  logDebug(`Canvas resized to: ${canvasElement.width}x${canvasElement.height} (Display: ${rect.width}x${rect.height}, DPR: ${dpr})`);
}

function distance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1)**2 + (y2 - y1)**2); }
function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) { return Math.abs(distance(x, y, cx, cy) - r) <= tolerance; }

// --- Funções de Desenho e Lógica das Formas (Adaptadas de main73.js) ---
function drawShape(shape, isPulsing, pulseValue) {
  if (!ctx || beatMatrixContainer.classList.contains('visible')) return;
  ctx.beginPath(); const fingertips = [4, 8, 12, 16, 20]; const maxInfluence = 150; const maxForce = 25; const cx = shape.centerX; const cy = shape.centerY; let r = shape.radius; if (isPulsing) r = shape.radius * (1 + 0.25 * pulseValue); r = Math.max(10, r); let useLiquify = shape.rightHandLandmarks && !spectatorModeActive && shape.activeGesture === 'liquify'; let currentTotalDispMag = 0; let activeLiquifyPts = 0;
  for (let i = 0; i < shape.sides; i++) {
    const angle = (i / shape.sides) * Math.PI * 2; let vx = r * Math.cos(angle); let vy = r * Math.sin(angle); let dx = 0; let dy = 0;
    if (useLiquify) { const vCanvasX = cx + vx; const vCanvasY = cy + vy; for (const tipIdx of fingertips) { if (!shape.rightHandLandmarks[tipIdx]) continue; const tip = shape.rightHandLandmarks[tipIdx]; const tipX = canvasElement.width - (tip.x * canvasElement.width); const tipY = tip.y * canvasElement.height; const dist = distance(vCanvasX, vCanvasY, tipX, tipY); if (dist < maxInfluence && dist > 0) { const force = maxForce * (1 - dist / maxInfluence); dx += (vCanvasX - tipX) / dist * force; dy += (vCanvasY - tipY) / dist * force; activeLiquifyPts++; } } }
    if (vertexPullModeActive && shape.vertexOffsets[i] && !spectatorModeActive) { dx += shape.vertexOffsets[i].x; dy += shape.vertexOffsets[i].y; } currentTotalDispMag += Math.sqrt(dx**2 + dy**2); const finalX = cx + vx + dx; const finalY = cy + vy + dy; if (i === 0) ctx.moveTo(finalX, finalY); else ctx.lineTo(finalX, finalY);
  }
  ctx.closePath(); ctx.strokeStyle = shape.id === 0 ? '#00FFFF' : '#FF00FF'; ctx.lineWidth = 2.5; ctx.stroke();
  if (shape.currentGestureName && !spectatorModeActive) { ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.fillText(shape.currentGestureName, shape.centerX, shape.centerY - shape.radius - 15); }
  if ((currentNoteMode === 'ARPEGGIO' || currentNoteMode === 'SEQUENTIAL' || currentNoteMode === 'CHORD') && shape.sides > 0 && midiEnabled) { let key; if (currentNoteMode === 'ARPEGGIO') { key = `shape_${shape.id}_arp_${shape.currentEdgeIndex}`; } else if (currentNoteMode === 'SEQUENTIAL') { key = `shape_${shape.id}_seq_${shape.currentEdgeIndex}`; } else { const activeChordNoteKey = Object.keys(shape.activeMidiNotes).find(k => { const noteInfo = shape.activeMidiNotes[k]; return noteInfo && noteInfo.playing && noteInfo.isChordNote && noteInfo.vertexIndex === shape.currentEdgeIndex; }); if (activeChordNoteKey) key = activeChordNoteKey; } if (key && shape.activeMidiNotes[key]?.playing) { const angle = (shape.currentEdgeIndex / shape.sides) * Math.PI * 2; let vx = r * Math.cos(angle); let vy = r * Math.sin(angle); let ox = 0; let oy = 0; if (vertexPullModeActive && shape.vertexOffsets[shape.currentEdgeIndex] && !spectatorModeActive) { ox = shape.vertexOffsets[shape.currentEdgeIndex].x; oy = shape.vertexOffsets[shape.currentEdgeIndex].y; } ctx.beginPath(); ctx.arc(cx + vx + ox, cy + vy + oy, 8, 0, Math.PI * 2); ctx.fillStyle = shape.id === 0 ? 'rgba(0,255,255,0.6)' : 'rgba(255,0,255,0.6)'; ctx.fill(); } else if (currentNoteMode === 'CHORD' && shape.sides > 0 && Object.values(shape.activeMidiNotes).some(ni => ni.playing && ni.isChordNote && ni.vertexIndex === shape.currentEdgeIndex) ) { const angle = (shape.currentEdgeIndex / shape.sides) * Math.PI * 2; let vx = r * Math.cos(angle); let vy = r * Math.sin(angle); let ox = 0; let oy = 0; if (vertexPullModeActive && shape.vertexOffsets[shape.currentEdgeIndex] && !spectatorModeActive) { ox = shape.vertexOffsets[shape.currentEdgeIndex].x; oy = shape.vertexOffsets[shape.currentEdgeIndex].y; } ctx.beginPath(); ctx.arc(cx + vx + ox, cy + vy + oy, 8, 0, Math.PI * 2); ctx.fillStyle = shape.id === 0 ? 'rgba(0,255,255,0.6)' : 'rgba(255,0,255,0.6)'; ctx.fill(); } }
  const rawAvgDisp = (activeLiquifyPts > 0) ? currentTotalDispMag / activeLiquifyPts : (Object.keys(shape.vertexOffsets).length > 0 ? currentTotalDispMag / Object.keys(shape.vertexOffsets).length : 0); shape.avgDisp = shape.avgDisp * 0.8 + rawAvgDisp * 0.2;
  const maxDistortion = 50.0; const pitchBendSens = 4096; shape.currentPitchBend = 8192 + Math.round(Math.min(1.0, shape.avgDisp / maxDistortion) * pitchBendSens); shape.currentPitchBend = Math.max(0, Math.min(16383, shape.currentPitchBend)); const normDistortion = Math.min(1.0, shape.avgDisp / maxDistortion); shape.reverbAmount = Math.round(normDistortion * 127); shape.delayAmount = Math.round(normDistortion * 127); shape.modWheelValue = Math.round(normDistortion * 127); shape.resonanceValue = Math.round(normDistortion * 127); shape.panValue = Math.max(0, Math.min(127, Math.round((shape.centerX / canvasElement.width) * 127))); let normSides = (shape.sides - 3) / (20 - 3); normSides = Math.max(0, Math.min(1, normSides)); if (shape.sides === 100) normSides = 0.5; shape.brightnessValue = Math.round(normSides * 127);
  processShapeNotes(shape, isPulsing, pulseValue);
  Object.keys(shape.activeMidiNotes).forEach(key => { const noteInfo = shape.activeMidiNotes[key]; let shouldDelete = false; if (!noteInfo) { shouldDelete = true; } else if (!noteInfo.playing || !midiEnabled || shape.sides <= 0 || spectatorModeActive) { if (noteInfo.playing) { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1, 'shapes'); noteInfo.playing = false; } shouldDelete = true; } else if (noteInfo.isSequentialNote && currentNoteMode !== 'SEQUENTIAL') { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1, 'shapes'); noteInfo.playing = false; shouldDelete = true; } else if (noteInfo.isArpeggioNote && currentNoteMode !== 'ARPEGGIO') { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1, 'shapes'); noteInfo.playing = false; shouldDelete = true; } if (shouldDelete) { delete shape.activeMidiNotes[key]; } });
}

function getNoteInScale(index, baseOctaveOffset = 0) { /* ... (mesma lógica da v73) ... */
  const scale = SCALES[currentScaleName]; const scaleNotes = scale.notes; const len = scaleNotes.length; const octave = baseOctaveOffset + Math.floor(index / len); const noteIdx = index % len; return Math.max(0, Math.min(127, scale.baseMidiNote + scaleNotes[noteIdx] + (octave * 12)));
}

function processShapeNotes(shape, isPulsing, pulseValue) { /* ... (mesma lógica da v73) ... */
    if (spectatorModeActive || !midiEnabled || shape.sides <= 0 || !isPlayingShapes || currentAudioSourceView !== 'shapes') {
        if (!isPlayingShapes && currentAudioSourceView === 'shapes') { stopAllNotesForShape(shape, true); }
        return;
    }
    const now = performance.now(); let baseNoteIntervalForArp = 60000 / arpeggioBPM; let currentEffectiveNoteInterval = baseNoteIntervalForArp;
    if (currentNoteMode === 'ARPEGGIO' && arpSwing > 0) { const swingRatio = arpSwing / 100; const swingFactor = swingRatio * 0.66; if (shape.arpSwingStep % 2 === 0) { currentEffectiveNoteInterval = baseNoteIntervalForArp * (1 + swingFactor); } else { currentEffectiveNoteInterval = baseNoteIntervalForArp * (1 - swingFactor); } } else { currentEffectiveNoteInterval = (currentNoteMode === 'ARPEGGIO') ? baseNoteIntervalForArp : noteInterval; }
    const canPlayArp = currentNoteMode === 'ARPEGGIO' && shape.sides > 0 && (now - shape.lastArpeggioNotePlayedTime > currentEffectiveNoteInterval); const canPlayNonArp = currentNoteMode !== 'ARPEGGIO' && (now - shape.lastNotePlayedTime > currentEffectiveNoteInterval);

    if (canPlayArp || canPlayNonArp) {
        let notesToPlayData = []; let edgeIdx = shape.currentEdgeIndex; let notePlayedThisTick = false; let calculatedNote;
        if (!staccatoModeActive) { Object.keys(shape.activeMidiNotes).forEach(key => { const noteInfo = shape.activeMidiNotes[key]; if (noteInfo && noteInfo.playing && !noteInfo.staccatoTimer) { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1, 'shapes'); noteInfo.playing = false; } }); }
        switch (currentNoteMode) {
            case 'SEQUENTIAL': if (canPlayNonArp && shape.sides > 0) { shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides; edgeIdx = shape.currentEdgeIndex; if (shape.sides === 100) { calculatedNote = Math.min(127, Math.max(0, Math.round((edgeIdx / (shape.sides - 1)) * 127))); } else { calculatedNote = getNoteInScale(edgeIdx); } notesToPlayData.push({ note: calculatedNote, vertexIndex: edgeIdx, isSequential: true }); notePlayedThisTick = true; shape.lastNotePlayedTime = now; } break;
            case 'ARPEGGIO': if (canPlayArp && shape.sides > 0) { if (shape.sides < 1) break; shape.arpSwingStep++; if (arpRandomness > 0 && Math.random() < arpRandomness / 100) { shape.currentEdgeIndex = Math.floor(Math.random() * shape.sides); } else { if (currentArpeggioStyle === "UP") { shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides; } else if (currentArpeggioStyle === "DOWN") { shape.currentEdgeIndex = (shape.currentEdgeIndex - 1 + shape.sides) % shape.sides; } else if (currentArpeggioStyle === "UPDOWN") { if (shape.sides === 1) { shape.currentEdgeIndex = 0; } else { if (shape.arpeggioDirection === 1) { if (shape.currentEdgeIndex >= shape.sides - 1) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.arpeggioDirection = -1; } else { shape.currentEdgeIndex++; } } else { if (shape.currentEdgeIndex <= 0) { shape.currentEdgeIndex = 0; shape.arpeggioDirection = 1; } else { shape.currentEdgeIndex--; } } } } else if (currentArpeggioStyle === "RANDOM") { shape.currentEdgeIndex = Math.floor(Math.random() * shape.sides); } } edgeIdx = shape.currentEdgeIndex; if (shape.sides === 100) { calculatedNote = Math.min(127, Math.max(0, Math.round((edgeIdx / (shape.sides -1)) * 127))); } else { calculatedNote = getNoteInScale(edgeIdx); } notesToPlayData.push({ note: calculatedNote, vertexIndex: edgeIdx, isArpeggio: true }); notePlayedThisTick = true; shape.lastArpeggioNotePlayedTime = now; } break;
            case 'CHORD': if (canPlayNonArp && shape.sides > 0) { const baseVertexIndex = shape.currentEdgeIndex; const chordNotesDefinition = [0, 2, 4]; let baseNoteForChordPart; if (shape.sides === 100) { const baseMidiNoteForCircleChord = Math.min(127, Math.max(0, Math.round((baseVertexIndex / (shape.sides - 1)) * 127))); baseNoteForChordPart = baseMidiNoteForCircleChord + chordNotesDefinition[shape.currentChordStepIndex]; calculatedNote = Math.max(0, Math.min(127, baseNoteForChordPart)); } else { calculatedNote = getNoteInScale(baseVertexIndex + chordNotesDefinition[shape.currentChordStepIndex]); } notesToPlayData.push({ note: calculatedNote, vertexIndex: baseVertexIndex, isChordNote: true, chordPart: shape.currentChordStepIndex }); shape.currentChordStepIndex++; if (shape.currentChordStepIndex >= chordNotesDefinition.length) { shape.currentChordStepIndex = 0; shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides; } notePlayedThisTick = true; shape.lastNotePlayedTime = now; } break;
            case 'RANDOM_WALK': if (canPlayNonArp) { let randomWalkIndex = shape.currentEdgeIndex; randomWalkIndex += Math.floor(Math.random() * 3) - 1; if (shape.sides === 100) { randomWalkIndex = Math.max(0, Math.min(127, randomWalkIndex)); calculatedNote = randomWalkIndex; } else { const scaleNoteCount = SCALES[currentScaleName].notes.length * 2; randomWalkIndex = (randomWalkIndex % scaleNoteCount + scaleNoteCount) % scaleNoteCount; calculatedNote = getNoteInScale(randomWalkIndex); } shape.currentEdgeIndex = randomWalkIndex; notesToPlayData.push({ note: calculatedNote, vertexIndex: randomWalkIndex, isRandomWalk: true }); notePlayedThisTick = true; shape.lastNotePlayedTime = now; } break;
        }

        if (notePlayedThisTick && notesToPlayData.length > 0) {
            let baseVel = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * (97 / 270)))); if (isPulsing) baseVel = Math.max(0, Math.min(127, Math.round(baseVel * (0.6 + ((pulseValue + 1) / 2) * 0.4))));
            notesToPlayData.forEach((noteData) => {
                let finalVel = baseVel; let playThisNote = true; if (noteData.isArpeggio && arpGhostNoteChance > 0 && Math.random() < arpGhostNoteChance / 100) { if (Math.random() < 0.3) { playThisNote = false; } else { finalVel = Math.max(1, Math.round(baseVel * 0.1)); } }
                if (playThisNote) {
                    const noteToPlay = noteData.note; const vertexIndex = noteData.vertexIndex; let key; if (noteData.isSequential) { key = `shape_${shape.id}_seq_${vertexIndex}`; } else if (noteData.isArpeggio) { key = `shape_${shape.id}_arp_${vertexIndex}`; } else if (noteData.isChordNote) { key = `shape_${shape.id}_chord_${vertexIndex}_part_${noteData.chordPart}`; } else if (noteData.isRandomWalk) { key = `shape_${shape.id}_rw_${vertexIndex}_note_${noteToPlay}`; } else { key = `shape_${shape.id}_other_${vertexIndex}_note_${noteToPlay}`; }
                    sendMidiNoteOn(noteToPlay, finalVel, shape.midiChannel, shape.id + 1, 'shapes'); shape.activeMidiNotes[key] = { note: noteToPlay, playing: true, staccatoTimer: null, isSequentialNote: !!noteData.isSequential, isArpeggioNote: !!noteData.isArpeggio, isChordNote: !!noteData.isChordNote, isRandomWalkNote: !!noteData.isRandomWalk, vertexIndex: vertexIndex, timestamp: now };
                    if (staccatoModeActive) { /* ... staccato logic ... */ }
                }
            });
            if (shape.currentPitchBend !== 8192) sendPitchBend(shape.currentPitchBend, shape.midiChannel);
        }
    }
     let activeNotesExistForPitchBend = false; let lastKnownPitchBendForShape = 8192; for (const key in shape.activeMidiNotes) { if (shape.activeMidiNotes[key]?.playing) { activeNotesExistForPitchBend = true; lastKnownPitchBendForShape = shape.activeMidiNotes[key].lastPitchBend || 8192; break; } }
    if (activeNotesExistForPitchBend) { if (Math.abs(shape.currentPitchBend - lastKnownPitchBendForShape) > 10) { sendPitchBend(shape.currentPitchBend, shape.midiChannel); Object.values(shape.activeMidiNotes).forEach(ni => { if (ni && ni.playing) ni.lastPitchBend = shape.currentPitchBend; }); } }
}
function processResizeGesture(shape) { /* ... (mesma lógica da v73) ... */ return false;}
function processSidesGesture(shape) { /* ... (mesma lógica da v73) ... */ return false;}

// --- Funções MIDI (Adaptadas de main73.js) ---
async function initMidi() { /* ... (mesma lógica da v73) ... */
  try {
    if (navigator.requestMIDIAccess) {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      logDebug("MIDI Access Granted (v74)");
      updateMidiDeviceLists();
      midiAccess.onstatechange = (e) => {
        logDebug("MIDI state change (v74):", { port: e.port.name, type: e.port.type, state: e.port.state });
        updateMidiDeviceLists();
      };
    } else {
      console.warn("Web MIDI API não suportada (v74).");
    }
  } catch (error) {
    console.error("Não foi possível acessar MIDI (v74).", error);
  }
}

function updateMidiDeviceLists() { /* ... (mesma lógica da v73, mas chama populateBeatMatrixMidiOutputSelect de beatmatrix74.js) ... */
  availableMidiOutputs.clear();
  availableMidiInputs.clear();
  if (!midiAccess) return;

  midiAccess.outputs.forEach(output => availableMidiOutputs.set(output.id, output));
  midiAccess.inputs.forEach(input => availableMidiInputs.set(input.id, input));

  populateMidiOutputSelect(midiOutputSelect, (selectedId) => {
      midiOutput = availableMidiOutputs.get(selectedId) || null;
      if(midiOutput) logDebug("MIDI Output Global/Formas definido:", midiOutput.name);
  });

  // V74: beatmatrix74.js agora lida com seu próprio select MIDI.
  // Esta função pode ser chamada por beatmatrix74.js quando ele precisar da lista de saídas.
  if (typeof beatMatrix !== "undefined" && typeof beatMatrix.updateAvailableMidiOutputs === "function") {
      beatMatrix.updateAvailableMidiOutputs(availableMidiOutputs);
  } else if (typeof populateBeatMatrixMidiOutputSelect === "function") { // Fallback para compatibilidade com v73 se beatMatrix não estiver pronto
      populateBeatMatrixMidiOutputSelect(availableMidiOutputs);
  }


  populateMidiInputSelect();
}

function populateMidiOutputSelect(selectElement, callbackOnSelect) { /* ... (mesma lógica da v73) ... */
  if (!selectElement) return;
  const prevId = selectElement.value;
  if (selectElement) selectElement.innerHTML = '';

  if (availableMidiOutputs.size === 0) {
    selectElement.add(new Option("Nenhuma saída MIDI", "", true, true));
    if(callbackOnSelect) callbackOnSelect(null);
    return;
  }

  availableMidiOutputs.forEach(out => selectElement.add(new Option(out.name, out.id)));

  if (prevId && availableMidiOutputs.has(prevId)) {
    selectElement.value = prevId;
  } else if (selectElement.options.length > 0) {
    selectElement.selectedIndex = 0;
  }
  if(callbackOnSelect) callbackOnSelect(selectElement.value);
}

function populateMidiInputSelect() { /* ... (mesma lógica da v73) ... */
  if (!midiInputSelect) return;
  const prevId = midiInput ? midiInput.id : null;
  if (midiInputSelect) midiInputSelect.innerHTML = '';

  if (availableMidiInputs.size === 0) {
    if (midiInputSelect) midiInputSelect.add(new Option("Nenhuma entrada MIDI", "", true, true));
    setMidiInput(null);
    return;
  }
  if (midiInputSelect) availableMidiInputs.forEach(inp => midiInputSelect.add(new Option(inp.name, inp.id)));
  if (prevId && availableMidiInputs.has(prevId) && midiInputSelect) midiInputSelect.value = prevId;

  setMidiInput(availableMidiInputs.get(midiInputSelect ? midiInputSelect.value : null) || null);
}

function setMidiInput(inputPort) { /* ... (mesma lógica da v73) ... */
  if (midiInput) midiInput.onmidimessage = null;
  midiInput = inputPort;
  if (midiInput) {
    midiInput.onmidimessage = handleMidiMessage;
    logDebug("MIDI Input definido (v74):", midiInput.name);
  }
}
function handleMidiMessage(event) { /* ... (mesma lógica da v73) ... */ }

function sendMidiNoteOn(note, velocity, channel, shapeId = -1, source = 'shapes') { /* ... (mesma lógica da v73, mas beatMatrix.midiOut pode ser um array agora) ... */
  if (spectatorModeActive) return;
  const ch = Math.max(0, Math.min(15, channel));
  const n = Math.max(0, Math.min(127, Math.round(note)));
  const v = Math.max(0, Math.min(127, Math.round(velocity)));

  let targetMidiOutput = null;
  if (source === 'shapes' && midiOutput) {
    targetMidiOutput = midiOutput;
  } else if (source === 'beatmatrix') {
    // V74: beatMatrix pode ter múltiplas saídas. A lógica para qual usar será em beatmatrix74.js
    if (typeof beatMatrix !== "undefined" && beatMatrix.getMidiOutputForNote) { // Assumindo que beatmatrix74.js terá essa função
        targetMidiOutput = beatMatrix.getMidiOutputForNote(note, channel); // Exemplo
    } else if (typeof beatMatrix !== "undefined" && beatMatrix.midiOut) { // Compatibilidade com v73 se getMidiOutputForNote não existir
        targetMidiOutput = beatMatrix.midiOut; // Pode ser um objeto ou um array de saídas
    } else if (midiOutput) {
        targetMidiOutput = midiOutput;
    }
  }

  if (midiEnabled && targetMidiOutput) {
      // Se targetMidiOutput for um array (múltiplas saídas para a BM), iterar
      if (Array.isArray(targetMidiOutput)) {
          targetMidiOutput.forEach(out => { if (out) out.send([0x90 + ch, n, v]); });
      } else {
          targetMidiOutput.send([0x90 + ch, n, v]);
      }
  }

  if (_internalAudioEnabledMaster && simpleSynth && typeof simpleSynth.noteOn === 'function') {
    if (source === currentAudioSourceView) {
        simpleSynth.noteOn(n, v);
    }
  }

  if (source === 'shapes') {
    sendOSCMessage(`/forma/${shapeId}/noteOn`, n, v, ch);
    if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, v);
  } else if (source === 'beatmatrix') {
    sendOSCMessage(`/beatmatrix/noteOn`, n, v, ch);
    if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, v);
  }
}
function sendMidiNoteOff(note, channel, shapeId = -1, source = 'shapes') { /* ... (mesma lógica da v73, mas beatMatrix.midiOut pode ser um array) ... */
  if (spectatorModeActive) return;
  const ch = Math.max(0, Math.min(15, channel));
  const n = Math.max(0, Math.min(127, Math.round(note)));

  let targetMidiOutput = null;
   if (source === 'shapes' && midiOutput) {
    targetMidiOutput = midiOutput;
  } else if (source === 'beatmatrix') {
    if (typeof beatMatrix !== "undefined" && beatMatrix.getMidiOutputForNote) {
        targetMidiOutput = beatMatrix.getMidiOutputForNote(note, channel);
    } else if (typeof beatMatrix !== "undefined" && beatMatrix.midiOut) {
        targetMidiOutput = beatMatrix.midiOut;
    } else if (midiOutput) {
        targetMidiOutput = midiOutput;
    }
  }

  if (midiEnabled && targetMidiOutput) {
      if (Array.isArray(targetMidiOutput)) {
          targetMidiOutput.forEach(out => { if (out) out.send([0x80 + ch, n, 0]); });
      } else {
          targetMidiOutput.send([0x80 + ch, n, 0]);
      }
  }

  if (_internalAudioEnabledMaster && simpleSynth && typeof simpleSynth.noteOff === 'function') {
     if (source === currentAudioSourceView) {
        simpleSynth.noteOff(n);
    }
  }

  if (source === 'shapes') {
    sendOSCMessage(`/forma/${shapeId}/noteOff`, n, ch);
    if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, 0);
  } else if (source === 'beatmatrix') {
     sendOSCMessage(`/beatmatrix/noteOff`, n, ch);
     if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, 0);
  }
}

function sendPitchBend(bendValue, channel) { /* ... (mesma lógica da v73) ... */
  if (spectatorModeActive || !midiEnabled || !midiOutput) return;
  const ch = Math.max(0,Math.min(15,channel)); const bend = Math.max(0,Math.min(16383,Math.round(bendValue)));
  midiOutput.send([0xE0+ch, bend & 0x7F, (bend>>7)&0x7F]);
}
function sendMidiCC(cc, value, channel) { /* ... (mesma lógica da v73) ... */
  if (spectatorModeActive || !midiEnabled || !midiOutput) return;
  const ch = Math.max(0,Math.min(15,channel)); const c = Math.max(0,Math.min(119,Math.round(cc))); const v = Math.max(0,Math.min(127,Math.round(value)));
  midiOutput.send([0xB0+ch, c, v]);
}

function stopAllNotesForShape(shape, clearActiveMidiNotesObject = true) { /* ... (mesma lógica da v73) ... */
    if (!shape || spectatorModeActive) return;
    logDebug(`Parando todas as notas para a forma ${shape.id}. Limpar objeto: ${clearActiveMidiNotesObject}`);
    Object.keys(shape.activeMidiNotes).forEach(key => {
        const noteInfo = shape.activeMidiNotes[key];
        if (noteInfo && noteInfo.playing) { sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1, 'shapes'); noteInfo.playing = false; }
    });
    if (clearActiveMidiNotesObject) { shape.activeMidiNotes = {}; }
}
function turnOffAllActiveNotes() { /* ... (mesma lógica da v73, mas chama beatMatrix.turnOffAllNotes de beatmatrix74.js) ... */
  if (spectatorModeActive) return;
  logDebug("Desligando todas as notas ativas (MIDI e Interno) - v74.");
  const origMidiEnabled = midiEnabled;
  midiEnabled = true;

  shapes.forEach(shape => stopAllNotesForShape(shape, true));

  if (typeof beatMatrix !== "undefined" && typeof beatMatrix.turnOffAllNotes === "function") {
    beatMatrix.turnOffAllNotes(false);
  }

  if (simpleSynth && typeof simpleSynth.allNotesOff === 'function') {
    simpleSynth.allNotesOff();
  }
  midiEnabled = origMidiEnabled;
  updateHUD();
}


// --- Funções OSC (Adaptadas de main73.js) ---
function setupOSC() { /* ... (mesma lógica da v73) ... */ }
function sendOSCMessage(address, ...args) { /* ... (mesma lógica da v73) ... */ }
function logOSC(source, address, args, isSeparator = false) { /* ... (mesma lógica da v73) ... */ }

// --- Funções de Câmera e MediaPipe (Adaptadas de main73.js) ---
async function initializeCamera(deviceId = null) { /* ... (mesma lógica da v73) ... */ }
async function populateCameraSelect() { /* ... (mesma lógica da v73) ... */ }
function onResults(results) { /* ... (mesma lógica da v73, mas chama updateHUD de main74.js) ... */
  if (!ctx) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = document.body.classList.contains('theme-light') ? 'rgba(232,232,238,0.08)' : 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, 0, canvasElement.width / (window.devicePixelRatio || 1), canvasElement.height / (window.devicePixelRatio || 1) );
  ctx.restore();

  if (beatMatrixContainer.classList.contains('visible')) {
      updateHUD();
      return;
  }
  shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; s.currentGestureName = ""; });
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) { if (operationMode === 'one_person') { let lH = null, rH = null; results.multiHandLandmarks.forEach((landmarks, i) => { if (!spectatorModeActive) drawLandmarks(landmarks, results.multiHandedness[i]?.label); const handedness = results.multiHandedness[i]?.label; if (handedness === "Left" && !lH) lH = landmarks; else if (handedness === "Right" && !rH) rH = landmarks; }); shapes[0].leftHandLandmarks = lH; shapes[0].rightHandLandmarks = rH; if (shapes.length > 1) { shapes[1].leftHandLandmarks = null; shapes[1].rightHandLandmarks = null; } } else { let assignedL = [false,false], assignedR = [false,false]; results.multiHandLandmarks.forEach((landmarks, i) => { if (!spectatorModeActive) drawLandmarks(landmarks, results.multiHandedness[i]?.label); const handedness = results.multiHandedness[i]?.label; for(let j=0; j<shapes.length; j++){ if(handedness === "Left" && !shapes[j].leftHandLandmarks && !assignedL[j]) { shapes[j].leftHandLandmarks = landmarks; assignedL[j]=true; break; } if(handedness === "Right" && !shapes[j].rightHandLandmarks && !assignedR[j]) { shapes[j].rightHandLandmarks = landmarks; assignedR[j]=true; break; } } }); } }
  shapes.forEach(shape => { if (spectatorModeActive) { shape.activeGesture = null; return; } let gestureProcessed = false; let currentGesture = null; let wristCount = 0; let avgWristX = 0; let avgWristY = 0; if (shape.leftHandLandmarks?.[0]) { avgWristX += shape.leftHandLandmarks[0].x; avgWristY += shape.leftHandLandmarks[0].y; wristCount++; } if (shape.rightHandLandmarks?.[0]) { avgWristX += shape.rightHandLandmarks[0].x; avgWristY += shape.rightHandLandmarks[0].y; wristCount++; } if (wristCount > 0) { const targetCenterX = canvasElement.width - (avgWristX/wristCount * canvasElement.width); const targetCenterY = avgWristY/wristCount * canvasElement.height; shape.centerX = shape.centerX * 0.92 + targetCenterX * 0.08; shape.centerY = shape.centerY * 0.92 + targetCenterY * 0.08; } if (!gestureProcessed) { if (processResizeGesture(shape)) { currentGesture = 'resize'; gestureProcessed = true; } } if (!gestureProcessed) { if (processSidesGesture(shape)) { currentGesture = 'sides'; gestureProcessed = true; } } if (!gestureProcessed && shape.rightHandLandmarks) { currentGesture = 'liquify'; shape.currentGestureName = "Distorcer"; } const oscGesture = currentGesture || 'none'; if (shape.lastSentActiveGesture !== oscGesture) { sendOSCMessage(`/forma/${shape.id+1}/gestureActivated`, oscGesture); shape.lastSentActiveGesture = oscGesture; } shape.activeGesture = currentGesture; });
  let pVal = 0; if(pulseModeActive) { pulseTime = performance.now()*0.001; pVal = Math.sin(pulseTime*pulseFrequency*2*Math.PI); } shapes.forEach(s => drawShape(s, pulseModeActive, pVal));
  updateHUD();
}
function drawLandmarks(landmarksArray, handedness = "Unknown") { /* ... (mesma lógica da v73) ... */ }
function drawFallbackAnimation() { /* ... (mesma lógica da v73) ... */ }

// --- Funções de Controle e UI (Adaptadas de main73.js) ---
function updateHUD() { /* ... (mesma lógica da v73, mas pode precisar de infos da BM com múltiplas barras) ... */
  if (!hudElement || hudElement.classList.contains('hidden')) return;
  let txt = "";
  if (spectatorModeActive) txt += `<b>👓 MODO ESPECTADOR</b><br>`;
  const audioIcon = _internalAudioEnabledMaster && audioCtx && audioCtx.state === 'running' ? '🟢' : '🔴';
  const audioStatusText = _internalAudioEnabledMaster && audioCtx && audioCtx.state === 'running' ? (simpleSynth?.waveform || 'ON') : 'OFF';
  const audioStatusClass = _internalAudioEnabledMaster && audioCtx && audioCtx.state === 'running' ? 'status-ok' : 'status-error';
  txt += `Áudio: ${audioIcon} <span class="${audioStatusClass}">${audioStatusText}</span> (${currentAudioSourceView}) | `;

  const midiStatusIcon = midiAccess && (midiOutput || (typeof beatMatrix !== "undefined" && beatMatrix.hasActiveMidiOutput && beatMatrix.hasActiveMidiOutput())) ? '🟢' : '🔴';
  let midiOutName = "OFF";
  if (midiEnabled) {
      if (currentAudioSourceView === 'shapes' && midiOutput) midiOutName = midiOutput.name || 'ON';
      else if (currentAudioSourceView === 'beatmatrix' && typeof beatMatrix !== "undefined" && beatMatrix.getMidiOutputInfo) {
          midiOutName = beatMatrix.getMidiOutputInfo() || 'ON (BM)'; // beatmatrix74.js pode fornecer um resumo
      } else if (midiOutput) midiOutName = `Global: ${midiOutput.name || 'ON'}`;
  }
  txt += `MIDI: ${midiStatusIcon} <span class="${midiAccess && (midiOutput || (typeof beatMatrix !== "undefined" && beatMatrix.hasActiveMidiOutput && beatMatrix.hasActiveMidiOutput())) ? 'status-ok':'status-error'}">${midiOutName}</span> | `;

  const oscConnected = osc && osc.status() === OSC.STATUS.IS_OPEN;
  const oscStatusIcon = oscConnected ? '🟢' : (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? '🟠' : '🔴');
  txt += `OSC: ${oscStatusIcon} <span class="${oscConnected ? 'status-ok': (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? 'status-warn' : 'status-error')}">${oscStatus}</span><br>`;

  if (currentAudioSourceView === 'shapes') {
    shapes.forEach(s => { txt += `<b>F${s.id+1}:</b> R:${s.radius.toFixed(0)} L:${s.sides===100?"○":s.sides} Gest:${spectatorModeActive?"-":(s.activeGesture||"Nenhum")} Idx:${s.currentEdgeIndex}<br>`; });
  } else if (currentAudioSourceView === 'beatmatrix' && typeof beatMatrix !== "undefined" && beatMatrix.getHUDInfo) {
    txt += beatMatrix.getHUDInfo(); // beatmatrix74.js fornecerá a string formatada
  } else if (currentAudioSourceView === 'beatmatrix' && typeof beatMatrix !== "undefined") { // Fallback
    txt += `<b>BeatMatrix:</b> ${beatMatrix.isPlaying ? '▶️' : '⏹️'} BPM:${beatMatrix.currentBPM?.toFixed(0) || 'N/A'} Grid:${beatMatrix.rows}x${beatMatrix.cols} Pad:${beatMatrix.padSize}px <br>`;
  }
  txt += `<b>Global:</b> BPM:${globalBPM.toFixed(0)} | Arp Formas:${isPlayingShapes?'▶️':'⏹️'} | Escala:${SCALES[currentScaleName].name}<br>`;
  let textSpan = hudElement.querySelector('span#hudTextContent'); if (!textSpan) { textSpan = document.createElement('span'); textSpan.id = 'hudTextContent'; hudElement.prepend(textSpan); } textSpan.innerHTML = txt;
}

function toggleMidiEnabled(){ /* ... (mesma lógica da v73) ... */ }
function togglePlayPauseShapes() { /* ... (mesma lógica da v73, mas usa beatMatrix.togglePlayback de beatmatrix74.js) ... */
    if (spectatorModeActive) return;
    if (beatMatrixContainer.classList.contains('visible') && typeof beatMatrix !== "undefined" && beatMatrix.isPlaying) {
        beatMatrix.togglePlayback(); // Assume que esta função para a barra principal da BM
    }
    if (currentAudioSourceView !== 'shapes') {
        currentAudioSourceView = 'shapes';
        if (simpleSynth) simpleSynth.allNotesOff();
        logDebug("Fonte de áudio mudada para 'shapes' ao dar play nas formas.");
    }

    isPlayingShapes = !isPlayingShapes;
    if (isPlayingShapes) {
        if (!audioCtx || audioCtx.state === 'suspended') {
             internalAudioToggleButton.click();
        }
        const now = performance.now();
        shapes.forEach(shape => {
            shape.lastNotePlayedTime = now - (noteInterval + 100);
            shape.lastArpeggioNotePlayedTime = now - (60000 / arpeggioBPM + 100);
        });
        if (playPauseButton) playPauseButton.innerHTML = "⏸️ Pause Formas";
        logOSC("SYSTEM", "Sequencer Formas Iniciado", []);
    } else {
        turnOffAllActiveNotes();
        if (playPauseButton) playPauseButton.innerHTML = "▶️ Play Formas";
        logOSC("SYSTEM", "Sequencer Formas Pausado", []);
    }
    savePersistentSetting('isPlayingShapes', isPlayingShapes);
    savePersistentSetting('currentAudioSourceView', currentAudioSourceView);
    updateHUD();
}

function toggleBeatMatrixVisibility() { /* ... (mesma lógica da v73, mas chama beatMatrix.onShow e beatMatrix.togglePlayback de beatmatrix74.js) ... */
    const isVisible = beatMatrixContainer.classList.toggle('visible');
    toggleBeatMatrixButton.classList.toggle('active', isVisible);
    toggleBeatMatrixButton.classList.toggle('info-active', isVisible);

    if (isVisible) {
        if (isPlayingShapes) {
            togglePlayPauseShapes();
        }
        currentAudioSourceView = 'beatmatrix';
        if (simpleSynth) simpleSynth.allNotesOff();
        if (typeof beatMatrix !== "undefined" && typeof beatMatrix.onShow === "function") {
            beatMatrix.onShow(globalBPM, availableMidiOutputs, simpleSynth);
        }
        logDebug("Beat Matrix visível. Fonte de áudio: beatmatrix.");
        mainCanvasContainer.style.zIndex = '0';
    } else {
        if (typeof beatMatrix !== "undefined" && beatMatrix.isPlaying) { // Verifica se a BM principal está tocando
            beatMatrix.togglePlayback(); // Para a BM principal
        }
        // Adicionalmente, parar barras secundárias e extras se existirem e estiverem tocando
        if (typeof beatMatrix !== "undefined" && beatMatrix.stopAllBars) {
            beatMatrix.stopAllBars();
        }

        currentAudioSourceView = 'shapes';
        if (simpleSynth) simpleSynth.allNotesOff();
        logDebug("Beat Matrix oculta. Fonte de áudio: shapes.");
        mainCanvasContainer.style.zIndex = '';
    }
    savePersistentSetting('beatMatrixVisible', isVisible);
    savePersistentSetting('currentAudioSourceView', currentAudioSourceView);
    updateHUD();
}

// --- Funções de Configuração e Persistência (Adaptadas de main73.js) ---
function savePersistentSetting(key,value){ /* ... (mesma lógica da v73) ... */ }
function loadPersistentSetting(key,defaultValue){ /* ... (mesma lógica da v73) ... */ }
function saveAllPersistentSettings(){ /* ... (mesma lógica da v73, mas beatmatrix74.js salva suas configs) ... */
  savePersistentSetting('isPlayingShapes', isPlayingShapes);
  savePersistentSetting('beatMatrixVisible', beatMatrixContainer.classList.contains('visible'));
  savePersistentSetting('currentAudioSourceView', currentAudioSourceView);
  savePersistentSetting('globalBPM', globalBPM);
  logDebug("Configurações V74 salvas.");
}
function loadAllPersistentSettings(){ /* ... (mesma lógica da v73) ... */
  isPlayingShapes = loadPersistentSetting('isPlayingShapes', false);
  currentAudioSourceView = loadPersistentSetting('currentAudioSourceView', 'shapes');
  globalBPM = loadPersistentSetting('globalBPM', 120);
  logDebug("Configurações V74 carregadas.");
  return { /* ... */ };
}

function updateGlobalBPM(newBpm) { /* ... (mesma lógica da v73, mas chama beatMatrix.updateGlobalBPMReference de beatmatrix74.js) ... */
    globalBPM = Math.max(30, Math.min(300, parseInt(newBpm, 10)));
    if (globalBpmSlider) globalBpmSlider.value = globalBPM;
    if (globalBpmValueDisplay) globalBpmValueDisplay.textContent = globalBPM;

    arpeggioBPM = globalBPM;
    noteInterval = Math.round(60000 / arpeggioBPM);
    if (arpPanelBPMSlider) arpPanelBPMSlider.value = arpeggioBPM;
    if (arpPanelBPMValueSpan) arpPanelBPMValueSpan.textContent = arpeggioBPM;

    if (typeof beatMatrix !== "undefined" && typeof beatMatrix.updateGlobalBPMReference === "function") {
        beatMatrix.updateGlobalBPMReference(globalBPM);
    }

    saveAllPersistentSettings();
    updateHUD();
    sendOSCMessage('/global/state/bpm', globalBPM);
    logDebug(`BPM Global atualizado para: ${globalBPM}`);
}


// --- Event Listeners (Adaptadas de main73.js) ---
function setupEventListeners() { /* ... (mesma lógica da v73, com atenção aos IDs dos novos elementos da BM) ... */
  if (playPauseButton) playPauseButton.addEventListener('click', togglePlayPauseShapes);
  if (toggleBeatMatrixButton) toggleBeatMatrixButton.addEventListener('click', toggleBeatMatrixVisibility);

  globalBpmSlider = document.getElementById('globalBpmSlider');
  globalBpmValueDisplay = document.getElementById('globalBpmValueDisplay');
  if (globalBpmSlider) {
    globalBpmSlider.addEventListener('input', (e) => {
      if(spectatorModeActive) return;
      updateGlobalBPM(parseInt(e.target.value));
    });
  }
  if (internalAudioToggleButton) {
    internalAudioToggleButton.addEventListener("click", async () => {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      _internalAudioEnabledMaster = !_internalAudioEnabledMaster;
      if (_internalAudioEnabledMaster) {
        if (!simpleSynth && audioCtx) {
          simpleSynth = new SimpleSynth(audioCtx);
           const { audioSettings } = loadAllPersistentSettings();
            if (simpleSynth && audioSettings) { /* ... apply settings ... */ }
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
  window.addEventListener('keydown', handleKeyPress);
  // ... (outros listeners)
}
function handleKeyPress(e) { /* ... (mesma lógica da v73, mas beatMatrix.togglePlayback pode ser para a BM principal) ... */
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');

    if (e.key === 'Escape') { /* ... */ }
    if (isInputFocused || (spectatorModeActive && e.key !== 'Escape')) return;

    const actionMap = { 'm': toggleMidiEnabled };
    const correctedShiftActionMap = { /* ... */ 'M': toggleBeatMatrixVisibility };
    // ... (restante da lógica de atalhos)

    if (e.key === ' ' && !isInputFocused && !anyModalOpen) {
        e.preventDefault();
        if (beatMatrixContainer.classList.contains('visible')) {
            if (typeof beatMatrix !== "undefined" && typeof beatMatrix.togglePlayback === "function") {
                beatMatrix.togglePlayback(); // Assumindo que isso controla a barra principal da BM
            }
        } else {
            togglePlayPauseShapes();
        }
    }
}

// --- Loop de Animação ---
function animationLoop() { /* ... (mesma lógica da v73) ... */
  requestAnimationFrame(animationLoop);
  if (cameraError && !gestureSimulationActive && !beatMatrixContainer.classList.contains('visible')) {
    drawFallbackAnimation();
  }
}

// --- Inicialização Principal ---
window.addEventListener('DOMContentLoaded', () => {
  logDebug("DOM Carregado. Iniciando main74.js...");
  detectPlatform();
  hasWebGL2 = true;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  loadAllPersistentSettings();
  applyTheme(currentTheme);

  // V74: Inicializa a Beat Matrix (de beatmatrix74.js)
  if (typeof initializeBeatMatrix === "function") {
    // Passar referências aos novos elementos HTML para beatmatrix74.js
    // A estrutura do objeto de configuração pode precisar ser expandida
    initializeBeatMatrix({
        globalBPM: globalBPM,
        availableMidiOutputs: availableMidiOutputs,
        synthInstance: simpleSynth,
        getGlobalBPM: () => globalBPM,
        sendMidiNoteOnCallback: sendMidiNoteOn,
        sendMidiNoteOffCallback: sendMidiNoteOff,
        logDebugCallback: logDebug,
        savePersistentSettingCallback: savePersistentSetting,
        loadPersistentSettingCallback: loadPersistentSetting,
        // V74: Passar IDs ou referências diretas aos elementos do DOM que beatmatrix74.js controlará
        controls: {
            playStopButton: bmPlayStopButton, // Principal
            playStopButtonSecondary: playStopButtonSecondary,
            bpmDisplay: bmBpmDisplay, // Principal
            bpmDisplaySecondary: bpmDisplaySecondary,
            horizontalBpmFaderSVG: horizontalBpmFaderSVG, // Principal
            secondaryBpmFaderSVG: secondaryBpmFaderSVG,
            bmGlobalBpmSyncButton: bmGlobalBpmSyncButton,
            midiOutputSelect: bmMidiOutputSelect, // O select MIDI da BM
            secondaryNoteOffsetInput: secondaryNoteOffsetInput,
            orientationBar2Select: orientationBar2Select,
            directionBar2Select: directionBar2Select,
            addExtraBarButton: addExtraBarButton,
            extraBarsControlsContainer: extraBarsControlsContainer,
            rowsInput: bmRowsInput,
            colsInput: bmColsInput,
            padSizeInput: bmPadSizeInput,
            // Adicionar mais elementos conforme necessário
            // Por exemplo, os elementos de fader SVG (thumb, text) para cada barra
            // ou deixar que beatmatrix74.js os encontre por ID se os IDs forem padronizados.
        }
    });
  } else {
      console.error("initializeBeatMatrix function not found! Beat Matrix Avançada não funcionará.");
  }

  setupEventListeners();

  if (globalBpmSlider) globalBpmSlider.value = globalBPM;
  if (globalBpmValueDisplay) globalBpmValueDisplay.textContent = globalBPM;
  updateGlobalBPM(globalBPM);

   if (_internalAudioEnabledMaster && !audioCtx) { /* ... */ }
    if (_internalAudioEnabledMaster && audioCtx && !simpleSynth) { /* ... */ }

  setupOSC();
  currentCameraDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || null;

  initMidi().then(async () => { /* ... */ }).catch(err => { /* ... */ });

  const bmVisible = loadPersistentSetting('beatMatrixVisible', false);
  if (bmVisible && beatMatrixContainer) {
      beatMatrixContainer.classList.add('visible');
      toggleBeatMatrixButton.classList.add('active', 'info-active');
      currentAudioSourceView = 'beatmatrix';
       if (typeof beatMatrix !== "undefined" && typeof beatMatrix.onShow === "function") {
            beatMatrix.onShow(globalBPM, availableMidiOutputs, simpleSynth);
        }
  } else if (beatMatrixContainer) {
      beatMatrixContainer.classList.remove('visible');
  }

  if (playPauseButton) playPauseButton.innerHTML = isPlayingShapes ? "⏸️ Pause Formas" : "▶️ Play Formas";
  updateHUD();
  logDebug("Iniciando loop de animação (v74) e finalizando DOMContentLoaded.");
  animationLoop();
});

// Funções utilitárias
function detectPlatform() { /* ... */ }
function applyTheme(theme) { /* ... */ }
function loadTheme() { /* ... */ }

// Funções de gravação de áudio
function startAudioRecording() { /* ... */ }
function stopAudioRecording(dueToError = false) { /* ... */ }
function saveRecordedAudio() { /* ... */ }
function updateAudioRecordingHUD(isRecording, isPaused, durationSeconds = 0, isSaved = false) { /* ... */ }

console.log("main74.js carregado.");

// V74: Funções de exemplo para integração com beatmatrix74.js
// Estas seriam chamadas por beatmatrix74.js ou por main74.js em resposta a eventos da BM.
// A implementação real estará em beatmatrix74.js, mas main74.js precisa saber que elas existem
// ou como interagir com o módulo beatMatrix.

// Exemplo: Se beatmatrix74.js precisar calcular o BPM para uma barra secundária
// (Esta lógica provavelmente estará em beatmatrix74.js, mas main74.js poderia chamá-la se necessário)
function calculateSecondaryBPMForBeatMatrix(mainBPM, syncFactor, syncDirection) {
    let calculatedBpm = mainBPM;
    if (syncDirection === 'up') {
        calculatedBpm *= syncFactor;
    } else { // 'down'
        calculatedBpm /= syncFactor;
    }
    // Supondo que minBPM e maxBPM globais se aplicam ou beatmatrix74.js tem seus próprios limites
    const minBM_BPM = 30; // Exemplo
    const maxBM_BPM = 500; // Exemplo
    return Math.max(minBM_BPM, Math.min(maxBM_BPM, calculatedBpm));
}

// Exemplo: Se main74.js precisar instruir a BM a sincronizar uma barra específica
// (Novamente, mais provável que seja interno a beatmatrix74.js)
function synchronizeBeatMatrixBar(barId, forceReset = false) {
    if (typeof beatMatrix !== "undefined" && typeof beatMatrix.synchronizeBar === "function") {
        beatMatrix.synchronizeBar(barId, forceReset);
    } else {
        logDebug(`Função synchronizeBar não encontrada no módulo beatMatrix para a barra ${barId}.`);
    }
}

// É crucial que beatmatrix74.js exponha uma API clara (por exemplo, através do objeto global `beatMatrix`)
// para que main74.js possa interagir com ela (ex: ao mostrar/ocultar, ao mudar BPM global, etc.).
// E beatmatrix74.js precisará de callbacks ou referências para funções em main74.js (como sendMidiNoteOn).
