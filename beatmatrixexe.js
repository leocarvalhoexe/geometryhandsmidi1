// =================== MIDI =========================
let midiAccess = null;
let midiOut = null;

// Global Variables for Sequencer
let isPlaying = false;
let currentColumn = 0;
let bpm = 120; // Existing global BPM variable
let timerId = null;
const playStopButton = document.getElementById('play-stop-button');

// =============== BPM Fader Variables and Constants ===============
// --- Old Circular Fader Elements (Commented out as they are no longer used) ---
// const bpmFaderSVG = document.getElementById('bpm-fader-svg');
// const bpmFaderArc = document.getElementById('bpm-fader-arc');
// const bpmFaderKnob = document.getElementById('bpm-fader-knob');
// const bpmValueDisplay = document.getElementById('bpm-value-display'); // Specific to the old fader's text

// --- New Horizontal Fader Elements ---
const horizontalBpmFaderSVG = document.getElementById('horizontalBpmFaderSVG');
const faderTrack = document.getElementById('faderTrack');
const faderThumb = document.getElementById('faderThumb');
const bpmTextDisplay = document.getElementById('bpmTextDisplay');

// --- Horizontal Fader Geometry Constants (based on SVG in index10.html) ---
const H_BPM_FADER_SVG_WIDTH = 300; // Renamed for clarity
const H_BPM_FADER_TRACK_X = 10;
const H_BPM_FADER_TRACK_WIDTH = 280;
const H_BPM_FADER_THUMB_WIDTH = 20;

// --- General BPM settings ---
const minBPM = 60;
const maxBPM = 1000;

let isDraggingBPM = false;
let isGesturingBPM = false;

// --- Rows Fader ---
const rowsFaderSVG = document.getElementById('rowsFaderSVG');
const rowsFaderThumb = document.getElementById('rowsFaderThumb');
const rowsValueDisplay = document.getElementById('rowsValueDisplay');
const ROWS_FADER_TRACK_X = 5;
const ROWS_FADER_TRACK_WIDTH = 240;
const ROWS_FADER_THUMB_WIDTH = 16;
const MIN_ROWS = 1;
const MAX_ROWS = 16;
let currentRowValue = 4;
let isDraggingRowsFader = false;
let isGesturingRowsFader = false;

// --- Columns Fader ---
const colsFaderSVG = document.getElementById('colsFaderSVG');
const colsFaderThumb = document.getElementById('colsFaderThumb');
const colsValueDisplay = document.getElementById('colsValueDisplay');
const COLS_FADER_TRACK_X = 5;
const COLS_FADER_TRACK_WIDTH = 240;
const COLS_FADER_THUMB_WIDTH = 16;
const MIN_COLS = 1;
const MAX_COLS = 16;
let currentColValue = 4;
let isDraggingColsFader = false;
let isGesturingColsFader = false;

// --- Pad Size Fader ---
const padSizeFaderSVG = document.getElementById('padSizeFaderSVG');
const padSizeFaderThumb = document.getElementById('padSizeFaderThumb');
const padSizeValueDisplay = document.getElementById('padSizeValueDisplay');
const PAD_SIZE_FADER_TRACK_X = 5;
const PAD_SIZE_FADER_TRACK_WIDTH = 240;
const PAD_SIZE_FADER_THUMB_WIDTH = 16;
const MIN_PAD_SIZE = 20;
const MAX_PAD_SIZE = 100;
let currentPadSizeValue = 60;
let isDraggingPadSizeFader = false;
let isGesturingPadSizeFader = false;

// --- Old Circular Fader Geometry Constants (Commented out) ---
// const faderCenterX = 50;
// const faderCenterY = 50;
// const faderRadius = 40;
// const faderStartAngle = -150;
// const faderTotalSweepAngle = 300;

// --- Old Gesture Control Variables (Commented out if not directly applicable) ---
// let initialPinchAngleBPM = 0;
// let initialBPMValueOnPinch = 0;

