// ==========================================================================
// MIDI SHAPE MANIPULATOR v41 - main41.js
// ==========================================================================

// === GLOBAL VARIABLES & CONSTANTS ===
const sidebar = document.getElementById('sidebar');
const sidebarHandle = document.getElementById('sidebarHandle');
const mainCanvasContainer = document.getElementById('mainCanvasContainer'); // For click outside to close (also document body)

const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
let ctx = canvasElement.getContext('2d');

let hasWebGL2 = false; // Will be checked

// Forward declaration of Shape class
class Shape {
  constructor(id, midiChannel) {
    this.id = id;
    // Ensure canvasElement is valid before accessing width/height
    this.centerX = canvasElement ? canvasElement.width / (this.id === 0 ? 4 : 1.333) : 320;
    this.centerY = canvasElement ? canvasElement.height / 2 : 240;
    this.radius = 100;
    this.sides = 100; // 100 = círculo
    this.distortionFactor = 0; // Not actively used, but could be for presets
    this.activeMidiNotes = {};
    this.midiChannel = midiChannel;
    this.leftHandLandmarks = null;
    this.rightHandLandmarks = null;
    this.pinchDistance = 0; // Potentially for gesture detection refinement
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

const shapes = [new Shape(0, 0), new Shape(1, 1)]; // Shape instances

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

let osc; // OSC instance
let oscStatus = "OSC Desconectado";
// OSC_HOST and OSC_PORT will be loaded from localStorage or defaults
let OSC_HOST = localStorage.getItem('OSC_HOST') || location.hostname || "127.0.0.1";
let OSC_PORT = parseInt(localStorage.getItem('OSC_PORT'), 10) || 8080;
const OSC_SETTINGS_KEY = 'oscConnectionSettingsV35'; // Key for storing object {host, port}

let lastOscSendTime = 0;
const OSC_SEND_INTERVAL = 100; // ms
let oscHeartbeatIntervalId = null;
const OSC_RECONNECT_TIMEOUT = 3000; // ms

let isRecordingOSC = false;
let recordedOSCSequence = [];
let recordingStartTime = 0;
let playbackStartTime = 0;
let playbackLoopIntervalId = null;
let oscLoopDuration = 5000; // ms
let isPlayingOSCLoop = false;

let spectatorModeActive = false;
let dmxSyncModeActive = false;
let midiFeedbackEnabled = false;
let cameraError = false;
let fallbackShapes = [];
let gestureSimulationActive = false;
let gestureSimIntervalId = null;
const GESTURE_SIM_INTERVAL = 100; // ms

let currentTheme = 'theme-dark'; // 'theme-dark' or 'theme-light'
const THEME_STORAGE_KEY = 'midiShapeThemeV35'; // Updated
const PRESETS_STORAGE_KEY = 'midiShapePresetsV35'; // Updated
let shapePresets = {};
const APP_SETTINGS_KEY = 'midiShapeManipulatorV35Settings'; // Updated key for v35
const ARPEGGIO_SETTINGS_KEY = 'arpeggioSettingsV35'; // Updated key for v35
const CAMERA_DEVICE_ID_KEY = 'midiShapeCameraDeviceIdV36'; // New key for v36

// DOM Elements (cached for performance)
const midiToggleButton = document.getElementById('midiToggleButton');
const settingsButton = document.getElementById('settingsButton');
const hudElement = document.getElementById('hud');
const settingsModal = document.getElementById('settingsModal'); // MIDI Settings Modal
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
const oscPanelButton = document.getElementById('oscPanelButton'); // Opens OSC Test Panel
const oscControlModal = document.getElementById('oscControlModal'); // OSC Test Panel Modal
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

// New DOM Elements for OSC Configuration Modal (v35)
const oscConfigButton = document.getElementById('oscConfigButton');
const oscConfigModal = document.getElementById('oscConfigModal');
const closeOscConfigModalButton = document.getElementById('closeOscConfigModal');
const oscHostInput = document.getElementById('oscHostInput');
const oscPortInput = document.getElementById('oscPortInput');
const saveOscConfigButton = document.getElementById('saveOscConfigButton');
const cameraSelectElement = document.getElementById('cameraSelect'); // Added for v36

let currentCameraDeviceId = null; // Added for v36
let mediaStream = null; // To keep track of the current camera stream

let outputPopupWindow = null;
let popupCanvasCtx = null;
let midiAccess = null;
let midiOutput = null;
let midiInput = null;
let availableMidiOutputs = new Map();
let availableMidiInputs = new Map();
let lastLogSource = ""; // For OSC Log

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
// === END GLOBAL VARIABLES & CONSTANTS ===

// === PLATFORM DETECTION ===
let currentPlatform = 'PC'; // Default to PC
function detectPlatform() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) {
        currentPlatform = 'Android';
    } else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
        currentPlatform = 'iOS';
    } else {
        currentPlatform = 'PC';
    }
    console.log(`Plataforma Detectada: ${currentPlatform}`);
    document.body.classList.add(`platform-${currentPlatform.toLowerCase()}`);
}
// === END PLATFORM DETECTION ===

// === UTILITY FUNCTIONS ===
function checkWebGL2Support() {
  try {
    const testCanvas = document.createElement('canvas');
    if (testCanvas.getContext && testCanvas.getContext('webgl2')) {
      console.log("WebGL2 suportado.");
      return true;
    }
  } catch (e) { /* ignore */ }
  console.warn("WebGL2 não suportado pelo navegador.");
  return false;
}

function displayGlobalError(message, duration = 10000) {
    let errorDiv = document.getElementById('globalErrorDisplay');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'globalErrorDisplay';
        errorDiv.style.position = 'fixed'; errorDiv.style.top = '10px'; errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translateX(-50%)'; errorDiv.style.padding = '10px 20px';
        errorDiv.style.backgroundColor = '#e06c75'; errorDiv.style.color = 'white';
        errorDiv.style.zIndex = '2000'; errorDiv.style.borderRadius = '5px';
        errorDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)'; errorDiv.style.textAlign = 'center';
        document.body.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => { errorDiv.style.display = 'none'; }, duration);
}

function resizeCanvas() {
  // The canvas container (#mainCanvasContainer) will define the available space
  // The canvas itself will be 100% width and height of this container via CSS.
  // We need to set the rendering context size to match the element's display size.
  const dpr = window.devicePixelRatio || 1;
  const rect = canvasElement.getBoundingClientRect();

  canvasElement.width = rect.width * dpr;
  canvasElement.height = rect.height * dpr;

  // ctx.scale(dpr, dpr); // No need to scale context if rendering at full DPR resolution

  // Update shape positions relative to new canvas size if needed,
  // but shapes are generally positioned relative to canvasElement.width/height which get updated.
  // For example, if shapes store absolute pixel positions, they would need updating.
  // Here, they use relative positioning (e.g., canvasElement.width / 4), so should be fine.
  console.log(`Canvas resized to: ${canvasElement.width}x${canvasElement.height} (Display: ${rect.width}x${rect.height}, DPR: ${dpr})`);
}

function distance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1)**2 + (y2 - y1)**2); }

function isTouchingCircle(x, y, cx, cy, r, tolerance = 20) { return Math.abs(distance(x, y, cx, cy) - r) <= tolerance; }

function getNoteName(midiNote) {
  if (midiNote < 0 || midiNote > 127) return "";
  return `${NOTE_NAMES[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`;
}
// === END UTILITY FUNCTIONS ===


// === SHAPE ENGINE ===

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
  let normSides = (shape.sides - 3) / (20 - 3);
  normSides = Math.max(0, Math.min(1, normSides));
  if (shape.sides === 100) normSides = 0.5;
  shape.brightnessValue = Math.round(normSides * 127);

  // Note Generation (moved to its own function for clarity, called from here)
  processShapeNotes(shape, isPulsing, pulseValue);

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

function getNoteInScale(index, baseOctaveOffset = 0) {
  const scale = SCALES[currentScaleName];
  const scaleNotes = scale.notes; const len = scaleNotes.length;
  const octave = baseOctaveOffset + Math.floor(index / len);
  const noteIdx = index % len;
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
            if (shape.activeMidiNotes[oldKey]?.playing && !staccatoModeActive) {
                sendMidiNoteOff(shape.activeMidiNotes[oldKey].note, shape.midiChannel, shape.id + 1);
                shape.activeMidiNotes[oldKey].playing = false;
            }
        }

        switch (currentNoteMode) {
            case 'SEQUENTIAL':
                if (canPlayNonArp) {
                    shape.currentEdgeIndex += shape.rotationDirection;
                    if (shape.currentEdgeIndex >= shape.sides) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.rotationDirection = -1; }
                    else if (shape.currentEdgeIndex < 0) { shape.currentEdgeIndex = 0; shape.rotationDirection = 1; }
                    edgeIdx = shape.currentEdgeIndex;
                    if (edgeIdx < shape.sides) notesToPlay.push(getNoteInScale(edgeIdx));
                    notePlayed = true; shape.lastNotePlayedTime = now;
                }
                break;
            case 'ARPEGGIO':
                if (canPlayArp) {
                    Object.keys(shape.activeMidiNotes).forEach(k => { if (k.startsWith(`arp_${shape.id}_`) && shape.activeMidiNotes[k]?.playing && !staccatoModeActive) { sendMidiNoteOff(shape.activeMidiNotes[k].note, shape.midiChannel, shape.id + 1); shape.activeMidiNotes[k].playing = false; } });
                    if (currentArpeggioStyle === "UP") shape.currentEdgeIndex = (shape.currentEdgeIndex + 1) % shape.sides;
                    else if (currentArpeggioStyle === "DOWN") shape.currentEdgeIndex = (shape.currentEdgeIndex - 1 + shape.sides) % shape.sides;
                    else if (currentArpeggioStyle === "UPDOWN") {
                        if (shape.arpeggioDirection === 1) { if (shape.currentEdgeIndex >= shape.sides - 1) { shape.currentEdgeIndex = Math.max(0, shape.sides - 1); shape.arpeggioDirection = -1; } else shape.currentEdgeIndex++; }
                        else { if (shape.currentEdgeIndex <= 0) { shape.currentEdgeIndex = 0; shape.arpeggioDirection = 1; if (shape.sides > 1) shape.currentEdgeIndex++; } else shape.currentEdgeIndex--; }
                        if (shape.sides > 0) shape.currentEdgeIndex = Math.max(0, Math.min(shape.currentEdgeIndex, shape.sides - 1)); else shape.currentEdgeIndex = 0;
                    }
                    else if (currentArpeggioStyle === "RANDOM") shape.currentEdgeIndex = shape.sides > 0 ? Math.floor(Math.random() * shape.sides) : 0;
                    edgeIdx = shape.currentEdgeIndex;
                    if (shape.sides > 0) notesToPlay.push(getNoteInScale(edgeIdx));
                    notePlayed = true; shape.lastArpeggioNotePlayedTime = now;
                }
                break;
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
                    }
                    notePlayed = true; shape.lastNotePlayedTime = now;
                }
                break;
            case 'RANDOM_WALK':
                if (canPlayNonArp) {
                    shape.currentEdgeIndex += Math.floor(Math.random() * 3) - 1;
                    const scaleNoteCount = SCALES[currentScaleName].notes.length * 2; // ~2 octaves
                    shape.currentEdgeIndex = (shape.currentEdgeIndex + scaleNoteCount) % scaleNoteCount;
                    edgeIdx = shape.currentEdgeIndex;
                    notesToPlay.push(getNoteInScale(edgeIdx));
                    notePlayed = true; shape.lastNotePlayedTime = now;
                }
                break;
        }

        if (notePlayed && notesToPlay.length > 0) {
            let vel = Math.max(0, Math.min(127, Math.round(30 + (shape.radius - 30) * (97 / 270))));
            if (isPulsing) vel = Math.max(0, Math.min(127, Math.round(vel * (0.6 + ((pulseValue + 1) / 2) * 0.4))));

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
        if (Math.abs(shape.currentPitchBend - (shape.activeMidiNotes[Object.keys(shape.activeMidiNotes)[0]]?.lastPitchBend || 8192)) > 10) {
            sendPitchBend(shape.currentPitchBend, shape.midiChannel);
            Object.values(shape.activeMidiNotes).forEach(ni => { if(ni) ni.lastPitchBend = shape.currentPitchBend; });
        }
    }
}
// === END SHAPE ENGINE ===


