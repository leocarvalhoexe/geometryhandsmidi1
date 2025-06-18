import { getNote, sendMidiNoteOn, sendMidiNoteOff, sendPitchBend, midiEnabled as isGlobalMidiEnabled, MIDI_CHANNEL } from './midi17.js';

export let shapes = [];
export let selectedShape = null;

const DEFAULT_RADIUS = 100;
const DEFAULT_SIDES = 10;
const MIN_RADIUS = 30;
const MAX_RADIUS = 300;
const MIN_SIDES = 3;
const MAX_SIDES = 20;

const MAX_INFLUENCE_DISTANCE = 150;
const MAX_FORCE = 25;
const FINGERTIPS_TO_USE = [4, 8, 12, 16, 20];

const MAX_OBSERVED_DISTORTION = 50.0;
const PITCH_BEND_SENSITIVITY = 2048;
const NEUTRAL_PITCH_BEND = 8192;

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function initShapes(canvas) {
  const initialShape = {
    id: 'shape1',
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: DEFAULT_RADIUS,
    targetRadius: DEFAULT_RADIUS,
    sides: DEFAULT_SIDES,
    targetSides: DEFAULT_SIDES,
    color: 'cyan',
    midiChannel: MIDI_CHANNEL,
    activeMidiNotes: {},
    lineWidth: 3,
    baseOctave: 0,
  };
  shapes = [initialShape];
  selectedShape = initialShape;
}

export function getActiveShapeMidiNotes() {
  return selectedShape ? selectedShape.activeMidiNotes : {};
}

export function getSelectedShapeRadius() {
  return selectedShape ? selectedShape.radius : 0;
}

export function getSelectedShapeSides() {
  return selectedShape ? Math.round(selectedShape.sides) : 0; // Ensure integer
}

export function updateSelectedShapeRadius(newRadius) {
  if (selectedShape) {
    selectedShape.targetRadius = Math.max(MIN_RADIUS, Math.min(newRadius, MAX_RADIUS));
  }
}

export function updateSelectedShapeSides(newSides) {
  if (selectedShape) {
    const currentRoundedSides = Math.round(selectedShape.sides);
    const targetRoundedSides = Math.max(MIN_SIDES, Math.min(Math.round(newSides), MAX_SIDES));
    selectedShape.targetSides = targetRoundedSides; // Store the target

    // Immediate MIDI note-off for sides being reduced, if MIDI is enabled
    if (isGlobalMidiEnabled() && targetRoundedSides < currentRoundedSides) {
      for (let i = targetRoundedSides; i < currentRoundedSides; i++) {
        if (selectedShape.activeMidiNotes[i] && selectedShape.activeMidiNotes[i].playing) {
          sendMidiNoteOff(selectedShape.activeMidiNotes[i].note, selectedShape.midiChannel);
          selectedShape.activeMidiNotes[i].playing = false;
        }
      }
    }
  }
}

export function drawAllShapes(ctx, canvas, rightHandLandmarks, isPulsing, currentPulseValue) {
  if (selectedShape) {
    // Smooth radius
    if (Math.abs(selectedShape.radius - selectedShape.targetRadius) > 0.1) {
      selectedShape.radius += (selectedShape.targetRadius - selectedShape.radius) * 0.1;
    } else {
      selectedShape.radius = selectedShape.targetRadius;
    }
    // Smooth sides (integer steps)
    const roundedSides = Math.round(selectedShape.sides);
    const roundedTargetSides = Math.round(selectedShape.targetSides);
    if (roundedSides !== roundedTargetSides) {
        if (Math.abs(selectedShape.sides - selectedShape.targetSides) < 0.1 && roundedSides !== roundedTargetSides) {
             selectedShape.sides = roundedTargetSides; // Snap when very close to prevent micro-oscillations around rounding
        } else if (Math.abs(selectedShape.sides - selectedShape.targetSides) > 0.05){ // Interpolate if not too close
             selectedShape.sides += (selectedShape.targetSides - selectedShape.sides) * 0.1; // Slower interpolation
        } else {
            selectedShape.sides = selectedShape.targetSides; // Snap if very close
        }
    } else {
         selectedShape.sides = selectedShape.targetSides; // Ensure it settles to target
    }
     selectedShape.sides = Math.max(MIN_SIDES, Math.min(selectedShape.sides, MAX_SIDES)); // Clamp even during interpolation
  }

  for (const shape of shapes) {
    drawShape(ctx, shape, rightHandLandmarks, isPulsing, currentPulseValue, canvas.width, canvas.height);
  }
}

