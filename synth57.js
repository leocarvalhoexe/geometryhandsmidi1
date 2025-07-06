// ==========================================================================
// SYNTHESIZER MODULE v57 - synth57.js
// ==========================================================================

let audioCtx = null;
let simpleSynthV57 = null; // Nome da variável atualizado
let _internalAudioEnabledMaster = true; // Controla se o synth deve tocar som

function midiToFrequency(midiNote) {
  if (midiNote < 0 || midiNote > 127) return 0;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

class SimpleSynthV57 { // Nome da classe atualizado
  constructor(audioContext) {
    this.audioCtx = audioContext;
    this.oscillators = {}; // Armazena osciladores ativos por nota MIDI { midiNote: { osc, gainNode, filterNode (opcional para velocity) } }
    this.masterGainNode = this.audioCtx.createGain();
    this.masterGainNode.gain.value = 0.5; // Volume padrão

    this.waveform = 'sine'; // Forma de onda padrão
    this.availableWaveforms = ['sine', 'square', 'sawtooth', 'triangle', 'sine+saw', 'sine+square']; // Adicionadas waveforms híbridas
    this.currentEnvelope = { // Envelope padrão, pode ser alterado dinamicamente
        attack: 0.01,
        decay: 0.1,
        sustain: 0.7,
        release: 0.2
    };

    // Efeito de Distorção/Saturação (Soft Clipping) - Opcional
    this.saturationNode = this.audioCtx.createWaveShaper();
    this.saturationNode.oversample = '4x';
    this.saturationAmount = 0; // 0 = sem saturação, >0 = quantidade
    this.saturationEnabled = false;
    this._updateSaturationCurve();

    // Filtro Low-Pass Global (pode ser movido para por-nota para modulação de brilho por velocity)
    // Por enquanto, mantemos global, mas a modulação por velocity será por nota.
    this.globalFilterNode = this.audioCtx.createBiquadFilter();
    this.globalFilterNode.type = 'lowpass';
    this.globalFilterNode.frequency.value = 20000;
    this.globalFilterNode.Q.value = 1;

    // Conexão da cadeia de efeitos globais:
    // masterGain -> saturation (se ativo) -> globalFilter -> destination
    // Se saturação não estiver ativa, masterGain -> globalFilter
    this.outputChainStartNode = this.masterGainNode; // Ponto de partida para a cadeia de saída

    if (this.saturationEnabled) {
        this.masterGainNode.connect(this.saturationNode);
        this.saturationNode.connect(this.globalFilterNode);
    } else {
        this.masterGainNode.connect(this.globalFilterNode);
    }
    this.globalFilterNode.connect(this.audioCtx.destination);


    // LFO Global (Low-Frequency Oscillator) - Mantido como na v55
    this.lfo = this.audioCtx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 5;
    this.lfoGainPitch = this.audioCtx.createGain();
    this.lfoGainPitch.gain.value = 0;
    this.lfoGainFilter = this.audioCtx.createGain();
    this.lfoGainFilter.gain.value = 0;

    this.lfo.connect(this.lfoGainPitch);
    this.lfo.connect(this.lfoGainFilter);
    if (this.globalFilterNode) { // LFO modula o filtro global
        this.lfoGainFilter.connect(this.globalFilterNode.frequency);
    }
    this.lfo.start();

    // Efeitos de Delay e Reverb (Convolver) - Mantidos como na v55
    // A conexão deles precisará ser ajustada para sair do globalFilterNode
    this.delayNode = this.audioCtx.createDelay(2.0);
    this.delayFeedbackGain = this.audioCtx.createGain();
    this.delayWetGain = this.audioCtx.createGain();
    this.delayDryGain = this.audioCtx.createGain();

    this.convolverNode = this.audioCtx.createConvolver();
    this.reverbWetGain = this.audioCtx.createGain();
    this.reverbDryGain = this.audioCtx.createGain();

    // Roteamento ajustado: globalFilter -> Delay System -> Reverb System -> Destination
    this.globalFilterNode.disconnect(this.audioCtx.destination); // Desconectar filtro do destino final por enquanto

    // Conectar globalFilter ao sistema de Delay
    this.globalFilterNode.connect(this.delayDryGain);
    this.delayDryGain.connect(this.convolverNode); // Dry do delay alimenta o convolver (para reverb)
    this.delayDryGain.connect(this.reverbDryGain); // Dry do delay alimenta o dry do reverb

    this.globalFilterNode.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.delayWetGain);
    this.delayWetGain.connect(this.convolverNode); // Wet do delay alimenta o convolver
    this.delayWetGain.connect(this.reverbDryGain); // Wet do delay também alimenta o dry do reverb (somado)

    // Conectar sistema de Reverb ao destino final
    this.reverbDryGain.connect(this.audioCtx.destination);
    this.convolverNode.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.audioCtx.destination);

    this.delayNode.delayTime.value = 0.5;
    this.delayFeedbackGain.gain.value = 0.3;
    this.setDelayMix(0);

    this.setReverbMix(0);
    this.loadStereoImpulseResponse(); // Carregar IR estéreo aprimorado

    // v57 - Canvas para visualização do buffer (opcional)
    this.analyserNode = null;
    this.visualisationCanvas = null;
    this.visualisationCtx = null;
    this.visualisationBufferLength = null;
    this.visualisationDataArray = null;
    this.visualisationEnabled = false;

    console.log("SimpleSynthV57 inicializado.");
  }

  // v57 - Modulação por Velocity (Ganho e Brilho)
  // O ganho já é modulado pela velocity em _playNote.
  // Para o brilho, vamos adicionar um filtro individual por nota se a velocity for usada.
  // Esta é uma simplificação; um sistema mais complexo poderia ter um filtro dedicado por voz.

  _getVelocityModifiedValue(baseValue, velocity, modulationDepth = 0.7, isGain = false) {
    // velocity: 0-127
    // modulationDepth: 0 (sem modulação) a 1 (modulação total)
    // Para ganho, velocity mais alta = mais ganho.
    // Para brilho (frequência do filtro), velocity mais alta = frequência mais alta (mais brilho).
    const normalizedVelocity = velocity / 127; // 0 a 1

    if (isGain) {
        // Exemplo: gain = baseGain * (1 + (normalizedVelocity - 0.5) * modulationDepth)
        // Isso permite que a velocity média (64) não altere muito o ganho base.
        // Ou mais simples: gain = baseGain * ( (1-modulationDepth) + normalizedVelocity * modulationDepth )
        // Se modulationDepth = 1, gain = baseGain * normalizedVelocity
        // Se modulationDepth = 0, gain = baseGain
        return baseValue * ((1 - modulationDepth) + normalizedVelocity * modulationDepth);
    } else { // Para frequência de filtro (brilho)
        // Exemplo: freq = baseFreq * (1 + (normalizedVelocity - 0.5) * modulationDepth * 2)
        // Ou, mapear velocity para uma faixa de multiplicador do filtro, ex: 0.5x a 2x
        // Para simplificar: assumimos que a frequência base é o máximo (sem filtro)
        // e a velocity reduz a frequência (escurece o som).
        // Ou o contrário: base é escuro, velocity abre. Vamos com este:
        const minFreq = 200; // Frequência mínima do filtro (som mais escuro)
        const maxFreq = baseValue; // Frequência base do filtro global (som mais brilhante)
        return minFreq + (maxFreq - minFreq) * Math.pow(normalizedVelocity, 2); // Math.pow para curva mais expressiva
    }
  }


  // v57 - Novos Timbres Combinados
  _createCombinedWaveform(type, freq) {
    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    const merger = this.audioCtx.createChannelMerger(2); // Para mixar os dois osciladores
    const outputGain = this.audioCtx.createGain();
    outputGain.gain.value = 0.5; // Reduzir ganho para evitar clipping ao somar

    osc1.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
    osc2.frequency.setValueAtTime(freq, this.audioCtx.currentTime); // Mesma frequência base, pode ser desafinado depois

    if (type === 'sine+saw') {
        osc1.type = 'sine';
        osc2.type = 'sawtooth';
        // Pequeno desafinamento para efeito de chorus leve
        // osc2.frequency.setValueAtTime(freq * 1.005, this.audioCtx.currentTime);
    } else if (type === 'sine+square') {
        osc1.type = 'sine';
        osc2.type = 'square';
        // osc2.frequency.setValueAtTime(freq * 0.995, this.audioCtx.currentTime);
    }

    osc1.connect(outputGain); // Conecta direto ao gain de saída da "voz"
    osc2.connect(outputGain); // Conecta direto ao gain de saída da "voz"

    // Os osciladores combinados já estão conectados ao outputGain, que será o "osc" retornado.
    // Não precisamos do merger aqui se estamos apenas somando-os no mesmo gain.
    // Se quiséssemos processá-los separadamente antes de somar, o merger seria útil.
    // Para esta implementação, somar no gain é suficiente.

    // Retornamos um objeto que se comporta como um único oscilador para o resto do código de noteOn/Off
    return {
        oscNode: outputGain, // O gain é o ponto de saída desta "voz" combinada
        subOscs: [osc1, osc2],
        start: (time) => { osc1.start(time); osc2.start(time); },
        stop: (time) => {
            try { osc1.stop(time); } catch(e){}
            try { osc2.stop(time); } catch(e){}
        },
        // A frequência é controlada nos sub-osciladores individualmente se necessário
        // Para LFO de pitch, conectaríamos o lfoGainPitch às frequências de osc1 e osc2.
        // Para simplificar, o LFO de pitch será conectado a ambos subOscs em _playNote
        frequency1: osc1.frequency, // Expor frequências individuais se necessário para LFO
        frequency2: osc2.frequency
    };
  }

  // v57 - Saturação/Soft Clipping
  _updateSaturationCurve() {
    const k = this.saturationAmount; // De 0 a 1 (ou mais para mais saturação)
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;

    if (k === 0 || !this.saturationEnabled) { // Se desabilitado ou amount = 0, curva linear
        for (let i = 0; i < n_samples; ++i) {
            curve[i] = (i * 2 / n_samples) - 1;
        }
    } else {
        // Curva de soft clipping baseada em tanh ou similar
        // Exemplo de curva de saturação (pode ser ajustada):
        const drive = 1 + k * 5; // Aumenta o "drive" com k
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2 / n_samples) - 1; // x de -1 a 1
            curve[i] = Math.tanh(x * drive);
        }
    }
    this.saturationNode.curve = curve;
  }

  setSaturation(amount, enabled = this.saturationEnabled) {
    this.saturationAmount = Math.max(0, Math.min(100, parseFloat(amount) || 0)) / 100; // Normaliza para 0-1
    this.saturationEnabled = !!enabled;
    this._updateSaturationCurve();
    this._reconnectOutputChain(); // Reconectar a cadeia de saída
    console.log(`Synth Saturation: Amount=${this.saturationAmount.toFixed(2)}, Enabled=${this.saturationEnabled}`);
  }

  _reconnectOutputChain() {
    // Desconecta tudo a partir do masterGainNode e reconecta na ordem correta
    this.outputChainStartNode.disconnect(); // Desconecta o ponto de partida (masterGain ou o que estava antes)
    this.masterGainNode.disconnect(); // Garante que masterGain não esteja conectado a nada antigo
    if (this.saturationNode) this.saturationNode.disconnect();
    if (this.globalFilterNode) this.globalFilterNode.disconnect();
    // ... desconectar delay/reverb de suas fontes anteriores se elas mudaram ...
    // Esta parte é complexa porque delay/reverb podem estar conectados após o filtro global.

    // Simplificação: A cadeia principal é osc -> gain (nota) -> masterGain.
    // A partir de masterGain, a cadeia de efeitos globais é aplicada.

    // Cadeia de Saída Global:
    // masterGainNode -> (saturationNode se ativo) -> globalFilterNode -> (delay/reverb system) -> audioCtx.destination

    let currentNode = this.masterGainNode;

    if (this.saturationEnabled) {
        currentNode.connect(this.saturationNode);
        currentNode = this.saturationNode;
    }

    currentNode.connect(this.globalFilterNode);
    currentNode = this.globalFilterNode;

    // Reconectar o sistema de Delay e Reverb à saída do filtro global
    // (a lógica de _constructor já faz isso, mas garantimos aqui se houve mudanças)
    this.delayDryGain.disconnect();
    this.delayWetGain.disconnect();
    this.reverbDryGain.disconnect();
    this.convolverNode.disconnect(); // O convolverNode é o "wet" do reverb
    this.reverbWetGain.disconnect();


    currentNode.connect(this.delayDryGain);
    this.delayDryGain.connect(this.reverbDryGain); // Dry do delay -> Dry do reverb
    this.delayDryGain.connect(this.convolverNode); // Dry do delay -> Wet do reverb (convolver)

    currentNode.connect(this.delayNode); // Sinal do filtro para o processamento de delay
    // (delayNode -> delayFeedbackGain -> delayNode já está configurado)
    this.delayNode.connect(this.delayWetGain);
    this.delayWetGain.connect(this.reverbDryGain); // Wet do delay -> Dry do reverb
    this.delayWetGain.connect(this.convolverNode); // Wet do delay -> Wet do reverb (convolver)

    this.reverbDryGain.connect(this.audioCtx.destination);
    this.convolverNode.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.audioCtx.destination);

    this.outputChainStartNode = this.masterGainNode; // O início da cadeia global é sempre o masterGainNode

    console.log("Cadeia de saída do synth reconectada.");
  }


  // v57 - Reverb Estéreo Aprimorado
  async loadStereoImpulseResponse(url = null) {
    // Se uma URL for fornecida, tenta carregar o IR customizado.
    // Caso contrário, gera um IR estéreo simples com maior duração.
    let impulseBuffer;
    if (url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            impulseBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
            console.log("Impulse Response estéreo carregado de URL:", url);
        } catch (e) {
            console.error("Erro ao carregar Impulse Response da URL, gerando um padrão:", e);
            impulseBuffer = await this._generateStereoImpulseResponse(0.8, 0.6); // Duração maior, ex: 0.8s decay, 0.6s stereo spread
        }
    } else {
        impulseBuffer = await this._generateStereoImpulseResponse(0.7, 0.5); // Duração padrão > 0.5s
    }

    if (this.convolverNode) {
        this.convolverNode.buffer = impulseBuffer;
        this.convolverNode.normalize = true; // Normalizar para evitar clipping
    }
  }

  async _generateStereoImpulseResponse(durationSeconds = 0.7, stereoSpreadFactor = 0.5) {
    const sampleRate = this.audioCtx.sampleRate;
    const length = Math.floor(sampleRate * durationSeconds);
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate); // 2 canais para estéreo
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const envelope = Math.pow(1 - (i / length), 2.5); // Curva de decaimento exponencial
        // Canal Esquerdo
        left[i] = (Math.random() * 2 - 1) * envelope;
        // Canal Direito - ligeiramente diferente para efeito estéreo
        // stereoSpreadFactor (0 a 1): 0 = mono, 1 = espalhamento máximo (pode ser delay ou fase)
        // Exemplo simples: pequena diferença de fase/tempo ou conteúdo aleatório diferente
        const rightVal = (Math.random() * 2 - 1) * envelope;
        // Mistura um pouco do esquerdo no direito e vice-versa para um espalhamento mais natural
        right[i] = left[i] * (1 - stereoSpreadFactor) + rightVal * stereoSpreadFactor;
        left[i] = rightVal * (1 - stereoSpreadFactor) + left[i] * stereoSpreadFactor; // Pequena correção no esquerdo também
    }
    console.log(`Gerado Impulse Response Estéreo: ${durationSeconds.toFixed(1)}s, Spread: ${stereoSpreadFactor}`);
    return impulse;
  }

  // v57 - Mudança Dinâmica de Forma de Onda e Envelope (por evento/gesto)
  setDynamicWaveform(newWaveform) {
    if (this.availableWaveforms.includes(newWaveform)) {
        this.waveform = newWaveform;
        console.log(`Synth Waveform alterada dinamicamente para: ${this.waveform}`);
        // Osciladores existentes não são alterados em tempo real para evitar cliques.
        // A nova forma de onda será usada para as próximas notas.
        // Para alterar em tempo real, seria necessário iterar em this.oscillators e mudar .type ou recriá-los.
    } else {
        console.warn(`Forma de onda dinâmica inválida: ${newWaveform}`);
    }
  }

  setDynamicEnvelope(adsrObject) {
    if (adsrObject && typeof adsrObject.attack === 'number') {
        this.currentEnvelope.attack = Math.max(0.001, adsrObject.attack);
    }
    if (adsrObject && typeof adsrObject.decay === 'number') {
        this.currentEnvelope.decay = Math.max(0.001, adsrObject.decay);
    }
    if (adsrObject && typeof adsrObject.sustain === 'number') {
        this.currentEnvelope.sustain = Math.max(0, Math.min(1, adsrObject.sustain));
    }
    if (adsrObject && typeof adsrObject.release === 'number') {
        this.currentEnvelope.release = Math.max(0.001, adsrObject.release);
    }
    console.log("Synth Envelope alterado dinamicamente:", this.currentEnvelope);
    // O novo envelope será usado para as próximas notas.
  }

  // v57 - Visualização do Sinal Sintetizado (Buffer)
  enableVisualisation(canvasElementId) {
    if (!this.audioCtx) return;
    this.visualisationCanvas = document.getElementById(canvasElementId);
    if (!this.visualisationCanvas) {
        console.error(`Canvas com ID '${canvasElementId}' não encontrado para visualização.`);
        return;
    }
    this.visualisationCtx = this.visualisationCanvas.getContext('2d');

    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 2048; // Pode ser ajustado
    this.visualisationBufferLength = this.analyserNode.frequencyBinCount;
    this.visualisationDataArray = new Uint8Array(this.visualisationBufferLength);

    // Conectar o analyserNode ANTES do destino final para capturar o áudio
    // Idealmente, conectar após todos os efeitos, mas antes do audioCtx.destination
    // Se o reverbWetGain e reverbDryGain são os últimos antes do destination:
    this.reverbWetGain.disconnect(this.audioCtx.destination);
    this.reverbDryGain.disconnect(this.audioCtx.destination);

    this.reverbWetGain.connect(this.analyserNode);
    this.reverbDryGain.connect(this.analyserNode); // Captura ambos os sinais dry/wet do reverb

    this.analyserNode.connect(this.audioCtx.destination);

    this.visualisationEnabled = true;
    this._drawVisualisation();
    console.log("Visualização do sinal do synth ativada.");
  }

  disableVisualisation() {
    if (this.analyserNode && this.audioCtx) {
        // Reconectar a cadeia sem o analyser
        this.reverbWetGain.disconnect(this.analyserNode);
        this.reverbDryGain.disconnect(this.analyserNode);
        this.analyserNode.disconnect(this.audioCtx.destination);

        this.reverbWetGain.connect(this.audioCtx.destination);
        this.reverbDryGain.connect(this.audioCtx.destination);

        this.analyserNode = null;
    }
    this.visualisationEnabled = false;
    if (this.visualisationCtx && this.visualisationCanvas) {
        this.visualisationCtx.clearRect(0, 0, this.visualisationCanvas.width, this.visualisationCanvas.height);
    }
    console.log("Visualização do sinal do synth desativada.");
  }

  _drawVisualisation() {
    if (!this.visualisationEnabled || !this.analyserNode || !this.visualisationCtx) {
        return;
    }
    requestAnimationFrame(() => this._drawVisualisation());

    this.analyserNode.getByteTimeDomainData(this.visualisationDataArray); // Ou getByteFrequencyData para espectro

    this.visualisationCtx.fillStyle = 'rgb(30, 30, 30)';
    this.visualisationCtx.fillRect(0, 0, this.visualisationCanvas.width, this.visualisationCanvas.height);
    this.visualisationCtx.lineWidth = 2;
    this.visualisationCtx.strokeStyle = 'rgb(0, 200, 0)';
    this.visualisationCtx.beginPath();

    const sliceWidth = this.visualisationCanvas.width * 1.0 / this.visualisationBufferLength;
    let x = 0;

    for (let i = 0; i < this.visualisationBufferLength; i++) {
        const v = this.visualisationDataArray[i] / 128.0; // Normaliza para 0-2
        const y = v * this.visualisationCanvas.height / 2;

        if (i === 0) {
            this.visualisationCtx.moveTo(x, y);
        } else {
            this.visualisationCtx.lineTo(x, y);
        }
        x += sliceWidth;
    }
    this.visualisationCtx.lineTo(this.visualisationCanvas.width, this.visualisationCanvas.height / 2);
    this.visualisationCtx.stroke();
  }

  // v57 - Ajuste Automático de Release
  _getAutoReleaseTime() {
    let baseRelease = this.currentEnvelope.release;
    let delayActive = this.delayWetGain.gain.value > 0.05 && this.delayNode.delayTime.value > 0.01;
    let reverbActive = this.reverbWetGain.gain.value > 0.05;

    if (delayActive && reverbActive) {
        // Se ambos estão ativos, o release pode ser um pouco mais longo que o maior deles
        baseRelease = Math.max(baseRelease, this.delayNode.delayTime.value * 1.5, 0.5 /*min reverb tail*/);
        baseRelease *= 1.2; // Adiciona um pouco mais
    } else if (delayActive) {
        baseRelease = Math.max(baseRelease, this.delayNode.delayTime.value * 1.2);
    } else if (reverbActive) {
        baseRelease = Math.max(baseRelease, 0.6); // Um valor razoável para cauda de reverb
    }
    // Limitar o release máximo para evitar sons excessivamente longos
    return Math.min(baseRelease, 3.0);
  }


  // === Métodos ADSR, Waveform, MasterVolume (mantidos da v55, mas usam this.currentEnvelope) ===
  setAttack(time) { this.currentEnvelope.attack = Math.max(0.001, time); }
  setDecay(time) { this.currentEnvelope.decay = Math.max(0.001, time); }
  setSustain(level) { this.currentEnvelope.sustain = Math.max(0, Math.min(1, level)); }
  setRelease(time) { this.currentEnvelope.release = Math.max(0.001, time); }

  setWaveform(newWaveform) { // Agora usa setDynamicWaveform
    this.setDynamicWaveform(newWaveform);
  }

  setMasterVolume(volume) {
    if (volume >= 0 && volume <= 1) this.masterGainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
  }

  // === Métodos noteOn e noteOff (Adaptados para v57) ===
  noteOn(midiNote, velocity = 127) {
    if (!_internalAudioEnabledMaster || !this.audioCtx || this.audioCtx.state === 'closed') return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(() => {
        console.log("AudioContext (v57) resumido por noteOn.");
        this._playNote(midiNote, velocity);
      }).catch(e => console.error("Erro ao resumir AudioContext (v57):", e));
      return;
    }
    this._playNote(midiNote, velocity);
  }

  _playNote(midiNote, velocity) {
    const freq = midiToFrequency(midiNote);
    if (freq === 0) return;

    if (this.oscillators[midiNote]) {
      this.noteOff(midiNote); // Chama noteOff para limpar o oscilador anterior corretamente
    }

    let oscSource;
    let isCombinedWaveform = this.waveform.includes('+');

    if (isCombinedWaveform) {
        oscSource = this._createCombinedWaveform(this.waveform, freq);
    } else {
        const standardOsc = this.audioCtx.createOscillator();
        standardOsc.type = this.waveform;
        standardOsc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        oscSource = { // Encapsula para ter a mesma interface de start/stop/frequency
            oscNode: standardOsc,
            subOscs: [standardOsc], // Para consistência com _createCombinedWaveform
            start: (time) => standardOsc.start(time),
            stop: (time) => { try { standardOsc.stop(time); } catch(e){} },
            get frequency() { return standardOsc.frequency; }
        };
    }

    const gainNode = this.audioCtx.createGain();

    // v57 - Modulação de Ganho por Velocity
    const baseGain = 1.0; // Ganho base antes da modulação de velocity
    const modulatedGain = this._getVelocityModifiedValue(baseGain, velocity, 0.8, true); // 0.8 = profundidade da modulação

    const peakGain = modulatedGain;
    const sustainGain = peakGain * this.currentEnvelope.sustain;
    const now = this.audioCtx.currentTime;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + this.currentEnvelope.attack);
    gainNode.gain.linearRampToValueAtTime(sustainGain, now + this.currentEnvelope.attack + this.currentEnvelope.decay);

    // v57 - Modulação de Brilho (Filtro por Nota) por Velocity
    // Para simplificar, vamos assumir que cada nota NÃO tem seu próprio filtro dedicado por enquanto,
    // e o brilho é controlado pelo filtro global ou não modulado por velocity diretamente no oscilador.
    // Se quiséssemos filtro por nota:
    // const noteFilter = this.audioCtx.createBiquadFilter();
    // noteFilter.type = 'lowpass';
    // const filterFreq = this._getVelocityModifiedValue(this.globalFilterNode.frequency.value, velocity, 0.6, false);
    // noteFilter.frequency.setValueAtTime(filterFreq, now);
    // oscSource.oscNode.connect(noteFilter);
    // noteFilter.connect(gainNode);
    // this.oscillators[midiNote] = { ..., noteFilter };
    // E no noteOff, desconectar e limpar o noteFilter.
    // Por agora, o oscSource conecta direto ao gainNode.

    oscSource.oscNode.connect(gainNode);
    gainNode.connect(this.masterGainNode); // Conecta ao masterGain, que vai para a cadeia de efeitos globais

    // Conectar LFO de Pitch aos sub-osciladores se for combinado, ou ao oscilador principal
    if (this.lfoGainPitch.gain.value > 0) {
        oscSource.subOscs.forEach(subOsc => this.lfoGainPitch.connect(subOsc.frequency));
    }

    oscSource.start(now);
    this.oscillators[midiNote] = {
        oscSource: oscSource,
        gainNode: gainNode,
        // Se tivéssemos filtro por nota: noteFilter: noteFilter
    };
  }

  noteOff(midiNote) {
     if (!_internalAudioEnabledMaster || !this.audioCtx || this.audioCtx.state === 'closed') return;

    if (this.oscillators[midiNote]) {
      const { oscSource, gainNode } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;
      const actualReleaseTime = this._getAutoReleaseTime(); // v57

      // Desconectar LFO de Pitch dos sub-osciladores
      if (this.lfoGainPitch.gain.value > 0) {
          oscSource.subOscs.forEach(subOsc => {
              try { this.lfoGainPitch.disconnect(subOsc.frequency1 || subOsc.frequency); } catch(e) {} // Tenta frequency1 primeiro
              try { if (subOsc.frequency2) this.lfoGainPitch.disconnect(subOsc.frequency2); } catch(e) {}
          });
      }

      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + actualReleaseTime);
      oscSource.stop(now + actualReleaseTime + 0.01);

      setTimeout(() => {
        if (this.oscillators[midiNote] && this.oscillators[midiNote].oscSource === oscSource) {
          gainNode.disconnect();
          // Se filtro por nota: this.oscillators[midiNote].noteFilter.disconnect();
          delete this.oscillators[midiNote];
        }
      }, (actualReleaseTime + 0.05) * 1000);
    }
  }

  allNotesOff() {
    console.log("Synth v57 All Notes Off (ADSR e AutoRelease aware)");
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { oscSource, gainNode } = this.oscillators[midiNote];
        const quickRelease = 0.05; // Para allNotesOff, um release rápido é geralmente preferível

        if (this.lfoGainPitch.gain.value > 0) {
            oscSource.subOscs.forEach(subOsc => {
                try { this.lfoGainPitch.disconnect(subOsc.frequency1 || subOsc.frequency); } catch(e) {}
                try { if (subOsc.frequency2) this.lfoGainPitch.disconnect(subOsc.frequency2); } catch(e) {}
            });
        }

        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);
        oscSource.stop(now + quickRelease + 0.01);

        const currentOscSource = oscSource;
        const currentGainNode = gainNode;
        const currentMidiNote = midiNote;
        setTimeout(() => {
            if (this.oscillators[currentMidiNote] && this.oscillators[currentMidiNote].oscSource === currentOscSource) {
                currentGainNode.disconnect();
                delete this.oscillators[currentMidiNote];
            }
        }, (quickRelease + 0.05) * 1000);
      }
    }
  }
}

