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
    console.log("SimpleSynth v47 inicializado com AudioContext");
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
    // Uma curva mais responsiva pode ser usada aqui, ex: Math.pow(velocity / 127, 2)
    const noteGain = (velocity / 127);
    gainNode.gain.setValueAtTime(noteGain, this.audioCtx.currentTime);

    // Envelope ADSR simples (ataque rápido, sustain total, release rápido)
    const now = this.audioCtx.currentTime;
    gainNode.gain.setValueAtTime(0, now); // Inicia em 0
    gainNode.gain.linearRampToValueAtTime(noteGain, now + 0.01); // Ataque rápido

    osc.connect(gainNode);
    gainNode.connect(this.masterGainNode);
    osc.start(now);

    this.oscillators[midiNote] = { osc, gainNode, velocityGain: noteGain };
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
      const { osc, gainNode, velocityGain } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;

      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.1);

      osc.stop(now + 0.11);

      setTimeout(() => {
        if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
          gainNode.disconnect();
          delete this.oscillators[midiNote];
        }
      }, 120);
      // console.log(`Synth Note OFF: ${midiNote}`);
    }
  }

  allNotesOff() {
    console.log("Synth v47 All Notes Off");
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode } = this.oscillators[midiNote];
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now); // Pega o valor atual antes de rampar
        gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.stop(now + 0.06);

        setTimeout(() => {
            if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
                gainNode.disconnect();
                delete this.oscillators[midiNote];
            }
        }, 70);
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