function drawShape(ctx, shape, rightHandLandmarks, isPulsing, currentPulseValue, canvasWidth, canvasHeight) {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  let effectiveRadius = shape.radius;
  let pulseVelocityFactor = 1.0;

  if (isPulsing) {
    let radiusModulationFactor = 0.25 * currentPulseValue;
    effectiveRadius = shape.radius * (1 + radiusModulationFactor);
    effectiveRadius = Math.max(MIN_RADIUS / 2, effectiveRadius);
    pulseVelocityFactor = 0.6 + ((currentPulseValue + 1) / 2) * 0.4;
  }

  const currentSides = Math.round(shape.sides);
  if (currentSides < MIN_SIDES) return;

  ctx.beginPath();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.lineWidth;

  if (!isGlobalMidiEnabled()) {
    if (Object.keys(shape.activeMidiNotes).length > 0) {
      Object.values(shape.activeMidiNotes).forEach(noteInfo => {
        if (noteInfo.playing) noteInfo.playing = false;
      });
    }
  }

  for (let i = 0; i < currentSides; i++) {
    const angle = (i / currentSides) * Math.PI * 2;
    let vertexX_orig = effectiveRadius * Math.cos(angle);
    let vertexY_orig = effectiveRadius * Math.sin(angle);
    let totalDisplacementX = 0;
    let totalDisplacementY = 0;

    if (rightHandLandmarks) {
      const currentVertexCanvasX = cx + vertexX_orig;
      const currentVertexCanvasY = cy + vertexY_orig;
      for (const landmarkIndex of FINGERTIPS_TO_USE) {
        if (rightHandLandmarks[landmarkIndex]) {
          const fingertip = rightHandLandmarks[landmarkIndex];
          // Apply X-coordinate mirroring for right hand liquify effect
          const fingertipX = canvasWidth - (fingertip.x * canvasWidth);
          const fingertipY = fingertip.y * canvasHeight;
          const distToFingertip = distance(currentVertexCanvasX, currentVertexCanvasY, fingertipX, fingertipY);
          if (distToFingertip < MAX_INFLUENCE_DISTANCE && distToFingertip > 0) {
            const vecX = currentVertexCanvasX - fingertipX;
            const vecY = currentVertexCanvasY - fingertipY;
            const normVecX = vecX / distToFingertip;
            const normVecY = vecY / distToFingertip;
            const forceMagnitude = MAX_FORCE * (1 - distToFingertip / MAX_INFLUENCE_DISTANCE);
            totalDisplacementX += normVecX * forceMagnitude;
            totalDisplacementY += normVecY * forceMagnitude;
          }
        }
      }
    }

    const finalX = cx + vertexX_orig + totalDisplacementX;
    const finalY = cy + vertexY_orig + totalDisplacementY;

    if (isGlobalMidiEnabled() && currentSides > 0) {
      const edgeIndex = i;
      const note = getNote(edgeIndex, shape.baseOctave);
      let baseVelocity = 30 + (effectiveRadius - MIN_RADIUS) * ((127 - 30) / (MAX_RADIUS - MIN_RADIUS));
      baseVelocity = Math.max(0, Math.min(127, Math.round(baseVelocity)));
      let finalVelocity = Math.round(baseVelocity * pulseVelocityFactor);
      finalVelocity = Math.max(0, Math.min(127, finalVelocity));
      const displacementMagnitude = Math.sqrt(totalDisplacementX * totalDisplacementX + totalDisplacementY * totalDisplacementY);
      let pitchBend = NEUTRAL_PITCH_BEND;
      if (displacementMagnitude > 0.5) {
        const bendAmount = Math.min(1.0, displacementMagnitude / MAX_OBSERVED_DISTORTION) * PITCH_BEND_SENSITIVITY;
        pitchBend = NEUTRAL_PITCH_BEND + Math.round(bendAmount);
        pitchBend = Math.max(0, Math.min(16383, pitchBend));
      }
      const currentNoteInfo = shape.activeMidiNotes[edgeIndex];
      if (currentNoteInfo && currentNoteInfo.playing) {
        if (Math.abs(pitchBend - currentNoteInfo.lastPitchBend) > 10) {
          sendPitchBend(pitchBend, shape.midiChannel);
          currentNoteInfo.lastPitchBend = pitchBend;
        }
        currentNoteInfo.lastVelocity = finalVelocity;
        if (currentNoteInfo.note !== note) {
          sendMidiNoteOff(currentNoteInfo.note, shape.midiChannel);
          sendMidiNoteOn(note, finalVelocity, shape.midiChannel);
          currentNoteInfo.note = note;
          currentNoteInfo.lastPitchBend = NEUTRAL_PITCH_BEND;
          if (pitchBend !== NEUTRAL_PITCH_BEND) sendPitchBend(pitchBend, shape.midiChannel);
        }
      } else {
        sendMidiNoteOn(note, finalVelocity, shape.midiChannel);
        shape.activeMidiNotes[edgeIndex] = {
          note: note, channel: shape.midiChannel, lastVelocity: finalVelocity,
          lastPitchBend: NEUTRAL_PITCH_BEND, playing: true
        };
        if (pitchBend !== NEUTRAL_PITCH_BEND) {
          sendPitchBend(pitchBend, shape.midiChannel);
          shape.activeMidiNotes[edgeIndex].lastPitchBend = pitchBend;
        }
      }
    }
    if (i === 0) ctx.moveTo(finalX, finalY);
    else ctx.lineTo(finalX, finalY);
  }
  ctx.closePath();
  ctx.stroke();

  if (isGlobalMidiEnabled()) {
    Object.keys(shape.activeMidiNotes).forEach(edgeIdxStr => {
      const edgeIdx = parseInt(edgeIdxStr, 10);
      const noteInfo = shape.activeMidiNotes[edgeIdx];
      if (noteInfo && noteInfo.playing) {
        if (edgeIdx >= currentSides) {
          sendMidiNoteOff(noteInfo.note, shape.midiChannel);
          noteInfo.playing = false;
        }
      }
    });
  }
  for (const edgeIdxStr in shape.activeMidiNotes) {
    if (!shape.activeMidiNotes[edgeIdxStr].playing) {
      delete shape.activeMidiNotes[edgeIdxStr];
    }
  }
}

export function forceTurnOffAllNotesForShape(shape) {
  if (!shape || !shape.activeMidiNotes) return;
  Object.values(shape.activeMidiNotes).forEach(noteInfo => {
    if (noteInfo.playing) {
      sendMidiNoteOff(noteInfo.note, shape.midiChannel); // Will respect global midiEnabled
      noteInfo.playing = false;
    }
  });
  shape.activeMidiNotes = {};
}

export function resizeCanvas(canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (shapes && shapes.length > 0) {
    for (const shape of shapes) {
      shape.x = canvas.width / 2;
      shape.y = canvas.height / 2;
    }
  }
}
