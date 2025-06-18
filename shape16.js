import { getNote, sendMidiNoteOn, sendMidiNoteOff, midiEnabled } from './midi16.js';

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

export function updateShapeRadius(newRadius) {
  if (selectedShape) {
    // const MIN_RADIUS = 10; // Define these constants or import them
    // const MAX_RADIUS = 300; // These are already defined above
    selectedShape.radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, newRadius));
    console.log("Shape radius updated to:", selectedShape.radius);
  }
}

export function updateShapeSides(increment) { // True for increment, false for decrement
  if (selectedShape) {
    const MIN_SIDES = 3;
    const MAX_SIDES = 20; // Example max
    const oldSides = selectedShape.sides;

    if (increment && selectedShape.sides < MAX_SIDES) {
        selectedShape.sides++;
    } else if (!increment && selectedShape.sides > MIN_SIDES) {
        selectedShape.sides--;
    }

    if (oldSides !== selectedShape.sides) {
        console.log("Shape sides updated to:", selectedShape.sides);
        // If sides decreased, turn off notes for vertices that no longer exist
        if (selectedShape.sides < oldSides) {
            for (let i = selectedShape.sides; i < oldSides; i++) {
                if (selectedShape.activeNotes[i]) {
                    if (midiEnabled) { // Check if MIDI is enabled before sending off
                        sendMidiNoteOff(selectedShape.activeNotes[i], selectedShape.midiChannel);
                    }
                    delete selectedShape.activeNotes[i];
                    console.log(`Turned off MIDI note for old side ${i}`);
                }
            }
        }
        // If sides increased, new notes will be turned on by drawShape.
        // If specific notes need to be reset for all vertices on any side change, do it here.
        // For now, only turning off notes for removed sides.
    }
    // Ensure the global shapeSides variable is also updated if it's used elsewhere directly for drawing decisions.
    // The prompt implies selectedShape.sides is the primary driver for drawing.
    // shapeSides = selectedShape.sides; // If shapeSides is meant to be a direct reflection
  }
}
