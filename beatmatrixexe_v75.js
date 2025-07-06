// =================== MIDI =========================
let midiAccess = null;
let midiOut = null;

// Global Variables for Sequencer (Barra Horizontal Principal)
let isPlaying = false;
let currentColumn = 0;
let bpm = 120;
let timerId = null;
const playStopButton = document.getElementById('play-stop-button');

// Global Variables for Second Sequencer (Barra Vertical)
let isPlayingVertical = false;
let currentColumnVertical = 0; // Será inicializado de forma diferente (ex: currentNumCols - 1)
let bpmVertical = 120;
let timerIdVertical = null;
const playStopButtonVertical = document.getElementById('play-stop-button-vertical');

// =============== BPM Fader Variables and Constants (Barra Horizontal Principal) ===============
const horizontalBpmFaderSVG = document.getElementById('horizontalBpmFaderSVG');
const faderTrack = document.getElementById('faderTrack');
const faderThumb = document.getElementById('faderThumb');
const bpmTextDisplay = document.getElementById('bpmTextDisplay');

// =============== BPM Fader Variables and Constants (Barra Vertical) ===============
const horizontalBpmFaderSVGVertical = document.getElementById('horizontalBpmFaderSVGVertical');
const faderTrackVertical = document.getElementById('faderTrackVertical'); // ID do HTML
const faderThumbVertical = document.getElementById('faderThumbVertical');   // ID do HTML
const bpmTextDisplayVertical = document.getElementById('bpmTextDisplayVertical'); // ID do HTML

// --- Fader Geometry Constants (Comum para ambos os faders, assumindo que são idênticos em design) ---
// Se os faders tiverem tamanhos diferentes, essas constantes precisarão ser duplicadas/ajustadas
const H_BPM_FADER_SVG_WIDTH = 250;
const H_BPM_FADER_TRACK_X = 10;
const H_BPM_FADER_TRACK_WIDTH = 230; // SVG width 250 - 2 * 10 (padding) = 230
const H_BPM_FADER_THUMB_WIDTH = 20;

const minBPM = 60;
const maxBPM = 1000; // Max BPM kept high as per original

let isDraggingBPM = false;
let isGesturingBPM = false; // Retained for potential gesture control on BPM fader

// =============== Grid Control Elements ===============
const rowsInput = document.getElementById('rowsInput');
const colsInput = document.getElementById('colsInput');
const rowsValueDisplay = document.getElementById('rowsValueDisplay');
const colsValueDisplay = document.getElementById('colsValueDisplay');
const padSizeInput = document.getElementById('padSizeInput'); // Agora é um range slider
const padSizeValueDisplay = document.getElementById('padSizeValueDisplay'); // Span para mostrar o valor do tamanho do pad
// const updateMatrixBtn = document.getElementById('updateMatrixBtn'); // Removido

let currentNumRows = 4; // Default value, will be updated from input
let currentNumCols = 4; // Default value, will be updated from input
let currentPadSize = 60; // Default value, will be updated from input

const pads = []; // Global array to store pad elements
const verticalNoteOffset = 12; // Notas da barra vertical serão 1 oitava acima

// MIDI Access Initialization
navigator.requestMIDIAccess().then(access => {
  midiAccess = access;
  const select = document.getElementById('midi-out');
  if (select) {
    select.innerHTML = '';
    midiAccess.outputs.forEach((port, id) => {
      const option = document.createElement('option');
      option.value = id;
      option.text = port.name;
      select.appendChild(option);
    });
    select.onchange = () => {
      midiOut = midiAccess.outputs.get(select.value);
    };
    if (select.options.length > 0) {
      select.selectedIndex = 0; // Default to first available MIDI output
      midiOut = midiAccess.outputs.get(select.value);
    }
  }
});

