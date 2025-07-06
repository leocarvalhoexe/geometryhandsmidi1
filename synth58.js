// ==========================================================================
// SYNTHESIZER MODULE v55 - synth55.js
// ==========================================================================

let audioCtx = null;
let simpleSynth = null;
let _internalAudioEnabledMaster = true; // Controla se o synth deve tocar som

function midiToFrequency(midiNote) {
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

    // Parâmetros ADSR
    this.attackTime = 0.01;
    this.decayTime = 0.1;
    this.sustainLevel = 0.7;
    this.releaseTime = 0.2;

    // Efeito de Distorção
    this.distortionNode = this.audioCtx.createWaveShaper();
    this.distortionNode.oversample = '4x';
    this.distortionAmount = 0; // Quantidade de distorção (0-100)
    this._updateDistortionCurve();

    // Filtro Low-Pass
    this.filterNode = this.audioCtx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000; // Sem filtro por padrão
    this.filterNode.Q.value = 1; // Ressonância padrão

    this.distortionNode.connect(this.filterNode); // Saída da distorção vai para o filtro

    // LFO (Low-Frequency Oscillator)
    this.lfo = this.audioCtx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 5; // 5 Hz
    this.lfoGainPitch = this.audioCtx.createGain(); // Para modular o pitch
    this.lfoGainPitch.gain.value = 0; // Sem modulação de pitch por padrão
    this.lfoGainFilter = this.audioCtx.createGain(); // Para modular a frequência do filtro
    this.lfoGainFilter.gain.value = 0; // Sem modulação de filtro por padrão

    this.lfo.connect(this.lfoGainPitch);
    this.lfo.connect(this.lfoGainFilter);
    if (this.filterNode) {
        this.lfoGainFilter.connect(this.filterNode.frequency); // LFO modula a frequência do filtro
    }
    this.lfo.start();

    // Efeito de Delay
    this.delayNode = this.audioCtx.createDelay(2.0); // Máximo de 2s de delay
    this.delayFeedbackGain = this.audioCtx.createGain();
    this.delayWetGain = this.audioCtx.createGain(); // Sinal com delay
    this.delayDryGain = this.audioCtx.createGain(); // Sinal original

    // Roteamento do Delay
    this.filterNode.connect(this.delayDryGain); // Sinal do filtro para o dry do delay
    this.delayDryGain.connect(this.masterGainNode); // Dry do delay para o master

    this.filterNode.connect(this.delayNode); // Sinal do filtro para o processamento de delay
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode); // Loop de feedback
    this.delayNode.connect(this.delayWetGain);
    this.delayWetGain.connect(this.masterGainNode); // Wet do delay para o master

    this.delayNode.delayTime.value = 0.5;
    this.delayFeedbackGain.gain.value = 0.3;
    this.setDelayMix(0); // Sem delay por padrão

    // Efeito de Reverb (Convolver)
    this.convolverNode = this.audioCtx.createConvolver();
    this.reverbWetGain = this.audioCtx.createGain(); // Sinal com reverb
    this.reverbDryGain = this.audioCtx.createGain(); // Sinal original para o reverb

    // Desconectar saídas do delay do master e conectar ao sistema de reverb
    this.delayDryGain.disconnect(this.masterGainNode);
    this.delayWetGain.disconnect(this.masterGainNode);

    // Saída combinada do delay alimenta o reverb
    this.delayDryGain.connect(this.reverbDryGain); // Dry do delay para o dry do reverb
    this.delayWetGain.connect(this.reverbDryGain); // Wet do delay para o dry do reverb (somados)

    this.delayDryGain.connect(this.convolverNode); // Dry do delay para o convolver
    this.delayWetGain.connect(this.convolverNode); // Wet do delay para o convolver

    this.reverbDryGain.connect(this.masterGainNode); // Dry do reverb para o master
    this.convolverNode.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.masterGainNode); // Wet do reverb para o master

    this._generateSimpleImpulseResponse().then(buffer => {
      if (this.convolverNode) this.convolverNode.buffer = buffer;
    }).catch(e => console.error("Erro ao gerar IR para reverb:", e));

    this.setReverbMix(0); // Sem reverb por padrão

    // console.log("SimpleSynth v55 inicializado."); // Reduzido
  }

  setReverbMix(mix) {
    if (this.reverbDryGain && this.reverbWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      this.reverbDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.reverbWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
      // console.log(`Synth Reverb Mix set to: ${clampedMix}`);
    }
  }

  async _generateSimpleImpulseResponse() {
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * 0.1; // IR curto
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

  setDistortion(amount) {
    this.distortionAmount = Math.max(0, Math.min(100, parseFloat(amount) || 0));
    this._updateDistortionCurve();
    // console.log(`Synth Distortion Amount set to: ${this.distortionAmount}`);
  }

  setFilterCutoff(frequency) {
    if (this.filterNode) {
      const clampedFrequency = Math.max(20, Math.min(20000, parseFloat(frequency)));
      this.filterNode.frequency.setValueAtTime(clampedFrequency, this.audioCtx.currentTime);
      // console.log(`Synth Filter Cutoff set to: ${clampedFrequency} Hz`);
    }
  }

  setFilterResonance(qValue) {
    if (this.filterNode) {
      const clampedQ = Math.max(0.0001, Math.min(1000, parseFloat(qValue)));
      this.filterNode.Q.setValueAtTime(clampedQ, this.audioCtx.currentTime);
      // console.log(`Synth Filter Resonance (Q) set to: ${clampedQ}`);
    }
  }

  setLfoWaveform(waveform) {
    const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    if (this.lfo && validWaveforms.includes(waveform)) {
      this.lfo.type = waveform;
      // console.log(`Synth LFO Waveform set to: ${waveform}`);
    }
  }

  setLfoRate(rate) {
    if (this.lfo) {
      const clampedRate = Math.max(0.01, Math.min(100, parseFloat(rate)));
      this.lfo.frequency.setValueAtTime(clampedRate, this.audioCtx.currentTime);
      // console.log(`Synth LFO Rate set to: ${clampedRate} Hz`);
    }
  }

  setLfoPitchDepth(depth) {
    if (this.lfoGainPitch) {
      const clampedDepth = Math.max(0, Math.min(100, parseFloat(depth)));
      this.lfoGainPitch.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
      // console.log(`Synth LFO Pitch Depth set to: ${clampedDepth} (Hz deviation)`);
    }
  }

  setLfoFilterDepth(depth) {
    if (this.lfoGainFilter) {
      const clampedDepth = Math.max(0, Math.min(10000, parseFloat(depth)));
      this.lfoGainFilter.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
      // console.log(`Synth LFO Filter Depth set to: ${clampedDepth} (Hz deviation)`);
    }
  }

  setDelayTime(time) {
    if (this.delayNode) {
      const clampedTime = Math.max(0.001, Math.min(2.0, parseFloat(time)));
      this.delayNode.delayTime.setValueAtTime(clampedTime, this.audioCtx.currentTime);
      // console.log(`Synth Delay Time set to: ${clampedTime}s`);
    }
  }

  setDelayFeedback(feedback) {
    if (this.delayFeedbackGain) {
      const clampedFeedback = Math.max(0, Math.min(0.95, parseFloat(feedback)));
      this.delayFeedbackGain.gain.setValueAtTime(clampedFeedback, this.audioCtx.currentTime);
      // console.log(`Synth Delay Feedback set to: ${clampedFeedback}`);
    }
  }

  setDelayMix(mix) {
    if (this.delayDryGain && this.delayWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      this.delayDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.delayWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
      // console.log(`Synth Delay Mix set to: ${clampedMix}`);
    }
  }

  setAttack(time) { this.attackTime = Math.max(0.001, time); /* console.log(`Synth Attack: ${time}s`); */ }
  setDecay(time) { this.decayTime = Math.max(0.001, time); /* console.log(`Synth Decay: ${time}s`); */ }
  setSustain(level) { this.sustainLevel = Math.max(0, Math.min(1, level)); /* console.log(`Synth Sustain: ${level}`); */ }
  setRelease(time) { this.releaseTime = Math.max(0.001, time); /* console.log(`Synth Release: ${time}s`); */ }

  setWaveform(newWaveform) {
    const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    if (validWaveforms.includes(newWaveform)) this.waveform = newWaveform;
    // else console.warn(`Invalid waveform: ${newWaveform}`);
    // console.log(`Synth waveform: ${this.waveform}`);
  }

  setMasterVolume(volume) {
    if (volume >= 0 && volume <= 1) this.masterGainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
    // else console.warn(`Invalid volume: ${volume}`);
    // console.log(`Synth master volume: ${volume}`);
  }

  noteOn(midiNote, velocity = 127) {
    if (!_internalAudioEnabledMaster || !this.audioCtx || this.audioCtx.state === 'closed') return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(() => {
        // console.log("AudioContext resumed by noteOn in synth55.js");
        this._playNote(midiNote, velocity);
      }).catch(e => console.error("Error resuming AudioContext in synth55.js:", e));
      return;
    }
    this._playNote(midiNote, velocity);
  }

  _playNote(midiNote, velocity) {
    const freq = midiToFrequency(midiNote);
    if (freq === 0) return;

    if (this.oscillators[midiNote]) { // Stop existing note if retriggered
      this.oscillators[midiNote].osc.stop(this.audioCtx.currentTime);
      this.oscillators[midiNote].gainNode.disconnect();
      if (this.lfoGainPitch) this.lfoGainPitch.disconnect(this.oscillators[midiNote].osc.frequency);
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
    gainNode.gain.setValueAtTime(0, now); // Start from 0
    gainNode.gain.linearRampToValueAtTime(peakGain, now + this.attackTime);
    gainNode.gain.linearRampToValueAtTime(sustainGain, now + this.attackTime + this.decayTime);

    if (this.lfoGainPitch) this.lfoGainPitch.connect(osc.frequency); // LFO modula pitch

    osc.connect(gainNode);
    gainNode.connect(this.distortionNode); // Conecta ao início da cadeia de efeitos
    osc.start(now);
    this.oscillators[midiNote] = { osc, gainNode };
  }

  noteOff(midiNote) {
     if (!_internalAudioEnabledMaster || !this.audioCtx || this.audioCtx.state === 'closed') return;

    if (this.oscillators[midiNote]) {
      const { osc, gainNode } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;

      if (this.lfoGainPitch) {
        try { this.lfoGainPitch.disconnect(osc.frequency); }
        catch (e) { /* Ignorar se já desconectado */ }
      }

      gainNode.gain.cancelScheduledValues(now);
      // Use setValueAtTime para garantir que a rampa comece do valor atual, evitando cliques.
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + this.releaseTime);
      osc.stop(now + this.releaseTime + 0.01); // Adiciona um pequeno buffer

      // Limpeza após a nota parar completamente
      setTimeout(() => {
        if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
          gainNode.disconnect();
          delete this.oscillators[midiNote];
        }
      }, (this.releaseTime + 0.05) * 1000);
    }
  }

  allNotesOff() {
    // console.log("Synth v55 All Notes Off (ADSR aware)");
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode } = this.oscillators[midiNote];
        if (this.lfoGainPitch) {
          try { this.lfoGainPitch.disconnect(osc.frequency); }
          catch (e) { /* Ignorar */ }
        }
        gainNode.gain.cancelScheduledValues(now);
        const quickRelease = 0.05; // Liberação rápida para allNotesOff
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);
        osc.stop(now + quickRelease + 0.01);

        const currentOsc = osc; const currentGainNode = gainNode; const currentMidiNote = midiNote;
        setTimeout(() => {
            if (this.oscillators[currentMidiNote] && this.oscillators[currentMidiNote].osc === currentOsc) {
                currentGainNode.disconnect(); delete this.oscillators[currentMidiNote];
            }
        }, (quickRelease + 0.05) * 1000);
      }
    }
  }
}

