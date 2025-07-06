// =================== MIDI =========================
let midiAccess = null;
let midiOut = null;

// Global Variables for Sequencer (Barra Horizontal Principal)
let isPlaying = false;
let currentColumn = 0;
let bpm = 120;
let timerId = null;
const playStopButton = document.getElementById('play-stop-button');

// Global Variables for Secondary Sequencer
let isPlayingSecondary = false;
let currentPositionSecondary = 0; // Pode ser linha ou coluna dependendo da orientação
let bpmSecondary = 120;
let timerIdSecondary = null;
const playStopButtonSecondary = document.getElementById('play-stop-button-secondary');

// --- Controles da Barra Secundária ---
const secondaryNoteOffsetInput = document.getElementById('secondaryNoteOffsetInput');
const orientationBar2Select = document.getElementById('orientationBar2Select');
const directionBar2Select = document.getElementById('directionBar2Select');

let secondaryNoteOffset = parseInt(secondaryNoteOffsetInput.value, 10);
let secondaryBarOrientation = orientationBar2Select.value;
let secondaryBarDirection = ''; // Será definido pela função updateDirectionOptions

// =============== BPM Fader Variables and Constants (Barra Horizontal Principal) ===============
const horizontalBpmFaderSVG = document.getElementById('horizontalBpmFaderSVG');
const faderTrack = document.getElementById('faderTrack');
const faderThumb = document.getElementById('faderThumb');
const bpmTextDisplay = document.getElementById('bpmTextDisplay');

// =============== BPM Fader Variables and Constants (Barra Secundária) ===============
const secondaryBpmFaderSVG = document.getElementById('secondaryBpmFaderSVG');
const secondaryFaderTrack = document.getElementById('secondaryFaderTrack');
const secondaryFaderThumb = document.getElementById('secondaryFaderThumb');
const secondaryBpmTextDisplay = document.getElementById('secondaryBpmTextDisplay');


// --- Fader Geometry Constants (Comum para ambos os faders, assumindo que são idênticos em design) ---
const H_BPM_FADER_SVG_WIDTH = 250;
const H_BPM_FADER_TRACK_X = 10;
const H_BPM_FADER_TRACK_WIDTH = 230;
const H_BPM_FADER_THUMB_WIDTH = 20;

const minBPM = 60;
const maxBPM = 1000;

let isDraggingBPM = false; // Para o fader principal
let isGesturingBPM = false; // Para o fader principal

// =============== Grid Control Elements ===============
const rowsInput = document.getElementById('rowsInput');
const colsInput = document.getElementById('colsInput');
const rowsValueDisplay = document.getElementById('rowsValueDisplay');
const colsValueDisplay = document.getElementById('colsValueDisplay');
const padSizeInput = document.getElementById('padSizeInput');
const padSizeValueDisplay = document.getElementById('padSizeValueDisplay');

let currentNumRows = 4;
let currentNumCols = 4;
let currentPadSize = 60;

