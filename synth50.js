// ==========================================================================
// SYNTHESIZER MODULE v50 - synth50.js
// Implementações: Reverb, Delay, LFO, Polifonia, Filtro, Modos Experimentais
// ==========================================================================

let audioCtx = null;
let simpleSynth = null;
let _internalAudioEnabledMaster = true;

export function midiToFrequency(midiNote) {
  if (midiNote < 0 || midiNote > 127) return 0;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export class SimpleSynth {
  constructor(audioContext) {
    this.audioCtx = audioContext;
    this.oscillators = {};
    this.masterGainNode = this.audioCtx.createGain();
    this.masterGainNode.gain.value = 0.5;
    this.masterGainNode.connect(this.audioCtx.destination);
    this.waveform = 'sine';

    this.attackTime = 0.01;
    this.decayTime = 0.1;
    this.sustainLevel = 0.7;
    this.releaseTime = 0.2;

    this.distortionNode = this.audioCtx.createWaveShaper();
    this.distortionNode.oversample = '4x';
    this.distortionAmount = 0;
    this._updateDistortionCurve();

    // --- Reverb (ConvolverNode) ---
    this.reverbNode = this.audioCtx.createConvolver();
    this.reverbWetGain = this.audioCtx.createGain();
    this.reverbDryGain = this.audioCtx.createGain();
    this.reverbWetGain.gain.value = 0.3; // Default wet level
    this.reverbDryGain.gain.value = 0.7; // Default dry level
    this.reverbEnabled = false; // Default to off, user can enable via UI
    this.loadedIRUrl = ""; // V50: To store the URL of the currently loaded IR

    // --- Delay (DelayNode) ---
    this.delayNode = this.audioCtx.createDelay(2.0); // Max delay time 2 seconds
    this.delayFeedbackGain = this.audioCtx.createGain();
    this.delayWetGain = this.audioCtx.createGain();
    this.delayDryGain = this.audioCtx.createGain();
    this.delayFeedbackGain.gain.value = 0.5; // Default feedback
    this.delayNode.delayTime.value = 0.5; // Default delay time
    this.delayWetGain.gain.value = 0.4; // Default wet level
    this.delayDryGain.gain.value = 0.6; // Default dry level
    this.delayEnabled = false; // Default to off

    // Connections:
    // source -> distortion -> delayDryGain -> reverbDryGain -> masterGain
    //                     -> delayNode    -> reverbNode    -> masterGain
    //                     -> delayNode    -> delayFeedbackGain -> delayNode (feedback loop)
    //                                      -> delayWetGain -> reverbDryGain (if reverb is after delay) OR masterGain
    //                                                      -> reverbNode (if reverb is after delay) -> masterGain
    //
    // New audio routing:
    // osc/gainNode (ADSR) -> distortionNode -> _preDelayGain -> masterGainNode
    //                                          -> delayNode -> delayFeedbackGain -> delayNode (loop)
    //                                                       -> delayWetGain -> _preReverbGain -> masterGainNode
    //                                                                          -> reverbNode -> reverbWetGain -> masterGainNode
    //                                                                          -> reverbDryGain -------------> masterGainNode
    // _preDelayGain also connects to _preReverbGain (delay bypass)
    // _preReverbGain also connects to masterGainNode (reverb bypass)

    this._preDelayGain = this.audioCtx.createGain(); // Input to Delay section (or bypass to reverb)
    this._preReverbGain = this.audioCtx.createGain(); // Input to Reverb section (or bypass to master)

    // Connect distortion to the start of the effects chain
    this.distortionNode.connect(this._preDelayGain);

    // --- Delay Connections ---
    this._preDelayGain.connect(this.delayNode);       // Signal to delay effect
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode); // Feedback loop
    this.delayNode.connect(this.delayWetGain);      // Wet signal from delay

    // --- Reverb Connections ---
    // Output of Delay section (wet and dry bypass) goes to Reverb section input (_preReverbGain)
    this.delayWetGain.connect(this._preReverbGain);      // Delay's wet output to reverb input
    this._preDelayGain.connect(this._preReverbGain);    // Delay's dry bypass to reverb input (controlled by delayDryGain logic)

    this._preReverbGain.connect(this.reverbNode);     // Signal to reverb effect
    this.reverbNode.connect(this.reverbWetGain);    // Wet signal from reverb

    // --- Master Connections ---
    // Output of Reverb section (wet and dry bypass) goes to MasterGain
    this.reverbWetGain.connect(this.masterGainNode);     // Reverb's wet output to master
    this._preReverbGain.connect(this.masterGainNode);   // Reverb's dry bypass to master (controlled by reverbDryGain logic)

    // Initial state: effects are off by default, meaning dry paths are fully open.
    this.setDelayEnabled(this.delayEnabled);
    this.setReverbEnabled(this.reverbEnabled);

    // --- LFO ---
    this.lfo = this.audioCtx.createOscillator();
    this.lfoGain = this.audioCtx.createGain();
    this.lfoWaveform = 'sine';
    this.lfoFrequency = 5; // Hz
    this.lfoDepth = 0; // 0 to 1, or larger for pitch
    this.lfoTarget = 'none'; // 'none', 'volume', 'pitch', 'filterCutoff'

    this.lfo.type = this.lfoWaveform;
    this.lfo.frequency.setValueAtTime(this.lfoFrequency, this.audioCtx.currentTime);
    this.lfoGain.gain.setValueAtTime(this.lfoDepth, this.audioCtx.currentTime);
    this.lfo.connect(this.lfoGain);
    this.lfo.start();
    this._updateLfoConnection(); // Connect LFO based on initial target

    console.log("SimpleSynth v50 inicializado com ADSR, Distortion, Reverb, Delay e LFO.");
  }

  _updateDistortionCurve() {
    const k = typeof this.distortionAmount === 'number' ? this.distortionAmount : 0;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;

    if (k === 0) {
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2 / n_samples) - 1;
            curve[i] = x;
        }
    } else {
        const effectiveK = k * 5;
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2 / n_samples) - 1;
            curve[i] = (Math.PI/2 + effectiveK) * x / (Math.PI/2 + effectiveK * Math.abs(x));
            curve[i] = Math.max(-1, Math.min(1, curve[i]));
        }
    }
    this.distortionNode.curve = curve;
  }

  setDistortion(amount) {
    this.distortionAmount = parseFloat(amount);
    if (isNaN(this.distortionAmount)) this.distortionAmount = 0;
    this.distortionAmount = Math.max(0, Math.min(100, this.distortionAmount));
    this._updateDistortionCurve();
    console.log(`Synth Distortion Amount set to: ${this.distortionAmount}`);
  }

  setAttack(time) {
    this.attackTime = Math.max(0.001, time);
    console.log(`Synth Attack Time set to: ${this.attackTime}s`);
  }

  setDecay(time) {
    this.decayTime = Math.max(0.001, time);
    console.log(`Synth Decay Time set to: ${this.decayTime}s`);
  }

  setSustain(level) {
    this.sustainLevel = Math.max(0, Math.min(1, level));
    console.log(`Synth Sustain Level set to: ${this.sustainLevel}`);
  }

  setRelease(time) {
    this.releaseTime = Math.max(0.001, time);
    console.log(`Synth Release Time set to: ${this.releaseTime}s`);
  }

  setWaveform(newWaveform) {
    const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    if (validWaveforms.includes(newWaveform)) {
      this.waveform = newWaveform;
      console.log(`Synth waveform set to: ${this.waveform}`);
    } else {
      console.warn(`Invalid waveform: ${newWaveform}. Keeping ${this.waveform}.`);
    }
  }

  setMasterVolume(volume) {
    if (volume >= 0 && volume <= 1) {
      this.masterGainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      console.log(`Synth master volume set to: ${volume}`);
    } else {
      console.warn(`Invalid volume: ${volume}. Must be between 0 and 1.`);
    }
  }

  noteOn(midiNote, velocity = 127) {
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(() => {
        console.log("AudioContext resumed by noteOn in synth49.js"); // v49 Update
        this._playNote(midiNote, velocity);
      }).catch(e => console.error("Error resuming AudioContext in synth49.js:", e)); // v49 Update
      return;
    }
    if (!_internalAudioEnabledMaster) {
        return;
    }
    this._playNote(midiNote, velocity);
  }

  _playNote(midiNote, velocity) {
    const freq = midiToFrequency(midiNote);
    if (freq === 0) return;

    if (this.oscillators[midiNote]) {
      this.oscillators[midiNote].osc.stop(this.audioCtx.currentTime);
      this.oscillators[midiNote].gainNode.disconnect();
      delete this.oscillators[midiNote];
    }

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    osc.type = this.waveform;
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

    const velocityGain = (velocity / 127);
    const peakGain = velocityGain;
    const sustainGain = peakGain * this.sustainLevel;

    const now = this.audioCtx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);

    gainNode.gain.linearRampToValueAtTime(peakGain, now + this.attackTime);
    gainNode.gain.linearRampToValueAtTime(sustainGain, now + this.attackTime + this.decayTime);

    osc.connect(gainNode);
    // gainNode.connect(this.distortionNode); // Output of ADSR gain will now go to distortion
    gainNode.connect(this.distortionNode); // ADSR output goes to distortion
    osc.start(now);

    this.oscillators[midiNote] = { osc, gainNode, baseFrequency: freq }; // Store base frequency for LFO pitch mod

    // If LFO targets pitch, connect it to this new oscillator
    if (this.lfoTarget === 'pitch') {
        // LFO depth for pitch is in cents. Max 1200 cents (1 octave)
        // The lfoGain output is -1 to 1. We scale it.
        // For OscillatorNode.frequency, the LFO must be connected directly,
        // and its gain (lfoGain) output is scaled to frequency range.
        // For OscillatorNode.detune, lfoGain output is scaled to cents.
        // Using detune is generally better for pitch LFOs.
        const lfoPitchModulator = this.audioCtx.createGain();
        lfoPitchModulator.gain.value = this.lfoDepth * 100; // e.g., depth 1 = 100 cents
        this.lfoGain.connect(lfoPitchModulator);
        lfoPitchModulator.connect(osc.detune);
        this.oscillators[midiNote].lfoPitchModulator = lfoPitchModulator;
    }
  }

  _disconnectLfoFromAllOscs() {
    for (const noteId in this.oscillators) {
        if (this.oscillators[noteId].lfoPitchModulator) {
            this.oscillators[noteId].lfoPitchModulator.disconnect();
            delete this.oscillators[noteId].lfoPitchModulator;
        }
        // If LFO was connected directly to frequency, ensure that's disconnected too.
        // This example uses detune, so direct frequency connection isn't an issue here.
    }
  }

  // --- Reverb Methods ---
  async loadReverbImpulseResponse(url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.audioCtx.decodeAudioData(arrayBuffer, (buffer) => {
        this.reverbNode.buffer = buffer;
        this.loadedIRUrl = url; // V50: Store the URL
        console.log(`Reverb IR loaded: ${url}`);
        // Ensure connections are updated if reverb was disabled and now has a buffer
        if (this.reverbEnabled) {
            this.setReverbEnabled(true); // Re-apply to connect
        }
      }, (e) => {
        console.error(`Error decoding reverb IR: ${url}`, e);
        this.loadedIRUrl = ""; // Clear if error
      });
    } catch (e) {
      console.error(`Error fetching reverb IR: ${url}`, e);
    }
  }

  setReverbEnabled(enabled) {
    this.reverbEnabled = !!enabled;
    if (this.reverbEnabled && this.reverbNode.buffer) {
      // Connect _preReverbGain to reverbNode and reverbWetGain to masterGainNode
      // The dry path is _preReverbGain -> reverbDryGain -> masterGainNode
      this._preReverbGain.disconnect(this.masterGainNode); // Disconnect direct bypass to master

      this._preReverbGain.connect(this.reverbNode);
      this._preReverbGain.connect(this.reverbDryGain); // Connect to dry path gain for reverb section
      this.reverbDryGain.connect(this.masterGainNode);

      this.reverbNode.connect(this.reverbWetGain);
      this.reverbWetGain.connect(this.masterGainNode);
      this.setReverbMix(this.reverbWetGain.gain.value); // Apply current mix
      console.log("Reverb Enabled and Connected.");
    } else {
      // Bypass reverb: _preReverbGain connects directly to masterGainNode
      this._preReverbGain.disconnect(this.reverbNode);
      this._preReverbGain.disconnect(this.reverbDryGain);
      this.reverbDryGain.disconnect(this.masterGainNode);
      this.reverbWetGain.disconnect(this.masterGainNode);

      this._preReverbGain.connect(this.masterGainNode);
      console.log("Reverb Disabled or No IR. Bypassed (_preReverbGain to masterGainNode).");
    }
  }

  setReverbMix(wetAmount) { // wetAmount is 0 to 1
    wetAmount = Math.max(0, Math.min(1, wetAmount));
    const dryAmount = 1 - wetAmount;
    this.reverbWetGain.gain.setValueAtTime(wetAmount, this.audioCtx.currentTime);
    this.reverbDryGain.gain.setValueAtTime(dryAmount, this.audioCtx.currentTime);
    console.log(`Reverb Mix set to: Wet ${wetAmount.toFixed(2)}, Dry ${dryAmount.toFixed(2)}`);
  }

  // --- Delay Methods ---
  setDelayEnabled(enabled) {
    this.delayEnabled = !!enabled;
    if (this.delayEnabled) {
      // Connect _preDelayGain to delayNode and delayWetGain to _preReverbGain
      // The dry path is _preDelayGain -> delayDryGain -> _preReverbGain
      this._preDelayGain.disconnect(this._preReverbGain); // Disconnect direct bypass to _preReverbGain

      this._preDelayGain.connect(this.delayNode);
      this._preDelayGain.connect(this.delayDryGain); // Connect to dry path gain for delay section
      this.delayDryGain.connect(this._preReverbGain);

      this.delayNode.connect(this.delayWetGain);
      this.delayWetGain.connect(this._preReverbGain);
      this.setDelayMix(this.delayWetGain.gain.value); // Apply current mix
      console.log("Delay Enabled and Connected.");
    } else {
      // Bypass delay: _preDelayGain connects directly to _preReverbGain
      this._preDelayGain.disconnect(this.delayNode);
      this._preDelayGain.disconnect(this.delayDryGain);
      this.delayDryGain.disconnect(this._preReverbGain);
      this.delayWetGain.disconnect(this._preReverbGain);

      this._preDelayGain.connect(this._preReverbGain);
      console.log("Delay Disabled. Bypassed (_preDelayGain to _preReverbGain).");
    }
    // After enabling/disabling delay, reverb routing might need re-evaluation
    this.setReverbEnabled(this.reverbEnabled);
  }

  setDelayTime(timeInSeconds) {
    const t = Math.max(0, Math.min(2.0, timeInSeconds)); // Clamp between 0 and 2s (max delay)
    this.delayNode.delayTime.setValueAtTime(t, this.audioCtx.currentTime);
    console.log(`Delay Time set to: ${t.toFixed(3)}s`);
  }

  setDelayFeedback(feedbackAmount) { // feedbackAmount is 0 to 1 (though can be >1 for runaway)
    const f = Math.max(0, Math.min(0.95, feedbackAmount)); // Clamp to avoid instant blow-up, max 0.95
    this.delayFeedbackGain.gain.setValueAtTime(f, this.audioCtx.currentTime);
    console.log(`Delay Feedback set to: ${f.toFixed(2)}`);
  }

  setDelayMix(wetAmount) { // wetAmount is 0 to 1
    const dryAmount = 1 - wetAmount;
    this.delayWetGain.gain.setValueAtTime(wetAmount, this.audioCtx.currentTime);
    this.delayDryGain.gain.setValueAtTime(dryAmount, this.audioCtx.currentTime);
    console.log(`Delay Mix set to: Wet ${wetAmount.toFixed(2)}, Dry ${dryAmount.toFixed(2)}`);
  }


  noteOff(midiNote) {
    if (!_internalAudioEnabledMaster && this.oscillators[midiNote]) {
        const { osc, gainNode } = this.oscillators[midiNote];
        const now = this.audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        osc.stop(now);
        gainNode.disconnect();
        delete this.oscillators[midiNote];
        return;
    }

    if (this.oscillators[midiNote]) {
      const { osc, gainNode } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;

      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + this.releaseTime);

      osc.stop(now + this.releaseTime + 0.01);

      setTimeout(() => {
        if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
          gainNode.disconnect();
          delete this.oscillators[midiNote];
        }
      }, (this.releaseTime + 0.05) * 1000);
    }
  }

  allNotesOff() {
    console.log("Synth v49 All Notes Off (ADSR aware)"); // v49 Update
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode, lfoPitchModulator } = this.oscillators[midiNote];
        gainNode.gain.cancelScheduledValues(now);
        const quickRelease = 0.05;
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);
        osc.stop(now + quickRelease + 0.01);

        if (lfoPitchModulator) {
            lfoPitchModulator.disconnect();
        }

        const currentOsc = osc;
        const currentGainNode = gainNode;
        const currentMidiNote = midiNote;
        setTimeout(() => {
            if (this.oscillators[currentMidiNote] && this.oscillators[currentMidiNote].osc === currentOsc) {
                currentGainNode.disconnect();
                delete this.oscillators[currentMidiNote];
            }
        }, (quickRelease + 0.05) * 1000);
      }
    }
  }

  // --- LFO Methods ---
  setLfoWaveform(waveform) {
    const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    if (validWaveforms.includes(waveform)) {
      this.lfoWaveform = waveform;
      this.lfo.type = this.lfoWaveform;
      console.log(`LFO Waveform set to: ${this.lfoWaveform}`);
    } else {
      console.warn(`Invalid LFO waveform: ${waveform}. Keeping ${this.lfoWaveform}.`);
    }
  }

  setLfoFrequency(freq) {
    this.lfoFrequency = Math.max(0.01, Math.min(20, freq)); // Clamp LFO freq, e.g., 0.01Hz to 20Hz
    this.lfo.frequency.setValueAtTime(this.lfoFrequency, this.audioCtx.currentTime);
    console.log(`LFO Frequency set to: ${this.lfoFrequency.toFixed(2)} Hz`);
  }

  setLfoDepth(depth) {
    // Depth scaling depends on target. For volume, 0-1 is fine. For pitch (cents), it needs scaling.
    // Let's assume depth is 0-1 from UI, and we scale it in _updateLfoConnection or when connecting.
    this.lfoDepth = Math.max(0, Math.min(1, depth)); // General depth 0-1
    this.lfoGain.gain.setValueAtTime(this.lfoDepth, this.audioCtx.currentTime);

    // If target is pitch, update existing modulators
    if (this.lfoTarget === 'pitch') {
        for (const noteId in this.oscillators) {
            if (this.oscillators[noteId].lfoPitchModulator) {
                // Max modulation depth for pitch, e.g., 1200 cents (1 octave)
                // Or a smaller value like 200 cents (2 semitones) for vibrato
                const pitchModDepthCents = this.lfoDepth * 200; // Max 2 semitones vibrato
                this.oscillators[noteId].lfoPitchModulator.gain.setValueAtTime(pitchModDepthCents, this.audioCtx.currentTime);
            }
        }
    }
    console.log(`LFO Depth set to: ${this.lfoDepth.toFixed(2)}`);
  }

  setLfoTarget(target) {
    const validTargets = ['none', 'volume', 'pitch', 'filterCutoff'];
    if (validTargets.includes(target)) {
      this.lfoTarget = target;
      this._updateLfoConnection();
      console.log(`LFO Target set to: ${this.lfoTarget}`);
    } else {
      console.warn(`Invalid LFO target: ${target}. Keeping ${this.lfoTarget}.`);
    }
  }

  _updateLfoConnection() {
    // Disconnect LFO from all previous targets
    try { this.lfoGain.disconnect(); } catch (e) { /* might not be connected */ }
    this._disconnectLfoFromAllOscs(); // Specifically for pitch target

    switch (this.lfoTarget) {
      case 'none':
        // LFO is not connected to anything
        break;
      case 'volume':
        // Modulate master volume. Depth 0-1 maps to gain modulation.
        // For tremolo, LFO output (-1 to 1) should modulate gain around a central point.
        // Or, more simply, use LFO to control a gain node through which the main signal passes.
        // However, AudioParams can't be assigned directly, they must be modulated.
        // A common approach is to connect LFO to the gain AudioParam.
        // For masterGainNode, its gain is usually 0-1. LFO depth 1 could mean full modulation from 0 to original_value*2
        // This is tricky. A simpler tremolo: lfoGain modulates masterGain.gain.
        // Let's make lfoDepth scale the *amount* of gain change.
        // If masterGain.gain is G, LFO could make it G*(1 + lfoDepth * lfoValue)
        // For now, connect to masterGainNode.gain. Max lfoGain output is lfoDepth.
        // If masterGain is 0.5, and lfoDepth is 0.5, gain will vary from 0 to 1.
        // This requires careful scaling. A simpler start:
        this.lfoGain.connect(this.masterGainNode.gain);
        // Note: This direct connection means LFO output will *override* masterGain.gain value,
        // unless masterGain.gain is treated as a base and LFO adds to it.
        // A better way: lfoGain.connect(gainParam) where gainParam is a small range.
        // For now, this will make volume go from 0 to `lfoDepth * masterGainNode.gain.defaultValue` (or current value)
        // This is not ideal. Proper tremolo needs lfo to modulate *around* the set gain.
        // For now, we'll accept this simplification, or the user must set masterGain to max.
        // Or, the LFO depth must be scaled appropriately. Let's assume lfoDepth is small (e.g. 0.1 for 10% modulation)
        // And it will modulate the gain param directly. Max value for gain is usually 1.
        // So, lfoGain (output 0 to lfoDepth) directly sets the gain.
        // This means master volume slider will be less effective when LFO is on volume.
        // Let's assume lfoGain's output is scaled by lfoDepth to be, say, +/- 0.5 if lfoDepth is 1.
        // This means lfoGain's actual output range is `this.lfoDepth`.
        // If `this.masterGainNode.gain.value` is `V`, LFO will make it vary from `V - this.lfoDepth` to `V + this.lfoDepth`.
        // This is also not quite right as gain can't be negative.
        // Correct approach for master volume tremolo:
        // Disconnect lfoGain from masterGainNode.gain.
        // Instead, the lfoGain (value 0 to lfoDepth) will be used to *scale* the gain.
        // This is complex if masterGainNode is the final output.
        // A dedicated gain node for LFO volume modulation would be better.
        // For now: LFO will modulate the gain value of masterGainNode.
        // The slider for masterGainNode will set the *center* of modulation.
        // The LFO will add/subtract from this. Max LFO output is lfoDepth.
        // So, if masterGain is 0.5, depth 0.2, actual gain will be 0.5 + LFO_val_scaled_by_0.2
        // This is still not perfect. Revisit if problematic.
        // Let's try: LFO modulates a separate GainNode that is *multiplied* by the master volume.
        // For now, the LFO will *add* to the gain value.
        // This means masterGainNode.gain will be its set value + LFO output.
        // This requires lfoGain to be bipolar.
        // Let's assume lfo.connect(lfoGain) makes lfoGain output -lfoDepth to +lfoDepth.
        // Then this output is added to the target param.
        // For gain, it must be clamped.
        // This is getting too complex for a direct connection.
        // Simplest for volume: LFO output (0 to lfoDepth) directly sets the gain.
        // User must adjust master volume slider and LFO depth carefully.
        // THIS IS A KNOWN SIMPLIFICATION / POTENTIAL ISSUE.
        console.warn("LFO to Volume: Current implementation directly connects LFO gain to masterGain.gain. This may override master volume settings or require careful adjustment of LFO depth and master volume.");
        this.lfoGain.connect(this.masterGainNode.gain);
        break;
      case 'pitch':
        // For each existing and new oscillator, connect lfoGain to its detune param.
        // Depth for pitch needs scaling, e.g. lfoDepth 1.0 = 100 cents or 1200 cents.
        // This is handled in _playNote and setLfoDepth.
        // Reconnect to all existing oscillators:
        for (const noteId in this.oscillators) {
            const oscObj = this.oscillators[noteId];
            if (oscObj.osc) {
                const lfoPitchModulator = this.audioCtx.createGain();
                // Max modulation depth for pitch, e.g., 200 cents (2 semitones) for vibrato
                lfoPitchModulator.gain.value = this.lfoDepth * 200;
                this.lfoGain.connect(lfoPitchModulator);
                lfoPitchModulator.connect(oscObj.osc.detune);
                oscObj.lfoPitchModulator = lfoPitchModulator;
            }
        }
        break;
      case 'filterCutoff':
        // Connect to filter's frequency parameter when filter is implemented.
        // if (this.filterNode) {
        //   this.lfoGain.connect(this.filterNode.frequency);
        // }
        console.log("LFO Target 'filterCutoff' selected, but filter is not yet implemented.");
        break;
    }
  }
}