// Função para inicializar o AudioContext (não cria SimpleSynth automaticamente)
function _ensureAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        console.log("AudioContext (v55) está suspenso. Requer interação do usuário para iniciar.");
      } else if (audioCtx.state === 'running') {
        console.log("AudioContext (v55) já está rodando.");
      }
    } catch (e) {
      console.error("Web Audio API não é suportada neste navegador (v55).", e);
      audioCtx = null; // Garante que audioCtx seja nulo em caso de falha
    }
  }
  return audioCtx;
}

// Chamado por uma interação do usuário para criar/resumir AudioContext e instanciar SimpleSynth
function initAudioContextOnGesture() {
  if (!_ensureAudioContext()) {
    console.error("Falha ao garantir AudioContext no gesto (v55).");
    return false;
  }

  let contextResumedOrRunning = false;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('AudioContext (v55) resumido com sucesso por gesto do usuário!');
      contextResumedOrRunning = true;
      if (!simpleSynth) { // Só cria se não existir
          simpleSynth = new SimpleSynth(audioCtx);
          console.log("SimpleSynth (v55) instanciado após resumo do AudioContext.");
      }
      // A configuração do synth (volumes, waveforms) deve ser feita em mainXX.js após esta chamada
    }).catch(e => {
        console.error('Erro ao resumir AudioContext (v55):', e);
    });
  } else if (audioCtx.state === 'running') {
    // console.log('AudioContext (v55) já está rodando.');
    contextResumedOrRunning = true;
    if (!simpleSynth) { // Só cria se não existir
        simpleSynth = new SimpleSynth(audioCtx);
        console.log("SimpleSynth (v55) instanciado (AudioContext já rodava).");
    }
  }
  return contextResumedOrRunning; // Retorna síncrono, mas a instanciação/resumo pode ser assíncrona
}

