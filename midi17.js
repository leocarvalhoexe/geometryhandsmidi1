export let midiAccess = null;
export let midiOutput = null;
export let midiEnabled = false; // Will be toggled from main17.js
export let availableMidiOutputs = new Map();

// activeMidiNotes is no longer managed or exported by this module.
// Functions requiring it will receive it as a parameter.

export const PENTATONIC_SCALE = [60, 62, 64, 67, 69]; // C4 Pentatonic Major
export const MAJOR_SCALE = [60, 62, 64, 65, 67, 69, 71]; // C4 Major
export const HARMONIC_MINOR = [60, 62, 63, 65, 67, 68, 71]; // C4 Harmonic Minor
export let currentScale = PENTATONIC_SCALE;

export const MIDI_CHANNEL = 0; // Default MIDI channel (0-15, so channel 1 in DAWs)

export function setScale(name, activeNotesToTurnOff) { // Added activeNotesToTurnOff
  switch (name) {
    case 'major': currentScale = MAJOR_SCALE; break;
    case 'harmonicMinor': currentScale = HARMONIC_MINOR; break;
    default: currentScale = PENTATONIC_SCALE;
  }
  // When scale changes, turn off all notes as the mapping might change.
  if (activeNotesToTurnOff) {
    turnOffAllActiveNotes(activeNotesToTurnOff);
    // The caller (e.g., shape17.js) will be responsible for clearing its activeNotes map after this.
  }
}

export function getNote(index, baseOctave = 0) {
  const scale = currentScale;
  const noteValue = scale[index % scale.length];
  const octaveShift = Math.floor(index / scale.length);
  return noteValue + (baseOctave + octaveShift) * 12;
}

export function sendMidiNoteOn(note, velocity, channel = MIDI_CHANNEL) {
  if (midiOutput && midiEnabled) {
    midiOutput.send([0x90 + channel, note, velocity]);
  }
}

export function sendMidiNoteOff(note, channel = MIDI_CHANNEL) {
  if (midiOutput && midiEnabled) {
    midiOutput.send([0x80 + channel, note, 0]);
  }
}

export function sendPitchBend(bendValue, channel = MIDI_CHANNEL) {
  if (midiOutput && midiEnabled) {
    const lsb = bendValue & 0x7F;
    const msb = (bendValue >> 7) & 0x7F;
    midiOutput.send([0xE0 + channel, lsb, msb]);
  }
}

export function turnOffAllActiveNotes(notesToTurnOff) { // Renamed arg for clarity
  if (!midiOutput || !notesToTurnOff) return;

  // Check if notesToTurnOff is empty or not an object
  if (typeof notesToTurnOff !== 'object' || Object.keys(notesToTurnOff).length === 0) {
    return;
  }

  const originalMidiEnabledState = midiEnabled;
  // midiEnabled = true; // Temporarily enable MIDI sending for note offs - NO! sendMidiNoteOff checks global midiEnabled.
                       // The global midiEnabled should be true if we are intentionally sending note offs.
                       // If midiEnabled is false (e.g. user pressed 'M'), then sendMidiNoteOff won't send.
                       // This is correct. When 'M' is pressed, toggleMidiEnabled calls this,
                       // but it sets midiEnabled = false *before* calling.
                       // So, to ensure these noteOffs go through when called by toggleMidiEnabled (when disabling)
                       // or handleMidiOutputChange, sendMidiNoteOff itself should perhaps bypass the global check
                       // if a special flag is passed, OR we temporarily set midiEnabled here.
                       // The previous approach was:
                       // const originalMidiEnabledState = midiEnabled;
                       // midiEnabled = true; // force send
                       // sendMidiNoteOff(...);
                       // midiEnabled = originalMidiEnabledState;
                       // This is the safest to ensure note offs are sent regardless of current toggle state.
  let forceSend = true; // Special case for turnOffAllActiveNotes

  Object.values(notesToTurnOff).forEach(noteInfo => {
    if (noteInfo && noteInfo.playing) { // Check if noteInfo itself is not null/undefined
      if (forceSend) {
        const tempOriginalMidiEnabled = midiEnabled; // Store current state
        midiEnabled = true; // Force enable for this send
        sendMidiNoteOff(noteInfo.note, noteInfo.channel);
        midiEnabled = tempOriginalMidiEnabled; // Restore state
      } else { // This else branch would respect the global midiEnabled flag
        sendMidiNoteOff(noteInfo.note, noteInfo.channel);
      }
      // The caller is responsible for updating noteInfo.playing = false and clearing their map.
    }
  });
}


export async function initMidi(selectElement) {
  try {
    if (navigator.requestMIDIAccess) {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccess = access;
      console.log("MIDI Access Granted");
      // Initial population of the MIDI output list and selection
      updateMidiOutputListAndSelect(selectElement, null); // Pass null for currentActiveNotes initially

      midiAccess.onstatechange = (event) => {
        console.log("MIDI state changed:", event.port.name, event.port.state, event.port.type);
        // Update list and selection, pass null for active notes as state change doesn't know about them directly
        updateMidiOutputListAndSelect(selectElement, null);
        if (event.port.type === "output" && event.port.state === "disconnected") {
          if (midiOutput && event.port.id === midiOutput.id) {
            console.warn("Selected MIDI Output disconnected:", event.port.name);
          }
        } else if (event.port.type === "output" && event.port.state === "connected") {
          console.log("New MIDI Output connected:", event.port.name);
        }
      };
    } else {
      console.warn("Web MIDI API is not supported in this browser.");
      updateMidiOutputListAndSelect(selectElement, null);
    }
  } catch (error) {
    console.error("Could not access MIDI devices.", error);
    updateMidiOutputListAndSelect(selectElement, null);
  }
}