export function initAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        console.log("AudioContext (v49) está suspenso. Requer interação do usuário para iniciar."); // v49 Update
      }
      simpleSynth = new SimpleSynth(audioCtx);
      console.log("AudioContext e SimpleSynth (v49) inicializados."); // v49 Update
      return true;
    } catch (e) {
      console.error("Web Audio API não é suportada neste navegador (v49).", e); // v49 Update
      return false;
    }
  }
  return true;
}

export function initAudioContextOnGesture() {
  if (!audioCtx) {
    if (!initAudioContext()) {
        console.error("Falha ao inicializar AudioContext no gesto (v49)."); // v49 Update
        return false;
    }
  }

  let resumed = false;
  if (audioCtx && audioCtx.state === 'suspended') {
    // Retornar a Promise aqui para que o chamador possa aguardar a resolução
    return audioCtx.resume().then(() => { // MODIFICADO para retornar a Promise
      console.log('AudioContext (v50) resumido com sucesso por gesto do usuário!');
      if (!simpleSynth) {
          simpleSynth = new SimpleSynth(audioCtx);
          console.log("SimpleSynth (v50) instanciado após resumo do AudioContext.");
      }
      // A lógica de atualização de volume/waveform que estava aqui,
      // idealmente, deveria ser tratada pelo chamador (main50.js)
      // após a Promise de initAudioContextOnGesture resolver.
      // Por enquanto, vamos manter para minimizar quebras, mas isso pode ser refatorado.
      const mainApp = window; // Isso se tornará problemático com módulos.
                             // main50.js precisará passar referências ou os valores diretamente.
      if (mainApp.audioMasterVolumeSlider && simpleSynth) {
          const currentVolume = parseFloat(mainApp.audioMasterVolumeSlider.value);
          if (simpleSynth.setMasterVolume) simpleSynth.setMasterVolume(currentVolume);
      }
      if (mainApp.audioWaveformSelect && simpleSynth) {
          const currentWaveform = mainApp.audioWaveformSelect.value;
          if (simpleSynth.setWaveform) simpleSynth.setWaveform(currentWaveform);
      }
      return true; // Indicar sucesso
    }).catch(e => {
        console.error('Erro ao resumir AudioContext (v50):', e);
        return false; // Indicar falha
    });
  } else if (audioCtx && audioCtx.state === 'running') {
    console.log('AudioContext (v50) já está rodando.');
    if (!simpleSynth) { // Adicionado para garantir que simpleSynth seja instanciado se o contexto já estiver rodando
        simpleSynth = new SimpleSynth(audioCtx);
        console.log("SimpleSynth (v50) instanciado com AudioContext já rodando.");
    }
    return Promise.resolve(true); // Retornar uma Promise resolvida
  } else {
    console.warn('AudioContext (v50) não está suspenso, mas também não está rodando, ou não foi inicializado.');
    return Promise.resolve(false); // Retornar uma Promise resolvida com falha
  }
}

export function setInternalAudioEnabledState(enabled) {
    _internalAudioEnabledMaster = !!enabled;
    if (!_internalAudioEnabledMaster && simpleSynth) {
        simpleSynth.allNotesOff();
    }
    console.log(`Synth v50 _internalAudioEnabledMaster state set to: ${_internalAudioEnabledMaster}`);
}

export function getSimpleSynthInstance() {
    if (!audioCtx) initAudioContext(); // Garante que o contexto e o synth sejam inicializados se ainda não foram
    if (audioCtx && !simpleSynth) simpleSynth = new SimpleSynth(audioCtx); // Garante que simpleSynth seja instanciado
    return simpleSynth;
}

export function getAudioContext() {
    if (!audioCtx) initAudioContext(); // Garante que o contexto seja inicializado
    return audioCtx;
}

console.log("synth50.js carregado como módulo.");
