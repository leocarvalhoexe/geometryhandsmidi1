// Global constants and utility functions that don't rely on DOM ready
const DEFAULT_RADIUS = 100;
const DEFAULT_SIDES = 100;

// Variables that will be assigned later or don't depend on DOM
let circleRadius = DEFAULT_RADIUS;
let shapeSides = DEFAULT_SIDES;

let rightHandLandmarks = null;
let pulseModeActive = false;
let pulseTime = 0;
let pulseFrequency = 0.5;
let lastPulseValue = 0;

// centerX and centerY will be defined inside DOMContentLoaded

let isMouseDown = false;
let isRightButton = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Constants for shape manipulation
const MIN_RADIUS = 30;
const MAX_RADIUS = 300;
const MIN_SIDES = 3;
const MAX_SIDES = 100;

// State variables
let mouseControlsActive = true;
let currentMusicalScale = 'pentatonic';

// Musical scales
const PENTATONIC_SCALE_C_MAJOR = [60, 62, 64, 67, 69];
const MAJOR_SCALE_NOTES = [60, 62, 64, 65, 67, 69, 71];
const HARMONIC_MINOR_SCALE_NOTES = [60, 62, 63, 65, 67, 68, 71];

// Demo mode variables
let demoModeActive = false;
let demoAngle = 0;
let demoPulseTimer = 0;
let demoDistortionTimer = 0;
const DEMO_ROTATION_SPEED = 0.005;
const DEMO_PULSE_INTERVAL = 200;
const DEMO_DISTORTION_INTERVAL = 150;
const DEMO_EVENT_DURATION = 60;
let demoIsPulsing = false;
let demoIsDistorting = false;

// Performance mode variables
let performanceModeActive = false;
let isDraggingShape = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Shape and MIDI data
let shapes = [];
const MAX_SHAPES = 3;
const MIDI_CHANNELS = [0, 1, 2];
let selectedShape = null;

// MediaPipe Hands instance
const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });

// MIDI variables
let midiAccess = null;
let midiOutput = null;
let availableMidiOutputs = new Map();
let midiEnabled = false;

// Variables for popup window
let outputPopupWindow = null;
let popupCanvasCtx = null;

// Global references to DOM elements - will be assigned in DOMContentLoaded
let videoElement, canvasElement, ctx, mouseSimToggle, resetMidiButton, shapeSidesInput, musicalScaleSelect, resetShapeButton, settingsButton, settingsModal, closeSettingsModalButton, midiOutputSelect, openOutputPopupButton, infoButton, closeModalButton;
let camera; // Camera instance
let cW, cH; // canvas width and height
let centerX, centerY; // functions to get canvas center

// MIDI utility functions (can be global as they don't interact with DOM directly until called)
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
    if (!midiOutputSelect) return; // Guard against missing element

    const currentSelectedId = midiOutput ? midiOutput.id : null;
    midiOutputSelect.innerHTML = ''; // Clear existing options

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

    if (currentSelectedId && availableMidiOutputs.has(currentSelectedId)) {
        midiOutputSelect.value = currentSelectedId;
        midiOutput = availableMidiOutputs.get(currentSelectedId);
    } else if (availableMidiOutputs.size > 0) {
        const firstOutputId = availableMidiOutputs.keys().next().value;
        midiOutputSelect.value = firstOutputId;
        midiOutput = availableMidiOutputs.get(firstOutputId);
    } else {
        midiOutput = null;
    }

    if (midiOutput) {
        console.log("Populated MIDI Selected:", midiOutput.name);
    } else {
        console.warn("No MIDI output selected after populating.");
    }
}

async function initMidi() {
    try {
        if (navigator.requestMIDIAccess) {
            midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            console.log("MIDI Access Granted");
            updateMidiOutputList(); // Initial population
            midiAccess.onstatechange = (e) => {
                console.log("MIDI state change:", e.port.name, e.port.state, e.port.type);
                updateMidiOutputList(); // Repopulate on change
                if (e.port.type === "output" && e.port.state === "disconnected") {
                    if (midiOutput && e.port.id === midiOutput.id) {
                        console.warn("Selected MIDI Output disconnected:", e.port.name);
                        // midiOutput might become null via populateMidiOutputSelect
                    }
                } else if (e.port.type === "output" && e.port.state === "connected") {
                    console.log("New MIDI Output connected:", e.port.name);
                }
            };
        } else {
            console.warn("Web MIDI API not supported.");
            populateMidiOutputSelect(); // Still try to populate, might show "none found"
        }
    } catch (err) {
        console.error("Could not access MIDI.", err);
        populateMidiOutputSelect(); // Still try to populate
    }
}

// MIDI sending functions
function sendMidiNoteOn(note, velocity, channel) { if (midiOutput && midiEnabled) midiOutput.send([0x90 + channel, note, velocity]); }
function sendMidiNoteOff(note, channel) { if (midiOutput && midiEnabled) midiOutput.send([0x80 + channel, note, 0]); }
function sendPitchBend(bendValue, channel) { if (midiOutput && midiEnabled) midiOutput.send([0xE0 + channel, bendValue & 0x7F, (bendValue >> 7) & 0x7F]); }
function getScaleNote(index, baseOctaveOffset = 0) { let s; switch(currentMusicalScale){case 'major':s=MAJOR_SCALE_NOTES;break;case 'harmonicMinor':s=HARMONIC_MINOR_SCALE_NOTES;break;default:s=PENTATONIC_SCALE_C_MAJOR;} const sl=s.length; const o=baseOctaveOffset+Math.floor(index/sl); const n=s[index%sl]; return n+(o*12); }

