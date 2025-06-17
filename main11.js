'use strict';

// --- Imports ---
import * as Midi from './midi.js';
import * as UI from './ui.js';
import * as Drawing from './drawing.js';
import * as HandDetection from './handDetection.js';

// --- Global State Variables ---
let canvasElement, ctx;
let videoElement;

let circleRadius = 100;
let shapeSides = 100; // Default to circle, will be updated by hand gestures
let rightHandLandmarksForDistortion = null;
let pulseModeActive = false;
let pulseTime = 0;
const PULSE_FREQUENCY = 0.5; // cycles per second

// Sensitivity settings - will be updated by UI
let distortionSensitivity = 50; // Default, UI loads from localStorage
let sidesPrecision = 50;      // Default, UI loads from localStorage

let popupCanvasCtx = null;

// For MIDI rate limiting (10 fps = 100ms interval)
const MIDI_SEND_INTERVAL = 100; // ms
let lastMidiSendTimes = {}; // Updated structure: { edgeIndex: { pitchBend: timestamp, velocity: timestamp, noteOn: timestamp } }


// --- Initialization Function ---
function initApp() {
    videoElement = document.getElementById('video');
    canvasElement = document.getElementById('canvas');
    ctx = canvasElement.getContext('2d');

    Drawing.initDrawing(canvasElement);
    UI.resizeCanvas(canvasElement);

    const uiCallbacks = {
        onMidiOutputChange: (outputId) => {
            Midi.setMidiOutput(outputId);
            UI.saveMidiPortSetting(outputId);
        },
        onTogglePulseMode: () => {
            pulseModeActive = !pulseModeActive;
            UI.savePulseModeSetting(pulseModeActive);
            if (pulseModeActive) {
                pulseTime = 0;
                console.log("Pulse mode ACTIVE");
            } else {
                console.log("Pulse mode INACTIVE");
            }
        },
        onSensitivityChange: (type, value) => {
            if (type === 'distortion') distortionSensitivity = value;
            else if (type === 'sides') sidesPrecision = value;
        },
        onRequestReset: () => {
            resetState();
        }
    };
    // Store the callbacks in a way that handleKeyDown can access them if UI.initUI doesn't expose them directly
    // This is a workaround for the example's direct call in handleKeyDown. A better way is event emitters or shared state.
    initApp.uiCallbacks = uiCallbacks;
    UI.initUI(canvasElement, uiCallbacks);

    pulseModeActive = UI.loadPulseModeSetting(false);


    Midi.initMidi().then(success => {
        if (success) {
            console.log("MIDI initialized successfully from main.");
        } else {
            console.warn("MIDI initialization failed or not supported.");
        }
    });

    const handDetectionCallbacks = {
        onRadiusChange: (newRadius) => { circleRadius = newRadius; },
        onSidesChange: (newSides) => {
            if (newSides !== shapeSides) {
                if (Midi.isMidiEnabled() && newSides < shapeSides) {
                    for (let i = newSides; i < shapeSides; i++) {
                        const edgeKey = i.toString();
                        if (Midi.activeMidiNotes[edgeKey] && Midi.activeMidiNotes[edgeKey].playing) {
                            Midi.sendMidiNoteOff(Midi.activeMidiNotes[edgeKey].note, Midi.activeMidiNotes[edgeKey].channel);
                            Midi.activeMidiNotes[edgeKey].playing = false;
                        }
                        // Clean up rate limiting timestamps for removed sides
                        if (lastMidiSendTimes[edgeKey]) {
                            delete lastMidiSendTimes[edgeKey];
                        }
                    }
                }
                shapeSides = newSides;
            }
        },
        onRightHandUpdate: (landmarks) => { rightHandLandmarksForDistortion = landmarks; },
        getShapeParameters: () => ({
            radius: circleRadius,
            sides: shapeSides,
            canvasWidth: canvasElement.width,
            canvasHeight: canvasElement.height,
            cx: canvasElement.width / 2,
            cy: canvasElement.height / 2
        }),
        getSensitivitySettings: () => ({
            distortion: distortionSensitivity,
            sides: sidesPrecision
        })
    };
    HandDetection.initHandDetection(videoElement, canvasElement, handDetectionCallbacks);
    HandDetection.startHandDetection();

    window.addEventListener('resize', () => UI.resizeCanvas(canvasElement));
    document.addEventListener('keydown', handleKeyDown);

    requestAnimationFrame(animationLoop);
    console.log("main11.js initialized and animation loop started.");
}

