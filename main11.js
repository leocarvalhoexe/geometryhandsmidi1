'use strict';

// --- Imports ---
import * as Midi from './midi.js';
import * as UI from './ui.js';
import * as Drawing from './drawing.js';
import * as HandDetection from './handDetection.js';

// --- Constants ---
const INITIAL_CIRCLE_RADIUS = 100;
const INITIAL_SHAPE_SIDES = 100; // Circle

// --- Global State Variables ---
let canvasElement, ctx;
let videoElement;

let circleRadius = INITIAL_CIRCLE_RADIUS;
let shapeSides = INITIAL_SHAPE_SIDES;
let rightHandLandmarksForDistortion = null;
let pulseModeActive = false;
let pulseTime = 0;
const PULSE_FREQUENCY = 0.5; // cycles per second

// Sensitivity settings - will be updated by UI
let distortionSensitivity = 50;
let sidesPrecision = 50;

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
        lastMidiSendTimes = {};
        return;
    }

    const baseVelocity = 30;
    const maxVelocity = 127;
    const radiusMin = 30;
    const radiusMax = 300;
    let calculatedVelocity = Math.max(0, Math.min(maxVelocity, Math.round(baseVelocity + (currentRadius - radiusMin) * ((maxVelocity - baseVelocity) / (radiusMax - radiusMin)))));

    if (isPulsing) {
        let pulseVelocityFactor = 0.6 + ((pulseVal + 1) / 2) * 0.4;
        calculatedVelocity = Math.round(calculatedVelocity * pulseVelocityFactor);
        calculatedVelocity = Math.max(0, Math.min(maxVelocity, calculatedVelocity));
    }

    const newActiveNotesInternal = {};

    for (let i = 0; i < numSides; i++) {
        const edgeKey = i.toString();
        const note = Midi.getPentatonicNote(i);
        const distortionData = vertexDistortions.find(vd => vd.edgeIndex === i);
        let pitchBend = 8192;

        if (distortionData && distortionData.displacementMagnitude > 0.5) {
            const maxObservedDistortion = 50.0 * (distortionSensitivity / 50);
            const pitchBendSensitivity = 2048;
            const bendAmount = Math.min(1.0, distortionData.displacementMagnitude / maxObservedDistortion) * pitchBendSensitivity;
            pitchBend = 8192 + Math.round(bendAmount);
            pitchBend = Math.max(0, Math.min(16383, pitchBend));
        }

        if (!lastMidiSendTimes[edgeKey]) {
            lastMidiSendTimes[edgeKey] = { pitchBend: 0, velocity: 0, noteOn: 0 };
        }

        newActiveNotesInternal[edgeKey] = { note, channel: Midi.MIDI_CHANNEL, playing: true, currentVelocity: calculatedVelocity, currentPitchBend: pitchBend };

        if (Midi.activeMidiNotes[edgeKey] && Midi.activeMidiNotes[edgeKey].playing) {
            if (Math.abs(pitchBend - Midi.activeMidiNotes[edgeKey].lastPitchBend) > 10) {
                if (currentTime - lastMidiSendTimes[edgeKey].pitchBend > MIDI_SEND_INTERVAL) {
                    Midi.sendPitchBend(pitchBend, Midi.MIDI_CHANNEL);
                    lastMidiSendTimes[edgeKey].pitchBend = currentTime;
                }
            }
            Midi.activeMidiNotes[edgeKey].lastPitchBend = pitchBend;

            if (Math.abs(calculatedVelocity - Midi.activeMidiNotes[edgeKey].lastVelocity) > 15) {
                if (currentTime - lastMidiSendTimes[edgeKey].velocity > MIDI_SEND_INTERVAL) {
                    Midi.sendMidiNoteOn(note, calculatedVelocity, Midi.MIDI_CHANNEL);
                    lastMidiSendTimes[edgeKey].velocity = currentTime;
                }
            }
            Midi.activeMidiNotes[edgeKey].lastVelocity = calculatedVelocity;
            Midi.activeMidiNotes[edgeKey].note = note;


        } else {
            Midi.sendMidiNoteOn(note, calculatedVelocity, Midi.MIDI_CHANNEL);
            lastMidiSendTimes[edgeKey].noteOn = currentTime;
            lastMidiSendTimes[edgeKey].velocity = currentTime;
            Midi.activeMidiNotes[edgeKey] = {
                note: note,
                channel: Midi.MIDI_CHANNEL,
                playing: true,
                lastVelocity: calculatedVelocity,
                lastPitchBend: pitchBend
            };
            if (pitchBend !== 8192) {
                Midi.sendPitchBend(pitchBend, Midi.MIDI_CHANNEL);
                lastMidiSendTimes[edgeKey].pitchBend = currentTime;
            }
        }
    }

    for (const edgeKey in Midi.activeMidiNotes) {
        if (Midi.activeMidiNotes[edgeKey].playing && !newActiveNotesInternal[edgeKey]) {
            Midi.sendMidiNoteOff(Midi.activeMidiNotes[edgeKey].note, Midi.activeMidiNotes[edgeKey].channel);
            Midi.activeMidiNotes[edgeKey].playing = false;
            if (lastMidiSendTimes[edgeKey]) {
                 delete lastMidiSendTimes[edgeKey];
            }
        }
    }
    Object.keys(Midi.activeMidiNotes).forEach(key => {
        if (newActiveNotesInternal[key]) {
            Midi.activeMidiNotes[key].lastVelocity = newActiveNotesInternal[key].currentVelocity;
            Midi.activeMidiNotes[key].lastPitchBend = newActiveNotesInternal[key].currentPitchBend;
            Midi.activeMidiNotes[key].playing = true;
        } else if (Midi.activeMidiNotes[key] && !Midi.activeMidiNotes[key].playing) {
            delete Midi.activeMidiNotes[key];
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
            lastMidiSendTimes = {};
        }
    } else if (e.key.toLowerCase() === 'p') {
        initApp.uiCallbacks.onTogglePulseMode();
    } else if (e.key.toLowerCase() === 'r') {
         initApp.uiCallbacks.onRequestReset();
    }
}

// --- Reset Function ---
function resetState() {
    circleRadius = INITIAL_CIRCLE_RADIUS;
    shapeSides = INITIAL_SHAPE_SIDES;
    pulseModeActive = false;
    rightHandLandmarksForDistortion = null;
    UI.savePulseModeSetting(pulseModeActive);

    Midi.turnOffAllActiveNotes();
    lastMidiSendTimes = {};

    // Send neutral pitch bend on the primary MIDI channel
    if (Midi.isMidiEnabled()) { // Only if MIDI is enabled
        Midi.sendPitchBend(8192, Midi.MIDI_CHANNEL);
    }

    console.log("Application state reset.");
}

// --- Start Application ---
initApp();