// Functions to turn off MIDI notes
function turnOffAllActiveNotesForShape(shape) {
    if (!shape || !shape.activeNotes) return;
    if (Object.keys(shape.activeNotes).length > 0) {
        const originalMidiEnabled = midiEnabled; // Store original state
        midiEnabled = true; // Temporarily enable for sending note offs
        Object.keys(shape.activeNotes).forEach(edgeIdx => {
            const noteInfo = shape.activeNotes[edgeIdx];
            if (noteInfo.playing) sendMidiNoteOff(noteInfo.note, shape.midiChannel);
        });
        midiEnabled = originalMidiEnabled; // Restore original state
    }
    shape.activeNotes = {}; // Clear active notes for the shape
}
function turnOffAllActiveNotesGlobally() { shapes.forEach(s => turnOffAllActiveNotesForShape(s)); }


// Canvas drawing and geometry functions (can be global, depend on ctx, cW, cH passed or globally available post-DOMContentLoaded)
const drawLandmarks = (landmarks) => {
  if (!ctx || !cW || !cH) return; // Ensure context and dimensions are available
  const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  ctx.strokeStyle='lime';
  ctx.lineWidth=2;
  for(const [startIdx, endIdx] of connections){
    const x1 = cW - (landmarks[startIdx].x * cW);
    const y1 = landmarks[startIdx].y * cH;
    const x2 = cW - (landmarks[endIdx].x * cW);
    const y2 = landmarks[endIdx].y * cH;
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();
  }
};
function distance(x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1;return Math.sqrt(dx*dx+dy*dy);}
function isTouchingCircle(x,y,circleX,circleY,radius,tolerance=20){return Math.abs(distance(x,y,circleX,circleY)-radius)<=tolerance;}


function initShapes() {
    shapes = [];
    const defaultShape = {
      id: 0, x: centerX(), y: centerY(), radius: DEFAULT_RADIUS, sides: DEFAULT_SIDES,
      midiChannel: MIDI_CHANNELS[0], activeNotes: {}, rotationAngle: 0, color: 'cyan',
      liquifyPoints: null, isSelected: true
    };
    shapes.push(defaultShape);
    selectedShape = defaultShape;
    circleRadius = selectedShape.radius; // Sync global state
    shapeSides = selectedShape.sides;   // Sync global state
    console.log("Shapes initialized, selected shape:", selectedShape);
}

