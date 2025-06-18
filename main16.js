import { initMidi, updateMidiOutputList, setScale } from './midi16.js';
import { initShapes, resizeCanvas, drawAllShapes, selectedShape, shapeSides } from './shape16.js';
import { setupHands, onResults } from './hands16.js';

let canvas, ctx, video;
let hands, camera;

document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('canvas');
  video = document.getElementById('video');
  ctx = canvas.getContext('2d');

  resizeCanvas(canvas);
  window.addEventListener('resize', () => resizeCanvas(canvas));

  initShapes(canvas);
  initMidi();

  // MediaPipe
  hands = setupHands((results) => onResults(results, canvas, ctx, video));
  camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480
  });
  console.log('Camera setup initiated.');
  camera.start();

  // Event listeners for MIDI scale buttons
  document.getElementById('scale-pentatonic').addEventListener('click', () => {
    setScale('pentatonic');
    console.log('MIDI Scale set to Pentatonic');
  });
  document.getElementById('scale-major').addEventListener('click', () => {
    setScale('major');
    console.log('MIDI Scale set to Major');
  });
  document.getElementById('scale-harmonic-minor').addEventListener('click', () => {
    setScale('harmonicMinor');
    console.log('MIDI Scale set to Harmonic Minor');
  });

  // animação principal
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAllShapes(ctx, canvas);
    requestAnimationFrame(animate);
  }
  animate();
});
