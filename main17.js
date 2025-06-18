import { initMidi, updateMidiOutputListAndSelect, handleMidiOutputChange, toggleMidiEnabled } from './midi17.js'; // Removed setActiveMidiNotesReference
import * as shape17 from './shape17.js'; // Import module as a namespace
import { setupHands, processHandsUpdate, drawHandLandmarks } from './hands17.js';

let canvas, ctx, video;
let hands, camera;

// Module-level variable to store right hand landmarks for liquify effect
let currentRightHandLandmarks = null;
// Module-level variables for pulse mode
let pulseModeActive = false;
let pulseTime = 0;
let pulseFrequency = 0.5; // cycles per second

// Module-level variable to store all hand landmarks for drawing
let allHandsLandmarksToDraw = [];

// Output Popup Window
let outputPopupWindow = null;
let popupCanvasCtx = null;

document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('canvas');
  video = document.getElementById('video');
  ctx = canvas.getContext('2d');

  shape17.resizeCanvas(canvas);
  window.addEventListener('resize', () => {
    shape17.resizeCanvas(canvas);
  });

  shape17.initShapes(canvas);
  // Removed: setActiveMidiNotesReference(shape17.getActiveShapeMidiNotes());
  // midi17.js no longer holds a global reference to activeMidiNotes.
  // Instead, main17.js will pass shape17.getActiveShapeMidiNotes() to midi17 functions as needed.

  const midiOutputSelectElement = document.getElementById('midiOutputSelect');
  // Pass null for activeNotes initially as MIDI setup happens before shapes might play notes.
  initMidi(midiOutputSelectElement);

  if (midiOutputSelectElement) {
    midiOutputSelectElement.addEventListener('change', (event) => {
      // Pass the current active notes from shape17 to handleMidiOutputChange
      handleMidiOutputChange(event.target.value, shape17.getActiveShapeMidiNotes());
    });
  } else {
    console.error("midiOutputSelect element not found in DOM.");
  }

  // Modal Elements and Listeners
  const infoButton = document.getElementById('info');
  const infoModal = document.getElementById('infoModal');
  const closeModalButton = document.getElementById('closeModal');
  const settingsButton = document.getElementById('settingsButton');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsModalButton = document.getElementById('closeSettingsModal');
  const openOutputPopupButton = document.getElementById('openOutputPopupButton');

  if (infoButton && infoModal && closeModalButton) {
    infoButton.addEventListener('click', () => { infoModal.style.display = 'flex'; });
    closeModalButton.addEventListener('click', () => { infoModal.style.display = 'none'; });
  }
  if (settingsButton && settingsModal && closeSettingsModalButton) {
    settingsButton.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
    closeSettingsModalButton.addEventListener('click', () => { settingsModal.style.display = 'none'; });
  }
  window.addEventListener('click', (event) => {
    if (infoModal && event.target === infoModal) infoModal.style.display = 'none';
    if (settingsModal && event.target === settingsModal) settingsModal.style.display = 'none';
  });

  // Output Popup Button Listener
  if (openOutputPopupButton) {
    openOutputPopupButton.addEventListener('click', () => {
      if (outputPopupWindow && !outputPopupWindow.closed) {
        outputPopupWindow.focus();
      } else {
        outputPopupWindow = window.open('', 'OutputWindow', 'width=640,height=480,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=no');
        if (outputPopupWindow) {
          outputPopupWindow.document.write(`
            <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Visual Output</title>
            <style>body { margin: 0; overflow: hidden; background: #111; display: flex; justify-content: center; align-items: center; } canvas { display: block; width: 100%; height: 100%; }</style>
            </head><body><canvas id="popupCanvas"></canvas></body></html>
          `);
          outputPopupWindow.document.close();
          const popupCanvas = outputPopupWindow.document.getElementById('popupCanvas');
          if (popupCanvas) {
            popupCanvasCtx = popupCanvas.getContext('2d');
            popupCanvas.width = outputPopupWindow.innerWidth;
            popupCanvas.height = outputPopupWindow.innerHeight;
          } else {
            console.error("Could not find 'popupCanvas' in the new output window.");
            if (outputPopupWindow) outputPopupWindow.close();
            outputPopupWindow = null;
            popupCanvasCtx = null;
            return;
          }
          outputPopupWindow.addEventListener('beforeunload', () => {
            popupCanvasCtx = null;
            outputPopupWindow = null;
          });
        } else {
          console.error("Failed to open output popup window. Popups might be blocked.");
        }
      }
    });
  }

  // MediaPipe onResults callback
  const onResultsCallback = (results) => {
    const handProcessingResult = processHandsUpdate(results, canvas, shape17);
    currentRightHandLandmarks = handProcessingResult.rightHandLandmarksForLiquify;
    allHandsLandmarksToDraw = handProcessingResult.landmarksToDraw;
  };

  // Setup MediaPipe Hands
  hands = setupHands(onResultsCallback);
  camera = new Camera(video, {
    onFrame: async () => { await hands.send({ image: video }); },
    width: 640, height: 480
  });
  camera.start();

  // Keyboard listeners
  document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      // Pass the current active notes from shape17 to toggleMidiEnabled
      toggleMidiEnabled(shape17.getActiveShapeMidiNotes());
    } else if (e.key === '+') {
      shape17.updateSelectedShapeRadius(shape17.getSelectedShapeRadius() + 10);
    } else if (e.key === '-') {
      shape17.updateSelectedShapeRadius(shape17.getSelectedShapeRadius() - 10);
    } else if (e.key === 'p' || e.key === 'P') {
      pulseModeActive = !pulseModeActive;
      if (pulseModeActive) {
        pulseTime = 0;
        console.log("Pulse mode ACTIVE");
      } else {
        console.log("Pulse mode INACTIVE");
      }
    }
  });

  // Main animation loop
  function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let currentPulseValue = 0;
    if (pulseModeActive) {
      // Using performance.now() for smoother and more consistent pulse over time
      pulseTime = performance.now() * 0.001;
      currentPulseValue = Math.sin(pulseTime * pulseFrequency * 2 * Math.PI);
    }

    shape17.drawAllShapes(ctx, canvas, currentRightHandLandmarks, pulseModeActive, currentPulseValue);

    if (allHandsLandmarksToDraw && allHandsLandmarksToDraw.length > 0) {
      drawHandLandmarks(ctx, allHandsLandmarksToDraw, canvas.width, canvas.height);
    }

    if (outputPopupWindow && !outputPopupWindow.closed && popupCanvasCtx) {
      try {
        const popupCanvasEl = outputPopupWindow.document.getElementById('popupCanvas');
        if (popupCanvasEl) {
          if (popupCanvasEl.width !== outputPopupWindow.innerWidth || popupCanvasEl.height !== outputPopupWindow.innerHeight) {
            popupCanvasEl.width = outputPopupWindow.innerWidth;
            popupCanvasEl.height = outputPopupWindow.innerHeight;
          }
          popupCanvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
          popupCanvasCtx.fillRect(0, 0, popupCanvasEl.width, popupCanvasEl.height);
          popupCanvasCtx.drawImage(canvas, 0, 0, popupCanvasEl.width, popupCanvasEl.height);
        } else {
           if(outputPopupWindow) outputPopupWindow.close();
           outputPopupWindow = null;
           popupCanvasCtx = null;
        }
      } catch (e) {
        if (outputPopupWindow && outputPopupWindow.closed) {
          outputPopupWindow = null;
          popupCanvasCtx = null;
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
});

export { popupCanvasCtx };