function drawShape(shape, currentPulsedRadius, isPulsingActive, pulseCycleValue, currentDemoAngle, isDemoDistortingFlag) {
  if (!ctx) return;
  ctx.beginPath();
  const currentDisplaySides = Math.round(Math.max(MIN_SIDES, Math.min(MAX_SIDES, shape.sides)));
  const shapeCenterX = shape.x;
  const shapeCenterY = shape.y;

  for (let i = 0; i < currentDisplaySides; i++) {
    const angleBase = (i / currentDisplaySides) * Math.PI * 2;
    let currentAngle = angleBase + shape.rotationAngle;
    let vertexXoriginal = currentPulsedRadius * Math.cos(currentAngle);
    let vertexYoriginal = currentPulsedRadius * Math.sin(currentAngle);

    if (demoModeActive && currentDemoAngle && shape.isSelected) {
        let rotatedX = vertexXoriginal * Math.cos(currentDemoAngle) - vertexYoriginal * Math.sin(currentDemoAngle);
        let rotatedY = vertexXoriginal * Math.sin(currentDemoAngle) + vertexYoriginal * Math.cos(currentDemoAngle);
        vertexXoriginal = rotatedX;
        vertexYoriginal = rotatedY;
    }

    let totalDistortionX = 0;
    let totalDistortionY = 0;
    let applyManualLiquify = false;

    if (rightHandLandmarks && !demoModeActive && shape.isSelected) {
        if (mouseControlsActive && !isMouseDown) applyManualLiquify = true;
        else if (!mouseControlsActive) applyManualLiquify = true;
    }

    if (applyManualLiquify) {
        const vertexCanvasX = shapeCenterX + vertexXoriginal;
        const vertexCanvasY = shapeCenterY + vertexYoriginal;
        const fingerTipIndices = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
        const maxInfluenceDistance = 150; // Pixels
        const maxForce = 25; // Pixels

        for (const landmarkIndex of fingerTipIndices) {
            const fingerTip = rightHandLandmarks[landmarkIndex];
            const fingerX = cW - (fingerTip.x * cW); // Mirrored X
            const fingerY = fingerTip.y * cH;
            const dist = distance(vertexCanvasX, vertexCanvasY, fingerX, fingerY);

            if (dist < maxInfluenceDistance && dist > 0) {
                const vectorX = vertexCanvasX - fingerX;
                const vectorY = vertexCanvasY - fingerY;
                const normalizedVX = vectorX / dist;
                const normalizedVY = vectorY / dist;
                const magnitude = maxForce * (1 - dist / maxInfluenceDistance);
                totalDistortionX += normalizedVX * magnitude;
                totalDistortionY += normalizedVY * magnitude;
            }
        }
    }
     if (demoModeActive && isDemoDistortingFlag && shape.isSelected) {
        totalDistortionX += (Math.random() - 0.5) * 30;
        totalDistortionY += (Math.random() - 0.5) * 30;
    }

    const finalX = shapeCenterX + vertexXoriginal + totalDistortionX;
    const finalY = shapeCenterY + vertexYoriginal + totalDistortionY;

    if (midiEnabled && currentDisplaySides > 0) {
        const edgeIndex = i;
        const note = getScaleNote(edgeIndex);
        let velocity = Math.max(0, Math.min(127, Math.round(30 + (currentPulsedRadius - MIN_RADIUS) * ((127 - 30) / (MAX_RADIUS - MIN_RADIUS)))));
        if (isPulsingActive) {
            let factor = 0.6 + ((pulseCycleValue + 1) / 2) * 0.4; // pulseCycleValue is -1 to 1
            velocity = Math.round(velocity * factor);
            velocity = Math.max(0, Math.min(127, velocity));
        }

        const distortionMagnitude = Math.sqrt(totalDistortionX * totalDistortionX + totalDistortionY * totalDistortionY);
        const maxDistortionForPitchBend = 50.0;
        const pitchBendSensitivity = 2048; // ~2 semitones for full distortionMagnitude
        let pitchBend = 8192; // Neutral

        if (distortionMagnitude > 0.5) { // Only apply if distortion is significant
            const bendAmount = Math.min(1.0, distortionMagnitude / maxDistortionForPitchBend) * pitchBendSensitivity;
            pitchBend = 8192 + Math.round(bendAmount);
            pitchBend = Math.max(0, Math.min(16383, pitchBend)); // Clamp to 14-bit range
        }

        if (shape.activeNotes[edgeIndex] && shape.activeNotes[edgeIndex].playing) {
            // Note is already playing, check for changes
            if (shape.activeNotes[edgeIndex].note !== note) { // Note changed (e.g. scale change)
                sendMidiNoteOff(shape.activeNotes[edgeIndex].note, shape.midiChannel);
                sendMidiNoteOn(note, velocity, shape.midiChannel);
                shape.activeNotes[edgeIndex].note = note;
                shape.activeNotes[edgeIndex].lastVelocity = velocity;
                shape.activeNotes[edgeIndex].lastPitchBend = 8192; // Reset pitch bend for new note
                sendPitchBend(8192, shape.midiChannel); // Send neutral pitch bend
            } else { // Note is the same, check velocity and pitch bend
                if (Math.abs(pitchBend - shape.activeNotes[edgeIndex].lastPitchBend) > 10) { // Only send if changed significantly
                    sendPitchBend(pitchBend, shape.midiChannel);
                    shape.activeNotes[edgeIndex].lastPitchBend = pitchBend;
                }
                if (Math.abs(velocity - shape.activeNotes[edgeIndex].lastVelocity) > 5) { // Update velocity if changed
                     // MIDI spec doesn't have per-note velocity change after note-on, this is for internal tracking
                    shape.activeNotes[edgeIndex].lastVelocity = velocity;
                }
            }
        } else { // New note
            sendMidiNoteOn(note, velocity, shape.midiChannel);
            shape.activeNotes[edgeIndex] = {
                note: note,
                channel: shape.midiChannel,
                lastVelocity: velocity,
                lastPitchBend: pitchBend, // Store initial pitch bend
                playing: true
            };
            if (pitchBend !== 8192) { // Send initial pitch bend if not neutral
                sendPitchBend(pitchBend, shape.midiChannel);
            }
        }
    }

    if (i === 0) ctx.moveTo(finalX, finalY);
    else ctx.lineTo(finalX, finalY);
  }

  // After drawing all vertices, manage notes that are no longer part of the shape
  if (Object.keys(shape.activeNotes).length > 0) {
    if (midiEnabled && currentDisplaySides > 0) {
        Object.keys(shape.activeNotes).forEach(indexString => {
            const indexNum = Number(indexString);
            if (shape.activeNotes[indexNum] && shape.activeNotes[indexNum].playing) {
                if (indexNum >= currentDisplaySides) { // This edge no longer exists
                    sendMidiNoteOff(shape.activeNotes[indexNum].note, shape.midiChannel);
                    shape.activeNotes[indexNum].playing = false; // Mark as not playing
                }
            }
        });
        // Clean up notes marked as not playing
        Object.keys(shape.activeNotes).forEach(indexString => {
            if (shape.activeNotes[indexString] && !shape.activeNotes[indexString].playing) {
                delete shape.activeNotes[indexString];
            }
        });
    } else if (!midiEnabled || currentDisplaySides === 0) { // If MIDI disabled or shape has no sides, turn off all its notes
        turnOffAllActiveNotesForShape(shape);
    }
  }

  ctx.closePath();
  ctx.strokeStyle = shape.isSelected ? 'yellow' : shape.color;
  ctx.lineWidth = shape.isSelected ? 6 : 4;
  ctx.stroke();
}