// --- Animation Loop ---
function animationLoop(timestamp) {
    popupCanvasCtx = UI.getPopupCanvasContext();

    Drawing.clearCanvases(ctx, popupCanvasCtx, canvasElement, popupCanvasCtx ? popupCanvasCtx.canvas : null);

    let currentRadiusForShape = circleRadius;
    let currentPulseValue = 0;

    if (pulseModeActive) {
        pulseTime = timestamp * 0.001;
        currentPulseValue = Math.sin(pulseTime * PULSE_FREQUENCY * 2 * Math.PI);
    }

    const shapeDrawParams = {
        cx: canvasElement.width / 2,
        cy: canvasElement.height / 2,
        radius: currentRadiusForShape,
        sides: shapeSides,
        rightHandLandmarks: rightHandLandmarksForDistortion,
        distortionSensitivityFactor: distortionSensitivity / 50,
        pulseValue: currentPulseValue,
        isPulsing: pulseModeActive
    };

    const vertexDistortions = Drawing.drawShape(ctx, canvasElement.width, canvasElement.height, shapeDrawParams);

    if (popupCanvasCtx) {
        const popupShapeParams = { ...shapeDrawParams, cx: popupCanvasCtx.canvas.width / 2, cy: popupCanvasCtx.canvas.height / 2};
        Drawing.drawShape(popupCanvasCtx, popupCanvasCtx.canvas.width, popupCanvasCtx.canvas.height, popupShapeParams);
    }

    processMidiOutput(vertexDistortions, currentRadiusForShape, shapeSides, pulseModeActive, currentPulseValue, timestamp);

    requestAnimationFrame(animationLoop);
}

