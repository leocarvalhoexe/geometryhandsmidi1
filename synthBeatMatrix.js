// ==========================================================================
// SYNTHESIZER MODULE - synthBeatMatrix.js
// Adapted from synth68.js
// ==========================================================================

const VALID_WAVEFORMS_SYNTH = ['sine', 'square', 'sawtooth', 'triangle', 'noise', 'pulse'];

function midiToFrequency(midiNote) {
  if (midiNote < 0 || midiNote > 127) return 0;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

class SimpleSynth {
  constructor(audioContext) {
    this.audioCtx = audioContext;
    this.oscillators = {}; // Stores active oscillator nodes for each MIDI note
    this.masterGainNode = this.audioCtx.createGain();
    this.masterGainNode.gain.value = 0.5; // Default master volume
    this.masterGainNode.connect(this.audioCtx.destination);

    this.waveform = 'sine'; // Default waveform

    // ADSR Envelope parameters
    this.attackTime = 0.01;
    this.decayTime = 0.1;
    this.sustainLevel = 0.7;
    this.releaseTime = 0.2;

    // Distortion Effect
    this.distortionNode = this.audioCtx.createWaveShaper();
    this.distortionNode.oversample = '4x';
    this.distortionAmount = 0; // Percentage (0-100)
    this._updateDistortionCurve();

    // Filter Effect
    this.filterNode = this.audioCtx.createBiquadFilter();
    this.filterNode.type = 'lowpass'; // Default filter type
    this.filterNode.frequency.value = 20000; // Default cutoff frequency
    this.filterNode.Q.value = 1; // Default resonance (Q factor)

    // LFO (Low-Frequency Oscillator)
    this.lfo = this.audioCtx.createOscillator();
    this.lfo.type = 'sine'; // Default LFO waveform
    this.lfo.frequency.value = 5; // Default LFO rate (Hz)
    this.lfoGainPitch = this.audioCtx.createGain(); // LFO depth for pitch modulation
    this.lfoGainPitch.gain.value = 0; // Default pitch modulation depth
    this.lfoGainFilter = this.audioCtx.createGain(); // LFO depth for filter cutoff modulation
    this.lfoGainFilter.gain.value = 0; // Default filter modulation depth

    // Connect LFO outputs
    this.lfo.connect(this.lfoGainPitch);
    this.lfo.connect(this.lfoGainFilter);
    if (this.filterNode) {
        // This connection will be made to individual oscillator frequencies if pitch mod is active
        // For filter mod, it connects to the main filter node's frequency
        this.lfoGainFilter.connect(this.filterNode.frequency);
    }
    this.lfo.start(); // Start the LFO

    // Delay Effect
    this.delayNode = this.audioCtx.createDelay(2.0); // Max delay time of 2 seconds
    this.delayFeedbackGain = this.audioCtx.createGain();
    this.delayWetGain = this.audioCtx.createGain();
    this.delayDryGain = this.audioCtx.createGain();

    // Routing for Delay:
    // Input -> delayDryGain -> Output
    // Input -> delayNode -> delayWetGain -> Output
    // delayNode -> delayFeedbackGain -> delayNode (feedback loop)
    this.filterNode.connect(this.delayDryGain); // Connect output of filter to dry path of delay

    this.filterNode.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode); // Feedback loop
    this.delayNode.connect(this.delayWetGain);

    // Default delay parameters
    this.delayNode.delayTime.value = 0.5;
    this.delayFeedbackGain.gain.value = 0.3;
    this.setDelayMix(0); // Initially no delay effect

    // Reverb Effect (using ConvolverNode)
    this.convolverNode = this.audioCtx.createConvolver();
    this.reverbWetGain = this.audioCtx.createGain();
    this.reverbDryGain = this.audioCtx.createGain();

    // Routing for Reverb (takes output from Delay stage):
    // DelayOutput (Dry) -> reverbDryGain -> MasterOutput
    // DelayOutput (Dry) -> convolverNode -> reverbWetGain -> MasterOutput
    // DelayOutput (Wet) -> reverbDryGain -> MasterOutput
    // DelayOutput (Wet) -> convolverNode -> reverbWetGain -> MasterOutput

    // Disconnect delay outputs from master, route through reverb
    this.delayDryGain.connect(this.reverbDryGain);
    this.delayWetGain.connect(this.reverbDryGain); // Wet signal from delay also goes to reverb's dry path

    this.delayDryGain.connect(this.convolverNode);
    this.delayWetGain.connect(this.convolverNode); // Wet signal from delay also goes to reverb's wet path

    this.reverbDryGain.connect(this.masterGainNode);
    this.convolverNode.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.masterGainNode);

    this._generateSimpleImpulseResponse().then(buffer => {
      if (this.convolverNode) this.convolverNode.buffer = buffer;
    }).catch(e => console.error("Error generating IR for reverb:", e));

    this.setReverbMix(0); // Initially no reverb effect

    // Final connection path:
    // Oscillator -> Gain (ADSR) -> Distortion -> Filter -> Delay -> Reverb -> MasterGain -> Destination
    // LFOs connect to Oscillator Pitch (per note) and Filter Cutoff (global)

    this.noiseBuffer = null; // For 'noise' waveform
    if (this.audioCtx) {
        this._createNoiseBuffer();
    }
    console.log("SimpleSynth (beatMatrix version) initialized.");
  }

  _createNoiseBuffer() {
    if (!this.audioCtx) {
        console.warn("AudioContext not available for creating noise buffer.");
        return;
    }
    const bufferSize = this.audioCtx.sampleRate * 2; // 2 seconds of noise
    this.noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1; // Generate white noise
    }
  }

  async _generateSimpleImpulseResponse() {
    // Creates a very basic impulse response for the convolver reverb
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * 0.1; // Short reverb tail
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate); // Stereo
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const n = length - i;
      // Simple decaying noise
      left[i] = (Math.random() * 2 - 1) * (n / length) * 0.2;
      right[i] = (Math.random() * 2 - 1) * (n / length) * 0.2;
    }
    return impulse;
  }

  _updateDistortionCurve() {
    const k = typeof this.distortionAmount === 'number' ? this.distortionAmount : 0;
    const n_samples = 44100; // Standard sample count for curve
    const curve = new Float32Array(n_samples);
    if (k === 0) { // No distortion, linear curve
        for (let i = 0; i < n_samples; ++i) curve[i] = (i * 2 / n_samples) - 1;
    } else {
        // Simple non-linear distortion formula
        const effectiveK = k * 5; // Scale factor for distortion intensity
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2 / n_samples) - 1; // Input signal range -1 to 1
            curve[i] = (Math.PI/2 + effectiveK) * x / (Math.PI/2 + effectiveK * Math.abs(x));
            curve[i] = Math.max(-1, Math.min(1, curve[i])); // Clip to -1 to 1
        }
    }
    this.distortionNode.curve = curve;
  }

  // --- Setters for Synth Parameters ---

  setWaveform(newWaveform) {
    if (VALID_WAVEFORMS_SYNTH.includes(newWaveform)) {
        this.waveform = newWaveform;
    } else {
        console.warn(`Invalid waveform: ${newWaveform}. Not changed.`);
    }
  }

  setMasterVolume(volume) {
    const vol = parseFloat(volume);
    if (vol >= 0 && vol <= 1) this.masterGainNode.gain.setValueAtTime(vol, this.audioCtx.currentTime);
  }

  setAttack(time) { this.attackTime = Math.max(0.001, parseFloat(time)); }
  setDecay(time) { this.decayTime = Math.max(0.001, parseFloat(time)); }
  setSustain(level) { this.sustainLevel = Math.max(0, Math.min(1, parseFloat(level))); }
  setRelease(time) { this.releaseTime = Math.max(0.001, parseFloat(time)); }

  setDistortion(amount) { // amount is 0-100
    this.distortionAmount = Math.max(0, Math.min(100, parseFloat(amount) || 0));
    this._updateDistortionCurve();
  }

  setFilterCutoff(frequency) {
    if (this.filterNode) {
      const clampedFrequency = Math.max(20, Math.min(20000, parseFloat(frequency)));
      this.filterNode.frequency.setValueAtTime(clampedFrequency, this.audioCtx.currentTime);
    }
  }

  setFilterResonance(qValue) {
    if (this.filterNode) {
      const clampedQ = Math.max(0.0001, Math.min(30, parseFloat(qValue))); // Adjusted max Q for usability
      this.filterNode.Q.setValueAtTime(clampedQ, this.audioCtx.currentTime);
    }
  }

  setLfoWaveform(waveform) {
    const validLfoWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    if (this.lfo && validLfoWaveforms.includes(waveform)) {
      this.lfo.type = waveform;
    }
  }

  setLfoRate(rate) { // Hz
    if (this.lfo) {
      const clampedRate = Math.max(0.01, Math.min(20, parseFloat(rate))); // Typical LFO rate range
      this.lfo.frequency.setValueAtTime(clampedRate, this.audioCtx.currentTime);
    }
  }

  setLfoPitchDepth(depth) { // Depth in Hz or semitones, depending on interpretation
    if (this.lfoGainPitch) {
      const clampedDepth = Math.max(0, Math.min(50, parseFloat(depth))); // Example range
      this.lfoGainPitch.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
    }
  }

  setLfoFilterDepth(depth) { // Depth in Hz for filter cutoff modulation
    if (this.lfoGainFilter) {
      const clampedDepth = Math.max(0, Math.min(5000, parseFloat(depth))); // Example range
      this.lfoGainFilter.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
    }
  }

  setDelayTime(time) { // seconds
    if (this.delayNode) {
      const clampedTime = Math.max(0.001, Math.min(2.0, parseFloat(time)));
      this.delayNode.delayTime.setValueAtTime(clampedTime, this.audioCtx.currentTime);
    }
  }

  setDelayFeedback(feedback) { // 0 to ~0.95
    if (this.delayFeedbackGain) {
      const clampedFeedback = Math.max(0, Math.min(0.95, parseFloat(feedback)));
      this.delayFeedbackGain.gain.setValueAtTime(clampedFeedback, this.audioCtx.currentTime);
    }
  }

  setDelayMix(mix) { // 0 (dry) to 1 (wet)
    if (this.delayDryGain && this.delayWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      // Equal-power crossfade
      this.delayDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.delayWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
    }
  }

  setReverbMix(mix, forNote = null) { // 0 (dry) to 1 (wet)
    if (this.reverbDryGain && this.reverbWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      // Equal-power crossfade
      this.reverbDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.reverbWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
    }
  }

  // --- Note Playback Logic ---

  noteOn(midiNote, velocity = 127) {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
        console.warn("SimpleSynth.noteOn: audioCtx not available or closed.");
        return;
    }
    // Attempt to resume context if suspended, often needed due to browser autoplay policies
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(() => {
        // console.log("AudioContext resumed by noteOn.");
        this._playNote(midiNote, velocity);
      }).catch(e => console.error("Error resuming AudioContext in noteOn:", e));
    } else {
      this._playNote(midiNote, velocity);
    }
  }

  _playNote(midiNote, velocity) {
    const freq = midiToFrequency(midiNote);
    if (freq <= 0 && this.waveform !== 'noise') {
        // console.warn(`Invalid frequency (${freq}Hz) for MIDI note ${midiNote} with waveform ${this.waveform}. Note not played.`);
        return;
    }

    // If an oscillator for this note already exists, stop and clean it up first
    if (this.oscillators[midiNote]) {
        const oldOscData = this.oscillators[midiNote];
        try {
            if (oldOscData.osc) { oldOscData.osc.stop(this.audioCtx.currentTime); }
            if (oldOscData.gainNode && oldOscData.gainNode.numberOfOutputs > 0) { oldOscData.gainNode.disconnect(); }
            if (this.lfoGainPitch && oldOscData.osc && oldOscData.osc.frequency && this.waveform !== 'noise') {
                 this.lfoGainPitch.disconnect(oldOscData.osc.frequency); // Disconnect LFO from old osc
            }
        } catch (e) { /* console.warn("Error cleaning up old oscillator in _playNote:", e); */ }
        delete this.oscillators[midiNote];
    }

    let osc;
    const gainNode = this.audioCtx.createGain();
    const now = this.audioCtx.currentTime;

    // Create oscillator based on waveform
    if (this.waveform === 'noise') {
        if (!this.noiseBuffer) this._createNoiseBuffer();
        if (!this.noiseBuffer) { console.error("Noise buffer unavailable. Cannot play noise note."); return; }
        osc = this.audioCtx.createBufferSource();
        osc.buffer = this.noiseBuffer;
        osc.loop = true;
    } else if (this.waveform === 'pulse') {
        osc = this.audioCtx.createOscillator();
        // Create a simple pulse wave using periodic wave
        // Coefficients for a basic pulse-like sound (can be tuned)
        const realCoeffs = new Float32Array([0, 0.6, 0.4, 0.2, 0.1, 0.05]); // Example: decreasing harmonics
        const imagCoeffs = new Float32Array(realCoeffs.length).fill(0); // No imaginary part for simple pulse
        try {
            const periodicWave = this.audioCtx.createPeriodicWave(realCoeffs, imagCoeffs, { disableNormalization: true });
            osc.setPeriodicWave(periodicWave);
        } catch (e) { // Fallback if createPeriodicWave fails (e.g., unsupported)
            // console.warn("Failed to create PeriodicWave for 'pulse', using 'square' as fallback.", e);
            osc.type = 'square';
        }
        osc.frequency.setValueAtTime(freq, now);
        if (this.lfoGainPitch && osc.frequency) this.lfoGainPitch.connect(osc.frequency); // Connect LFO to pitch
    } else { // For sine, square, sawtooth, triangle
        osc = this.audioCtx.createOscillator();
        osc.type = this.waveform;
        osc.frequency.setValueAtTime(freq, now);
        if (this.lfoGainPitch && osc.frequency) this.lfoGainPitch.connect(osc.frequency); // Connect LFO to pitch
    }

    // ADSR Envelope Application
    const velocityGain = Math.max(0, Math.min(1, (velocity / 127)));
    const peakGain = velocityGain; // Max gain based on velocity
    const sustainGain = peakGain * this.sustainLevel;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now); // Start at 0 gain
    gainNode.gain.linearRampToValueAtTime(peakGain, now + this.attackTime); // Attack phase
    gainNode.gain.linearRampToValueAtTime(sustainGain, now + this.attackTime + this.decayTime); // Decay to sustain

    // Connect oscillator through gain and effects chain
    osc.connect(gainNode);
    gainNode.connect(this.distortionNode); // Gain -> Distortion
    // Distortion -> Filter -> Delay -> Reverb -> MasterGain is handled by constructor connections

    osc.start(now); // Start the oscillator
    this.oscillators[midiNote] = { osc, gainNode, type: this.waveform, connectedToLfoPitch: (this.lfoGainPitch && osc.frequency && this.waveform !== 'noise') };
  }

  noteOff(midiNote) {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
        // console.warn("SimpleSynth.noteOff: audioCtx not available or closed.");
        return;
    }

    if (this.oscillators[midiNote]) {
      const { osc, gainNode, type, connectedToLfoPitch } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;

      if (gainNode && gainNode.numberOfOutputs > 0) { // Check if gainNode is still connected
          // Disconnect LFO from pitch if it was connected for this specific oscillator
          if (connectedToLfoPitch && this.lfoGainPitch && osc && osc.frequency) {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { /* console.warn("LFO already disconnected from osc.frequency or error in noteOff.", e); */ }
          }

          // ADSR Release phase
          gainNode.gain.cancelScheduledValues(now);
          gainNode.gain.setValueAtTime(gainNode.gain.value, now); // Start release from current gain
          gainNode.gain.linearRampToValueAtTime(0, now + this.releaseTime);

          try { osc.stop(now + this.releaseTime + 0.01); } // Stop oscillator after release
          catch (e) { /* console.warn("Error stopping oscillator (may have already been stopped) in noteOff:", e); */ }

          // Clean up oscillator and gain node after release
          setTimeout(() => {
            if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) { // Ensure it's the same osc
                if (gainNode && gainNode.numberOfOutputs > 0) {
                    try { gainNode.disconnect(); } // Disconnect gain node from downstream
                    catch (e) { /* console.warn("Error disconnecting gainNode in noteOff cleanup:", e); */ }
                }
                delete this.oscillators[midiNote];
            }
          }, (this.releaseTime + 0.05) * 1000); // Delay slightly more than release time
      } else { // If gainNode somehow got disconnected or wasn't there
          if (osc) { try { osc.stop(now); } catch(e) { /* ignore */ } }
          delete this.oscillators[midiNote];
      }
    }
  }

  allNotesOff() {
    // console.log("SimpleSynth (beatMatrix version) All Notes Off (ADSR aware)");
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode, type, connectedToLfoPitch } = this.oscillators[midiNote];

        if (gainNode && gainNode.numberOfOutputs > 0) {
            if (connectedToLfoPitch && this.lfoGainPitch && osc && osc.frequency) {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { /* console.warn("LFO already disconnected in allNotesOff.", e); */ }
            }

            gainNode.gain.cancelScheduledValues(now);
            const quickRelease = 0.05; // Faster release for allNotesOff
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);

            try { osc.stop(now + quickRelease + 0.01); }
            catch(e) { /* console.warn("Error stopping oscillator in allNotesOff", e); */ }

            // Schedule cleanup
            const currentOscRef = osc; const currentGainNodeRef = gainNode; const currentMidiNoteKey = midiNote;
            setTimeout(() => {
                if (this.oscillators[currentMidiNoteKey] && this.oscillators[currentMidiNoteKey].osc === currentOscRef) {
                    if (currentGainNodeRef && currentGainNodeRef.numberOfOutputs > 0) {
                        try { currentGainNodeRef.disconnect(); } catch (e) { /* ignora */ }
                    }
                    delete this.oscillators[currentMidiNoteKey];
                }
            }, (quickRelease + 0.05) * 1000);

        } else if (this.oscillators[midiNote]) { // Fallback if gainNode is missing/disconnected
            if(osc) { try { osc.stop(now); } catch(e) { /* ignora */ } }
            delete this.oscillators[midiNote];
        }
      }
    }
  }
}

// console.log("synthBeatMatrix.js loaded and SimpleSynth class defined.");