function onResults(results) {
  if (!ctx || !cW || !cH) return; // Ensure canvas is ready

  // Update global state based on selected shape if not in demo mode
  if (selectedShape && !demoModeActive) {
    circleRadius = selectedShape.radius;
    shapeSides = selectedShape.sides;
  }

  // Demo mode updates
  if (demoModeActive) {
    demoAngle += DEMO_ROTATION_SPEED;
    demoPulseTimer++;
    demoDistortionTimer++;

    if (demoPulseTimer > DEMO_PULSE_INTERVAL + DEMO_EVENT_DURATION) {
      demoPulseTimer = 0; demoIsPulsing = false; pulseModeActive = false;
    } else if (demoPulseTimer > DEMO_PULSE_INTERVAL) {
      demoIsPulsing = true; pulseModeActive = true;
    }

    if (demoDistortionTimer > DEMO_DISTORTION_INTERVAL + DEMO_EVENT_DURATION) {
      demoDistortionTimer = 0; demoIsDistorting = false;
    } else if (demoDistortionTimer > DEMO_DISTORTION_INTERVAL) {
      demoIsDistorting = true;
    }
    rightHandLandmarks = null; // No hand interaction in demo mode
  }
  // Normal mode (single shape) hand controls
  else if (!performanceModeActive && selectedShape) {
    if ((!mouseControlsActive || !isMouseDown) && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        let leftHand, rightHand;
        if (results.multiHandedness.length === 1) {
            if (results.multiHandedness[0].label === "Left") leftHand = results.multiHandLandmarks[0];
            else rightHand = results.multiHandLandmarks[0];
        } else if (results.multiHandedness.length === 2) {
            if (results.multiHandedness[0].label === "Left") {
                leftHand = results.multiHandLandmarks[0];
                rightHand = results.multiHandLandmarks[1];
            } else {
                leftHand = results.multiHandLandmarks[1];
                rightHand = results.multiHandLandmarks[0];
            }
        }

        const isThumbUp = (landmarks, handLabel) => {
            if (!landmarks) return false;
            const thumbTip = landmarks[4]; const thumbIp = landmarks[3]; const thumbMcp = landmarks[2];
            const isUp = thumbTip.y < thumbIp.y && thumbIp.y < thumbMcp.y;
            const isExtended = (handLabel === "Right" && thumbTip.x < thumbMcp.x) || (handLabel === "Left" && thumbTip.x > thumbMcp.x); // Mirrored X
            const areOtherFingersClosed = landmarks[8].y > landmarks[6].y && landmarks[12].y > landmarks[10].y && landmarks[16].y > landmarks[14].y && landmarks[20].y > landmarks[18].y;
            return isUp && isExtended && areOtherFingersClosed;
        };

        let isTwoThumbsResize = false;
        if (leftHand && rightHand && isThumbUp(leftHand, "Left") && isThumbUp(rightHand, "Right")) {
            isTwoThumbsResize = true;
            const leftThumbTip = leftHand[4]; const rightThumbTip = rightHand[4];
            const thumbDistancePixels = distance(leftThumbTip.x * cW, leftThumbTip.y * cH, rightThumbTip.x * cW, rightThumbTip.y * cH); // Use cW for scaling
            const minThumbDist = cW * 0.05; const maxThumbDist = cW * 0.5;
            const normalizedThumbDistance = Math.max(0, Math.min(1, (thumbDistancePixels - minThumbDist) / (maxThumbDist - minThumbDist)));
            selectedShape.radius = MIN_RADIUS + normalizedThumbDistance * (MAX_RADIUS - MIN_RADIUS);
            circleRadius = selectedShape.radius;
        }

        if (rightHand && !isTwoThumbsResize) rightHandLandmarks = rightHand;
        else if (!isTwoThumbsResize) rightHandLandmarks = null;

        if (leftHand) drawLandmarks(leftHand);
        if (rightHand) drawLandmarks(rightHand);

        if (leftHand && !isTwoThumbsResize) {
            const indexTip = leftHand[8]; const thumbTip = leftHand[4];
            const indexCanvasX = cW - (indexTip.x * cW); const indexCanvasY = indexTip.y * cH; // Mirrored X
            const thumbCanvasX = cW - (thumbTip.x * cW); const thumbCanvasY = thumbTip.y * cH; // Mirrored X
            const pinchDistance = distance(indexCanvasX, indexCanvasY, thumbCanvasX, thumbCanvasY);
            const pinchCenterX = (indexCanvasX + thumbCanvasX) / 2;
            const pinchCenterY = (indexCanvasY + thumbCanvasY) / 2;

            if (isTouchingCircle(pinchCenterX, pinchCenterY, selectedShape.x, selectedShape.y, selectedShape.radius)) {
                const minPinchDist = 20; const maxPinchDist = 150; // Adjusted for typical screen sizes
                const normalizedPinch = Math.max(0, Math.min(1, (pinchDistance - minPinchDist) / (maxPinchDist - minPinchDist)));
                const newSidesValue = MIN_SIDES + normalizedPinch * (MAX_SIDES - MIN_SIDES);

                if (Math.abs(newSidesValue - selectedShape.sides) > 0.5) { // Update if change is significant
                    const oldSidesCount = selectedShape.sides;
                    selectedShape.sides = Math.round(Math.min(Math.max(newSidesValue, MIN_SIDES), MAX_SIDES));
                    shapeSides = selectedShape.sides;
                    if (shapeSidesInput) shapeSidesInput.value = selectedShape.sides;

                    // Turn off notes for removed sides
                    if (midiEnabled && selectedShape.sides < oldSidesCount) {
                        const notesToTurnOff = {};
                        for (let k = selectedShape.sides; k < oldSidesCount; k++) {
                            if (selectedShape.activeNotes[k] && selectedShape.activeNotes[k].playing) {
                                notesToTurnOff[k] = { ...selectedShape.activeNotes[k] };
                            }
                        }
                        const origMidi = midiEnabled; midiEnabled = true; // Force enable for this operation
                        Object.keys(notesToTurnOff).forEach(edgeIdx => {
                            sendMidiNoteOff(notesToTurnOff[edgeIdx].note, selectedShape.midiChannel);
                            if (selectedShape.activeNotes[edgeIdx]) selectedShape.activeNotes[edgeIdx].playing = false;
                        });
                        midiEnabled = origMidi; // Restore previous state
                    }
                }
            }
        }
    } else if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        rightHandLandmarks = null; // Clear landmarks if no hands detected
    }
  }
  // No specific hand landmark processing for performance mode yet (beyond drawing them if present)

  // Clear canvas (or apply fade effect)
  if (ctx && cW && cH) {
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; // Fade effect
    ctx.fillRect(0, 0, cW, cH);
  }


  // Determine if pulsing is active for the current selected shape
  let currentOverallPulseActive = pulseModeActive || (demoModeActive && demoIsPulsing);
  let actualPulseCycleValue = 0;
  if (currentOverallPulseActive) {
    pulseTime = performance.now() * 0.001; // seconds
    actualPulseCycleValue = Math.sin(pulseTime * pulseFrequency * 2 * Math.PI); // Varies between -1 and 1
  }

  // Draw all shapes
  for (const shape of shapes) {
    let radiusToDraw = shape.radius;
    let isShapePulsing = currentOverallPulseActive && shape.isSelected; // Only selected shape pulses with global pulseMode
    if (demoModeActive && demoIsPulsing && shape.isSelected) isShapePulsing = true; // Or if demo is pulsing the selected shape

    if (isShapePulsing) {
      let pulseRadiusModifierFactor = 0.25 * actualPulseCycleValue; // e.g., up to 25% change
      radiusToDraw = shape.radius * (1 + pulseRadiusModifierFactor);
      radiusToDraw = Math.max(10, radiusToDraw); // Ensure radius doesn't go below 10
    }
    drawShape(shape, radiusToDraw, isShapePulsing, actualPulseCycleValue, demoAngle, demoIsDistorting && shape.isSelected);
  }

  // If output popup window is open, draw main canvas to it
  if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) {
    try {
      const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
      if (popupCanvas) {
        if (popupCanvas.width !== outputPopupWindow.innerWidth || popupCanvas.height !== outputPopupWindow.innerHeight) {
          popupCanvas.width = outputPopupWindow.innerWidth;
          popupCanvas.height = outputPopupWindow.innerHeight;
        }
        popupCanvasCtx.fillStyle = 'rgba(0,0,0,0.1)'; // Or clear if no fade desired in popup
        popupCanvasCtx.fillRect(0, 0, popupCanvas.width, popupCanvas.height);
        popupCanvasCtx.drawImage(canvasElement, 0, 0, popupCanvas.width, popupCanvas.height);
      }
    } catch (e) {
      // outputPopupWindow might have been closed by user, leading to security error
      // console.warn("Error updating popup window:", e);
      // Consider nullifying outputPopupWindow and popupCanvasCtx here if error persists
    }
  }
}


