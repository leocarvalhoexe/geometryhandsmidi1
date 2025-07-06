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
const horizontalBpmFaderSVG = document.getElementById('horizontalBpmFaderSVG');
const faderTrack = document.getElementById('faderTrack'); // Assuming this is for BPM fader
const faderThumb = document.getElementById('faderThumb'); // Assuming this is for BPM fader
const bpmTextDisplay = document.getElementById('bpmTextDisplay'); // For BPM fader's text

// --- Horizontal BPM Fader Geometry Constants ---
// Adjusted to match the new SVG width in beatmatrixexe_v74.html (250px width, track width 230px)
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
const padSizeInput = document.getElementById('padSizeInput');
const updateMatrixBtn = document.getElementById('updateMatrixBtn');

let currentNumRows = 4; // Default value, will be updated from input
let currentNumCols = 4; // Default value, will be updated from input
let currentPadSize = 60; // Default value, will be updated from input

const pads = []; // Global array to store pad elements

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
    grid.innerHTML = ''; // Clear old pads
    pads.length = 0;   // Clear the global 'pads' array

    currentNumRows = parseInt(numRows, 10); // Update global state
    currentNumCols = parseInt(numCols, 10);
    currentPadSize = parseInt(padSize, 10);

    if (isNaN(currentNumRows) || currentNumRows <= 0 ||
        isNaN(currentNumCols) || currentNumCols <= 0 ||
        isNaN(currentPadSize) || currentPadSize <= 0) {
        console.error("Invalid grid dimensions or pad size.");
        // Optionally, provide feedback to the user here
        return;
    }

    grid.style.gridTemplateColumns = `repeat(${currentNumCols}, 1fr)`;
    // Optional: Adjust gap based on padSize or keep it fixed. Example:
    // grid.style.gap = `${Math.max(2, Math.floor(currentPadSize / 10))}px`;
    grid.style.gap = '10px'; // Keeping fixed gap for now

    const baseNote = 36; // Starting MIDI note

    for (let i = 0; i < currentNumRows * currentNumCols; i++) {
        const pad = document.createElement('div');
        pad.classList.add('pad');
        pad.style.width = `${currentPadSize}px`;
        pad.style.height = `${currentPadSize}px`;
        pad.textContent = i + 1; // Simple 1-based indexing for display
        pad.dataset.note = baseNote + i;
        pad.onclick = () => triggerPad(pad);
        grid.appendChild(pad);
        pads.push(pad);
    }

    if (isPlaying) {
        currentColumn = 0; // Reset sequencer column
        // If sequencer was playing, restart it with new settings
        // togglePlayback(); // Stop
        // togglePlayback(); // Start (this will re-read BPM and re-calculate interval)
        // More direct approach:
        clearInterval(timerId);
        const columnInterval = 60000 / bpm;
        timerId = setInterval(stepSequencer, columnInterval);
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

function stepSequencer() {
  if (currentNumCols <= 0 || pads.length === 0) { // Safety check
    // console.log("Step sequencer called with no columns or pads.");
    return;
  }

  pads.forEach(p => p.classList.remove('sequencer-column-indicator'));

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
  currentColumn = (currentColumn + 1) % currentNumCols;
}

// =============== BPM Fader Functions (Horizontal) ====================
function updateBPMVisuals(newBpmValue) {
  let clampedBpm = Math.max(minBPM, Math.min(maxBPM, newBpmValue));
  bpm = clampedBpm;

  const mainBpmDisplay = document.getElementById('bpm-display');
  if (mainBpmDisplay) {
      mainBpmDisplay.textContent = `BPM: ${Math.round(clampedBpm)}`;
  }

  if (faderThumb && bpmTextDisplay && horizontalBpmFaderSVG) { // Ensure all elements exist
    const normalizedBpm = (maxBPM === minBPM) ? 0 : (clampedBpm - minBPM) / (maxBPM - minBPM);
    const availableTrackWidthForThumb = H_BPM_FADER_TRACK_WIDTH - H_BPM_FADER_THUMB_WIDTH;
    let thumbX = H_BPM_FADER_TRACK_X + normalizedBpm * availableTrackWidthForThumb;
    // Clamp thumbX to be within the track boundaries
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

function calculateValueFromX(svgX, trackX, trackWidth, minValue, maxValue, thumbWidth) {
    let normalizedPosition = (svgX - trackX - (thumbWidth / 2)) / (trackWidth - thumbWidth);
    normalizedPosition = Math.max(0, Math.min(1, normalizedPosition));
    let value = minValue + normalizedPosition * (maxValue - minValue);
    return Math.round(value);
}

// Mouse event handlers for BPM fader
function horizontalBpmFaderMouseDownHandler(event) {
    if (!horizontalBpmFaderSVG) return; // Safety check
    isDraggingBPM = true;
    document.body.style.cursor = 'grabbing';
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

function horizontalBpmFaderMouseUpHandler() {
    if (isDraggingBPM) {
        isDraggingBPM = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', horizontalBpmFaderMouseMoveHandler);
        document.removeEventListener('mouseup', horizontalBpmFaderMouseUpHandler);
    }
}

if (horizontalBpmFaderSVG) { // Check if the BPM fader SVG element exists
    horizontalBpmFaderSVG.addEventListener('mousedown', horizontalBpmFaderMouseDownHandler);
}


// =============== Initialization and Event Listeners ===============
document.addEventListener('DOMContentLoaded', () => {
    // Initialize BPM fader visuals
    if (horizontalBpmFaderSVG && faderThumb && bpmTextDisplay) {
         updateBPMVisuals(bpm); // Initialize with default BPM
    } else {
        // console.warn("BPM Fader elements not all found on DOMContentLoaded.");
    }

    // Set initial values for input fields and matrix
    if (rowsInput && colsInput && padSizeInput) {
        rowsInput.value = currentNumRows;
        colsInput.value = currentNumCols;
        padSizeInput.value = currentPadSize;
        updateMatrix(currentNumRows, currentNumCols, currentPadSize);
    } else {
        // console.warn("Grid control input elements not all found on DOMContentLoaded.");
        // Fallback to default if inputs are missing, though this shouldn't happen with correct HTML
        updateMatrix(4, 4, 60);
    }

    if (updateMatrixBtn) {
        updateMatrixBtn.addEventListener('click', () => {
            const numRows = rowsInput.value;
            const numCols = colsInput.value;
            const size = padSizeInput.value;
            updateMatrix(numRows, numCols, size);
        });
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