// === Funções de Gerenciamento de Instância e Contexto (Adaptadas para v57) ===
function _ensureAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        console.log("AudioContext (v57) suspenso. Requer interação.");
      } else if (audioCtx.state === 'running') {
        console.log("AudioContext (v57) rodando.");
      }
    } catch (e) {
      console.error("Web Audio API não suportada (v57).", e);
      audioCtx = null;
    }
  }
  return audioCtx;
}

function initAudioContextOnGesture() {
  if (!_ensureAudioContext()) {
    console.error("Falha AudioContext no gesto (v57).");
    return false;
  }
  let contextResumedOrRunning = false;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('AudioContext (v57) resumido!');
      contextResumedOrRunning = true;
      if (!simpleSynthV57) {
          simpleSynthV57 = new SimpleSynthV57(audioCtx);
      }
    }).catch(e => console.error('Erro AudioContext resume (v57):', e));
  } else if (audioCtx.state === 'running') {
    contextResumedOrRunning = true;
    if (!simpleSynthV57) {
        simpleSynthV57 = new SimpleSynthV57(audioCtx);
    }
  }
  return contextResumedOrRunning;
}

function setInternalAudioEnabledState(enabled) {
    _internalAudioEnabledMaster = !!enabled;
    if (!_internalAudioEnabledMaster && simpleSynthV57) {
        simpleSynthV57.allNotesOff();
    }
}

function getSimpleSynthInstance() {
    if (!simpleSynthV57 && _ensureAudioContext()) {
        if (audioCtx.state === 'running') {
            simpleSynthV57 = new SimpleSynthV57(audioCtx);
        } else {
            console.warn("getSimpleSynthInstance (v57): AudioContext suspenso. Chame initAudioContextOnGesture.");
        }
    }
    return simpleSynthV57;
}

function getAudioContext() {
    return _ensureAudioContext();
}

console.log("synth57.js carregado.");
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