// === MEDIAPIPE HANDS & CAMERA ===
let handsInstance; // Make handsInstance global to re-use after camera switch
let cameraUtil;    // Make cameraUtil global to properly stop/start

async function populateCameraSelect() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn("enumerateDevices() não é suportado.");
        if(cameraSelectElement) cameraSelectElement.disabled = true;
        return;
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if(cameraSelectElement) {
            cameraSelectElement.innerHTML = '<option value="">Padrão do Navegador</option>'; // Reset
            let preferredDeviceId = null;

            if (currentPlatform === 'Android') {
                // Try to find a rear camera first on Android
                const rearCamera = videoDevices.find(device => /back|rear|environment/i.test(device.label));
                if (rearCamera) {
                    preferredDeviceId = rearCamera.deviceId;
                    console.log("Câmera traseira priorizada no Android:", rearCamera.label);
                }
            }

            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Câmera ${cameraSelectElement.options.length}`;
                if (device.deviceId === currentCameraDeviceId) { // currentCameraDeviceId is the saved one
                    option.selected = true;
                } else if (!currentCameraDeviceId && preferredDeviceId && device.deviceId === preferredDeviceId) {
                    // If no saved one, but we found a preferred (e.g. Android rear), select it
                    option.selected = true;
                    currentCameraDeviceId = device.deviceId; // Set it as current for initialization
                }
                cameraSelectElement.appendChild(option);
            });
            cameraSelectElement.disabled = videoDevices.length <= 1 && !videoDevices.find(d=>d.deviceId === currentCameraDeviceId);
        }
    } catch (err) {
        console.error("Erro ao listar câmeras: ", err);
        if(cameraSelectElement) cameraSelectElement.disabled = true;
    }
}

async function initializeCamera(deviceId = null) {
    console.log(`Inicializando câmera com deviceId: ${deviceId || 'Padrão'}`);
    cameraError = false; // Reset camera error state

    if (mediaStream) { // Stop previous stream if exists
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
        console.log("Stream de câmera anterior parado.");
    }
    if (cameraUtil && typeof cameraUtil.stop === 'function') { // Stop previous Camera instance
        cameraUtil.stop(); // Camera from @mediapipe/camera_utils
        console.log("Instância CameraUtil anterior parada.");
    }


    try {
        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };
        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
        }

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (videoElement) {
            videoElement.srcObject = mediaStream;
            videoElement.onloadedmetadata = () => {
                videoElement.play().catch(e => {
                    console.error("Erro ao dar play no vídeo da câmera:", e);
                    cameraError = true;
                });
            };
        } else {
            console.error("videoElement não encontrado no DOM.");
            cameraError = true;
            if (mediaStream) mediaStream.getTracks().forEach(track => track.stop()); // Clean up
            return;
        }

        if (!handsInstance) { // Initialize Hands only once
            handsInstance = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
            handsInstance.setOptions({ maxNumHands: 4, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
            handsInstance.onResults(onResults);
            console.log("MediaPipe Hands instanciado.");
        }

        // Re-create Camera utility instance for the new stream
        cameraUtil = new Camera(videoElement, {
            onFrame: async () => {
                if (gestureSimulationActive) {
                    if (cameraError && !gestureSimulationActive) {
                         drawFallbackAnimation(); updateHUD();
                    }
                    return;
                }
                if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !cameraError) {
                     await handsInstance.send({ image: videoElement });
                } else if (cameraError) {
                    drawFallbackAnimation(); updateHUD();
                }
            },
            width: 640, height: 480 // These might need to be dynamic based on actual stream
        });
        await cameraUtil.start(); // Use await for start if it's async
        console.log("Camera e MediaPipe Hands (re)inicializados.");
        currentCameraDeviceId = deviceId; // Update the current device ID
        localStorage.setItem(CAMERA_DEVICE_ID_KEY, currentCameraDeviceId || ''); // Persist choice

    } catch (error) {
        console.error(`Falha ao acessar webcam (ID: ${deviceId || 'Padrão'}) ou iniciar MediaPipe Hands:`, error);
        displayGlobalError(`Falha webcam (${error.name}): ${error.message}. Verifique permissões.`, 20000);
        cameraError = true;
        if (mediaStream) mediaStream.getTracks().forEach(track => track.stop()); // Clean up
        if (!gestureSimulationActive) {
            console.log("Iniciando animação de fallback devido a erro na câmera.");
        } else {
            console.log("Erro na câmera, mas simulação de gestos está ATIVA.");
        }
    }
}


function onResults(results) { // Main MediaPipe results callback
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0,0,canvasElement.width, canvasElement.height);
  shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; });

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    if (operationMode === 'one_person') {
        let lH = null, rH = null;
        results.multiHandLandmarks.forEach((landmarks, i) => {
            if (!spectatorModeActive) drawLandmarks(landmarks); // drawLandmarks is a drawing utility
            const handedness = results.multiHandedness[i]?.label;
            if (handedness === "Left" && !lH) lH = landmarks; else if (handedness === "Right" && !rH) rH = landmarks;
        });
        shapes[0].leftHandLandmarks = lH; shapes[0].rightHandLandmarks = rH;
        if (shapes.length > 1) { shapes[1].leftHandLandmarks = null; shapes[1].rightHandLandmarks = null; }
    } else { // two_persons
        let assignedL = [false,false], assignedR = [false,false]; // Max 2 shapes for now
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

  shapes.forEach(shape => { // Process gestures for each shape
    if (spectatorModeActive) { shape.activeGesture = null; return; }

    let gestureProcessed = false; let currentGesture = null;
    // Update shape center based on wrist
    let wristCount = 0; let avgWristX = 0; let avgWristY = 0;
    if (shape.leftHandLandmarks?.[0]) { avgWristX += shape.leftHandLandmarks[0].x; avgWristY += shape.leftHandLandmarks[0].y; wristCount++; }
    if (shape.rightHandLandmarks?.[0]) { avgWristX += shape.rightHandLandmarks[0].x; avgWristY += shape.rightHandLandmarks[0].y; wristCount++; }
    if (wristCount > 0) {
        shape.centerX = shape.centerX * 0.85 + (canvasElement.width - (avgWristX/wristCount * canvasElement.width)) * 0.15;
        shape.centerY = shape.centerY * 0.85 + (avgWristY/wristCount * canvasElement.height) * 0.15;
    }

    // Resize gesture (two hands, thumbs + curled index)
    if (shape.leftHandLandmarks && shape.rightHandLandmarks) {
        const lThumb = shape.leftHandLandmarks[4], rThumb = shape.rightHandLandmarks[4];
        const lIdxCurl = shape.leftHandLandmarks[8].y > shape.leftHandLandmarks[6].y; // Simple curl check
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
    // Sides gesture (left hand pinch near shape edge)
    if (!gestureProcessed && shape.leftHandLandmarks) {
        const idx = shape.leftHandLandmarks[8], thumb = shape.leftHandLandmarks[4];
        const pinchDist = distance(idx.x, idx.y, thumb.x, thumb.y) * canvasElement.width;
        const pinchCanvasX = canvasElement.width - ((idx.x + thumb.x)/2 * canvasElement.width);
        const pinchCanvasY = ((idx.y + thumb.y)/2 * canvasElement.height);

        if (isTouchingCircle(pinchCanvasX, pinchCanvasY, shape.centerX, shape.centerY, shape.radius, shape.radius * 0.6)) {
            currentGesture = 'sides'; gestureProcessed = true;
            let newSides = (pinchDist > 150*1.2) ? 100 : Math.round(3 + Math.max(0,Math.min(1,(pinchDist-10)/150)) * (20-3));
            newSides = Math.max(3, Math.min(100, newSides));
            if (newSides !== shape.sides && (performance.now() - shape.lastSideChangeTime > SIDE_CHANGE_DEBOUNCE_MS)) {
                shape.sides = newSides; shape.lastSideChangeTime = performance.now();
                if(shape.currentEdgeIndex >= newSides) shape.currentEdgeIndex = Math.max(0, newSides-1);
                turnOffAllActiveNotesForShape(shape); // Changed from turnOffAllActiveNotes()
            }
        }
    }
    // Liquify (right hand present and no other gesture)
    if (!gestureProcessed && shape.rightHandLandmarks) {
        currentGesture = 'liquify';
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

  const visNow = performance.now(); // For note visualization
  ctx.font="15px Arial"; ctx.textAlign="center";
  notesToVisualize = notesToVisualize.filter(n => {
      const age = visNow - n.timestamp;
      if (age < 750) { ctx.fillStyle = `rgba(255,255,255,${1-(age/750)})`; ctx.fillText(n.noteName, n.x, n.y); return true; }
      return false;
  });
  updateHUD();
  if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) {
    try {
        const pc = outputPopupWindow.document.getElementById('popupCanvas');
        if (pc.width !== outputPopupWindow.innerWidth || pc.height !== outputPopupWindow.innerHeight) { pc.width = outputPopupWindow.innerWidth; pc.height = outputPopupWindow.innerHeight;}
        popupCanvasCtx.fillStyle='rgba(0,0,0,0.1)'; popupCanvasCtx.fillRect(0,0,pc.width,pc.height);
        popupCanvasCtx.drawImage(canvasElement,0,0,pc.width,pc.height);
    } catch(e) { if(e.name === "InvalidStateError" || outputPopupWindow?.closed) {popupCanvasCtx=null; outputPopupWindow=null;} }
  }
}

function drawLandmarks(landmarksArray) {
    if (!landmarksArray || landmarksArray.length === 0 || spectatorModeActive) return;
    const connections = [[0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], [5,9],[9,10],[10,11],[11,12], [9,13],[13,14],[14,15],[15,16], [13,17],[17,18],[18,19],[19,20], [0,17]];
    ctx.strokeStyle = 'lime'; ctx.lineWidth = 2;
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
    if (fallbackShapes.length > 0) return;
    const numShapes = 5; const colors = ["#FF00FF", "#00FFFF", "#FFFF00", "#FF0000", "#00FF00"];
    for (let i = 0; i < numShapes; i++) {
        fallbackShapes.push({
            x: Math.random() * canvasElement.width, y: Math.random() * canvasElement.height,
            radius: 20 + Math.random() * 30, color: colors[i % colors.length],
            vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
            sides: 3 + Math.floor(Math.random() * 5)
        });
    }
}

function drawFallbackAnimation() {
    if (fallbackShapes.length === 0) initFallbackShapes();
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    ctx.font = "20px Arial"; ctx.fillStyle = "#777"; ctx.textAlign = "center";
    ctx.fillText("Detecção de mãos indisponível. Exibindo animação alternativa.", canvasElement.width / 2, canvasElement.height / 2 - 50);
    fallbackShapes.forEach(shape => {
        shape.x += shape.vx; shape.y += shape.vy;
        if (shape.x - shape.radius < 0 || shape.x + shape.radius > canvasElement.width) shape.vx *= -1;
        if (shape.y - shape.radius < 0 || shape.y + shape.radius > canvasElement.height) shape.vy *= -1;
        ctx.beginPath();
        for (let i = 0; i < shape.sides; i++) {
            const angle = (i / shape.sides) * Math.PI * 2 + (performance.now() / 1000) * (shape.vx > 0 ? 0.5 : -0.5) ;
            const x = shape.x + shape.radius * Math.cos(angle); const y = shape.y + shape.radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.strokeStyle = shape.color; ctx.lineWidth = 3; ctx.stroke();
    });
}
// === END MEDIAPIPE HANDS & CAMERA ===


// === MIDI MANAGER ===
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

function handleMidiMessage(event) {
  if (!midiFeedbackEnabled || spectatorModeActive) return;
  const cmd = event.data[0] >> 4; const ch = event.data[0] & 0x0F;
  const data1 = event.data[1]; const data2 = event.data.length > 2 ? event.data[2] : 0;
  let oscAddr = null, oscArgs = [ch, data1];

  if (cmd === 9 && data2 > 0) { oscAddr = '/midi/in/noteOn'; oscArgs.push(data2); }
  else if (cmd === 8 || (cmd === 9 && data2 === 0)) { oscAddr = '/midi/in/noteOff'; }
  else if (cmd === 11) { oscAddr = '/midi/in/cc'; oscArgs.push(data2); }
  else if (cmd === 14) { oscAddr = '/midi/in/pitchbend'; oscArgs = [ch, (data2 << 7) | data1]; }

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
}

function sendMidiCC(cc, value, channel) {
  if (spectatorModeActive || !midiEnabled || !midiOutput) return;
  const ch = Math.max(0, Math.min(15, channel));
  const c = Math.max(0, Math.min(119, Math.round(cc)));
  const v = Math.max(0, Math.min(127, Math.round(value)));
  midiOutput.send([0xB0 + ch, c, v]);
}

function turnOffAllActiveNotesForShape(shape) {
    if (spectatorModeActive) return;
    const origMidiEnabled = midiEnabled; midiEnabled = true;
    Object.values(shape.activeMidiNotes).forEach(noteInfo => {
        if (noteInfo.playing) sendMidiNoteOff(noteInfo.note, shape.midiChannel, shape.id + 1);
        if (noteInfo.staccatoTimer) clearTimeout(noteInfo.staccatoTimer);
    });
    shape.activeMidiNotes = {};
    midiEnabled = origMidiEnabled;
}

function turnOffAllActiveNotes() {
  if (spectatorModeActive) return;
  const origMidiEnabled = midiEnabled; midiEnabled = true;
  shapes.forEach(shape => turnOffAllActiveNotesForShape(shape));
  midiEnabled = origMidiEnabled;
}

function resetMidiSystem() {
    if (spectatorModeActive) return;
    console.log("MIDI Reset Solicitado.");
    turnOffAllActiveNotes();
    const origMidiEnabled = midiEnabled; midiEnabled = true;
    if (midiOutput) {
        console.log(`Enviando All Sound Off / Reset All Controllers para ${midiOutput.name}`);
        for (let ch = 0; ch < 16; ch++) {
            midiOutput.send([0xB0 + ch, 120, 0]);
            midiOutput.send([0xB0 + ch, 121, 0]);
        }
    } else { console.warn("Nenhuma porta MIDI de saída selecionada para o Reset MIDI."); }
    midiEnabled = origMidiEnabled;
    shapes.forEach(shape => { // Reset internal shape CC states
        shape.currentPitchBend = 8192; shape.reverbAmount = 0; shape.delayAmount = 0;
        shape.panValue = 64; shape.brightnessValue = 64; shape.modWheelValue = 0; shape.resonanceValue = 0;
        shape.lastSentReverb = -1; shape.lastSentDelay = -1; shape.lastSentPan = -1;
        shape.lastSentBrightness = -1; shape.lastSentModWheel = -1; shape.lastSentResonance = -1;
    });
    updateHUD(); sendAllGlobalStatesOSC();
    displayGlobalError("Sistema MIDI Resetado.", 3000);
    logOSC("SYSTEM", "MIDI Reset Executado", []);
}
// === END MIDI MANAGER ===


// === OSC MANAGER ===
function loadOscSettings() {
    const storedSettings = localStorage.getItem(OSC_SETTINGS_KEY);
    let loadedHost = location.hostname; // Default to current hostname
    let loadedPort = 8080; // Default port

    if (storedSettings) {
        try {
            const settings = JSON.parse(storedSettings);
            if (settings.host) loadedHost = settings.host;
            if (settings.port) loadedPort = parseInt(settings.port, 10);
            console.log(`Configurações OSC carregadas de localStorage: Host=${loadedHost}, Port=${loadedPort}`);
        } catch (e) {
            console.warn("Erro ao carregar configurações OSC de localStorage, usando padrões.", e);
            // Fallback to hostname or 127.0.0.1 if hostname is empty (file://)
            loadedHost = location.hostname || "127.0.0.1";
            loadedPort = 8080;
        }
    } else {
        // No stored settings, use hostname or fallback
        loadedHost = location.hostname || "127.0.0.1";
        loadedPort = 8080;
        console.log(`Nenhuma configuração OSC salva, usando: Host=${loadedHost}, Port=${loadedPort}`);
    }

    // Ensure OSC_HOST is never an empty string, especially for file:/// context
    OSC_HOST = loadedHost || "127.0.0.1";
    OSC_PORT = loadedPort || 8080;

    // Update input fields in the OSC config modal
    if (oscHostInput) oscHostInput.value = OSC_HOST;
    if (oscPortInput) oscPortInput.value = OSC_PORT;

    console.log(`Configurações OSC finais aplicadas: Host=${OSC_HOST}, Port=${OSC_PORT}`);
}

function saveOscSettings(host, port) {
    const newPort = parseInt(port, 10);
    if (isNaN(newPort) || newPort < 1 || newPort > 65535) {
        console.error("Porta OSC inválida:", port);
        displayGlobalError("Porta OSC inválida. Deve ser um número entre 1 e 65535.", 5000);
        return false;
    }
    if (!host || host.trim() === "") {
        console.error("Host OSC inválido:", host);
        displayGlobalError("Host OSC não pode ser vazio.", 5000);
        return false;
    }

    const settings = { host: host.trim(), port: newPort };
    try {
        localStorage.setItem(OSC_SETTINGS_KEY, JSON.stringify(settings));
        OSC_HOST = settings.host;
        OSC_PORT = settings.port;
        console.log(`Configurações OSC salvas e aplicadas: Host=${OSC_HOST}, Port=${OSC_PORT}`);

        // Update input fields in the OSC config modal to reflect saved values
        if (oscHostInput) oscHostInput.value = OSC_HOST;
        if (oscPortInput) oscPortInput.value = OSC_PORT;

        // Attempt to reconnect OSC with new settings
        if (osc && typeof setupOSC === 'function') {
            console.log("Reconectando OSC com novas configurações...");
            setupOSC(); // This function should handle closing existing connection and opening new one
        }
        return true;
    } catch (e) {
        console.error("Erro ao salvar configurações OSC:", e);
        displayGlobalError("Erro ao salvar configurações OSC.", 5000);
        return false;
    }
}


function sendOSCMessage(address, ...args) {
    if (spectatorModeActive && !address.startsWith('/ping')) return;
    if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
        const message = new OSC.Message(address, ...args);
        try {
            osc.send(message);
        } catch (error) {
            console.error(`Erro ao enviar mensagem OSC (${address}):`, error);
            // Adicionar uma tentativa de reconexão ou notificação ao usuário pode ser útil aqui
            if (osc.status() !== OSC.STATUS.IS_OPEN && reconnectOSCButton) {
                 reconnectOSCButton.style.display = 'inline-block';
                 oscStatus = "OSC Erro ao Enviar";
                 updateHUD();
            }
        }

        if (isRecordingOSC && !address.startsWith('/ping')) {
            recordedOSCSequence.push({
                timestamp: performance.now() - recordingStartTime,
                message: { address: message.address, args: message.args }
            });
        }
    } else {
        // console.warn(`OSC não conectado. Mensagem (${address}) não enviada.`);
        // Display reconnect button if OSC is not open
        if (reconnectOSCButton && osc && osc.status() !== OSC.STATUS.IS_OPEN) {
            reconnectOSCButton.style.display = 'inline-block';
        }
    }
}

function sendOSCHeartbeat() { sendOSCMessage('/ping', Date.now()); }

function setupOSC() {
  if (osc && osc.status() === OSC.STATUS.IS_OPEN) {
    console.log("Fechando conexão OSC existente antes de reabrir...");
    osc.close();
  }
  if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null;

  // Carrega as configurações de OSC_HOST e OSC_PORT antes de criar a instância OSC
  // A função loadOscSettings já define OSC_HOST e OSC_PORT globalmente
  // e também lida com o fallback para location.hostname || "127.0.0.1"

  console.log(`Tentando conectar OSC em: ws://${OSC_HOST}:${OSC_PORT}`);

  osc = new OSC({ plugin: new OSC.WebsocketClientPlugin({ host: OSC_HOST, port: OSC_PORT, secure: false }) });

  osc.on('open', () => {
    oscStatus = `OSC Conectado (ws://${OSC_HOST}:${OSC_PORT})`; console.log(oscStatus);
    if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); // Clear again just in case
    oscHeartbeatIntervalId = setInterval(sendOSCHeartbeat, 5000);
    sendOSCHeartbeat(); sendAllGlobalStatesOSC();
    if (reconnectOSCButton) reconnectOSCButton.style.display = 'none';
    updateHUD();
  });

  osc.on('close', (event) => {
    oscStatus = "OSC Desconectado";
    console.log(oscStatus, event ? `(Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean})` : "");
    if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null;
    if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block';
    updateHUD();
  });

  osc.on('error', (err) => {
    oscStatus = "OSC Erro de Conexão"; console.error("OSC Error:", err);
    if (oscHeartbeatIntervalId) clearInterval(oscHeartbeatIntervalId); oscHeartbeatIntervalId = null;
    if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block';
    updateHUD();
    // Não tentar reconectar automaticamente aqui para evitar loops se o servidor estiver realmente offline
    // O usuário pode usar o botão "Reconnect OSC"
  });

  osc.on('message', (msg) => {
    try {
        let parsedMsg = msg;
        if (msg.args && msg.args.length > 0 && typeof msg.args[0] === 'string') {
            try {
                const potentialJson = JSON.parse(msg.args[0]);
                if (potentialJson.type === "confirmation") parsedMsg = potentialJson;
                else if (potentialJson.address && potentialJson.args) parsedMsg = potentialJson;
            } catch (e) { /* Not JSON */ }
        }
        if (parsedMsg && parsedMsg.address) {
            logOSC("IN (UDP)", parsedMsg.address, parsedMsg.args);
            handleIncomingExternalOSC(parsedMsg);
        }
    } catch (e) { console.error("Erro ao processar mensagem OSC recebida:", e, "Mensagem original:", msg); }
  });

  try {
    osc.open();
  }
  catch (error) {
    // Este catch pode pegar erros síncronos na instanciação do OSC ou no .open()
    // como URL inválida, que é o problema original.
    console.error(`Falha crítica ao tentar iniciar OSC com ws://${OSC_HOST}:${OSC_PORT}:`, error);
    oscStatus = `OSC Falha: ${error.message}`;
    if (reconnectOSCButton) reconnectOSCButton.style.display = 'inline-block';
    updateHUD();
    // Não tentar reconectar automaticamente em um loop aqui. O usuário pode usar o botão.
    // O erro "SyntaxError: Failed to construct 'WebSocket': The URL 'ws://:8080' is invalid."
    // seria pego aqui se OSC_HOST fosse vazio.
  }

  osc.on('/global/setExternalBPM', msg => {
    const newExtBPM = msg.args[0]?.value !== undefined ? msg.args[0].value : msg.args[0];
    if (typeof newExtBPM === 'number') {
      if (newExtBPM > 0) {
        externalBPM = newExtBPM; arpeggioBPM = externalBPM; noteInterval = 60000 / arpeggioBPM;
        console.log(`OSC: BPM Externo -> ${arpeggioBPM}, Intervalo -> ${noteInterval.toFixed(0)}ms`);
        if (arpeggioBPMValueSpan) arpeggioBPMValueSpan.textContent = `${arpeggioBPM.toFixed(1)} (Ext)`;
        if (arpeggioBPMSlider) arpeggioBPMSlider.disabled = true;
        if (noteIntervalSlider) noteIntervalSlider.disabled = true;
        sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM);
      } else {
        externalBPM = null;
        if (arpeggioBPMSlider) arpeggioBPMSlider.disabled = false;
        if (noteIntervalSlider) noteIntervalSlider.disabled = false;
        loadArpeggioSettings(); // Recarrega BPM/Intervalo manual
        console.log(`OSC: BPM Externo desabilitado. BPM -> ${arpeggioBPM}`);
      }
      updateHUD();
    }
  });

  osc.on('/global/setScale', msg => {
    if (spectatorModeActive) return;
    const newScale = msg.args[0]?.value !== undefined ? msg.args[0].value : msg.args[0];
    if (typeof newScale === 'string') setScale(newScale.toUpperCase());
  });
}


