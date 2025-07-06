// ==========================================================================
// SYNTHESIZER MODULE v59 - synth59.js
// ==========================================================================

let audioCtx = null;
let simpleSynth = null;
let _internalAudioEnabledMaster = true; // Controla se o synth deve tocar som
const VALID_WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle', 'custom']; // Adicionado 'custom' para possível expansão futura

function midiToFrequency(midiNote) {
  if (midiNote < 0 || midiNote > 127) return 0; // Retorna 0 para notas inválidas, o que pode ser tratado em _playNote
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

    console.log("SimpleSynth v59 inicializado.");
  }

  // V59: Mixagem de efeitos por nota (exemplo para Reverb)
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
    if (!_internalAudioEnabledMaster || !this.audioCtx || this.audioCtx.state === 'closed') return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(() => {
        logDebug("AudioContext resumed by noteOn in synth59.js");
        this._playNote(midiNote, velocity);
      }).catch(e => {
          console.error("Error resuming AudioContext in synth59.js:", e);
          // displayGlobalError("Erro ao resumir áudio. Tente interagir novamente.", 5000); // V59
      });
      return;
    }
    this._playNote(midiNote, velocity);
  }

  _playNote(midiNote, velocity) {
    const freq = midiToFrequency(midiNote);
    if (freq <= 0) { // V59: Verifica se a frequência é válida (maior que 0)
        console.warn(`Frequência inválida (${freq}Hz) para MIDI note ${midiNote}. Nota não será tocada.`);
        return;
    }

    // V59: Checagem de existência e estado antes de parar/desconectar oscilador antigo
    if (this.oscillators[midiNote]) {
        const oldOscData = this.oscillators[midiNote];
        try {
            if (oldOscData.osc) {
                 oldOscData.osc.stop(this.audioCtx.currentTime); // Tenta parar
            }
            if (oldOscData.gainNode && oldOscData.gainNode.numberOfOutputs > 0) { // Checa se gainNode existe e está conectado
                 oldOscData.gainNode.disconnect();
            }
            if (this.lfoGainPitch && oldOscData.osc && oldOscData.osc.frequency) { // Checa se lfoGainPitch e osc.frequency existem
                // Tentar desconectar apenas se lfoGainPitch estava conectado a este oscilador específico
                // Isso é mais complexo de rastrear sem uma referência direta.
                // Por segurança, desconexão geral, mas pode ser otimizado.
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
     if (!_internalAudioEnabledMaster || !this.audioCtx || this.audioCtx.state === 'closed') return;

    if (this.oscillators[midiNote]) {
      const { osc, gainNode } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;

      // V59: Checar se gainNode ainda está "ativo" (conectado) antes de tentar desconectar ou manipular.
      // A checagem de `numberOfOutputs > 0` é uma forma de verificar se está conectado.
      if (gainNode && gainNode.numberOfOutputs > 0) {
          if (this.lfoGainPitch && osc && osc.frequency) {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { logDebug("LFO já desconectado do osc.frequency ou erro.", e); }
          }

          gainNode.gain.cancelScheduledValues(now);
          gainNode.gain.setValueAtTime(gainNode.gain.value, now); // Garante que a rampa comece do valor atual
          gainNode.gain.linearRampToValueAtTime(0, now + this.releaseTime);

          // V59: Limpeza mais robusta do oscilador e gainNode
          // O oscilador é parado após o tempo de release.
          // O gainNode é desconectado um pouco depois para evitar cliques ou erros se já desconectado.
          try {
            osc.stop(now + this.releaseTime + 0.01); // Adiciona um pequeno buffer
          } catch (e) {
            logDebug("Erro ao parar oscilador (pode já ter sido parado):", e);
          }

          setTimeout(() => {
            // Verificar novamente se o oscilador ainda é o mesmo e se o gainNode existe
            if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
                if (gainNode && gainNode.numberOfOutputs > 0) {
                    try { gainNode.disconnect(); }
                    catch (e) { logDebug("Erro ao desconectar gainNode (pode já estar desconectado):", e); }
                }
                delete this.oscillators[midiNote]; // Remove da lista de osciladores ativos
            }
          }, (this.releaseTime + 0.05) * 1000); // Aumenta um pouco o timeout para garantir que o som termine
      } else {
          // Se gainNode não está ativo/conectado, apenas remove da lista
          if (osc) { // Tenta parar o oscilador se existir
            try { osc.stop(now); } catch(e) { /* ignora */ }
          }
          delete this.oscillators[midiNote];
      }
    }
  }

  allNotesOff() {
    logDebug("Synth v59 All Notes Off (ADSR aware)");
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode } = this.oscillators[midiNote];
        if (gainNode && gainNode.numberOfOutputs > 0) { // V59: Checagem
            if (this.lfoGainPitch && osc && osc.frequency) {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { logDebug("LFO já desconectado em allNotesOff.", e); }
            }
            gainNode.gain.cancelScheduledValues(now);
            const quickRelease = 0.05;
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);
            try {
                osc.stop(now + quickRelease + 0.01);
            } catch(e) { logDebug("Erro ao parar osc (allNotesOff)", e); }

            // Agendar limpeza do oscilador específico
            const currentOscRef = osc; // Captura a referência atual
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
        } else if (this.oscillators[midiNote]) { // Se gainNode não estava conectado, mas a entrada existe
            if(osc) { try { osc.stop(now); } catch(e) { /* ignora */ } }
            delete this.oscillators[midiNote];
        }
      }
    }
    // this.oscillators = {}; // Limpeza mais agressiva, mas a de cima é mais segura para ADSR
  }
}

