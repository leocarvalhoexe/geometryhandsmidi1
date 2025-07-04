// ==========================================================================
// SYNTHESIZER MODULE v46 - synth46.js
// ==========================================================================

let audioCtx = null;
let simpleSynth = null;
let _internalAudioEnabled = true; // Variável local para o estado, controlada por setInternalAudioEnabledState

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
    console.log("SimpleSynth v46 inicializado com AudioContext");
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
    if (!_internalAudioEnabled || !this.audioCtx || this.audioCtx.state === 'suspended') {
      // Tenta resumir o contexto de áudio se suspenso e uma nota for tocada
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().then(() => {
          console.log("AudioContext resumed by noteOn");
          this._playNote(midiNote, velocity);
        }).catch(e => console.error("Error resuming AudioContext:", e));
      }
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
    if (this.oscillators[midiNote]) {
      const { osc, gainNode, velocityGain } = this.oscillators[midiNote];
      const now = this.audioCtx.currentTime;

      // Release simples
      gainNode.gain.setValueAtTime(gainNode.gain.value, now); // Mantém o valor atual
      gainNode.gain.linearRampToValueAtTime(0, now + 0.1); // Release rápido

      osc.stop(now + 0.11); // Para o oscilador após o release

      // Limpa a referência após o release
      setTimeout(() => {
        if (this.oscillators[midiNote] && this.oscillators[midiNote].osc === osc) {
          gainNode.disconnect();
          delete this.oscillators[midiNote];
        }
      }, 120); // Tempo um pouco maior que o release + stop
      // console.log(`Synth Note OFF: ${midiNote}`);
    }
  }

  allNotesOff() {
    console.log("Synth All Notes Off");
    const now = this.audioCtx.currentTime;
    for (const midiNote in this.oscillators) {
      if (this.oscillators.hasOwnProperty(midiNote)) {
        const { osc, gainNode } = this.oscillators[midiNote];
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.05); // Release muito rápido
        osc.stop(now + 0.06);

        // Desconectar e deletar imediatamente não é seguro se houver ramps,
        // mas como estamos parando tudo, podemos agendar a limpeza.
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

// Inicialização do Contexto de Áudio (deve ser chamado por um gesto do usuário)
function initAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        // Não tentar resumir aqui, esperar por um gesto explícito
        console.log("AudioContext está suspenso. Requer interação do usuário para iniciar.");
      }
      simpleSynth = new SimpleSynth(audioCtx);
      console.log("AudioContext e SimpleSynth (v46) inicializados.");
      return true;
    } catch (e) {
      console.error("Web Audio API não é suportada neste navegador.", e);
      displayGlobalError("Web Audio API não suportada.", 10000); // displayGlobalError pode não estar definido aqui
      return false;
    }
  }
  return true; // Já inicializado
}

// Função para ser chamada em um evento de clique/tecla para garantir que o áudio comece
function initAudioContextOnGesture() {
  if (!audioCtx) {
    if (!initAudioContext()) { // Tenta inicializar se ainda não o fez
        console.error("Falha ao inicializar AudioContext no gesto.");
        return; // Sai se a inicialização falhar
    }
  }

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('AudioContext resumido com sucesso por gesto do usuário!');
      if (!simpleSynth) { // Caso raro onde audioCtx existia mas synth não
          simpleSynth = new SimpleSynth(audioCtx);
          console.log("SimpleSynth (v46) instanciado após resumo do AudioContext.");
      }
      // Aplicar configurações de volume/waveform se o synth foi criado agora
      // Esta lógica pode ser mais robusta, passando as configurações de main46.js
      const initialVolume = parseFloat(document.getElementById('audioMasterVolume')?.value) || 0.5;
      const initialWaveform = document.getElementById('audioWaveformSelect')?.value || 'sine';
      if (simpleSynth) {
          simpleSynth.setMasterVolume(initialVolume);
          simpleSynth.setWaveform(initialWaveform);
      }

    }).catch(e => console.error('Erro ao resumir AudioContext:', e));
  } else if (audioCtx && audioCtx.state === 'running') {
    console.log('AudioContext já está rodando.');
  } else {
    console.warn('AudioContext não está suspenso, mas também não está rodando, ou não foi inicializado.');
  }
}

// Exportar o que for necessário para main46.js
// Neste caso, a classe SimpleSynth e as funções de inicialização/controle.
// As variáveis audioCtx e simpleSynth serão gerenciadas internamente pelo módulo.

// Para permitir que main46.js controle o estado de internalAudioEnabled
function setInternalAudioEnabledState(enabled) {
    _internalAudioEnabled = !!enabled; // Atualiza a variável local do módulo
    if (!_internalAudioEnabled && simpleSynth) {
        simpleSynth.allNotesOff();
    }
    console.log(`Synth _internalAudioEnabled state set to: ${_internalAudioEnabled}`);
}

// Para permitir que main46.js acesse a instância do synth (se necessário)
function getSimpleSynthInstance() {
    return simpleSynth;
}

// Para permitir que main46.js acesse o audioCtx (se necessário)
function getAudioContext() {
    return audioCtx;
}

// Não há 'export default' explícito aqui, pois main46.js provavelmente
// chamará funções como initAudioContextOnGesture() e usará getSimpleSynthInstance().
// Se fosse um módulo ES6 padrão, usaríamos export { SimpleSynth, initAudioContextOnGesture, ... };
// Por enquanto, essas funções e a classe SimpleSynth estarão no escopo global quando este script for carregado.
// Para um sistema de módulos mais limpo, seriam necessárias mudanças na forma como os scripts são carregados e interagem.
// No entanto, para o propósito desta refatoração, vamos manter a estrutura simples.
// Funções e classes definidas aqui estarão acessíveis se synth46.js for carregado antes de main46.js.

console.log("synth46.js carregado.");
