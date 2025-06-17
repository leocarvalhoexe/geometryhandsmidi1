'use strict';

import { getAvailableMidiOutputs, setMidiOutput as setMidiOutputInCore, getSelectedMidiOutput } from './midi.js';

// DOM Elements
let canvasElement = null; // Main canvas, will be passed during init
let infoButton, infoModal, closeModalButton;
let settingsButton, settingsModal, closeSettingsModalButton;
let midiOutputSelect;
let openOutputPopupButton;
let distortionSensitivitySlider, distortionSensitivityValueSpan;
let sidesPrecisionSlider, sidesPrecisionValueSpan;

// Popup window state
let outputPopupWindow = null;
let popupCanvasCtx = null;

// Callbacks to main module
let coreCallbacks = {
    onMidiOutputChange: (outputId) => {},
    onTogglePulseMode: () => {}, // Will be called by a keydown listener in main
    onSensitivityChange: (type, value) => {},
    onRequestReset: () => {}, // Will be called by a keydown listener in main
    onMidiToggle: () => {}, // Will be called by a keydown listener in main
};

const LS_KEYS = {
    MIDI_OUTPUT: 'midiOutputId',
    PULSE_MODE: 'pulseModeActive',
    DISTORTION_SENSITIVITY: 'distortionSensitivity',
    SIDES_PRECISION: 'sidesPrecision'
};

// --- Private Functions ---

function _saveSetting(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn(`Failed to save setting ${key}:`, e);
    }
}

function _loadSetting(key, defaultValue) {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? JSON.parse(value) : defaultValue;
    } catch (e) {
        console.warn(`Failed to load setting ${key}:`, e);
        return defaultValue;
    }
}

function _populateMidiOutputSelectUI() {
    const availableOutputs = getAvailableMidiOutputs(); // From midi.js
    const selectedOutputId = getSelectedMidiOutput()?.id || _loadSetting(LS_KEYS.MIDI_OUTPUT, null);

    midiOutputSelect.innerHTML = ''; // Clear existing options

    if (availableOutputs.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'Nenhuma porta MIDI encontrada';
        option.disabled = true;
        midiOutputSelect.appendChild(option);
        return;
    }

    availableOutputs.forEach(output => {
        const option = document.createElement('option');
        option.value = output.id;
        option.textContent = output.name;
        if (output.id === selectedOutputId) {
            option.selected = true;
        }
        midiOutputSelect.appendChild(option);
    });

    // Ensure core midi module is also updated if a selection was made from localStorage
    if (selectedOutputId && availableOutputs.some(o => o.id === selectedOutputId)) {
         setMidiOutputInCore(selectedOutputId); // Update midi.js state
    } else if (availableOutputs.length > 0) {
        // If no valid selection or nothing in local storage, select the first one
        const firstOutputId = availableOutputs[0].id;
        midiOutputSelect.value = firstOutputId;
        setMidiOutputInCore(firstOutputId);
        _saveSetting(LS_KEYS.MIDI_OUTPUT, firstOutputId);
    } else {
        // No outputs available and nothing selected
        setMidiOutputInCore(null); // Ensure midi.js knows no output is selected
    }
}

function _initSliders() {
    if (distortionSensitivitySlider && sidesPrecisionSlider) {
        const initialDistortion = _loadSetting(LS_KEYS.DISTORTION_SENSITIVITY, 50);
        distortionSensitivitySlider.value = initialDistortion;
        distortionSensitivityValueSpan.textContent = initialDistortion;
        coreCallbacks.onSensitivityChange('distortion', initialDistortion);


        distortionSensitivitySlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value, 10);
            distortionSensitivityValueSpan.textContent = value;
            coreCallbacks.onSensitivityChange('distortion', value);
            _saveSetting(LS_KEYS.DISTORTION_SENSITIVITY, value);
        });

        const initialSides = _loadSetting(LS_KEYS.SIDES_PRECISION, 50);
        sidesPrecisionSlider.value = initialSides;
        sidesPrecisionValueSpan.textContent = initialSides;
        coreCallbacks.onSensitivityChange('sides', initialSides);

        sidesPrecisionSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value, 10);
            sidesPrecisionValueSpan.textContent = value;
            coreCallbacks.onSensitivityChange('sides', value);
            _saveSetting(LS_KEYS.SIDES_PRECISION, value);
        });
    }
}


// --- Exported Functions ---

