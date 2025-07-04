// ==========================================================================
// SYNTHESIZER MODULE v49 - synth49.js
// ==========================================================================

let audioCtx = null;
let simpleSynth = null;
let _internalAudioEnabledMaster = true;

function midiToFrequency(midiNote) {
  if (midiNote < 0 || midiNote > 127) return 0;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

class SimpleSynth {
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

    this.distortionNode.connect(this.masterGainNode);

    console.log("SimpleSynth v49 inicializado com AudioContext, ADSR padrão e DistortionNode."); // v49 Update
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
    gainNode.connect(this.distortionNode);
    osc.start(now);

    this.oscillators[midiNote] = { osc, gainNode };
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
        const { osc, gainNode } = this.oscillators[midiNote];
        gainNode.gain.cancelScheduledValues(now);
        const quickRelease = 0.05;
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);
        osc.stop(now + quickRelease + 0.01);

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
}

function initAudioContext() {
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

function initAudioContextOnGesture() {
  if (!audioCtx) {
    if (!initAudioContext()) {
        console.error("Falha ao inicializar AudioContext no gesto (v49)."); // v49 Update
        return false;
    }
  }

  let resumed = false;
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('AudioContext (v49) resumido com sucesso por gesto do usuário!'); // v49 Update
      if (!simpleSynth) {
          simpleSynth = new SimpleSynth(audioCtx);
          console.log("SimpleSynth (v49) instanciado após resumo do AudioContext."); // v49 Update
      }
      const mainApp = window;
      if (mainApp.audioMasterVolumeSlider && mainApp.simpleSynth) { // Check if mainApp.simpleSynth exists
          const currentVolume = parseFloat(mainApp.audioMasterVolumeSlider.value);
          if (mainApp.simpleSynth.setMasterVolume) mainApp.simpleSynth.setMasterVolume(currentVolume);
      }
      if (mainApp.audioWaveformSelect && mainApp.simpleSynth) { // Check if mainApp.simpleSynth exists
          const currentWaveform = mainApp.audioWaveformSelect.value;
          if (mainApp.simpleSynth.setWaveform) mainApp.simpleSynth.setWaveform(currentWaveform);
      }
      resumed = true;
    }).catch(e => {
        console.error('Erro ao resumir AudioContext (v49):', e); // v49 Update
        resumed = false;
    });
  } else if (audioCtx && audioCtx.state === 'running') {
    console.log('AudioContext (v49) já está rodando.'); // v49 Update
    resumed = true;
  } else {
    console.warn('AudioContext (v49) não está suspenso, mas também não está rodando, ou não foi inicializado.'); // v49 Update
    resumed = false;
  }
  return resumed;
}

function setInternalAudioEnabledState(enabled) {
    _internalAudioEnabledMaster = !!enabled;
    if (!_internalAudioEnabledMaster && simpleSynth) {
        simpleSynth.allNotesOff();
    }
    console.log(`Synth v49 _internalAudioEnabledMaster state set to: ${_internalAudioEnabledMaster}`); // v49 Update
}

function getSimpleSynthInstance() {
    if (!audioCtx) initAudioContext();
    return simpleSynth;
}

function getAudioContext() {
    if (!audioCtx) initAudioContext();
    return audioCtx;
}

console.log("synth49.js carregado."); // v49 Update
