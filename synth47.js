// ==========================================================================
// SYNTHESIZER MODULE v47 - synth47.js
// ==========================================================================

let audioCtx = null;
let simpleSynth = null; 
// A variável internalAudioEnabled foi removida daqui.
// O estado será gerenciado por main47.js e passado para as funções do synth se necessário,
// ou as funções do synth (noteOn, noteOff) serão chamadas condicionalmente por main47.js.
// Para manter a compatibilidade com a função setInternalAudioEnabledState que main47.js pode chamar,
// vamos mantê-la, mas ela não controlará mais diretamente o comportamento de noteOn/noteOff DENTRO deste módulo.
let _internalAudioEnabledMaster = true; // Variável interna para rastrear o estado global passado por main.

// Função para converter nota MIDI para frequência
function midiToFrequency(midiNote) {
  if (midiNote < 0 || midiNote > 127) return 0;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

class SimpleSynth {
  constructor(audioContext) {
    this.audioCtx = audioContext;
    this.oscillators = {}; // Para rastrear múltiplos osciladores (polifonia)
    this.masterGainNode = this.audioCtx.createGain();
    this.masterGainNode.gain.value = 0.5; // Volume master padrão
    this.masterGainNode.connect(this.audioCtx.destination);
    this.waveform = 'sine'; // Forma de onda padrão

    // ADSR Properties
    this.attackTime = 0.01;
    this.decayTime = 0.1;
    this.sustainLevel = 0.7;
    this.releaseTime = 0.2;

    // Distortion (WaveShaper) Properties
    this.distortionNode = this.audioCtx.createWaveShaper();
    this.distortionNode.oversample = '4x'; // '2x' ou 'none' também são opções
    this.distortionAmount = 0; // 0 = sem distorção, aumenta para mais distorção
    this._updateDistortionCurve(); // Inicializa a curva

    // Conexão: distortionNode -> masterGainNode
    this.distortionNode.connect(this.masterGainNode);

    console.log("SimpleSynth v47 inicializado com AudioContext, ADSR padrão e DistortionNode.");
  }

  _updateDistortionCurve() {
    const k = typeof this.distortionAmount === 'number' ? this.distortionAmount : 0;
    const n_samples = 44100; // Número de amostras para a curva, pode ser ajustado
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;

    if (k === 0) { // Sem distorção, curva linear
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2 / n_samples) - 1; // Mapeia i para o intervalo [-1, 1]
            curve[i] = x;
        }
    } else {
        // Fórmula de distorção (exemplo simples, pode ser mais complexa)
        // Esta é uma curva de saturação suave, k controla a "dureza" da saturação.
        // Valores maiores de k resultarão em um hard clipping mais cedo.
        // Para k pequenos, a curva é quase linear.
        const effectiveK = k * 5; // Amplifica o efeito do 'amount' para que 0-100 seja mais perceptível
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2 / n_samples) - 1;
            curve[i] = (Math.PI/2 + effectiveK) * x / (Math.PI/2 + effectiveK * Math.abs(x));
            // Normaliza para garantir que não exceda [-1, 1] se a fórmula puder
            curve[i] = Math.max(-1, Math.min(1, curve[i]));
        }
    }
    this.distortionNode.curve = curve;
    // console.log(`Distortion curve updated for amount: ${this.distortionAmount}`);
  }

  setDistortion(amount) { // amount esperado de 0 a 100 (ou outra escala definida na UI)
    this.distortionAmount = parseFloat(amount);
    if (isNaN(this.distortionAmount)) this.distortionAmount = 0;
    this.distortionAmount = Math.max(0, Math.min(100, this.distortionAmount)); // Clamp 0-100
    this._updateDistortionCurve();
    console.log(`Synth Distortion Amount set to: ${this.distortionAmount}`);
  }

  // ADSR Setters
  setAttack(time) {
    this.attackTime = Math.max(0.001, time); // Evitar attack zero ou negativo
    console.log(`Synth Attack Time set to: ${this.attackTime}s`);
  }

  setDecay(time) {
    this.decayTime = Math.max(0.001, time); // Evitar decay zero ou negativo
    console.log(`Synth Decay Time set to: ${this.decayTime}s`);
  }

  setSustain(level) {
    this.sustainLevel = Math.max(0, Math.min(1, level)); // Clamp 0-1
    console.log(`Synth Sustain Level set to: ${this.sustainLevel}`);
  }

  setRelease(time) {
    this.releaseTime = Math.max(0.001, time); // Evitar release zero ou negativo
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
    // A verificação de internalAudioEnabled agora é feita pelo chamador (main47.js)
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(() => {
        console.log("AudioContext resumed by noteOn in synth47.js");
        this._playNote(midiNote, velocity);
      }).catch(e => console.error("Error resuming AudioContext in synth47.js:", e));
      return; // Retorna para evitar tocar a nota duas vezes ou com o contexto ainda suspenso
    }
    // Se _internalAudioEnabledMaster for false (definido por setInternalAudioEnabledState),
    // não devemos tocar a nota, mesmo que main47.js chame esta função.
    // Isso fornece uma camada extra de controle, embora a lógica principal esteja em main47.js.
    if (!_internalAudioEnabledMaster) {
        // console.log("noteOn called in synth47.js, but _internalAudioEnabledMaster is false.");
        return;
    }
    this._playNote(midiNote, velocity);
  }

  _playNote(midiNote, velocity) {
    const freq = midiToFrequency(midiNote);
    if (freq === 0) return;

    // Se já existe um oscilador para esta nota, pare-o antes de criar um novo
    if (this.oscillators[midiNote]) {
      this.oscillators[midiNote].osc.stop(this.audioCtx.currentTime);
      this.oscillators[midiNote].gainNode.disconnect();
      delete this.oscillators[midiNote];
    }

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    osc.type = this.waveform;
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

    // Mapeia a velocidade MIDI (0-127) para ganho (0-1)
    const velocityGain = (velocity / 127);
    const peakGain = velocityGain; // O pico do attack será o velocityGain
    const sustainGain = peakGain * this.sustainLevel;

    const now = this.audioCtx.currentTime;
    gainNode.gain.cancelScheduledValues(now); // Cancela eventos anteriores para esta nota
    gainNode.gain.setValueAtTime(0, now); // Inicia em 0 (silêncio)

    // Attack
    gainNode.gain.linearRampToValueAtTime(peakGain, now + this.attackTime);

    // Decay
    // Se sustainLevel for 1.0, decayTime efetivamente não tem efeito visível no nível,
    // mas a rampa ainda é agendada.
    gainNode.gain.linearRampToValueAtTime(sustainGain, now + this.attackTime + this.decayTime);

    osc.connect(gainNode);
    // Conexão alterada: gainNode -> distortionNode -> masterGainNode
    // A conexão distortionNode -> masterGainNode já foi feita no construtor.
    gainNode.connect(this.distortionNode);
    osc.start(now);

    this.oscillators[midiNote] = { osc, gainNode }; // velocityGain não é mais armazenado aqui
    // console.log(`Synth Note ON: ${midiNote}, Freq: ${freq.toFixed(2)}, VelGain: ${noteGain.toFixed(2)}`);
  }

  noteOff(midiNote) {
    // A verificação de _internalAudioEnabledMaster é feita implicitamente, pois noteOff só deve ser
    // chamada por main47.js se o áudio interno estiver ativo.
    // No entanto, para segurança, podemos adicionar uma verificação se _internalAudioEnabledMaster for false.
    if (!_internalAudioEnabledMaster && this.oscillators[midiNote]) {
        // console.log(`Synth noteOff(${midiNote}) called but _internalAudioEnabledMaster is false. Forcing stop.`);
         // Força a parada e limpeza mesmo se o master estiver desabilitado, para evitar notas presas se o estado mudar.
        const { osc, gainNode } = this.oscillators[midiNote];
        const now = this.audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now); // Silencia imediatamente
        osc.stop(now);
        gainNode.disconnect();
        delete this.oscillators[midiNote];
        return;
    }

    if (this.oscillators[midiNote]) {
      const { osc, gainNode } = this.oscillators[midiNote]; // velocityGain não é mais necessário aqui
      const now = this.audioCtx.currentTime;
      
      // Release phase
      gainNode.gain.cancelScheduledValues(now); // Cancela decay/sustain
      gainNode.gain.setValueAtTime(gainNode.gain.value, now); // Mantém o valor atual do ganho
      gainNode.gain.linearRampToValueAtTime(0, now + this.releaseTime); // Rampa para 0 durante o releaseTime

      osc.stop(now + this.releaseTime + 0.01); // Adiciona um pequeno buffer para garantir que o som pare após o release
      
      // Limpa o oscilador após o tempo de release
      // Usamos um timeout para garantir que o oscilador seja removido da lista
      // somente após ter tido tempo de parar completamente.
      setTimeout(() => {
        if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
          gainNode.disconnect(); // Desconecta o gainNode para liberar recursos
          delete this.oscillators[midiNote];
        }
      }, (this.releaseTime + 0.05) * 1000); // +50ms de margem
      // console.log(`Synth Note OFF: ${midiNote}, Release Time: ${this.releaseTime}s`);
    }
  }

  allNotesOff() {
    console.log("Synth v47 All Notes Off (ADSR aware)");
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode } = this.oscillators[midiNote];
        gainNode.gain.cancelScheduledValues(now);
        // Em vez de um release rápido fixo, idealmente respeitaria this.releaseTime,
        // mas para um "panic" (allNotesOff), um release rápido é geralmente preferível.
        // Vamos usar um release curto e fixo aqui para garantir que as notas parem rapidamente.
        const quickRelease = 0.05;
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + quickRelease);
        osc.stop(now + quickRelease + 0.01);
        
        // Agendamos a limpeza do oscilador
        // É importante capturar 'osc' e 'gainNode' em um closure se usarmos setTimeout dentro de um loop
        // ou garantir que a referência correta seja usada.
        // Neste caso, o setTimeout é para cada nota individualmente.
        const currentOsc = osc;
        const currentGainNode = gainNode;
        const currentMidiNote = midiNote; // Captura o midiNote para o delete
        setTimeout(() => {
            // Verifica se o oscilador ainda é o mesmo, pois um novo noteOn pode ter substituído
            if (this.oscillators[currentMidiNote] && this.oscillators[currentMidiNote].osc === currentOsc) {
                currentGainNode.disconnect();
                delete this.oscillators[currentMidiNote];
            }
        }, (quickRelease + 0.05) * 1000);
      }
    }
  }
}