export function updateMidiOutputListAndSelect(selectElement, currentActiveNotes) { // Added currentActiveNotes
  availableMidiOutputs.clear();
  if (midiAccess) {
    midiAccess.outputs.forEach(output => {
      availableMidiOutputs.set(output.id, output);
    });
  }

  if (!selectElement) {
    if (availableMidiOutputs.size > 0 && !midiOutput) {
      midiOutput = availableMidiOutputs.values().next().value;
      console.log("Default MIDI Output set (no select UI):", midiOutput.name);
    } else if (availableMidiOutputs.size === 0) {
      midiOutput = null;
    }
    return;
  }

  const previouslySelectedId = midiOutput ? midiOutput.id : null;
  selectElement.innerHTML = '';

  if (availableMidiOutputs.size === 0) {
    const option = document.createElement('option');
    option.textContent = 'Nenhuma porta MIDI encontrada';
    option.disabled = true;
    selectElement.appendChild(option);
    if (midiOutput && currentActiveNotes) turnOffAllActiveNotes(currentActiveNotes);
    midiOutput = null;
    return;
  }

  availableMidiOutputs.forEach(output => {
    const option = document.createElement('option');
    option.value = output.id;
    option.textContent = output.name;
    selectElement.appendChild(option);
  });

  let newOutputSelected = false;
  if (previouslySelectedId && availableMidiOutputs.has(previouslySelectedId)) {
    selectElement.value = previouslySelectedId;
    if (!midiOutput || midiOutput.id !== previouslySelectedId) newOutputSelected = true;
    midiOutput = availableMidiOutputs.get(previouslySelectedId);
  } else if (availableMidiOutputs.size > 0) {
    const firstOutputId = availableMidiOutputs.keys().next().value;
    selectElement.value = firstOutputId;
    if (!midiOutput || midiOutput.id !== firstOutputId) newOutputSelected = true;
    midiOutput = availableMidiOutputs.get(firstOutputId);
  } else {
    if (midiOutput) newOutputSelected = true; // Output is being removed
    midiOutput = null;
  }

  if (newOutputSelected && currentActiveNotes) { // If output changed and there were active notes
      turnOffAllActiveNotes(currentActiveNotes);
  }

  if (midiOutput) {
    console.log("Populated MIDI outputs. Selected:", midiOutput.name);
  } else {
    console.warn("Populated MIDI outputs. No output selected.");
  }
}

export function handleMidiOutputChange(selectedId, currentActiveNotes) {
  if (availableMidiOutputs.has(selectedId)) {
    const newOutput = availableMidiOutputs.get(selectedId);
    if (!midiOutput || midiOutput.id !== newOutput.id) { // If output is actually changing
        if(midiOutput) { // If there was an old output, turn off notes on it
            turnOffAllActiveNotes(currentActiveNotes);
        }
        midiOutput = newOutput;
        console.log("MIDI Output changed to:", midiOutput.name);
        // Notes should ideally be restarted on the new device by the main application logic (shape17.js)
        // rather than trying to "transfer" them here.
    } else {
        // Output selected is the same as current, do nothing.
    }
  } else {
    console.warn("Selected MIDI output ID not found:", selectedId);
    if (midiOutput) { // If there was an old output, turn off notes
        turnOffAllActiveNotes(currentActiveNotes);
    }
    midiOutput = null;
  }
}

export function toggleMidiEnabled(currentActiveNotes) {
  midiEnabled = !midiEnabled;
  if (midiEnabled) {
    console.log("MIDI output ENABLED.");
    // Application logic (shape17.js) should re-send note ONs if needed.
  } else {
    console.log("MIDI output DISABLED.");
    turnOffAllActiveNotes(currentActiveNotes);
  }
  return midiEnabled;
}

// setActiveMidiNotesReference function is removed.
// The global activeMidiNotes variable is removed.
// All functions that need to operate on active notes now take them as a parameter.**Step 1: Refactor `midi17.js` (Applied)**
The `midi17.js` file has been updated according to the plan:
*   Removed the exported `activeMidiNotes` variable.
*   Removed the `setActiveMidiNotesReference` function.
*   The functions `turnOffAllActiveNotes`, `toggleMidiEnabled`, `handleMidiOutputChange`, and `updateMidiOutputListAndSelect` now consistently rely on a `currentActiveNotes` (or similarly named) argument passed to them when they need to act on the set of playing notes.
*   A `forceSend` mechanism (by temporarily setting `midiEnabled = true`) was added within `turnOffAllActiveNotes` to ensure note-off messages are sent out when this function is called, regardless of the global `midiEnabled` toggle state. This is crucial for clearing notes when MIDI is being disabled or outputs are changed.
*   `setScale` now also accepts `activeNotesToTurnOff` to clear notes when the scale changes.

**Step 2: Refactor `main17.js`**