// =============== GRID Function ======================
function updateMatrix(numRows, numCols, padSize) {
    const grid = document.getElementById('grid');
    if (!grid) {
        console.error("Grid element not found!");
        return;
    }

    // Store the state of active pads (by their note)
    const activeNotes = new Set();
    if (pads && pads.length > 0) {
        pads.forEach(pad => {
            if (pad.classList.contains('active')) {
                activeNotes.add(pad.dataset.note);
            }
        });
    }

    // Store current sequencer column to attempt to restore it
    const previousSequencerColumn = currentColumn;
    const previousSequencerColumnVertical = currentColumnVertical; // Store for vertical bar
    const previousNumCols = currentNumCols; // Store previous number of columns

    grid.innerHTML = ''; // Clear old pads
    pads.length = 0;   // Clear the global 'pads' array

    currentNumRows = parseInt(numRows, 10); // Update global state
    currentNumCols = parseInt(numCols, 10);
    currentPadSize = parseInt(padSize, 10);

    if (isNaN(currentNumRows) || currentNumRows <= 0 ||
        isNaN(currentNumCols) || currentNumCols <= 0 ||
        isNaN(currentPadSize) || currentPadSize <= 0) {
        console.error("Invalid grid dimensions or pad size.");
        return;
    }

    grid.style.gridTemplateColumns = `repeat(${currentNumCols}, 1fr)`;
    grid.style.gap = '10px';

    const baseNote = 36; // Starting MIDI note

    for (let i = 0; i < currentNumRows * currentNumCols; i++) {
        const pad = document.createElement('div');
        pad.classList.add('pad');
        pad.style.width = `${currentPadSize}px`;
        pad.style.height = `${currentPadSize}px`;
        pad.textContent = i + 1;
        const noteValue = baseNote + i; // Calculate note value
        pad.dataset.note = noteValue.toString();

        // Restore active state if this note was previously active
        if (activeNotes.has(noteValue.toString())) {
            pad.classList.add('active');
        }

        pad.onclick = () => triggerPad(pad);
        grid.appendChild(pad);
        pads.push(pad);
    }

    if (isPlaying) {
        // Attempt to maintain sequencer position if number of columns hasn't changed
        // Or if it changed, reset to 0 or cap at new max columns.
        if (currentNumCols === previousNumCols) {
            currentColumn = previousSequencerColumn;
        } else {
            currentColumn = Math.min(previousSequencerColumn, currentNumCols - 1);
            if (currentColumn < 0) currentColumn = 0; // Ensure it's not negative if new numCols is 0
        }

        // Clear any existing column indicators before restarting interval
        pads.forEach(p => {
            p.classList.remove('sequencer-column-indicator');
            p.classList.remove('sequencer-column-indicator-vertical');
        });

        clearInterval(timerId); // Clear existing timer for horizontal bar
        if (currentNumCols > 0) {
            const columnInterval = 60000 / bpm;
            timerId = setInterval(stepSequencer, columnInterval);
            stepSequencer(true); // Apply indicator without advancing
        } else {
            isPlaying = false;
            if (playStopButton) playStopButton.textContent = 'Play';
        }
    }

    // Similar logic for the vertical sequencer
    if (isPlayingVertical) {
        if (currentNumCols === previousNumCols) {
            currentColumnVertical = previousSequencerColumnVertical;
        } else {
            currentColumnVertical = Math.min(previousSequencerColumnVertical, currentNumCols - 1);
            if (currentColumnVertical < 0) currentColumnVertical = currentNumCols > 0 ? currentNumCols -1 : 0;
        }

        // Indicators already cleared above
        clearInterval(timerIdVertical); // Clear existing timer for vertical bar
        if (currentNumCols > 0) {
            const columnIntervalVertical = 60000 / bpmVertical;
            timerIdVertical = setInterval(stepSequencerVertical, columnIntervalVertical);
            stepSequencerVertical(true); // Apply indicator without advancing
        } else {
            isPlayingVertical = false;
            if (playStopButtonVertical) playStopButtonVertical.textContent = 'Play Barra Vert';
        }
    }
}

function triggerPad(pad) {
  const note = parseInt(pad.dataset.note);
  const isActive = pad.classList.toggle('active');
  const velocity = isActive ? 100 : 0;
  const status = isActive ? 0x90 : 0x80; // 0x90 for note ON, 0x80 for note OFF
  if (midiOut) midiOut.send([status, note, velocity]);
}

// =============== Sequencer Functions ====================
function togglePlayback() {
  isPlaying = !isPlaying;
  if (playStopButton) {
    playStopButton.textContent = isPlaying ? 'Stop' : 'Play';
  }

  if (isPlaying) {
    if (currentNumCols === 0) { // Prevent issues if grid is empty
        console.warn("Sequencer started with 0 columns.");
        isPlaying = false;
        if (playStopButton) playStopButton.textContent = 'Play';
        return;
    }
    const columnInterval = 60000 / bpm;
    currentColumn = 0;
    stepSequencer(); // Initial step
    if (timerId) clearInterval(timerId);
    timerId = setInterval(stepSequencer, columnInterval);
  } else {
    clearInterval(timerId);
    pads.forEach(pad => pad.classList.remove('sequencer-column-indicator'));
  }
}

