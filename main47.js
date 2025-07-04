// ==========================================================================
// MIDI SHAPE MANIPULATOR v47 - main47.js
// ==========================================================================

// === DEBUGGING ===
const DEBUG_MODE = true; // Defina como false para desabilitar logs de debug
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

// Variáveis para o AudioContext e SimpleSynth de synth47.js
let audioCtx = null;
let simpleSynth = null;
// internalAudioEnabled já é declarada e gerenciada mais abaixo.

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
const THEME_STORAGE_KEY = 'midiShapeThemeV35'; // Mantendo v35
const PRESETS_STORAGE_KEY = 'midiShapePresetsV47'; // ATUALIZADO para v47
let shapePresets = {};
const APP_SETTINGS_KEY = 'midiShapeManipulatorV47Settings'; // ATUALIZADO para v47
const ARPEGGIO_SETTINGS_KEY = 'arpeggioSettingsV47'; // ATUALIZADO para v47
const CAMERA_DEVICE_ID_KEY = 'midiShapeCameraDeviceIdV47'; // ATUALIZADO para v47

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
const exportOscLogButton = document.getElementById('exportOscLogButton');
const syncDMXNotesButton = document.getElementById('syncDMXNotesButton');
const recordOSCButton = document.getElementById('recordOSCButton');
const playOSCLoopButton = document.getElementById('playOSCLoopButton');
const oscLoopDurationInput = document.getElementById('oscLoopDurationInput');
const spectatorModeButton = document.getElementById('spectatorModeButton');
const resetMidiButton = document.getElementById('resetMidiButton');
const scaleCycleButton = document.getElementById('scaleCycleButton');
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
// --- Novos elementos DOM para Áudio Interno (v45) ---
const internalAudioToggleButton = document.getElementById('internalAudioToggleButton');
const audioWaveformSelect = document.getElementById('audioWaveformSelect');
const audioMasterVolumeSlider = document.getElementById('audioMasterVolume');
const audioMasterVolumeValueSpan = document.getElementById('audioMasterVolumeValue');

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
  Object.keys(shape.activeMidiNotes).forEach(k => {
    const ni = shape.activeMidiNotes[k]; let del = false;
    if (!ni || !ni.playing || !midiEnabled || shape.sides <= 0 || spectatorModeActive) { if(ni) ni.playing=false; del=true; }
    else if (currentNoteMode !== 'ARPEGGIO' && currentNoteMode !== 'CHORD' && !ni.isArpeggioNote) { const edge = parseInt(k.split('_')[0]); if (isNaN(edge) || edge >= shape.sides) {ni.playing=false; del=true;} }
    else if (ni.isArpeggioNote && currentNoteMode !== 'ARPEGGIO') { ni.playing=false; del=true; }
    if(del) { if(ni) {sendMidiNoteOff(ni.note, shape.midiChannel, shape.id+1); if(ni.staccatoTimer) clearTimeout(ni.staccatoTimer);} delete shape.activeMidiNotes[k];}
  });
}

function getNoteInScale(index, baseOctaveOffset = 0) {
  const scale = SCALES[currentScaleName]; const scaleNotes = scale.notes; const len = scaleNotes.length;
  const octave = baseOctaveOffset + Math.floor(index / len); const noteIdx = index % len;
  return Math.max(0, Math.min(127, scale.baseMidiNote + scaleNotes[noteIdx] + (octave * 12)));
}

