// ==========================================================================
// SYNTHESIZER MODULE v51 - synth51.js
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

    // Filtro
    this.filterNode = this.audioCtx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000; // Valor inicial alto, efetivamente sem filtro
    this.filterNode.Q.value = 1; // Ressonância padrão

    this.distortionNode.connect(this.filterNode);

    // LFO - Configuração e conexão ao filtro
    this.lfo = this.audioCtx.createOscillator();
    this.lfo.type = 'sine'; // Forma de onda padrão do LFO
    this.lfo.frequency.value = 5; // Taxa padrão do LFO (5 Hz)
    this.lfoGainPitch = this.audioCtx.createGain(); // Ganho para controlar a profundidade da modulação do pitch
    this.lfoGainPitch.gain.value = 0; // Profundidade inicial da modulação do pitch (sem modulação)
    this.lfoGainFilter = this.audioCtx.createGain(); // Ganho para controlar a profundidade da modulação do filtro
    this.lfoGainFilter.gain.value = 0; // Profundidade inicial da modulação do filtro (sem modulação)

    this.lfo.connect(this.lfoGainPitch);
    this.lfo.connect(this.lfoGainFilter);

    // Conectar LFO ao parâmetro de frequência do filtro principal
    if (this.filterNode) {
        this.lfoGainFilter.connect(this.filterNode.frequency);
    }

    this.lfo.start();

    // Delay Nodes V51
    this.delayNode = this.audioCtx.createDelay(2.0); // Max delay de 2 segundos
    this.delayFeedbackGain = this.audioCtx.createGain();
    this.delayWetGain = this.audioCtx.createGain();
    this.delayDryGain = this.audioCtx.createGain();

    // Roteamento da cadeia de áudio principal:
    // Oscillator -> Gain (per-note) -> Distortion -> Filter
    // A saída do Filter é então dividida para o sistema de Delay Dry/Wet

    // Desconectar filterNode da conexão direta anterior ao masterGainNode se existir
    // (No código atual, filterNode conecta-se a masterGainNode na inicialização)
    // this.filterNode.disconnect(this.masterGainNode); // Esta linha pode ser necessária se a conexão direta ainda existir
    // No entanto, a refatoração é mais limpa:

    // Cadeia principal: distortion -> filter
    // A saída do filterNode será conectada ao sistema de delay abaixo.
    // A conexão this.filterNode.connect(this.masterGainNode) na linha 42 deve ser removida.

    // Roteamento do Delay:
    // source (filterNode) -> delayDryGain -> masterGainNode (sinal seco)
    // source (filterNode) -> delayNode -> delayFeedbackGain -> delayNode (loop de feedback)
    // delayNode -> delayWetGain -> masterGainNode (sinal molhado)

    this.filterNode.connect(this.delayDryGain);
    this.delayDryGain.connect(this.masterGainNode);

    this.filterNode.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode); // Feedback loop
    this.delayNode.connect(this.delayWetGain);
    this.delayWetGain.connect(this.masterGainNode);

    // Valores iniciais para o Delay
    this.delayNode.delayTime.value = 0.5; // 500ms
    this.delayFeedbackGain.gain.value = 0.3; // Feedback moderado
    this.setDelayMix(0); // Chamada agora que o método está definido

    // Reverb Nodes V51
    this.convolverNode = this.audioCtx.createConvolver();
    this.reverbWetGain = this.audioCtx.createGain();
    this.reverbDryGain = this.audioCtx.createGain(); // Para o sinal que bypassa o reverb

    // O masterGainNode agora será alimentado pelo reverbDryGain e reverbWetGain
    // Desconectar as entradas anteriores do masterGainNode (delayDryGain, delayWetGain)
    this.delayDryGain.disconnect(this.masterGainNode);
    this.delayWetGain.disconnect(this.masterGainNode);

    // A saída combinada do sistema de delay (que antes ia para masterGain) agora alimenta o sistema de Reverb
    // Conectando delayDryGain e delayWetGain ao reverbDryGain (para o sinal seco do reverb)
    // e também ao convolverNode (para o sinal que será processado pelo reverb)

    // Sinal Dry do Delay para o Dry do Reverb
    this.delayDryGain.connect(this.reverbDryGain);
    // Sinal Wet do Delay para o Dry do Reverb (eles são somados antes de talvez passar pelo reverb)
    this.delayWetGain.connect(this.reverbDryGain);

    // Sinal Dry do Delay para o Convolver
    this.delayDryGain.connect(this.convolverNode);
    // Sinal Wet do Delay para o Convolver
    this.delayWetGain.connect(this.convolverNode);

    this.reverbDryGain.connect(this.masterGainNode);
    this.convolverNode.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.masterGainNode);

    this._generateSimpleImpulseResponse().then(buffer => {
      if (this.convolverNode) this.convolverNode.buffer = buffer;
    }).catch(e => console.error("Erro ao gerar IR simples:", e));

    // this.setReverbMix(0); // Chamado após a definição dos métodos
    this.setDelayMix(0);     // Chamado após a definição dos métodos
    this.setReverbMix(0);    // Chamado após a definição dos métodos

    console.log("SimpleSynth v51 inicializado com AudioContext, ADSR, DistortionNode, FilterNode, LFO, Delay e Reverb."); // v51 Update
  }

  // Método para o Reverb Mix
  setReverbMix(mix) { // mix de 0 (totalmente seco) a 1 (totalmente molhado)
    if (this.reverbDryGain && this.reverbWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      this.reverbDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.reverbWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
      console.log(`Synth Reverb Mix set to: ${clampedMix}`);
    }
  }

  async _generateSimpleImpulseResponse() {
    // Um IR muito curto e simples para teste (ruído branco curto com decay)
    // Em uma aplicação real, você carregaria um arquivo de IR.
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * 0.1; // 0.1 segundos de IR
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      left[i] = (Math.random() * 2 - 1) * (n / length) * 0.2; // Decay linear
      right[i] = (Math.random() * 2 - 1) * (n / length) * 0.2; // Decay linear
    }
    return impulse;
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

  setFilterCutoff(frequency) {
    if (this.filterNode) {
      const clampedFrequency = Math.max(20, Math.min(20000, parseFloat(frequency)));
      this.filterNode.frequency.setValueAtTime(clampedFrequency, this.audioCtx.currentTime);
      console.log(`Synth Filter Cutoff set to: ${clampedFrequency} Hz`);
    }
  }

  setFilterResonance(qValue) {
    if (this.filterNode) {
      const clampedQ = Math.max(0.0001, Math.min(1000, parseFloat(qValue))); // Valores típicos de Q, mas o BiquadFilter aceita uma faixa ampla.
      this.filterNode.Q.setValueAtTime(clampedQ, this.audioCtx.currentTime);
      console.log(`Synth Filter Resonance (Q) set to: ${clampedQ}`);
    }
  }

  // Métodos LFO
  setLfoWaveform(waveform) {
    const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    if (this.lfo && validWaveforms.includes(waveform)) {
      this.lfo.type = waveform;
      console.log(`Synth LFO Waveform set to: ${waveform}`);
    }
  }

  setLfoRate(rate) {
    if (this.lfo) {
      const clampedRate = Math.max(0.01, Math.min(100, parseFloat(rate))); // Hz
      this.lfo.frequency.setValueAtTime(clampedRate, this.audioCtx.currentTime);
      console.log(`Synth LFO Rate set to: ${clampedRate} Hz`);
    }
  }

  setLfoPitchDepth(depth) {
    if (this.lfoGainPitch) {
      // A profundidade aqui pode ser em cents ou Hz, dependendo de como queremos interpretar.
      // Para pitch, uma modulação em Hz é mais direta com AudioParam.
      // Ex: depth de 1 = +/- 1 Hz. Para cents, a escala é logarítmica.
      // Vamos usar Hz por simplicidade, e um valor pequeno (ex: 0 a 50 Hz de variação).
      const clampedDepth = Math.max(0, Math.min(100, parseFloat(depth))); // Profundidade em Hz
      this.lfoGainPitch.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
      console.log(`Synth LFO Pitch Depth set to: ${clampedDepth} (Hz deviation)`);
    }
  }

  setLfoFilterDepth(depth) {
    if (this.lfoGainFilter) {
      // A profundidade da modulação do filtro também será em Hz.
      // Ex: depth de 1000 = +/- 1000 Hz na frequência de corte do filtro.
      const clampedDepth = Math.max(0, Math.min(10000, parseFloat(depth))); // Profundidade em Hz
      this.lfoGainFilter.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
      console.log(`Synth LFO Filter Depth set to: ${clampedDepth} (Hz deviation)`);
    }
  }
  // Fim Métodos LFO

  // Métodos Delay V51
  setDelayTime(time) {
    if (this.delayNode) {
      const clampedTime = Math.max(0.001, Math.min(2.0, parseFloat(time))); // Max 2s definido no construtor
      this.delayNode.delayTime.setValueAtTime(clampedTime, this.audioCtx.currentTime);
      console.log(`Synth Delay Time set to: ${clampedTime}s`);
    }
  }

  setDelayFeedback(feedback) {
    if (this.delayFeedbackGain) {
      const clampedFeedback = Math.max(0, Math.min(0.95, parseFloat(feedback))); // Evitar feedback > 1 para prevenir auto-oscilação muito alta
      this.delayFeedbackGain.gain.setValueAtTime(clampedFeedback, this.audioCtx.currentTime);
      console.log(`Synth Delay Feedback set to: ${clampedFeedback}`);
    }
  }

  setDelayMix(mix) { // mix de 0 (totalmente seco) a 1 (totalmente molhado)
    if (this.delayDryGain && this.delayWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      // Equal power crossfade (aproximação)
      this.delayDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.delayWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
      console.log(`Synth Delay Mix set to: ${clampedMix}`);
    }
  }
  // Fim Métodos Delay V51

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
        console.log("AudioContext resumed by noteOn in synth51.js"); // v51 Update
        this._playNote(midiNote, velocity);
      }).catch(e => console.error("Error resuming AudioContext in synth51.js:", e)); // v51 Update
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

    // Conectar LFO ao pitch do oscilador da nota
    if (this.lfoGainPitch) {
      this.lfoGainPitch.connect(osc.frequency);
    }

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

      // Desconectar LFO do pitch do oscilador da nota
      if (this.lfoGainPitch) {
        try {
          this.lfoGainPitch.disconnect(osc.frequency);
        } catch (e) {
          // Ignorar erros se já estiver desconectado ou o AudioParam não for mais válido
          // console.warn("LFO pitch disconnect error (ignorable):", e);
        }
      }

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
    console.log("Synth v51 All Notes Off (ADSR aware)"); // v51 Update
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode } = this.oscillators[midiNote];

        // Desconectar LFO do pitch do oscilador da nota
        if (this.lfoGainPitch) {
          try {
            this.lfoGainPitch.disconnect(osc.frequency);
          } catch (e) {
            // console.warn("LFO pitch disconnect error during allNotesOff (ignorable):", e);
          }
        }

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
        console.log("AudioContext (v51) está suspenso. Requer interação do usuário para iniciar."); // v51 Update
      }
      simpleSynth = new SimpleSynth(audioCtx);
      console.log("AudioContext e SimpleSynth (v51) inicializados."); // v51 Update
      return true;
    } catch (e) {
      console.error("Web Audio API não é suportada neste navegador (v51).", e); // v51 Update
      return false;
    }
  }
  return true;
}

