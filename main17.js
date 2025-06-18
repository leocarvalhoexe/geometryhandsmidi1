import { initMidi, updateMidiOutputList } from './midi17.js';
import { initShapes, resizeCanvas, drawAllShapes, selectedShape, shapeSides } from './shape17.js';
import { setupHands, onResults } from './hands17.js';

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
  hands = setupHands(onResults);
  camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480
  });
  camera.start();

  // animação principal
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAllShapes(ctx, canvas);
    requestAnimationFrame(animate);
  }
  animate();
});