// New state for linear drag (mouse and pinch) - some can be reused
let initialMouseX = 0; // Reusable for horizontal fader logic (stores initial clientX)
let initialMouseY = 0; // May not be needed for horizontal fader if only X-axis drag
let initialPinchDragX = 0; // Reusable for pinch gesture initial screen X
let initialPinchDragY = 0; // Reusable for pinch gesture initial screen Y (for Y-axis check)
let initialBPMValueOnDragStart = 0; // Reusable


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
      select.selectedIndex = 0;
      midiOut = midiAccess.outputs.get(select.value);
    }
  }
});

// =============== GRID ======================
// const grid = document.getElementById('grid'); // Will be fetched inside updateMatrix
// let rows = 4; // These will now be dynamic
// let cols = 4; // These will now be dynamic
let currentNumRows = 4; // Default value, will be updated
let currentNumCols = 4; // Default value, will be updated
const pads = []; // Global array to store pad elements

function updateMatrix(numRows, numCols, padSize) {
    const grid = document.getElementById('grid');
    if (!grid) {
        console.error("Grid element not found!");
        return;
    }
    grid.innerHTML = ''; // Clear old pads from DOM
    pads.length = 0;   // Clear the global 'pads' array

    currentNumRows = numRows; // Update global state
    currentNumCols = numCols;

    grid.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;
    // Optional: Adjust gap based on padSize or keep it fixed
    // grid.style.gap = `${padSize / 10}px`;

    const baseNote = 36; // Starting MIDI note

    for (let i = 0; i < numRows * numCols; i++) {
        const pad = document.createElement('div');
        pad.classList.add('pad');
        pad.style.width = `${padSize}px`;
        pad.style.height = `${padSize}px`;

        // Calculate row and col for textContent and potentially for note assignment if needed differently
        // let colIndex = i % numCols;
        // let rowIndex = Math.floor(i / numCols);
        pad.textContent = i + 1; // Simple 1-based indexing for display

        pad.dataset.note = baseNote + i; // Assign MIDI note sequentially

        pad.onclick = () => triggerPad(pad);

        grid.appendChild(pad);
        pads.push(pad);
    }

    // If sequencer is playing, we might need to reset or update it
    if (isPlaying) {
        // Potentially stop and restart sequencer, or just reset currentColumn
        currentColumn = 0;
        // Or even togglePlayback(); togglePlayback(); to re-initialize if needed
    }
}

function triggerPad(pad) {
  const note = parseInt(pad.dataset.note);
  const isActive = pad.classList.toggle('active');
  const velocity = isActive ? 100 : 0;
  const status = isActive ? 0x90 : 0x80;
  if (midiOut) midiOut.send([status, note, velocity]);
}

// =============== Sequencer Functions ====================
function togglePlayback() {
  isPlaying = !isPlaying;
  if (isPlaying) {
    if (playStopButton) playStopButton.textContent = 'Stop';
    const columnInterval = 60000 / bpm;

    currentColumn = 0;
    stepSequencer();
    if (timerId) clearInterval(timerId);
    timerId = setInterval(stepSequencer, columnInterval);
  } else {
    if (playStopButton) playStopButton.textContent = 'Play';
    clearInterval(timerId);
    pads.forEach(pad => pad.classList.remove('sequencer-column-indicator'));
  }
}

if (playStopButton) {
  playStopButton.addEventListener('click', togglePlayback);
}

function stepSequencer() {
  pads.forEach(p => p.classList.remove('sequencer-column-indicator'));

  // Use currentNumRows and currentNumCols for sequencer logic
  for (let r = 0; r < currentNumRows; r++) {
    const padIndex = r * currentNumCols + currentColumn;
    if (pads[padIndex]) {
      pads[padIndex].classList.add('sequencer-column-indicator');
    }
  }

  for (let r = 0; r < currentNumRows; r++) {
    const padIndex = r * currentNumCols + currentColumn;
    const pad = pads[padIndex];
    if (pad && pad.classList.contains('active')) {
      const note = parseInt(pad.dataset.note);
      if (midiOut) {
        midiOut.send([0x90, note, 100]);
        setTimeout(() => {
          if (midiOut) midiOut.send([0x80, note, 0]);
        }, 100);
      }
    }
  }
  currentColumn = (currentColumn + 1) % currentNumCols;
  if (currentNumCols === 0) currentColumn = 0; // Prevent NaN if cols is 0
}