document.addEventListener('DOMContentLoaded', () => {
    // Assign DOM elements
    videoElement = document.getElementById('video');
    canvasElement = document.getElementById('canvas');
    infoButton = document.getElementById('info'); // Added declaration
    closeModalButton = document.getElementById('closeModal'); // Added declaration
    settingsButton = document.getElementById('settingsButton');
    settingsModal = document.getElementById('settingsModal');
    closeSettingsModalButton = document.getElementById('closeSettingsModal');
    midiOutputSelect = document.getElementById('midiOutputSelect');
    mouseSimToggle = document.getElementById('mouseSimToggle');
    resetMidiButton = document.getElementById('resetMidiButton');
    shapeSidesInput = document.getElementById('shapeSidesInput');
    musicalScaleSelect = document.getElementById('musicalScaleSelect');
    resetShapeButton = document.getElementById('resetShapeButton');
    openOutputPopupButton = document.getElementById('openOutputPopupButton');

    // Define canvas-dependent dynamic values
    centerX = () => canvasElement ? canvasElement.width / 2 : window.innerWidth / 2;
    centerY = () => canvasElement ? canvasElement.height / 2 : window.innerHeight / 2;


    if (canvasElement) {
        ctx = canvasElement.getContext('2d');
        canvasElement.addEventListener('contextmenu', (e) => e.preventDefault());

        // Initial resize and event listener for resize
        resizeCanvas(); // Call it once initially
        window.addEventListener('resize', resizeCanvas);

        // Define cW and cH after first resize
        cW = canvasElement.width;
        cH = canvasElement.height;

        // Mouse event listeners for canvas
        canvasElement.addEventListener('mousedown', (e) => {
            if (demoModeActive || !mouseControlsActive || !selectedShape) return;

            isDraggingShape = false; // Reset dragging state
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            if (performanceModeActive && e.button === 0) { // Left click in performance mode
                let clickedOnShape = false;
                // Iterate backwards to select topmost shape
                for (let i = shapes.length - 1; i >= 0; i--) {
                    const shape = shapes[i];
                    const dist = distance(e.clientX, e.clientY, shape.x, shape.y);
                    if (dist < shape.radius) {
                        if (selectedShape && selectedShape.id !== shape.id) {
                            selectedShape.isSelected = false; // Deselect previous
                        }
                        selectedShape = shape;
                        selectedShape.isSelected = true;
                        isDraggingShape = true;
                        dragOffsetX = e.clientX - selectedShape.x;
                        dragOffsetY = e.clientY - selectedShape.y;

                        // Sync global controls to the newly selected shape
                        circleRadius = selectedShape.radius;
                        shapeSides = selectedShape.sides;
                        if (shapeSidesInput) shapeSidesInput.value = selectedShape.sides;
                        // Potentially update other controls if they reflect selected shape state

                        clickedOnShape = true;
                        break;
                    }
                }
                if (clickedOnShape) {
                    isMouseDown = true; // Indicate mouse is pressed for dragging
                    e.preventDefault();
                    return; // Prevent further default actions or other handlers
                }
            }
            // If not dragging a new shape, or not in performance mode left-click, allow interaction with the current selected shape
            isMouseDown = true;
            isRightButton = (e.button === 2); // Check for right mouse button
            e.preventDefault();
        });

        canvasElement.addEventListener('mousemove', (e) => {
            if (demoModeActive || !mouseControlsActive) return;

            if (performanceModeActive && isDraggingShape && selectedShape && isMouseDown) {
                selectedShape.x = e.clientX - dragOffsetX;
                selectedShape.y = e.clientY - dragOffsetY;
                lastMouseX = e.clientX; // Update last mouse for continuous dragging
                lastMouseY = e.clientY;
                return; // Don't do other mouse interactions if dragging
            }

            // This part executes if not dragging a shape OR if not in performance mode dragging.
            if (!isMouseDown || !selectedShape) return; // Only if mouse is down and a shape is selected

            const currentMouseX = e.clientX;
            const currentMouseY = e.clientY;

            if (isRightButton) { // Right-click drag for radius
                const deltaY = currentMouseY - lastMouseY;
                selectedShape.radius -= deltaY * 0.5; // Adjust sensitivity as needed
                selectedShape.radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, selectedShape.radius));
                circleRadius = selectedShape.radius; // Sync global
            } else { // Left-click drag for sides (if not dragging shape itself)
                const deltaX = currentMouseX - lastMouseX;
                const oldSidesCount = selectedShape.sides;
                selectedShape.sides += deltaX * 0.1; // Adjust sensitivity
                selectedShape.sides = Math.round(Math.max(MIN_SIDES, Math.min(MAX_SIDES, selectedShape.sides)));
                shapeSides = selectedShape.sides; // Sync global

                if (shapeSidesInput) shapeSidesInput.value = selectedShape.sides;

                // Turn off notes for sides that no longer exist
                if (midiEnabled && selectedShape.sides < oldSidesCount) {
                    const notesToTurnOff = {};
                    for (let k = selectedShape.sides; k < oldSidesCount; k++) {
                        if (selectedShape.activeNotes[k] && selectedShape.activeNotes[k].playing) {
                            notesToTurnOff[k] = { ...selectedShape.activeNotes[k] };
                        }
                    }
                    const origMidi = midiEnabled; midiEnabled = true;
                    Object.keys(notesToTurnOff).forEach(edgeIdx => {
                        sendMidiNoteOff(notesToTurnOff[edgeIdx].note, selectedShape.midiChannel);
                        if (selectedShape.activeNotes[edgeIdx]) selectedShape.activeNotes[edgeIdx].playing = false;
                    });
                    midiEnabled = origMidi;
                }
            }
            lastMouseX = currentMouseX;
            lastMouseY = currentMouseY;
        });
    } else {
        console.error("Canvas element not found!");
    }

    // Initialize MediaPipe Hands
    hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
    hands.onResults(onResults);


    if (videoElement) {
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (videoElement) {
                    await hands.send({ image: videoElement });
                }
            },
            width: 640,
            height: 480
        });
        camera.start();
    } else {
        console.error("Video element not found!");
    }

    initShapes(); // Initialize default shape(s)

    // Setup UI interactions
    if (infoButton && infoModal) infoButton.addEventListener('click', () => infoModal.style.display = 'flex');
    if (closeModalButton && infoModal) closeModalButton.addEventListener('click', () => infoModal.style.display = 'none');

    if (settingsButton && settingsModal && closeSettingsModalButton) {
        settingsButton.addEventListener('click', () => {
            if (mouseSimToggle) mouseSimToggle.checked = mouseControlsActive;
            if (shapeSidesInput) shapeSidesInput.value = selectedShape ? selectedShape.sides : DEFAULT_SIDES;
            if (musicalScaleSelect) musicalScaleSelect.value = currentMusicalScale;
            settingsModal.style.display = 'flex';
        });
        closeSettingsModalButton.addEventListener('click', () => settingsModal.style.display = 'none');
    } else {
        console.error("Settings modal elements missing for full setup.");
    }

    if (mouseSimToggle) {
        mouseSimToggle.checked = mouseControlsActive; // Initialize checkbox state
        mouseSimToggle.addEventListener('change', () => {
            if (demoModeActive || performanceModeActive) { // Prevent change in these modes
                mouseSimToggle.checked = mouseControlsActive; // Revert
                return;
            }
            mouseControlsActive = mouseSimToggle.checked;
            console.log("Mouse controls active:", mouseControlsActive);
            if (!mouseControlsActive) isMouseDown = false; // Reset mouse state if controls disabled
        });
    }

    if (resetMidiButton) {
        resetMidiButton.addEventListener('click', () => {
            console.log("Resetting all MIDI notes.");
            turnOffAllActiveNotesGlobally();
        });
    }

    if (shapeSidesInput) {
        shapeSidesInput.value = selectedShape ? selectedShape.sides : DEFAULT_SIDES; // Initialize
        shapeSidesInput.addEventListener('change', () => {
            if (demoModeActive || !selectedShape) { // Prevent change if no shape selected or in demo
                if (selectedShape) shapeSidesInput.value = selectedShape.sides;
                else shapeSidesInput.value = DEFAULT_SIDES;
                return;
            }
            let newSides = parseInt(shapeSidesInput.value, 10);
            newSides = Math.round(Math.max(MIN_SIDES, Math.min(MAX_SIDES, newSides)));

            if (newSides !== selectedShape.sides) {
                const oldSidesCount = selectedShape.sides;
                selectedShape.sides = newSides;
                shapeSides = newSides; // Sync global

                // Turn off notes for sides that no longer exist
                if (midiEnabled && newSides < oldSidesCount) {
                     const notesToTurnOff = {};
                    for (let k = newSides; k < oldSidesCount; k++) {
                        if (selectedShape.activeNotes[k] && selectedShape.activeNotes[k].playing) {
                            notesToTurnOff[k] = { ...selectedShape.activeNotes[k] };
                        }
                    }
                    const origMidi = midiEnabled; midiEnabled = true;
                    Object.keys(notesToTurnOff).forEach(edgeIdx => {
                        sendMidiNoteOff(notesToTurnOff[edgeIdx].note, selectedShape.midiChannel);
                        if (selectedShape.activeNotes[edgeIdx]) selectedShape.activeNotes[edgeIdx].playing = false;
                    });
                    midiEnabled = origMidi;
                }
                shapeSidesInput.value = newSides; // Update input field to clamped value
                console.log(`Shape ${selectedShape.id} sides changed to:`, newSides);
            }
        });
    }

    if (musicalScaleSelect) {
        musicalScaleSelect.value = currentMusicalScale; // Initialize
        musicalScaleSelect.addEventListener('change', () => {
            if (demoModeActive) { // Prevent change in demo mode
                musicalScaleSelect.value = currentMusicalScale; // Revert
                return;
            }
            currentMusicalScale = musicalScaleSelect.value;
            console.log("Musical scale changed to:", currentMusicalScale);
            turnOffAllActiveNotesGlobally(); // Turn off notes as they might not fit new scale
        });
    }

    if (resetShapeButton) {
        resetShapeButton.addEventListener('click', () => {
            if (demoModeActive) return; // No reset in demo mode

            console.log("Resetting shape(s) to default.");
            if (performanceModeActive) {
                shapes.forEach(s => {
                    s.radius = DEFAULT_RADIUS;
                    s.sides = DEFAULT_SIDES;
                    // s.x, s.y remain, or reset them too if desired
                });
                if (selectedShape) { // Sync globals if a shape is selected
                    circleRadius = selectedShape.radius;
                    shapeSides = selectedShape.sides;
                    if (shapeSidesInput) shapeSidesInput.value = selectedShape.sides;
                }
                turnOffAllActiveNotesGlobally();
            } else if (selectedShape) { // Single shape mode
                selectedShape.radius = DEFAULT_RADIUS;
                selectedShape.sides = DEFAULT_SIDES;
                // selectedShape.x = centerX(); // Optionally reset position
                // selectedShape.y = centerY();
                circleRadius = DEFAULT_RADIUS; // Sync global
                shapeSides = DEFAULT_SIDES;   // Sync global
                if (shapeSidesInput) shapeSidesInput.value = DEFAULT_SIDES;
                turnOffAllActiveNotesForShape(selectedShape);
            }
        });
    }

    if (midiOutputSelect) {
        // Event listener for MIDI output selection
        midiOutputSelect.addEventListener('change', () => {
            const selectedId = midiOutputSelect.value;
            if (availableMidiOutputs.has(selectedId)) {
                midiOutput = availableMidiOutputs.get(selectedId);
                console.log("MIDI Output changed to:", midiOutput.name);
                turnOffAllActiveNotesGlobally(); // Turn off notes when changing output
            } else {
                console.warn("Selected MIDI Output ID not found:", selectedId);
                midiOutput = null;
            }
        });
    }
    initMidi(); // Initialize MIDI after DOM is ready and midiOutputSelect is available


    if (openOutputPopupButton) {
        openOutputPopupButton.addEventListener('click', () => {
            if (outputPopupWindow && !outputPopupWindow.closed) {
                outputPopupWindow.focus();
            } else {
                outputPopupWindow = window.open('', 'OutputVisualizerWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
                if (outputPopupWindow) {
                    outputPopupWindow.document.write(`
                        <!DOCTYPE html><html lang="en">
                        <head><meta charset="UTF-8"><title>Visual Output</title>
                        <style>body { margin: 0; overflow: hidden; background: #111; display: flex; justify-content: center; align-items: center; } canvas { display: block; width: 100%; height: 100%; }</style>
                        </head><body><canvas id="popupCanvas"></canvas></body></html>
                    `);
                    outputPopupWindow.document.close(); // Important to close document for writing

                    const popupCanvasElement = outputPopupWindow.document.getElementById('popupCanvas');
                    if (popupCanvasElement) {
                        popupCanvasCtx = popupCanvasElement.getContext('2d');
                        // Initial size sync
                        popupCanvasElement.width = outputPopupWindow.innerWidth;
                        popupCanvasElement.height = outputPopupWindow.innerHeight;
                    } else {
                        console.error("Could not find canvas in popup window after creation.");
                        outputPopupWindow.close(); // Close if canvas not found
                        outputPopupWindow = null;
                    }
                    outputPopupWindow.addEventListener('beforeunload', () => {
                        console.log("Popup window closing.");
                        popupCanvasCtx = null; // Clean up context
                        outputPopupWindow = null; // Clean up window reference
                    });
                } else {
                    console.error("Failed to open popup window. Check browser popup blocker.");
                }
            }
        });
    } else {
        console.error("Open Output Popup Button not found.");
    }

    // Global event listeners (can be outside specific element checks if general)
    document.addEventListener('keydown', (e) => {
        // Ensure shapeSidesInput is defined before trying to access its properties
        // This is now safe as shapeSidesInput is defined within DOMContentLoaded
        if (e.key === 'd' || e.key === 'D') {
            if (performanceModeActive) return; // Demo mode not available in performance mode
            demoModeActive = !demoModeActive;
            if (demoModeActive) {
                console.log("Demo Mode ACTIVATED");
                demoAngle = 0; demoPulseTimer = 0; demoDistortionTimer = 0;
                demoIsPulsing = false; demoIsDistorting = false;
                if (selectedShape) { // Reset current selected shape to defaults for demo
                    selectedShape.radius = DEFAULT_RADIUS;
                    selectedShape.sides = DEFAULT_SIDES;
                    circleRadius = DEFAULT_RADIUS; // Sync globals
                    shapeSides = DEFAULT_SIDES;
                    if (shapeSidesInput) shapeSidesInput.value = DEFAULT_SIDES;
                } else {
                    initShapes(); // Or re-init if no shape selected
                }
                turnOffAllActiveNotesGlobally();
            } else {
                console.log("Demo Mode DEACTIVATED");
                demoIsPulsing = false; demoIsDistorting = false;
                if (pulseModeActive && demoPulseTimer > 0) pulseModeActive = false; // If demo was pulsing, stop it
                rightHandLandmarks = null; // Clear demo-induced landmarks
                turnOffAllActiveNotesGlobally();
            }
            return; // Prevent other keydown actions for 'd'
        }

        if (e.key === 'e' || e.key === 'E') {
            if (demoModeActive) return; // Performance mode not available in demo mode
            performanceModeActive = !performanceModeActive;
            turnOffAllActiveNotesGlobally(); // Reset notes on mode change

            if (performanceModeActive) {
                console.log("Performance Mode ACTIVATED");
                shapes = []; // Clear existing shapes
                selectedShape = null;
                const positions = [
                    { x: centerX(), y: centerY() - (cH || window.innerHeight) * 0.25 },
                    { x: centerX() - (cW || window.innerWidth) * 0.25, y: centerY() + (cH || window.innerHeight) * 0.15 },
                    { x: centerX() + (cW || window.innerWidth) * 0.25, y: centerY() + (cH || window.innerHeight) * 0.15 }
                ];
                const colors = ['#FF69B4', '#20B2AA', '#FFD700']; // HotPink, LightSeaGreen, Gold

                for (let i = 0; i < MAX_SHAPES; i++) {
                    const newShape = {
                        id: i,
                        x: positions[i % positions.length].x,
                        y: positions[i % positions.length].y,
                        radius: DEFAULT_RADIUS * 0.8, // Slightly smaller
                        sides: DEFAULT_SIDES,
                        midiChannel: MIDI_CHANNELS[i % MIDI_CHANNELS.length],
                        activeNotes: {},
                        rotationAngle: Math.random() * Math.PI * 2, // Random initial rotation
                        color: colors[i % colors.length],
                        liquifyPoints: null, // Or initialize if needed
                        isSelected: (i === 0) // Select the first shape by default
                    };
                    shapes.push(newShape);
                    if (i === 0) selectedShape = newShape;
                }
                if (selectedShape) { // Sync globals to the first selected shape
                    circleRadius = selectedShape.radius;
                    shapeSides = selectedShape.sides;
                    if (shapeSidesInput) shapeSidesInput.value = selectedShape.sides;
                }
            } else {
                console.log("Performance Mode DEACTIVATED");
                initShapes(); // Revert to single, default shape
                if (selectedShape) { // Sync globals
                    circleRadius = selectedShape.radius;
                    shapeSides = selectedShape.sides;
                    if (shapeSidesInput) shapeSidesInput.value = selectedShape.sides;
                }
            }
            return;
        }

        if (demoModeActive) return; // No other keyboard controls in demo mode

        if (e.key === '+') { if (selectedShape) { selectedShape.radius = Math.min(selectedShape.radius + 10, MAX_RADIUS); circleRadius = selectedShape.radius; } }
        if (e.key === '-') { if (selectedShape) { selectedShape.radius = Math.max(selectedShape.radius - 10, MIN_RADIUS); circleRadius = selectedShape.radius; } }
        if (e.key === 'p' || e.key === 'P') { pulseModeActive = !pulseModeActive; if (pulseModeActive) console.log("Pulse Mode ACTIVE"); else console.log("Pulse Mode INACTIVE"); pulseTime = 0; /* Reset pulse phase */ }
        if (e.key === 'm' || e.key === 'M') { midiEnabled = !midiEnabled; if (midiEnabled) console.log("MIDI ENABLED"); else { console.log("MIDI DISABLED"); turnOffAllActiveNotesGlobally(); } }
    });

    window.addEventListener('mouseup', (e) => {
        if (isMouseDown) isMouseDown = false;
        isDraggingShape = false; // Always reset dragging on mouse up
    });

    // Close modals if clicked outside content
    window.addEventListener('click', (e) => {
        if (infoModal && e.target === infoModal) infoModal.style.display = 'none';
        if (settingsModal && e.target === settingsModal) settingsModal.style.display = 'none';
    });

}); // End of DOMContentLoaded


// Function to resize canvas (needs to be defined before use in DOMContentLoaded if called early)
// but references canvasElement, so definition here is fine as it's called within DOMContentLoaded or by its event listener
function resizeCanvas() {
  if (canvasElement) {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    // Update cW, cH after resize for other functions that might use them
    cW = canvasElement.width;
    cH = canvasElement.height;
    // If shapes positions or sizes are relative to canvas, they might need updates here
    // For example, if shapes should always be centered:
    // if (selectedShape && !performanceModeActive) { // single shape mode
    //    selectedShape.x = centerX();
    //    selectedShape.y = centerY();
    // }
    // Performance mode shapes might also need repositioning if they are relative.
  }
}

// Make cW and cH initially undefined or set them in DOMContentLoaded after first resize.
// They are now set in DOMContentLoaded after resizeCanvas is called.
// const cW = canvasElement.width; (MOVED)
// const cH = canvasElement.height; (MOVED)
// initShapes(); // Called in DOMContentLoaded (MOVED)