if (playStopButton) {
  playStopButton.addEventListener('click', togglePlayback);
}

function stepSequencer(dontAdvanceColumn = false) { // Added optional parameter
  if (currentNumCols <= 0 || pads.length === 0) {
    return;
  }

  pads.forEach(p => p.classList.remove('sequencer-column-indicator'));

  // Ensure currentColumn is valid before proceeding
  if (currentColumn >= currentNumCols || currentColumn < 0) {
      currentColumn = 0; // Reset if out of bounds
  }

  for (let r = 0; r < currentNumRows; r++) {
    const padIndex = r * currentNumCols + currentColumn;
    if (pads[padIndex]) {
      pads[padIndex].classList.add('sequencer-column-indicator');
      if (pads[padIndex].classList.contains('active')) {
        const note = parseInt(pads[padIndex].dataset.note);
        if (midiOut) {
          midiOut.send([0x90, note, 100]); // Note ON
          setTimeout(() => {
            if (midiOut) midiOut.send([0x80, note, 0]); // Note OFF after 100ms
          }, 100);
        }
      }
    }
  }

  if (!dontAdvanceColumn) {
    currentColumn = (currentColumn + 1) % currentNumCols;
  }

  // Detecção de Cruzamento (apenas log por enquanto)
  if (isPlaying && isPlayingVertical && currentColumn === currentColumnVertical) {
    console.log("Barras cruzadas na coluna:", currentColumn);
  }
}


// =============== Sequencer Functions (Vertical - Segunda Barra) ====================
function togglePlaybackVertical() {
  isPlayingVertical = !isPlayingVertical;
  if (playStopButtonVertical) {
    playStopButtonVertical.textContent = isPlayingVertical ? 'Stop Barra Vert' : 'Play Barra Vert';
  }

  if (isPlayingVertical) {
    if (currentNumCols === 0) {
        console.warn("Sequenciador Vertical iniciado com 0 colunas.");
        isPlayingVertical = false;
        if (playStopButtonVertical) playStopButtonVertical.textContent = 'Play Barra Vert';
        return;
    }
    // Iniciar da última coluna para a direita
    currentColumnVertical = currentNumCols > 0 ? currentNumCols - 1 : 0;
    stepSequencerVertical(); // Initial step
    if (timerIdVertical) clearInterval(timerIdVertical);
    const columnInterval = 60000 / bpmVertical;
    timerIdVertical = setInterval(stepSequencerVertical, columnInterval);
  } else {
    clearInterval(timerIdVertical);
    pads.forEach(pad => pad.classList.remove('sequencer-column-indicator-vertical'));
  }
}

if (playStopButtonVertical) {
  playStopButtonVertical.addEventListener('click', togglePlaybackVertical);
}

function stepSequencerVertical(dontAdvanceColumn = false) {
  if (currentNumCols <= 0 || pads.length === 0) {
    return;
  }

  pads.forEach(p => p.classList.remove('sequencer-column-indicator-vertical'));

  if (currentColumnVertical < 0 || currentColumnVertical >= currentNumCols) {
      currentColumnVertical = currentNumCols > 0 ? currentNumCols - 1 : 0; // Reset se fora dos limites
  }

  for (let r = 0; r < currentNumRows; r++) {
    const padIndex = r * currentNumCols + currentColumnVertical;
    if (pads[padIndex]) {
      pads[padIndex].classList.add('sequencer-column-indicator-vertical');
      if (pads[padIndex].classList.contains('active')) {
        const originalNote = parseInt(pads[padIndex].dataset.note);
        const verticalNote = originalNote + verticalNoteOffset; // Aplicar offset
        if (midiOut) {
          midiOut.send([0x90, verticalNote, 100]); // Note ON com nota ajustada
          setTimeout(() => {
            if (midiOut) midiOut.send([0x80, verticalNote, 0]); // Note OFF com nota ajustada
          }, 100);
        }
      }
    }
  }

  if (!dontAdvanceColumn) {
    currentColumnVertical = (currentColumnVertical - 1 + currentNumCols) % currentNumCols; // Movendo da direita para a esquerda
  }

  // Detecção de Cruzamento (apenas log por enquanto)
  if (isPlaying && isPlayingVertical && currentColumn === currentColumnVertical) {
    console.log("Barras cruzadas na coluna:", currentColumnVertical);
    // Adicionar uma classe de destaque ao(s) pad(s) na interseção?
    // for (let r = 0; r < currentNumRows; r++) {
    //   const padIndex = r * currentNumCols + currentColumn;
    //   if (pads[padIndex]) {
    //     pads[padIndex].classList.add('intersection-highlight'); // Necessário CSS para esta classe
    //   }
    // }
  } else {
    // Remover destaque de interseção se não estiverem mais cruzadas
    // pads.forEach(p => p.classList.remove('intersection-highlight'));
  }
}