function handleIncomingExternalOSC(oscMessage) {
    if (spectatorModeActive) return;
    const address = oscMessage.address;
    const args = oscMessage.args.map(arg => (arg && arg.value !== undefined) ? arg.value : arg);
    console.log(`OSC IN (UDP Routed): ${address}`, args);

    const shapeControlRegex = /^\/forma\/(\d+)\/(setRadius|setSides)$/;
    const shapeMatch = address.match(shapeControlRegex);

    if (shapeMatch) {
        const shapeId = parseInt(shapeMatch[1], 10) - 1;
        const command = shapeMatch[2]; const value = parseFloat(args[0]);
        if (shapeId >= 0 && shapeId < shapes.length && !isNaN(value)) {
            const shape = shapes[shapeId];
            if (command === "setRadius" && value >= 10 && value <= 500) {
                shape.radius = value; console.log(`Shape ${shapeId + 1} radius set to ${value} via OSC`);
                sendOSCMessage(`/forma/${shapeId + 1}/radius`, shape.radius);
            } else if (command === "setSides") {
                const intValue = parseInt(args[0], 10);
                if (intValue >= 3 && intValue <= 100) {
                    shape.sides = intValue;
                    if(shape.currentEdgeIndex >= shape.sides) shape.currentEdgeIndex = Math.max(0, shape.sides-1);
                    turnOffAllActiveNotesForShape(shape);
                    console.log(`Shape ${shapeId + 1} sides set to ${intValue} via OSC`);
                    sendOSCMessage(`/forma/${shapeId + 1}/sides`, shape.sides);
                } else console.warn(`OSC: Valor de lados inválido para forma ${shapeId + 1}: ${intValue}`);
            } else console.warn(`OSC: Comando ou valor de raio inválido para forma ${shapeId + 1}: ${command} ${value}`);
            updateHUD();
        } else console.warn(`OSC: ID de forma ou valor inválido para ${address}: ${args}`);
    } else if (address === '/recordOSC/start' && !isRecordingOSC) {
        toggleOSCRecording(); console.log("OSC: Gravação OSC iniciada remotamente.");
    } else if (address === '/recordOSC/stop' && isRecordingOSC) {
        toggleOSCRecording(); console.log("OSC: Gravação OSC parada remotamente.");
    } else if (address === '/playOSC/start' && !isPlayingOSCLoop && recordedOSCSequence.length > 0) {
        playRecordedOSCLoop(); console.log("OSC: Playback OSC iniciado remotamente.");
    } else if (address === '/playOSC/start' && recordedOSCSequence.length === 0) {
        console.warn("OSC: Playback não iniciado, nenhuma sequência gravada.");
    } else if (address === '/playOSC/stop' && isPlayingOSCLoop) {
        playRecordedOSCLoop(); console.log("OSC: Playback OSC parado remotamente.");
    }
}

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
}

