const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const ctx = canvasElement.getContext('2d');

// OSC Configuration
let oscServerIp = '127.0.0.1';
let oscServerPort = 9000;
let oscSendInterval = 100; // ms
let lastOscSendTime = 0;

// Function to update OSC config from modal inputs
function updateOscConfig() {
    const ipInput = document.getElementById('oscServerIp');
    const portInput = document.getElementById('oscServerPort');
    const intervalInput = document.getElementById('oscSendInterval');

    if (ipInput) oscServerIp = ipInput.value;
    if (portInput) oscServerPort = parseInt(portInput.value, 10);
    if (intervalInput) oscSendInterval = parseInt(intervalInput.value, 10);

    console.log(`OSC Config Updated: IP=${oscServerIp}, Port=${oscServerPort}, Interval=${oscSendInterval}ms`);
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
        this.activeMidiNotes = {};
        this.midiChannel = midiChannel;
        this.leftHandLandmarks = null;
        this.rightHandLandmarks = null;
        this.pinchDistance = 0;
        this.lastSideChangeTime = 0;
        this.isThumbResizingActive = false;

        // New properties for v21
        this.leftHandOpen = null; // true for open, false for closed, null if not detected reliably
        this.rightHandOpen = null; // true for open, false for closed, null if not detected reliably
        this.lastLeftHandOpen = null;
        this.lastRightHandOpen = null;

        this.hangLooseActive = false;
        this.hangLooseIntensity = 0; // 0 to 1
        this.vortexIntensity = 0; // Controlled by hangLooseIntensity

        this.currentPitchBend = 8192; // Neutral pitch bend
        this.lastLiquifyDisplacement = 0; // For pitch bend from liquify

        // OSC relevant states
        this.oscData = {
            sides: this.sides,
            radius: this.radius,
            vortexIntensity: this.vortexIntensity,
            posX: this.centerX,
            posY: this.centerY,
            pitchBend: this.currentPitchBend,
            leftHandOpen: 0, // 0 for closed/undetected, 1 for open
            rightHandOpen: 0 // 0 for closed/undetected, 1 for open
        };
    }

    // Method to update OSC data bundle for this shape
    updateOscData() {
        this.oscData.sides = this.sides === 100 ? 0 : this.sides; // Represent circle as 0 sides for OSC, or keep 100
        this.oscData.radius = Math.round(this.radius);
        this.oscData.vortexIntensity = parseFloat(this.vortexIntensity.toFixed(3));
        this.oscData.posX = Math.round(this.centerX);
        this.oscData.posY = Math.round(this.centerY);
        this.oscData.pitchBend = this.currentPitchBend;
        this.oscData.leftHandOpen = this.leftHandOpen === true ? 1 : 0;
        this.oscData.rightHandOpen = this.rightHandOpen === true ? 1 : 0;
    }
}

const shapes = [new Shape(0, 0), new Shape(1, 1)];

let scaleX = 1;
let scaleY = 1;
const SIDE_CHANGE_DEBOUNCE_MS = 200;
let pulseModeActive = false;
let pulseTime = 0;
let pulseFrequency = 0.5;
// let lastPulseValue = 0; // This was global, but currentPulseValue is calculated locally in onResults

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

const midiToggleButton = document.getElementById('midiToggleButton');
const settingsButton = document.getElementById('settingsButton');
const hudElement = document.getElementById('hud');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalButton = document.getElementById('closeSettingsModal');
const midiOutputSelect = document.getElementById('midiOutputSelect');
const openOutputPopupButton = document.getElementById('openOutputPopupButton');
let outputPopupWindow = null;
let popupCanvasCtx = null;

// OSC related DOM elements from settings modal
const oscIpInput = document.getElementById('oscServerIp');
const oscPortInput = document.getElementById('oscServerPort');
const oscIntervalInput = document.getElementById('oscSendInterval');

if (oscIpInput) oscIpInput.addEventListener('change', updateOscConfig);
if (oscPortInput) oscPortInput.addEventListener('change', updateOscConfig);
if (oscIntervalInput) oscIntervalInput.addEventListener('change', updateOscConfig);


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
    if (!midiOutputSelect) return; // Guard against missing element
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

if (midiOutputSelect) {
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
}


function sendMidiNoteOn(note, velocity, channel) {
    if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
        const currentChannel = Math.max(0, Math.min(15, channel));
        const validNote = Math.max(0, Math.min(127, Math.round(note)));
        const validVelocity = Math.max(0, Math.min(127, Math.round(velocity)));
        const noteOnMessage = [0x90 + currentChannel, validNote, validVelocity];
        midiOutput.send(noteOnMessage);
        // console.log(`MIDI ON: Ch ${currentChannel}, Note ${validNote}, Vel ${validVelocity}`);
    }
}

function sendMidiNoteOff(note, channel) {
    if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
        const currentChannel = Math.max(0, Math.min(15, channel));
        const validNote = Math.max(0, Math.min(127, Math.round(note)));
        const noteOffMessage = [0x80 + currentChannel, validNote, 0];
        midiOutput.send(noteOffMessage);
        // console.log(`MIDI OFF: Ch ${currentChannel}, Note ${validNote}`);
    }
}