// =============== BPM Fader Functions (Horizontal - Principal) ====================
function updateBPMVisuals(newBpmValue) {
  let clampedBpm = Math.max(minBPM, Math.min(maxBPM, newBpmValue));
  bpm = clampedBpm;

  const mainBpmDisplay = document.getElementById('bpm-display');
  if (mainBpmDisplay) {
      mainBpmDisplay.textContent = `BPM: ${Math.round(clampedBpm)}`;
  }

  if (faderThumb && bpmTextDisplay && horizontalBpmFaderSVG) {
    const normalizedBpm = (maxBPM === minBPM) ? 0 : (clampedBpm - minBPM) / (maxBPM - minBPM);
    const availableTrackWidthForThumb = H_BPM_FADER_TRACK_WIDTH - H_BPM_FADER_THUMB_WIDTH;
    let thumbX = H_BPM_FADER_TRACK_X + normalizedBpm * availableTrackWidthForThumb;
    thumbX = Math.max(H_BPM_FADER_TRACK_X, Math.min(thumbX, H_BPM_FADER_TRACK_X + availableTrackWidthForThumb));
    faderThumb.setAttribute('x', thumbX);
    bpmTextDisplay.textContent = `BPM: ${Math.round(clampedBpm)}`;
  }

  if (isPlaying) {
    clearInterval(timerId);
    const columnInterval = 60000 / bpm;
    timerId = setInterval(stepSequencer, columnInterval);
  }
}

// =============== BPM Fader Functions (Vertical - Segunda Barra) ====================
function updateBPMVerticalVisuals(newBpmValue) {
  let clampedBpm = Math.max(minBPM, Math.min(maxBPM, newBpmValue));
  bpmVertical = clampedBpm;

  const mainBpmDisplayVertical = document.getElementById('bpm-display-vertical');
  if (mainBpmDisplayVertical) {
      mainBpmDisplayVertical.textContent = `BPM Vert: ${Math.round(clampedBpm)}`;
  }

  if (faderThumbVertical && bpmTextDisplayVertical && horizontalBpmFaderSVGVertical) {
    const normalizedBpm = (maxBPM === minBPM) ? 0 : (clampedBpm - minBPM) / (maxBPM - minBPM);
    const availableTrackWidthForThumb = H_BPM_FADER_TRACK_WIDTH - H_BPM_FADER_THUMB_WIDTH; // Assumindo mesma geometria
    let thumbX = H_BPM_FADER_TRACK_X + normalizedBpm * availableTrackWidthForThumb;
    thumbX = Math.max(H_BPM_FADER_TRACK_X, Math.min(thumbX, H_BPM_FADER_TRACK_X + availableTrackWidthForThumb));
    faderThumbVertical.setAttribute('x', thumbX);
    bpmTextDisplayVertical.textContent = `BPM Vert: ${Math.round(clampedBpm)}`;
  }

  if (isPlayingVertical) {
    clearInterval(timerIdVertical);
    const columnInterval = 60000 / bpmVertical;
    timerIdVertical = setInterval(stepSequencerVertical, columnInterval); // Chamar stepSequencerVertical
  }
}


// --- Helper Function (Comum para ambos os faders) ---
function calculateValueFromX(svgX, trackX, trackWidth, minValue, maxValue, thumbWidth) {
    let normalizedPosition = (svgX - trackX - (thumbWidth / 2)) / (trackWidth - thumbWidth);
    normalizedPosition = Math.max(0, Math.min(1, normalizedPosition));
    let value = minValue + normalizedPosition * (maxValue - minValue);
    return Math.round(value);
}