// --- MIDI Processing ---
function processMidiOutput(vertexDistortions, currentRadius, numSides, isPulsing, pulseVal, currentTime) {
    if (!Midi.isMidiEnabled() || numSides <= 0) {
        if (Object.keys(Midi.activeMidiNotes).length > 0) Midi.turnOffAllActiveNotes();
        // Clear all rate limiting timestamps when MIDI is disabled or no sides
        lastMidiSendTimes = {};
        return;
    }

    const baseVelocity = 30;
    const maxVelocity = 127;
    const radiusMin = 30;
    const radiusMax = 300;
    let calculatedVelocity = Math.max(0, Math.min(maxVelocity, Math.round(baseVelocity + (currentRadius - radiusMin) * ((maxVelocity - baseVelocity) / (radiusMax - radiusMin)))));

    if (isPulsing) {
        let pulseVelocityFactor = 0.6 + ((pulseVal + 1) / 2) * 0.4; // 0.6 to 1.0
        calculatedVelocity = Math.round(calculatedVelocity * pulseVelocityFactor);
        calculatedVelocity = Math.max(0, Math.min(maxVelocity, calculatedVelocity));
    }

    const newActiveNotesInternal = {}; // Tracks notes that should be active this frame for internal logic

    for (let i = 0; i < numSides; i++) {
        const edgeKey = i.toString();
        const note = Midi.getPentatonicNote(i);
        const distortionData = vertexDistortions.find(vd => vd.edgeIndex === i);
        let pitchBend = 8192; // Neutral

        if (distortionData && distortionData.displacementMagnitude > 0.5) {
            const maxObservedDistortion = 50.0 * (distortionSensitivity / 50);
            const pitchBendSensitivity = 2048;
            const bendAmount = Math.min(1.0, distortionData.displacementMagnitude / maxObservedDistortion) * pitchBendSensitivity;
            pitchBend = 8192 + Math.round(bendAmount);
            pitchBend = Math.max(0, Math.min(16383, pitchBend));
        }

        // Initialize rate limiting state for new edges
        if (!lastMidiSendTimes[edgeKey]) {
            lastMidiSendTimes[edgeKey] = { pitchBend: 0, velocity: 0, noteOn: 0 };
        }

        newActiveNotesInternal[edgeKey] = { note, channel: Midi.MIDI_CHANNEL, playing: true, currentVelocity: calculatedVelocity, currentPitchBend: pitchBend };

        if (Midi.activeMidiNotes[edgeKey] && Midi.activeMidiNotes[edgeKey].playing) {
            // Note is already playing, check for updates
            // Pitch Bend update (throttled)
            if (Math.abs(pitchBend - Midi.activeMidiNotes[edgeKey].lastPitchBend) > 10) {
                if (currentTime - lastMidiSendTimes[edgeKey].pitchBend > MIDI_SEND_INTERVAL) {
                    Midi.sendPitchBend(pitchBend, Midi.MIDI_CHANNEL);
                    lastMidiSendTimes[edgeKey].pitchBend = currentTime;
                }
            }
            Midi.activeMidiNotes[edgeKey].lastPitchBend = pitchBend; // Always update internal state

            // Velocity update (throttled, by re-sending Note ON)
            if (Math.abs(calculatedVelocity - Midi.activeMidiNotes[edgeKey].lastVelocity) > 15) {
                if (currentTime - lastMidiSendTimes[edgeKey].velocity > MIDI_SEND_INTERVAL) {
                    Midi.sendMidiNoteOn(note, calculatedVelocity, Midi.MIDI_CHANNEL);
                    lastMidiSendTimes[edgeKey].velocity = currentTime;
                }
            }
            Midi.activeMidiNotes[edgeKey].lastVelocity = calculatedVelocity; // Always update internal state
            Midi.activeMidiNotes[edgeKey].note = note; // Update note in case pentatonic scale changes (future)


        } else {
            // New note: send Note ON (not throttled)
            Midi.sendMidiNoteOn(note, calculatedVelocity, Midi.MIDI_CHANNEL);
            lastMidiSendTimes[edgeKey].noteOn = currentTime;
            lastMidiSendTimes[edgeKey].velocity = currentTime; // Set velocity time as well
            Midi.activeMidiNotes[edgeKey] = {
                note: note,
                channel: Midi.MIDI_CHANNEL,
                playing: true,
                lastVelocity: calculatedVelocity,
                lastPitchBend: pitchBend
            };
            if (pitchBend !== 8192) { // Send initial pitch bend if not neutral
                Midi.sendPitchBend(pitchBend, Midi.MIDI_CHANNEL);
                lastMidiSendTimes[edgeKey].pitchBend = currentTime;
            }
        }
    }

    // Turn off notes that are no longer active
    for (const edgeKey in Midi.activeMidiNotes) {
        if (Midi.activeMidiNotes[edgeKey].playing && !newActiveNotesInternal[edgeKey]) {
            Midi.sendMidiNoteOff(Midi.activeMidiNotes[edgeKey].note, Midi.activeMidiNotes[edgeKey].channel);
            Midi.activeMidiNotes[edgeKey].playing = false;
            // Clean up rate limiting timestamps for notes that are turned off
            if (lastMidiSendTimes[edgeKey]) {
                 delete lastMidiSendTimes[edgeKey];
            }
        }
    }
    // Update Midi.activeMidiNotes with the latest state from newActiveNotesInternal for notes that are still playing
    // And remove notes that were marked as not playing
    Object.keys(Midi.activeMidiNotes).forEach(key => {
        if (newActiveNotesInternal[key]) {
             // Update existing entry or ensure it's correctly set if it was a new note
            Midi.activeMidiNotes[key].lastVelocity = newActiveNotesInternal[key].currentVelocity;
            Midi.activeMidiNotes[key].lastPitchBend = newActiveNotesInternal[key].currentPitchBend;
            Midi.activeMidiNotes[key].playing = true; // Ensure it's marked as playing
        } else if (Midi.activeMidiNotes[key] && !Midi.activeMidiNotes[key].playing) {
            delete Midi.activeMidiNotes[key]; // Remove if marked not playing and not in newActive
        }
    });
}


// --- Event Handlers ---
function handleKeyDown(e) {
    if (e.key === '+' || e.key === '=') {
        circleRadius = Math.min(circleRadius + 10, 300);
    } else if (e.key === '-') {
        circleRadius = Math.max(circleRadius - 10, 30);
    } else if (e.key.toLowerCase() === 'm') {
        const isNowEnabled = Midi.toggleMidiEnabled();
        if (!isNowEnabled) {
            Midi.turnOffAllActiveNotes();
            lastMidiSendTimes = {}; // Reset timestamps when MIDI is disabled
        }
    } else if (e.key.toLowerCase() === 'p') {
        initApp.uiCallbacks.onTogglePulseMode(); // Call stored callback
    } else if (e.key.toLowerCase() === 'r') {
         initApp.uiCallbacks.onRequestReset(); // Call stored callback
    }
}

// --- Reset Function ---
function resetState() {
    circleRadius = 100;
    pulseModeActive = false;
    UI.savePulseModeSetting(pulseModeActive);

    Midi.turnOffAllActiveNotes();
    lastMidiSendTimes = {}; // Reset timestamps on reset
    // Send neutral pitch bend for all 16 channels (optional, good practice)
    // for (let i = 0; i < 16; i++) {
    //     Midi.sendPitchBend(8192, i);
    // }
    console.log("Application state reset.");
}

// --- Start Application ---
initApp();