function logOSC(source, address, args, isSeparator = false) {
    if (oscLogTextarea) {
        if (isSeparator) {
            oscLogTextarea.value += `--- Log Separator (${new Date().toLocaleTimeString()}) ---\n`;
            lastLogSource = "SEPARATOR"; oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight; return;
        }
        const timestamp = new Date().toLocaleTimeString(); let sourcePrefix = "SYS";
        switch (source.toUpperCase()) {
            case "OUT": sourcePrefix = "OUT"; break; case "IN (UDP)": sourcePrefix = "UDP"; break;
            case "MIDI->OSC": sourcePrefix = "MIDI"; break; case "LOOP": sourcePrefix = "LOOP"; break;
            case "PANEL": sourcePrefix = "PANEL"; break; case "REC INFO": sourcePrefix = "REC"; break;
        }
        if (source.toUpperCase() !== lastLogSource && lastLogSource !== "" && lastLogSource !== "SEPARATOR") {
             oscLogTextarea.value += `-------------------------------------\n`;
        }
        lastLogSource = source.toUpperCase();
        const type = args && args.length > 0 && typeof args[0] === 'object' && args[0].type ? ` (${args.map(a => a.type).join(', ')})` : '';
        oscLogTextarea.value += `${timestamp} [${sourcePrefix}] ${address}${type} ${JSON.stringify(args)}\n`;
        oscLogTextarea.scrollTop = oscLogTextarea.scrollHeight;
    }
}

function exportOSCLog() {
    if (!oscLogTextarea || oscLogTextarea.value.trim() === "") { alert("Log OSC está vazio."); return; }
    try {
        const blob = new Blob([oscLogTextarea.value], { type: 'text/plain;charset=utf-8' });
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const filename = `osc_log_v35_${timestamp}.txt`; // Updated version
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename;
        document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href);
        logOSC("SYSTEM", "Log OSC exportado.", [filename]);
    } catch (e) { console.error("Erro ao exportar log OSC:", e); alert("Falha exportar log."); logOSC("SYSTEM", "Falha exportar log.", [e.message]); }
}
// === END OSC MANAGER ===


// === PRESET MANAGER ===
function getShapeState(shape) {
    return {
        radius: shape.radius, sides: shape.sides, reverbAmount: shape.reverbAmount, delayAmount: shape.delayAmount,
        panValue: shape.panValue, brightnessValue: shape.brightnessValue, modWheelValue: shape.modWheelValue, resonanceValue: shape.resonanceValue,
    };
}

function applyShapeState(shape, state) {
    if (!state) return;
    shape.radius = state.radius !== undefined ? state.radius : shape.radius;
    shape.sides = state.sides !== undefined ? state.sides : shape.sides;
    shape.reverbAmount = state.reverbAmount !== undefined ? state.reverbAmount : shape.reverbAmount;
    shape.delayAmount = state.delayAmount !== undefined ? state.delayAmount : shape.delayAmount;
    shape.panValue = state.panValue !== undefined ? state.panValue : shape.panValue;
    shape.brightnessValue = state.brightnessValue !== undefined ? state.brightnessValue : shape.brightnessValue;
    shape.modWheelValue = state.modWheelValue !== undefined ? state.modWheelValue : shape.modWheelValue;
    shape.resonanceValue = state.resonanceValue !== undefined ? state.resonanceValue : shape.resonanceValue;
    shape.lastSentReverb = -1; shape.lastSentDelay = -1; shape.lastSentPan = -1;
    shape.lastSentBrightness = -1; shape.lastSentModWheel = -1; shape.lastSentResonance = -1;
    if (state.sides !== undefined) { // Simplified check as shape.sides was already updated
        if(shape.currentEdgeIndex >= shape.sides) shape.currentEdgeIndex = Math.max(0, shape.sides-1);
        turnOffAllActiveNotesForShape(shape);
    }
    updateHUD();
}

function saveShapePreset() {
    if (spectatorModeActive) return;
    const presetName = presetNameInput.value.trim();
    if (!presetName) { alert("Insira um nome para o preset."); presetNameInput.focus(); return; }
    const selectedShapeIndex = parseInt(shapeToPresetSelect.value, 10);
    if (isNaN(selectedShapeIndex) || selectedShapeIndex < 0 || selectedShapeIndex >= shapes.length) { alert("Forma inválida."); return; }

    const shape = shapes[selectedShapeIndex]; const shapeState = getShapeState(shape);
    if (!shapePresets[presetName]) shapePresets[presetName] = {};
    shapePresets[presetName][`shape${selectedShapeIndex}`] = shapeState;

    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(shapePresets));
    populateSavedPresetsSelect(); savedPresetsSelect.value = presetName;
    logOSC("SYSTEM", "Preset Salvo", [presetName, `shape${selectedShapeIndex}`]);
    displayGlobalError(`Preset '${presetName}' salvo para Forma ${selectedShapeIndex + 1}.`, 3000);
}

function loadShapePreset() {
    if (spectatorModeActive) return;
    const presetName = savedPresetsSelect.value;
    if (!presetName || !shapePresets[presetName]) { alert("Selecione um preset válido."); return; }
    const selectedShapeIndex = parseInt(shapeToPresetSelect.value, 10);
    if (isNaN(selectedShapeIndex) || selectedShapeIndex < 0 || selectedShapeIndex >= shapes.length) { alert("Forma selecionada inválida."); return; }

    const presetData = shapePresets[presetName]; const shapeStateToApply = presetData[`shape${selectedShapeIndex}`];
    if (shapeStateToApply) {
        applyShapeState(shapes[selectedShapeIndex], shapeStateToApply);
        presetNameInput.value = presetName;
        logOSC("SYSTEM", "Preset Carregado", [presetName, `shape${selectedShapeIndex}`]);
        displayGlobalError(`Preset '${presetName}' carregado para Forma ${selectedShapeIndex + 1}.`, 3000);
    } else alert(`Preset '${presetName}' não contém dados para Forma ${selectedShapeIndex + 1}.`);
}

function deleteSelectedPreset() {
    if (spectatorModeActive) return;
    const presetName = savedPresetsSelect.value;
    if (!presetName || !shapePresets[presetName]) { alert("Selecione um preset para deletar."); return; }
    if (confirm(`Deletar preset '${presetName}'?`)) {
        delete shapePresets[presetName];
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(shapePresets));
        populateSavedPresetsSelect(); presetNameInput.value = "";
        logOSC("SYSTEM", "Preset Deletado", [presetName]);
        displayGlobalError(`Preset '${presetName}' deletado.`, 3000);
    }
}

function populateSavedPresetsSelect() {
    if (!savedPresetsSelect) return;
    const currentSelection = savedPresetsSelect.value; savedPresetsSelect.innerHTML = '';
    Object.keys(shapePresets).sort().forEach(name => {
        const option = document.createElement('option'); option.value = name; option.textContent = name;
        savedPresetsSelect.appendChild(option);
    });
    if (shapePresets[currentSelection]) savedPresetsSelect.value = currentSelection;
    else if (savedPresetsSelect.options.length > 0) savedPresetsSelect.selectedIndex = 0;
    presetNameInput.value = (savedPresetsSelect.value && shapePresets[savedPresetsSelect.value]) ? savedPresetsSelect.value : "";
}