// Mouse event handlers for BPM fader (Principal)
let isDraggingBPMPrincipal = false; // Renomeado para evitar conflito
function horizontalBpmFaderMouseDownHandler(event) {
    if (!horizontalBpmFaderSVG) return;
    isDraggingBPMPrincipal = true;
    document.body.style.cursor = 'grabbing';
    const svgRect = horizontalBpmFaderSVG.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
    updateBPMVisuals(newBpm);
    document.addEventListener('mousemove', horizontalBpmFaderMouseMoveHandler);
    document.addEventListener('mouseup', horizontalBpmFaderMouseUpHandler);
}

function horizontalBpmFaderMouseMoveHandler(event) {
    if (!isDraggingBPMPrincipal || !horizontalBpmFaderSVG) return;
    event.preventDefault();
    const svgRect = horizontalBpmFaderSVG.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
    updateBPMVisuals(newBpm);
}

function horizontalBpmFaderMouseUpHandler() {
    if (isDraggingBPMPrincipal) {
        isDraggingBPMPrincipal = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', horizontalBpmFaderMouseMoveHandler);
        document.removeEventListener('mouseup', horizontalBpmFaderMouseUpHandler);
    }
}

// Mouse event handlers for BPM fader (Vertical)
let isDraggingBPMVertical = false;
function horizontalBpmFaderVerticalMouseDownHandler(event) {
    if (!horizontalBpmFaderSVGVertical) return;
    isDraggingBPMVertical = true;
    document.body.style.cursor = 'grabbing';
    const svgRect = horizontalBpmFaderSVGVertical.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
    updateBPMVerticalVisuals(newBpm);
    document.addEventListener('mousemove', horizontalBpmFaderVerticalMouseMoveHandler);
    document.addEventListener('mouseup', horizontalBpmFaderVerticalMouseUpHandler);
}

function horizontalBpmFaderVerticalMouseMoveHandler(event) {
    if (!isDraggingBPMVertical || !horizontalBpmFaderSVGVertical) return;
    event.preventDefault();
    const svgRect = horizontalBpmFaderSVGVertical.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
    updateBPMVerticalVisuals(newBpm);
}

function horizontalBpmFaderVerticalMouseUpHandler() {
    if (isDraggingBPMVertical) {
        isDraggingBPMVertical = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', horizontalBpmFaderVerticalMouseMoveHandler);
        document.removeEventListener('mouseup', horizontalBpmFaderVerticalMouseUpHandler);
    }
}


if (horizontalBpmFaderSVG) {
    horizontalBpmFaderSVG.addEventListener('mousedown', horizontalBpmFaderMouseDownHandler);
}
if (horizontalBpmFaderSVGVertical) {
    horizontalBpmFaderSVGVertical.addEventListener('mousedown', horizontalBpmFaderVerticalMouseDownHandler);
}


// =============== Initialization and Event Listeners ===============
document.addEventListener('DOMContentLoaded', () => {
    // Initialize BPM fader visuals (Principal)
    if (horizontalBpmFaderSVG && faderThumb && bpmTextDisplay) {
         updateBPMVisuals(bpm);
    } else {
        // console.warn("BPM Fader (Principal) elements not all found on DOMContentLoaded.");
    }
    // Initialize BPM fader visuals (Vertical)
    if (horizontalBpmFaderSVGVertical && faderThumbVertical && bpmTextDisplayVertical) {
         updateBPMVerticalVisuals(bpmVertical);
    } else {
        // console.warn("BPM Fader (Vertical) elements not all found on DOMContentLoaded.");
    }


    // Set initial values for input fields and matrix
    if (rowsInput && colsInput && padSizeInput && rowsValueDisplay && colsValueDisplay && padSizeValueDisplay) {
        rowsInput.value = currentNumRows;
        rowsValueDisplay.textContent = currentNumRows;
        colsInput.value = currentNumCols;
        colsValueDisplay.textContent = currentNumCols;
        padSizeInput.value = currentPadSize;
        padSizeValueDisplay.textContent = currentPadSize;


        // Event listeners for sliders to update their display values
        rowsInput.addEventListener('input', () => {
            rowsValueDisplay.textContent = rowsInput.value;
            currentNumRows = parseInt(rowsInput.value, 10);
            updateMatrix(currentNumRows, currentNumCols, padSizeInput.value);
        });
        colsInput.addEventListener('input', () => {
            colsValueDisplay.textContent = colsInput.value;
            currentNumCols = parseInt(colsInput.value, 10);
            updateMatrix(currentNumRows, currentNumCols, padSizeInput.value);
        });

        // Event listener for pad size slider input
        padSizeInput.addEventListener('input', () => {
            const newSize = padSizeInput.value;
            padSizeValueDisplay.textContent = newSize;
            currentPadSize = parseInt(newSize, 10); // Update global currentPadSize
            updateMatrix(currentNumRows, currentNumCols, newSize);
        });

        updateMatrix(currentNumRows, currentNumCols, currentPadSize);
    } else {
        console.warn("Some grid control input or display elements not found on DOMContentLoaded.");
        // Fallback to default if inputs are missing
        updateMatrix(4, 4, 60);
    }
});