function processShapeNotes(shape, isPulsing, pulseValue) {
    if (spectatorModeActive || !midiEnabled || shape.sides <= 0) return;
    const now = performance.now();
    const canPlayNonArp = now - shape.lastNotePlayedTime > noteInterval;
    const canPlayArp = currentNoteMode === 'ARPEGGIO' && shape.sides > 2 && now - shape.lastArpeggioNotePlayedTime > noteInterval;
    if (canPlayNonArp || canPlayArp) {
        let notesToPlay = []; let edgeIdx = shape.currentEdgeIndex; let notePlayed = false;
        if (currentNoteMode !== 'CHORD' && currentNoteMode !== 'ARPEGGIO') {
            const oldKey = `${edgeIdx}_0`;
            if (shape.activeMidiNotes[oldKey]?.playing && !staccatoModeActive) { sendMidiNoteOff(shape.activeMidiNotes[oldKey].note, shape.midiChannel, shape.id + 1); shape.activeMidiNotes[oldKey].playing = false; }
        }
        switch (currentNoteMode) {
            case 'SEQUENTIAL':
                if (canPlayNonArp) {
                    shape.currentEdgeIndex += shape.rotationDirection;
                    if (shape.currentEdgeIndex >= shape.sides) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.rotationDirection = -1; }
                    else if (shape.currentEdgeIndex < 0) { shape.currentEdgeIndex = 0; shape.rotationDirection = 1; }
                    edgeIdx = shape.currentEdgeIndex; if (edgeIdx < shape.sides) notesToPlay.push(getNoteInScale(edgeIdx));
                    notePlayed = true; shape.lastNotePlayedTime = now;
                } break;
            case 'ARPEGGIO':
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
            case 'CHORD':
                if (canPlayNonArp) {
                    shape.currentEdgeIndex += shape.rotationDirection;
                    if (shape.currentEdgeIndex >= shape.sides) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.rotationDirection = -1; }
                    else if (shape.currentEdgeIndex < 0) { shape.currentEdgeIndex = 0; shape.rotationDirection = 1; }
                    edgeIdx = shape.currentEdgeIndex;
                    if (edgeIdx < shape.sides) {
                        notesToPlay.push(getNoteInScale(edgeIdx)); notesToPlay.push(getNoteInScale(edgeIdx + 2)); notesToPlay.push(getNoteInScale(edgeIdx + 4));
                        Object.values(shape.activeMidiNotes).forEach(ni => { if (ni.playing) sendMidiNoteOff(ni.note, shape.midiChannel, shape.id + 1); if (ni.staccatoTimer) clearTimeout(ni.staccatoTimer); });
                        shape.activeMidiNotes = {};
                    } notePlayed = true; shape.lastNotePlayedTime = now;
                } break;
            case 'RANDOM_WALK':
                if (canPlayNonArp) {
                    shape.currentEdgeIndex += Math.floor(Math.random() * 3) - 1;
                    const scaleNoteCount = SCALES[currentScaleName].notes.length * 2;
                    shape.currentEdgeIndex = (shape.currentEdgeIndex + scaleNoteCount) % scaleNoteCount;
                    edgeIdx = shape.currentEdgeIndex; notesToPlay.push(getNoteInScale(edgeIdx));
                    notePlayed = true; shape.lastNotePlayedTime = now;
                } break;
        }
        if (notePlayed && notesToPlay.length > 0) {
            let vel = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * (97 / 270))));
            if (isPulsing) vel = Math.max(0, Math.min(127, Math.round(vel * (0.6 + ((pulseValue + 1) / 2) * 0.4))));
            notesToPlay.forEach((n, i) => {
                let key = (currentNoteMode === 'ARPEGGIO') ? `arp_${shape.id}_${edgeIdx}` : (currentNoteMode === 'CHORD') ? `chord_${shape.id}_${n}_${i}` : `${edgeIdx}_0`;
                sendMidiNoteOn(n, vel, shape.midiChannel, shape.id + 1);
                if (shape.activeMidiNotes[key]?.staccatoTimer) clearTimeout(shape.activeMidiNotes[key].staccatoTimer);
                shape.activeMidiNotes[key] = { note: n, playing: true, lastPitchBend: shape.currentPitchBend, isArpeggioNote: currentNoteMode === 'ARPEGGIO' };
                if (staccatoModeActive) { shape.activeMidiNotes[key].staccatoTimer = setTimeout(() => { if (shape.activeMidiNotes[key]?.playing) { sendMidiNoteOff(n, shape.midiChannel, shape.id + 1); shape.activeMidiNotes[key].playing = false; } }, 150); }
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
    if (Object.values(shape.activeMidiNotes).some(ni => ni.playing)) {
        if (Math.abs(shape.currentPitchBend - (shape.activeMidiNotes[Object.keys(shape.activeMidiNotes)[0]]?.lastPitchBend || 8192)) > 10) {
            sendPitchBend(shape.currentPitchBend, shape.midiChannel);
            Object.values(shape.activeMidiNotes).forEach(ni => { if(ni) ni.lastPitchBend = shape.currentPitchBend; });
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
                        drawFallbackAnimation(); // CHAMADA CORRIGIDA
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
        // A animação de fallback será desenhada pelo animationLoop se cameraError for true
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
  ctx.fillRect(0,0,canvasElement.width, canvasElement.height);

  shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; });

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    if (operationMode === 'one_person') {
      let lH = null, rH = null;
      results.multiHandLandmarks.forEach((landmarks, i) => {
        if (!spectatorModeActive) drawLandmarks(landmarks, results.multiHandedness[i]?.label); // Passa handedness
        const handedness = results.multiHandedness[i]?.label;
        if (handedness === "Left" && !lH) lH = landmarks;
        else if (handedness === "Right" && !rH) rH = landmarks;
      });
      shapes[0].leftHandLandmarks = lH; shapes[0].rightHandLandmarks = rH;
      if (shapes.length > 1) { shapes[1].leftHandLandmarks = null; shapes[1].rightHandLandmarks = null; }
    } else { 
      let assignedL = [false,false], assignedR = [false,false];
      results.multiHandLandmarks.forEach((landmarks, i) => {
        if (!spectatorModeActive) drawLandmarks(landmarks, results.multiHandedness[i]?.label); // Passa handedness
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

// === FUNÇÕES DE DESENHO E FALLBACK RESTAURADAS ===
function drawLandmarks(landmarksArray, handedness = "Unknown") { // Adicionado handedness para possível diferenciação visual
    if (!landmarksArray || landmarksArray.length === 0 || spectatorModeActive) return;
    // Conexões padrões do MediaPipe Hands
    const connections = [
        [0,1],[1,2],[2,3],[3,4], // Polegar
        [0,5],[5,6],[6,7],[7,8], // Indicador
        [5,9],[9,10],[10,11],[11,12], // Médio
        [9,13],[13,14],[14,15],[15,16], // Anelar
        [13,17],[17,18],[18,19],[19,20], // Mínimo
        [0,17] // Palma
    ];
    // Define cor baseada na mão (opcional, mas pode ajudar na depuração)
    ctx.strokeStyle = handedness === "Right" ? 'lime' : (handedness === "Left" ? 'cyan' : 'yellow');
    ctx.lineWidth = 2;

    for (const conn of connections) {
        const lm1 = landmarksArray[conn[0]];
        const lm2 = landmarksArray[conn[1]];
        if (lm1 && lm2) {
            ctx.beginPath();
            // Inverte X para espelhar corretamente a visualização da câmera
            ctx.moveTo(canvasElement.width - (lm1.x * canvasElement.width), lm1.y * canvasElement.height);
            ctx.lineTo(canvasElement.width - (lm2.x * canvasElement.width), lm2.y * canvasElement.height);
            ctx.stroke();
        }
    }
    // Desenha círculos nos landmarks
    // ctx.fillStyle = handedness === "Right" ? 'green' : (handedness === "Left" ? 'blue' : 'orange');
    // for (let i = 0; i < landmarksArray.length; i++) {
    //     const lm = landmarksArray[i];
    //     if (lm) {
    //         ctx.beginPath();
    //         ctx.arc(canvasElement.width - (lm.x * canvasElement.width), lm.y * canvasElement.height, 3, 0, Math.PI * 2);
    //         ctx.fill();
    //     }
    // }
}

function initFallbackShapes() {
    if (fallbackShapes.length > 0 && canvasElement && fallbackShapes[0].canvasWidth === canvasElement.width && fallbackShapes[0].canvasHeight === canvasElement.height) return; // Não reinicializa se já existe e canvas tem o mesmo tamanho

    fallbackShapes = []; // Limpa para recriar se o tamanho do canvas mudou
    if (!canvasElement || canvasElement.width === 0 || canvasElement.height === 0) {
        console.warn("initFallbackShapes: Canvas não pronto ou sem dimensões.");
        return;
    }
    const numShapes = 5 + Math.floor(Math.random() * 5); // Número variável de formas
    const colors = ["#FF00FF", "#00FFFF", "#FFFF00", "#FF0000", "#00FF00", "#FFA500", "#800080"];
    for (let i = 0; i < numShapes; i++) {
        fallbackShapes.push({
            x: Math.random() * canvasElement.width,
            y: Math.random() * canvasElement.height,
            radius: 15 + Math.random() * 25, // Tamanhos variados
            color: colors[i % colors.length],
            vx: (Math.random() - 0.5) * (2 + Math.random() * 2), // Velocidades variadas
            vy: (Math.random() - 0.5) * (2 + Math.random() * 2),
            sides: 3 + Math.floor(Math.random() * 6), // De triângulos a octógonos
            rotationSpeed: (Math.random() - 0.5) * 0.02,
            currentAngle: Math.random() * Math.PI * 2,
            canvasWidth: canvasElement.width, // Guarda dimensões do canvas para checagem
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
        initFallbackShapes(); // (Re)inicializa se necessário ou se o canvas mudou de tamanho
        if (fallbackShapes.length === 0) return; // Se ainda não conseguiu inicializar, sai
    }

    ctx.fillStyle = 'rgba(0,0,0,0.1)'; // Efeito de rastro suave
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "#666"; // Cinza mais escuro para o texto
    ctx.textAlign = "center";
    ctx.fillText("Detecção de mãos indisponível ou falhou.", canvasElement.width / 2, canvasElement.height / 2 - 30);
    ctx.font = "14px Arial";
    ctx.fillText("Exibindo animação alternativa. Verifique as permissões da câmera.", canvasElement.width / 2, canvasElement.height / 2);

    fallbackShapes.forEach(shape => {
        shape.x += shape.vx;
        shape.y += shape.vy;
        shape.currentAngle += shape.rotationSpeed;

        // Rebatimento nas bordas
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
        ctx.lineWidth = 2 + Math.random(); // Espessura da linha ligeiramente variável
        ctx.stroke();
        // Preenchimento semi-transparente opcional
        // ctx.fillStyle = `${shape.color}33`; // Adiciona alfa
        // ctx.fill();
    });
}
// === FIM DAS FUNÇÕES DE DESENHO E FALLBACK ===

// === MIDI MANAGER ===
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
  // Internal Synth Call
  if (internalAudioEnabled && simpleSynth && typeof simpleSynth.noteOn === 'function') {
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
  // Internal Synth Call
  if (internalAudioEnabled && simpleSynth && typeof simpleSynth.noteOff === 'function') {
    simpleSynth.noteOff(n);
  }
  sendOSCMessage(`/forma/${shapeId}/noteOff`, n, ch);
  if (dmxSyncModeActive) sendOSCMessage(`/dmx/note`, n, 0);
}

function sendPitchBend(bendValue, channel) { if (spectatorModeActive || !midiEnabled || !midiOutput) return; const ch = Math.max(0,Math.min(15,channel)); const bend = Math.max(0,Math.min(16383,Math.round(bendValue))); midiOutput.send([0xE0+ch, bend & 0x7F, (bend>>7)&0x7F]); }
function sendMidiCC(cc, value, channel) { if (spectatorModeActive || !midiEnabled || !midiOutput) return; const ch = Math.max(0,Math.min(15,channel)); const c = Math.max(0,Math.min(119,Math.round(cc))); const v = Math.max(0,Math.min(127,Math.round(value))); midiOutput.send([0xB0+ch, c, v]); }

function turnOffAllActiveNotesForShape(shape) {
  if (spectatorModeActive) return;
  const origMidiEnabled = midiEnabled; // Salva o estado original
  const localMidiEnabled = true; // Habilita temporariamente para garantir que sendMidiNoteOff funcione para MIDI externo
  midiEnabled = localMidiEnabled;

  logDebug(`Desligando todas as notas ativas para a forma ${shape.id}`);
  Object.values(shape.activeMidiNotes).forEach(noteInfo => {
    if (noteInfo.playing) {
      // Envia Note OFF para MIDI externo (se habilitado e houver output)
      sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
    }
    if (noteInfo.staccatoTimer) {
      clearTimeout(noteInfo.staccatoTimer);
    }
  });
  shape.activeMidiNotes = {};
  midiEnabled = origMidiEnabled; // Restaura o estado original do MIDI enable

  // Para o synth interno, não precisamos iterar, apenas chamar allNotesOff se ele estiver ativo para esta forma
  // No entanto, simpleSynth é global. Se uma forma é desligada, idealmente só as suas notas no synth param.
  // A lógica atual de simpleSynth.noteOff(midiNote) já lida com notas individuais.
  // E sendMidiNoteOff agora chama simpleSynth.noteOff.
  // Se a intenção é um "panic" para a forma, e o synth interno não tem essa granularidade,
  // então allNotesOff no synth global pode ser excessivo se outras formas estiverem tocando.
  // Por enquanto, a chamada individual em sendMidiNoteOff é suficiente.
  // Se quisermos um "all notes off" específico para o synth interno, precisaria ser uma chamada separada.
}

function turnOffAllActiveNotes() {
  if (spectatorModeActive) return;
  logDebug("Desligando todas as notas ativas para todas as formas (MIDI e Interno).");
  const origMidiEnabled = midiEnabled;
  midiEnabled = true; // Temporariamente habilita para garantir que as chamadas MIDI funcionem

  shapes.forEach(shape => turnOffAllActiveNotesForShape(shape)); // Isso já chamará sendMidiNoteOff, que lida com o synth interno

  midiEnabled = origMidiEnabled; // Restaura o estado

  // Adicionalmente, uma chamada explícita para allNotesOff no synth interno para garantir.
  if (simpleSynth && typeof simpleSynth.allNotesOff === 'function') {
    simpleSynth.allNotesOff();
  }
}

function resetMidiSystem() {
  if (spectatorModeActive) return;
  console.log("MIDI Reset.");
  logDebug("Sistema MIDI Resetado.");
  turnOffAllActiveNotes(); // Isso já deve cuidar do synth interno também

  const origMidiEnabled = midiEnabled;
  midiEnabled = true; // Habilita temporariamente para os CCs de reset
  if (midiOutput) {
    for (let ch = 0; ch < 16; ch++) {
      midiOutput.send([0xB0 + ch, 120, 0]); // All Sound Off
      midiOutput.send([0xB0 + ch, 121, 0]); // Reset All Controllers
    }
  }
  midiEnabled = origMidiEnabled; // Restaura

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

// === OSC MANAGER ===
function loadOscSettings() { const stored = localStorage.getItem(OSC_SETTINGS_KEY); let loadedHost = location.hostname; let loadedPort = 8080; if (stored) { try { const s = JSON.parse(stored); if (s.host) loadedHost = s.host; if (s.port) loadedPort = parseInt(s.port,10); } catch(e){ loadedHost = location.hostname || "127.0.0.1"; loadedPort = 8080; }} else { loadedHost = location.hostname || "127.0.0.1"; loadedPort = 8080; } OSC_HOST = loadedHost || "127.0.0.1"; OSC_PORT = loadedPort || 8080; if (oscHostInput) oscHostInput.value = OSC_HOST; if (oscPortInput) oscPortInput.value = OSC_PORT; console.log(`OSC Config: ${OSC_HOST}:${OSC_PORT}`); }
function saveOscSettings(host, port) { const newPort = parseInt(port,10); if (isNaN(newPort) || newPort<1 || newPort>65535) { displayGlobalError("Porta OSC inválida.",5000); return false; } if (!host || host.trim()==="") { displayGlobalError("Host OSC vazio.",5000); return false; } const settings = {host:host.trim(), port:newPort}; try { localStorage.setItem(OSC_SETTINGS_KEY, JSON.stringify(settings)); OSC_HOST=settings.host; OSC_PORT=settings.port; console.log(`OSC Salvo: ${OSC_HOST}:${OSC_PORT}`); if(oscHostInput) oscHostInput.value = OSC_HOST; if(oscPortInput) oscPortInput.value = OSC_PORT; if (osc && typeof setupOSC === 'function') setupOSC(); return true; } catch(e) { displayGlobalError("Erro salvar OSC.",5000); return false; } }
function sendOSCMessage(address, ...args) { logDebug(`Enviando OSC: ${address}`, args); if (spectatorModeActive && !address.startsWith('/ping')) return; if (osc && osc.status() === OSC.STATUS.IS_OPEN) { const message = new OSC.Message(address, ...args); try { osc.send(message); } catch (error) { logDebug("Erro ao enviar OSC", { address, args, error }); if (osc.status() !== OSC.STATUS.IS_OPEN && reconnectOSCButton) { reconnectOSCButton.style.display = 'inline-block'; oscStatus = "OSC Erro Envio"; updateHUD(); } } } else { logDebug("OSC não conectado, não foi possível enviar.", { address, args, oscStatus: osc?.status() }); if (reconnectOSCButton && osc && osc.status() !== OSC.STATUS.IS_OPEN) { reconnectOSCButton.style.display = 'inline-block'; } } if (isRecordingOSC && !address.startsWith('/ping')) { recordedOSCSequence.push({ timestamp: performance.now() - recordingStartTime, message: { address: address, args: args } }); } }
function sendOSCHeartbeat() { sendOSCMessage('/ping', Date.now()); }
function setupOSC() { logDebug(`Configurando OSC para ws://${OSC_HOST}:${OSC_PORT}`); if (osc && osc.status() === OSC.STATUS.IS_OPEN) { logDebug("Fechando conexão OSC existente."); osc.close(); } if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; console.log(`Conectando OSC: ws://${OSC_HOST}:${OSC_PORT}`); osc = new OSC({ plugin: new OSC.WebsocketClientPlugin({ host: OSC_HOST, port: OSC_PORT, secure: false }) }); osc.on('open', () => { oscStatus = `OSC Conectado (ws://${OSC_HOST}:${OSC_PORT})`; console.log(oscStatus); logDebug("OSC conectado."); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = setInterval(sendOSCHeartbeat, 5000); sendOSCHeartbeat(); sendAllGlobalStatesOSC(); if (reconnectOSCButton) reconnectOSCButton.style.display = 'none'; updateHUD(); }); osc.on('close', (event) => { oscStatus = "OSC Desconectado"; logDebug("OSC desconectado.", event); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); }); osc.on('error', (err) => { oscStatus = "OSC Erro Conexão"; logDebug("OSC Erro Conexão.", err); if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null; if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); }); osc.on('message', (msg) => { logDebug("OSC Mensagem recebida (bruta):", msg); try { let pMsg = msg; if (msg.args && msg.args.length > 0 && typeof msg.args[0] === 'string') { try { const pJson = JSON.parse(msg.args[0]); if (pJson.type === "confirmation" || (pJson.address && pJson.args)) { pMsg = pJson; logDebug("OSC Mensagem (após parse JSON de args[0]):", pMsg); } } catch (e) { /* não era JSON, ignora */ } } if (pMsg && pMsg.address) { logOSC("IN (UDP)", pMsg.address, pMsg.args); handleIncomingExternalOSC(pMsg); } else { logDebug("Mensagem OSC recebida ignorada (sem endereço após processamento):", pMsg); } } catch (e) { logDebug("Erro ao processar mensagem OSC recebida:", { error: e, originalMessage: msg }); } }); try { osc.open(); } catch (error) { oscStatus = `OSC Falha: ${error.message}`; logDebug("Falha ao abrir conexão OSC.", error); if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block'; updateHUD(); } osc.on('/global/setExternalBPM', msg => { /* ... */ }); osc.on('/global/setScale', msg => { /* ... */ }); }
function handleIncomingExternalOSC(oscMessage) { logDebug("Processando OSC Externo:", oscMessage); /* ... */ }
function sendAllGlobalStatesOSC() { if (spectatorModeActive) return; logDebug("Enviando todos os estados globais via OSC."); sendOSCMessage('/global/state/midiEnabled', midiEnabled?1:0); sendOSCMessage('/global/state/pulseMode', pulseModeActive?1:0); sendOSCMessage('/global/state/staccatoMode', staccatoModeActive?1:0); /* ... more ... */ }
function logOSC(source, address, args, isSeparator = false) { if (oscLogTextarea) { if (isSeparator) { oscLogTextarea.value += `--- Log Separator (${new Date().toLocaleTimeString()}) ---\n`; lastLogSource = "SEPARATOR"; oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight; return; } const timestamp = new Date().toLocaleTimeString(); let sourcePrefix = "SYS"; switch(source.toUpperCase()){ case "OUT": sourcePrefix="OUT"; break; case "IN (UDP)": sourcePrefix="UDP"; break; case "MIDI->OSC": sourcePrefix="MIDI"; break; case "LOOP": sourcePrefix="LOOP"; break; case "PANEL": sourcePrefix="PANEL"; break; case "REC INFO": sourcePrefix="REC"; break;} if (source.toUpperCase() !== lastLogSource && lastLogSource !== "" && lastLogSource !== "SEPARATOR") oscLogTextarea.value += `-------------------------------------\n`; lastLogSource = source.toUpperCase(); const type = args && args.length > 0 && typeof args[0] === 'object' && args[0].type ? ` (${args.map(a => a.type).join(', ')})` : ''; oscLogTextarea.value += `${timestamp} [${sourcePrefix}] ${address}${type} ${JSON.stringify(args)}\n`; oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight; } }
function exportOSCLog() { /* ... */ }

// === PRESET MANAGER ===
function getShapeState(shape) { return { radius: shape.radius, sides: shape.sides, reverbAmount: shape.reverbAmount, delayAmount: shape.delayAmount, panValue: shape.panValue, brightnessValue: shape.brightnessValue, modWheelValue: shape.modWheelValue, resonanceValue: shape.resonanceValue, }; }
function applyShapeState(shape, state) { if (!state) return; shape.radius = state.radius !== undefined ? state.radius : shape.radius; shape.sides = state.sides !== undefined ? state.sides : shape.sides; /* ... more ... */ if (state.sides !== undefined) { if(shape.currentEdgeIndex >= shape.sides) shape.currentEdgeIndex = Math.max(0, shape.sides-1); turnOffAllActiveNotesForShape(shape); } updateHUD(); }
function saveShapePreset() { if (spectatorModeActive) return; const presetName = presetNameInput.value.trim(); if (!presetName) { alert("Insira nome para preset."); return; } const selectedShapeIndex = parseInt(shapeToPresetSelect.value,10); if (isNaN(selectedShapeIndex) || selectedShapeIndex<0 || selectedShapeIndex>=shapes.length) return; const shape = shapes[selectedShapeIndex]; const shapeState = getShapeState(shape); if (!shapePresets[presetName]) shapePresets[presetName] = {}; shapePresets[presetName][`shape${selectedShapeIndex}`] = shapeState; localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(shapePresets)); populateSavedPresetsSelect(); savedPresetsSelect.value = presetName; displayGlobalError(`Preset '${presetName}' salvo.`,3000); }
function loadShapePreset() { if (spectatorModeActive) return; const presetName = savedPresetsSelect.value; if (!presetName || !shapePresets[presetName]) return; const selectedShapeIndex = parseInt(shapeToPresetSelect.value,10); if (isNaN(selectedShapeIndex) || selectedShapeIndex<0 || selectedShapeIndex>=shapes.length) return; const presetData = shapePresets[presetName]; const shapeStateToApply = presetData[`shape${selectedShapeIndex}`]; if (shapeStateToApply) { applyShapeState(shapes[selectedShapeIndex], shapeStateToApply); presetNameInput.value = presetName; displayGlobalError(`Preset '${presetName}' carregado.`,3000); } }
function deleteSelectedPreset() { if (spectatorModeActive) return; const presetName = savedPresetsSelect.value; if (!presetName || !shapePresets[presetName]) return; if (confirm(`Deletar '${presetName}'?`)) { delete shapePresets[presetName]; localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(shapePresets)); populateSavedPresetsSelect(); presetNameInput.value = ""; displayGlobalError(`Preset '${presetName}' deletado.`,3000); } }
function populateSavedPresetsSelect() { if (!savedPresetsSelect) return; const currentSelection = savedPresetsSelect.value; savedPresetsSelect.innerHTML = ''; Object.keys(shapePresets).sort().forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; savedPresetsSelect.appendChild(option); }); if (shapePresets[currentSelection]) savedPresetsSelect.value = currentSelection; else if (savedPresetsSelect.options.length > 0) savedPresetsSelect.selectedIndex = 0; presetNameInput.value = (savedPresetsSelect.value && shapePresets[savedPresetsSelect.value]) ? savedPresetsSelect.value : ""; }
function exportAllPresets() { if (Object.keys(shapePresets).length === 0) { alert("Nenhum preset."); return; } const jsonString = JSON.stringify(shapePresets, null, 2); const blob = new Blob([jsonString],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `midiShapePresets_v35_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); displayGlobalError("Presets exportados.",3000); }
function importAllPresets() { if (!spectatorModeActive) importPresetFileInput.click(); }
function handleImportPresetFile(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const imported = JSON.parse(e.target.result); if (typeof imported !== 'object' || imported === null) throw new Error("JSON inválido."); let imp=0,ovr=0; for(const pN in imported){if(shapePresets[pN])ovr++;else imp++; shapePresets[pN]=imported[pN];} localStorage.setItem(PRESETS_STORAGE_KEY,JSON.stringify(shapePresets)); populateSavedPresetsSelect(); displayGlobalError(`Importados. Novos:${imp}, Sobrescritos:${ovr}.`,5000); } catch (error) { alert(`Erro importar: ${error.message}`);} finally {importPresetFileInput.value='';} }; reader.readAsText(file); }
function loadPresetsFromStorage() { const stored = localStorage.getItem(PRESETS_STORAGE_KEY); if (stored) { try { shapePresets = JSON.parse(stored); } catch (e) { shapePresets = {}; localStorage.removeItem(PRESETS_STORAGE_KEY); } } else shapePresets = {}; populateSavedPresetsSelect(); }
function populateShapeToPresetSelect() { if (!shapeToPresetSelect) return; shapeToPresetSelect.innerHTML = ''; shapes.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `Forma ${i + 1}`; shapeToPresetSelect.appendChild(o); }); if (shapes.length > 0) shapeToPresetSelect.value = "0"; }
function initPresetManager() { loadPresetsFromStorage(); populateShapeToPresetSelect(); if (shapePresetButton) shapePresetButton.addEventListener('click', () => {if(shapePresetModal) shapePresetModal.style.display = 'flex'; populateSavedPresetsSelect(); if (savedPresetsSelect.value) presetNameInput.value = savedPresetsSelect.value;}); if (closeShapePresetModalButton) closeShapePresetModalButton.addEventListener('click', () => {if(shapePresetModal) shapePresetModal.style.display = 'none';}); if (saveShapePresetButton) saveShapePresetButton.addEventListener('click', saveShapePreset); if (loadShapePresetButton) loadShapePresetButton.addEventListener('click', loadShapePreset); if (deleteSelectedPresetButton) deleteSelectedPresetButton.addEventListener('click', deleteSelectedPreset); if (exportAllPresetsButton) exportAllPresetsButton.addEventListener('click', exportAllPresets); if (importAllPresetsButton) importAllPresetsButton.addEventListener('click', importAllPresets); if (importPresetFileInput) importPresetFileInput.addEventListener('change', handleImportPresetFile); if (savedPresetsSelect) savedPresetsSelect.addEventListener('change', () => { if (savedPresetsSelect.value) presetNameInput.value = savedPresetsSelect.value; }); }

// === THEME MANAGER ===
function applyTheme(theme) { document.body.classList.remove('theme-dark','theme-light'); document.body.classList.add(theme); currentTheme = theme; if (themeToggleButton) themeToggleButton.textContent = theme === 'theme-dark' ? '🌙' : '☀️'; }
function toggleTheme() { if(spectatorModeActive) return; const newTheme = currentTheme === 'theme-dark' ? 'theme-light' : 'theme-dark'; applyTheme(newTheme); localStorage.setItem(THEME_STORAGE_KEY, newTheme); logOSC("SYSTEM","Tema Alterado",[newTheme]); }
function loadTheme() { const savedTheme = localStorage.getItem(THEME_STORAGE_KEY); applyTheme((savedTheme && (savedTheme==='theme-dark'||savedTheme==='theme-light')) ? savedTheme : 'theme-dark'); }

// === GESTURE SIMULATOR ===
function generateMockLandmarks(hand="Right",shapeCenterX,shapeCenterY){const landmarks=[];const time=performance.now()/1000;const wristX=(canvasElement.width-shapeCenterX)/canvasElement.width+Math.sin(time*0.5+(hand==="Left"?Math.PI:0))*0.05;const wristY=shapeCenterY/canvasElement.height+Math.cos(time*0.5+(hand==="Left"?Math.PI:0))*0.05;landmarks.push({x:wristX,y:wristY,z:0});const fingerBaseRadius=0.08;const fingerTipRadiusVariance=0.02;const thumbAngle=Math.PI*1.5+Math.sin(time*1.2+(hand==="Left"?0.5:0))*0.3;landmarks[4]={x:wristX+(fingerBaseRadius+Math.cos(time*1.5)*fingerTipRadiusVariance)*Math.cos(thumbAngle),y:wristY+(fingerBaseRadius+Math.cos(time*1.5)*fingerTipRadiusVariance)*Math.sin(thumbAngle)*(canvasElement.width/canvasElement.height),z:0.01};const indexAngle=Math.PI*1.8+Math.cos(time*1.0+(hand==="Left"?0.7:0.2))*0.4;landmarks[8]={x:wristX+(fingerBaseRadius+0.02+Math.sin(time*1.7)*fingerTipRadiusVariance)*Math.cos(indexAngle),y:wristY+(fingerBaseRadius+0.02+Math.sin(time*1.7)*fingerTipRadiusVariance)*Math.sin(indexAngle)*(canvasElement.width/canvasElement.height),z:0.02};landmarks[12]={x:wristX+fingerBaseRadius*0.9,y:wristY-fingerBaseRadius*0.5,z:0.03};landmarks[16]={x:wristX+fingerBaseRadius*0.8,y:wristY-fingerBaseRadius*0.6,z:0.02};landmarks[20]={x:wristX+fingerBaseRadius*0.7,y:wristY-fingerBaseRadius*0.7,z:0.01};for(let i=0;i<21;i++){if(!landmarks[i]){if(i>0&&landmarks[i-1])landmarks[i]={...landmarks[i-1],z:landmarks[i-1].z+0.005};else if(landmarks[0])landmarks[i]={...landmarks[0],z:landmarks[0].z+i*0.005};else landmarks[i]={x:0.5,y:0.5,z:0.05};}} return landmarks;}
function runGestureSimulation(){if(!gestureSimulationActive)return;const results={multiHandLandmarks:[],multiHandedness:[]};if(operationMode==='one_person'||operationMode==='two_persons'){results.multiHandLandmarks.push(generateMockLandmarks("Right",shapes[0].centerX,shapes[0].centerY));results.multiHandedness.push({score:0.9,index:0,label:"Right"});if(operationMode==='one_person'){results.multiHandLandmarks.push(generateMockLandmarks("Left",shapes[0].centerX-150,shapes[0].centerY));results.multiHandedness.push({score:0.9,index:1,label:"Left"});}else if(operationMode==='two_persons'&&shapes.length>1){results.multiHandLandmarks.push(generateMockLandmarks("Left",shapes[1].centerX,shapes[1].centerY));results.multiHandedness.push({score:0.9,index:1,label:"Left"});}} onResults(results);}
function toggleGestureSimulation(){if(spectatorModeActive){displayGlobalError("Simulação indisponível em modo espectador.",3000);return;} gestureSimulationActive=!gestureSimulationActive;if(gestureSimToggleButton){gestureSimToggleButton.textContent=gestureSimulationActive?"🤖 Sim ON":"🤖 Sim OFF";gestureSimToggleButton.classList.toggle('active',gestureSimulationActive);} if(gestureSimulationActive){if(cameraError)console.log("Simulação ATIVADA (câmera erro).");else console.log("Simulação ATIVADA.");if(gestureSimIntervalId)clearInterval(gestureSimIntervalId);gestureSimIntervalId=setInterval(runGestureSimulation,GESTURE_SIM_INTERVAL);}else{console.log("Simulação DESATIVADA.");if(gestureSimIntervalId){clearInterval(gestureSimIntervalId);gestureSimIntervalId=null;} shapes.forEach(s=>{s.leftHandLandmarks=null;s.rightHandLandmarks=null;s.activeGesture=null;});} updateHUD();logOSC("SYSTEM","Simulação Gestos",[gestureSimulationActive?"ON":"OFF"]);}

function setupEventListeners() {
    const closeModalButton = document.getElementById('closeModal');
    const infoModal = document.getElementById('infoModal');
    if (sidebar && sidebarHandle) { sidebarHandle.addEventListener('click', (event) => { event.stopPropagation(); const isOpen = sidebar.classList.toggle('open'); sidebarHandle.textContent = isOpen ? '←' : '☰'; }); document.addEventListener('click', (event) => { if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && event.target !== sidebarHandle) { sidebar.classList.remove('open'); sidebarHandle.textContent = '☰'; } }); sidebar.addEventListener('click', (event) => event.stopPropagation() ); }
    const infoButtonElement = document.getElementById('info');
    if (infoButtonElement && infoModal) infoButtonElement.addEventListener('click', () => { infoModal.style.display = 'flex'; });
    if (closeModalButton && infoModal) closeModalButton.addEventListener('click', () => { infoModal.style.display = 'none'; });
    if (infoHudButton && hudElement) { infoHudButton.addEventListener('click', () => { const isHidden = hudElement.classList.toggle('hidden'); if (isHidden) { infoHudButton.textContent = "ℹ️ Mostrar HUD"; infoHudButton.classList.remove('active'); } else { infoHudButton.textContent = "ℹ️ Ocultar HUD"; infoHudButton.classList.add('active'); updateHUD(); } }); if (hudElement.classList.contains('hidden')) { infoHudButton.textContent = "ℹ️ Mostrar HUD"; infoHudButton.classList.remove('active'); } else { infoHudButton.textContent = "ℹ️ Ocultar HUD"; infoHudButton.classList.add('active'); } }
    if (settingsButton && settingsModal) settingsButton.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
    if (closeSettingsModalButton && settingsModal) closeSettingsModalButton.addEventListener('click', () => { settingsModal.style.display = 'none'; });
    if (oscConfigButton && oscConfigModal) { oscConfigButton.addEventListener('click', () => { oscHostInput.value = OSC_HOST; oscPortInput.value = OSC_PORT; oscConfigModal.style.display = 'flex'; }); }
    if (closeOscConfigModalButton && oscConfigModal) closeOscConfigModalButton.addEventListener('click', () => { oscConfigModal.style.display = 'none'; });
    if (saveOscConfigButton && oscConfigModal) saveOscConfigButton.addEventListener('click', () => { const newHost = oscHostInput.value.trim(); const newPort = parseInt(oscPortInput.value,10); if(!newHost){alert("IP OSC vazio.");return;} if(isNaN(newPort)||newPort<1||newPort>65535){alert("Porta OSC inválida.");return;} if(saveOscSettings(newHost,newPort)){logOSC("SYSTEM","Config OSC salva",{host:newHost,port:newPort});displayGlobalError(`Config OSC: ${newHost}:${newPort}. Reconectando...`,3000);if(oscConfigModal)oscConfigModal.style.display='none';setupOSC();}});
    if (arpeggioSettingsButton) arpeggioSettingsButton.addEventListener('click', () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = 'flex'});
    if (closeArpeggioSettingsModalButton) closeArpeggioSettingsModalButton.addEventListener('click', () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = 'none'});
    if (closeOscControlModalButton) closeOscControlModalButton.addEventListener('click', () => {if(oscControlModal) oscControlModal.style.display = 'none'});
    window.addEventListener('click', (event) => { if (event.target.classList.contains('modal-overlay')) event.target.style.display = 'none'; });
    if (midiOutputSelect) midiOutputSelect.addEventListener('change', () => { midiOutput = availableMidiOutputs.get(midiOutputSelect.value) || null; turnOffAllActiveNotes(); saveAllPersistentSettings(); });
    if (midiInputSelect) midiInputSelect.addEventListener('change', () => { setMidiInput(availableMidiInputs.get(midiInputSelect.value) || null); saveAllPersistentSettings(); });
    if (arpeggioStyleSelect) arpeggioStyleSelect.addEventListener('change', (e) => { if(spectatorModeActive)return; currentArpeggioStyle = e.target.value; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioStyle', currentArpeggioStyle);});
    if (arpeggioBPMSlider) arpeggioBPMSlider.addEventListener('input', (e) => { if(spectatorModeActive||externalBPM!==null)return; arpeggioBPM = parseInt(e.target.value); arpeggioBPMValueSpan.textContent = arpeggioBPM; noteInterval = 60000 / arpeggioBPM; if(noteIntervalSlider) noteIntervalSlider.value = noteInterval; if(noteIntervalValueSpan) noteIntervalValueSpan.textContent = Math.round(noteInterval); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM); });
    if (noteIntervalSlider) noteIntervalSlider.addEventListener('input', (e) => { if(spectatorModeActive||externalBPM!==null)return; noteInterval = parseInt(e.target.value); noteIntervalValueSpan.textContent = noteInterval; arpeggioBPM = 60000 / noteInterval; if(arpeggioBPMSlider) arpeggioBPMSlider.value = arpeggioBPM; if(arpeggioBPMValueSpan) arpeggioBPMValueSpan.textContent = Math.round(arpeggioBPM); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', Math.round(arpeggioBPM)); });
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
    
    // --- Listeners para Áudio Interno (v45) ---
    if (internalAudioToggleButton) internalAudioToggleButton.addEventListener('click', toggleInternalAudio);
    if (audioWaveformSelect) audioWaveformSelect.addEventListener('change', (e) => { if(simpleSynth) simpleSynth.setWaveform(e.target.value); saveAllPersistentSettings(); updateHUD(); });
    if (audioMasterVolumeSlider) audioMasterVolumeSlider.addEventListener('input', (e) => { const volume = parseFloat(e.target.value); if(simpleSynth) simpleSynth.setMasterVolume(volume); if(audioMasterVolumeValueSpan) audioMasterVolumeValueSpan.textContent = volume.toFixed(2); saveAllPersistentSettings(); /* Não precisa de updateHUD() aqui, pois não mostra volume no HUD */ });
    
    document.addEventListener('keydown', handleKeyPress);
    logDebug("Ouvintes de eventos configurados.");
}


function toggleInternalAudio() {
  if (spectatorModeActive) return;
  internalAudioEnabled = !internalAudioEnabled;
  if (internalAudioToggleButton) {
    internalAudioToggleButton.textContent = internalAudioEnabled ? "🔊 Áudio ON" : "🔊 Áudio OFF";
    internalAudioToggleButton.classList.toggle('active', internalAudioEnabled);
  }
  if (!internalAudioEnabled && simpleSynth) {
    simpleSynth.allNotesOff(); // Para todas as notas soando no synth interno
  }
  sendOSCMessage('/global/state/internalAudioEnabled', internalAudioEnabled ? 1 : 0);
  updateHUD();
  saveAllPersistentSettings();
}

function updateHUD() {
  if (!hudElement) { logDebug("Elemento HUD não encontrado."); return; }
  if (hudElement.classList.contains('hidden')) { let textSpan = hudElement.querySelector('span#hudTextContent'); if (textSpan) { textSpan.innerHTML = ""; } return; }
  let txt = "";
  if (spectatorModeActive) txt += `<b>👓 MODO ESPECTADOR</b><br>`;
  
  const audioIcon = internalAudioEnabled && audioCtx && audioCtx.state === 'running' ? '🟢' : '🔴';
  const audioStatusText = internalAudioEnabled && audioCtx && audioCtx.state === 'running' ? (simpleSynth?.waveform || 'ON') : 'OFF';
  const audioStatusClass = internalAudioEnabled && audioCtx && audioCtx.state === 'running' ? 'status-ok' : 'status-error';
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
  if (!spectatorModeActive && osc && osc.status() === OSC.STATUS.IS_OPEN && (now - lastOscSendTime > OSC_SEND_INTERVAL)) { lastOscSendTime = now; shapes.forEach(s => { const sid = s.id + 1; sendOSCMessage(`/forma/${sid}/radius`, parseFloat(s.radius.toFixed(2))); sendOSCMessage(`/forma/${sid}/sides`, s.sides); /* ... more OSC ... */ }); }
}

function toggleMidiEnabled(){if(spectatorModeActive)return;midiEnabled=!midiEnabled;midiToggleButton.textContent=midiEnabled?"🎹 MIDI ON":"🎹 MIDI OFF";midiToggleButton.classList.toggle('active',midiEnabled);if(!midiEnabled)turnOffAllActiveNotes();sendOSCMessage('/global/state/midiEnabled',midiEnabled?1:0);updateHUD();saveAllPersistentSettings();}
function toggleOperationMode(){if(spectatorModeActive)return;operationMode=(operationMode==='one_person')?'two_persons':'one_person';if(operationModeButton)operationModeButton.textContent=`👤 Modo: ${operationMode==='one_person'?'1P':'2P'}`;shapes.forEach(s=>{s.leftHandLandmarks=null;s.rightHandLandmarks=null;s.activeGesture=null;s.lastSentActiveGesture=null;});turnOffAllActiveNotes();updateHUD();saveAllPersistentSettings();}
function toggleDMXSync(){if(spectatorModeActive)return;dmxSyncModeActive=!dmxSyncModeActive;syncDMXNotesButton.textContent=`🎶 Sync DMX ${dmxSyncModeActive?'ON':'OFF'}`;syncDMXNotesButton.classList.toggle('active',dmxSyncModeActive);sendOSCMessage('/global/state/dmxSyncMode',dmxSyncModeActive?1:0);updateHUD();saveAllPersistentSettings();}
function toggleMidiFeedback(){if(spectatorModeActive)return;midiFeedbackEnabled=!midiFeedbackEnabled;midiFeedbackToggleButton.textContent=`🎤 MIDI In ${midiFeedbackEnabled?'ON':'OFF'}`;midiFeedbackToggleButton.classList.toggle('active',midiFeedbackEnabled);sendOSCMessage('/global/state/midiFeedbackEnabled',midiFeedbackEnabled?1:0);updateHUD();saveAllPersistentSettings();}
function toggleOSCRecording(){if(spectatorModeActive)return;isRecordingOSC=!isRecordingOSC;if(recordOSCButton)recordOSCButton.classList.toggle('active',isRecordingOSC);if(isRecordingOSC){recordedOSCSequence=[];recordingStartTime=performance.now();if(recordOSCButton)recordOSCButton.textContent="🔴 Gravando";if(playOSCLoopButton)playOSCLoopButton.disabled=true;}else{if(recordOSCButton)recordOSCButton.textContent="⏺️ Gravar OSC";if(playOSCLoopButton)playOSCLoopButton.disabled=recordedOSCSequence.length===0;if(recordedOSCSequence.length>0)logOSC("REC INFO",`Gravadas ${recordedOSCSequence.length} msgs. Duração: ${(recordedOSCSequence[recordedOSCSequence.length-1].timestamp/1000).toFixed(2)}s`,[]); } updateHUD();}
function playRecordedOSCLoop(){if(spectatorModeActive||recordedOSCSequence.length===0||isRecordingOSC)return;isPlayingOSCLoop=!isPlayingOSCLoop;if(playOSCLoopButton)playOSCLoopButton.classList.toggle('active',isPlayingOSCLoop);if(isPlayingOSCLoop){if(playOSCLoopButton)playOSCLoopButton.textContent="⏹️ Parar Loop";if(recordOSCButton)recordOSCButton.disabled=true;oscLoopDuration=parseInt(oscLoopDurationInput.value)||5000;playbackStartTime=performance.now();let currentPlaybackIndex=0;function loopStep(){if(!isPlayingOSCLoop)return;const elapsedTimeInLoop=(performance.now()-playbackStartTime)%oscLoopDuration;if(currentPlaybackIndex>0&&elapsedTimeInLoop<recordedOSCSequence[Math.max(0,currentPlaybackIndex-1)].timestamp)currentPlaybackIndex=0;while(currentPlaybackIndex<recordedOSCSequence.length&&recordedOSCSequence[currentPlaybackIndex].timestamp<=elapsedTimeInLoop){const item=recordedOSCSequence[currentPlaybackIndex];const tempIsRec=isRecordingOSC;isRecordingOSC=false;if(osc&&osc.status()===OSC.STATUS.IS_OPEN)osc.send(new OSC.Message(item.message.address,...item.message.args));isRecordingOSC=tempIsRec;logOSC("LOOP",item.message.address,item.message.args);currentPlaybackIndex++;} if(currentPlaybackIndex>=recordedOSCSequence.length&&recordedOSCSequence.length>0&&oscLoopDuration>recordedOSCSequence[recordedOSCSequence.length-1].timestamp)currentPlaybackIndex=0;playbackLoopIntervalId=requestAnimationFrame(loopStep);} playbackLoopIntervalId=requestAnimationFrame(loopStep);}else{if(playbackLoopIntervalId)cancelAnimationFrame(playbackLoopIntervalId);if(playOSCLoopButton)playOSCLoopButton.textContent="▶️ Loop OSC";if(recordOSCButton)recordOSCButton.disabled=false;} updateHUD();}
function toggleSpectatorMode(){spectatorModeActive=!spectatorModeActive;spectatorModeButton.textContent=`👓 Espectador ${spectatorModeActive?'ON':'OFF'}`;spectatorModeButton.classList.toggle('active',spectatorModeActive);const controlElements=[midiToggleButton,operationModeButton,syncDMXNotesButton,midiFeedbackToggleButton,recordOSCButton,playOSCLoopButton,gestureSimToggleButton,infoHudButton];if(spectatorModeActive){turnOffAllActiveNotes();if(isRecordingOSC)toggleOSCRecording();if(isPlayingOSCLoop)playRecordedOSCLoop();controlElements.forEach(btn=>{if(btn)btn.disabled=true;});if(arpeggioBPMSlider)arpeggioBPMSlider.disabled=true;if(noteIntervalSlider)noteIntervalSlider.disabled=true;}else{controlElements.forEach(btn=>{if(btn&&btn!==playOSCLoopButton&&btn!==gestureSimToggleButton)btn.disabled=false;});if(playOSCLoopButton)playOSCLoopButton.disabled=recordedOSCSequence.length===0;if(gestureSimToggleButton)gestureSimToggleButton.disabled=false;if(arpeggioBPMSlider&&externalBPM===null)arpeggioBPMSlider.disabled=false;if(noteIntervalSlider&&externalBPM===null)noteIntervalSlider.disabled=false;} updateHUD();}
function openPopup(){ /* ... */ }

function handleKeyPress(e) {
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
    if (e.key === 'Escape') { if (isInputFocused) activeEl.blur(); else if (anyModalOpen) [infoModal, settingsModal, arpeggioSettingsModal, oscControlModal, shapePresetModal, oscConfigModal].forEach(m => {if(m)m.style.display='none'}); return; }
    if (isInputFocused || (spectatorModeActive && e.key !== 'Escape')) return;
  
  // Mapa de ações sem Shift
  const actionMap = {
    'm': toggleMidiEnabled,
    // Adicione outras ações sem shift aqui
  };
  
  // Mapa de ações com Shift
  const correctedShiftActionMap = {
    'I': () => { if (infoModal) infoModal.style.display = infoModal.style.display === 'flex' ? 'none' : 'flex'; },
    'C': () => { if (settingsModal) settingsModal.style.display = settingsModal.style.display === 'flex' ? 'none' : 'flex'; },
    'A': () => { if (arpeggioSettingsModal) arpeggioSettingsModal.style.display = arpeggioSettingsModal.style.display === 'flex' ? 'none' : 'flex'; },
    'K': () => { if (oscConfigModal) oscConfigModal.style.display = oscConfigModal.style.display === 'flex' ? 'none' : 'flex'; },
    'B': () => { if (shapePresetModal) shapePresetModal.style.display = shapePresetModal.style.display === 'flex' ? 'none' : 'flex'; },
    'V': toggleInternalAudio, // Atalho para Áudio Interno
    'D': toggleDMXSync,
    'R': toggleOSCRecording,
    'P': playRecordedOSCLoop,
    'F': toggleMidiFeedback,
    'S': toggleSpectatorMode,
    'T': toggleTheme,
    // Adicione outros atalhos com Shift aqui
  };

    const key = e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase();
  const mapToUse = e.shiftKey ? correctedShiftActionMap : actionMap;

  if (mapToUse[key]) {
    e.preventDefault();
    mapToUse[key]();
    // Log para debug de atalhos
    // console.log(`Shortcut: ${e.shiftKey ? 'Shift+' : ''}${key} -> Action: ${mapToUse[key].name || 'anonymous function'}`);
  }
}

function savePersistentSetting(key,value){try{const s=JSON.parse(localStorage.getItem(APP_SETTINGS_KEY))||{};s[key]=value;localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(s));}catch(e){console.error("Erro ao salvar configuração:", key, value, e);}}
function loadPersistentSetting(key,defaultValue){try{const s=JSON.parse(localStorage.getItem(APP_SETTINGS_KEY))||{};return s[key]!==undefined?s[key]:defaultValue;}catch(e){console.error("Erro ao carregar configuração:", key, e);return defaultValue;}}

function saveAllPersistentSettings(){
  savePersistentSetting('operationMode',operationMode);
  savePersistentSetting('midiEnabled',midiEnabled);
  savePersistentSetting('internalAudioEnabled', internalAudioEnabled); // v45
  if(simpleSynth) savePersistentSetting('audioWaveform', simpleSynth.waveform); // v45
  if(simpleSynth) savePersistentSetting('audioMasterVolume', simpleSynth.masterGainNode.gain.value); // v45
  savePersistentSetting('dmxSyncModeActive',dmxSyncModeActive);
  savePersistentSetting('midiFeedbackEnabled',midiFeedbackEnabled);
  savePersistentSetting('spectatorModeActive',spectatorModeActive); // Embora o modo espectador não deva persistir ligado, salvar para consistência
  savePersistentSetting('currentTheme', currentTheme);
  savePersistentSetting('oscLoopDuration', oscLoopDuration);
  savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
  savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
  // Não salvar cameraError, gestureSimulationActive, isRecordingOSC, isPlayingOSCLoop - são estados de tempo de execução
  console.log("Configs V47 salvas no localStorage.");
}

function loadAllPersistentSettings(){
  operationMode = loadPersistentSetting('operationMode','two_persons');
  midiEnabled = loadPersistentSetting('midiEnabled',true);
  internalAudioEnabled = loadPersistentSetting('internalAudioEnabled', true); // v45
  const savedWaveform = loadPersistentSetting('audioWaveform', 'sine'); // v45
  const savedMasterVolume = loadPersistentSetting('audioMasterVolume', 0.5); // v45

  dmxSyncModeActive = loadPersistentSetting('dmxSyncModeActive',false);
  midiFeedbackEnabled = loadPersistentSetting('midiFeedbackEnabled',false);
  // spectatorModeActive = loadPersistentSetting('spectatorModeActive',false); // Não carregar, sempre iniciar como false
  spectatorModeActive = false; 
  currentTheme = loadPersistentSetting('currentTheme','theme-dark'); // Carrega o tema antes de aplicar
  oscLoopDuration = loadPersistentSetting('oscLoopDuration',5000);
  
  // Aplica as configurações carregadas que afetam a UI ou o estado do synth
  if (internalAudioToggleButton) { // Garante que o elemento exista
      internalAudioToggleButton.textContent = internalAudioEnabled ? "🔊 Áudio ON" : "🔊 Áudio OFF";
      internalAudioToggleButton.classList.toggle('active', internalAudioEnabled);
  }
  if (audioWaveformSelect) audioWaveformSelect.value = savedWaveform;
  if (simpleSynth) simpleSynth.setWaveform(savedWaveform); // Aplica ao synth se já instanciado
  
  if (audioMasterVolumeSlider) audioMasterVolumeSlider.value = savedMasterVolume;
  if (audioMasterVolumeValueSpan) audioMasterVolumeValueSpan.textContent = savedMasterVolume.toFixed(2);
  if (simpleSynth) simpleSynth.setMasterVolume(savedMasterVolume); // Aplica ao synth

  loadOscSettings(); // Carrega OSC_HOST e OSC_PORT
  loadArpeggioSettings(); // Carrega configurações de arpejo
  
  console.log("Configs V47 carregadas do localStorage.");
  return {
    savedMidiOutputId: loadPersistentSetting('midiOutputId',null),
    savedMidiInputId: loadPersistentSetting('midiInputId',null),
    // Retorna waveform e volume para serem aplicados ao SimpleSynth após sua instanciação, se necessário
    // No entanto, a lógica acima já tenta aplicar se simpleSynth existir.
  };
} 

function saveArpeggioSettings(){const s={currentArpeggioStyle,arpeggioBPM,noteInterval,externalBPM};try{localStorage.setItem(ARPEGGIO_SETTINGS_KEY,JSON.stringify(s));}catch(e){}/*savePersistentSetting('arpeggioSettingsLastUpdate',Date.now()); Não é mais necessário aqui, pois está dentro de saveAllPersistentSettings */}
function loadArpeggioSettings(){try{const s=JSON.parse(localStorage.getItem(ARPEGGIO_SETTINGS_KEY));if(s){currentArpeggioStyle=s.currentArpeggioStyle||"UP";arpeggioBPM=s.arpeggioBPM||120;noteInterval=s.noteInterval||(60000/arpeggioBPM);}}catch(e){}if(arpeggioStyleSelect)arpeggioStyleSelect.value=currentArpeggioStyle;if(arpeggioBPMSlider)arpeggioBPMSlider.value=arpeggioBPM;if(arpeggioBPMValueSpan)arpeggioBPMValueSpan.textContent=arpeggioBPM;if(noteIntervalSlider)noteIntervalSlider.value=noteInterval;if(noteIntervalValueSpan)noteIntervalValueSpan.textContent=noteInterval;}
function populateArpeggioStyleSelect(){if(!arpeggioStyleSelect)return;arpeggioStyleSelect.innerHTML='';ARPEGGIO_STYLES.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();arpeggioStyleSelect.appendChild(o);});arpeggioStyleSelect.value=currentArpeggioStyle;}

window.addEventListener('DOMContentLoaded', () => {
    logDebug("DOM Carregado. Iniciando main47.js...");
    console.log("DOM Carregado. Iniciando main47.js...");
    detectPlatform();
    hasWebGL2 = checkWebGL2Support();
    if (!hasWebGL2) displayGlobalError("Aviso: WebGL2 não disponível.", 15000);

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    initFallbackShapes(); // Inicializa formas de fallback cedo

    // Carregar configurações persistentes PRIMEIRO
    // loadAllPersistentSettings() agora também lida com OSC e Arpeggio settings internamente
    // e aplica configurações de áudio se simpleSynth já estiver disponível.
    const { savedMidiOutputId, savedMidiInputId } = loadAllPersistentSettings(); 
    
    loadTheme(); // Aplicar tema carregado por loadAllPersistentSettings
    applyTheme(currentTheme); // Certifica que o tema é aplicado visualmente

    initPresetManager();
    setupEventListeners(); // Configura todos os event listeners, incluindo os novos para áudio
    
    // Tenta obter instâncias de áudio. A criação real depende de gesto.
    // As variáveis globais audioCtx e simpleSynth em main47.js serão atualizadas
    // após a chamada bem-sucedida de initAudioOnFirstGesture.
    audioCtx = getAudioContext(); // Tenta obter o contexto de synth47.js
    simpleSynth = getSimpleSynthInstance(); // Tenta obter a instância de synth47.js

    if (simpleSynth) {
        // Se o simpleSynth já foi instanciado (por exemplo, por um gesto anterior e recarregamento da página
        // onde o AudioContext persistiu ou foi rapidamente re-instanciado por synth47.js),
        // então reaplicamos as configurações salvas.
        const savedWaveform = loadPersistentSetting('audioWaveform', 'sine');
        const savedMasterVolume = loadPersistentSetting('audioMasterVolume', 0.5);
        simpleSynth.setWaveform(savedWaveform);
        simpleSynth.setMasterVolume(savedMasterVolume);
        if(audioWaveformSelect) audioWaveformSelect.value = savedWaveform;
        if(audioMasterVolumeSlider) audioMasterVolumeSlider.value = savedMasterVolume;
        if(audioMasterVolumeValueSpan) audioMasterVolumeValueSpan.textContent = savedMasterVolume.toFixed(2);
        console.log("SimpleSynth já existia ou foi obtido no DOMContentLoaded, configurações de áudio aplicadas.");
    } else {
        console.log("SimpleSynth não disponível no DOMContentLoaded. Aguardando gesto do usuário.");
    }

    // Adiciona um listener para o primeiro gesto do usuário para inicializar/resumir o áudio.
    // Este listener deve ser removido após a primeira execução bem-sucedida.
    const firstGestureHandler = () => {
        console.log("Primeiro gesto detectado, tentando inicializar o áudio via synth47.js...");
        if (typeof initAudioContextOnGesture === "function") {
            const audioReady = initAudioContextOnGesture(); // Chama a função de synth47.js
            if (audioReady) {
                audioCtx = getAudioContext(); // Atualiza a referência local
                simpleSynth = getSimpleSynthInstance(); // Atualiza a referência local

                if (simpleSynth) {
                    // Aplica configurações salvas caso o synth tenha sido criado neste momento
                    const vol = parseFloat(loadPersistentSetting('audioMasterVolume', 0.5));
                    const wave = loadPersistentSetting('audioWaveform', 'sine');
                    simpleSynth.setMasterVolume(vol);
                    simpleSynth.setWaveform(wave);
                    if(audioMasterVolumeSlider) audioMasterVolumeSlider.value = vol;
                    if(audioMasterVolumeValueSpan) audioMasterVolumeValueSpan.textContent = vol.toFixed(2);
                    if(audioWaveformSelect) audioWaveformSelect.value = wave;
                    console.log("Áudio inicializado/resumido por gesto e synth configurado.");
                } else {
                    console.error("Falha ao obter instância do SimpleSynth após initAudioContextOnGesture.");
                }
                updateHUD(); // Atualiza o HUD com o status do áudio
                // Remove o listener para não ser chamado novamente
                document.removeEventListener('click', firstGestureHandler);
                document.removeEventListener('keydown', firstGestureHandler);
                console.log("Listener de primeiro gesto para áudio removido.");
            } else {
                console.warn("initAudioContextOnGesture() de synth47.js não retornou sucesso. O áudio pode não estar pronto.");
                // Não remove o listener para permitir futuras tentativas se a primeira falhar.
            }
        } else {
            console.error("initAudioContextOnGesture não está definida globalmente (esperada de synth47.js).");
        }
    };
    document.addEventListener('click', firstGestureHandler, { once: false }); // {once: false} para permitir nova tentativa se falhar
    document.addEventListener('keydown', firstGestureHandler, { once: false });
    console.log("Listeners para o primeiro gesto do usuário (para áudio) adicionados.");

    setupOSC(); // Configura OSC após carregar settings de OSC em loadAllPersistentSettings

    currentCameraDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || null;
    if (currentCameraDeviceId === "null" || currentCameraDeviceId === "undefined") currentCameraDeviceId = null;

    initMidi().then(async () => {
        if (savedMidiOutputId && availableMidiOutputs.has(savedMidiOutputId)) { if(midiOutputSelect) midiOutputSelect.value = savedMidiOutputId; midiOutput = availableMidiOutputs.get(savedMidiOutputId); }
        else if (availableMidiOutputs.size > 0 && midiOutputSelect) { midiOutputSelect.selectedIndex = 0; midiOutput = availableMidiOutputs.get(midiOutputSelect.value); }
        
        if (savedMidiInputId && availableMidiInputs.has(savedMidiInputId)) { if(midiInputSelect) midiInputSelect.value = savedMidiInputId; setMidiInput(availableMidiInputs.get(savedMidiInputId)); }
        else if (availableMidiInputs.size > 0 && midiInputSelect) { midiInputSelect.selectedIndex = 0; setMidiInput(availableMidiInputs.get(midiInputSelect.value)); }
        
        // Salvar IDs MIDI novamente após seleção/fallback para garantir que estejam corretos
        savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
        savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
        
        await populateCameraSelect();
        initializeCamera(currentCameraDeviceId); 
    }).catch(err => {
        console.error("Erro MIDI/Câmera init:", err);
        populateCameraSelect().then(() => initializeCamera(currentCameraDeviceId));
    });

    populateArpeggioStyleSelect(); // Popula e define valor com base no carregado em loadArpeggioSettings
    if(oscLoopDurationInput) oscLoopDurationInput.value = oscLoopDuration; // Definido por loadAllPersistentSettings
    if(hudElement) hudElement.classList.remove('hidden'); 

    updateHUD(); // Atualiza o HUD com todos os estados carregados/padrão
    sendAllGlobalStatesOSC(); // Envia estados iniciais via OSC

    if (oscLogTextarea) oscLogTextarea.value = `Log OSC - ${new Date().toLocaleTimeString()} - Configs Carregadas (v47).\n`;
    
    console.log("Iniciando loop de animação (v47) e finalizando DOMContentLoaded.");
    animationLoop(); 
});

function animationLoop() {
  requestAnimationFrame(animationLoop);
  // A lógica de desenhar o fallback agora está dentro de initializeCamera e onFrame
  // Se cameraError é true E gestureSimulationActive é false, drawFallbackAnimation() é chamado por onFrame (via initializeCamera)
  // ou diretamente por initializeCamera se o erro for na inicialização.
  // Se a câmera estiver OK, onResults -> drawShape lida com o redesenho.
  // Esta função de loop principal agora apenas garante que o ciclo de animação continue.
  // Se houver um erro de câmera e a simulação não estiver ativa,
  // a função onFrame do objeto Camera (ou o catch em initializeCamera)
  // deve chamar drawFallbackAnimation.
  // Se a simulação de gestos estiver ativa, ela chama onResults, que redesenha.
  // Se não houver erro na câmera, onResults é chamado, que redesenha.

  // Para garantir que o fallback seja desenhado se a câmera falhar *antes* do primeiro onFrame
  // e a simulação não estiver ativa:
  if (cameraError && !gestureSimulationActive && !camera) { // !camera pode indicar que a inicialização falhou completamente
      drawFallbackAnimation();
      updateHUD(); // Atualiza HUD no modo fallback
  }
}