function sendPitchBend(bendValue, channel) { // bendValue 0-16383, 8192 is center
    if (midiOutput && typeof midiOutput.send === 'function' && midiEnabled) {
        const currentChannel = Math.max(0, Math.min(15, channel));
        const validBendValue = Math.max(0, Math.min(16383, Math.round(bendValue)));
        const lsb = validBendValue & 0x7F;
        const msb = (validBendValue >> 7) & 0x7F;
        const pitchBendMessage = [0xE0 + currentChannel, lsb, msb];
        midiOutput.send(pitchBendMessage);
        // console.log(`Pitch Bend: Ch ${currentChannel}, Val ${validBendValue}`);
    }
}

initMidi();
updateOscConfig(); // Initialize OSC config with default values from HTML or JS

const PENTATONIC_SCALE_C_MAJOR = [60, 62, 64, 67, 69]; // C4, D4, E4, G4, A4
function getPentatonicNote(index, baseOctaveOffset = 0) {
    const scaleLength = PENTATONIC_SCALE_C_MAJOR.length;
    const octave = baseOctaveOffset + Math.floor(index / scaleLength);
    const noteInScale = PENTATONIC_SCALE_C_MAJOR[index % scaleLength];
    return noteInScale + (octave * 12);
}

// Centralized note for hand open/close trigger
const TRIGGER_NOTE_OPEN = 72; // C5
const TRIGGER_NOTE_CLOSE = 71; // B4

function turnOffAllActiveNotes() {
    if (midiOutput) {
        const originalMidiEnabledState = midiEnabled;
        midiEnabled = true;
        shapes.forEach(shape => {
            Object.keys(shape.activeMidiNotes).forEach(edgeIdx => {
                const noteInfo = shape.activeMidiNotes[edgeIdx];
                if (noteInfo.playing) {
                    sendMidiNoteOff(noteInfo.note, shape.midiChannel);
                }
            });
            shape.activeMidiNotes = {};
            // Also send neutral pitch bend for all channels used by shapes
            sendPitchBend(8192, shape.midiChannel);
            shape.currentPitchBend = 8192;

        });
        midiEnabled = originalMidiEnabledState;
    }
}


async function initializeCamera() {
    console.log("Attempting to initialize camera");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach(track => track.stop()); // Stop the initial stream
        console.log("getUserMedia successful, proceeding with MediaPipe Camera");
        const camera = new Camera(videoElement, {
            onFrame: async () => {
                await hands.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });
        camera.start();
        console.log("camera.start() called");
    } catch (error) {
        console.error("Failed to access webcam:", error);
        displayGlobalError("Falha ao acessar a webcam. <br>É necessário permitir o acesso à câmera para manipular a forma.<br><br>Erro: " + error.message);
    }
}
initializeCamera();

document.addEventListener('keydown', (e) => {
    if (e.key === '+') {
        shapes[0].radius = Math.min(shapes[0].radius + 10, 300);
        updateHUD();
    }
    if (e.key === '-') {
        shapes[0].radius = Math.max(shapes[0].radius - 10, 30);
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
});

const infoButton = document.getElementById('info');
const infoModal = document.getElementById('infoModal');
const closeModalButton = document.getElementById('closeModal');
if (infoButton) infoButton.addEventListener('click', () => { if (infoModal) infoModal.style.display = 'flex'; });
if (closeModalButton) closeModalButton.addEventListener('click', () => { if (infoModal) infoModal.style.display = 'none'; });

if (settingsButton && settingsModal && closeSettingsModalButton) {
    settingsButton.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
    closeSettingsModalButton.addEventListener('click', () => { settingsModal.style.display = 'none'; updateOscConfig(); });
} else {
    console.error("Settings modal elements not found.");
}

window.addEventListener('click', (event) => {
    if (event.target === infoModal && infoModal) infoModal.style.display = 'none';
    if (event.target === settingsModal && settingsModal) {
        settingsModal.style.display = 'none';
        updateOscConfig(); // Update OSC config when modal is closed by clicking outside
    }
});

const drawLandmarks = (landmarks, color = 'lime') => {
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
    ];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const [a, b] of connections) {
        if (landmarks[a] && landmarks[b]) {
            const x1 = canvasElement.width - (landmarks[a].x * canvasElement.width);
            const y1 = landmarks[a].y * canvasElement.height;
            const x2 = canvasElement.width - (landmarks[b].x * canvasElement.width);
            const y2 = landmarks[b].y * canvasElement.height;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
    }
};