// =============== BPM Fader Functions (Horizontal) ====================
function updateBPMVisuals(newBpmValue) {
  let clampedBpm = Math.max(minBPM, Math.min(maxBPM, newBpmValue));
  bpm = clampedBpm; // Update global BPM variable

  // Update main BPM display (outside SVG)
  const mainBpmDisplay = document.getElementById('bpm-display');
  if (mainBpmDisplay) {
      mainBpmDisplay.textContent = `BPM: ${Math.round(clampedBpm)}`;
  }

// Update horizontal fader SVG elements (BPM Fader)
  if (faderThumb && bpmTextDisplay) {
    const normalizedBpm = (maxBPM === minBPM) ? 0 : (clampedBpm - minBPM) / (maxBPM - minBPM);
    const availableTrackWidthForThumb = H_BPM_FADER_TRACK_WIDTH - H_BPM_FADER_THUMB_WIDTH;
    let thumbX = H_BPM_FADER_TRACK_X + normalizedBpm * availableTrackWidthForThumb;
    thumbX = Math.max(H_BPM_FADER_TRACK_X, Math.min(thumbX, H_BPM_FADER_TRACK_X + availableTrackWidthForThumb));
    faderThumb.setAttribute('x', thumbX);
    bpmTextDisplay.textContent = `BPM: ${Math.round(clampedBpm)}`;
  }

  // Update sequencer timing if it's playing
  if (isPlaying) {
    clearInterval(timerId);
    const columnInterval = 60000 / bpm;
    timerId = setInterval(stepSequencer, columnInterval);
  }
}

// --- Generic Fader Helper Functions ---
function calculateValueFromX(svgX, trackX, trackWidth, minValue, maxValue, thumbWidth) {
    // Adjust for thumb width so the value corresponds to the center of the thumb on the track
    let normalizedPosition = (svgX - trackX - (thumbWidth / 2)) / (trackWidth - thumbWidth);
    normalizedPosition = Math.max(0, Math.min(1, normalizedPosition));
    let value = minValue + normalizedPosition * (maxValue - minValue);
    return Math.round(value); // Use Math.round for integer values like rows/cols
}

function updateFaderVisualsDOM(currentValue, thumbElement, textElement, trackX, trackWidth, minValue, maxValue, thumbWidth, labelPrefix, unitSuffix = '') {
    if (!thumbElement || !textElement) return currentValue; // Return current value if elements are missing

    let clampedValue = Math.max(minValue, Math.min(maxValue, currentValue));
    let normalizedValue = (maxValue === minValue) ? 0 : (clampedValue - minValue) / (maxValue - minValue);

    const availableTrackWidthForThumb = trackWidth - thumbWidth;
    let thumbX = trackX + normalizedValue * availableTrackWidthForThumb;
    thumbX = Math.max(trackX, Math.min(thumbX, trackX + availableTrackWidthForThumb));

    thumbElement.setAttribute('x', thumbX);
    textElement.textContent = labelPrefix + Math.round(clampedValue) + unitSuffix;
    return clampedValue;
}


// Mouse event handlers for BPM fader (remains largely the same, but uses new constants)
function horizontalBpmFaderMouseDownHandler(event) {
    if (isGesturingRowsFader || isGesturingColsFader || isGesturingPadSizeFader || !horizontalBpmFaderSVG) return;
    isDraggingBPM = true;
    const svgRect = horizontalBpmFaderSVG.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
    updateBPMVisuals(newBpm);
    document.addEventListener('mousemove', horizontalBpmFaderMouseMoveHandler);
    document.addEventListener('mouseup', horizontalBpmFaderMouseUpHandler);
}

function horizontalBpmFaderMouseMoveHandler(event) {
    if (!isDraggingBPM || !horizontalBpmFaderSVG) return;
    event.preventDefault();
    const svgRect = horizontalBpmFaderSVG.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
    updateBPMVisuals(newBpm);
}

function horizontalBpmFaderMouseUpHandler(event) {
    if (isDraggingBPM) {
        isDraggingBPM = false;
        document.removeEventListener('mousemove', horizontalBpmFaderMouseMoveHandler);
        document.removeEventListener('mouseup', horizontalBpmFaderMouseUpHandler);
    }
}

