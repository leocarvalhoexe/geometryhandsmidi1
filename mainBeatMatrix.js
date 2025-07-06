document.addEventListener('DOMContentLoaded', () => {
    // --- Global Variables & State ---
    let audioCtx;
    let simpleSynth;

    let bpm = 120;
    let numRows = 4;
    let numCols = 8;
    let padSize = 50;
    let baseMIDINote = 36; // C2
    let noteDuration = 150; // ms, for sequencer triggered notes

    let isPlaying = false;
    let currentColumn = 0;
    let timerId = null;
    const pads = []; // Array to store pad DOM elements and their state

    // --- DOM Element References ---
    const playStopButton = document.getElementById('play-stop-button');
    const bpmSlider = document.getElementById('bpm-slider');
    const bpmValueDisplay = document.getElementById('bpm-value');

    const rowsSlider = document.getElementById('rows-slider');
    const rowsValueDisplay = document.getElementById('rows-value');
    const colsSlider = document.getElementById('cols-slider');
    const colsValueDisplay = document.getElementById('cols-value');
    const padSizeSlider = document.getElementById('pad-size-slider');
    const padSizeValueDisplay = document.getElementById('pad-size-value');

    const gridElement = document.getElementById('grid');

    // Synth controls
    const waveformSelect = document.getElementById('waveform-select');
    const masterVolumeSlider = document.getElementById('master-volume-slider');
    const masterVolumeValueDisplay = document.getElementById('master-volume-value');
    const attackSlider = document.getElementById('attack-slider');
    const attackValueDisplay = document.getElementById('attack-value');
    const decaySlider = document.getElementById('decay-slider');
    const decayValueDisplay = document.getElementById('decay-value');
    const sustainSlider = document.getElementById('sustain-slider');
    const sustainValueDisplay = document.getElementById('sustain-value');
    const releaseSlider = document.getElementById('release-slider');
    const releaseValueDisplay = document.getElementById('release-value');
    const distortionSlider = document.getElementById('distortion-slider');
    const distortionValueDisplay = document.getElementById('distortion-value');
    const filterCutoffSlider = document.getElementById('filter-cutoff-slider');
    const filterCutoffValueDisplay = document.getElementById('filter-cutoff-value');
    const filterResonanceSlider = document.getElementById('filter-resonance-slider');
    const filterResonanceValueDisplay = document.getElementById('filter-resonance-value');
    const delayTimeSlider = document.getElementById('delay-time-slider');
    const delayTimeValueDisplay = document.getElementById('delay-time-value');
    const delayFeedbackSlider = document.getElementById('delay-feedback-slider');
    const delayFeedbackValueDisplay = document.getElementById('delay-feedback-value');
    const reverbMixSlider = document.getElementById('reverb-mix-slider');
    const reverbMixValueDisplay = document.getElementById('reverb-mix-value');


    // --- Initialization ---
    function initAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                simpleSynth = new SimpleSynth(audioCtx);
                console.log("AudioContext and SimpleSynth initialized.");
                applyAllSynthParameters(); // Apply initial values from sliders
            } catch (e) {
                console.error("Error initializing AudioContext or SimpleSynth:", e);
                alert("Could not initialize audio. Your browser might not support the Web Audio API.");
                return false;
            }
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => console.log("AudioContext resumed."));
        }
        return true;
    }

    function updateMatrix() {
        if (!gridElement) {
            console.error("Grid element not found!");
            return;
        }
        gridElement.innerHTML = ''; // Clear old pads
        pads.length = 0; // Clear the pads array

        gridElement.style.gridTemplateColumns = `repeat(${numCols}, ${padSize}px)`;
        gridElement.style.gridTemplateRows = `repeat(${numRows}, ${padSize}px)`;
        gridElement.style.gap = `5px`;


        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                const padElement = document.createElement('div');
                padElement.classList.add('pad');
                padElement.style.width = `${padSize}px`;
                padElement.style.height = `${padSize}px`;

                // Calculate MIDI note: Higher rows = higher pitch
                // Notes increase from bottom to top, left to right
                const note = baseMIDINote + (numRows - 1 - r) * 5 + c; // Example mapping, can be tuned

                const padData = {
                    element: padElement,
                    row: r,
                    col: c,
                    note: note,
                    active: false
                };

                padElement.addEventListener('click', () => {
                    if (!initAudio()) return; // Ensure audio is ready
                    triggerPad(padData);
                });

                pads.push(padData);
                gridElement.appendChild(padElement);
            }
        }
        // If sequencer is playing, might need to reset currentColumn if numCols changed
        if (isPlaying && currentColumn >= numCols) {
            currentColumn = 0;
        }
    }

    function triggerPad(padData) {
        padData.active = !padData.active;
        padData.element.classList.toggle('active', padData.active);

        if (simpleSynth) {
            if (padData.active) {
                // Manually triggered pads play with full ADSR defined in synth
                // Velocity can be fixed or dynamic if we add velocity sensitivity later
                simpleSynth.noteOn(padData.note, 100);
            } else {
                // When manually deactivating, we want the note to stop according to release phase
                simpleSynth.noteOff(padData.note);
            }
        }
    }

    // --- Sequencer Logic ---
    function stepSequencer() {
        pads.forEach(pad => pad.element.classList.remove('sequencer-column-indicator'));

        if (numCols === 0) return; // Avoid issues if cols is 0

        for (let r = 0; r < numRows; r++) {
            const padIndex = r * numCols + currentColumn;
            if (pads[padIndex]) {
                const padData = pads[padIndex];
                padData.element.classList.add('sequencer-column-indicator');
                if (padData.active && simpleSynth) {
                    simpleSynth.noteOn(padData.note, 100); // Velocity 100 for sequencer
                    // Schedule noteOff for sequencer notes
                    setTimeout(() => {
                        if (simpleSynth && padData.active) { // Check if pad is still active for short note behavior
                           // simpleSynth.noteOff(padData.note); // This would cut sustain/release for held notes.
                                                             // For now, let manual clicks handle noteOff for sustain/release.
                                                             // Sequencer will retrigger. If we want short staccato notes from sequencer:
                           simpleSynth.noteOff(padData.note);
                        }
                    }, noteDuration);
                }
            }
        }
        currentColumn = (currentColumn + 1) % numCols;
    }

    function togglePlayback() {
        if (!initAudio()) return; // Ensure audio is ready

        isPlaying = !isPlaying;
        if (isPlaying) {
            playStopButton.textContent = 'Stop';
            currentColumn = 0; // Reset to start
            const columnInterval = 60000 / bpm;
            if (timerId) clearInterval(timerId);
            timerId = setInterval(stepSequencer, columnInterval);
            stepSequencer(); // Play the first step immediately
        } else {
            playStopButton.textContent = 'Play';
            if (timerId) clearInterval(timerId);
            timerId = null;
            pads.forEach(pad => pad.element.classList.remove('sequencer-column-indicator'));
            if (simpleSynth) simpleSynth.allNotesOff(); // Stop all sounding notes
        }
    }

    // --- Event Listeners for Controls ---
    playStopButton.addEventListener('click', togglePlayback);

    bpmSlider.addEventListener('input', (e) => {
        bpm = parseInt(e.target.value);
        bpmValueDisplay.textContent = bpm;
        if (isPlaying) { // Reschedule if playing
            togglePlayback(); // Stop
            togglePlayback(); // Start with new BPM
        }
    });

    rowsSlider.addEventListener('input', (e) => {
        numRows = parseInt(e.target.value);
        rowsValueDisplay.textContent = numRows;
        updateMatrix();
    });

    colsSlider.addEventListener('input', (e) => {
        numCols = parseInt(e.target.value);
        colsValueDisplay.textContent = numCols;
        updateMatrix();
    });

    padSizeSlider.addEventListener('input', (e) => {
        padSize = parseInt(e.target.value);
        padSizeValueDisplay.textContent = padSize;
        updateMatrix();
    });

    // Synth Control Listeners
    function applySynthParam(setterName, value, displayElement = null, formatter = null) {
        if (simpleSynth && typeof simpleSynth[setterName] === 'function') {
            simpleSynth[setterName](value);
        }
        if (displayElement) {
            displayElement.textContent = formatter ? formatter(value) : value;
        }
    }

    function applyAllSynthParameters() {
        if (!simpleSynth) return;
        applySynthParam('setWaveform', waveformSelect.value);
        applySynthParam('setMasterVolume', parseFloat(masterVolumeSlider.value), masterVolumeValueDisplay, v => v.toFixed(2));
        applySynthParam('setAttack', parseFloat(attackSlider.value), attackValueDisplay, v => v.toFixed(3));
        applySynthParam('setDecay', parseFloat(decaySlider.value), decayValueDisplay, v => v.toFixed(3));
        applySynthParam('setSustain', parseFloat(sustainSlider.value), sustainValueDisplay, v => v.toFixed(2));
        applySynthParam('setRelease', parseFloat(releaseSlider.value), releaseValueDisplay, v => v.toFixed(3));
        applySynthParam('setDistortion', parseFloat(distortionSlider.value), distortionValueDisplay, v => `${v}%`);
        applySynthParam('setFilterCutoff', parseFloat(filterCutoffSlider.value), filterCutoffValueDisplay, v => `${v} Hz`);
        applySynthParam('setFilterResonance', parseFloat(filterResonanceSlider.value), filterResonanceValueDisplay, v => v.toFixed(1));
        applySynthParam('setDelayTime', parseFloat(delayTimeSlider.value), delayTimeValueDisplay, v => `${v.toFixed(2)} s`);
        applySynthParam('setDelayFeedback', parseFloat(delayFeedbackSlider.value), delayFeedbackValueDisplay, v => v.toFixed(2));
        applySynthParam('setReverbMix', parseFloat(reverbMixSlider.value), reverbMixValueDisplay, v => v.toFixed(2));
    }


    waveformSelect.addEventListener('change', (e) => applySynthParam('setWaveform', e.target.value));
    masterVolumeSlider.addEventListener('input', (e) => applySynthParam('setMasterVolume', parseFloat(e.target.value), masterVolumeValueDisplay, v => v.toFixed(2)));
    attackSlider.addEventListener('input', (e) => applySynthParam('setAttack', parseFloat(e.target.value), attackValueDisplay, v => v.toFixed(3)));
    decaySlider.addEventListener('input', (e) => applySynthParam('setDecay', parseFloat(e.target.value), decayValueDisplay, v => v.toFixed(3)));
    sustainSlider.addEventListener('input', (e) => applySynthParam('setSustain', parseFloat(e.target.value), sustainValueDisplay, v => v.toFixed(2)));
    releaseSlider.addEventListener('input', (e) => applySynthParam('setRelease', parseFloat(e.target.value), releaseValueDisplay, v => v.toFixed(3)));
    distortionSlider.addEventListener('input', (e) => applySynthParam('setDistortion', parseFloat(e.target.value), distortionValueDisplay, v => `${v}%`));
    filterCutoffSlider.addEventListener('input', (e) => applySynthParam('setFilterCutoff', parseFloat(e.target.value), filterCutoffValueDisplay, v => `${v} Hz`));
    filterResonanceSlider.addEventListener('input', (e) => applySynthParam('setFilterResonance', parseFloat(e.target.value), filterResonanceValueDisplay, v => v.toFixed(1)));
    delayTimeSlider.addEventListener('input', (e) => applySynthParam('setDelayTime', parseFloat(e.target.value), delayTimeValueDisplay, v => `${v.toFixed(2)} s`));
    delayFeedbackSlider.addEventListener('input', (e) => applySynthParam('setDelayFeedback', parseFloat(e.target.value), delayFeedbackValueDisplay, v => v.toFixed(2)));
    reverbMixSlider.addEventListener('input', (e) => applySynthParam('setReverbMix', parseFloat(e.target.value), reverbMixValueDisplay, v => v.toFixed(2)));


    // --- Initial Setup Call ---
    // Set initial values from sliders to displays
    if (bpmValueDisplay) bpmValueDisplay.textContent = bpmSlider.value;
    if (rowsValueDisplay) rowsValueDisplay.textContent = rowsSlider.value;
    if (colsValueDisplay) colsValueDisplay.textContent = colsSlider.value;
    if (padSizeValueDisplay) padSizeValueDisplay.textContent = padSizeSlider.value;

    // Set initial values for synth from sliders to displays
    if (masterVolumeValueDisplay) masterVolumeValueDisplay.textContent = parseFloat(masterVolumeSlider.value).toFixed(2);
    if (attackValueDisplay) attackValueDisplay.textContent = parseFloat(attackSlider.value).toFixed(3);
    if (decayValueDisplay) decayValueDisplay.textContent = parseFloat(decaySlider.value).toFixed(3);
    if (sustainValueDisplay) sustainValueDisplay.textContent = parseFloat(sustainSlider.value).toFixed(2);
    if (releaseValueDisplay) releaseValueDisplay.textContent = parseFloat(releaseSlider.value).toFixed(3);
    if (distortionValueDisplay) distortionValueDisplay.textContent = `${parseFloat(distortionSlider.value)}%`;
    if (filterCutoffValueDisplay) filterCutoffValueDisplay.textContent = `${parseFloat(filterCutoffSlider.value)} Hz`;
    if (filterResonanceValueDisplay) filterResonanceValueDisplay.textContent = parseFloat(filterResonanceSlider.value).toFixed(1);
    if (delayTimeValueDisplay) delayTimeValueDisplay.textContent = `${parseFloat(delayTimeSlider.value).toFixed(2)} s`;
    if (delayFeedbackValueDisplay) delayFeedbackValueDisplay.textContent = parseFloat(delayFeedbackSlider.value).toFixed(2);
    if (reverbMixValueDisplay) reverbMixValueDisplay.textContent = parseFloat(reverbMixSlider.value).toFixed(2);


    // Create the initial matrix
    numRows = parseInt(rowsSlider.value);
    numCols = parseInt(colsSlider.value);
    padSize = parseInt(padSizeSlider.value);
    updateMatrix();

    // Try to initialize audio context on first user interaction (e.g. clicking play or a pad)
    // but we can also try to initialize it silently here. Some browsers might require interaction.
    // For now, initAudio() is called on first play or pad click.
    // If you want to try initializing it earlier:
    // initAudio();

    console.log("mainBeatMatrix.js loaded and initialized.");
});