// Função para inicializar o AudioContext (não cria SimpleSynth automaticamente)
function _ensureAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        console.log("AudioContext (v59) está suspenso. Requer interação do usuário para iniciar.");
      } else if (audioCtx.state === 'running') {
        console.log("AudioContext (v59) já está rodando.");
      }
    } catch (e) {
      console.error("Web Audio API não é suportada neste navegador (v59).", e);
      // displayGlobalError("Web Audio API não suportada.", 10000); // V59
      audioCtx = null;
    }
  }
  return audioCtx;
}

// Chamado por uma interação do usuário para criar/resumir AudioContext e instanciar SimpleSynth
function initAudioContextOnGesture() {
  if (!_ensureAudioContext()) {
    console.error("Falha ao garantir AudioContext no gesto (v59).");
    // displayGlobalError("Falha ao iniciar motor de áudio.", 7000); // V59
    return false; // Indica falha na obtenção/criação do AudioContext
  }

  let contextReady = false;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('AudioContext (v59) resumido com sucesso por gesto do usuário!');
      contextReady = true;
      if (!simpleSynth) {
          simpleSynth = new SimpleSynth(audioCtx);
          // console.log("SimpleSynth (v59) instanciado após resumo do AudioContext."); // Log já em constructor
      }
      // main.js chamará getSimpleSynthInstance() e configurará o synth.
    }).catch(e => {
        console.error('Erro ao resumir AudioContext (v59):', e);
        // displayGlobalError("Erro ao ativar áudio. Tente novamente.", 5000); // V59
        // contextReady permanece false
    });
  } else if (audioCtx.state === 'running') {
    logDebug('AudioContext (v59) já está rodando.');
    contextReady = true;
    if (!simpleSynth) {
        simpleSynth = new SimpleSynth(audioCtx);
        // console.log("SimpleSynth (v59) instanciado (AudioContext já rodava)."); // Log já em constructor
    }
  }
  // Retorna true se o contexto ESTÁ rodando ou FOI resumido com sucesso (sincronamente se já rodava,
  // ou true se a promessa de resume() for bem sucedida, mas a função retorna antes da promessa resolver)
  // Para uma indicação mais precisa, main.js deve verificar o estado do AudioContext após esta chamada.
  return contextReady || audioCtx.state === 'running';
}

function setInternalAudioEnabledState(enabled) {
    _internalAudioEnabledMaster = !!enabled;
    if (!_internalAudioEnabledMaster && simpleSynth) {
        simpleSynth.allNotesOff();
    }
    logDebug(`Synth v59 _internalAudioEnabledMaster state set to: ${_internalAudioEnabledMaster}`);
}

function getSimpleSynthInstance() {
    if (!simpleSynth && _ensureAudioContext()) {
        if (audioCtx.state === 'running') {
            simpleSynth = new SimpleSynth(audioCtx);
            // console.log("SimpleSynth (v59) instanciado via getSimpleSynthInstance (AudioContext já rodava)."); // Log já em constructor
        } else {
            // Não criar synth se o contexto não estiver 'running'.
            // initAudioContextOnGesture deve ser chamado primeiro por uma interação do usuário.
            console.warn("getSimpleSynthInstance: AudioContext não está 'running'. SimpleSynth não será criado/retornado aqui. Chame initAudioContextOnGesture primeiro através de uma interação do usuário.");
            return null; // V59: Retorna null se não puder instanciar
        }
    }
    return simpleSynth;
}

function getAudioContext() {
    return _ensureAudioContext();
}

logDebug("synth59.js carregado.");
// ATENÇÃO: Para main60.js, as variáveis globais audioCtx e simpleSynth
// NÃO devem ser redeclaradas em main60.js. Elas são gerenciadas aqui.
// Use getAudioContext() e getSimpleSynthInstance() para acessá-las.
// A variável _internalAudioEnabledMaster também é gerenciada aqui.
// A função logDebug pode ser definida em main60.js se necessário lá também.
// A função displayGlobalError deve ser definida em main60.js.