if (horizontalBpmFaderSVG) {
    horizontalBpmFaderSVG.addEventListener('mousedown', horizontalBpmFaderMouseDownHandler);
}

// --- Rows Fader Event Handlers ---
function handleRowsChange(newValue) {
    currentRowValue = updateFaderVisualsDOM(newValue, rowsFaderThumb, rowsValueDisplay, ROWS_FADER_TRACK_X, ROWS_FADER_TRACK_WIDTH, MIN_ROWS, MAX_ROWS, ROWS_FADER_THUMB_WIDTH, "Rows: ");
    if (currentNumRows > 0 && currentColValue > 0 && currentPadSizeValue > 0) { // Ensure other values are valid before updating
        updateMatrix(currentRowValue, currentColValue, currentPadSizeValue);
    }
}

if (rowsFaderSVG) {
    rowsFaderSVG.addEventListener('mousedown', (event) => {
        if (isDraggingBPM || isGesturingBPM || isGesturingColsFader || isGesturingPadSizeFader) return;
        isDraggingRowsFader = true;
        document.body.style.cursor = 'grabbing';
        let svgX = event.clientX - rowsFaderSVG.getBoundingClientRect().left;
        let calculatedRows = calculateValueFromX(svgX, ROWS_FADER_TRACK_X, ROWS_FADER_TRACK_WIDTH, MIN_ROWS, MAX_ROWS, ROWS_FADER_THUMB_WIDTH);
        handleRowsChange(calculatedRows);
        document.addEventListener('mousemove', rowsFaderMouseMoveHandler);
        document.addEventListener('mouseup', rowsFaderMouseUpHandler);
    });
}

function rowsFaderMouseMoveHandler(event) {
    if (isDraggingRowsFader) {
        event.preventDefault();
        let svgX = event.clientX - rowsFaderSVG.getBoundingClientRect().left;
        let calculatedRows = calculateValueFromX(svgX, ROWS_FADER_TRACK_X, ROWS_FADER_TRACK_WIDTH, MIN_ROWS, MAX_ROWS, ROWS_FADER_THUMB_WIDTH);
        handleRowsChange(calculatedRows);
    }
}

function rowsFaderMouseUpHandler() {
    if (isDraggingRowsFader) {
        isDraggingRowsFader = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', rowsFaderMouseMoveHandler);
        document.removeEventListener('mouseup', rowsFaderMouseUpHandler);
    }
}

// --- Columns Fader Event Handlers ---
function handleColsChange(newValue) {
    currentColValue = updateFaderVisualsDOM(newValue, colsFaderThumb, colsValueDisplay, COLS_FADER_TRACK_X, COLS_FADER_TRACK_WIDTH, MIN_COLS, MAX_COLS, COLS_FADER_THUMB_WIDTH, "Cols: ");
    if (currentRowValue > 0 && currentNumCols > 0 && currentPadSizeValue > 0) {
        updateMatrix(currentRowValue, currentColValue, currentPadSizeValue);
    }
}

if (colsFaderSVG) {
    colsFaderSVG.addEventListener('mousedown', (event) => {
        if (isDraggingBPM || isGesturingBPM || isGesturingRowsFader || isGesturingPadSizeFader) return;
        isDraggingColsFader = true;
        document.body.style.cursor = 'grabbing';
        let svgX = event.clientX - colsFaderSVG.getBoundingClientRect().left;
        let calculatedCols = calculateValueFromX(svgX, COLS_FADER_TRACK_X, COLS_FADER_TRACK_WIDTH, MIN_COLS, MAX_COLS, COLS_FADER_THUMB_WIDTH);
        handleColsChange(calculatedCols);
        document.addEventListener('mousemove', colsFaderMouseMoveHandler);
        document.addEventListener('mouseup', colsFaderMouseUpHandler);
    });
}

function colsFaderMouseMoveHandler(event) {
    if (isDraggingColsFader) {
        event.preventDefault();
        let svgX = event.clientX - colsFaderSVG.getBoundingClientRect().left;
        let calculatedCols = calculateValueFromX(svgX, COLS_FADER_TRACK_X, COLS_FADER_TRACK_WIDTH, MIN_COLS, MAX_COLS, COLS_FADER_THUMB_WIDTH);
        handleColsChange(calculatedCols);
    }
}

