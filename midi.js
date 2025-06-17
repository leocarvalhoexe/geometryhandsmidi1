'use strict';

// MIDI State Variables
let midiAccess = null;
let midiOutput = null;
let availableMidiOutputs = new Map(); // Store MIDI outputs by ID
let midiEnabled = false;
const MIDI_CHANNEL = 0; // MIDI channel 0 is channel 1 in most DAWs
let activeMidiNotes = {}; // { edgeIndex: { note, channel, lastVelocity, lastPitchBend, playing } }

const PENTATONIC_SCALE_C_MAJOR = [60, 62, 64, 67, 69]; // C4, D4, E4, G4, A4

// --- Internal Functions ---

function _updateMidiOutputListInternal() {
  availableMidiOutputs.clear();
  if (midiAccess) {
    midiAccess.outputs.forEach(output => {
      availableMidiOutputs.set(output.id, output);
    });
  }
  // Note: DOM population will be handled by ui.js based on getAvailableMidiOutputs()
}

// --- Exported Functions ---

export function getAvailableMidiOutputs() {
  // Returns an array of objects {id, name} for ui.js to populate the select
  return Array.from(availableMidiOutputs.values()).map(output => ({ id: output.id, name: output.name }));
}

export function getSelectedMidiOutput() {
  return midiOutput ? { id: midiOutput.id, name: midiOutput.name } : null;
}

export function setMidiOutput(outputId) {
  if (availableMidiOutputs.has(outputId)) {
    const newOutput = availableMidiOutputs.get(outputId);
    if (midiOutput && midiOutput.id !== newOutput.id) {
        // If changing output, turn off notes on the old one
        turnOffAllActiveNotes(midiOutput); // Pass the specific output to turn off notes
    }
    midiOutput = newOutput;
    console.log("MIDI Output changed to:", midiOutput.name);
    // It's important to also turn off notes if the new output is null (no selection)
    if (!midiOutput) {
        turnOffAllActiveNotes(); // Turn off on any current/default output if selection is cleared
    }
  } else if (!outputId && midiOutput) {
    // If outputId is null/undefined, it means "no selection" or "disable"
    turnOffAllActiveNotes(midiOutput);
    midiOutput = null;
    console.log("MIDI Output deselected.");
  } else {
    console.warn("Selected MIDI output ID not found in available list:", outputId);
    // Potentially turn off notes on the current output if the selection fails
    if (midiOutput) turnOffAllActiveNotes(midiOutput);
    midiOutput = null;
  }
}

export async function initMidi() {
  try {
    if (navigator.requestMIDIAccess) {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      console.log("MIDI Access Granted (midi.js)");
      _updateMidiOutputListInternal(); // Populate our internal list

      midiAccess.onstatechange = (event) => {
        console.log("MIDI state changed (midi.js):", event.port.name, event.port.state, event.port.type);
        const oldSelectedId = midiOutput ? midiOutput.id : null;
        _updateMidiOutputListInternal();

        // If the currently selected output is disconnected
        if (event.port.type === "output" && event.port.state === "disconnected" && midiOutput && event.port.id === midiOutput.id) {
          console.warn("Selected MIDI Output disconnected (midi.js):", event.port.name);
          midiOutput = null; // Clear the selected output
          // ui.js should be notified to update the select element, possibly selecting the first available or showing "none"
        }

        // Potentially re-select if it was disconnected and is now reconnected or if a new preferred one appears
        // This logic might need coordination with ui.js, e.g., by ui.js calling setMidiOutput
        // For now, midi.js just updates its internal list. ui.js can query and decide.
        // If there's a UI component listening for MIDI changes, it should re-fetch outputs and update.
      };
      return true; // Indicate success
    } else {
      console.warn("Web MIDI API is not supported in this browser (midi.js).");
      _updateMidiOutputListInternal(); // Ensure list is empty
      return false; // Indicate failure
    }
  } catch (error) {
    console.error("Could not access MIDI devices (midi.js).", error);
    _updateMidiOutputListInternal(); // Ensure list is empty
    return false; // Indicate failure
  }
}

export function sendMidiNoteOn(note, velocity, channel = MIDI_CHANNEL, targetOutput = null) {
  const out = targetOutput || midiOutput;
  if (out && midiEnabled) {
    const noteOnMessage = [0x90 + channel, note, velocity];
    out.send(noteOnMessage);
    // console.log(`Sent Note On: ${note}, Vel: ${velocity} on ${out.name}`);
  }
}

export function sendMidiNoteOff(note, channel = MIDI_CHANNEL, targetOutput = null) {
  const out = targetOutput || midiOutput;
  if (out && midiEnabled) { // Check midiEnabled here too, for notes sent during disable sequence
    const noteOffMessage = [0x80 + channel, note, 0]; // Velocity 0 for note off
    out.send(noteOffMessage);
    // console.log(`Sent Note Off: ${note} on ${out.name}`);
  }
}

export function sendPitchBend(bendValue, channel = MIDI_CHANNEL, targetOutput = null) {
  const out = targetOutput || midiOutput;
  if (out && midiEnabled) {
    const lsb = bendValue & 0x7F;
    const msb = (bendValue >> 7) & 0x7F;
    const pitchBendMessage = [0xE0 + channel, lsb, msb];
    out.send(pitchBendMessage);
    // console.log(`Sent Pitch Bend: ${bendValue} on ${out.name}`);
  }
}

export function getPentatonicNote(index, baseOctaveOffset = 0) {
    const scaleLength = PENTATONIC_SCALE_C_MAJOR.length;
    const octave = baseOctaveOffset + Math.floor(index / scaleLength);
    const noteInScale = PENTATONIC_SCALE_C_MAJOR[index % scaleLength];
    return noteInScale + (octave * 12);
}

// Modified to accept a specific output, for when an output is deselected or changed
export function turnOffAllActiveNotes(specificOutput = null) {
    const targetOutput = specificOutput || midiOutput;
    if (targetOutput && Object.keys(activeMidiNotes).length > 0) {
        // Temporarily enable MIDI for this operation if it was globally disabled,
        // to ensure note-off messages are sent.
        const originalMidiEnabledState = midiEnabled;
        midiEnabled = true;

        Object.keys(activeMidiNotes).forEach(edgeIdx => {
            const noteInfo = activeMidiNotes[edgeIdx];
            if (noteInfo.playing) {
                sendMidiNoteOff(noteInfo.note, noteInfo.channel, targetOutput);
            }
        });
        midiEnabled = originalMidiEnabledState; // Restore original state
    }
    activeMidiNotes = {}; // Clear active notes regardless of whether they were sent (e.g., if midiOutput was null)
}

export function isMidiEnabled() {
    return midiEnabled;
}

export function toggleMidiEnabled() {
    midiEnabled = !midiEnabled;
    if (midiEnabled) {
        console.log("MIDI output ENABLED (midi.js).");
    } else {
        console.log("MIDI output DISABLED (midi.js).");
        turnOffAllActiveNotes(); // Turn off all notes on the currently selected output
    }
    return midiEnabled;
}

// Export activeMidiNotes and MIDI_CHANNEL if they need to be accessed directly by other modules.
// Generally, it's better to provide functions to interact with them if possible.
export { activeMidiNotes, MIDI_CHANNEL };

// No direct DOM manipulation or event listeners for DOM elements here.
// That will be handled by ui.js, which will call these exported functions.