// =============== MEDIA PIPE (Gesture Control) ====================
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function isPinching(lmCollection) {
  if (!lmCollection[4] || !lmCollection[8]) return false;
  return distance(lmCollection[4].x, lmCollection[4].y, lmCollection[8].x, lmCollection[8].y) < 0.02; // Pinch threshold
}

if (video && canvas && typeof Hands !== 'undefined') {
  const hands = new Hands({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      if (video) await hands.send({ image: video });
    },
    width: 1280, // Consider making these configurable or adaptive
    height: 720
  });
  camera.start();

  hands.onResults(results => {
    if (canvas && ctx && results.image) { // Ensure canvas and context are available
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height); // Draw camera feed
    }

    pads.forEach(p => p.classList.remove('highlight'));
    let aHandIsInteractingWithFader = false; // Flag for BPM fader interaction

    if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach((handLandmarks) => {
        const thumbTip = handLandmarks[4];
        const indexTip = handLandmarks[8];

        if (!thumbTip || !indexTip) return;

        const indexTipX_screen = (1 - indexTip.x) * window.innerWidth; // Mirrored X
        const indexTipY_screen = indexTip.y * window.innerHeight;
        const isCurrentlyPinching = isPinching(handLandmarks);

        let pinchOnBpmFader = false;

        // Check for pinch on BPM Fader
        if (horizontalBpmFaderSVG && faderThumb && isCurrentlyPinching && !isDraggingBPM) {
            const rect = horizontalBpmFaderSVG.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) { // Ensure fader is visible and has dimensions
                const pinchSvgX = (indexTipX_screen - rect.left);
                const pinchSvgY = (indexTipY_screen - rect.top);
                // Check if pinch is within the Y-range of the fader (e.g., 0 to its height)
                // and within the X-range of the track.
                if (pinchSvgX >= H_BPM_FADER_TRACK_X && pinchSvgX <= H_BPM_FADER_TRACK_X + H_BPM_FADER_TRACK_WIDTH &&
                    pinchSvgY >= 0 && pinchSvgY <= rect.height) {
                    pinchOnBpmFader = true;
                    aHandIsInteractingWithFader = true;
                    if (!isGesturingBPM) isGesturingBPM = true; // Set gesture flag
                    let val = calculateValueFromX(pinchSvgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
                    updateBPMVisuals(val);
                }
            }
        }


        // Pad interaction logic: only if pinching and NOT on the BPM fader
        // and no mouse drag is active on the BPM fader.
        if (isCurrentlyPinching && !pinchOnBpmFader && !isGesturingBPM && !isDraggingBPM) {
            for (let pad of pads) {
                const b = pad.getBoundingClientRect();
                // Check if the pinch (index finger tip) is within a certain radius of the pad's center
                if (distance(b.left + b.width / 2, b.top + b.height / 2, indexTipX_screen, indexTipY_screen) < (currentPadSize / 2 * 1.2)) { // 1.2 is a tolerance factor
                    pad.classList.add('highlight');
                    // Debounce or manage rapid triggering if necessary
                    if (!pad.dataset.triggeredByGesture) { // Simple debounce example
                        triggerPad(pad);
                        pad.dataset.triggeredByGesture = "true";
                        setTimeout(() => delete pad.dataset.triggeredByGesture, 200); // Reset after a short delay
                    }
                    break; // Interact with one pad at a time per hand
                }
            }
        }
      });
    }

    // Reset gesture flag for BPM fader if no hand is actively interacting with it
    if (!aHandIsInteractingWithFader && isGesturingBPM) {
        isGesturingBPM = false;
    }
  });
} else {
    // console.warn("MediaPipe Hands, video, or canvas element not found. Gesture control disabled.");
}