function colsFaderMouseUpHandler() {
    if (isDraggingColsFader) {
        isDraggingColsFader = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', colsFaderMouseMoveHandler);
        document.removeEventListener('mouseup', colsFaderMouseUpHandler);
    }
}

// --- Pad Size Fader Event Handlers ---
function handlePadSizeChange(newValue) {
    currentPadSizeValue = updateFaderVisualsDOM(newValue, padSizeFaderThumb, padSizeValueDisplay, PAD_SIZE_FADER_TRACK_X, PAD_SIZE_FADER_TRACK_WIDTH, MIN_PAD_SIZE, MAX_PAD_SIZE, PAD_SIZE_FADER_THUMB_WIDTH, "Size: ", "px");
    if (currentRowValue > 0 && currentColValue > 0 && currentPadSizeValue > 0) {
         updateMatrix(currentRowValue, currentColValue, currentPadSizeValue);
    }
}

if (padSizeFaderSVG) {
    padSizeFaderSVG.addEventListener('mousedown', (event) => {
        if (isDraggingBPM || isGesturingBPM || isGesturingRowsFader || isGesturingColsFader) return;
        isDraggingPadSizeFader = true;
        document.body.style.cursor = 'grabbing';
        let svgX = event.clientX - padSizeFaderSVG.getBoundingClientRect().left;
        let calculatedPadSize = calculateValueFromX(svgX, PAD_SIZE_FADER_TRACK_X, PAD_SIZE_FADER_TRACK_WIDTH, MIN_PAD_SIZE, MAX_PAD_SIZE, PAD_SIZE_FADER_THUMB_WIDTH);
        handlePadSizeChange(calculatedPadSize);
        document.addEventListener('mousemove', padSizeFaderMouseMoveHandler);
        document.addEventListener('mouseup', padSizeFaderMouseUpHandler);
    });
}

function padSizeFaderMouseMoveHandler(event) {
    if (isDraggingPadSizeFader) {
        event.preventDefault();
        let svgX = event.clientX - padSizeFaderSVG.getBoundingClientRect().left;
        let calculatedPadSize = calculateValueFromX(svgX, PAD_SIZE_FADER_TRACK_X, PAD_SIZE_FADER_TRACK_WIDTH, MIN_PAD_SIZE, MAX_PAD_SIZE, PAD_SIZE_FADER_THUMB_WIDTH);
        handlePadSizeChange(calculatedPadSize);
    }
}

function padSizeFaderMouseUpHandler() {
    if (isDraggingPadSizeFader) {
        isDraggingPadSizeFader = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', padSizeFaderMouseMoveHandler);
        document.removeEventListener('mouseup', padSizeFaderMouseUpHandler);
    }
}


// Initialize matrix on load and set up button listener
document.addEventListener('DOMContentLoaded', () => {
    // Remove old input field based update logic
    // const rowsInput = document.getElementById('rowsInput');
    // const colsInput = document.getElementById('colsInput');
    // const padSizeInput = document.getElementById('padSizeInput');
    // const updateMatrixBtn = document.getElementById('updateMatrixBtn');
    // if (updateMatrixBtn && rowsInput && colsInput && padSizeInput) { ... }

    // Initial setup calls
    if (horizontalBpmFaderSVG && faderThumb && bpmTextDisplay) {
      updateBPMVisuals(bpm);
    }

    // Initialize new faders (Rows, Cols, PadSize)
    currentRowValue = updateFaderVisualsDOM(currentRowValue, rowsFaderThumb, rowsValueDisplay, ROWS_FADER_TRACK_X, ROWS_FADER_TRACK_WIDTH, MIN_ROWS, MAX_ROWS, ROWS_FADER_THUMB_WIDTH, "Rows: ");
    currentColValue = updateFaderVisualsDOM(currentColValue, colsFaderThumb, colsValueDisplay, COLS_FADER_TRACK_X, COLS_FADER_TRACK_WIDTH, MIN_COLS, MAX_COLS, COLS_FADER_THUMB_WIDTH, "Cols: ");
    currentPadSizeValue = updateFaderVisualsDOM(currentPadSizeValue, padSizeFaderThumb, padSizeValueDisplay, PAD_SIZE_FADER_TRACK_X, PAD_SIZE_FADER_TRACK_WIDTH, MIN_PAD_SIZE, MAX_PAD_SIZE, PAD_SIZE_FADER_THUMB_WIDTH, "Size: ", "px");

    // Initial matrix creation using default values set by fader initializations
    updateMatrix(currentRowValue, currentColValue, currentPadSizeValue);
});

