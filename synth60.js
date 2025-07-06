// ==========================================================================
// SYNTHESIZER MODULE v60 - synth60.js
// ==========================================================================

// audioCtx e simpleSynth são agora gerenciados em main60.js
// _internalAudioEnabledMaster também é gerenciado em main60.js

const VALID_WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle', 'custom'];

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

    console.log("SimpleSynth v60 inicializado.");
  }

  // V60: Mixagem de efeitos por nota (exemplo para Reverb)
  // Para implementar totalmente, seria necessário um nó de convolver por nota ou uma abordagem mais complexa.
  // Esta é uma simplificação, aplicando ao master, mas a estrutura está aqui.
  // A verdadeira mixagem por nota exigiria que cada 'oscillator' tivesse sua própria cadeia de efeitos.
  setReverbMix(mix, forNote = null) {
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

  setAttack(time) { this.attackTime = Math.max(0.001, time); logDebug(`Synth Attack: ${time}s`); }
  setDecay(time) { this.decayTime = Math.max(0.001, time); logDebug(`Synth Decay: ${time}s`); }
  setSustain(level) { this.sustainLevel = Math.max(0, Math.min(1, level)); logDebug(`Synth Sustain: ${level}`); }
  setRelease(time) { this.releaseTime = Math.max(0.001, time); logDebug(`Synth Release: ${time}s`); }

  setWaveform(newWaveform) {
    if (VALID_WAVEFORMS.includes(newWaveform)) {
        this.waveform = newWaveform;
        logDebug(`Synth waveform set to: ${this.waveform}`);
    } else {
        console.warn(`Invalid waveform: ${newWaveform}. Not changed.`);
        // displayGlobalError(`Forma de onda inválida: ${newWaveform}`, 5000); // Opcional: feedback ao usuário
    }
  }

  setMasterVolume(volume) {
    if (volume >= 0 && volume <= 1) this.masterGainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
    // else console.warn(`Invalid volume: ${volume}`);
    // console.log(`Synth master volume: ${volume}`);
  }

  noteOn(midiNote, velocity = 127) {
    // if (!_internalAudioEnabledMaster || !this.audioCtx || this.audioCtx.state === 'closed') return; // Removido, main60.js controla
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
        console.warn("SimpleSynth.noteOn: audioCtx não disponível ou fechado.");
        return;
    }

    if (this.audioCtx.state === 'suspended') {
      // O resume agora é tratado em main60.js ao clicar no botão de áudio.
      // Se chegou aqui e está suspenso, é um estado inesperado pós-inicialização.
      console.warn("SimpleSynth.noteOn: AudioContext ainda suspenso. O som pode não tocar.");
      // Tentar resumir aqui pode ser redundante ou causar problemas se main60.js já o fez.
      // this.audioCtx.resume().then(() => this._playNote(midiNote, velocity));
      // Por ora, apenas loga e tenta tocar. Se o contexto não resumir, não haverá som.
    }
    this._playNote(midiNote, velocity);
  }

  _playNote(midiNote, velocity) {
    const freq = midiToFrequency(midiNote);
    if (freq <= 0) {
        console.warn(`Frequência inválida (${freq}Hz) para MIDI note ${midiNote}. Nota não será tocada.`);
        return;
    }

    if (this.oscillators[midiNote]) {
        const oldOscData = this.oscillators[midiNote];
        try {
            if (oldOscData.osc) {
                 oldOscData.osc.stop(this.audioCtx.currentTime);
            }
            if (oldOscData.gainNode && oldOscData.gainNode.numberOfOutputs > 0) {
                 oldOscData.gainNode.disconnect();
            }
            if (this.lfoGainPitch && oldOscData.osc && oldOscData.osc.frequency) {
                 this.lfoGainPitch.disconnect(oldOscData.osc.frequency);
            }
        } catch (e) {
            console.warn("Erro ao limpar oscilador/gain anterior em _playNote:", e);
        }
        delete this.oscillators[midiNote];
    }

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();
    osc.type = this.waveform; // Waveform é global para o synth, pode ser setada dinamicamente
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

    const velocityGain = Math.max(0, Math.min(1, (velocity / 127))); // Garante que velocityGain está entre 0 e 1
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
    // if (!_internalAudioEnabledMaster || !this.audioCtx || this.audioCtx.state === 'closed') return; // Removido
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
        console.warn("SimpleSynth.noteOff: audioCtx não disponível ou fechado.");
        return;
    }

    if (this.oscillators[midiNote]) {
      const { osc, gainNode } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;

      if (gainNode && gainNode.numberOfOutputs > 0) {
          if (this.lfoGainPitch && osc && osc.frequency) {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { console.warn("LFO já desconectado do osc.frequency ou erro em noteOff.", e); }
          }

          gainNode.gain.cancelScheduledValues(now);
          gainNode.gain.setValueAtTime(gainNode.gain.value, now);
          gainNode.gain.linearRampToValueAtTime(0, now + this.releaseTime);

          try {
            osc.stop(now + this.releaseTime + 0.01);
          } catch (e) {
            console.warn("Erro ao parar oscilador (pode já ter sido parado) em noteOff:", e);
          }

          setTimeout(() => {
            if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
                if (gainNode && gainNode.numberOfOutputs > 0) {
                    try { gainNode.disconnect(); }
                    catch (e) { console.warn("Erro ao desconectar gainNode (pode já estar desconectado) em noteOff.", e); }
                }
                delete this.oscillators[midiNote];
            }
          }, (this.releaseTime + 0.05) * 1000);
      } else {
          if (osc) {
            try { osc.stop(now); } catch(e) { /* ignora */ }
          }
          delete this.oscillators[midiNote];
      }
    }
  }

  allNotesOff() {
    console.log("SimpleSynth v60 All Notes Off (ADSR aware)"); // Log atualizado
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode } = this.oscillators[midiNote];
        if (gainNode && gainNode.numberOfOutputs > 0) {
            if (this.lfoGainPitch && osc && osc.frequency) {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { console.warn("LFO já desconectado em allNotesOff.", e); }
            }
            gainNode.gain.cancelScheduledValues(now);
            const quickRelease = 0.05;
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);
            try {
                osc.stop(now + quickRelease + 0.01);
            } catch(e) { console.warn("Erro ao parar osc (allNotesOff)", e); }

            const currentOscRef = osc;
            const currentGainNodeRef = gainNode;
            const currentMidiNoteKey = midiNote;

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

// Funções _ensureAudioContext, initAudioContextOnGesture, setInternalAudioEnabledState,
// getSimpleSynthInstance, e getAudioContext foram REMOVIDAS.
// O gerenciamento de audioCtx e simpleSynth agora é centralizado em main60.js.

console.log("synth60.js carregado e pronto para ser instanciado por main60.js."); // Log atualizado