function exportAllPresets() {
    if (Object.keys(shapePresets).length === 0) { alert("Nenhum preset para exportar."); return; }
    const jsonString = JSON.stringify(shapePresets, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    const now = new Date(); const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    a.download = `midiShapePresets_v35_${timestamp}.json`; // Updated version
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    logOSC("SYSTEM", "Presets Exportados", []); displayGlobalError("Presets exportados.", 3000);
}

function importAllPresets() { if (!spectatorModeActive) importPresetFileInput.click(); }

function handleImportPresetFile(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedPresets = JSON.parse(e.target.result);
            if (typeof importedPresets !== 'object' || importedPresets === null) throw new Error("Formato JSON inválido.");
            let importCount = 0, overwriteCount = 0;
            for (const presetName in importedPresets) {
                if (shapePresets[presetName]) overwriteCount++; else importCount++;
                shapePresets[presetName] = importedPresets[presetName];
            }
            localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(shapePresets));
            populateSavedPresetsSelect();
            logOSC("SYSTEM", "Presets Importados", [`Novos: ${importCount}, Sobrescritos: ${overwriteCount}`]);
            displayGlobalError(`Presets importados. Novos: ${importCount}, Sobrescritos: ${overwriteCount}.`, 5000);
        } catch (error) { alert(`Erro importar presets: ${error.message}`); console.error("Erro importar presets:", error); }
        finally { importPresetFileInput.value = ''; }
    };
    reader.readAsText(file);
}

function loadPresetsFromStorage() {
    const storedPresets = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (storedPresets) {
        try { shapePresets = JSON.parse(storedPresets); }
        catch (e) { console.error("Erro carregar presets:", e); shapePresets = {}; localStorage.removeItem(PRESETS_STORAGE_KEY); }
    } else shapePresets = {};
    populateSavedPresetsSelect();
}

function populateShapeToPresetSelect() {
    if (!shapeToPresetSelect) return; shapeToPresetSelect.innerHTML = '';
    shapes.forEach((shape, index) => {
        const option = document.createElement('option'); option.value = index; option.textContent = `Forma ${index + 1}`;
        shapeToPresetSelect.appendChild(option);
    });
    if (shapes.length > 0) shapeToPresetSelect.value = "0";
}

function initPresetManager() {
    loadPresetsFromStorage(); populateShapeToPresetSelect();
    if (shapePresetButton) shapePresetButton.addEventListener('click', () => {
        if(shapePresetModal) shapePresetModal.style.display = 'flex';
        populateSavedPresetsSelect();
        if (savedPresetsSelect.value) presetNameInput.value = savedPresetsSelect.value;
    });
    if (closeShapePresetModalButton) closeShapePresetModalButton.addEventListener('click', () => { if(shapePresetModal) shapePresetModal.style.display = 'none'; });
    if (saveShapePresetButton) saveShapePresetButton.addEventListener('click', saveShapePreset);
    if (loadShapePresetButton) loadShapePresetButton.addEventListener('click', loadShapePreset);
    if (deleteSelectedPresetButton) deleteSelectedPresetButton.addEventListener('click', deleteSelectedPreset);
    if (exportAllPresetsButton) exportAllPresetsButton.addEventListener('click', exportAllPresets);
    if (importAllPresetsButton) importAllPresetsButton.addEventListener('click', importAllPresets);
    if (importPresetFileInput) importPresetFileInput.addEventListener('change', handleImportPresetFile);
    if (savedPresetsSelect) savedPresetsSelect.addEventListener('change', () => { if (savedPresetsSelect.value) presetNameInput.value = savedPresetsSelect.value; });
}
// === END PRESET MANAGER ===


// === THEME MANAGER ===
function applyTheme(theme) {
    document.body.classList.remove('theme-dark', 'theme-light'); document.body.classList.add(theme);
    currentTheme = theme;
    if (themeToggleButton) themeToggleButton.textContent = theme === 'theme-dark' ? '🌙' : '☀️';
}

function toggleTheme() {
    if (spectatorModeActive) return;
    const newTheme = currentTheme === 'theme-dark' ? 'theme-light' : 'theme-dark';
    applyTheme(newTheme); localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    logOSC("SYSTEM", "Tema Alterado", [newTheme]);
}

function loadTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    applyTheme((savedTheme && (savedTheme === 'theme-dark' || savedTheme === 'theme-light')) ? savedTheme : 'theme-dark');
}
// === END THEME MANAGER ===


// === GESTURE SIMULATOR ===
function generateMockLandmarks(hand = "Right", shapeCenterX, shapeCenterY) {
    const landmarks = []; const time = performance.now() / 1000;
    const wristX = (canvasElement.width - shapeCenterX) / canvasElement.width + Math.sin(time * 0.5 + (hand === "Left" ? Math.PI : 0)) * 0.05;
    const wristY = shapeCenterY / canvasElement.height + Math.cos(time * 0.5 + (hand === "Left" ? Math.PI : 0)) * 0.05;
    landmarks.push({ x: wristX, y: wristY, z: 0 });
    const fingerBaseRadius = 0.08; const fingerTipRadiusVariance = 0.02;
    const thumbAngle = Math.PI * 1.5 + Math.sin(time * 1.2 + (hand === "Left" ? 0.5 : 0)) * 0.3;
    landmarks[4] = { x: wristX + (fingerBaseRadius + Math.cos(time*1.5)*fingerTipRadiusVariance) * Math.cos(thumbAngle), y: wristY + (fingerBaseRadius + Math.cos(time*1.5)*fingerTipRadiusVariance) * Math.sin(thumbAngle) * (canvasElement.width/canvasElement.height), z: 0.01 };
    const indexAngle = Math.PI * 1.8 + Math.cos(time * 1.0 + (hand === "Left" ? 0.7 : 0.2)) * 0.4;
    landmarks[8] = { x: wristX + (fingerBaseRadius + 0.02 + Math.sin(time*1.7)*fingerTipRadiusVariance) * Math.cos(indexAngle), y: wristY + (fingerBaseRadius + 0.02 + Math.sin(time*1.7)*fingerTipRadiusVariance) * Math.sin(indexAngle) * (canvasElement.width/canvasElement.height), z: 0.02 };
    landmarks[12] = { x: wristX + fingerBaseRadius * 0.9, y: wristY - fingerBaseRadius * 0.5, z: 0.03 };
    landmarks[16] = { x: wristX + fingerBaseRadius * 0.8, y: wristY - fingerBaseRadius * 0.6, z: 0.02 };
    landmarks[20] = { x: wristX + fingerBaseRadius * 0.7, y: wristY - fingerBaseRadius * 0.7, z: 0.01 };
    for (let i = 0; i < 21; i++) {
        if (!landmarks[i]) {
            if (i > 0 && landmarks[i-1]) landmarks[i] = { ...landmarks[i-1], z: landmarks[i-1].z + 0.005 };
            else if (landmarks[0]) landmarks[i] = { ...landmarks[0], z: landmarks[0].z + i * 0.005 };
            else landmarks[i] = {x: 0.5, y: 0.5, z: 0.05};
        }
    }
    return landmarks;
}

function runGestureSimulation() {
    if (!gestureSimulationActive) return;
    const results = { multiHandLandmarks: [], multiHandedness: [] };
    if (operationMode === 'one_person' || operationMode === 'two_persons') {
        results.multiHandLandmarks.push(generateMockLandmarks("Right", shapes[0].centerX, shapes[0].centerY));
        results.multiHandedness.push({ score: 0.9, index: 0, label: "Right" });
        if (operationMode === 'one_person') {
             results.multiHandLandmarks.push(generateMockLandmarks("Left", shapes[0].centerX - 150, shapes[0].centerY));
             results.multiHandedness.push({ score: 0.9, index: 1, label: "Left" });
        } else if (operationMode === 'two_persons' && shapes.length > 1) {
            results.multiHandLandmarks.push(generateMockLandmarks("Left", shapes[1].centerX, shapes[1].centerY));
            results.multiHandedness.push({ score: 0.9, index: 1, label: "Left" });
        }
    }
    onResults(results);
}

function toggleGestureSimulation() {
    if (spectatorModeActive) { displayGlobalError("Simulação não disponível em modo espectador.", 3000); return; }
    gestureSimulationActive = !gestureSimulationActive;
    if (gestureSimToggleButton) {
        gestureSimToggleButton.textContent = gestureSimulationActive ? "🤖 Sim ON" : "🤖 Sim OFF";
        gestureSimToggleButton.classList.toggle('active', gestureSimulationActive);
    }
    if (gestureSimulationActive) {
        if (cameraError) console.log("Simulação ATIVADA (câmera com erro).");
        else console.log("Simulação ATIVADA. Dados da câmera real ignorados.");
        if (gestureSimIntervalId) clearInterval(gestureSimIntervalId);
        gestureSimIntervalId = setInterval(runGestureSimulation, GESTURE_SIM_INTERVAL);
    } else {
        console.log("Simulação DESATIVADA.");
        if (gestureSimIntervalId) { clearInterval(gestureSimIntervalId); gestureSimIntervalId = null; }
        shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; s.activeGesture = null; });
    }
    updateHUD(); logOSC("SYSTEM", "Simulação de Gestos", [gestureSimulationActive ? "ON" : "OFF"]);
}
// === END GESTURE SIMULATOR ===