// Removed old global updateBPMVisuals calls for circular fader.

// =============== MEDIA PIPE ====================
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function isPinching(lmCollection) {
  if (!lmCollection[4] || !lmCollection[8]) return false;
  return distance(lmCollection[4].x, lmCollection[4].y, lmCollection[8].x, lmCollection[8].y) < 0.02;
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
      if(video) await hands.send({ image: video });
    },
    width: 1280,
    height: 720
  });
  camera.start();

  hands.onResults(results => {
    if (canvas && ctx && results.image) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }

    pads.forEach(p => p.classList.remove('highlight'));
    let aHandIsActivelyGesturingBPM = false;

    if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach((handLandmarks, handIndex) => {
        const thumbTip = handLandmarks[4];
        const indexTip = handLandmarks[8];

        if (!thumbTip || !indexTip) {
            return;
        }

        const indexTipX_screen = (1 - indexTip.x) * window.innerWidth;
        const indexTipY_screen = indexTip.y * window.innerHeight;

        let pinchOnBpmFader = false;
        let pinchOnRowsFader = false;
        let pinchOnColsFader = false;
        let pinchOnPadSizeFader = false;
        const isCurrentlyPinching = isPinching(handLandmarks);

        let faderInteractionYMin = 10; // General Y activation for smaller faders
        let faderInteractionYMax = 40; // General Y activation for smaller faders

        // Check for pinch on BPM Fader
        // Condition: currently pinching, no mouse drag active on ANY fader
        if (horizontalBpmFaderSVG && faderThumb && isCurrentlyPinching &&
            !isDraggingBPM && !isDraggingRowsFader && !isDraggingColsFader && !isDraggingPadSizeFader) {
            const rect = horizontalBpmFaderSVG.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const pinchSvgX = (indexTipX_screen - rect.left);
                const pinchSvgY = (indexTipY_screen - rect.top);
                if (pinchSvgX >= H_BPM_FADER_TRACK_X && pinchSvgX <= H_BPM_FADER_TRACK_X + H_BPM_FADER_TRACK_WIDTH &&
                    pinchSvgY >= faderInteractionYMin && pinchSvgY <= faderInteractionYMax + 10) { // BPM fader is a bit taller
                    pinchOnBpmFader = true;
                    aHandIsActivelyGesturingBPM = true;
                    if (!isGesturingBPM) isGesturingBPM = true;
                    let val = calculateValueFromX(pinchSvgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
                    updateBPMVisuals(val);
                }
            }
        }

        // Check for pinch on Rows Fader (only if not already interacting with BPM fader via pinch)
        if (rowsFaderSVG && rowsFaderThumb && isCurrentlyPinching && !pinchOnBpmFader &&
            !isDraggingBPM && !isDraggingRowsFader && !isDraggingColsFader && !isDraggingPadSizeFader) {
            const rect = rowsFaderSVG.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const pinchSvgX = (indexTipX_screen - rect.left);
                const pinchSvgY = (indexTipY_screen - rect.top);
                if (pinchSvgX >= ROWS_FADER_TRACK_X && pinchSvgX <= ROWS_FADER_TRACK_X + ROWS_FADER_TRACK_WIDTH &&
                    pinchSvgY >= faderInteractionYMin && pinchSvgY <= faderInteractionYMax) {
                    pinchOnRowsFader = true;
                    aHandIsActivelyGesturingBPM = true;
                    if (!isGesturingRowsFader) isGesturingRowsFader = true;
                    let val = calculateValueFromX(pinchSvgX, ROWS_FADER_TRACK_X, ROWS_FADER_TRACK_WIDTH, MIN_ROWS, MAX_ROWS, ROWS_FADER_THUMB_WIDTH);
                    handleRowsChange(val);
                }
            }
        }

        // Check for pinch on Columns Fader (only if not already interacting with other faders via pinch)
        if (colsFaderSVG && colsFaderThumb && isCurrentlyPinching && !pinchOnBpmFader && !pinchOnRowsFader &&
            !isDraggingBPM && !isDraggingRowsFader && !isDraggingColsFader && !isDraggingPadSizeFader) {
            const rect = colsFaderSVG.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const pinchSvgX = (indexTipX_screen - rect.left);
                const pinchSvgY = (indexTipY_screen - rect.top);
                if (pinchSvgX >= COLS_FADER_TRACK_X && pinchSvgX <= COLS_FADER_TRACK_X + COLS_FADER_TRACK_WIDTH &&
                    pinchSvgY >= faderInteractionYMin && pinchSvgY <= faderInteractionYMax) {
                    pinchOnColsFader = true;
                    aHandIsActivelyGesturingBPM = true;
                    if (!isGesturingColsFader) isGesturingColsFader = true;
                    let val = calculateValueFromX(pinchSvgX, COLS_FADER_TRACK_X, COLS_FADER_TRACK_WIDTH, MIN_COLS, MAX_COLS, COLS_FADER_THUMB_WIDTH);
                    handleColsChange(val);
                }
            }
        }

        // Check for pinch on Pad Size Fader (only if not already interacting with other faders via pinch)
        if (padSizeFaderSVG && padSizeFaderThumb && isCurrentlyPinching && !pinchOnBpmFader && !pinchOnRowsFader && !pinchOnColsFader &&
            !isDraggingBPM && !isDraggingRowsFader && !isDraggingColsFader && !isDraggingPadSizeFader) {
            const rect = padSizeFaderSVG.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const pinchSvgX = (indexTipX_screen - rect.left);
                const pinchSvgY = (indexTipY_screen - rect.top);
                if (pinchSvgX >= PAD_SIZE_FADER_TRACK_X && pinchSvgX <= PAD_SIZE_FADER_TRACK_X + PAD_SIZE_FADER_TRACK_WIDTH &&
                    pinchSvgY >= faderInteractionYMin && pinchSvgY <= faderInteractionYMax) {
                    pinchOnPadSizeFader = true;
                    aHandIsActivelyGesturingBPM = true;
                    if (!isGesturingPadSizeFader) isGesturingPadSizeFader = true;
                    let val = calculateValueFromX(pinchSvgX, PAD_SIZE_FADER_TRACK_X, PAD_SIZE_FADER_TRACK_WIDTH, MIN_PAD_SIZE, MAX_PAD_SIZE, PAD_SIZE_FADER_THUMB_WIDTH);
                    handlePadSizeChange(val);
                }
            }
        }

        // Pad interaction logic: only if pinching, not on any fader, and no gesture/drag is active on any fader.
        const onAnyFader = pinchOnBpmFader || pinchOnRowsFader || pinchOnColsFader || pinchOnPadSizeFader;
        const anyFaderGestureActive = isGesturingBPM || isGesturingRowsFader || isGesturingColsFader || isGesturingPadSizeFader;
        const anyFaderMouseDragActive = isDraggingBPM || isDraggingRowsFader || isDraggingColsFader || isDraggingPadSizeFader;

        if (isCurrentlyPinching && !onAnyFader && !anyFaderGestureActive && !anyFaderMouseDragActive) {
            for (let pad of pads) {
                const b = pad.getBoundingClientRect();
                if (distance(b.left + b.width / 2, b.top + b.height / 2, indexTipX_screen, indexTipY_screen) < 50) {
                    pad.classList.add('highlight');
                    triggerPad(pad);
                    break;
                }
            }
        }
      });
    }

    // More nuanced reset logic for gesture flags
    if (!aHandIsActivelyGesturingBPM) { // If no hand is actively gesturing ANY fader in this frame
        if (isGesturingBPM) isGesturingBPM = false;
        if (isGesturingRowsFader) isGesturingRowsFader = false;
        if (isGesturingColsFader) isGesturingColsFader = false;
        if (isGesturingPadSizeFader) isGesturingPadSizeFader = false;
    }
  });
}