const pads = [];

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
    const previousPositionSecondary = currentPositionSecondary; // Store for secondary bar
    const previousNumCols = currentNumCols;
    const previousNumRows = currentNumRows; // Store previous number of rows for vertical secondary bar

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
            p.classList.remove('sequencer-column-indicator'); // Barra Principal
            p.classList.remove('sequencer-indicator-secondary'); // Barra Secundária
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

    // Similar logic for the secondary sequencer
    if (isPlayingSecondary) {
        if (secondaryBarOrientation === 'horizontal') {
            if (currentNumCols === previousNumCols) {
                currentPositionSecondary = previousPositionSecondary;
            } else {
                currentPositionSecondary = Math.min(previousPositionSecondary, currentNumCols - 1);
                if (currentPositionSecondary < 0) currentPositionSecondary = (secondaryBarDirection === 'e2d') ? 0 : (currentNumCols > 0 ? currentNumCols - 1 : 0);
            }
        } else { // vertical
            if (currentNumRows === previousNumRows) {
                currentPositionSecondary = previousPositionSecondary;
            } else {
                currentPositionSecondary = Math.min(previousPositionSecondary, currentNumRows - 1);
                if (currentPositionSecondary < 0) currentPositionSecondary = (secondaryBarDirection === 'c2b') ? 0 : (currentNumRows > 0 ? currentNumRows - 1 : 0);
            }
        }

        // Indicators already cleared above
        clearInterval(timerIdSecondary);
        if ((secondaryBarOrientation === 'horizontal' && currentNumCols > 0) ||
            (secondaryBarOrientation === 'vertical' && currentNumRows > 0)) {
            const columnIntervalSecondary = 60000 / bpmSecondary;
            timerIdSecondary = setInterval(stepSequencerSecondary, columnIntervalSecondary);
            stepSequencerSecondary(true); // Apply indicator without advancing
        } else {
            isPlayingSecondary = false;
            if (playStopButtonSecondary) playStopButtonSecondary.textContent = 'Play Barra Sec';
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


// =============== Sequencer Functions (Barra Secundária) ====================
function togglePlaybackSecondary() {
  isPlayingSecondary = !isPlayingSecondary;
  if (playStopButtonSecondary) {
    playStopButtonSecondary.textContent = isPlayingSecondary ? 'Stop Barra Sec' : 'Play Barra Sec';
  }

  if (isPlayingSecondary) {
    // Validação de colunas/linhas
    if ((secondaryBarOrientation === 'horizontal' && currentNumCols === 0) ||
        (secondaryBarOrientation === 'vertical' && currentNumRows === 0)) {
        console.warn("Sequenciador Secundário iniciado com 0 colunas/linhas relevantes.");
        isPlayingSecondary = false;
        if (playStopButtonSecondary) playStopButtonSecondary.textContent = 'Play Barra Sec';
        return;
    }

    // Definir posição inicial com base na orientação e direção
    if (secondaryBarOrientation === 'horizontal') {
      currentPositionSecondary = (secondaryBarDirection === 'e2d') ? 0 : (currentNumCols > 0 ? currentNumCols - 1 : 0);
    } else { // vertical
      currentPositionSecondary = (secondaryBarDirection === 'c2b') ? 0 : (currentNumRows > 0 ? currentNumRows - 1 : 0);
    }

    stepSequencerSecondary(); // Initial step
    if (timerIdSecondary) clearInterval(timerIdSecondary);
    const columnInterval = 60000 / bpmSecondary; // Usar bpmSecondary
    timerIdSecondary = setInterval(stepSequencerSecondary, columnInterval);
  } else {
    clearInterval(timerIdSecondary);
    pads.forEach(pad => pad.classList.remove('sequencer-indicator-secondary')); // Usar nova classe CSS
  }
}

if (playStopButtonSecondary) {
  playStopButtonSecondary.addEventListener('click', togglePlaybackSecondary);
}

function stepSequencerSecondary(dontAdvanceColumnOrRow = false) { // Nome do parâmetro genérico
  // Validações iniciais
  if ((secondaryBarOrientation === 'horizontal' && currentNumCols <= 0) ||
      (secondaryBarOrientation === 'vertical' && currentNumRows <= 0) ||
      pads.length === 0) {
    return;
  }

  // Limpar indicador anterior
  pads.forEach(p => p.classList.remove('sequencer-indicator-secondary'));

  // Validar currentPositionSecondary
  if (secondaryBarOrientation === 'horizontal') {
    if (currentPositionSecondary < 0 || currentPositionSecondary >= currentNumCols) {
      currentPositionSecondary = (secondaryBarDirection === 'e2d') ? 0 : (currentNumCols > 0 ? currentNumCols - 1 : 0);
    }
  } else { // vertical
    if (currentPositionSecondary < 0 || currentPositionSecondary >= currentNumRows) {
      currentPositionSecondary = (secondaryBarDirection === 'c2b') ? 0 : (currentNumRows > 0 ? currentNumRows - 1 : 0);
    }
  }

  // Lógica de destaque e disparo de notas
  if (secondaryBarOrientation === 'horizontal') {
    for (let r = 0; r < currentNumRows; r++) {
      const padIndex = r * currentNumCols + currentPositionSecondary;
      if (pads[padIndex]) {
        pads[padIndex].classList.add('sequencer-indicator-secondary');
        if (pads[padIndex].classList.contains('active')) {
          const originalNote = parseInt(pads[padIndex].dataset.note);
          const noteToPlay = originalNote + secondaryNoteOffset;
          if (midiOut) {
            midiOut.send([0x90, noteToPlay, 100]);
            setTimeout(() => { if (midiOut) midiOut.send([0x80, noteToPlay, 0]); }, 100);
          }
        }
      }
    }
  } else { // vertical
    for (let c = 0; c < currentNumCols; c++) {
      const padIndex = currentPositionSecondary * currentNumCols + c;
      if (pads[padIndex]) {
        pads[padIndex].classList.add('sequencer-indicator-secondary');
        if (pads[padIndex].classList.contains('active')) {
          const originalNote = parseInt(pads[padIndex].dataset.note);
          const noteToPlay = originalNote + secondaryNoteOffset;
          if (midiOut) {
            midiOut.send([0x90, noteToPlay, 100]);
            setTimeout(() => { if (midiOut) midiOut.send([0x80, noteToPlay, 0]); }, 100);
          }
        }
      }
    }
  }

  // Avançar posição
  if (!dontAdvanceColumnOrRow) {
    if (secondaryBarOrientation === 'horizontal') {
      if (secondaryBarDirection === 'e2d') {
        currentPositionSecondary = (currentPositionSecondary + 1) % currentNumCols;
      } else { // d2e
        currentPositionSecondary = (currentPositionSecondary - 1 + currentNumCols) % currentNumCols;
      }
    } else { // vertical
      if (secondaryBarDirection === 'c2b') {
        currentPositionSecondary = (currentPositionSecondary + 1) % currentNumRows;
      } else { // b2c
        currentPositionSecondary = (currentPositionSecondary - 1 + currentNumRows) % currentNumRows;
      }
    }
  }

  // Detecção de Cruzamento
  if (isPlaying && isPlayingSecondary) {
    if (secondaryBarOrientation === 'horizontal') {
      if (currentColumn === currentPositionSecondary) {
        console.log("Cruzamento Horizontal-Horizontal na coluna:", currentColumn);
      }
    } else { // secondaryBarOrientation === 'vertical'
      // A barra secundária (vertical) está na linha currentPositionSecondary.
      // A barra principal (horizontal) está na coluna currentColumn.
      // O pad de cruzamento é aquele em [linha=currentPositionSecondary, coluna=currentColumn]
      const padIndexAtIntersection = currentPositionSecondary * currentNumCols + currentColumn;
      if (pads[padIndexAtIntersection] && pads[padIndexAtIntersection].classList.contains('sequencer-column-indicator') && pads[padIndexAtIntersection].classList.contains('sequencer-indicator-secondary')) {
         // Este if verifica se AMBOS os indicadores estão no mesmo pad, o que é uma forma mais precisa de detectar o cruzamento visual.
         // No entanto, o log pedido é mais sobre a POSIÇÃO.
         console.log(`Cruzamento Horizontal(col ${currentColumn}) - Vertical(lin ${currentPositionSecondary})`);
      }
    }
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

// =============== BPM Fader Functions (Secundária) ====================
function updateBPMSecondaryVisuals(newBpmValue) {
  let clampedBpm = Math.max(minBPM, Math.min(maxBPM, newBpmValue));
  bpmSecondary = clampedBpm;

  const mainBpmDisplaySecondary = document.getElementById('bpm-display-secondary');
  if (mainBpmDisplaySecondary) {
      mainBpmDisplaySecondary.textContent = `BPM Sec: ${Math.round(clampedBpm)}`;
  }

  if (secondaryFaderThumb && secondaryBpmTextDisplay && secondaryBpmFaderSVG) {
    const normalizedBpm = (maxBPM === minBPM) ? 0 : (clampedBpm - minBPM) / (maxBPM - minBPM);
    const availableTrackWidthForThumb = H_BPM_FADER_TRACK_WIDTH - H_BPM_FADER_THUMB_WIDTH;
    let thumbX = H_BPM_FADER_TRACK_X + normalizedBpm * availableTrackWidthForThumb;
    thumbX = Math.max(H_BPM_FADER_TRACK_X, Math.min(thumbX, H_BPM_FADER_TRACK_X + availableTrackWidthForThumb));
    secondaryFaderThumb.setAttribute('x', thumbX);
    secondaryBpmTextDisplay.textContent = `BPM Sec: ${Math.round(clampedBpm)}`;
  }

  if (isPlayingSecondary) {
    clearInterval(timerIdSecondary);
    const columnInterval = 60000 / bpmSecondary;
    timerIdSecondary = setInterval(stepSequencerSecondary, columnInterval); // Chamar stepSequencerSecondary
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

// Mouse event handlers for BPM fader (Secundária)
let isDraggingBPMSecondary = false;
function horizontalBpmFaderSecondaryMouseDownHandler(event) {
    if (!secondaryBpmFaderSVG) return;
    isDraggingBPMSecondary = true;
    document.body.style.cursor = 'grabbing';
    const svgRect = secondaryBpmFaderSVG.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
    updateBPMSecondaryVisuals(newBpm);
    document.addEventListener('mousemove', horizontalBpmFaderSecondaryMouseMoveHandler);
    document.addEventListener('mouseup', horizontalBpmFaderSecondaryMouseUpHandler);
}

function horizontalBpmFaderSecondaryMouseMoveHandler(event) {
    if (!isDraggingBPMSecondary || !secondaryBpmFaderSVG) return;
    event.preventDefault();
    const svgRect = secondaryBpmFaderSVG.getBoundingClientRect();
    const svgX = event.clientX - svgRect.left;
    let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
    updateBPMSecondaryVisuals(newBpm);
}

function horizontalBpmFaderSecondaryMouseUpHandler() {
    if (isDraggingBPMSecondary) {
        isDraggingBPMSecondary = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', horizontalBpmFaderSecondaryMouseMoveHandler);
        document.removeEventListener('mouseup', horizontalBpmFaderSecondaryMouseUpHandler);
    }
}


if (horizontalBpmFaderSVG) {
    horizontalBpmFaderSVG.addEventListener('mousedown', horizontalBpmFaderMouseDownHandler);
}
if (secondaryBpmFaderSVG) {
    secondaryBpmFaderSVG.addEventListener('mousedown', horizontalBpmFaderSecondaryMouseDownHandler);
}

// Function to update direction options for the secondary bar
function updateDirectionOptions() {
    directionBar2Select.innerHTML = ''; // Clear existing options
    secondaryBarOrientation = orientationBar2Select.value;

    if (secondaryBarOrientation === 'vertical') {
        directionBar2Select.add(new Option('Cima para Baixo', 'c2b'));
        directionBar2Select.add(new Option('Baixo para Cima', 'b2c'));
    } else { // horizontal
        directionBar2Select.add(new Option('Esquerda para Direita', 'e2d'));
        directionBar2Select.add(new Option('Direita para Esquerda', 'd2e'));
    }
    secondaryBarDirection = directionBar2Select.value; // Update global direction
}


// =============== Initialization and Event Listeners ===============
document.addEventListener('DOMContentLoaded', () => {
    // Initialize BPM fader visuals (Principal)
    if (horizontalBpmFaderSVG && faderThumb && bpmTextDisplay) {
         updateBPMVisuals(bpm);
    } else {
        // console.warn("BPM Fader (Principal) elements not all found on DOMContentLoaded.");
    }
    // Initialize BPM fader visuals (Secundária)
    if (secondaryBpmFaderSVG && secondaryFaderThumb && secondaryBpmTextDisplay) {
         updateBPMSecondaryVisuals(bpmSecondary);
    } else {
        // console.warn("BPM Fader (Secondary) elements not all found on DOMContentLoaded.");
    }

    // Initialize and set up event listeners for new controls
    if (secondaryNoteOffsetInput && orientationBar2Select && directionBar2Select) {
        secondaryNoteOffsetInput.addEventListener('input', () => {
            secondaryNoteOffset = parseInt(secondaryNoteOffsetInput.value, 10);
            if (isNaN(secondaryNoteOffset)) secondaryNoteOffset = 0; // Default if input is invalid
        });

        orientationBar2Select.addEventListener('change', () => {
            updateDirectionOptions();
            // TODO: Add logic to stop and reset secondary sequencer if its orientation/direction changes while playing
            if(isPlayingSecondary) {
                togglePlaybackSecondary(); // Stop it
                // Reset position based on new orientation/direction might be needed here or in togglePlaybackSecondary
            }
        });
        directionBar2Select.addEventListener('change', () => {
            secondaryBarDirection = directionBar2Select.value;
            // TODO: Similar logic to stop/reset if direction changes while playing
             if(isPlayingSecondary) {
                togglePlaybackSecondary(); // Stop it
            }
        });
        updateDirectionOptions(); // Initial population of direction options
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
