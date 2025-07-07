// ==========================================================================
// SYNTHESIZER MODULE v72 - synth72.js
// ==========================================================================

// audioCtx e _internalAudioEnabledMaster são gerenciados em main72.js
// simpleSynth (a instância) também é gerenciada em main72.js

const VALID_WAVEFORMS_V72 = ['sine', 'square', 'sawtooth', 'triangle', 'noise', 'pulse'];

function midiToFrequencyV72(midiNote) {
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

    // Efeitos (mantendo a estrutura da v71)
    this.distortionNode = this.audioCtx.createWaveShaper();
    this.distortionNode.oversample = '4x';
    this.distortionAmount = 0;
    this._updateDistortionCurve();

    this.filterNode = this.audioCtx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000;
    this.filterNode.Q.value = 1;

    // Conexão: osc -> gainNode (por nota) -> distortion -> filter -> masterGain
    // A conexão final ao masterGain é feita dentro de _playNote ou após o filtro se não houver outros efeitos.
    // Para simplificar, vamos conectar distortion -> filter -> masterGain aqui,
    // e os gainNodes das notas individuais conectarão ao distortionNode.
    this.distortionNode.connect(this.filterNode);
    // this.filterNode.connect(this.masterGainNode); // Movido para a cadeia de efeitos LFO/Delay/Reverb

    // LFO (Low-Frequency Oscillator)
    this.lfo = this.audioCtx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 5; // Hz
    this.lfoGainPitch = this.audioCtx.createGain(); // Para modular o pitch
    this.lfoGainPitch.gain.value = 0; // Profundidade da modulação de pitch
    this.lfoGainFilter = this.audioCtx.createGain(); // Para modular o cutoff do filtro
    this.lfoGainFilter.gain.value = 0; // Profundidade da modulação do filtro

    this.lfo.connect(this.lfoGainPitch); // Conecta LFO ao ganho de modulação de pitch
    this.lfo.connect(this.lfoGainFilter); // Conecta LFO ao ganho de modulação de filtro
    if (this.filterNode) {
        this.lfoGainFilter.connect(this.filterNode.frequency); // Conecta o ganho de modulação à frequência do filtro
    }
    this.lfo.start();

    // Delay Effect
    this.delayNode = this.audioCtx.createDelay(2.0); // Max delay time 2 segundos
    this.delayFeedbackGain = this.audioCtx.createGain();
    this.delayWetGain = this.audioCtx.createGain();
    this.delayDryGain = this.audioCtx.createGain();

    // Roteamento do Delay:
    // filterNode -> delayDryGain -> (para o próximo efeito ou masterGain)
    // filterNode -> delayNode -> delayFeedbackGain -> delayNode (loop de feedback)
    // delayNode -> delayWetGain -> (para o próximo efeito ou masterGain)
    this.filterNode.connect(this.delayDryGain);
    // this.delayDryGain.connect(this.masterGainNode); // Será conectado ao Reverb

    this.filterNode.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode); // Feedback loop
    this.delayNode.connect(this.delayWetGain);
    // this.delayWetGain.connect(this.masterGainNode); // Será conectado ao Reverb

    this.delayNode.delayTime.value = 0.5; // Tempo de delay padrão
    this.delayFeedbackGain.gain.value = 0.3; // Feedback padrão
    this.setDelayMix(0); // Mix padrão (totalmente seco)

    // Reverb Effect (usando Convolver)
    this.convolverNode = this.audioCtx.createConvolver();
    this.reverbWetGain = this.audioCtx.createGain();
    this.reverbDryGain = this.audioCtx.createGain();

    // Roteamento do Reverb (após o Delay):
    // delayDryGain -> reverbDryGain -> masterGain
    // delayWetGain -> reverbDryGain (se o reverb estiver antes do delay na cadeia, o que não é o caso aqui)
    // OU, para reverb em paralelo ao delay (mais comum):
    // filterNode -> reverbDryGain (se reverb fosse o primeiro efeito após o filtro)
    // filterNode -> convolverNode -> reverbWetGain
    // Neste caso, o delay já tem dry/wet, então vamos passar ambos para o reverb
    this.delayDryGain.connect(this.reverbDryGain); // Sinal seco do delay vai para o seco do reverb
    this.delayWetGain.connect(this.reverbDryGain); // Sinal molhado do delay também vai para o seco do reverb (para que o reverb processe ambos)

    this.delayDryGain.connect(this.convolverNode); // E ambos também vão para o processamento do reverb
    this.delayWetGain.connect(this.convolverNode);

    this.reverbDryGain.connect(this.masterGainNode); // Sinal não processado pelo reverb (já processado ou não pelo delay)
    this.convolverNode.connect(this.reverbWetGain);  // Sinal processado pelo reverb
    this.reverbWetGain.connect(this.masterGainNode);

    this._generateSimpleImpulseResponse().then(buffer => {
      if (this.convolverNode) this.convolverNode.buffer = buffer;
    }).catch(e => console.error("Erro ao gerar IR para reverb (v72):", e));

    this.setReverbMix(0); // Mix padrão (totalmente seco)

    // Buffer para waveform 'noise'
    this.noiseBuffer = null;
    if (this.audioCtx) {
        this._createNoiseBuffer();
    }

    console.log("SimpleSynth v72 inicializado.");
  }

  _createNoiseBuffer() {
    if (!this.audioCtx) {
        console.warn("AudioContext não disponível para criar noise buffer (v72).");
        return;
    }
    const bufferSize = this.audioCtx.sampleRate * 2; // 2 segundos de ruído
    this.noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1; // Ruído branco
    }
  }

  async _generateSimpleImpulseResponse() {
    // Gera uma resposta de impulso simples para o ConvolverNode (reverb)
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * 0.1; // Curta duração para um reverb "falso" simples
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate); // Estéreo
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const n = length - i; // Decaimento
      left[i] = (Math.random() * 2 - 1) * (n / length) * 0.2; // Ajuste o multiplicador para "volume" do reverb
      right[i] = (Math.random() * 2 - 1) * (n / length) * 0.2;
    }
    return impulse;
  }

  _updateDistortionCurve() {
    const k = typeof this.distortionAmount === 'number' ? this.distortionAmount : 0;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    if (k === 0) { // Sem distorção, curva linear
        for (let i = 0; i < n_samples; ++i) curve[i] = (i * 2 / n_samples) - 1;
    } else {
        const effectiveK = k * 5; // Aumenta o efeito do parâmetro k
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2 / n_samples) - 1; // Normaliza i para o intervalo [-1, 1]
            // Fórmula de distorção (exemplo, pode ser ajustada)
            curve[i] = (Math.PI/2 + effectiveK) * x / (Math.PI/2 + effectiveK * Math.abs(x));
            // Garante que a saída não exceda os limites de áudio
            curve[i] = Math.max(-1, Math.min(1, curve[i]));
        }
    }
    this.distortionNode.curve = curve;
  }

  // --- Setters para Parâmetros do Synth ---
  setWaveform(newWaveform) {
    if (VALID_WAVEFORMS_V72.includes(newWaveform)) {
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

  setDistortion(amount) { // amount de 0 a 100
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
      const clampedQ = Math.max(0.0001, Math.min(1000, parseFloat(qValue))); // Valores típicos para Q
      this.filterNode.Q.setValueAtTime(clampedQ, this.audioCtx.currentTime);
    }
  }
  setLfoWaveform(waveform) {
    const validLfoWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    if (this.lfo && validLfoWaveforms.includes(waveform)) {
      this.lfo.type = waveform;
    }
  }
  setLfoRate(rate) { // em Hz
    if (this.lfo) {
      const clampedRate = Math.max(0.01, Math.min(100, parseFloat(rate))); // Limites razoáveis para LFO rate
      this.lfo.frequency.setValueAtTime(clampedRate, this.audioCtx.currentTime);
    }
  }
  setLfoPitchDepth(depth) { // Profundidade em Hz (quanto o LFO afeta o pitch)
    if (this.lfoGainPitch) {
      const clampedDepth = Math.max(0, Math.min(100, parseFloat(depth))); // Ex: até 100Hz de variação
      this.lfoGainPitch.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
    }
  }
  setLfoFilterDepth(depth) { // Profundidade em Hz (quanto o LFO afeta o cutoff do filtro)
    if (this.lfoGainFilter) {
      const clampedDepth = Math.max(0, Math.min(10000, parseFloat(depth))); // Ex: até 10kHz de variação
      this.lfoGainFilter.gain.setValueAtTime(clampedDepth, this.audioCtx.currentTime);
    }
  }
  setDelayTime(time) { // em segundos
    if (this.delayNode) {
      const clampedTime = Math.max(0.001, Math.min(2.0, parseFloat(time)));
      this.delayNode.delayTime.setValueAtTime(clampedTime, this.audioCtx.currentTime);
    }
  }
  setDelayFeedback(feedback) { // de 0 a ~0.95 (para evitar feedback infinito)
    if (this.delayFeedbackGain) {
      const clampedFeedback = Math.max(0, Math.min(0.95, parseFloat(feedback)));
      this.delayFeedbackGain.gain.setValueAtTime(clampedFeedback, this.audioCtx.currentTime);
    }
  }
  setDelayMix(mix) { // de 0 (dry) a 1 (wet)
    if (this.delayDryGain && this.delayWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      this.delayDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.delayWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
    }
  }
  setReverbMix(mix, forNote = null /* não usado aqui, mas mantido para compatibilidade se necessário */) { // de 0 (dry) a 1 (wet)
    if (this.reverbDryGain && this.reverbWetGain) {
      const clampedMix = Math.max(0, Math.min(1, parseFloat(mix)));
      this.reverbDryGain.gain.setValueAtTime(Math.cos(clampedMix * 0.5 * Math.PI), this.audioCtx.currentTime);
      this.reverbWetGain.gain.setValueAtTime(Math.cos((1.0 - clampedMix) * 0.5 * Math.PI), this.audioCtx.currentTime);
    }
  }


  // --- Controle de Notas ---
  noteOn(midiNote, velocity = 127) {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
        console.warn("SimpleSynth.noteOn (v72): audioCtx não disponível ou fechado.");
        return;
    }
    if (this.audioCtx.state === 'suspended') {
      // Idealmente, main.js deve garantir que o audioCtx está 'running' antes de chamar noteOn.
      console.warn("SimpleSynth.noteOn (v72): AudioContext ainda suspenso. O som pode não tocar.");
    }
    this._playNote(midiNote, velocity);
  }

  _playNote(midiNote, velocity) {
    const freq = midiToFrequencyV72(midiNote);
    if (freq <= 0 && this.waveform !== 'noise') {
        console.warn(`Frequência inválida (${freq}Hz) para MIDI note ${midiNote} com waveform ${this.waveform}. Nota não será tocada (v72).`);
        return;
    }

    // Limpa oscilador anterior para esta nota, se existir
    if (this.oscillators[midiNote]) {
        const oldOscData = this.oscillators[midiNote];
        try {
            if (oldOscData.osc) { oldOscData.osc.stop(this.audioCtx.currentTime); }
            if (oldOscData.gainNode && oldOscData.gainNode.numberOfOutputs > 0) { oldOscData.gainNode.disconnect(); }
            // Desconectar LFO do oscilador antigo
            if (this.lfoGainPitch && oldOscData.osc && oldOscData.osc.frequency && this.waveform !== 'noise') {
                 this.lfoGainPitch.disconnect(oldOscData.osc.frequency); // Tenta desconectar
            }
        } catch (e) { console.warn("Erro ao limpar oscilador/gain anterior em _playNote (v72):", e); }
        delete this.oscillators[midiNote];
    }

    let osc;
    const gainNode = this.audioCtx.createGain(); // Gain individual para envelope da nota
    const now = this.audioCtx.currentTime;

    if (this.waveform === 'noise') {
        if (!this.noiseBuffer) this._createNoiseBuffer(); // Garante que o buffer exista
        if (!this.noiseBuffer) { console.error("Buffer de ruído não pôde ser criado. Impossível tocar nota de ruído (v72)."); return; }
        osc = this.audioCtx.createBufferSource();
        osc.buffer = this.noiseBuffer;
        osc.loop = true; // Ruído contínuo, controlado pelo gain envelope
    } else if (this.waveform === 'pulse') {
        osc = this.audioCtx.createOscillator();
        // Para 'pulse', podemos usar createPeriodicWave ou um oscilador 'square' e modular o duty cycle com LFO (mais complexo)
        // Por simplicidade, podemos usar uma aproximação com createPeriodicWave ou um 'square'
        // Usando createPeriodicWave para uma forma de pulso simples:
        const realCoeffs = new Float32Array([0, 0.6, 0.4, 0.2, 0.1, 0.05]); // Exemplo de coeficientes (ajustar para timbre desejado)
        const imagCoeffs = new Float32Array(realCoeffs.length).fill(0);
        try {
            const periodicWave = this.audioCtx.createPeriodicWave(realCoeffs, imagCoeffs, { disableNormalization: true });
            osc.setPeriodicWave(periodicWave);
        } catch (e) {
            console.warn("Falha ao criar PeriodicWave para 'pulse', usando 'square' como fallback (v72).", e);
            osc.type = 'square'; // Fallback
        }
        osc.frequency.setValueAtTime(freq, now);
        if (this.lfoGainPitch) this.lfoGainPitch.connect(osc.frequency); // LFO afeta o pitch
    }
     else { // sine, square, sawtooth, triangle
        osc = this.audioCtx.createOscillator();
        osc.type = this.waveform;
        osc.frequency.setValueAtTime(freq, now);
        if (this.lfoGainPitch) this.lfoGainPitch.connect(osc.frequency); // LFO afeta o pitch
    }

    // Envelope ADSR
    const velocityGain = Math.max(0, Math.min(1, (velocity / 127))); // Normaliza velocidade
    const peakGain = velocityGain; // O pico do attack é influenciado pela velocidade
    const sustainGain = peakGain * this.sustainLevel; // Sustain é relativo ao pico

    gainNode.gain.cancelScheduledValues(now); // Limpa eventos anteriores
    gainNode.gain.setValueAtTime(0, now); // Começa do silêncio
    gainNode.gain.linearRampToValueAtTime(peakGain, now + this.attackTime);
    gainNode.gain.linearRampToValueAtTime(sustainGain, now + this.attackTime + this.decayTime);

    // Conecta o oscilador da nota à cadeia de efeitos
    osc.connect(gainNode);
    gainNode.connect(this.distortionNode); // gainNode -> distortion -> filter -> delayDry/Wet -> reverbDry/Wet -> masterGain

    osc.start(now); // Inicia o oscilador
    this.oscillators[midiNote] = { osc, gainNode, type: this.waveform }; // Armazena referência
  }

  noteOff(midiNote) {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
        console.warn("SimpleSynth.noteOff (v72): audioCtx não disponível ou fechado.");
        return;
    }

    if (this.oscillators[midiNote]) {
      const { osc, gainNode, type } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;

      if (gainNode && gainNode.numberOfOutputs > 0) { // Verifica se o gainNode ainda está conectado
          // Desconectar LFO do oscilador desta nota
          if (this.lfoGainPitch && osc && osc.frequency && type !== 'noise') {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { console.warn("LFO já desconectado do osc.frequency ou erro em noteOff (v72).", e); }
          }

          // Aplica o Release do envelope
          gainNode.gain.cancelScheduledValues(now); // Limpa eventos futuros (importante!)
          gainNode.gain.setValueAtTime(gainNode.gain.value, now); // Mantém o valor atual para o início do release
          gainNode.gain.linearRampToValueAtTime(0, now + this.releaseTime); // Rampa para zero

          // Para o oscilador após o release
          try { osc.stop(now + this.releaseTime + 0.01); } // Adiciona uma pequena margem
          catch (e) { console.warn("Erro ao parar oscilador (pode já ter sido parado) em noteOff (v72):", e); }

          // Limpa a referência após o release para permitir que os objetos sejam coletados pelo GC
          // e para evitar que o oscilador seja reutilizado ou modificado incorretamente.
          setTimeout(() => {
            // Verifica se o oscilador ainda é o mesmo que foi agendado para parar
            // (útil se a mesma nota for tocada rapidamente)
            if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
                if (gainNode && gainNode.numberOfOutputs > 0) {
                    try { gainNode.disconnect(); } // Desconecta o gainNode da cadeia de efeitos
                    catch (e) { console.warn("Erro ao desconectar gainNode (pode já estar desconectado) em noteOff (v72).", e); }
                }
                delete this.oscillators[midiNote]; // Remove a referência
            }
          }, (this.releaseTime + 0.05) * 1000); // Atraso um pouco maior que o stop
      } else {
          // Se o gainNode já foi desconectado ou não existe, apenas tenta parar o osc e deleta a referência
          if (osc) { try { osc.stop(now); } catch(e) { /* ignora se já parado */ } }
          delete this.oscillators[midiNote];
      }
    }
  }

  allNotesOff() {
    console.log("SimpleSynth v72 All Notes Off (ADSR aware)");
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode, type } = this.oscillators[midiNote];
        if (gainNode && gainNode.numberOfOutputs > 0) {
            // Desconectar LFO
            if (this.lfoGainPitch && osc && osc.frequency && type !== 'noise') {
              try { this.lfoGainPitch.disconnect(osc.frequency); }
              catch (e) { console.warn("LFO já desconectado em allNotesOff (v72).", e); }
            }
            // Release rápido para todas as notas
            gainNode.gain.cancelScheduledValues(now);
            const quickRelease = 0.05; // Release muito curto para allNotesOff
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);

            try { osc.stop(now + quickRelease + 0.01); }
            catch(e) { console.warn("Erro ao parar osc (allNotesOff v72)", e); }

            // Agendar limpeza das referências
            const currentOscRef = osc; const currentGainNodeRef = gainNode; const currentMidiNoteKey = midiNote;
            setTimeout(() => {
                if (this.oscillators[currentMidiNoteKey] && this.oscillators[currentMidiNoteKey].osc === currentOscRef) {
                    if (currentGainNodeRef && currentGainNodeRef.numberOfOutputs > 0) {
                        try { currentGainNodeRef.disconnect(); } catch (e) { /* ignora */ }
                    }
                    delete this.oscillators[currentMidiNoteKey];
                }
            }, (quickRelease + 0.05) * 1000);
        } else if (this.oscillators[midiNote]) { // Se só houver oscilador sem gainNode (improvável no fluxo normal)
            if(osc) { try { osc.stop(now); } catch(e) { /* ignora */ } }
            delete this.oscillators[midiNote];
        }
      }
    }
  }
}

console.log("synth72.js carregado e pronto para ser instanciado por main72.js.");
