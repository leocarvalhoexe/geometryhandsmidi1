// ==========================================================================
// SYNTHESIZER MODULE v74 - synth74.js
// ==========================================================================

// audioCtx e _internalAudioEnabledMaster são gerenciados em main74.js
// simpleSynth (a instância) também é gerenciada em main74.js

const VALID_WAVEFORMS_V74 = ['sine', 'square', 'sawtooth', 'triangle', 'noise', 'pulse'];

function midiToFrequencyV74(midiNote) {
  if (midiNote < 0 || midiNote > 127) return 0;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

class SimpleSynth {
  constructor(audioContext) {
    this.audioCtx = audioContext;
    this.oscillators = {}; // Armazena osciladores ativos por nota MIDI
    this.masterGainNode = this.audioCtx.createGain();
    this.masterGainNode.gain.value = 0.5; // Volume padrão
    this.masterGainNode.connect(this.audioCtx.destination);

    this.waveform = 'sine'; // Forma de onda padrão

    // Parâmetros do Envelope ADSR
    this.attackTime = 0.01;
    this.decayTime = 0.1;
    this.sustainLevel = 0.7;
    this.releaseTime = 0.2;

    // Efeitos (mantendo a estrutura da v73)
    this.distortionNode = this.audioCtx.createWaveShaper();
    this.distortionNode.oversample = '4x';
    this.distortionAmount = 0;
    this._updateDistortionCurve();

    this.filterNode = this.audioCtx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000;
    this.filterNode.Q.value = 1;

    this.distortionNode.connect(this.filterNode);

    // LFO (Low-Frequency Oscillator)
    this.lfo = this.audioCtx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 5; // Hz
    this.lfoGainPitch = this.audioCtx.createGain();
    this.lfoGainPitch.gain.value = 0;
    this.lfoGainFilter = this.audioCtx.createGain();
    this.lfoGainFilter.gain.value = 0;

    this.lfo.connect(this.lfoGainPitch);
    this.lfo.connect(this.lfoGainFilter);
    if (this.filterNode) {
        this.lfoGainFilter.connect(this.filterNode.frequency);
    }
    this.lfo.start();

    // Delay Effect
    this.delayNode = this.audioCtx.createDelay(2.0);
    this.delayFeedbackGain = this.audioCtx.createGain();
    this.delayWetGain = this.audioCtx.createGain();
    this.delayDryGain = this.audioCtx.createGain();

    this.filterNode.connect(this.delayDryGain);
    this.filterNode.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.delayWetGain);

    this.delayNode.delayTime.value = 0.5;
    this.delayFeedbackGain.gain.value = 0.3;
    this.setDelayMix(0);

    // Reverb Effect
    this.convolverNode = this.audioCtx.createConvolver();
    this.reverbWetGain = this.audioCtx.createGain();
    this.reverbDryGain = this.audioCtx.createGain();

    this.filterNode.connect(this.reverbDryGain);
    this.filterNode.connect(this.convolverNode);

    this.delayDryGain.connect(this.masterGainNode);
    this.delayWetGain.connect(this.masterGainNode);

    this.reverbDryGain.connect(this.masterGainNode);
    this.reverbWetGain.connect(this.masterGainNode);

    this._generateSimpleImpulseResponse().then(buffer => {
      if (this.convolverNode) this.convolverNode.buffer = buffer;
    }).catch(e => console.error("Erro ao gerar IR para reverb (v74):", e));

    this.setDelayMix(0);
    this.setReverbMix(0);

    this.noiseBuffer = null;
    if (this.audioCtx) {
        this._createNoiseBuffer();
    }

    console.log("SimpleSynth v74 inicializado.");
  }

  _createNoiseBuffer() {
    if (!this.audioCtx) {
        console.warn("AudioContext não disponível para criar noise buffer (v74).");
        return;
    }
    const bufferSize = this.audioCtx.sampleRate * 2;
    this.noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  async _generateSimpleImpulseResponse() {
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * 0.1;
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const n = length - i;
      left[i] = (Math.random() * 2 - 1) * (n / length) * 0.2;
      right[i] = (Math.random() * 2 - 1) * (n / length) * 0.2;
    }
    return impulse;
  }

  _updateDistortionCurve() {
    const k = typeof this.distortionAmount === 'number' ? this.distortionAmount : 0;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    if (k === 0) {
        for (let i = 0; i < n_samples; ++i) curve[i] = (i * 2 / n_samples) - 1;
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

  setWaveform(newWaveform) {
    if (VALID_WAVEFORMS_V74.includes(newWaveform)) {
        this.waveform = newWaveform;
    } else {
        console.warn(`Invalid waveform: ${newWaveform}. Not changed.`);
    }
  }
  setMasterVolume(volume) {
    if (volume >= 0 && volume <= 1) this.masterGainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
  }
  setAttack(time) { this.attackTime = Math.max(0.001, time); }
  setDecay(time) { this.decayTime = Math.max(0.001, time); }
  setSustain(level) { this.sustainLevel = Math.max(0, Math.min(1, level)); }
  setRelease(time) { this.releaseTime = Math.max(0.001, time); }

  setDistortion(amount) {
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
      const clampedQ = Math.max(0.0001, Math.min(1000, parseFloat(qValue)));
      this.filterNode.Q.setValueAtTime(clampedQ, this.audioCtx.currentTime);
    }
  }
  setLfoWaveform(waveform) {
    const validLfoWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    if (this.lfo && validLfoWaveforms.includes(waveform)) {
      this.lfo.type = waveform;
    }
  }
  setLfoRate(rate) {
    if (this.lfo) {
      const clampedRate = Math.max(0.01, Math.min(100, parseFloat(rate)));
      this.lfo.frequency.setValueAtTime(clampedRate, this.audioCtx.currentTime);
    }
  }
  setLfoPitchDepth(depth) {
    if (this.lfoGainPitch) {
      const clampedDepth = Math.max(0, Math.min(100, parseFloat(depth)));
      this.lfoGainPitch.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
    }
  }
  setLfoFilterDepth(depth) {
    if (this.lfoGainFilter) {
      const clampedDepth = Math.max(0, Math.min(10000, parseFloat(depth)));
      this.lfoGainFilter.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
    }
  }
  setDelayTime(time) {
    if (this.delayNode) {
      const clampedTime = Math.max(0.001, Math.min(2.0, parseFloat(time)));
      this.delayNode.delayTime.setValueAtTime(clampedTime, this.audioCtx.currentTime);
    }
  }
  setDelayFeedback(feedback) {
    if (this.delayFeedbackGain) {
      const clampedFeedback = Math.max(0, Math.min(0.95, parseFloat(feedback)));
      this.delayFeedbackGain.gain.setValueAtTime(clampedFeedback, this.audioCtx.currentTime);
    }
  }
  setDelayMix(mix) {
    if (this.delayDryGain && this.delayWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      this.delayDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.delayWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
    }
  }
  setReverbMix(mix, forNote = null) {
    if (this.reverbDryGain && this.reverbWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      this.reverbDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.reverbWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
    }
  }

  noteOn(midiNote, velocity = 127) {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
        console.warn("SimpleSynth.noteOn (v74): audioCtx não disponível ou fechado.");
        return;
    }
    if (this.audioCtx.state === 'suspended') {
      console.warn("SimpleSynth.noteOn (v74): AudioContext ainda suspenso. O som pode não tocar.");
    }
    this._playNote(midiNote, velocity);
  }

  _playNote(midiNote, velocity) {
    const freq = midiToFrequencyV74(midiNote);
    if (freq <= 0 && this.waveform !== 'noise') {
        console.warn(`Frequência inválida (${freq}Hz) para MIDI note ${midiNote} com waveform ${this.waveform}. Nota não será tocada (v74).`);
        return;
    }

    if (this.oscillators[midiNote]) {
        const oldOscData = this.oscillators[midiNote];
        try {
            if (oldOscData.osc) { oldOscData.osc.stop(this.audioCtx.currentTime); }
            if (oldOscData.gainNode && oldOscData.gainNode.numberOfOutputs > 0) { oldOscData.gainNode.disconnect(); }
            if (this.lfoGainPitch && oldOscData.osc && oldOscData.osc.frequency && this.waveform !== 'noise') {
                 this.lfoGainPitch.disconnect(oldOscData.osc.frequency);
            }
        } catch (e) { console.warn("Erro ao limpar oscilador/gain anterior em _playNote (v74):", e); }
        delete this.oscillators[midiNote];
    }

    let osc;
    const gainNode = this.audioCtx.createGain();
    const now = this.audioCtx.currentTime;

    if (this.waveform === 'noise') {
        if (!this.noiseBuffer) this._createNoiseBuffer();
        if (!this.noiseBuffer) { console.error("Buffer de ruído não pôde ser criado. Impossível tocar nota de ruído (v74)."); return; }
        osc = this.audioCtx.createBufferSource();
        osc.buffer = this.noiseBuffer;
        osc.loop = true;
    } else if (this.waveform === 'pulse') {
        osc = this.audioCtx.createOscillator();
        const realCoeffs = new Float32Array([0, 0.6, 0.4, 0.2, 0.1, 0.05]);
        const imagCoeffs = new Float32Array(realCoeffs.length).fill(0);
        try {
            const periodicWave = this.audioCtx.createPeriodicWave(realCoeffs, imagCoeffs, { disableNormalization: true });
            osc.setPeriodicWave(periodicWave);
        } catch (e) {
            console.warn("Falha ao criar PeriodicWave para 'pulse', usando 'square' como fallback (v74).", e);
            osc.type = 'square';
        }
        osc.frequency.setValueAtTime(freq, now);
        if (this.lfoGainPitch) this.lfoGainPitch.connect(osc.frequency);
    }
     else {
        osc = this.audioCtx.createOscillator();
        osc.type = this.waveform;
        osc.frequency.setValueAtTime(freq, now);
        if (this.lfoGainPitch) this.lfoGainPitch.connect(osc.frequency);
    }

    const velocityGain = Math.max(0, Math.min(1, (velocity / 127)));
    const peakGain = velocityGain;
    const sustainGain = peakGain * this.sustainLevel;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + this.attackTime);
    gainNode.gain.linearRampToValueAtTime(sustainGain, now + this.attackTime + this.decayTime);

    osc.connect(gainNode);
    gainNode.connect(this.distortionNode);

    osc.start(now);
    this.oscillators[midiNote] = { osc, gainNode, type: this.waveform };
  }

  noteOff(midiNote) {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
        console.warn("SimpleSynth.noteOff (v74): audioCtx não disponível ou fechado.");
        return;
    }

    if (this.oscillators[midiNote]) {
      const { osc, gainNode, type } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;

      if (gainNode && gainNode.numberOfOutputs > 0) {
          if (this.lfoGainPitch && osc && osc.frequency && type !== 'noise') {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { console.warn("LFO já desconectado do osc.frequency ou erro em noteOff (v74).", e); }
          }

          gainNode.gain.cancelScheduledValues(now);
          gainNode.gain.setValueAtTime(gainNode.gain.value, now);
          gainNode.gain.linearRampToValueAtTime(0, now + this.releaseTime);

          try { osc.stop(now + this.releaseTime + 0.01); }
          catch (e) { console.warn("Erro ao parar oscilador (pode já ter sido parado) em noteOff (v74):", e); }

          setTimeout(() => {
            if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
                if (gainNode && gainNode.numberOfOutputs > 0) {
                    try { gainNode.disconnect(); }
                    catch (e) { console.warn("Erro ao desconectar gainNode (pode já estar desconectado) em noteOff (v74).", e); }
                }
                delete this.oscillators[midiNote];
            }
          }, (this.releaseTime + 0.05) * 1000);
      } else {
          if (osc) { try { osc.stop(now); } catch(e) { /* ignora se já parado */ } }
          delete this.oscillators[midiNote];
      }
    }
  }

  allNotesOff() {
    console.log("SimpleSynth v74 All Notes Off (ADSR aware)");
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode, type } = this.oscillators[midiNote];
        if (gainNode && gainNode.numberOfOutputs > 0) {
            if (this.lfoGainPitch && osc && osc.frequency && type !== 'noise') {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { console.warn("LFO já desconectado em allNotesOff (v74).", e); }
            }
            gainNode.gain.cancelScheduledValues(now);
            const quickRelease = 0.05;
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);

            try { osc.stop(now + quickRelease + 0.01); }
            catch(e) { console.warn("Erro ao parar osc (allNotesOff v74)", e); }

            const currentOscRef = osc; const currentGainNodeRef = gainNode; const currentMidiNoteKey = midiNote;
            setTimeout(() => {
                if (this.oscillators[currentMidiNoteKey] && this.oscillators[currentMidiNoteKey].osc === currentOscRef) {
                    if (currentGainNodeRef && currentGainNodeRef.numberOfOutputs > 0) {
                        try { currentGainNodeRef.disconnect(); } catch (e) { /* ignora */ }
                    }
                    delete this.oscillators[currentMidiNoteKey];
                }
            }, (quickRelease + 0.05) * 1000);
        } else if (this.oscillators[midiNote]) {
            if(osc) { try { osc.stop(now); } catch(e) { /* ignora */ } }
            delete this.oscillators[midiNote];
        }
      }
    }
  }
}

console.log("synth74.js carregado e pronto para ser instanciado por main74.js.");
