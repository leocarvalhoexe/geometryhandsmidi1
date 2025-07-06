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
let secondarySyncSpeedDirection = 'up'; // 'up' or 'down'
let secondarySyncFactor = 2;

// --- Controles da Barra Secundária ---
const secondaryNoteOffsetInput = document.getElementById('secondaryNoteOffsetInput');
const orientationBar2Select = document.getElementById('orientationBar2Select');
const directionBar2Select = document.getElementById('directionBar2Select');
const secondarySyncSpeedDirectionInput = document.getElementById('secondarySyncSpeedDirection');
const secondarySyncFactorInput = document.getElementById('secondarySyncFactor');


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

// =============== Extra Bars Elements ===============
const addExtraBarButton = document.getElementById('add-extra-bar-button');
const extraBarsControlsContainer = document.getElementById('extra-bars-controls-container');
let extraBars = []; // Array to store state and controls of extra bars
let nextExtraBarId = 0;
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

    // Sincronizar a segunda barra se estiver tocando
    if (isPlayingSecondary) {
        synchronizeSecondaryBar();
    }
    // Sincronizar barras extras
    extraBars.forEach(bar => {
        if (bar.isPlaying) {
            synchronizeExtraBar(bar);
        }
    });


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
    if (currentColumn === 0) { // Chegou ao início da barra principal
        if (isPlayingSecondary) {
            synchronizeSecondaryBar(true); // Força o reinício da barra secundária
        }
        extraBars.forEach(bar => {
            if (bar.isPlaying) {
                synchronizeExtraBar(bar, true); // Força o reinício da barra extra
            }
        });
    }
  }

  // Detecção de Cruzamento (apenas log por enquanto)
  // if (isPlaying && isPlayingVertical && currentColumn === currentColumnVertical) { // isPlayingVertical e currentColumnVertical não existem mais
  //   console.log("Barras cruzadas na coluna:", currentColumn);
  // }
}

function calculateSecondaryBPM() {
    let calculatedBpmSecondary = bpm; // Começa com o BPM da barra principal
    if (secondarySyncSpeedDirection === 'up') {
        calculatedBpmSecondary *= secondarySyncFactor;
    } else { // 'down'
        calculatedBpmSecondary /= secondarySyncFactor;
    }
    return Math.max(minBPM, Math.min(maxBPM, calculatedBpmSecondary)); // Garante que está dentro dos limites
}

function synchronizeSecondaryBar(forceReset = false) {
    if (!isPlaying || !isPlayingSecondary) return;

    bpmSecondary = calculateSecondaryBPM();
    updateBPMSecondaryVisuals(bpmSecondary, false); // Atualiza visual sem reiniciar timer ainda

    if (timerIdSecondary) clearInterval(timerIdSecondary);

    // Reinicia a posição da barra secundária para sincronizar com o início da principal
    if (forceReset || currentColumn === 0) {
         if (secondaryBarOrientation === 'horizontal') {
            currentPositionSecondary = (secondaryBarDirection === 'e2d') ? 0 : (currentNumCols > 0 ? currentNumCols - 1 : 0);
        } else { // vertical
            currentPositionSecondary = (secondaryBarDirection === 'c2b') ? 0 : (currentNumRows > 0 ? currentNumRows - 1 : 0);
        }
    }

    const columnIntervalSecondary = 60000 / bpmSecondary;
    stepSequencerSecondary(true); // Aplica o indicador na posição atual sem avançar
    timerIdSecondary = setInterval(stepSequencerSecondary, columnIntervalSecondary);
}


