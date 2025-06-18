import { getNote, sendMidiNoteOn, sendMidiNoteOff, midiEnabled } from './midi17.js';

export let shapes = [];
export let selectedShape = null;
export let shapeSides = 100;

const DEFAULT_RADIUS = 100;
const DEFAULT_SIDES = 100;
const MIN_RADIUS = 30;
const MAX_RADIUS = 300;

export function initShapes(canvas) {
  const shape = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: DEFAULT_RADIUS,
    sides: DEFAULT_SIDES,
    color: 'cyan',
    midiChannel: 0,
    activeNotes: {}
  };
  shapes = [shape];
  selectedShape = shape;
  shapeSides = shape.sides;
}

export function drawAllShapes(ctx, canvas) {
  for (const shape of shapes) {
    drawShape(ctx, shape);
  }
}

function drawShape(ctx, shape) {
  const sides = Math.max(3, shape.sides);
  const angleStep = (2 * Math.PI) / sides;
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const angle = i * angleStep;
    const x = shape.x + shape.radius * Math.cos(angle);
    const y = shape.y + shape.radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    // Enviar nota MIDI associada
    if (midiEnabled) {
      const note = getNote(i);
      const velocity = 100;
      if (!shape.activeNotes[i]) {
        sendMidiNoteOn(note, velocity, shape.midiChannel);
        shape.activeNotes[i] = note;
      }
    }
  }
  ctx.closePath();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = 3;
  ctx.stroke();
}

export function resizeCanvas(canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