// === UI SETUP & EVENT LISTENERS ===
function setupEventListeners() {
    // Modals
    // const infoButton = document.getElementById('info'); // Esta linha será corrigida/removida
    const closeModalButton = document.getElementById('closeModal');
    const infoModal = document.getElementById('infoModal');
    // Sidebar interaction (v41 update)
    if (sidebar && sidebarHandle) {
        sidebarHandle.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent click from immediately closing sidebar via document listener
            const isOpen = sidebar.classList.toggle('open');
            sidebarHandle.textContent = isOpen ? '←' : '☰';
            // CSS variables for HUD adjustment (if still needed, or remove if HUD adjusts via other means)
            // document.documentElement.style.setProperty('--sidebar-width', isOpen ? '250px' : '0px'); // Or the actual width
            // document.documentElement.style.setProperty('--sidebar-open-factor', isOpen ? '1' : '0');
        });

        // (Opcional) Fechar ao clicar fora
        // This listener is on the document to catch clicks anywhere.
        document.addEventListener('click', (event) => {
            // Check if the sidebar is open, the click was outside the sidebar, AND outside the handle
            if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && event.target !== sidebarHandle) {
                sidebar.classList.remove('open');
                sidebarHandle.textContent = '☰';
                // document.documentElement.style.setProperty('--sidebar-open-factor', '0');
            }
        });

        // Prevent clicks inside the sidebar from closing it (if the document listener is too broad)
        sidebar.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    }

    // Modals - Button IDs in the sidebar now directly trigger modals
    const infoButtonElement = document.getElementById('info'); // Renomeado para evitar conflito e usado abaixo
    // const closeModalButton = document.getElementById('closeModal'); // Já declarado acima
    // const infoModal = document.getElementById('infoModal'); // Já declarado acima
    if (infoButtonElement && infoModal) infoButtonElement.addEventListener('click', () => { infoModal.style.display = 'flex'; });
    if (closeModalButton && infoModal) closeModalButton.addEventListener('click', () => { infoModal.style.display = 'none'; });

    // Settings Modal (MIDI, Camera)
    // settingsButton is already declared and its ID is 'settingsButton' in the sidebar
    if (settingsButton && settingsModal) settingsButton.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
    if (closeSettingsModalButton && settingsModal) closeSettingsModalButton.addEventListener('click', () => { settingsModal.style.display = 'none'; });

    // OSC Config Modal
    // oscConfigButton is already declared, ID 'oscConfigButton' in sidebar
    if (oscConfigButton && oscConfigModal) {
        oscConfigButton.addEventListener('click', () => {
            oscHostInput.value = OSC_HOST; // Populate with current values
            oscPortInput.value = OSC_PORT;
            oscConfigModal.style.display = 'flex';
        });
    }
    // closeOscConfigModalButton is for the X button inside the modal
    if (closeOscConfigModalButton && oscConfigModal) closeOscConfigModalButton.addEventListener('click', () => { oscConfigModal.style.display = 'none'; });
    // saveOscConfigButton is inside the modal
    if (saveOscConfigButton && oscConfigModal) saveOscConfigButton.addEventListener('click', () => {
        const newHost = oscHostInput.value.trim();
        const newPort = parseInt(oscPortInput.value, 10);

        if (!newHost) {
            alert("O IP do Servidor OSC não pode estar vazio.");
            oscHostInput.focus();
            return;
        }
        if (isNaN(newPort) || newPort < 1 || newPort > 65535) {
            alert("A Porta do Servidor OSC deve ser um número entre 1 e 65535.");
            oscPortInput.focus();
            return;
        }

        if (saveOscSettings(newHost, newPort)) {
            logOSC("SYSTEM", "Configurações OSC salvas", { host: newHost, port: newPort });
            displayGlobalError(`Config OSC salva: ${newHost}:${newPort}. Reconectando...`, 3000);
            if (oscConfigModal) oscConfigModal.style.display = 'none';
            // Reconnect OSC with new settings
            setupOSC(); // This will close existing and open new with global OSC_HOST, OSC_PORT
        }
    });


    if (arpeggioSettingsButton) arpeggioSettingsButton.addEventListener('click', () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = 'flex'});
    if (closeArpeggioSettingsModalButton) closeArpeggioSettingsModalButton.addEventListener('click', () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = 'none'});
    if (oscPanelButton) oscPanelButton.addEventListener('click', () => {if(oscControlModal) oscControlModal.style.display = 'flex'});
    if (closeOscControlModalButton) closeOscControlModalButton.addEventListener('click', () => {if(oscControlModal) oscControlModal.style.display = 'none'});
    window.addEventListener('click', (event) => { if (event.target.classList.contains('modal-overlay')) event.target.style.display = 'none'; });

    // MIDI Device Selects
    if (midiOutputSelect) midiOutputSelect.addEventListener('change', () => { midiOutput = availableMidiOutputs.get(midiOutputSelect.value) || null; turnOffAllActiveNotes(); saveAllPersistentSettings(); });
    if (midiInputSelect) midiInputSelect.addEventListener('change', () => { setMidiInput(availableMidiInputs.get(midiInputSelect.value) || null); saveAllPersistentSettings(); });

    // Arpeggio Controls
    if (arpeggioStyleSelect) arpeggioStyleSelect.addEventListener('change', (e) => { if (spectatorModeActive) return; currentArpeggioStyle = e.target.value; saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioStyle', currentArpeggioStyle);});
    if (arpeggioBPMSlider) arpeggioBPMSlider.addEventListener('input', (e) => { if (spectatorModeActive || externalBPM !== null) return; arpeggioBPM = parseInt(e.target.value); arpeggioBPMValueSpan.textContent = arpeggioBPM; noteInterval = 60000 / arpeggioBPM; if(noteIntervalSlider) noteIntervalSlider.value = noteInterval; if(noteIntervalValueSpan) noteIntervalValueSpan.textContent = Math.round(noteInterval); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', arpeggioBPM); });
    if (noteIntervalSlider) noteIntervalSlider.addEventListener('input', (e) => { if (spectatorModeActive || externalBPM !== null) return; noteInterval = parseInt(e.target.value); noteIntervalValueSpan.textContent = noteInterval; arpeggioBPM = 60000 / noteInterval; if(arpeggioBPMSlider) arpeggioBPMSlider.value = arpeggioBPM; if(arpeggioBPMValueSpan) arpeggioBPMValueSpan.textContent = Math.round(arpeggioBPM); saveArpeggioSettings(); updateHUD(); sendOSCMessage('/global/state/arpeggioBPM', Math.round(arpeggioBPM)); });

    // OSC Panel
    if (sendTestOSCButton) sendTestOSCButton.addEventListener('click', () => {
        if (spectatorModeActive) return;
        const address = oscAddressInput.value.trim(); const argsStr = oscArgsInput.value.trim();
        if (!address.startsWith('/')) { alert("Endereço OSC deve começar com '/'."); return; }
        let args = [];
        if (argsStr) {
            try {
                if (argsStr.startsWith('[') && argsStr.endsWith(']')) args = JSON.parse(argsStr);
                else args = argsStr.split(/\s+/).map(arg => (!isNaN(parseFloat(arg)) && isFinite(arg)) ? parseFloat(arg) : arg);
                if (!Array.isArray(args)) args = [args];
            } catch (e) { alert(`Erro nos argumentos: ${e.message}`); return; }
        }
        sendOSCMessage(address, ...args); logOSC("PANEL", address, args); oscArgsInput.value = ''; // Changed from OUT (Panel) to PANEL for consistency
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
    if (themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
    if (gestureSimToggleButton) gestureSimToggleButton.addEventListener('click', toggleGestureSimulation);
    if (reconnectOSCButton) reconnectOSCButton.addEventListener('click', () => {
        logOSC("SYSTEM", "Tentando reconectar OSC manualmente...", []);
        if (reconnectOSCButton) reconnectOSCButton.disabled = true; // Disable button during attempt
        setupOSC(); // Attempt to connect
        setTimeout(() => {
            if (osc && osc.status() !== OSC.STATUS.IS_OPEN && reconnectOSCButton) {
                reconnectOSCButton.disabled = false;
            }
        }, OSC_RECONNECT_TIMEOUT + 500);
    });

    // Camera Select Event Listener (v36)
    if (cameraSelectElement) {
        cameraSelectElement.addEventListener('change', (event) => {
            const newDeviceId = event.target.value;
            if (newDeviceId === currentCameraDeviceId && mediaStream) return; // No change or already active

            console.log(`Usuário selecionou câmera: ${newDeviceId || 'Padrão'}`);
            initializeCamera(newDeviceId || null).then(() => { // Pass null for "Browser Default"
                // Optional: update HUD or send OSC message about camera change
                updateHUD(); // Update HUD to reflect new camera if needed
                // sendOSCMessage('/global/state/cameraChanged', newDeviceId || 'default');
            }).catch(err => {
                console.error("Erro ao trocar de câmera:", err);
                // Revert selection if initialization fails? Or leave it to show the error?
                // For now, cameraError should be true and fallback animation will show.
            });
        });
    }

    document.addEventListener('keydown', handleKeyPress); // Keyboard Shortcuts
}

function updateHUD() {
  if (!hudElement) return;
  let txt = "";
  if (spectatorModeActive) txt += `<b>👓 MODO ESPECTADOR</b><br>`;
  const midiStatusIcon = midiAccess && midiOutput ? '🟢' : '🔴';
  txt += `MIDI: ${midiStatusIcon} <span class="${midiAccess && midiOutput ? 'status-ok':'status-error'}">${midiEnabled && midiOutput ? (midiOutput.name || 'ON') : 'OFF'}</span> | `;
  const oscConnected = osc && osc.status() === OSC.STATUS.IS_OPEN;
  const oscStatusIcon = oscConnected ? '🟢' : (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? '🟠' : '🔴'); // Orange for error states
  txt += `OSC: ${oscStatusIcon} <span class="${oscConnected ? 'status-ok': (oscStatus.includes("Erro") || oscStatus.includes("Falha") ? 'status-warn' : 'status-error')}">${oscStatus}</span><br>`;
  shapes.forEach(s => {
    txt += `<b>F${s.id+1}:</b> R:${s.radius.toFixed(0)} L:${s.sides===100?"○":s.sides} Gest:${spectatorModeActive?"-":(s.activeGesture||"Nenhum")}<br>`;
  });
  txt += `<b>Global:</b> Pulso:${pulseModeActive?'ON':'OFF'} Artic:${staccatoModeActive?'Stac':'Leg'} VtxPull:${vertexPullModeActive?'ON':'OFF'}<br>`;
  txt += `&nbsp;&nbsp;Escala:${SCALES[currentScaleName].name} Nota:${currentNoteMode} Acorde:${chordMode} Oper:${operationMode==='one_person'?'1P':'2P'}<br>`;
  if (currentNoteMode === 'ARPEGGIO') txt += `&nbsp;&nbsp;Arp: ${currentArpeggioStyle} BPM:${arpeggioBPM.toFixed(0)}${externalBPM!==null?'(Ext)':''} Idx:${shapes.map(s=>s.currentEdgeIndex).join('/')}<br>`;
  txt += `&nbsp;&nbsp;DMX Sync:${dmxSyncModeActive?'<span class="status-ok">ON</span>':'OFF'} | MIDI In:${midiFeedbackEnabled?'<span class="status-ok">ON</span>':'OFF'} | Sim:${gestureSimulationActive?'<span class="status-warn">ON</span>':'OFF'}<br>`;
  if (isRecordingOSC) txt += `&nbsp;&nbsp;<span class="status-error">🔴 Gravando OSC</span> (${recordedOSCSequence.length})<br>`;
  if (isPlayingOSCLoop) {
    const loopProgress = ((performance.now() - playbackStartTime) % oscLoopDuration) / oscLoopDuration;
    const progressBar = ' ['.padEnd(Math.floor(loopProgress * 10) + 2, '■').padEnd(12, '□') + ']';
    txt += `&nbsp;&nbsp;<span class="status-warn">▶️ Loop OSC Ativo${progressBar}</span> (${(oscLoopDuration/1000).toFixed(1)}s)<br>`;
  } else if (recordedOSCSequence.length > 0) txt += `&nbsp;&nbsp;Loop OSC Pronto (${recordedOSCSequence.length} msgs, ${(oscLoopDuration/1000).toFixed(1)}s)<br>`;

  if (cameraError) {
    txt += `<span class="status-error">⚠️ Falha na Câmera. Verifique permissões ou selecione outra.</span><br>`;
  }

  let textSpan = hudElement.querySelector('span#hudTextContent');
  if (!textSpan) {
      textSpan = document.createElement('span'); textSpan.id = 'hudTextContent';
      hudElement.prepend(textSpan);
  }
  textSpan.innerHTML = txt;
  if (reconnectOSCButton && reconnectOSCButton.style.display === 'inline-block' && !hudElement.contains(reconnectOSCButton)) {
      hudElement.appendChild(reconnectOSCButton);
  }

  // Send periodic OSC data
  const now = performance.now();
  if (!spectatorModeActive && osc && osc.status() === OSC.STATUS.IS_OPEN && (now - lastOscSendTime > OSC_SEND_INTERVAL)) {
    lastOscSendTime = now;
    shapes.forEach(s => {
      const sid = s.id + 1;
      sendOSCMessage(`/forma/${sid}/radius`, parseFloat(s.radius.toFixed(2)));
      sendOSCMessage(`/forma/${sid}/sides`, s.sides);
      sendOSCMessage(`/forma/${sid}/pos`, parseFloat((s.centerX/canvasElement.width).toFixed(3)), parseFloat((s.centerY/canvasElement.height).toFixed(3)));
      sendOSCMessage(`/forma/${sid}/distortion`, parseFloat((Math.abs(s.currentPitchBend-8192)/8191).toFixed(3)));
      sendOSCMessage(`/forma/${sid}/pitchbend`, s.currentPitchBend);
      sendOSCMessage(`/forma/${sid}/cc91`, s.reverbAmount); sendOSCMessage(`/forma/${sid}/cc94`, s.delayAmount);
      sendOSCMessage(`/forma/${sid}/cc10`, s.panValue); sendOSCMessage(`/forma/${sid}/cc74`, s.brightnessValue);
      sendOSCMessage(`/forma/${sid}/cc1`, s.modWheelValue); sendOSCMessage(`/forma/${sid}/cc71`, s.resonanceValue);
    });
  }
}

function setScale(newScaleName, updateButtonText = true) {
    if (spectatorModeActive) return;
    if (SCALES[newScaleName]) {
        currentScaleName = newScaleName; currentScaleIndex = scaleKeys.indexOf(newScaleName);
        turnOffAllActiveNotes(); sendOSCMessage('/global/state/scale', currentScaleName);
        if (updateButtonText && scaleCycleButton) {
             const displayName = SCALES[currentScaleName]?.name || currentScaleName;
            scaleCycleButton.textContent = `🧬 Escala: ${displayName.toUpperCase()}`;
        }
        updateHUD(); saveAllPersistentSettings(); console.log(`Escala alterada para: ${currentScaleName}`);
    } else console.warn(`Tentativa de definir escala desconhecida: ${newScaleName}`);
}

function cycleScale() {
    if (spectatorModeActive) return;
    currentScaleIndex = (currentScaleIndex + 1) % scaleKeys.length;
    setScale(scaleKeys[currentScaleIndex]);
}

// Toggle functions for buttons
function toggleMidiEnabled() { /* ... */ } function toggleOperationMode() { /* ... */ }
function toggleDMXSync() { /* ... */ } function toggleMidiFeedback() { /* ... */ }
function toggleOSCRecording() { /* ... */ } function playRecordedOSCLoop() { /* ... */ }
function toggleSpectatorMode() { /* ... */ } function openPopup() { /* ... */ }
// (Implementations for toggle functions are lengthy and mostly unchanged, assumed to be here)
// For brevity, only showing a few stubs. The full code exists above this section.
function toggleMidiEnabled() {
    if (spectatorModeActive) return; midiEnabled = !midiEnabled;
    midiToggleButton.textContent = midiEnabled ? "🎹 MIDI ON" : "🎹 MIDI OFF";
    midiToggleButton.classList.toggle('active', midiEnabled);
    if (!midiEnabled) turnOffAllActiveNotes();
    sendOSCMessage('/global/state/midiEnabled', midiEnabled ? 1 : 0);
    updateHUD(); saveAllPersistentSettings();
}
function toggleOperationMode() {
    if (spectatorModeActive) return;
    operationMode = (operationMode === 'one_person') ? 'two_persons' : 'one_person';
    operationModeButton.textContent = `👤 Modo: ${operationMode === 'one_person' ? '1 Pessoa' : '2 Pessoas'}`;
    shapes.forEach(s => { s.leftHandLandmarks = null; s.rightHandLandmarks = null; s.activeGesture = null; s.lastSentActiveGesture = null; });
    turnOffAllActiveNotes(); updateHUD(); saveAllPersistentSettings();
}
function toggleDMXSync() {
    if (spectatorModeActive) return; dmxSyncModeActive = !dmxSyncModeActive;
    syncDMXNotesButton.textContent = `🎶 Sync DMX ${dmxSyncModeActive ? 'ON' : 'OFF'}`;
    syncDMXNotesButton.classList.toggle('active', dmxSyncModeActive);
    sendOSCMessage('/global/state/dmxSyncMode', dmxSyncModeActive ? 1 : 0);
    updateHUD(); saveAllPersistentSettings();
}
function toggleMidiFeedback() {
    if (spectatorModeActive) return; midiFeedbackEnabled = !midiFeedbackEnabled;
    midiFeedbackToggleButton.textContent = `🎤 MIDI In ${midiFeedbackEnabled ? 'ON' : 'OFF'}`;
    midiFeedbackToggleButton.classList.toggle('active', midiFeedbackEnabled);
    sendOSCMessage('/global/state/midiFeedbackEnabled', midiFeedbackEnabled ? 1 : 0);
    updateHUD(); saveAllPersistentSettings();
}
function toggleOSCRecording() {
    if (spectatorModeActive) return; isRecordingOSC = !isRecordingOSC;
    if (recordOSCButton) recordOSCButton.classList.toggle('active', isRecordingOSC);
    if (isRecordingOSC) {
        recordedOSCSequence = []; recordingStartTime = performance.now();
        if (recordOSCButton) recordOSCButton.textContent = "🔴 Gravando";
        if (playOSCLoopButton) playOSCLoopButton.disabled = true;
    } else {
        if (recordOSCButton) recordOSCButton.textContent = "⏺️ Gravar OSC";
        if (playOSCLoopButton) playOSCLoopButton.disabled = recordedOSCSequence.length === 0;
        if (recordedOSCSequence.length > 0) logOSC("REC INFO", `Gravadas ${recordedOSCSequence.length} msgs. Duração: ${(recordedOSCSequence[recordedOSCSequence.length-1].timestamp / 1000).toFixed(2)}s`, []);
    }
    updateHUD();
}
function playRecordedOSCLoop() {
    if (spectatorModeActive || recordedOSCSequence.length === 0 || isRecordingOSC) return;
    isPlayingOSCLoop = !isPlayingOSCLoop;
    if (playOSCLoopButton) playOSCLoopButton.classList.toggle('active', isPlayingOSCLoop);
    if (isPlayingOSCLoop) {
        if (playOSCLoopButton) playOSCLoopButton.textContent = "⏹️ Parar Loop";
        if (recordOSCButton) recordOSCButton.disabled = true;
        oscLoopDuration = parseInt(oscLoopDurationInput.value) || 5000;
        playbackStartTime = performance.now(); let currentPlaybackIndex = 0;
        function loopStep() {
            if (!isPlayingOSCLoop) return;
            const elapsedTimeInLoop = (performance.now() - playbackStartTime) % oscLoopDuration;
            if (currentPlaybackIndex > 0 && elapsedTimeInLoop < recordedOSCSequence[Math.max(0,currentPlaybackIndex-1)].timestamp) currentPlaybackIndex = 0;
            while (currentPlaybackIndex < recordedOSCSequence.length && recordedOSCSequence[currentPlaybackIndex].timestamp <= elapsedTimeInLoop) {
                const item = recordedOSCSequence[currentPlaybackIndex];
                const tempIsRec = isRecordingOSC; isRecordingOSC = false;
                if (osc && osc.status() === OSC.STATUS.IS_OPEN) osc.send(new OSC.Message(item.message.address, ...item.message.args));
                isRecordingOSC = tempIsRec; logOSC("LOOP", item.message.address, item.message.args);
                currentPlaybackIndex++;
            }
            if (currentPlaybackIndex >= recordedOSCSequence.length && recordedOSCSequence.length > 0 && oscLoopDuration > recordedOSCSequence[recordedOSCSequence.length-1].timestamp) currentPlaybackIndex = 0;
            playbackLoopIntervalId = requestAnimationFrame(loopStep);
        }
        playbackLoopIntervalId = requestAnimationFrame(loopStep);
    } else {
        if (playbackLoopIntervalId) cancelAnimationFrame(playbackLoopIntervalId);
        if (playOSCLoopButton) playOSCLoopButton.textContent = "▶️ Loop OSC";
        if (recordOSCButton) recordOSCButton.disabled = false;
    }
    updateHUD();
}
function toggleSpectatorMode() {
    spectatorModeActive = !spectatorModeActive;
    spectatorModeButton.textContent = `👓 Espectador ${spectatorModeActive ? 'ON' : 'OFF'}`;
    spectatorModeButton.classList.toggle('active', spectatorModeActive);
    const controlElements = [midiToggleButton, operationModeButton, syncDMXNotesButton, midiFeedbackToggleButton, recordOSCButton, playOSCLoopButton, gestureSimToggleButton];
    if (spectatorModeActive) {
        turnOffAllActiveNotes(); if (isRecordingOSC) toggleOSCRecording(); if (isPlayingOSCLoop) playRecordedOSCLoop();
        controlElements.forEach(btn => { if(btn) btn.disabled = true; });
        if(arpeggioBPMSlider) arpeggioBPMSlider.disabled = true; if(noteIntervalSlider) noteIntervalSlider.disabled = true;
    } else {
        controlElements.forEach(btn => { if(btn && btn !== playOSCLoopButton && btn !== gestureSimToggleButton) btn.disabled = false; }); // playOSCLoopButton has its own logic
        if(playOSCLoopButton) playOSCLoopButton.disabled = recordedOSCSequence.length === 0;
        if(gestureSimToggleButton) gestureSimToggleButton.disabled = false;
        if(arpeggioBPMSlider && externalBPM === null) arpeggioBPMSlider.disabled = false;
        if(noteIntervalSlider && externalBPM === null) noteIntervalSlider.disabled = false;
    }
    updateHUD();
}
function openPopup() {
    if (outputPopupWindow && !outputPopupWindow.closed) outputPopupWindow.focus();
    else {
      outputPopupWindow = window.open('', 'OutputWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
      if (!outputPopupWindow || outputPopupWindow.closed || typeof outputPopupWindow.document === 'undefined') {
        alert("Falha ao abrir janela pop-up."); outputPopupWindow = null; popupCanvasCtx = null; return;
      }
      outputPopupWindow.document.write('<!DOCTYPE html><html><head><title>Visual Output</title><style>body{margin:0;overflow:hidden;background:#000;display:flex;justify-content:center;align-items:center}canvas{display:block;width:100%;height:100%}</style></head><body><canvas id="popupCanvas"></canvas></body></html>');
      outputPopupWindow.document.close();
      outputPopupWindow.onload = () => {
        const pc = outputPopupWindow.document.getElementById('popupCanvas');
        if (pc) { popupCanvasCtx = pc.getContext('2d'); pc.width = outputPopupWindow.innerWidth; pc.height = outputPopupWindow.innerHeight; }
        else { alert("Erro ao criar canvas no pop-up."); outputPopupWindow.close(); outputPopupWindow = null; popupCanvasCtx = null; }
      };
      outputPopupWindow.onbeforeunload = () => { popupCanvasCtx = null; outputPopupWindow = null; };
    }
}

function handleKeyPress(e) {
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');

    if (e.key === 'Escape') {
        if (isInputFocused) activeEl.blur();
        else if (anyModalOpen) [infoModal, settingsModal, arpeggioSettingsModal, oscControlModal, shapePresetModal, oscConfigModal].forEach(m => {if(m) m.style.display = 'none'});
        return;
    }
    if (isInputFocused || (spectatorModeActive && e.key !== 'Escape')) return;

    const actionMap = {
        'm': toggleMidiEnabled, 'l': () => { staccatoModeActive = !staccatoModeActive; sendOSCMessage('/global/state/staccatoMode', staccatoModeActive?1:0); updateHUD(); saveAllPersistentSettings();},
        'p': () => { if(!e.shiftKey) {pulseModeActive = !pulseModeActive; if(pulseModeActive)pulseTime=0; sendOSCMessage('/global/state/pulseMode', pulseModeActive?1:0); updateHUD(); saveAllPersistentSettings();}},
        's': () => { if(!e.shiftKey) cycleScale(); },
        'n': () => { currentNoteModeIndex=(currentNoteModeIndex+1)%NOTE_MODES.length; currentNoteMode=NOTE_MODES[currentNoteModeIndex]; turnOffAllActiveNotes(); sendOSCMessage('/global/noteModeChanged', currentNoteMode); updateHUD();},
        'v': () => { vertexPullModeActive=!vertexPullModeActive; if(!vertexPullModeActive)shapes.forEach(s=>{s.vertexOffsets={};s.beingPulledByFinger={};}); sendOSCMessage('/global/state/vertexPullMode',vertexPullModeActive?1:0); updateHUD();},
        'c': () => { if(!e.shiftKey) {chordMode=(chordMode==="TRIAD")?"VERTEX_ALL":"TRIAD"; sendOSCMessage('/global/state/chordMode',chordMode); updateHUD();}},
    };
    const correctedShiftActionMap = {
        'I': () => {if(infoModal) infoModal.style.display = infoModal.style.display === 'flex' ? 'none' : 'flex'},
        'C': () => {if(settingsModal) settingsModal.style.display = settingsModal.style.display === 'flex' ? 'none' : 'flex'}, // MIDI Config
        'K': () => {if(oscConfigModal) { // OSC Config (NEW SHIFT+K)
            oscHostInput.value = OSC_HOST; oscPortInput.value = OSC_PORT;
            oscConfigModal.style.display = oscConfigModal.style.display === 'flex' ? 'none' : 'flex';
        }},
        'A': () => {if(arpeggioSettingsModal) arpeggioSettingsModal.style.display = arpeggioSettingsModal.style.display === 'flex' ? 'none' : 'flex'},
        'O': () => {if(oscControlModal) oscControlModal.style.display = oscControlModal.style.display === 'flex' ? 'none' : 'flex'},
        'D': toggleDMXSync, 'F': toggleMidiFeedback, 'R': toggleOSCRecording,
        'P': playRecordedOSCLoop,
        'S': toggleSpectatorMode, 'T': toggleTheme,
        'B': () => {if(shapePresetModal) shapePresetModal.style.display = shapePresetModal.style.display === 'flex' ? 'none' : 'flex'},
    };
    const key = e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase();
    const map = e.shiftKey ? correctedShiftActionMap : actionMap;
    if (map[key]) { e.preventDefault(); map[key](); }
}

// Persistent Settings (localStorage)
function savePersistentSetting(key, value) {
    try {
        const settings = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY)) || {};
        settings[key] = value; localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { console.warn("Erro salvar config persistente:", e); }
}
function loadPersistentSetting(key, defaultValue) {
    try {
        const settings = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY)) || {};
        return settings[key] !== undefined ? settings[key] : defaultValue;
    } catch (e) { console.warn("Erro carregar config persistente:", e); return defaultValue; }
}
function saveAllPersistentSettings() {
    savePersistentSetting('operationMode', operationMode); savePersistentSetting('midiEnabled', midiEnabled);
    savePersistentSetting('staccatoModeActive', staccatoModeActive); savePersistentSetting('pulseModeActive', pulseModeActive);
    savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null); savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);
    savePersistentSetting('midiFeedbackEnabled', midiFeedbackEnabled); savePersistentSetting('dmxSyncModeActive', dmxSyncModeActive);
    savePersistentSetting('oscLoopDuration', oscLoopDuration); savePersistentSetting('currentScaleName', currentScaleName);
    // OSC Host/Port are saved separately by saveOscSettings() using OSC_SETTINGS_KEY
    console.log("Configurações persistentes V35 salvas.");
}
function loadAllPersistentSettings() {
    operationMode = loadPersistentSetting('operationMode', 'two_persons'); midiEnabled = loadPersistentSetting('midiEnabled', true);
    staccatoModeActive = loadPersistentSetting('staccatoModeActive', false); pulseModeActive = loadPersistentSetting('pulseModeActive', false);
    currentScaleName = loadPersistentSetting('currentScaleName', 'PENTATONIC_MAJ');
    currentScaleIndex = scaleKeys.indexOf(currentScaleName);
    if (currentScaleIndex === -1) { currentScaleName = 'PENTATONIC_MAJ'; currentScaleIndex = 0; console.warn("Escala salva inválida, usando padrão.");}
    const savedMidiOutputId = loadPersistentSetting('midiOutputId', null); const savedMidiInputId = loadPersistentSetting('midiInputId', null);
    midiFeedbackEnabled = loadPersistentSetting('midiFeedbackEnabled', false); dmxSyncModeActive = loadPersistentSetting('dmxSyncModeActive', false);
    oscLoopDuration = loadPersistentSetting('oscLoopDuration', 5000);

    loadOscSettings(); // This will load OSC_HOST and OSC_PORT from localStorage or set defaults
    loadArpeggioSettings();
    console.log("Configurações persistentes V35 carregadas.");
    return { savedMidiOutputId, savedMidiInputId };
}

// Arpeggio specific settings
function saveArpeggioSettings() {
    const settings = { currentArpeggioStyle, arpeggioBPM, noteInterval, externalBPM };
    try { localStorage.setItem(ARPEGGIO_SETTINGS_KEY, JSON.stringify(settings)); }
    catch (e) { console.warn("Erro salvar config arpejo:", e); }
    savePersistentSetting('arpeggioSettingsLastUpdate', Date.now());
}
function loadArpeggioSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(ARPEGGIO_SETTINGS_KEY));
        if (saved) {
            currentArpeggioStyle = saved.currentArpeggioStyle || "UP"; arpeggioBPM = saved.arpeggioBPM || 120;
            noteInterval = saved.noteInterval || (60000 / arpeggioBPM);
        }
    } catch (e) { console.warn("Erro carregar config arpejo:", e); currentArpeggioStyle = "UP"; arpeggioBPM = 120; noteInterval = 500; }
    if (arpeggioStyleSelect) arpeggioStyleSelect.value = currentArpeggioStyle;
    if (arpeggioBPMSlider) arpeggioBPMSlider.value = arpeggioBPM;
    if (arpeggioBPMValueSpan) arpeggioBPMValueSpan.textContent = arpeggioBPM;
    if (noteIntervalSlider) noteIntervalSlider.value = noteInterval;
    if (noteIntervalValueSpan) noteIntervalValueSpan.textContent = noteInterval;
}
function populateArpeggioStyleSelect() {
    if (!arpeggioStyleSelect) return;
    arpeggioStyleSelect.innerHTML = ''; // Clear existing options before populating
    ARPEGGIO_STYLES.forEach(style => {
        const option = document.createElement('option'); option.value = style;
        option.textContent = style.charAt(0).toUpperCase() + style.slice(1).toLowerCase();
        arpeggioStyleSelect.appendChild(option);
    });
    arpeggioStyleSelect.value = currentArpeggioStyle;
}
// === END UI SETUP & EVENT LISTENERS ===