// =============== Sequencer Functions (Barra Secundária) ====================
function togglePlaybackSecondary() {
  isPlayingSecondary = !isPlayingSecondary;
  if (playStopButtonSecondary) {
    playStopButtonSecondary.textContent = isPlayingSecondary ? 'Stop Barra Sec' : 'Play Barra Sec';
  }

  if (isPlayingSecondary) {
    if ((secondaryBarOrientation === 'horizontal' && currentNumCols === 0) ||
        (secondaryBarOrientation === 'vertical' && currentNumRows === 0)) {
        console.warn("Sequenciador Secundário iniciado com 0 colunas/linhas relevantes.");
        isPlayingSecondary = false;
        if (playStopButtonSecondary) playStopButtonSecondary.textContent = 'Play Barra Sec';
        return;
    }

    bpmSecondary = calculateSecondaryBPM(); // Calcula BPM baseado na principal e nos fatores
    updateBPMSecondaryVisuals(bpmSecondary, false); // Atualiza visual, mas não reinicia timer ainda

    // Definir posição inicial com base na orientação e direção
    if (secondaryBarOrientation === 'horizontal') {
      currentPositionSecondary = (secondaryBarDirection === 'e2d') ? 0 : (currentNumCols > 0 ? currentNumCols - 1 : 0);
    } else { // vertical
      currentPositionSecondary = (secondaryBarDirection === 'c2b') ? 0 : (currentNumRows > 0 ? currentNumRows - 1 : 0);
    }

    stepSequencerSecondary(true); // Initial step (don't advance, just show indicator)
    if (timerIdSecondary) clearInterval(timerIdSecondary);

    // A sincronização real do timer acontece se a barra principal estiver tocando
    if (isPlaying) {
        synchronizeSecondaryBar(true); // Força reset ao iniciar
    } else {
        // Se a barra principal não está tocando, a secundária toca com seu BPM calculado
        const columnInterval = 60000 / bpmSecondary;
        timerIdSecondary = setInterval(stepSequencerSecondary, columnInterval);
    }

  } else {
    clearInterval(timerIdSecondary);
    pads.forEach(pad => pad.classList.remove('sequencer-indicator-secondary'));
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
      const padIndexAtIntersection = currentPositionSecondary * currentNumCols + currentColumn;
      if (pads[padIndexAtIntersection] && pads[padIndexAtIntersection].classList.contains('sequencer-column-indicator') && pads[padIndexAtIntersection].classList.contains('sequencer-indicator-secondary')) {
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
      mainBpmDisplay.textContent = `BPM Prin: ${Math.round(clampedBpm)}`; // Atualizado
  }

  if (faderThumb && bpmTextDisplay && horizontalBpmFaderSVG) {
    const normalizedBpm = (maxBPM === minBPM) ? 0 : (clampedBpm - minBPM) / (maxBPM - minBPM);
    const availableTrackWidthForThumb = H_BPM_FADER_TRACK_WIDTH - H_BPM_FADER_THUMB_WIDTH;
    let thumbX = H_BPM_FADER_TRACK_X + normalizedBpm * availableTrackWidthForThumb;
    thumbX = Math.max(H_BPM_FADER_TRACK_X, Math.min(thumbX, H_BPM_FADER_TRACK_X + availableTrackWidthForThumb));
    faderThumb.setAttribute('x', thumbX);
    bpmTextDisplay.textContent = `BPM Prin: ${Math.round(clampedBpm)}`; // Atualizado
  }

  if (isPlaying) {
    clearInterval(timerId);
    const columnInterval = 60000 / bpm;
    timerId = setInterval(stepSequencer, columnInterval);
    // Re-sincronizar a barra secundária e extras se o BPM principal mudar
    if (isPlayingSecondary) {
        synchronizeSecondaryBar();
    }
    extraBars.forEach(bar => {
        if (bar.isPlaying) {
            synchronizeExtraBar(bar);
        }
    });
  }
}

// =============== BPM Fader Functions (Secundária) ====================
// Modificado para aceitar um parâmetro opcional para não reiniciar o timer, útil durante a sincronização.
function updateBPMSecondaryVisuals(newBpmValue, restartTimerIfPlaying = true) {
  let clampedBpm = Math.max(minBPM, Math.min(maxBPM, newBpmValue));
  // bpmSecondary é agora mais um "display" do BPM efetivo, que pode ser recalculado.
  // A variável bpmSecondary ainda guarda o valor do fader, mas o BPM efetivo é calculado.
  // Para simplificar, vamos assumir que newBpmValue já é o BPM calculado para a barra secundária se o fader não for usado.

  const actualSecondaryBpm = calculateSecondaryBPM(); // Usa o BPM principal e fatores

  const mainBpmDisplaySecondary = document.getElementById('bpm-display-secondary');
  if (mainBpmDisplaySecondary) {
      mainBpmDisplaySecondary.textContent = `BPM Sec: ${Math.round(actualSecondaryBpm)}`;
  }

  // Atualiza o fader da barra secundária para refletir o valor do SEU fader, não o BPM sincronizado.
  // Se o usuário move o fader da barra secundária, ele DESLIGA a sincronização.
  // Por agora, vamos manter o fader da secundária independente e a sincronização um override.
  // Ou seja, o fader da secundária define um bpmSecondary "base" que é ignorado se a sincronização estiver ativa.
  // Para este exemplo, vamos assumir que o newBpmValue é o valor que o fader DEVERIA mostrar.
  // E que bpmSecondary (global) é o valor base do fader da secundária.

  if (secondaryFaderThumb && secondaryBpmTextDisplay && secondaryBpmFaderSVG) {
    const normalizedBpm = (maxBPM === minBPM) ? 0 : (clampedBpm - minBPM) / (maxBPM - minBPM); // Usa o clampedBpm do fader
    const availableTrackWidthForThumb = H_BPM_FADER_TRACK_WIDTH - H_BPM_FADER_THUMB_WIDTH;
    let thumbX = H_BPM_FADER_TRACK_X + normalizedBpm * availableTrackWidthForThumb;
    thumbX = Math.max(H_BPM_FADER_TRACK_X, Math.min(thumbX, H_BPM_FADER_TRACK_X + availableTrackWidthForThumb));
    secondaryFaderThumb.setAttribute('x', thumbX);
    secondaryBpmTextDisplay.textContent = `BPM Sec: ${Math.round(clampedBpm)}`; // Mostra o valor do fader
  }

  if (isPlayingSecondary && restartTimerIfPlaying) {
    clearInterval(timerIdSecondary);
    // Se a barra principal estiver tocando, a secundária deve sincronizar.
    // Se não, ela toca com o BPM do seu fader.
    const effectiveBpmForSecondary = isPlaying ? actualSecondaryBpm : clampedBpm;
    const columnInterval = 60000 / effectiveBpmForSecondary;
    timerIdSecondary = setInterval(stepSequencerSecondary, columnInterval);
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
         updateBPMSecondaryVisuals(bpmSecondary); // Passa o valor base do fader
    } else {
        // console.warn("BPM Fader (Secondary) elements not all found on DOMContentLoaded.");
    }

    // Initialize and set up event listeners for new controls (Barra Secundária)
    if (secondaryNoteOffsetInput && orientationBar2Select && directionBar2Select && secondarySyncSpeedDirectionInput && secondarySyncFactorInput) {
        secondaryNoteOffsetInput.addEventListener('input', () => {
            secondaryNoteOffset = parseInt(secondaryNoteOffsetInput.value, 10);
            if (isNaN(secondaryNoteOffset)) secondaryNoteOffset = 0;
        });

        orientationBar2Select.addEventListener('change', () => {
            updateDirectionOptions();
            if(isPlayingSecondary) {
                togglePlaybackSecondary(); // Stop it
                // Consider resyncing or resetting position if needed
            }
        });
        directionBar2Select.addEventListener('change', () => {
            secondaryBarDirection = directionBar2Select.value;
             if(isPlayingSecondary) {
                togglePlaybackSecondary(); // Stop it
                 // Consider resyncing or resetting position
            }
        });
        updateDirectionOptions(); // Initial population

        secondarySyncSpeedDirectionInput.addEventListener('change', (event) => {
            secondarySyncSpeedDirection = event.target.value;
            if (isPlayingSecondary && isPlaying) { // Se ambas estiverem tocando, resincronizar
                synchronizeSecondaryBar(true);
            } else if (isPlayingSecondary) { // Se só a secundária estiver tocando, recalcular seu BPM
                 bpmSecondary = calculateSecondaryBPM();
                 updateBPMSecondaryVisuals(bpmSecondary); // Isso vai reiniciar o timer com o novo BPM
            }
        });

        secondarySyncFactorInput.addEventListener('input', (event) => {
            let factor = parseInt(event.target.value, 10);
            if (isNaN(factor) || factor < 1) {
                factor = 1; // Mínimo de 1
                secondarySyncFactorInput.value = factor;
            }
            secondarySyncFactor = factor;
            if (isPlayingSecondary && isPlaying) {
                synchronizeSecondaryBar(true);
            } else if (isPlayingSecondary) {
                 bpmSecondary = calculateSecondaryBPM();
                 updateBPMSecondaryVisuals(bpmSecondary);
            }
        });

        // Set initial values from HTML (if different from defaults)
        secondarySyncSpeedDirection = secondarySyncSpeedDirectionInput.value;
        secondarySyncFactor = parseInt(secondarySyncFactorInput.value, 10);

    }

    // Event listener for adding extra bars
    if (addExtraBarButton) {
        addExtraBarButton.addEventListener('click', addExtraBar);
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

// =============== Extra Bars Functions ====================
function addExtraBar() {
    const barId = nextExtraBarId++;
    const barInstance = {
        id: barId,
        isPlaying: false,
        currentPosition: 0,
        bpm: 120, // Default BPM, can be made configurable
        timerId: null,
        noteOffset: 12, // Default offset
        orientation: 'horizontal', // Default orientation
        direction: 'e2d', // Default direction 'esquerda para direita'
        syncSpeedDirection: 'up',
        syncFactor: 2,
        indicatorClass: `sequencer-indicator-extra-${barId}`,
        // Elementos de controle
        controlsDiv: null,
        playStopButton: null,
        bpmDisplay: null,
        bpmFaderSVG: null,
        bpmFaderThumb: null,
        bpmTextDisplay: null,
        noteOffsetInput: null,
        orientationSelect: null,
        directionSelect: null,
        syncSpeedDirectionInput: null,
        syncFactorInput: null,
    };

    // Create controls HTML
    const controlsDiv = document.createElement('div');
    controlsDiv.classList.add('extra-bar-controls');
    controlsDiv.style.border = "1px solid #777";
    controlsDiv.style.padding = "10px";
    controlsDiv.style.marginTop = "10px";
    controlsDiv.innerHTML = `
        <h4>Barra Extra ${barId + 1}</h4>
        <div class="control-group-horizontal">
            <button id="play-stop-extra-${barId}">Play Barra Extra ${barId + 1}</button>
            <div id="bpm-display-extra-${barId}">BPM Extra: ${barInstance.bpm}</div>
        </div>
        <div id="faderContainer-extra-${barId}">
            <svg id="bpmFaderSVG-extra-${barId}" width="250" height="60">
                <rect id="faderTrack-extra-${barId}" x="10" y="20" width="230" height="10" rx="5" ry="5" fill="url(#faderTrackGradient)" stroke="#505050" stroke-width="1"/>
                <rect id="faderThumb-extra-${barId}" x="10" y="15" width="20" height="20" rx="3" ry="3" fill="#2196F3" stroke="#1976D2" stroke-width="1" style="cursor: pointer;"/>
                <text id="bpmTextDisplay-extra-${barId}" x="125" y="50" font-family="Arial, sans-serif" font-size="16" fill="white" text-anchor="middle">BPM Extra: ${barInstance.bpm}</text>
            </svg>
        </div>
        <div class="control-group">
            <label for="noteOffsetInput-extra-${barId}">Offset Semitons:</label>
            <input type="number" id="noteOffsetInput-extra-${barId}" value="${barInstance.noteOffset}" style="width: 60px;">
        </div>
        <div class="control-group">
            <label for="orientationSelect-extra-${barId}">Orientação:</label>
            <select id="orientationSelect-extra-${barId}">
                <option value="horizontal" ${barInstance.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                <option value="vertical" ${barInstance.orientation === 'vertical' ? 'selected' : ''}>Vertical</option>
            </select>
        </div>
        <div class="control-group">
            <label for="directionSelect-extra-${barId}">Sentido:</label>
            <select id="directionSelect-extra-${barId}"></select>
        </div>
        <div class="control-group">
            <label for="syncSpeedDirection-extra-${barId}">Dobra Velocidade:</label>
            <select id="syncSpeedDirection-extra-${barId}">
                <option value="up" ${barInstance.syncSpeedDirection === 'up' ? 'selected' : ''}>Para Cima</option>
                <option value="down" ${barInstance.syncSpeedDirection === 'down' ? 'selected' : ''}>Para Baixo</option>
            </select>
        </div>
        <div class="control-group">
            <label for="syncFactor-extra-${barId}">Fator Sinc. (x Vezes):</label>
            <input type="number" id="syncFactor-extra-${barId}" value="${barInstance.syncFactor}" min="1" step="1" style="width: 70px;">
        </div>
    `;
    extraBarsControlsContainer.appendChild(controlsDiv);

    // Store references to the created elements
    barInstance.controlsDiv = controlsDiv;
    barInstance.playStopButton = document.getElementById(`play-stop-extra-${barId}`);
    barInstance.bpmDisplay = document.getElementById(`bpm-display-extra-${barId}`);
    barInstance.bpmFaderSVG = document.getElementById(`bpmFaderSVG-extra-${barId}`);
    barInstance.bpmFaderThumb = document.getElementById(`faderThumb-extra-${barId}`);
    barInstance.bpmTextDisplay = document.getElementById(`bpmTextDisplay-extra-${barId}`);
    barInstance.noteOffsetInput = document.getElementById(`noteOffsetInput-extra-${barId}`);
    barInstance.orientationSelect = document.getElementById(`orientationSelect-extra-${barId}`);
    barInstance.directionSelect = document.getElementById(`directionSelect-extra-${barId}`);
    barInstance.syncSpeedDirectionInput = document.getElementById(`syncSpeedDirection-extra-${barId}`);
    barInstance.syncFactorInput = document.getElementById(`syncFactor-extra-${barId}`);


    // Add event listeners for the new bar's controls
    barInstance.playStopButton.addEventListener('click', () => togglePlaybackExtra(barInstance));

    barInstance.bpmFaderSVG.addEventListener('mousedown', (event) => {
        const onMouseMove = (moveEvent) => {
            const svgRect = barInstance.bpmFaderSVG.getBoundingClientRect();
            const svgX = moveEvent.clientX - svgRect.left;
            let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
            barInstance.bpm = Math.max(minBPM, Math.min(maxBPM, newBpm)); // Update bar's own BPM
            updateExtraBarBPMVisuals(barInstance, barInstance.bpm); // Update its visuals
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'default';
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'grabbing';
        // Initial click sets BPM too
        const svgRect = barInstance.bpmFaderSVG.getBoundingClientRect();
        const svgX = event.clientX - svgRect.left;
        let newBpm = calculateValueFromX(svgX, H_BPM_FADER_TRACK_X, H_BPM_FADER_TRACK_WIDTH, minBPM, maxBPM, H_BPM_FADER_THUMB_WIDTH);
        barInstance.bpm = Math.max(minBPM, Math.min(maxBPM, newBpm));
        updateExtraBarBPMVisuals(barInstance, barInstance.bpm);
    });


    barInstance.noteOffsetInput.addEventListener('input', () => {
        barInstance.noteOffset = parseInt(barInstance.noteOffsetInput.value, 10);
        if (isNaN(barInstance.noteOffset)) barInstance.noteOffset = 0;
    });

    const updateExtraDirectionOptions = () => {
        barInstance.directionSelect.innerHTML = '';
        barInstance.orientation = barInstance.orientationSelect.value;
        if (barInstance.orientation === 'vertical') {
            barInstance.directionSelect.add(new Option('Cima para Baixo', 'c2b'));
            barInstance.directionSelect.add(new Option('Baixo para Cima', 'b2c'));
        } else {
            barInstance.directionSelect.add(new Option('Esquerda para Direita', 'e2d'));
            barInstance.directionSelect.add(new Option('Direita para Esquerda', 'd2e'));
        }
        barInstance.direction = barInstance.directionSelect.value;
    };

    barInstance.orientationSelect.addEventListener('change', () => {
        updateExtraDirectionOptions();
        if (barInstance.isPlaying) togglePlaybackExtra(barInstance); // Stop if playing
    });
    barInstance.directionSelect.addEventListener('change', () => {
        barInstance.direction = barInstance.directionSelect.value;
        if (barInstance.isPlaying) togglePlaybackExtra(barInstance); // Stop if playing
    });
    updateExtraDirectionOptions(); // Initial population

    barInstance.syncSpeedDirectionInput.addEventListener('change', (event) => {
        barInstance.syncSpeedDirection = event.target.value;
        if (barInstance.isPlaying && isPlaying) {
            synchronizeExtraBar(barInstance, true);
        } else if (barInstance.isPlaying) {
            const newBpm = calculateExtraBarBPM(barInstance);
            updateExtraBarBPMVisuals(barInstance, newBpm, true);
        }
    });

    barInstance.syncFactorInput.addEventListener('input', (event) => {
        let factor = parseInt(event.target.value, 10);
        if (isNaN(factor) || factor < 1) {
            factor = 1;
            barInstance.syncFactorInput.value = factor;
        }
        barInstance.syncFactor = factor;
        if (barInstance.isPlaying && isPlaying) {
            synchronizeExtraBar(barInstance, true);
        } else if (barInstance.isPlaying) {
            const newBpm = calculateExtraBarBPM(barInstance);
            updateExtraBarBPMVisuals(barInstance, newBpm, true);
        }
    });


    // Initialize visuals for the new bar's fader
    updateExtraBarBPMVisuals(barInstance, barInstance.bpm, false);
    extraBars.push(barInstance);
}

function calculateExtraBarBPM(bar) {
    let calculatedBpm = bpm; // Start with main bar BPM
    if (bar.syncSpeedDirection === 'up') {
        calculatedBpm *= bar.syncFactor;
    } else { // 'down'
        calculatedBpm /= bar.syncFactor;
    }
    return Math.max(minBPM, Math.min(maxBPM, calculatedBpm));
}

function synchronizeExtraBar(bar, forceReset = false) {
    if (!isPlaying || !bar.isPlaying) return;

    const newBpmForBar = calculateExtraBarBPM(bar);
    updateExtraBarBPMVisuals(bar, newBpmForBar, false); // Update visual, don't restart timer yet

    if (bar.timerId) clearInterval(bar.timerId);

    if (forceReset || currentColumn === 0) { // Sync with main bar's start
        if (bar.orientation === 'horizontal') {
            bar.currentPosition = (bar.direction === 'e2d') ? 0 : (currentNumCols > 0 ? currentNumCols - 1 : 0);
        } else { // vertical
            bar.currentPosition = (bar.direction === 'c2b') ? 0 : (currentNumRows > 0 ? currentNumRows - 1 : 0);
        }
    }

    const columnInterval = 60000 / newBpmForBar;
    stepSequencerExtra(bar, true); // Apply indicator without advancing
    bar.timerId = setInterval(() => stepSequencerExtra(bar), columnInterval);
}


function togglePlaybackExtra(bar) {
    bar.isPlaying = !bar.isPlaying;
    bar.playStopButton.textContent = bar.isPlaying ? `Stop Barra Extra ${bar.id + 1}` : `Play Barra Extra ${bar.id + 1}`;

    if (bar.isPlaying) {
        if ((bar.orientation === 'horizontal' && currentNumCols === 0) ||
            (bar.orientation === 'vertical' && currentNumRows === 0)) {
            console.warn(`Barra Extra ${bar.id + 1} iniciada com 0 colunas/linhas relevantes.`);
            bar.isPlaying = false;
            bar.playStopButton.textContent = `Play Barra Extra ${bar.id + 1}`;
            return;
        }

        const newBpmForBar = calculateExtraBarBPM(bar);
        updateExtraBarBPMVisuals(bar, newBpmForBar, false); // Update visual, don't restart timer yet

        if (bar.orientation === 'horizontal') {
            bar.currentPosition = (bar.direction === 'e2d') ? 0 : (currentNumCols > 0 ? currentNumCols - 1 : 0);
        } else {
            bar.currentPosition = (bar.direction === 'c2b') ? 0 : (currentNumRows > 0 ? currentNumRows - 1 : 0);
        }

        stepSequencerExtra(bar, true); // Initial step, don't advance
        if (bar.timerId) clearInterval(bar.timerId);

        if (isPlaying) { // If main bar is playing, synchronize
            synchronizeExtraBar(bar, true);
        } else { // Else, play with its own (calculated or fader-defined) BPM
            const columnInterval = 60000 / newBpmForBar; // Could also use bar.bpm if fader is meant to be independent when main is stopped
            bar.timerId = setInterval(() => stepSequencerExtra(bar), columnInterval);
        }
    } else {
        clearInterval(bar.timerId);
        pads.forEach(p => p.classList.remove(bar.indicatorClass));
    }
}

function stepSequencerExtra(bar, dontAdvance = false) {
    if ((bar.orientation === 'horizontal' && currentNumCols <= 0) ||
        (bar.orientation === 'vertical' && currentNumRows <= 0) ||
        pads.length === 0) {
        return;
    }

    pads.forEach(p => p.classList.remove(bar.indicatorClass));

    // Validate currentPosition
    if (bar.orientation === 'horizontal') {
        if (bar.currentPosition < 0 || bar.currentPosition >= currentNumCols) {
            bar.currentPosition = (bar.direction === 'e2d') ? 0 : (currentNumCols > 0 ? currentNumCols - 1 : 0);
        }
    } else { // vertical
        if (bar.currentPosition < 0 || bar.currentPosition >= currentNumRows) {
            bar.currentPosition = (bar.direction === 'c2b') ? 0 : (currentNumRows > 0 ? currentNumRows - 1 : 0);
        }
    }

    // Highlight and trigger notes
    if (bar.orientation === 'horizontal') {
        for (let r = 0; r < currentNumRows; r++) {
            const padIndex = r * currentNumCols + bar.currentPosition;
            if (pads[padIndex]) {
                pads[padIndex].classList.add(bar.indicatorClass);
                if (pads[padIndex].classList.contains('active')) {
                    const originalNote = parseInt(pads[padIndex].dataset.note);
                    const noteToPlay = originalNote + bar.noteOffset;
                    if (midiOut) {
                        midiOut.send([0x90, noteToPlay, 100]);
                        setTimeout(() => { if (midiOut) midiOut.send([0x80, noteToPlay, 0]); }, 100);
                    }
                }
            }
        }
    } else { // vertical
        for (let c = 0; c < currentNumCols; c++) {
            const padIndex = bar.currentPosition * currentNumCols + c;
            if (pads[padIndex]) {
                pads[padIndex].classList.add(bar.indicatorClass);
                if (pads[padIndex].classList.contains('active')) {
                    const originalNote = parseInt(pads[padIndex].dataset.note);
                    const noteToPlay = originalNote + bar.noteOffset;
                    if (midiOut) {
                        midiOut.send([0x90, noteToPlay, 100]);
                        setTimeout(() => { if (midiOut) midiOut.send([0x80, noteToPlay, 0]); }, 100);
                    }
                }
            }
        }
    }

    if (!dontAdvance) {
        if (bar.orientation === 'horizontal') {
            if (bar.direction === 'e2d') {
                bar.currentPosition = (bar.currentPosition + 1) % currentNumCols;
            } else { // d2e
                bar.currentPosition = (bar.currentPosition - 1 + currentNumCols) % currentNumCols;
            }
        } else { // vertical
            if (bar.direction === 'c2b') {
                bar.currentPosition = (bar.currentPosition + 1) % currentNumRows;
            } else { // b2c
                bar.currentPosition = (bar.currentPosition - 1 + currentNumRows) % currentNumRows;
            }
        }
    }
    // TODO: Add cross-bar detection logic if needed
}

function updateExtraBarBPMVisuals(bar, newBpmValue, restartTimerIfPlaying = true) {
    let clampedBpm = Math.max(minBPM, Math.min(maxBPM, newBpmValue));
    // bar.bpm stores the fader's value or the last set BPM for this bar.
    // The actual playing BPM might be different if synced.

    const actualBarBpm = calculateExtraBarBPM(bar); // BPM based on main bar and sync factors

    if (bar.bpmDisplay) {
        bar.bpmDisplay.textContent = `BPM Extra: ${Math.round(actualBarBpm)}`;
    }

    if (bar.bpmFaderThumb && bar.bpmTextDisplay && bar.bpmFaderSVG) {
        // Fader shows the bar's own BPM setting (clampedBpm from its fader)
        const normalizedBpm = (maxBPM === minBPM) ? 0 : (clampedBpm - minBPM) / (maxBPM - minBPM);
        const availableTrackWidthForThumb = H_BPM_FADER_TRACK_WIDTH - H_BPM_FADER_THUMB_WIDTH;
        let thumbX = H_BPM_FADER_TRACK_X + normalizedBpm * availableTrackWidthForThumb;
        thumbX = Math.max(H_BPM_FADER_TRACK_X, Math.min(thumbX, H_BPM_FADER_TRACK_X + availableTrackWidthForThumb));
        bar.bpmFaderThumb.setAttribute('x', thumbX);
        bar.bpmTextDisplay.textContent = `BPM Extra: ${Math.round(clampedBpm)}`; // Show fader value
    }

    if (bar.isPlaying && restartTimerIfPlaying) {
        clearInterval(bar.timerId);
        const effectiveBpmForBar = isPlaying ? actualBarBpm : clampedBpm; // Sync if main is playing
        const columnInterval = 60000 / effectiveBpmForBar;
        bar.timerId = setInterval(() => stepSequencerExtra(bar), columnInterval);
    }
}

// Modify updateMatrix to handle extra bars
const originalUpdateMatrix = updateMatrix;
updateMatrix = (numRows, numCols, padSize) => {
    originalUpdateMatrix(numRows, numCols, padSize); // Call the original function

    // For each extra bar, if it's playing, we need to stop it,
    // update its position if necessary, and restart it.
    extraBars.forEach(bar => {
        if (bar.isPlaying) {
            const wasPlaying = bar.isPlaying;
            togglePlaybackExtra(bar); // Stop it

            // Recalculate its position based on new grid dimensions
            if (bar.orientation === 'horizontal') {
                bar.currentPosition = Math.min(bar.currentPosition, currentNumCols - 1);
                if (bar.currentPosition < 0) bar.currentPosition = (bar.direction === 'e2d') ? 0 : (currentNumCols > 0 ? currentNumCols - 1 : 0);
            } else { // vertical
                bar.currentPosition = Math.min(bar.currentPosition, currentNumRows - 1);
                if (bar.currentPosition < 0) bar.currentPosition = (bar.direction === 'c2b') ? 0 : (currentNumRows > 0 ? currentNumRows - 1 : 0);
            }

            if (wasPlaying) {
                 // Restart only if it's possible (grid not empty for its orientation)
                if (!((bar.orientation === 'horizontal' && currentNumCols === 0) ||
                      (bar.orientation === 'vertical' && currentNumRows === 0))) {
                    togglePlaybackExtra(bar); // Restart it
                } else {
                    // Update button text if it cannot be restarted
                    bar.playStopButton.textContent = `Play Barra Extra ${bar.id + 1}`;
                }
            }
        }
        // Also, update the indicator class on pads if necessary, though stepSequencerExtra handles this.
        // Clear old indicators for this bar
        const oldIndicatorClass = `sequencer-indicator-extra-${bar.id}`;
        pads.forEach(p => p.classList.remove(oldIndicatorClass));
        // If it was playing and restarted, stepSequencerExtra(bar, true) will re-add the new one.
    });
};