function setInternalAudioEnabledState(enabled) {
    _internalAudioEnabledMaster = !!enabled;
    if (!_internalAudioEnabledMaster && simpleSynth) {
        simpleSynth.allNotesOff(); // Silencia o synth se desabilitado
    }
    // console.log(`Synth v55 _internalAudioEnabledMaster state set to: ${_internalAudioEnabledMaster}`);
}

// Retorna a instância do SimpleSynth, inicializando-a se necessário (e se AudioContext existir)
function getSimpleSynthInstance() {
    if (!simpleSynth && _ensureAudioContext()) {
        // Esta chamada direta a `new SimpleSynth` aqui pode ser problemática
        // se o AudioContext ainda estiver suspenso.
        // É melhor que `initAudioContextOnGesture` seja o único ponto de criação.
        // No entanto, para compatibilidade com chamadas existentes, pode ser mantido,
        // mas idealmente `initAudioContextOnGesture` deve ser chamado primeiro.
        if (audioCtx.state === 'running') {
            simpleSynth = new SimpleSynth(audioCtx);
            console.log("SimpleSynth (v55) instanciado via getSimpleSynthInstance (AudioContext já rodava).");
        } else {
            console.warn("getSimpleSynthInstance: AudioContext suspenso. SimpleSynth não será criado aqui. Chame initAudioContextOnGesture primeiro.");
        }
    }
    return simpleSynth;
}

// Retorna o AudioContext, inicializando-o se necessário
function getAudioContext() {
    return _ensureAudioContext();
}

// console.log("synth55.js carregado."); // Reduzido