export function initUI(mainCanvasElement, callbacksObj) {
    canvasElement = mainCanvasElement; // Store reference to the main canvas
    coreCallbacks = { ...coreCallbacks, ...callbacksObj };

    // Query DOM elements
    infoButton = document.getElementById('info');
    infoModal = document.getElementById('infoModal');
    closeModalButton = document.getElementById('closeModal');
    settingsButton = document.getElementById('settingsButton');
    settingsModal = document.getElementById('settingsModal');
    closeSettingsModalButton = document.getElementById('closeSettingsModal');
    midiOutputSelect = document.getElementById('midiOutputSelect');
    openOutputPopupButton = document.getElementById('openOutputPopupButton');

    distortionSensitivitySlider = document.getElementById('distortionSensitivity');
    distortionSensitivityValueSpan = document.getElementById('distortionSensitivityValue');
    sidesPrecisionSlider = document.getElementById('sidesPrecision');
    sidesPrecisionValueSpan = document.getElementById('sidesPrecisionValue');

    // Event Listeners for Modals
    if (infoButton) infoButton.addEventListener('click', () => infoModal.style.display = 'flex');
    if (closeModalButton) closeModalButton.addEventListener('click', () => infoModal.style.display = 'none');
    if (settingsButton) settingsButton.addEventListener('click', () => {
        _populateMidiOutputSelectUI(); // Refresh list every time settings is opened
        settingsModal.style.display = 'flex';
    });
    if (closeSettingsModalButton) closeSettingsModalButton.addEventListener('click', () => settingsModal.style.display = 'none');

    window.addEventListener('click', (event) => {
        if (event.target === infoModal) infoModal.style.display = 'none';
        if (event.target === settingsModal) settingsModal.style.display = 'none';
    });

    // MIDI Output Select
    if (midiOutputSelect) {
        midiOutputSelect.addEventListener('change', () => {
            const selectedId = midiOutputSelect.value;
            coreCallbacks.onMidiOutputChange(selectedId); // This will call setMidiOutputInCore and save
        });
    }

    // Output Popup Button
    if (openOutputPopupButton) {
        openOutputPopupButton.addEventListener('click', () => {
            if (outputPopupWindow && !outputPopupWindow.closed) {
                outputPopupWindow.focus();
            } else {
                outputPopupWindow = window.open('', 'OutputWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
                if (outputPopupWindow) {
                    outputPopupWindow.document.write(`
                        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Visual Output</title><style>body{margin:0;overflow:hidden;background:#111;display:flex;justify-content:center;align-items:center;}canvas{display:block;width:100%;height:100%;}</style></head><body><canvas id="popupCanvas"></canvas></body></html>
                    `);
                    outputPopupWindow.document.close(); // Important to close document stream

                    const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
                    if (popupCanvas) {
                        popupCanvasCtx = popupCanvas.getContext('2d');
                        // Initial size - might need adjustment if window is not yet sized
                        popupCanvas.width = outputPopupWindow.innerWidth || 640;
                        popupCanvas.height = outputPopupWindow.innerHeight || 480;
                    } else {
                        console.error("Could not find 'popupCanvas' in the new window.");
                        popupCanvasCtx = null; // Ensure it's null if canvas isn't found
                        outputPopupWindow.close();
                        outputPopupWindow = null;
                    }
                    outputPopupWindow.addEventListener('beforeunload', () => {
                        popupCanvasCtx = null;
                        outputPopupWindow = null; // Clear reference
                    });
                } else {
                    console.error("Failed to open output popup window. Popups might be blocked.");
                }
            }
        });
    }

    _initSliders();
    _populateMidiOutputSelectUI(); // Initial population

    // Initial load of pulse mode setting (main11.js will handle the actual state)
    // const savedPulseMode = _loadSetting(LS_KEYS.PULSE_MODE, false);
    // if (savedPulseMode) coreCallbacks.onTogglePulseMode(); // Request main to toggle if saved as true

    console.log("ui.js initialized");
}

export function resizeCanvas(targetCanvas) {
    if (targetCanvas) {
        targetCanvas.width = window.innerWidth;
        targetCanvas.height = window.innerHeight;
    }
}

export function getPopupCanvasContext() {
    // Ensure the popup canvas is correctly sized before returning context
    if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) {
        const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
        if (popupCanvas) {
             // Check and resize if necessary - this might be better handled in a draw loop or resize event for the popup
            if (popupCanvas.width !== outputPopupWindow.innerWidth || popupCanvas.height !== outputPopupWindow.innerHeight) {
                if (outputPopupWindow.innerWidth > 0 && outputPopupWindow.innerHeight > 0) {
                    popupCanvas.width = outputPopupWindow.innerWidth;
                    popupCanvas.height = outputPopupWindow.innerHeight;
                }
            }
        } else {
            popupCanvasCtx = null; // Canvas no longer exists
        }
    }
    return popupCanvasCtx;
}

// This function is kept if manual content update via JS is needed,
// but the task description opted for direct HTML modification.
export function updateManualContent() {
    console.log("Manual content update requested (but changes are now in HTML directly).");
}


// Functions for main to call on setting changes not directly triggered by UI elements (e.g., key presses)
export function saveMidiPortSetting(outputId) {
    _saveSetting(LS_KEYS.MIDI_OUTPUT, outputId);
}

export function savePulseModeSetting(isPulseActive) {
    _saveSetting(LS_KEYS.PULSE_MODE, isPulseActive);
}

export function loadPulseModeSetting(defaultValue) {
    return _loadSetting(LS_KEYS.PULSE_MODE, defaultValue);
}

// No direct key listeners here, main.js will handle them and call appropriate functions
// e.g., coreCallbacks.onMidiToggle() which would be connected to toggleMidiEnabled in midi.js

console.log("ui.js loaded");