function initAudioContextOnGesture() {
  if (!audioCtx) {
    if (!initAudioContext()) {
        console.error("Falha ao inicializar AudioContext no gesto (v51)."); // v51 Update
        return false;
    }
  }

  let resumed = false;
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('AudioContext (v51) resumido com sucesso por gesto do usuário!'); // v51 Update
      if (!simpleSynth) {
          simpleSynth = new SimpleSynth(audioCtx);
          console.log("SimpleSynth (v51) instanciado após resumo do AudioContext."); // v51 Update
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
        console.error('Erro ao resumir AudioContext (v51):', e); // v51 Update
        resumed = false;
    });
  } else if (audioCtx && audioCtx.state === 'running') {
    console.log('AudioContext (v51) já está rodando.'); // v51 Update
    resumed = true;
  } else {
    console.warn('AudioContext (v51) não está suspenso, mas também não está rodando, ou não foi inicializado.'); // v51 Update
    resumed = false;
  }
  return resumed;
}

function setInternalAudioEnabledState(enabled) {
    _internalAudioEnabledMaster = !!enabled;
    if (!_internalAudioEnabledMaster && simpleSynth) {
        simpleSynth.allNotesOff();
    }
    console.log(`Synth v51 _internalAudioEnabledMaster state set to: ${_internalAudioEnabledMaster}`); // v51 Update
}

function getSimpleSynthInstance() {
    if (!audioCtx) initAudioContext();
    return simpleSynth;
}

function getAudioContext() {
    if (!audioCtx) initAudioContext();
    return audioCtx;
}

console.log("synth51.js carregado."); // v51 Update