// === INITIALIZATION (DOMContentLoaded) ===
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Carregado. Iniciando main41.js..."); // Updated version in log
    detectPlatform(); // Call platform detection early
    hasWebGL2 = checkWebGL2Support();
    if (!hasWebGL2) displayGlobalError("Aviso: WebGL2 não está disponível.", 15000);

    // Initial canvas resize
    resizeCanvas();
    // Add resize listener for window changes
    window.addEventListener('resize', resizeCanvas);


    // Load OSC settings first as setupOSC depends on them
    loadOscSettings(); // This sets global OSC_HOST and OSC_PORT
                       // and updates input fields if they exist

    const { savedMidiOutputId, savedMidiInputId } = loadAllPersistentSettings(); // General app settings
    loadTheme();
    initPresetManager();
    setupEventListeners(); // Sets up all event listeners, including for OSC Config modal

    // Now setup OSC with the loaded/default host and port
    setupOSC();

    // Load saved camera device ID (v36)
    currentCameraDeviceId = localStorage.getItem(CAMERA_DEVICE_ID_KEY) || null;
    if (currentCameraDeviceId === "null" || currentCameraDeviceId === "undefined") currentCameraDeviceId = null; // Handle bad previous saves

    initMidi().then(async () => { // Make this async to await populateCameraSelect
        if (savedMidiOutputId && availableMidiOutputs.has(savedMidiOutputId)) {
            if(midiOutputSelect) midiOutputSelect.value = savedMidiOutputId;
            midiOutput = availableMidiOutputs.get(savedMidiOutputId);
        } else if (availableMidiOutputs.size > 0 && midiOutputSelect) {
            midiOutputSelect.selectedIndex = 0;
            midiOutput = availableMidiOutputs.get(midiOutputSelect.value);
        }
        if (savedMidiInputId && availableMidiInputs.has(savedMidiInputId)) {
            if(midiInputSelect) midiInputSelect.value = savedMidiInputId;
            setMidiInput(availableMidiInputs.get(savedMidiInputId));
        } else if (availableMidiInputs.size > 0 && midiInputSelect) {
             midiInputSelect.selectedIndex = 0;
             setMidiInput(availableMidiInputs.get(midiInputSelect.value));
        }
        savePersistentSetting('midiOutputId', midiOutput ? midiOutput.id : null);
        savePersistentSetting('midiInputId', midiInput ? midiInput.id : null);

        // Populate camera select AFTER MIDI is ready and saved device ID is known (v36)
        await populateCameraSelect();
        // Now initialize camera with the (potentially updated by populateCameraSelect) currentCameraDeviceId
        initializeCamera(currentCameraDeviceId);

    }).catch(err => { // Catch errors from initMidi or subsequent camera init
        console.error("Erro na cadeia de inicialização MIDI/Câmera:", err);
        // Fallback camera initialization if MIDI fails but we still want camera
        if (!mediaStream) { // Check if camera didn't start
            populateCameraSelect().then(() => initializeCamera(currentCameraDeviceId));
        }
    });

    populateArpeggioStyleSelect();
    if(oscLoopDurationInput) oscLoopDurationInput.value = oscLoopDuration;

    // Apply initial UI states from loaded variables
    if(midiToggleButton) { midiToggleButton.textContent = midiEnabled ? "🎹 MIDI ON" : "🎹 MIDI OFF"; midiToggleButton.classList.toggle('active', midiEnabled); }
    if(operationModeButton) operationModeButton.textContent = `👤 Modo: ${operationMode === 'one_person' ? '1 Pessoa' : '2 Pessoas'}`;
    if(scaleCycleButton && SCALES[currentScaleName]) { const dName = SCALES[currentScaleName]?.name || currentScaleName; scaleCycleButton.textContent = `🧬 Escala: ${dName.toUpperCase()}`; }
    if(syncDMXNotesButton) { syncDMXNotesButton.textContent = `🎶 Sync DMX ${dmxSyncModeActive ? 'ON' : 'OFF'}`; syncDMXNotesButton.classList.toggle('active', dmxSyncModeActive); }
    if(midiFeedbackToggleButton) { midiFeedbackToggleButton.textContent = `🎤 MIDI In ${midiFeedbackEnabled ? 'ON' : 'OFF'}`; midiFeedbackToggleButton.classList.toggle('active', midiFeedbackEnabled); }
    if(spectatorModeButton) {
        spectatorModeButton.textContent = `👓 Espectador OFF`; spectatorModeButton.classList.remove('active');
        const controlElements = [midiToggleButton, operationModeButton, syncDMXNotesButton, midiFeedbackToggleButton, recordOSCButton, playOSCLoopButton, gestureSimToggleButton, themeToggleButton, shapePresetButton /*...outros que devem ser desabilitados no modo espectador*/];
        controlElements.forEach(btn => { if(btn) btn.disabled = false; }); // Enable all by default
        if(playOSCLoopButton) playOSCLoopButton.disabled = recordedOSCSequence.length === 0;
        if(arpeggioBPMSlider && externalBPM === null && arpeggioBPMSlider) arpeggioBPMSlider.disabled = false;
        if(noteIntervalSlider && externalBPM === null && noteIntervalSlider) noteIntervalSlider.disabled = false;
    }
    if(gestureSimToggleButton) { gestureSimToggleButton.textContent = "🤖 Sim OFF"; gestureSimToggleButton.classList.remove('active'); gestureSimToggleButton.disabled = spectatorModeActive; }
    if(recordOSCButton) { recordOSCButton.textContent = "⏺️ Gravar OSC"; recordOSCButton.classList.remove('active'); recordOSCButton.disabled = spectatorModeActive; }
    if(playOSCLoopButton) { playOSCLoopButton.textContent = "▶️ Loop OSC"; playOSCLoopButton.classList.remove('active'); playOSCLoopButton.disabled = spectatorModeActive || recordedOSCSequence.length === 0; }

    updateHUD();
    sendAllGlobalStatesOSC();

    if (oscLogTextarea) oscLogTextarea.value = `Log OSC - ${new Date().toLocaleTimeString()} - Configurações Carregadas.\n`;
    console.log("main41.js inicialização completa."); // Updated version in log
});
// === END INITIALIZATION ===