function distance(p1, p2) {
    if (!p1 || !p2) return Infinity;
    const dx = p2.x - p1.x; const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function screenDistance(p1, p2, canvasWidth, canvasHeight) {
    if (!p1 || !p2) return Infinity;
    const x1 = p1.x * canvasWidth;
    const y1 = p1.y * canvasHeight;
    const x2 = p2.x * canvasWidth;
    const y2 = p2.y * canvasHeight;
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}


function isTouchingCircle(x, y, cx, cy, r, tolerance = 30) { // Increased tolerance
    const dSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
    const rSq = r * r;
    const rMinSq = Math.max(0, r - tolerance) * Math.max(0, r - tolerance);
    const rMaxSq = (r + tolerance) * (r + tolerance);
    return dSq >= rMinSq && dSq <= rMaxSq;
}

// Helper to check if a finger is extended (tip further from wrist than MCP joint)
function isFingerExtended(landmarks, tipIndex, mcpIndex) {
    if (!landmarks || !landmarks[tipIndex] || !landmarks[mcpIndex] || !landmarks[0]) return false;
    // Compare y-coordinates relative to wrist, assuming hand is somewhat upright
    // A more robust check might compare distances from wrist to tip vs wrist to MCP
    return landmarks[tipIndex].y < landmarks[mcpIndex].y;
}

// Helper to check if a finger is curled (tip closer to palm/wrist than MCP or PIP)
function isFingerCurled(landmarks, tipIndex, pipIndex, mcpIndex) {
    if (!landmarks || !landmarks[tipIndex] || !landmarks[pipIndex] || !landmarks[mcpIndex]) return false;
    // Tip Y > PIP Y, and PIP Y > MCP Y (assuming hand oriented with fingers up)
    // This means tip is 'below' PIP, and PIP is 'below' MCP, indicating curl
    return landmarks[tipIndex].y > landmarks[pipIndex].y && landmarks[pipIndex].y > landmarks[mcpIndex].y - 0.01; // Small tolerance for MCP
}


// More robust check for hand open/closed state
function checkHandOpen(landmarks) {
    if (!landmarks || landmarks.length < 21) return null; // Not enough landmarks

    // Check if fingers are generally extended
    const indexExtended = isFingerExtended(landmarks, 8, 5); // Index: tip 8, mcp 5
    const middleExtended = isFingerExtended(landmarks, 12, 9); // Middle: tip 12, mcp 9
    const ringExtended = isFingerExtended(landmarks, 16, 13); // Ring: tip 16, mcp 13
    const pinkyExtended = isFingerExtended(landmarks, 20, 17); // Pinky: tip 20, mcp 17

    // A hand is considered "open" if at least 3 of these 4 fingers are extended
    const extendedFingersCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

    if (extendedFingersCount >= 3) return true; // Open

    // Check for closed fist: tips of fingers are close to palm center or significantly curled
    const palmBase = landmarks[0]; // Wrist
    const middleFingerMCP = landmarks[9];
    // Approximate palm center: a bit above wrist, towards middle finger MCP
    const palmCenterApprox = {
        x: (palmBase.x + middleFingerMCP.x) / 2,
        y: (palmBase.y + middleFingerMCP.y) / 2 + 0.05 // Adjust Y slightly towards fingers
    };

    const tipIndices = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky tips
    let closedScore = 0;
    for (const tipIdx of tipIndices) {
        if (landmarks[tipIdx]) {
            // Check distance from tip to approximated palm center (normalized coordinates)
            if (distance(landmarks[tipIdx], palmCenterApprox) < 0.15) { // Threshold for closeness to palm
                closedScore++;
            }
            // Also consider if finger is very curled
            else if (isFingerCurled(landmarks, tipIdx, tipIdx-1, tipIdx-2)) {
                 closedScore++;
            }
        }
    }
    if (closedScore >=3) return false; // Closed

    return null; // Indeterminate
}


function drawShape(shape, isPulsingGlobal, pulseValueGlobal) {
    ctx.beginPath();
    const maxInfluenceDistance = 150; // For liquify
    const maxForce = 25;             // For liquify
    const fingertipsToUseForLiquify = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky

    const cx = shape.centerX;
    const cy = shape.centerY;
    let currentDrawingRadius = shape.radius;
    const sides = shape.sides;

    if (isPulsingGlobal) {
        let radiusModulationFactor = 0.25 * pulseValueGlobal;
        currentDrawingRadius = shape.radius * (1 + radiusModulationFactor);
        currentDrawingRadius = Math.max(10, currentDrawingRadius);
    }

    let liquifyHandLandmarks = shape.rightHandLandmarks;
    if (shape.isThumbResizingActive || shape.hangLooseActive) { // Disable liquify if other prioritized gestures are active
        liquifyHandLandmarks = null;
    }

    let totalMaxDisplacement = 0; // For pitch bend based on liquify

    for (let i = 0; i < sides; i++) {
        const angleBase = (i / sides) * Math.PI * 2;
        let vertexX_orig = currentDrawingRadius * Math.cos(angleBase);
        let vertexY_orig = currentDrawingRadius * Math.sin(angleBase);

        let totalDisplacementX = 0;
        let totalDisplacementY = 0;

        // 1. Vortex Distortion (if active)
        if (shape.hangLooseActive && shape.vortexIntensity > 0) {
            const vortexAmount = shape.vortexIntensity * 0.5; // Max rotation
            const distFromCenter = Math.sqrt(vertexX_orig * vertexX_orig + vertexY_orig * vertexY_orig);
            if (distFromCenter > 0) { // Avoid division by zero for center point if radius is tiny
                 // Spiraling effect: rotation increases with distance, or constant rotation
                const rotationAngle = vortexAmount * (distFromCenter / currentDrawingRadius); // Or just vortexAmount for uniform twist
                const cosA = Math.cos(rotationAngle);
                const sinA = Math.sin(rotationAngle);

                const rotatedX = vertexX_orig * cosA - vertexY_orig * sinA;
                const rotatedY = vertexX_orig * sinA + vertexY_orig * cosA;

                // Pull inwards or outwards based on intensity as well
                const pullFactor = 1.0 - (shape.vortexIntensity * 0.3 * Math.sin(angleBase * 5 + pulseTime * 2)); // Modulated pull, '5' for more spirals

                totalDisplacementX += (rotatedX * pullFactor) - vertexX_orig;
                totalDisplacementY += (rotatedY * pullFactor) - vertexY_orig;
            }
        }

        // 2. Liquify Distortion (if active and hand present)
        if (liquifyHandLandmarks) {
            const currentVertexCanvasX = cx + vertexX_orig + totalDisplacementX; // Consider vortex displacement already
            const currentVertexCanvasY = cy + vertexY_orig + totalDisplacementY;

            for (const landmarkIndex of fingertipsToUseForLiquify) {
                const fingertip = liquifyHandLandmarks[landmarkIndex];
                if (!fingertip) continue;
                const fingertipX = canvasElement.width - (fingertip.x * canvasElement.width);
                const fingertipY = fingertip.y * canvasElement.height;
                const distToFingertip = Math.sqrt(Math.pow(currentVertexCanvasX - fingertipX, 2) + Math.pow(currentVertexCanvasY - fingertipY, 2));

                if (distToFingertip < maxInfluenceDistance && distToFingertip > 0) {
                    const vecX = currentVertexCanvasX - fingertipX;
                    const vecY = currentVertexCanvasY - fingertipY;
                    const normVecX = vecX / distToFingertip;
                    const normVecY = vecY / distToFingertip;
                    const forceMagnitude = maxForce * (1 - distToFingertip / maxInfluenceDistance);
                    totalDisplacementX += normVecX * forceMagnitude;
                    totalDisplacementY += normVecY * forceMagnitude;
                }
            }
        }

        const currentDisplacementMag = Math.sqrt(totalDisplacementX * totalDisplacementX + totalDisplacementY * totalDisplacementY);
        totalMaxDisplacement = Math.max(totalMaxDisplacement, currentDisplacementMag);

        let deformedX = vertexX_orig + totalDisplacementX;
        let deformedY = vertexY_orig + totalDisplacementY;
        const finalX = cx + deformedX;
        const finalY = cy + deformedY;

        // MIDI for edges (original looping notes) - can be kept or removed based on preference
        // For v21, the main MIDI trigger is hand open/close. This part can be optional.
        // I'll keep it for now but commented out the note ON/OFF to avoid conflict with transition triggers.
        if (midiEnabled && sides > 0 && !shape.hangLooseActive) { // Don't play edge notes if hang loose is active to focus on its pitch bend
            const edgeIndex = i;
            const note = getPentatonicNote(edgeIndex, shape.id === 0 ? 0 : 1); // Octave offset per shape
            let velocity = Math.max(0, Math.min(127, Math.round(30 + (currentDrawingRadius - 30) * ((127 - 30) / (300 - 30)))));
            if (isPulsingGlobal) {
                let pulseVelocityFactor = 0.6 + ((pulseValueGlobal + 1) / 2) * 0.4; // (0.6 to 1.0)
                velocity = Math.round(velocity * pulseVelocityFactor);
                velocity = Math.max(0, Math.min(127, velocity));
            }

            // The actual note ON/OFF for edges is disabled for now to prioritize transition triggers.
            // If needed, this logic can be re-enabled or modified.
            /*
            if (shape.activeMidiNotes[edgeIndex] && shape.activeMidiNotes[edgeIndex].playing) {
                // Update existing note (e.g. pitch bend if liquify was tied here)
                // For now, edge notes don't have their own pitch bend, global pitch bend applies
            } else {
                // sendMidiNoteOn(note, velocity, shape.midiChannel);
                shape.activeMidiNotes[edgeIndex] = {
                    note: note,
                    channel: shape.midiChannel,
                    lastVelocity: velocity,
                    playing: true // But not actually sending MIDI ON here
                };
            }
            */
        }


        if (i === 0) ctx.moveTo(finalX, finalY);
        else ctx.lineTo(finalX, finalY);
    }
    shape.lastLiquifyDisplacement = totalMaxDisplacement; // Store for pitch bend calculation in onResults

    // MIDI note off for sides that are no longer present (if edge note MIDI was active)
    /*
    if (Object.keys(shape.activeMidiNotes).length > 0) {
        if (midiEnabled && sides > 0) {
            // ... (logic to turn off notes for edges > sides) ...
        } else {
            // ... (turn off all notes for this shape if MIDI disabled or sides = 0) ...
        }
    }
    */

    ctx.closePath();
    ctx.strokeStyle = shape.id === 0 ? 'cyan' : 'magenta';
    ctx.lineWidth = shape.hangLooseActive ? 6 : 4; // Thicker when vortex active
    ctx.stroke();
}


// --- OSC Message Sending ---
// Simple OSC message formatting (basic, no type tags for simplicity here, often not strictly needed by receivers like TouchDesigner)
// A full OSC library would handle type tags (e.g., 'f' for float, 'i' for int, 's' for string)
// For now, we send data that TouchDesigner can parse from basic UDP messages.
// NOTE: Browsers cannot directly send UDP packets. This requires a bridge/server.
// For this simulation, we'll log to console what WOULD be sent.
// In a real scenario, you'd use `fetch` to send an HTTP request to a local server
// that then forwards the data as OSC via UDP. Or use WebSockets if the receiver supports it.

// Placeholder for actual OSC sending.
// In a browser, you'd typically POST to a local server that then sends OSC.
// Or use osc.js if a WebSocket to OSC bridge is set up.
// For now, we'll just log it.
function sendOscMessage(path, ...args) {
    // This is a placeholder. Actual OSC sending from a browser is complex.
    // console.log(`OSC: ${path}`, args.join(', '));
    // To simulate sending to a local Python script that listens for HTTP and forwards OSC:
    // (This requires a local server like Flask listening on, e.g., port 5000)
    /*
    fetch(`http://localhost:5000/send_osc`, { // Example: local server endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, args })
    }).catch(err => console.warn("OSC send via HTTP failed (is local bridge server running?):", err));
    */
}

function sendAllOscData() {
    const currentTime = performance.now();
    if (currentTime - lastOscSendTime < oscSendInterval) {
        return; // Throttle OSC messages
    }
    lastOscSendTime = currentTime;

    shapes.forEach(shape => {
        shape.updateOscData(); // Ensure latest data is in shape.oscData
        const id = shape.id + 1; // 1-indexed for OSC paths

        // For a real implementation, you would need a proper OSC library or a bridge.
        // The following uses the placeholder sendOscMessage.
        // If using osc.js with a WebSocket bridge, it would be different.

        console.log(`OSC:/shape/${id}/sides ${shape.oscData.sides}`);
        console.log(`OSC:/shape/${id}/radius ${shape.oscData.radius}`);
        console.log(`OSC:/shape/${id}/vortexIntensity ${shape.oscData.vortexIntensity}`);
        console.log(`OSC:/shape/${id}/posX ${shape.oscData.posX}`);
        console.log(`OSC:/shape/${id}/posY ${shape.oscData.posY}`);
        console.log(`OSC:/shape/${id}/pitchBend ${shape.oscData.pitchBend}`);
        console.log(`OSC:/shape/${id}/leftHandOpen ${shape.oscData.leftHandOpen}`);
        console.log(`OSC:/shape/${id}/rightHandOpen ${shape.oscData.rightHandOpen}`);
    });
}


function onResults(results) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Fading trail effect
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    shapes.forEach(shape => {
        shape.leftHandLandmarks = null;
        shape.rightHandLandmarks = null;
        // Don't reset isThumbResizingActive here, it's determined by gesture logic below.
        // shape.hangLooseActive = false; // Also determined by gesture logic
    });

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        results.multiHandLandmarks.forEach((landmarks, i) => {
            const handednessLabel = results.multiHandedness[i] ? results.multiHandedness[i].label : null;
            const handColor = handednessLabel === "Left" ? "orange" : "lightgreen";
            drawLandmarks(landmarks, handColor);

            if (handednessLabel === "Left") {
                if (!shapes[0].leftHandLandmarks) shapes[0].leftHandLandmarks = landmarks;
                else if (shapes.length > 1 && !shapes[1].leftHandLandmarks) shapes[1].leftHandLandmarks = landmarks;
            } else if (handednessLabel === "Right") {
                if (!shapes[0].rightHandLandmarks) shapes[0].rightHandLandmarks = landmarks;
                else if (shapes.length > 1 && !shapes[1].rightHandLandmarks) shapes[1].rightHandLandmarks = landmarks;
            }
        });
    }

    // --- GESTURE PROCESSING & HIERARCHY ---
    shapes.forEach(shape => {
        // Store previous hand states for transition detection
        shape.lastLeftHandOpen = shape.leftHandOpen;
        shape.lastRightHandOpen = shape.rightHandOpen;

        // Update current hand states
        shape.leftHandOpen = shape.leftHandLandmarks ? checkHandOpen(shape.leftHandLandmarks) : null;
        shape.rightHandOpen = shape.rightHandLandmarks ? checkHandOpen(shape.rightHandLandmarks) : null;

        // --- MIDI Trigger on Hand Open/Close Transition ---
        // Left Hand
        if (shape.leftHandOpen !== null && shape.lastLeftHandOpen !== null && shape.leftHandOpen !== shape.lastLeftHandOpen) {
            const noteToPlay = shape.leftHandOpen ? TRIGGER_NOTE_OPEN : TRIGGER_NOTE_CLOSE;
            const velocity = shape.radius / 2; // Example: velocity based on radius
            sendMidiNoteOn(noteToPlay, Math.min(127, Math.max(30, velocity)), shape.midiChannel);
            // Optional: send note off after a short delay or on next transition
            setTimeout(() => sendMidiNoteOff(noteToPlay, shape.midiChannel), 150); // Auto note-off
            console.log(`Shape ${shape.id} Left Hand Transition: ${shape.lastLeftHandOpen} -> ${shape.leftHandOpen}. MIDI note ${noteToPlay}`);
        }
        // Right Hand
        if (shape.rightHandOpen !== null && shape.lastRightHandOpen !== null && shape.rightHandOpen !== shape.lastRightHandOpen) {
            const noteToPlay = shape.rightHandOpen ? TRIGGER_NOTE_OPEN : TRIGGER_NOTE_CLOSE;
            const velocity = shape.radius / 2;
            sendMidiNoteOn(noteToPlay + 2, Math.min(127, Math.max(30, velocity)), shape.midiChannel); // Slightly different note for right hand
             setTimeout(() => sendMidiNoteOff(noteToPlay + 2, shape.midiChannel), 150); // Auto note-off
            console.log(`Shape ${shape.id} Right Hand Transition: ${shape.lastRightHandOpen} -> ${shape.rightHandOpen}. MIDI note ${noteToPlay + 2}`);
        }


        // Update shape position (average of wrists, if any)
        let wristCount = 0; let avgWristX = 0; let avgWristY = 0;
        if (shape.leftHandLandmarks && shape.leftHandLandmarks[0]) { avgWristX += shape.leftHandLandmarks[0].x; avgWristY += shape.leftHandLandmarks[0].y; wristCount++; }
        if (shape.rightHandLandmarks && shape.rightHandLandmarks[0]) { avgWristX += shape.rightHandLandmarks[0].x; avgWristY += shape.rightHandLandmarks[0].y; wristCount++; }
        if (wristCount > 0) {
            shape.centerX = canvasElement.width - (avgWristX / wristCount * canvasElement.width);
            shape.centerY = avgWristY / wristCount * canvasElement.height;
        }

        // Gesture Control Hierarchy
        shape.isThumbResizingActive = false;
        shape.hangLooseActive = false;
        // liquify is implicitly disabled if these are active by drawShape logic

        // 1. Redimensionamento com os polegares (PRIORITY 1)
        if (shape.leftHandLandmarks && shape.rightHandLandmarks &&
            shape.leftHandOpen === false && shape.rightHandOpen === false) { // Both hands closed
            const leftThumbTip = shape.leftHandLandmarks[4];
            const rightThumbTip = shape.rightHandLandmarks[4];
            // Check if thumbs are extended (tips further from wrist than base of thumb/index finger)
            const leftThumbExtended = leftThumbTip.y < shape.leftHandLandmarks[2].y && leftThumbTip.y < shape.leftHandLandmarks[3].y;
            const rightThumbExtended = rightThumbTip.y < shape.rightHandLandmarks[2].y && rightThumbTip.y < shape.rightHandLandmarks[3].y;

            if (leftThumbExtended && rightThumbExtended) {
                const thumbDistPixels = screenDistance(leftThumbTip, rightThumbTip, canvasElement.width, canvasElement.height);
                const minThumbDist = canvasElement.width * 0.03;
                const maxThumbDist = canvasElement.width * 0.35;
                const normalizedThumbDist = Math.max(0, Math.min(1, (thumbDistPixels - minThumbDist) / (maxThumbDist - minThumbDist)));
                shape.radius = 30 + normalizedThumbDist * 270; // Range 30 to 300
                shape.isThumbResizingActive = true;
            }
        }

        // 2. Gesto "Hang Loose" (Mão Esquerda) (PRIORITY 2)
        if (!shape.isThumbResizingActive && shape.leftHandLandmarks) {
            const lm = shape.leftHandLandmarks;
            // Thumb: Tip 4, IP 3, MCP 2, CMC 1
            // Index: Tip 8, DIP 7, PIP 6, MCP 5
            // Middle: Tip 12, DIP 11, PIP 10, MCP 9
            // Ring: Tip 16, DIP 15, PIP 14, MCP 13
            // Pinky: Tip 20, DIP 19, PIP 18, MCP 17

            const thumbExtended = isFingerExtended(lm, 4, 2); // Thumb tip vs MCP
            const indexCurled = isFingerCurled(lm, 8, 7, 6);   // Index tip, DIP, PIP
            const middleCurled = isFingerCurled(lm, 12, 11, 10); // Middle tip, DIP, PIP
            const ringCurled = isFingerCurled(lm, 16, 15, 14);   // Ring tip, DIP, PIP
            const pinkyExtended = isFingerExtended(lm, 20, 18); // Pinky tip vs PIP (or MCP 17)

            if (thumbExtended && indexCurled && middleCurled && ringCurled && pinkyExtended) {
                shape.hangLooseActive = true;
                // Intensity: distance between thumb tip and pinky tip (normalized)
                const thumbPinkyDist = screenDistance(lm[4], lm[20], canvasElement.width, canvasElement.height);
                const minHangLooseDist = canvasElement.width * 0.05; // Min sensible distance
                const maxHangLooseDist = canvasElement.width * 0.25; // Max sensible distance
                shape.hangLooseIntensity = Math.max(0, Math.min(1, (thumbPinkyDist - minHangLooseDist) / (maxHangLooseDist - minHangLooseDist)));
                shape.vortexIntensity = shape.hangLooseIntensity; // Direct mapping for now

                // Control Pitch Bend
                const pitchBendRange = 8191; // Max deviation from center (0 to 16383, center 8192)
                                             // Use 4096 for a common +/- 1 semitone range with some synths, or more for wider bends
                shape.currentPitchBend = 8192 + Math.round((shape.hangLooseIntensity - 0.5) * 2 * pitchBendRange * 0.5); // -0.5 to 0.5 range, scale to pitchbend
                shape.currentPitchBend = Math.max(0, Math.min(16383, shape.currentPitchBend));
                sendPitchBend(shape.currentPitchBend, shape.midiChannel);
            } else {
                 // If was hang loose but no longer, reset pitch bend slowly or instantly
                if (shape.vortexIntensity > 0) { // Only reset if it was active
                    sendPitchBend(8192, shape.midiChannel);
                    shape.currentPitchBend = 8192;
                }
                shape.hangLooseIntensity = 0;
                shape.vortexIntensity = 0;
            }
        }


        // 3. Pinça (Controle de Lados com Mão Esquerda) (PRIORITY 3)
        if (!shape.isThumbResizingActive && !shape.hangLooseActive && shape.leftHandLandmarks) {
            const indexTip = shape.leftHandLandmarks[8];
            const thumbTip = shape.leftHandLandmarks[4];
            const pinchCenterCanvasX = canvasElement.width - ((indexTip.x + thumbTip.x) / 2 * canvasElement.width);
            const pinchCenterCanvasY = (indexTip.y + thumbTip.y) / 2 * canvasElement.height;

            if (isTouchingCircle(pinchCenterCanvasX, pinchCenterCanvasY, shape.centerX, shape.centerY, shape.radius)) {
                const pinchDistPixels = screenDistance(indexTip, thumbTip, canvasElement.width, canvasElement.height);
                const minPinch = canvasElement.width * 0.01; // ~10px for 640px width
                const maxPinch = canvasElement.width * 0.2;  // ~120px
                const normalizedPinch = Math.max(0, Math.min(1, (pinchDistPixels - minPinch) / (maxPinch - minPinch)));

                let newSides = Math.round(3 + normalizedPinch * 97); // 3 to 100 sides
                newSides = Math.min(100, Math.max(3, newSides));

                if (newSides !== shape.sides) {
                    const currentTime = performance.now();
                    if (currentTime - shape.lastSideChangeTime > SIDE_CHANGE_DEBOUNCE_MS) {
                        // MIDI note off for removed sides (if edge MIDI was active)
                        // if (newSides < shape.sides && midiEnabled) { ... }
                        shape.sides = newSides;
                        shape.lastSideChangeTime = currentTime;
                    }
                }
            }
        }

        // 4. Distorção Manual (Liquify) com Mão Direita (PRIORITY 4)
        // Actual liquify is done in drawShape if shape.rightHandLandmarks is present AND
        // thumb resizing and hang loose are NOT active.
        // Here, we can calculate pitch bend based on liquify if it's the active distortion.
        if (!shape.isThumbResizingActive && !shape.hangLooseActive && shape.rightHandLandmarks) {
            // Pitch bend based on liquify displacement (shape.lastLiquifyDisplacement calculated in drawShape)
            const maxObservedDistortion = 75.0; // Max expected displacement from liquify for full bend
            const pitchBendSensitivity = 2048; // How much bend for max distortion
            let liquifyBend = 8192;
            if (shape.lastLiquifyDisplacement > 1.0) { // Min displacement to react
                const bendAmount = Math.min(1.0, shape.lastLiquifyDisplacement / maxObservedDistortion) * pitchBendSensitivity;
                // Bend upwards for liquify
                liquifyBend = 8192 + Math.round(bendAmount);
                liquifyBend = Math.max(8192, Math.min(16383, liquifyBend)); // Only positive bend from liquify for now
            }

            if (Math.abs(liquifyBend - shape.currentPitchBend) > 10) { // Update if significant change
                 // Only apply liquify pitch bend if it's stronger than neutral or if no hang loose
                if (liquifyBend > shape.currentPitchBend || shape.currentPitchBend == 8192) {
                    shape.currentPitchBend = liquifyBend;
                    sendPitchBend(shape.currentPitchBend, shape.midiChannel);
                }
            } else if (shape.lastLiquifyDisplacement <= 1.0 && shape.currentPitchBend !== 8192 && !shape.hangLooseActive) {
                // If liquify stops and not hang loose, reset pitch bend
                shape.currentPitchBend = 8192;
                sendPitchBend(8192, shape.midiChannel);
            }
        } else if (!shape.isThumbResizingActive && !shape.hangLooseActive && shape.currentPitchBend !== 8192) {
            // If no right hand for liquify and no hang loose, ensure pitch bend is neutral
            shape.currentPitchBend = 8192;
            sendPitchBend(8192, shape.midiChannel);
        }

    }); // End shapes.forEach for gesture processing

    let currentPulseValue = 0;
    if (pulseModeActive) {
        pulseTime = performance.now() * 0.001; // seconds
        currentPulseValue = Math.sin(pulseTime * pulseFrequency * 2 * Math.PI); // -1 to 1
    }

    shapes.forEach(shape => {
        drawShape(shape, pulseModeActive, currentPulseValue);
    });

    updateHUD();
    sendAllOscData(); // Send OSC data based on interval

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
        } catch (e) { /* console.warn("Error drawing to popup:", e.message); */ }
    }
}


