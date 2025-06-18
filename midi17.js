export let midiAccess = null;
export let midiOutput = null;
export let midiEnabled = false;

export const PENTATONIC_SCALE = [60, 62, 64, 67, 69];
export const MAJOR_SCALE = [60, 62, 64, 65, 67, 69, 71];
export const HARMONIC_MINOR = [60, 62, 63, 65, 67, 68, 71];
export let currentScale = PENTATONIC_SCALE;

export function setScale(name) {
  switch (name) {
    case 'major': currentScale = MAJOR_SCALE; break;
    case 'harmonicMinor': currentScale = HARMONIC_MINOR; break;
    default: currentScale = PENTATONIC_SCALE;
  }
}

export function getNote(index, baseOctave = 0) {
  const scale = currentScale;
  const note = scale[index % scale.length];
  return note + baseOctave * 12;
}

export function sendMidiNoteOn(note, velocity, channel) {
  if (midiOutput && midiEnabled)
    midiOutput.send([0x90 + channel, note, velocity]);
}

export function sendMidiNoteOff(note, channel) {
  if (midiOutput && midiEnabled)
    midiOutput.send([0x80 + channel, note, 0]);
}

export function initMidi() {
  navigator.requestMIDIAccess().then((access) => {
    midiAccess = access;
    updateMidiOutputList();
    midiAccess.onstatechange = updateMidiOutputList;
  });
}

export function updateMidiOutputList() {
  const outputs = midiAccess.outputs;
  for (let output of outputs.values()) {
    midiOutput = output;
    console.log('MIDI conectado:', output.name);
    break; // pega o primeiro
  }
}
