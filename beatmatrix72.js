// ==========================================================================
// BEAT MATRIX MODULE v72 - beatmatrix72.js
// ==========================================================================
// Este módulo gerencia a lógica e UI da Beat Matrix integrada.

// Instância global para a Beat Matrix, acessível por main72.js
let beatMatrix = {
    // --- Estado Interno ---
    isInitialized: false,
    isPlaying: false,
    currentStep: 0,
    currentBPM: 120,
    useGlobalBPM: true, // Por padrão, sincroniza com o BPM global
    rows: 4,
    cols: 4,
    padSize: 60, // em pixels
    pads: [], // Array 2D para os elementos DOM dos pads
    padStates: [], // Array 2D para o estado (ativo/inativo) dos pads
    baseNote: 36, // Nota MIDI inicial para a grid
    timerId: null,
    midiOut: null, // Saída MIDI específica para a Beat Matrix
    synth: null, // Referência à instância do SimpleSynth de main72.js

    // Callbacks para interagir com main72.js
    getGlobalBPMCallback: null,
    sendMidiNoteOn: null,
    sendMidiNoteOff: null,
    logDebug: (message, data) => console.log("[BM_DEBUG]", message, data), // Default logger
    saveSetting: (key, value) => localStorage.setItem(`beatMatrix_${key}`, JSON.stringify(value)),
    loadSetting: (key, defaultValue) => {
        const val = localStorage.getItem(`beatMatrix_${key}`);
        return val ? JSON.parse(val) : defaultValue;
    },


    // --- Elementos DOM ---
    containerElement: null,
    controlsPanelElement: null,
    gridElement: null,
    playStopButton: null,
    midiOutputSelect: null,
    bpmSlider: null,
    bpmDisplay: null,
    globalBpmSyncButton: null,
    rowsInput: null,
    rowsValueDisplay: null,
    colsInput: null,
    colsValueDisplay: null,
    padSizeInput: null,
    padSizeValueDisplay: null,
    clearButton: null,

    // --- Métodos ---
    initialize: function(config) {
        if (this.isInitialized) return;

        this.logDebug = config.logDebugCallback || this.logDebug;
        this.getGlobalBPMCallback = config.getGlobalBPMCallback;
        this.sendMidiNoteOn = config.sendMidiNoteOnCallback;
        this.sendMidiNoteOff = config.sendMidiNoteOffCallback;
        this.synth = config.synthInstance; // Recebe a instância do synth

        if(config.savePersistentSettingCallback) this.saveSetting = config.savePersistentSettingCallback;
        if(config.loadPersistentSettingCallback) this.loadSetting = config.loadPersistentSettingCallback;


        this.logDebug("Beat Matrix v72: Inicializando...");

        // Obter referências aos elementos DOM
        this.containerElement = document.getElementById('beatMatrixContainer');
        this.controlsPanelElement = document.getElementById('beatMatrixControlsPanel');
        this.gridElement = document.getElementById('beatMatrixGrid');

        this.playStopButton = document.getElementById('bmPlayStopButton');
        this.midiOutputSelect = document.getElementById('bmMidiOutputSelect');
        this.bpmSlider = document.getElementById('bmBpmSlider');
        this.bpmDisplay = document.getElementById('bmBpmDisplay');
        this.globalBpmSyncButton = document.getElementById('bmGlobalBpmSyncButton');
        this.rowsInput = document.getElementById('bmRowsInput');
        this.rowsValueDisplay = document.getElementById('bmRowsValueDisplay');
        this.colsInput = document.getElementById('bmColsInput');
        this.colsValueDisplay = document.getElementById('bmColsValueDisplay');
        this.padSizeInput = document.getElementById('bmPadSizeInput');
        this.padSizeValueDisplay = document.getElementById('bmPadSizeValueDisplay');
        this.clearButton = document.getElementById('bmClearButton');

        if (!this.gridElement || !this.playStopButton) {
            this.logDebug("Beat Matrix v72: Erro - Elementos DOM essenciais não encontrados.");
            return;
        }

        this.loadSettings(); // Carrega configurações salvas (BPM, grid, etc.)
        this.setupEventListeners(config.availableMidiOutputs);
        this.updateGridVisuals();
        this.updateBPMDisplay();


        this.isInitialized = true;
        this.logDebug("Beat Matrix v72: Inicialização completa.");
    },

    onShow: function(globalBPM, availableMidiOutputs, synthInstance) {
        this.logDebug("Beat Matrix v72: onShow triggered.");
        this.synth = synthInstance; // Garante que temos a instância mais recente do synth
        this.updateGlobalBPMReference(globalBPM); // Atualiza BPM se estiver usando global
        this.populateMidiOutputs(availableMidiOutputs); // Atualiza lista de MIDI outputs
        this.updateGridVisuals(); // Recria a grid para garantir que está correta
        this.updateBPMDisplay();
    },

    loadSettings: function() {
        this.rows = this.loadSetting('bm_rows', 4);
        this.cols = this.loadSetting('bm_cols', 4);
        this.padSize = this.loadSetting('bm_padSize', 60);
        this.currentBPM = this.loadSetting('bm_bpm', 120);
        this.useGlobalBPM = this.loadSetting('bm_useGlobalBPM', true);
        const savedPadStates = this.loadSetting('bm_padStates', null);

        if (this.rowsInput) this.rowsInput.value = this.rows;
        if (this.rowsValueDisplay) this.rowsValueDisplay.textContent = this.rows;
        if (this.colsInput) this.colsInput.value = this.cols;
        if (this.colsValueDisplay) this.colsValueDisplay.textContent = this.cols;
        if (this.padSizeInput) this.padSizeInput.value = this.padSize;
        if (this.padSizeValueDisplay) this.padSizeValueDisplay.textContent = this.padSize;
        if (this.bpmSlider) this.bpmSlider.value = this.currentBPM;


        if (savedPadStates && savedPadStates.length === this.rows && savedPadStates[0].length === this.cols) {
            this.padStates = savedPadStates;
        } else {
            this.initializePadStates();
        }
        this.updateGlobalBPMSyncButton();
    },

    saveSettings: function() {
        this.saveSetting('bm_rows', this.rows);
        this.saveSetting('bm_cols', this.cols);
        this.saveSetting('bm_padSize', this.padSize);
        this.saveSetting('bm_bpm', this.currentBPM);
        this.saveSetting('bm_useGlobalBPM', this.useGlobalBPM);
        this.saveSetting('bm_padStates', this.padStates);
        this.saveSetting('bm_midiOutputId', this.midiOut ? this.midiOut.id : null);
    },

    initializePadStates: function() {
        this.padStates = [];
        for (let r = 0; r < this.rows; r++) {
            this.padStates[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.padStates[r][c] = false; // false = inativo
            }
        }
    },

    populateMidiOutputs: function(availableMidiOutputs) {
        if (!this.midiOutputSelect || !availableMidiOutputs) return;
        const previouslySelectedId = this.midiOut ? this.midiOut.id : this.loadSetting('bm_midiOutputId', null);
        this.midiOutputSelect.innerHTML = '';

        if (availableMidiOutputs.size === 0) {
            this.midiOutputSelect.add(new Option("Nenhuma saída MIDI", ""));
            this.midiOut = null;
            return;
        }

        availableMidiOutputs.forEach((port, id) => {
            const option = document.createElement('option');
            option.value = id;
            option.text = port.name;
            this.midiOutputSelect.appendChild(option);
        });

        if (previouslySelectedId && availableMidiOutputs.has(previouslySelectedId)) {
            this.midiOutputSelect.value = previouslySelectedId;
        } else if (this.midiOutputSelect.options.length > 0) {
            this.midiOutputSelect.selectedIndex = 0;
        }
        this.midiOut = availableMidiOutputs.get(this.midiOutputSelect.value) || null;
        if(this.midiOut) this.logDebug("Beat Matrix MIDI Output set to:", this.midiOut.name);
    },


    setupEventListeners: function(availableMidiOutputs) {
        this.populateMidiOutputs(availableMidiOutputs);

        this.playStopButton.addEventListener('click', () => this.togglePlayback());
        this.midiOutputSelect.addEventListener('change', (event) => {
            const selectedId = event.target.value;
            this.midiOut = availableMidiOutputs.get(selectedId) || null;
            if(this.midiOut) this.logDebug("Beat Matrix MIDI Output changed to:", this.midiOut.name);
            this.saveSettings();
        });

        this.bpmSlider.addEventListener('input', (event) => {
            this.currentBPM = parseInt(event.target.value);
            this.useGlobalBPM = false; // Mover o slider desativa a sincronia global
            this.updateBPMDisplay();
            this.updateGlobalBPMSyncButton();
            if (this.isPlaying) this.restartSequencerTimer();
            this.saveSettings();
        });

        this.globalBpmSyncButton.addEventListener('click', () => {
            this.useGlobalBPM = !this.useGlobalBPM;
            if (this.useGlobalBPM && this.getGlobalBPMCallback) {
                this.currentBPM = this.getGlobalBPMCallback();
            }
            this.updateBPMDisplay();
            this.updateGlobalBPMSyncButton();
            if (this.isPlaying) this.restartSequencerTimer();
            this.saveSettings();
        });

        this.rowsInput.addEventListener('input', (e) => this.handleGridResize('rows', parseInt(e.target.value)));
        this.colsInput.addEventListener('input', (e) => this.handleGridResize('cols', parseInt(e.target.value)));
        this.padSizeInput.addEventListener('input', (e) => this.handleGridResize('padSize', parseInt(e.target.value)));
        this.clearButton.addEventListener('click', () => this.clearGrid());
    },

    handleGridResize: function(type, value) {
        let oldRows = this.rows;
        let oldCols = this.cols;

        if (type === 'rows') {
            this.rows = Math.max(1, Math.min(8, value));
            if(this.rowsValueDisplay) this.rowsValueDisplay.textContent = this.rows;
        } else if (type === 'cols') {
            this.cols = Math.max(1, Math.min(16, value));
            if(this.colsValueDisplay) this.colsValueDisplay.textContent = this.cols;
        } else if (type === 'padSize') {
            this.padSize = Math.max(20, Math.min(100, value));
            if(this.padSizeValueDisplay) this.padSizeValueDisplay.textContent = this.padSize;
        }

        // Preservar estados dos pads ao redimensionar
        const newPadStates = [];
        for (let r = 0; r < this.rows; r++) {
            newPadStates[r] = [];
            for (let c = 0; c < this.cols; c++) {
                if (r < oldRows && c < oldCols && this.padStates[r] && this.padStates[r][c] !== undefined) {
                    newPadStates[r][c] = this.padStates[r][c];
                } else {
                    newPadStates[r][c] = false;
                }
            }
        }
        this.padStates = newPadStates;

        if (this.currentStep >= this.cols) { // Ajusta o step atual se necessário
            this.currentStep = 0;
        }

        this.updateGridVisuals();
        this.saveSettings();
    },

    updateGridVisuals: function() {
        if (!this.gridElement) return;
        this.gridElement.innerHTML = '';
        this.pads = [];

        this.gridElement.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;
        this.gridElement.style.gap = '5px';

        for (let r = 0; r < this.rows; r++) {
            this.pads[r] = [];
            for (let c = 0; c < this.cols; c++) {
                const padElement = document.createElement('div');
                padElement.classList.add('beat-matrix-pad');
                padElement.style.width = `${this.padSize}px`;
                padElement.style.height = `${this.padSize}px`;
                // padElement.textContent = `${r + 1}-${c + 1}`; // Opcional: mostrar índice

                if (this.padStates[r][c]) {
                    padElement.classList.add('active');
                }

                padElement.addEventListener('click', () => this.togglePadState(r, c));
                this.gridElement.appendChild(padElement);
                this.pads[r][c] = padElement;
            }
        }
    },

    togglePadState: function(row, col) {
        this.padStates[row][col] = !this.padStates[row][col];
        this.pads[row][col].classList.toggle('active');
        // Se estiver tocando e o pad for ativado na coluna atual, tocar imediatamente (opcional)
        if (this.isPlaying && this.padStates[row][col] && col === this.currentStep) {
            this.playNoteForPad(row, col);
        }
        this.saveSettings();
    },

    clearGrid: function() {
        this.initializePadStates();
        this.updateGridVisuals();
        this.saveSettings();
        this.logDebug("Beat Matrix grid cleared.");
    },

    updateBPMDisplay: function() {
        if (this.useGlobalBPM && this.getGlobalBPMCallback) {
            this.currentBPM = this.getGlobalBPMCallback();
        }
        if (this.bpmDisplay) this.bpmDisplay.textContent = this.currentBPM;
        if (this.bpmSlider) this.bpmSlider.value = this.currentBPM;
        this.bpmSlider.disabled = this.useGlobalBPM;
    },

    updateGlobalBPMSyncButton: function() {
        if (this.globalBpmSyncButton) {
            this.globalBpmSyncButton.textContent = this.useGlobalBPM ? "Usando Global (Desativar)" : "Sincronizar com Global";
            this.globalBpmSyncButton.classList.toggle('active', this.useGlobalBPM);
        }
    },

    updateGlobalBPMReference: function(newGlobalBPM) {
        if (this.useGlobalBPM) {
            this.currentBPM = newGlobalBPM;
            this.updateBPMDisplay();
            if (this.isPlaying) {
                this.restartSequencerTimer();
            }
        }
    },

    togglePlayback: function() {
        this.isPlaying = !this.isPlaying;
        this.playStopButton.textContent = this.isPlaying ? "Stop Beat Matrix" : "Play Beat Matrix";

        if (this.isPlaying) {
            if (this.cols === 0) { // Não pode tocar sem colunas
                this.isPlaying = false;
                this.playStopButton.textContent = "Play Beat Matrix";
                this.logDebug("Beat Matrix: Playback não iniciado, 0 colunas.");
                return;
            }
            this.currentStep = 0; // Começa do início
            this.highlightCurrentStep();
            this.step(); // Toca o primeiro passo imediatamente
            this.restartSequencerTimer();
            this.logDebug("Beat Matrix: Playback iniciado.");
        } else {
            if (this.timerId) clearInterval(this.timerId);
            this.timerId = null;
            this.clearStepHighlight();
            this.turnOffAllNotes(true); // Para notas MIDI e do synth
            this.logDebug("Beat Matrix: Playback parado.");
        }
        // Notificar main.js sobre a mudança de estado de play/pause da BM (se necessário)
    },

    restartSequencerTimer: function() {
        if (this.timerId) clearInterval(this.timerId);
        if (this.isPlaying && this.cols > 0) {
            const interval = 60000 / this.currentBPM / (this.cols > 0 ? (this.cols / this.cols) : 1); // Ajuste para semínimas (4 steps por batida se cols for múltiplo de 4)
            // Para um sequenciador de 16 passos onde cada passo é uma semicolcheia:
            // Intervalo por passo = (60000 / BPM) / 4
            const stepInterval = (60000 / this.currentBPM) / 4; // Assumindo 16ths
            if (stepInterval > 0 && isFinite(stepInterval)) {
                this.timerId = setInterval(() => this.step(), stepInterval);
            } else {
                this.logDebug("Beat Matrix: Intervalo de passo inválido. Playback não iniciado/continuado.");
                if (this.isPlaying) this.togglePlayback(); // Para o playback se o intervalo for ruim
            }
        }
    },

    step: function() {
        if (!this.isPlaying || this.cols === 0) return;

        this.clearStepHighlight();
        this.currentStep = (this.currentStep + 1) % this.cols;
        this.highlightCurrentStep();

        for (let r = 0; r < this.rows; r++) {
            if (this.padStates[r][this.currentStep]) {
                this.playNoteForPad(r, this.currentStep);
            }
        }
    },

    playNoteForPad: function(row, col) {
        const note = this.baseNote + row; // Exemplo simples: cada linha é uma nota diferente
        const velocity = 100;
        const durationMs = 150; // Duração curta da nota

        if (this.sendMidiNoteOn) {
            this.sendMidiNoteOn(note, velocity, 9, -1, 'beatmatrix'); // Canal MIDI 10 (índice 9)
        }

        // Parar a nota após a duração
        setTimeout(() => {
            if (this.sendMidiNoteOff) {
                this.sendMidiNoteOff(note, 9, -1, 'beatmatrix');
            }
        }, durationMs);
    },

    highlightCurrentStep: function() {
        for (let r = 0; r < this.rows; r++) {
            if (this.pads[r] && this.pads[r][this.currentStep]) {
                this.pads[r][this.currentStep].classList.add('sequencer-column-indicator');
            }
        }
    },

    clearStepHighlight: function() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.pads[r] && this.pads[r][c]) {
                    this.pads[r][c].classList.remove('sequencer-column-indicator');
                }
            }
        }
    },

    turnOffAllNotes: function(stopAudioSynth = true) {
        // Este método é chamado para parar notas MIDI que podem estar soando.
        // O synth interno é gerenciado por `simpleSynth.allNotesOff()` em main.js
        // quando a fonte de áudio muda ou o playback global para.
        // Aqui, focamos em enviar MIDI Note Offs se necessário.
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.padStates[r][c]) { // Se o pad estava ativo
                    const note = this.baseNote + r;
                     if (this.sendMidiNoteOff) {
                        this.sendMidiNoteOff(note, 9, -1, 'beatmatrix');
                    }
                }
            }
        }
        if (stopAudioSynth && this.synth && typeof mainGetCurrentAudioSource === 'function' && mainGetCurrentAudioSource() === 'beatmatrix') {
            this.synth.allNotesOff(); // Se o synth estiver ativo para a BM, para tudo
        }
        this.logDebug("Beat Matrix: Todas as notas (MIDI) paradas.");
    }
};