if (openOutputPopupButton) {
    openOutputPopupButton.addEventListener('click', () => {
        if (outputPopupWindow && !outputPopupWindow.closed) {
            outputPopupWindow.focus();
        } else {
            outputPopupWindow = window.open('', 'OutputWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
            if (!outputPopupWindow || outputPopupWindow.closed || typeof outputPopupWindow.document === 'undefined') {
                alert("Falha ao abrir a janela de saída...");
                outputPopupWindow = null; popupCanvasCtx = null;
            } else {
                outputPopupWindow.document.write('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Visual Output</title><style>body { margin: 0; overflow: hidden; background: #111; display: flex; justify-content: center; align-items: center; } canvas { display: block; width: 100%; height: 100%; }</style></head><body><canvas id="popupCanvas"></canvas></body></html>');
                outputPopupWindow.document.close();
                const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
                if (popupCanvas) {
                    popupCanvasCtx = popupCanvas.getContext('2d');
                    try {
                        popupCanvas.width = outputPopupWindow.innerWidth;
                        popupCanvas.height = outputPopupWindow.innerHeight;
                    } catch (e) { console.warn("Error setting initial popup canvas size:", e); }
                } else {
                    alert("Erro ao configurar a janela de saída.");
                    if(outputPopupWindow) outputPopupWindow.close();
                    outputPopupWindow = null; popupCanvasCtx = null;
                    return;
                }
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

            let leftHandInfo = "L:Nenhuma";
            if(shape.leftHandLandmarks) leftHandInfo = `L:${shape.leftHandOpen === true ? "Aberta" : (shape.leftHandOpen === false ? "Fechada" : "Indet.")}`;
            let rightHandInfo = "R:Nenhuma";
            if(shape.rightHandLandmarks) rightHandInfo = `R:${shape.rightHandOpen === true ? "Aberta" : (shape.rightHandOpen === false ? "Fechada" : "Indet.")}`;

            const resizingStatus = shape.isThumbResizingActive ? "Polegares" : "---";
            const hangLooseStatus = shape.hangLooseActive ? `HangLoose(${shape.hangLooseIntensity.toFixed(2)})` : "---";
            const vortexStatus = shape.vortexIntensity > 0 ? `Vortex(${shape.vortexIntensity.toFixed(2)})` : "---";
            const pitchBendDisplay = Math.round( (shape.currentPitchBend - 8192) / 8191 * 100 ); // % of bend

            hudText += `<b>Forma ${shape.id + 1}:</b> Raio: ${radius}, Lados: ${sides}, PB: ${pitchBendDisplay}%<br>`;
            hudText += `&nbsp;&nbsp;Pos:(${posX},${posY}), Mãos: ${leftHandInfo}, ${rightHandInfo}<br>`;
            hudText += `&nbsp;&nbsp;Gestos: Redim:${resizingStatus}, HL:${hangLooseStatus}, Vortex:${vortexStatus}<br><br>`;
        });
        const midiStatus = midiEnabled ? 'ON' : 'OFF';
        const pulseStatus = pulseModeActive ? 'ON' : 'OFF';
        const oscStatus = `OSC: ${oscServerIp}:${oscServerPort} @${oscSendInterval}ms`;

        hudText += `<b>Geral:</b> MIDI: ${midiStatus}, Pulso: ${pulseStatus}<br>`;
        hudText += `&nbsp;&nbsp;${oscStatus}`;
        hudElement.innerHTML = hudText;
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
        if (!midiEnabled) turnOffAllActiveNotes();
        updateHUD();
    });
}

updateHUD(); // Initial HUD
console.log("main21.js loaded. This version includes hand open/close MIDI triggers, hang loose gesture, vortex, OSC output (console log only), and gesture hierarchy.");
console.log("Remember: True OSC UDP sending from browser typically requires a local server bridge.");
[end of main21.js]