// Inicialização do Contexto de Áudio
function initAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        console.log("AudioContext (v47) está suspenso. Requer interação do usuário para iniciar.");
      }
      simpleSynth = new SimpleSynth(audioCtx); // Instancia o synth
      console.log("AudioContext e SimpleSynth (v47) inicializados.");
      return true;
    } catch (e) {
      console.error("Web Audio API não é suportada neste navegador (v47).", e);
      // displayGlobalError não está definido aqui, main47.js deve lidar com isso se necessário
      return false;
    }
  }
  return true; 
}

// Função para ser chamada por main47.js em um evento de clique/tecla
function initAudioContextOnGesture() {
  if (!audioCtx) {
    if (!initAudioContext()) { 
        console.error("Falha ao inicializar AudioContext no gesto (v47).");
        return false; 
    }
  }
  
  let resumed = false;
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('AudioContext (v47) resumido com sucesso por gesto do usuário!');
      if (!simpleSynth) { 
          simpleSynth = new SimpleSynth(audioCtx);
          console.log("SimpleSynth (v47) instanciado após resumo do AudioContext.");
      }
      // Aplicar configurações de volume/waveform que podem ter sido definidas em main47.js antes do resumo
      // Esta parte é crucial se main47.js já tentou definir volume/waveform
      const mainApp = window; // Assumindo que as funções de main47.js estão no escopo global
      if (mainApp.audioMasterVolumeSlider && mainApp.simpleSynth) {
          const currentVolume = parseFloat(mainApp.audioMasterVolumeSlider.value);
          mainApp.simpleSynth.setMasterVolume(currentVolume);
      }
      if (mainApp.audioWaveformSelect && mainApp.simpleSynth) {
          const currentWaveform = mainApp.audioWaveformSelect.value;
          mainApp.simpleSynth.setWaveform(currentWaveform);
      }
      resumed = true;
    }).catch(e => {
        console.error('Erro ao resumir AudioContext (v47):', e);
        resumed = false;
    });
  } else if (audioCtx && audioCtx.state === 'running') {
    console.log('AudioContext (v47) já está rodando.');
    resumed = true;
  } else {
    console.warn('AudioContext (v47) não está suspenso, mas também não está rodando, ou não foi inicializado.');
    resumed = false;
  }
  return resumed; // Retorna se o contexto está pronto ou foi resumido
}

// Para permitir que main47.js controle o estado de _internalAudioEnabledMaster
function setInternalAudioEnabledState(enabled) {
    _internalAudioEnabledMaster = !!enabled;
    if (!_internalAudioEnabledMaster && simpleSynth) {
        simpleSynth.allNotesOff(); // Para todas as notas se o áudio for desabilitado globalmente
    }
    console.log(`Synth v47 _internalAudioEnabledMaster state set to: ${_internalAudioEnabledMaster}`);
}

// Para permitir que main47.js acesse a instância do synth
function getSimpleSynthInstance() {
    // Garante que o contexto de áudio seja inicializado se ainda não for,
    // mas a instanciação principal deve vir de um gesto.
    if (!audioCtx) initAudioContext(); 
    return simpleSynth;
}

// Para permitir que main47.js acesse o audioCtx
function getAudioContext() {
    if (!audioCtx) initAudioContext();
    return audioCtx;
}

// Funções e classes definidas aqui estarão acessíveis globalmente
// se synth47.js for carregado antes de main47.js.

console.log("synth47.js carregado.");