// Função global para main72.js poder inicializar a Beat Matrix
// Esta função deve ser chamada após o DOM estar carregado e main72.js ter suas referências.
function initializeBeatMatrix(config) {
    if (beatMatrix && !beatMatrix.isInitialized) {
        beatMatrix.initialize(config);
    }
}

// Função para main72.js informar qual é a instância do synth
function setBeatMatrixSynth(synthInstance) {
    if (beatMatrix) {
        beatMatrix.synth = synthInstance;
    }
}

// Função para main72.js popular as saídas MIDI da Beat Matrix
function populateBeatMatrixMidiOutputSelect(availableMidiOutputs) {
    if (beatMatrix && beatMatrix.isInitialized) {
        beatMatrix.populateMidiOutputs(availableMidiOutputs);
    } else if (beatMatrix && document.getElementById('bmMidiOutputSelect')) {
        // Se não totalmente inicializado, mas o select existe, tenta popular.
        // Isso pode acontecer se main72 carregar as saídas MIDI antes da BM estar totalmente pronta.
        const select = document.getElementById('bmMidiOutputSelect');
        const currentVal = select.value;
        select.innerHTML = '';
         if (availableMidiOutputs.size === 0) {
            select.add(new Option("Nenhuma saída MIDI", ""));
        } else {
            availableMidiOutputs.forEach((port, id) => {
                const option = document.createElement('option');
                option.value = id;
                option.text = port.name;
                select.appendChild(option);
            });
            if (currentVal && availableMidiOutputs.has(currentVal)) {
                select.value = currentVal;
            } else if (select.options.length > 0) {
                select.selectedIndex = 0;
            }
        }
        if(beatMatrix.midiOutputSelect === null) beatMatrix.midiOutputSelect = select; // Atribui se não foi pego antes
        if(beatMatrix.midiOut === null && select.value) beatMatrix.midiOut = availableMidiOutputs.get(select.value) || null;
    }
}


console.log("beatmatrix72.js carregado.");
