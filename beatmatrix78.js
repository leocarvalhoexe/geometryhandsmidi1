// ==========================================================================
// BEAT MATRIX MODULE v74 - beatmatrix74.js
// ==========================================================================
// Este módulo gerencia a lógica e UI da Beat Matrix avançada com múltiplas barras.

let beatMatrix = {
    // --- Estado Interno ---
    isInitialized: false,
    // Barra Principal (anteriormente a única barra em v73)
    isPlaying: false,      // Renomeado para isPlayingMain ou similar se necessário para clareza
    currentStep: 0,        // Para a barra principal
    currentBPM: 120,       // BPM da barra principal (pode ser sincronizado ou local)
    useGlobalBPM: true,    // Sincronia da barra principal com BPM global
    timerId: null,         // Timer da barra principal

    // Barra Secundária (nova em v74, baseada em beatmatrixexe_v77.js)
    isPlayingSecondary: false,
    currentPositionSecondary: 0,
    bpmSecondary: 120,          // BPM base da barra secundária (antes da sincronização)
    effectiveBpmSecondary: 120, // BPM real da barra secundária após sincronização
    timerIdSecondary: null,
    secondaryNoteOffset: 12,
    secondaryBarOrientation: 'vertical',
    secondaryBarDirection: 'c2b', // 'cima para baixo' por padrão para vertical
    secondarySyncSpeedDirection: 'up',
    secondarySyncFactor: 2,

    // Barras Extras (array de objetos, cada um com seu estado)
    extraBars: [],
    nextExtraBarId: 0,

    // Configurações da Grid
    rows: 4,
    cols: 4,
    padSize: 60,
    pads: [],           // Array 2D para elementos DOM dos pads
    padStates: [],      // Array 2D para estado (ativo/inativo) dos pads
    baseNote: 36,

    // MIDI e Synth
    midiOut: null, // Saída MIDI principal da BM (pode ser usada por todas as barras ou ter específicas)
    availableMidiOutputs: new Map(), // Cache das saídas MIDI disponíveis
    synth: null,

    // Callbacks e Configurações
    getGlobalBPMCallback: null,
    sendMidiNoteOn: null,
    sendMidiNoteOff: null,
    logDebug: (message, data) => console.log("[BM74_DEBUG]", message, data),
    saveSetting: (key, value) => localStorage.setItem(`beatMatrix74_${key}`, JSON.stringify(value)),
    loadSetting: (key, defaultValue) => {
        const val = localStorage.getItem(`beatMatrix74_${key}`);
        return val ? JSON.parse(val) : defaultValue;
    },

    // --- Elementos DOM (referências passadas por main74.js ou obtidas aqui) ---
    // (Muitos destes serão preenchidos pelo objeto `config.controls` em `initialize`)
    domElements: {
        containerElement: null,
        controlsPanelElement: null,
        gridElement: null,
        // Barra Principal
        playStopButton: null,
        bpmDisplay: null,
        horizontalBpmFaderSVG: null,
        faderThumb: null, // Thumb do fader principal
        bpmTextDisplay: null, // Texto no fader principal
        globalBpmSyncButton: null,
        midiOutputSelect: null, // Select MIDI principal da BM
        // Barra Secundária
        playStopButtonSecondary: null,
        bpmDisplaySecondary: null,
        secondaryBpmFaderSVG: null,
        secondaryFaderThumb: null,
        secondaryBpmTextDisplay: null,
        secondaryNoteOffsetInput: null,
        orientationBar2Select: null,
        directionBar2Select: null,
        // Controles de Sincronização da Barra Secundária (se mantidos como em v77)
        // secondarySyncSpeedDirectionInput: null, (precisa ser adicionado a index74.html se for usado)
        // secondarySyncFactorInput: null, (precisa ser adicionado a index74.html se for usado)
        // Grid
        rowsInput: null,
        rowsValueDisplay: null,
        colsInput: null,
        colsValueDisplay: null,
        padSizeInput: null,
        padSizeValueDisplay: null,
        clearButton: null,
        // Barras Extras
        addExtraBarButton: null,
        extraBarsControlsContainer: null,
    },
    // Constantes para Faders SVG (de beatmatrixexe_v77.js)
    H_BPM_FADER_TRACK_X: 10,
    H_BPM_FADER_TRACK_WIDTH: 230,
    H_BPM_FADER_THUMB_WIDTH: 20,
    MIN_BPM_FADER: 30, // Limites para os faders SVG
    MAX_BPM_FADER: 300,


    // --- Métodos ---
    initialize: function(config) {
        if (this.isInitialized) return;

        this.logDebug = config.logDebugCallback || this.logDebug;
        this.getGlobalBPMCallback = config.getGlobalBPMCallback;
        this.sendMidiNoteOn = config.sendMidiNoteOnCallback;
        this.sendMidiNoteOff = config.sendMidiNoteOffCallback;
        // Ensure synth instance is correctly passed and assigned
        if (config.synthInstance) {
            this.synth = config.synthInstance;
            this.logDebug("Beat Matrix v74: synthInstance received.", this.synth);
        } else {
            this.logDebug("Beat Matrix v74: synthInstance NOT received in config.");
        }

        if(config.savePersistentSettingCallback) this.saveSetting = config.savePersistentSettingCallback;
        if(config.loadPersistentSettingCallback) this.loadSetting = config.loadPersistentSettingCallback;

        this.logDebug("Beat Matrix v74: Inicializando...");

        // Atribuir elementos DOM a partir da configuração
        if (config.controls) {
            for (const key in config.controls) {
                if (this.domElements.hasOwnProperty(key)) {
                    this.domElements[key] = config.controls[key];
                } else {
                    // Se main74.js passar um elemento não esperado, apenas logar.
                    this.logDebug(`Elemento DOM desconhecido passado na configuração: ${key}`);
                }
            }
        }
        // Obter referências que podem não ter sido passadas explicitamente
        this.domElements.containerElement = document.getElementById('beatMatrixContainer');
        this.domElements.controlsPanelElement = document.getElementById('beatMatrixControlsPanel');
        this.domElements.gridElement = document.getElementById('grid'); // ID de v77
        this.domElements.faderThumb = document.getElementById('faderThumb');
        this.domElements.bpmTextDisplay = document.getElementById('bpmTextDisplay');
        this.domElements.secondaryFaderThumb = document.getElementById('secondaryFaderThumb');
        this.domElements.secondaryBpmTextDisplay = document.getElementById('secondaryBpmTextDisplay');
        // Adicionar outros elementos que faltam se necessário


        if (!this.domElements.gridElement || !this.domElements.playStopButton || !this.domElements.playStopButtonSecondary) {
            this.logDebug("Beat Matrix v74: Erro - Elementos DOM essenciais não encontrados.", this.domElements);
            return;
        }

        this.loadSettings(); // Carrega configurações salvas
        this.setupEventListeners();
        this.updateGridVisuals(); // Cria a grid inicial
        this.updateAllBPMDisplaysAndFaders(); // Atualiza todos os displays e faders de BPM

        this.isInitialized = true;
        this.logDebug("Beat Matrix v74: Inicialização completa.");
    },

    onShow: function(globalBPM, availableMidiOutputs, synthInstance) {
        this.logDebug("Beat Matrix v74: onShow triggered.");
        this.synth = synthInstance;
        this.availableMidiOutputs = availableMidiOutputs || new Map();
        this.updateGlobalBPMReference(globalBPM);
        this.populateMidiOutputs();
        this.updateGridVisuals(); // Garante que a grid está correta
        this.updateAllBPMDisplaysAndFaders();
        // Se houver barras extras, garantir que seus controles sejam recriados/atualizados
        this.recreateExtraBarControlsDOM();
    },

    loadSettings: function() {
        this.rows = this.loadSetting('bm_rows', 4);
        this.cols = this.loadSetting('bm_cols', 4);
        this.padSize = this.loadSetting('bm_padSize', 60);

        // Barra Principal
        this.currentBPM = this.loadSetting('bm_main_bpm', 120);
        this.useGlobalBPM = this.loadSetting('bm_main_useGlobalBPM', true);

        // Barra Secundária
        this.bpmSecondary = this.loadSetting('bm_secondary_bpm', 120);
        this.secondaryNoteOffset = this.loadSetting('bm_secondary_noteOffset', 12);
        this.secondaryBarOrientation = this.loadSetting('bm_secondary_orientation', 'vertical');
        this.secondaryBarDirection = this.loadSetting('bm_secondary_direction', this.secondaryBarOrientation === 'vertical' ? 'c2b' : 'e2d');
        this.secondarySyncSpeedDirection = this.loadSetting('bm_secondary_syncSpeed', 'up');
        this.secondarySyncFactor = this.loadSetting('bm_secondary_syncFactor', 2);

        // Barras Extras
        const loadedExtraBars = this.loadSetting('bm_extraBars', []);
        this.extraBars = Array.isArray(loadedExtraBars) ? loadedExtraBars : [];
        this.nextExtraBarId = this.loadSetting('bm_nextExtraBarId', 0);


        const savedPadStates = this.loadSetting('bm_padStates', null);
        if (savedPadStates && savedPadStates.length === this.rows && savedPadStates[0] && savedPadStates[0].length === this.cols) {
            this.padStates = savedPadStates;
        } else {
            this.initializePadStates();
        }

        // Atualizar UI com valores carregados
        if (this.domElements.rowsInput) this.domElements.rowsInput.value = this.rows;
        if (this.domElements.rowsValueDisplay) this.domElements.rowsValueDisplay.textContent = this.rows;
        if (this.domElements.colsInput) this.domElements.colsInput.value = this.cols;
        if (this.domElements.colsValueDisplay) this.domElements.colsValueDisplay.textContent = this.cols;
        if (this.domElements.padSizeInput) this.domElements.padSizeInput.value = this.padSize;
        if (this.domElements.padSizeValueDisplay) this.domElements.padSizeValueDisplay.textContent = this.padSize;

        if (this.domElements.secondaryNoteOffsetInput) this.domElements.secondaryNoteOffsetInput.value = this.secondaryNoteOffset;
        if (this.domElements.orientationBar2Select) this.domElements.orientationBar2Select.value = this.secondaryBarOrientation;
        this.updateSecondaryDirectionOptions(); // Atualiza opções e valor do select de direção secundário
        // if (this.domElements.secondarySyncSpeedDirectionInput) this.domElements.secondarySyncSpeedDirectionInput.value = this.secondarySyncSpeedDirection;
        // if (this.domElements.secondarySyncFactorInput) this.domElements.secondarySyncFactorInput.value = this.secondarySyncFactor;

        this.updateGlobalBPMSyncButtonVisuals();
    },

    saveSettings: function() {
        this.saveSetting('bm_rows', this.rows);
        this.saveSetting('bm_cols', this.cols);
        this.saveSetting('bm_padSize', this.padSize);
        this.saveSetting('bm_main_bpm', this.currentBPM);
        this.saveSetting('bm_main_useGlobalBPM', this.useGlobalBPM);
        this.saveSetting('bm_secondary_bpm', this.bpmSecondary);
        this.saveSetting('bm_secondary_noteOffset', this.secondaryNoteOffset);
        this.saveSetting('bm_secondary_orientation', this.secondaryBarOrientation);
        this.saveSetting('bm_secondary_direction', this.secondaryBarDirection);
        this.saveSetting('bm_secondary_syncSpeed', this.secondarySyncSpeedDirection);
        this.saveSetting('bm_secondary_syncFactor', this.secondarySyncFactor);
        this.saveSetting('bm_padStates', this.padStates);
        this.saveSetting('bm_midiOutputId', this.midiOut ? this.midiOut.id : null); // MIDI principal da BM

        // Salvar configurações das barras extras (simplificado, pode precisar de mais detalhes)
        const extraBarsSettings = this.extraBars.map(bar => ({
            id: bar.id,
            bpm: bar.bpm,
            noteOffset: bar.noteOffset,
            orientation: bar.orientation,
            direction: bar.direction,
            syncSpeedDirection: bar.syncSpeedDirection,
            syncFactor: bar.syncFactor,
            // Não salvar timerId, isPlaying, currentPosition, etc. que são estados de runtime
        }));
        this.saveSetting('bm_extraBars', extraBarsSettings);
        this.saveSetting('bm_nextExtraBarId', this.nextExtraBarId);

    },

    initializePadStates: function() { /* ... (mesma lógica da v73) ... */
        this.padStates = [];
        for (let r = 0; r < this.rows; r++) {
            this.padStates[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.padStates[r][c] = false;
            }
        }
    },

    populateMidiOutputs: function() { /* ... (adaptado da v73, usa this.domElements.midiOutputSelect) ... */
        const selectElement = this.domElements.midiOutputSelect;
        if (!selectElement || !this.availableMidiOutputs) return;

        const previouslySelectedId = this.midiOut ? this.midiOut.id : this.loadSetting('bm_midiOutputId', null);
        selectElement.innerHTML = '';

        if (this.availableMidiOutputs.size === 0) {
            selectElement.add(new Option("Nenhuma saída MIDI", ""));
            this.midiOut = null;
            return;
        }

        this.availableMidiOutputs.forEach((port, id) => {
            const option = document.createElement('option');
            option.value = id;
            option.text = port.name;
            selectElement.appendChild(option);
        });

        if (previouslySelectedId && this.availableMidiOutputs.has(previouslySelectedId)) {
            selectElement.value = previouslySelectedId;
        } else if (selectElement.options.length > 0) {
            selectElement.selectedIndex = 0;
        }
        this.midiOut = this.availableMidiOutputs.get(selectElement.value) || null;
        if(this.midiOut) this.logDebug("Beat Matrix MIDI Output (Principal) set to:", this.midiOut.name);
    },

    updateAvailableMidiOutputs: function(newAvailableMidiOutputs) {
        this.availableMidiOutputs = newAvailableMidiOutputs || new Map();
        this.populateMidiOutputs(); // Repopula o select principal
        // TODO: Atualizar selects de MIDI para barras extras se elas tiverem saídas individuais
    },

    getMidiOutputForNote: function(note, channel, barId = 'main') {
        // Por enquanto, todas as barras usam a saída MIDI principal da BM.
        // Esta função pode ser expandida para permitir saídas MIDI por barra.
        return this.midiOut;
    },

    hasActiveMidiOutput: function() {
        return !!this.midiOut; // Verifica se a saída principal da BM está configurada
    },

    getMidiOutputInfo: function() {
        if (this.midiOut) return `BM: ${this.midiOut.name}`;
        return "BM: OFF";
    },


    setupEventListeners: function() {
        // Barra Principal
        this.domElements.playStopButton?.addEventListener('click', () => this.togglePlayback());
        this.domElements.midiOutputSelect?.addEventListener('change', (event) => {
            const selectedId = event.target.value;
            this.midiOut = this.availableMidiOutputs.get(selectedId) || null;
            if(this.midiOut) this.logDebug("Beat Matrix MIDI Output (Principal) changed to:", this.midiOut.name);
            this.saveSettings();
        });
        this.domElements.globalBpmSyncButton?.addEventListener('click', () => {
            this.useGlobalBPM = !this.useGlobalBPM;
            if (this.useGlobalBPM && this.getGlobalBPMCallback) {
                this.currentBPM = this.getGlobalBPMCallback();
            }
            this.updateAllBPMDisplaysAndFaders();
            this.updateGlobalBPMSyncButtonVisuals();
            if (this.isPlaying) this.restartSequencerTimer();
            this.saveSettings();
        });

        // Fader SVG Principal
        this.domElements.horizontalBpmFaderSVG?.addEventListener('mousedown', (event) => this.handleFaderMouseDown(event, 'main'));

        // Barra Secundária
        this.domElements.playStopButtonSecondary?.addEventListener('click', () => this.togglePlaybackSecondary());
        this.domElements.secondaryBpmFaderSVG?.addEventListener('mousedown', (event) => this.handleFaderMouseDown(event, 'secondary'));
        this.domElements.secondaryNoteOffsetInput?.addEventListener('input', (e) => {
            this.secondaryNoteOffset = parseInt(e.target.value, 10);
            if (isNaN(this.secondaryNoteOffset)) this.secondaryNoteOffset = 0;
            this.saveSettings();
        });
        this.domElements.orientationBar2Select?.addEventListener('change', (e) => {
            this.secondaryBarOrientation = e.target.value;
            this.updateSecondaryDirectionOptions();
            if (this.isPlayingSecondary) this.togglePlaybackSecondary(); // Stop
            this.saveSettings();
        });
        this.domElements.directionBar2Select?.addEventListener('change', (e) => {
            this.secondaryBarDirection = e.target.value;
            if (this.isPlayingSecondary) this.togglePlaybackSecondary(); // Stop
            this.saveSettings();
        });
        // TODO: Adicionar listeners para secondarySyncSpeedDirectionInput e secondarySyncFactorInput se forem usados.

        // Grid
        this.domElements.rowsInput?.addEventListener('input', (e) => this.handleGridResize('rows', parseInt(e.target.value)));
        this.domElements.colsInput?.addEventListener('input', (e) => this.handleGridResize('cols', parseInt(e.target.value)));
        this.domElements.padSizeInput?.addEventListener('input', (e) => this.handleGridResize('padSize', parseInt(e.target.value)));
        this.domElements.clearButton?.addEventListener('click', () => this.clearGrid());

        // Barras Extras
        this.domElements.addExtraBarButton?.addEventListener('click', () => this.addExtraBar());
    },

    handleFaderMouseDown: function(event, barType) {
        let targetBarBPM, targetFaderSVG, updateVisualsFunction;
        let isDraggingFlag;

        if (barType === 'main') {
            targetBarBPM = this.currentBPM; // Irá mudar this.currentBPM
            targetFaderSVG = this.domElements.horizontalBpmFaderSVG;
            updateVisualsFunction = (newBpm) => {
                this.currentBPM = newBpm;
                this.useGlobalBPM = false; // Mover fader desativa sync global
                this.updateGlobalBPMSyncButtonVisuals();
                this.updateBPMFaderVisuals('main', newBpm);
                if (this.isPlaying) this.restartSequencerTimer();
                 this.saveSettings();
            };
            isDraggingFlag = 'isDraggingMainFader'; // Usar uma propriedade no objeto beatMatrix
        } else if (barType === 'secondary') {
            targetBarBPM = this.bpmSecondary; // Irá mudar this.bpmSecondary
            targetFaderSVG = this.domElements.secondaryBpmFaderSVG;
            updateVisualsFunction = (newBpm) => {
                this.bpmSecondary = newBpm;
                this.updateBPMFaderVisuals('secondary', newBpm);
                if (this.isPlayingSecondary) this.restartSequencerTimerSecondary();
                 this.saveSettings();
            };
            isDraggingFlag = 'isDraggingSecondaryFader';
        } else if (barType.startsWith('extra_')) {
            const barId = parseInt(barType.split('_')[1], 10);
            const bar = this.extraBars.find(b => b.id === barId);
            if (!bar) return;
            targetBarBPM = bar.bpm;
            targetFaderSVG = bar.dom.bpmFaderSVG; // Assumindo que bar.dom existe
            updateVisualsFunction = (newBpm) => {
                bar.bpm = newBpm;
                this.updateBPMFaderVisuals(barType, newBpm, bar); // Passa o objeto bar
                if (bar.isPlaying) this.restartSequencerTimerExtra(bar);
                 this.saveSettings(); // Pode precisar salvar configurações de barras extras específicas
            };
            isDraggingFlag = `isDraggingExtraFader_${barId}`;
        } else {
            return;
        }

        if (!targetFaderSVG) return;
        this[isDraggingFlag] = true;
        document.body.style.cursor = 'grabbing';

        const onMouseMove = (moveEvent) => {
            if (!this[isDraggingFlag] || !targetFaderSVG) return;
            moveEvent.preventDefault();
            const svgRect = targetFaderSVG.getBoundingClientRect();
            const svgX = moveEvent.clientX - svgRect.left;
            let newBpm = this.calculateBPMFromFaderX(svgX, this.H_BPM_FADER_TRACK_X, this.H_BPM_FADER_TRACK_WIDTH, this.MIN_BPM_FADER, this.MAX_BPM_FADER, this.H_BPM_FADER_THUMB_WIDTH);
            updateVisualsFunction(newBpm);
        };

        const onMouseUp = () => {
            if (this[isDraggingFlag]) {
                this[isDraggingFlag] = false;
                document.body.style.cursor = 'default';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Initial click
        const svgRect = targetFaderSVG.getBoundingClientRect();
        const svgX = event.clientX - svgRect.left;
        let initialBpm = this.calculateBPMFromFaderX(svgX, this.H_BPM_FADER_TRACK_X, this.H_BPM_FADER_TRACK_WIDTH, this.MIN_BPM_FADER, this.MAX_BPM_FADER, this.H_BPM_FADER_THUMB_WIDTH);
        updateVisualsFunction(initialBpm);
    },

    calculateBPMFromFaderX: function(svgX, trackX, trackWidth, minValue, maxValue, thumbWidth) {
        let normalizedPosition = (svgX - trackX - (thumbWidth / 2)) / (trackWidth - thumbWidth);
        normalizedPosition = Math.max(0, Math.min(1, normalizedPosition));
        let value = minValue + normalizedPosition * (maxValue - minValue);
        return Math.round(value);
    },


    handleGridResize: function(type, value) { /* ... (adaptado da v73, atualiza displays e padStates) ... */
        let oldRows = this.rows;
        let oldCols = this.cols;

        if (type === 'rows') {
            this.rows = Math.max(1, Math.min(16, value)); // Max 16 linhas
            if(this.domElements.rowsValueDisplay) this.domElements.rowsValueDisplay.textContent = this.rows;
        } else if (type === 'cols') {
            this.cols = Math.max(1, Math.min(16, value));
            if(this.domElements.colsValueDisplay) this.domElements.colsValueDisplay.textContent = this.cols;
        } else if (type === 'padSize') {
            this.padSize = Math.max(20, Math.min(100, value));
            if(this.domElements.padSizeValueDisplay) this.domElements.padSizeValueDisplay.textContent = this.padSize;
        }

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

        if (this.currentStep >= this.cols) this.currentStep = 0;
        if (this.secondaryBarOrientation === 'horizontal' && this.currentPositionSecondary >= this.cols) {
            this.currentPositionSecondary = (this.secondaryBarDirection === 'e2d') ? 0 : (this.cols > 0 ? this.cols - 1 : 0);
        } else if (this.secondaryBarOrientation === 'vertical' && this.currentPositionSecondary >= this.rows) {
             this.currentPositionSecondary = (this.secondaryBarDirection === 'c2b') ? 0 : (this.rows > 0 ? this.rows - 1 : 0);
        }
        // TODO: Ajustar posição para barras extras

        this.updateGridVisuals();
        this.saveSettings();
    },

    updateGridVisuals: function() {
        this.logDebug("Beat Matrix: updateGridVisuals() iniciada.", { rows: this.rows, cols: this.cols, padSize: this.padSize });
        const grid = this.domElements.gridElement;
        if (!grid) {
            this.logDebug("Beat Matrix: Erro - gridElement não encontrado em updateGridVisuals.");
            return;
        }
        grid.innerHTML = ''; // Limpa a grid anterior
        this.pads = [];

        if (this.rows <= 0 || this.cols <= 0) {
            this.logDebug("Beat Matrix: Rows ou Cols inválidos em updateGridVisuals.", { rows: this.rows, cols: this.cols });
            return;
        }

        grid.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;
        grid.style.gap = '5px'; // Ou usar a variável se for configurável

        for (let r = 0; r < this.rows; r++) {
            this.pads[r] = [];
            for (let c = 0; c < this.cols; c++) {
                const padElement = document.createElement('div');
                padElement.classList.add('pad'); // Classe de v77
                padElement.style.width = `${this.padSize}px`;
                padElement.style.height = `${this.padSize}px`;

                if (this.padStates[r] && this.padStates[r][c]) { // Verifica se padStates[r] existe
                    padElement.classList.add('active');
                }

                padElement.addEventListener('click', () => this.togglePadState(r, c));
                grid.appendChild(padElement);
                this.pads[r][c] = padElement;
                // this.logDebug(`Pad criado em [${r},${c}]`); // Log para cada pad criado - pode ser muito verboso
            }
        }
        this.logDebug("Beat Matrix: updateGridVisuals() concluída. Pads criados:", this.pads.length > 0 ? `${this.pads.length} linhas` : "Nenhum pad criado/array vazio");

         // Após recriar os pads, reaplicar indicadores de step se as barras estiverem tocando
        if (this.isPlaying) this.highlightCurrentStep();
        if (this.isPlayingSecondary) this.highlightCurrentStepSecondary();
        if (Array.isArray(this.extraBars)) {
            this.extraBars.forEach(bar => { if (bar.isPlaying) this.highlightCurrentStepExtra(bar); });
        }
    },

    togglePadState: function(row, col) {
        if (!this.padStates[row]) this.padStates[row] = [];
        const isActive = !this.padStates[row][col];
        this.padStates[row][col] = isActive;
        this.pads[row][col].classList.toggle('active', isActive);

        if (isActive) {
            this.playPadSound(row, col); // Play sound on manual activation
        } else {
            // Optional: If a note was playing due to this pad being manually triggered, stop it.
            // This requires more complex state tracking if sounds are sustained.
            // For now, playPadSound plays a short note, so explicit stop might not be needed here.
        }

        // Sequencer might also play this note if active on current step, handled by playNoteForPad
        // No changes needed for sequencer part here, this is for direct click interaction.
        this.saveSettings();
    },

    playPadSound: function(row, col) {
        if (!this.synth || typeof this.synth.noteOn !== 'function' || typeof this.synth.noteOff !== 'function') {
            this.logDebug("Beat Matrix: SimpleSynth not available or not fully functional for playPadSound.");
            return;
        }

        // Determine the note for the pad. This can be a simple mapping.
        // Example: C1 (MIDI 36) for pad [0,0], then chromatic upwards.
        // This mapping should be consistent with playNoteForPad if they are to sound similar.
        const note = this.baseNote + (this.rows - 1 - row) * this.cols + col; // More intuitive: higher rows = higher pitch
        // const note = this.baseNote + row * this.cols + col; // Original calculation if preferred

        const velocity = 100; // Default velocity for click
        const durationMs = 150; // Short duration for click

        this.logDebug(`Beat Matrix: playPadSound for [${row},${col}], note: ${note}`);

        this.synth.noteOn(note, velocity);
        setTimeout(() => {
            this.synth.noteOff(note);
        }, durationMs);
    },

    clearGrid: function() { /* ... (mesma lógica da v73) ... */
        this.initializePadStates();
        this.updateGridVisuals();
        this.saveSettings();
        this.logDebug("Beat Matrix v74 grid cleared.");
    },

    updateAllBPMDisplaysAndFaders: function() {
        // Barra Principal
        if (this.useGlobalBPM && this.getGlobalBPMCallback) {
            this.currentBPM = this.getGlobalBPMCallback();
        }
        this.updateBPMFaderVisuals('main', this.currentBPM);

        // Barra Secundária
        this.effectiveBpmSecondary = this._calculateEffectiveBpmSecondary();
        this.updateBPMFaderVisuals('secondary', this.bpmSecondary); // Fader mostra o valor base
        if (this.domElements.bpmDisplaySecondary) { // Display mostra o efetivo
            this.domElements.bpmDisplaySecondary.textContent = `BPM Sec: ${Math.round(this.effectiveBpmSecondary)}`;
        }

        // Barras Extras
        if (Array.isArray(this.extraBars)) {
            this.extraBars.forEach(bar => {
                bar.effectiveBpm = this._calculateEffectiveBpmExtra(bar);
                this.updateBPMFaderVisuals(`extra_${bar.id}`, bar.bpm, bar); // Fader mostra valor base
                if (bar.dom?.bpmDisplay) {
                     bar.dom.bpmDisplay.textContent = `BPM Extra: ${Math.round(bar.effectiveBpm)}`;
                }
            });
        }
    },

    updateBPMFaderVisuals: function(barType, bpmValue, barInstance = null) {
        let faderThumb, bpmTextDisplayElem, displayElem, prefix;
        let targetBPM = Math.max(this.MIN_BPM_FADER, Math.min(this.MAX_BPM_FADER, bpmValue));

        if (barType === 'main') {
            faderThumb = this.domElements.faderThumb;
            bpmTextDisplayElem = this.domElements.bpmTextDisplay;
            displayElem = this.domElements.bpmDisplay;
            prefix = "BPM Prin: ";
            if (displayElem) displayElem.textContent = prefix + Math.round(this.useGlobalBPM && this.getGlobalBPMCallback ? this.getGlobalBPMCallback() : this.currentBPM);
        } else if (barType === 'secondary') {
            faderThumb = this.domElements.secondaryFaderThumb;
            bpmTextDisplayElem = this.domElements.secondaryBpmTextDisplay;
            displayElem = this.domElements.bpmDisplaySecondary;
            prefix = "BPM Sec: ";
            // O display da barra secundária mostra o BPM *efetivo* (sincronizado)
            // O fader mostra o BPM *base* (this.bpmSecondary)
             if (displayElem) displayElem.textContent = prefix + Math.round(this._calculateEffectiveBpmSecondary());
             targetBPM = Math.max(this.MIN_BPM_FADER, Math.min(this.MAX_BPM_FADER, this.bpmSecondary)); // Fader reflete o valor base
        } else if (barType.startsWith('extra_') && barInstance && barInstance.dom) {
            faderThumb = barInstance.dom.faderThumb;
            bpmTextDisplayElem = barInstance.dom.bpmTextDisplay;
            displayElem = barInstance.dom.bpmDisplay;
            prefix = `BPM Extra ${barInstance.id + 1}: `;
            if (displayElem) displayElem.textContent = prefix + Math.round(this._calculateEffectiveBpmExtra(barInstance));
            targetBPM = Math.max(this.MIN_BPM_FADER, Math.min(this.MAX_BPM_FADER, barInstance.bpm));
        } else {
            return;
        }

        if (faderThumb && bpmTextDisplayElem) {
            const normalizedBpm = (this.MAX_BPM_FADER === this.MIN_BPM_FADER) ? 0 : (targetBPM - this.MIN_BPM_FADER) / (this.MAX_BPM_FADER - this.MIN_BPM_FADER);
            const availableTrackWidth = this.H_BPM_FADER_TRACK_WIDTH - this.H_BPM_FADER_THUMB_WIDTH;
            let thumbX = this.H_BPM_FADER_TRACK_X + normalizedBpm * availableTrackWidth;
            thumbX = Math.max(this.H_BPM_FADER_TRACK_X, Math.min(thumbX, this.H_BPM_FADER_TRACK_X + availableTrackWidth));
            faderThumb.setAttribute('x', thumbX);
            bpmTextDisplayElem.textContent = prefix + Math.round(targetBPM); // Texto no fader mostra o valor base do fader
        }
    },


    updateGlobalBPMSyncButtonVisuals: function() { /* ... (adaptado da v73, usa this.domElements) ... */
        const button = this.domElements.globalBpmSyncButton;
        if (button) {
            button.textContent = this.useGlobalBPM ? "Usando Global (Desativar)" : "Sincronizar com Global";
            button.classList.toggle('active', this.useGlobalBPM);
            // Desabilitar fader SVG principal se sync estiver ativo
            if (this.domElements.horizontalBpmFaderSVG) {
                 this.domElements.horizontalBpmFaderSVG.style.pointerEvents = this.useGlobalBPM ? 'none' : 'auto';
                 this.domElements.horizontalBpmFaderSVG.style.opacity = this.useGlobalBPM ? 0.5 : 1;
            }
        }
    },

    updateGlobalBPMReference: function(newGlobalBPM) { /* ... (adaptado da v73) ... */
        if (this.useGlobalBPM) {
            this.currentBPM = newGlobalBPM;
            this.updateAllBPMDisplaysAndFaders();
            if (this.isPlaying) this.restartSequencerTimer();
            // Se barras secundárias/extras estiverem tocando e sincronizadas, seus timers também precisam ser atualizados
            if (this.isPlayingSecondary) this.restartSequencerTimerSecondary();
            if (Array.isArray(this.extraBars)) {
                this.extraBars.forEach(bar => { if (bar.isPlaying) this.restartSequencerTimerExtra(bar); });
            }
        }
    },

    // --- Lógica de Playback (Principal) ---
    togglePlayback: function() { /* ... (adaptado da v73, renomeado para principal) ... */
        this.isPlaying = !this.isPlaying;
        this.domElements.playStopButton.textContent = this.isPlaying ? "Stop Barra Prin" : "Play Barra Prin";

        if (this.isPlaying) {
            if (this.cols === 0) { this.isPlaying = false; this.domElements.playStopButton.textContent = "Play Barra Prin"; return; }
            this.currentStep = 0;
            this.highlightCurrentStep();
            this.step();
            this.restartSequencerTimer();
            // Se outras barras estiverem configuradas para sincronizar, iniciar/ressincronizar elas
            if (this.isPlayingSecondary) this.synchronizeSecondaryBar(true);
            if (Array.isArray(this.extraBars)) {
                this.extraBars.forEach(bar => { if (bar.isPlaying) this.synchronizeExtraBar(bar, true); });
            }
        } else {
            if (this.timerId) clearInterval(this.timerId);
            this.timerId = null;
            this.clearStepHighlight();
            this.turnOffAllNotes('main');
        }
    },
    restartSequencerTimer: function() { /* ... (adaptado da v73, usa this.currentBPM) ... */
        if (this.timerId) clearInterval(this.timerId);
        if (this.isPlaying && this.cols > 0) {
            const effectiveBPM = (this.useGlobalBPM && this.getGlobalBPMCallback) ? this.getGlobalBPMCallback() : this.currentBPM;
            const stepIntervalMilliseconds = (60000 / effectiveBPM) / 4; // 16th notes
            if (stepIntervalMilliseconds > 0 && isFinite(stepIntervalMilliseconds)) {
                this.timerId = setInterval(() => this.step(), stepIntervalMilliseconds);
            } else {
                if (this.isPlaying) this.togglePlayback();
            }
        }
    },
    step: function() { /* ... (adaptado da v73, triggers playNoteForPad com 'main') ... */
        if (!this.isPlaying || this.cols === 0) return;
        this.clearStepHighlight();
        this.currentStep = (this.currentStep + 1) % this.cols;
        this.highlightCurrentStep();
        for (let r = 0; r < this.rows; r++) {
            if (this.padStates[r] && this.padStates[r][this.currentStep]) {
                this.playNoteForPad(r, this.currentStep, 'main');
            }
        }
        if (this.currentStep === 0) { // Loop da barra principal
            if (this.isPlayingSecondary) this.synchronizeSecondaryBar(true);
            if (Array.isArray(this.extraBars)) {
                this.extraBars.forEach(bar => { if (bar.isPlaying) this.synchronizeExtraBar(bar, true); });
            }
        }
    },
    highlightCurrentStep: function() { /* ... (adaptado da v73, usa classe 'sequencer-column-indicator') ... */
        for (let r = 0; r < this.rows; r++) {
            if (this.pads[r] && this.pads[r][this.currentStep]) {
                this.pads[r][this.currentStep].classList.add('sequencer-column-indicator');
            }
        }
    },
    clearStepHighlight: function() { /* ... (adaptado da v73) ... */
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.pads[r] && this.pads[r][c]) {
                    this.pads[r][c].classList.remove('sequencer-column-indicator');
                }
            }
        }
    },

    // --- Lógica de Playback (Secundária) ---
    // (Adaptado de beatmatrixexe_v77.js)
    togglePlaybackSecondary: function() {
        this.isPlayingSecondary = !this.isPlayingSecondary;
        this.domElements.playStopButtonSecondary.textContent = this.isPlayingSecondary ? 'Stop Barra Sec' : 'Play Barra Sec';

        if (this.isPlayingSecondary) {
            if ((this.secondaryBarOrientation === 'horizontal' && this.cols === 0) ||
                (this.secondaryBarOrientation === 'vertical' && this.rows === 0)) {
                this.isPlayingSecondary = false; this.domElements.playStopButtonSecondary.textContent = 'Play Barra Sec'; return;
            }
            this.effectiveBpmSecondary = this._calculateEffectiveBpmSecondary();
            this.updateBPMFaderVisuals('secondary', this.bpmSecondary); // Fader mostra base, display mostra efetivo
             if (this.domElements.bpmDisplaySecondary) this.domElements.bpmDisplaySecondary.textContent = `BPM Sec: ${Math.round(this.effectiveBpmSecondary)}`;


            if (this.secondaryBarOrientation === 'horizontal') {
                this.currentPositionSecondary = (this.secondaryBarDirection === 'e2d') ? 0 : (this.cols > 0 ? this.cols - 1 : 0);
            } else {
                this.currentPositionSecondary = (this.secondaryBarDirection === 'c2b') ? 0 : (this.rows > 0 ? this.rows - 1 : 0);
            }
            this.highlightCurrentStepSecondary();
            this.stepSecondary(true); // Não avança, apenas toca
            this.restartSequencerTimerSecondary();
        } else {
            if (this.timerIdSecondary) clearInterval(this.timerIdSecondary);
            this.timerIdSecondary = null;
            this.clearStepHighlightSecondary();
            this.turnOffAllNotes('secondary');
        }
    },
    restartSequencerTimerSecondary: function() {
        if (this.timerIdSecondary) clearInterval(this.timerIdSecondary);
        if (this.isPlayingSecondary) {
            this.effectiveBpmSecondary = this._calculateEffectiveBpmSecondary();
            const stepIntervalMs = (60000 / this.effectiveBpmSecondary) / 4; // 16ths
            if (stepIntervalMs > 0 && isFinite(stepIntervalMs)) {
                this.timerIdSecondary = setInterval(() => this.stepSecondary(), stepIntervalMs);
            } else {
                if (this.isPlayingSecondary) this.togglePlaybackSecondary();
            }
        }
    },
    stepSecondary: function(dontAdvance = false) {
        if (!this.isPlayingSecondary) return;
        if ((this.secondaryBarOrientation === 'horizontal' && this.cols <= 0) ||
            (this.secondaryBarOrientation === 'vertical' && this.rows <= 0)) return;

        this.clearStepHighlightSecondary();
        if (!dontAdvance) {
            if (this.secondaryBarOrientation === 'horizontal') {
                this.currentPositionSecondary = (this.secondaryBarDirection === 'e2d') ?
                    (this.currentPositionSecondary + 1) % this.cols :
                    (this.currentPositionSecondary - 1 + this.cols) % this.cols;
            } else {
                this.currentPositionSecondary = (this.secondaryBarDirection === 'c2b') ?
                    (this.currentPositionSecondary + 1) % this.rows :
                    (this.currentPositionSecondary - 1 + this.rows) % this.rows;
            }
        }
        this.highlightCurrentStepSecondary();

        if (this.secondaryBarOrientation === 'horizontal') {
            for (let r = 0; r < this.rows; r++) {
                if (this.padStates[r] && this.padStates[r][this.currentPositionSecondary]) {
                    this.playNoteForPad(r, this.currentPositionSecondary, 'secondary');
                }
            }
        } else { // vertical
            for (let c = 0; c < this.cols; c++) {
                 if (this.padStates[this.currentPositionSecondary] && this.padStates[this.currentPositionSecondary][c]) {
                    this.playNoteForPad(this.currentPositionSecondary, c, 'secondary');
                }
            }
        }
        // TODO: Detecção de cruzamento se necessário
    },
     highlightCurrentStepSecondary: function() {
        const indicatorClass = 'sequencer-indicator-secondary'; // Classe de v77
        if (this.secondaryBarOrientation === 'horizontal') {
            for (let r = 0; r < this.rows; r++) {
                if (this.pads[r] && this.pads[r][this.currentPositionSecondary]) {
                    this.pads[r][this.currentPositionSecondary].classList.add(indicatorClass);
                }
            }
        } else { // vertical
            for (let c = 0; c < this.cols; c++) {
                if (this.pads[this.currentPositionSecondary] && this.pads[this.currentPositionSecondary][c]) {
                    this.pads[this.currentPositionSecondary][c].classList.add(indicatorClass);
                }
            }
        }
    },
    clearStepHighlightSecondary: function() {
        const indicatorClass = 'sequencer-indicator-secondary';
        this.pads.flat().forEach(pad => { if(pad) pad.classList.remove(indicatorClass); });
    },
    updateSecondaryDirectionOptions: function() {
        const select = this.domElements.directionBar2Select;
        if (!select || !this.domElements.orientationBar2Select) return;
        select.innerHTML = '';
        this.secondaryBarOrientation = this.domElements.orientationBar2Select.value;

        if (this.secondaryBarOrientation === 'vertical') {
            select.add(new Option('Cima para Baixo', 'c2b'));
            select.add(new Option('Baixo para Cima', 'b2c'));
        } else { // horizontal
            select.add(new Option('Esquerda para Direita', 'e2d'));
            select.add(new Option('Direita para Esquerda', 'd2e'));
        }
        // Tenta restaurar a direção salva, ou usa o primeiro como padrão
        const savedDirection = this.loadSetting(`bm_secondary_direction_for_${this.secondaryBarOrientation}`, select.options[0].value);
        select.value = savedDirection;
        this.secondaryBarDirection = select.value;
    },
    _calculateEffectiveBpmSecondary: function() {
        let base = (this.useGlobalBPM && this.getGlobalBPMCallback) ? this.getGlobalBPMCallback() : this.currentBPM;
        // Se a barra secundária tiver seu próprio fader e não estiver "sincronizada" com a principal explicitamente,
        // seu BPM base é this.bpmSecondary. Por enquanto, vamos assumir que a sincronização é sempre relativa à principal.
        // A lógica de "desligar" a sincronização se o fader da secundária for movido pode ser adicionada.
        let calculated = base;
        if (this.secondarySyncSpeedDirection === 'up') {
            calculated *= this.secondarySyncFactor;
        } else {
            calculated /= this.secondarySyncFactor;
        }
        return Math.max(this.MIN_BPM_FADER, Math.min(this.MAX_BPM_FADER, calculated));
    },
    synchronizeSecondaryBar: function(forceReset = false) {
        if (!this.isPlaying || !this.isPlayingSecondary) return;
        this.effectiveBpmSecondary = this._calculateEffectiveBpmSecondary();
        // this.updateBPMFaderVisuals('secondary', this.bpmSecondary); // Fader mostra base
        if (this.domElements.bpmDisplaySecondary) this.domElements.bpmDisplaySecondary.textContent = `BPM Sec: ${Math.round(this.effectiveBpmSecondary)}`;


        if (this.timerIdSecondary) clearInterval(this.timerIdSecondary);
        if (forceReset || this.currentStep === 0) { // Sincronizar com o início da barra principal
            if (this.secondaryBarOrientation === 'horizontal') {
                this.currentPositionSecondary = (this.secondaryBarDirection === 'e2d') ? 0 : (this.cols > 0 ? this.cols - 1 : 0);
            } else {
                this.currentPositionSecondary = (this.secondaryBarDirection === 'c2b') ? 0 : (this.rows > 0 ? this.rows - 1 : 0);
            }
        }
        this.highlightCurrentStepSecondary(); // Mostra o indicador na posição atualizada
        this.restartSequencerTimerSecondary(); // Reinicia o timer com o BPM efetivo
    },


    // --- Lógica de Playback (Barras Extras) ---
    // (Adaptado de beatmatrixexe_v77.js, generalizado)
    addExtraBar: function() { /* ... (cria HTML dinamicamente, adiciona a this.extraBars, configura listeners) ... */
        const barId = this.nextExtraBarId++;
        const newBar = {
            id: barId,
            isPlaying: false,
            currentPosition: 0,
            bpm: 120, // BPM base do fader da barra extra
            effectiveBpm: 120, // BPM real após sincronização
            timerId: null,
            noteOffset: (barId + 2) * 6, // Exemplo de offset diferente
            orientation: 'horizontal',
            direction: 'e2d',
            syncSpeedDirection: 'up',
            syncFactor: barId + 2, // Exemplo de fator diferente
            indicatorClass: `sequencer-indicator-extra-${barId}`,
            dom: {} // Para armazenar referências aos elementos DOM desta barra
        };

        // Criar elementos DOM para a barra extra (simplificado)
        const controlsContainer = this.domElements.extraBarsControlsContainer;
        if (!controlsContainer) { this.logDebug("Container para barras extras não encontrado."); return; }

        const barDiv = document.createElement('div');
        barDiv.classList.add('extra-bar-controls');
        barDiv.innerHTML = `
            <h5>Barra Extra ${barId + 1}</h5>
            <button id="play-stop-extra-${barId}">Play</button>
            <span id="bpm-display-extra-${barId}">BPM: ${newBar.bpm}</span>
            <!-- Adicionar Fader SVG e outros controles aqui, similar a index74.html -->
            <label>Offset: <input type="number" id="noteOffset-extra-${barId}" value="${newBar.noteOffset}" style="width:60px;"></label>
            <label>Orient: <select id="orientation-extra-${barId}"><option value="horizontal">H</option><option value="vertical">V</option></select></label>
            <label>Dir: <select id="direction-extra-${barId}"></select></label>
        `; // Simplificado, precisa de faders e mais controles
        controlsContainer.appendChild(barDiv);

        // Armazenar referências DOM
        newBar.dom.playStopButton = document.getElementById(`play-stop-extra-${barId}`);
        newBar.dom.bpmDisplay = document.getElementById(`bpm-display-extra-${barId}`);
        newBar.dom.noteOffsetInput = document.getElementById(`noteOffset-extra-${barId}`);
        newBar.dom.orientationSelect = document.getElementById(`orientation-extra-${barId}`);
        newBar.dom.directionSelect = document.getElementById(`direction-extra-${barId}`);
        // ... (outros elementos como faders)

        // Adicionar Event Listeners
        newBar.dom.playStopButton.addEventListener('click', () => this.togglePlaybackExtra(newBar));
        newBar.dom.noteOffsetInput.addEventListener('input', (e) => {
            newBar.noteOffset = parseInt(e.target.value, 10);
            this.saveSettings();
        });
        // ... (listeners para orientação, direção, fader BPM da barra extra)
        const updateExtraBarDirectionOptions = () => {
            const select = newBar.dom.directionSelect;
            select.innerHTML = '';
            newBar.orientation = newBar.dom.orientationSelect.value;
            if (newBar.orientation === 'vertical') {
                select.add(new Option('C->B', 'c2b')); select.add(new Option('B->C', 'b2c'));
            } else {
                select.add(new Option('E->D', 'e2d')); select.add(new Option('D->E', 'd2e'));
            }
            newBar.direction = select.value;
        };
        newBar.dom.orientationSelect.addEventListener('change', () => {
             updateExtraBarDirectionOptions();
             if(newBar.isPlaying) this.togglePlaybackExtra(newBar); // Parar
             this.saveSettings();
        });
        newBar.dom.directionSelect.addEventListener('change', (e) => {
            newBar.direction = e.target.value;
            if(newBar.isPlaying) this.togglePlaybackExtra(newBar); // Parar
            this.saveSettings();
        });
        updateExtraBarDirectionOptions();


        this.extraBars.push(newBar);
        this.saveSettings();
        this.logDebug(`Barra extra ${barId + 1} adicionada.`);
    },
    recreateExtraBarControlsDOM: function() {
        const container = this.domElements.extraBarsControlsContainer;
        if (container) container.innerHTML = ''; // Limpa controles antigos
        const tempNextId = this.nextExtraBarId; // Salva o próximo ID
        this.nextExtraBarId = 0; // Reseta para recriar IDs corretamente

        const loadedBarsData = this.loadSetting('bm_extraBars', []); // Carrega apenas os dados salvos
        this.extraBars = []; // Limpa o array de runtime

        loadedBarsData.forEach(barData => {
            // Recria a barra com os dados salvos, mas sem tentar recriar o DOM de dentro da função addExtraBar
            // Em vez disso, addExtraBar aqui vai criar o DOM para esta barra baseada nos dados.
            // É preciso cuidado para não criar um loop ou duplicar.
            // A forma mais segura é ter uma função separada para criar o DOM de uma barra extra.
            // Por agora, vamos chamar addExtraBar e ela vai usar o nextExtraBarId incrementado.
            // Isso pode não restaurar os IDs exatos se houverem sido deletadas barras no meio.
            // Para um restore perfeito, a lógica de `addExtraBar` precisaria ser mais robusta ou ter uma
            // função `_createExtraBarDOM(barInstance)` separada.

            // Simplificação: recria as barras como se fossem novas, o que pode perder IDs específicos.
            // Para manter IDs, a lógica de `addExtraBar` precisaria ser mais robusta ou ter uma
            // função `_createExtraBarDOM(barInstance)` separada.
        });
         // Recria as barras baseadas nos dados salvos, o que também recria seus controles DOM
        loadedBarsData.forEach(barData => {
            this.addExtraBarFromData(barData); // Nova função para adicionar a partir de dados salvos
        });
        this.nextExtraBarId = Math.max(tempNextId, ...(Array.isArray(this.extraBars) ? this.extraBars.map(b => b.id + 1) : [0]), 0);


    },
    addExtraBarFromData: function(barData) {
        // Similar a addExtraBar, mas usa barData para preencher os valores iniciais
        // e reatribui o ID salvo.
        const barId = barData.id; // Usa o ID salvo
        const newBar = {
            id: barId,
            isPlaying: false, // Estado de runtime não é salvo
            currentPosition: 0,
            bpm: barData.bpm || 120,
            effectiveBpm: barData.bpm || 120,
            timerId: null,
            noteOffset: barData.noteOffset !== undefined ? barData.noteOffset : (barId + 2) * 6,
            orientation: barData.orientation || 'horizontal',
            direction: barData.direction || 'e2d',
            syncSpeedDirection: barData.syncSpeedDirection || 'up',
            syncFactor: barData.syncFactor !== undefined ? barData.syncFactor : barId + 2,
            indicatorClass: `sequencer-indicator-extra-${barId}`,
            dom: {}
        };
        // ... (criação do DOM e listeners como em addExtraBar, mas usando os valores de newBar)
        const controlsContainer = this.domElements.extraBarsControlsContainer;
        if (!controlsContainer) return;

        const barDiv = document.createElement('div');
        barDiv.classList.add('extra-bar-controls');
        barDiv.id = `extra-bar-controls-${barId}`; // ID para o container da barra
        // ... (innerHTML como em addExtraBar, mas usando newBar.propriedades)
         barDiv.innerHTML = `
            <h5>Barra Extra ${barId + 1} (ID: ${barId})</h5>
            <button id="play-stop-extra-${barId}">Play</button>
            <span id="bpm-display-extra-${barId}">BPM: ${newBar.bpm}</span>
            <label>Offset: <input type="number" id="noteOffset-extra-${barId}" value="${newBar.noteOffset}" style="width:60px;"></label>
            <label>Orient: <select id="orientation-extra-${barId}"><option value="horizontal" ${newBar.orientation === 'horizontal' ? 'selected':''}>H</option><option value="vertical" ${newBar.orientation === 'vertical' ? 'selected':''}>V</option></select></label>
            <label>Dir: <select id="direction-extra-${barId}"></select></label>
            <!-- TODO: Adicionar outros controles como fader de BPM, syncFactor, syncSpeedDirection -->
        `;
        controlsContainer.appendChild(barDiv);

        newBar.dom.playStopButton = document.getElementById(`play-stop-extra-${barId}`);
        newBar.dom.bpmDisplay = document.getElementById(`bpm-display-extra-${barId}`);
        newBar.dom.noteOffsetInput = document.getElementById(`noteOffset-extra-${barId}`);
        newBar.dom.orientationSelect = document.getElementById(`orientation-extra-${barId}`);
        newBar.dom.directionSelect = document.getElementById(`direction-extra-${barId}`);

        //Listeners
        newBar.dom.playStopButton.addEventListener('click', () => this.togglePlaybackExtra(newBar));
        // ... (outros listeners)
        const updateExtraBarDirectionOptions = () => { /* ... como em addExtraBar ... */
            const select = newBar.dom.directionSelect; select.innerHTML = '';
            newBar.orientation = newBar.dom.orientationSelect.value;
            if (newBar.orientation === 'vertical') { select.add(new Option('C->B', 'c2b')); select.add(new Option('B->C', 'b2c')); }
            else { select.add(new Option('E->D', 'e2d')); select.add(new Option('D->E', 'd2e')); }
            select.value = newBar.direction; // Tenta restaurar
        };
        newBar.dom.orientationSelect.addEventListener('change', () => { updateExtraBarDirectionOptions(); if(newBar.isPlaying) this.togglePlaybackExtra(newBar); this.saveSettings(); });
        newBar.dom.directionSelect.addEventListener('change', (e) => { newBar.direction = e.target.value; if(newBar.isPlaying) this.togglePlaybackExtra(newBar); this.saveSettings(); });
        updateExtraBarDirectionOptions();


        this.extraBars.push(newBar);
        // Não chamar saveSettings() aqui pois estamos carregando
    },

    togglePlaybackExtra: function(bar) { /* ... (similar a togglePlaybackSecondary, mas para uma barra extra específica) ... */
        bar.isPlaying = !bar.isPlaying;
        bar.dom.playStopButton.textContent = bar.isPlaying ? `Stop Extra ${bar.id+1}` : `Play Extra ${bar.id+1}`;

        if (bar.isPlaying) {
             if ((bar.orientation === 'horizontal' && this.cols === 0) ||
                (bar.orientation === 'vertical' && this.rows === 0)) {
                bar.isPlaying = false; bar.dom.playStopButton.textContent = `Play Extra ${bar.id+1}`; return;
            }
            bar.effectiveBpm = this._calculateEffectiveBpmExtra(bar);
            this.updateBPMFaderVisuals(`extra_${bar.id}`, bar.bpm, bar); // Atualiza fader e display
            if (bar.dom.bpmDisplay) bar.dom.bpmDisplay.textContent = `BPM Extra: ${Math.round(bar.effectiveBpm)}`;


            if (bar.orientation === 'horizontal') bar.currentPosition = (bar.direction === 'e2d') ? 0 : (this.cols > 0 ? this.cols - 1 : 0);
            else bar.currentPosition = (bar.direction === 'c2b') ? 0 : (this.rows > 0 ? this.rows - 1 : 0);

            this.highlightCurrentStepExtra(bar);
            this.stepExtra(bar, true);
            this.restartSequencerTimerExtra(bar);
        } else {
            if (bar.timerId) clearInterval(bar.timerId);
            bar.timerId = null;
            this.clearStepHighlightExtra(bar);
            this.turnOffAllNotes(`extra_${bar.id}`);
        }
    },
    restartSequencerTimerExtra: function(bar) { /* ... (similar a restartSequencerTimerSecondary) ... */
        if (bar.timerId) clearInterval(bar.timerId);
        if (bar.isPlaying) {
            bar.effectiveBpm = this._calculateEffectiveBpmExtra(bar);
            const stepIntervalMs = (60000 / bar.effectiveBpm) / 4; // 16ths
            if (stepIntervalMs > 0 && isFinite(stepIntervalMs)) {
                bar.timerId = setInterval(() => this.stepExtra(bar), stepIntervalMs);
            } else {
                if (bar.isPlaying) this.togglePlaybackExtra(bar);
            }
        }
    },
    stepExtra: function(bar, dontAdvance = false) { /* ... (similar a stepSecondary, mas usa bar.properties e bar.indicatorClass) ... */
        if (!bar.isPlaying) return;
        if ((bar.orientation === 'horizontal' && this.cols <= 0) ||
            (bar.orientation === 'vertical' && this.rows <= 0)) return;

        this.clearStepHighlightExtra(bar);
        if (!dontAdvance) { /* ... lógica de avanço ... */
            if (bar.orientation === 'horizontal') {
                bar.currentPosition = (bar.direction === 'e2d') ? (bar.currentPosition + 1) % this.cols : (bar.currentPosition - 1 + this.cols) % this.cols;
            } else {
                bar.currentPosition = (bar.direction === 'c2b') ? (bar.currentPosition + 1) % this.rows : (bar.currentPosition - 1 + this.rows) % this.rows;
            }
        }
        this.highlightCurrentStepExtra(bar);

        if (bar.orientation === 'horizontal') {
            for (let r = 0; r < this.rows; r++) {
                if (this.padStates[r] && this.padStates[r][bar.currentPosition]) {
                    this.playNoteForPad(r, bar.currentPosition, `extra_${bar.id}`, bar.noteOffset);
                }
            }
        } else { // vertical
            for (let c = 0; c < this.cols; c++) {
                 if (this.padStates[bar.currentPosition] && this.padStates[bar.currentPosition][c]) {
                    this.playNoteForPad(bar.currentPosition, c, `extra_${bar.id}`, bar.noteOffset);
                }
            }
        }
    },
    highlightCurrentStepExtra: function(bar) { /* ... (similar a highlightCurrentStepSecondary) ... */
        const indicatorClass = bar.indicatorClass;
        if (bar.orientation === 'horizontal') {
            for (let r = 0; r < this.rows; r++) {
                if (this.pads[r] && this.pads[r][bar.currentPosition]) {
                    this.pads[r][bar.currentPosition].classList.add(indicatorClass);
                }
            }
        } else { // vertical
            for (let c = 0; c < this.cols; c++) {
                if (this.pads[bar.currentPosition] && this.pads[bar.currentPosition][c]) {
                    this.pads[bar.currentPosition][c].classList.add(indicatorClass);
                }
            }
        }
    },
    clearStepHighlightExtra: function(bar) { /* ... */
        this.pads.flat().forEach(pad => { if(pad) pad.classList.remove(bar.indicatorClass); });
    },
     _calculateEffectiveBpmExtra: function(bar) {
        let base = (this.useGlobalBPM && this.getGlobalBPMCallback) ? this.getGlobalBPMCallback() : this.currentBPM;
        let calculated = base;
        if (bar.syncSpeedDirection === 'up') {
            calculated *= bar.syncFactor;
        } else {
            calculated /= bar.syncFactor;
        }
        return Math.max(this.MIN_BPM_FADER, Math.min(this.MAX_BPM_FADER, calculated));
    },
    synchronizeExtraBar: function(bar, forceReset = false) { /* ... (similar a synchronizeSecondaryBar) ... */
        if (!this.isPlaying || !bar.isPlaying) return;
        bar.effectiveBpm = this._calculateEffectiveBpmExtra(bar);
        // this.updateBPMFaderVisuals(`extra_${bar.id}`, bar.bpm, bar); // Fader mostra base
        if (bar.dom?.bpmDisplay) bar.dom.bpmDisplay.textContent = `BPM Extra: ${Math.round(bar.effectiveBpm)}`;

        if (bar.timerId) clearInterval(bar.timerId);
        if (forceReset || this.currentStep === 0) {
            if (bar.orientation === 'horizontal') bar.currentPosition = (bar.direction === 'e2d') ? 0 : (this.cols > 0 ? this.cols - 1 : 0);
            else bar.currentPosition = (bar.direction === 'c2b') ? 0 : (this.rows > 0 ? this.rows - 1 : 0);
        }
        this.highlightCurrentStepExtra(bar);
        this.restartSequencerTimerExtra(bar);
    },


    // --- Funções de Nota e MIDI ---
    playNoteForPad: function(row, col, barSource = 'main', noteOffsetOverride = null) {
        const baseNoteForPad = this.baseNote + row * this.cols + col; // Ou outra lógica de mapeamento
        let finalNote = baseNoteForPad;

        if (barSource === 'secondary') {
            finalNote = baseNoteForPad + this.secondaryNoteOffset;
        } else if (barSource.startsWith('extra_')) {
            const barId = parseInt(barSource.split('_')[1], 10);
            const bar = this.extraBars.find(b => b.id === barId);
            if (bar) {
                finalNote = baseNoteForPad + (noteOffsetOverride !== null ? noteOffsetOverride : bar.noteOffset);
            }
        } else if (noteOffsetOverride !== null) { // Para a barra principal se um offset for passado
             finalNote = baseNoteForPad + noteOffsetOverride;
        }


        const velocity = 100;
        const durationMs = 150; // Curta para simular staccato
        const midiChannel = 9; // Canal 10 para a Beat Matrix (0-indexed, so channel 9 is MIDI CH 10)

        // MIDI Output through callback (main.js)
        if (this.sendMidiNoteOn) {
            this.sendMidiNoteOn(finalNote, velocity, midiChannel, -1, 'beatmatrix');
        }

        // Internal Synth sound directly if synth is available
        // This part was missing, sendMidiNoteOn in main.js handles synth for 'beatmatrix' source,
        // which is correct. So, playNoteForPad correctly triggers synth via the callback.
        // The explicit this.synth.noteOn here would be redundant if sendMidiNoteOn in main.js
        // already handles it for 'beatmatrix' source. Let's verify main.js.
        // Yes, main.js's sendMidiNoteOn does:
        // if (_internalAudioEnabledMaster && simpleSynth && typeof simpleSynth.noteOn === 'function') {
        //   if (source === currentAudioSourceView) { // currentAudioSourceView should be 'beatmatrix'
        //       simpleSynth.noteOn(n, v);
        //   }
        // }
        // So, no direct synth call needed here if main.js is correctly setting currentAudioSourceView.

        setTimeout(() => {
            if (this.sendMidiNoteOff) {
                this.sendMidiNoteOff(finalNote, midiChannel, -1, 'beatmatrix');
            }
            // Similarly, synth.noteOff is handled by main.js's sendMidiNoteOff callback.
        }, durationMs);
    },

    turnOffAllNotes: function(barSourceToClear = 'all', stopAudioSynth = true) {
        // Parar notas MIDI para a(s) barra(s) especificada(s)
        // A lógica do synth é global em main74.js
        this.logDebug(`Beat Matrix: Parando notas para ${barSourceToClear}.`);
        // Iterar sobre todos os pads e enviar note off para notas que poderiam estar tocando
        // devido à(s) barra(s) especificada(s).
        // Isso é uma simplificação; uma implementação mais precisa rastrearia notas ativas por barra.
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.padStates[r] && this.padStates[r][c]) {
                    const baseNoteForPad = this.baseNote + r * this.cols + col;
                    let noteToStop = baseNoteForPad;
                    // Determinar qual offset aplicar baseado em barSourceToClear
                    if (barSourceToClear === 'main' || barSourceToClear === 'all') {
                        if (this.sendMidiNoteOff) this.sendMidiNoteOff(noteToStop, 9, -1, 'beatmatrix');
                    }
                    if (barSourceToClear === 'secondary' || barSourceToClear === 'all') {
                        if (this.sendMidiNoteOff) this.sendMidiNoteOff(noteToStop + this.secondaryNoteOffset, 9, -1, 'beatmatrix');
                    }
                    if (barSourceToClear.startsWith('extra_') || barSourceToClear === 'all') {
                        if (Array.isArray(this.extraBars)) {
                            this.extraBars.forEach(bar => {
                                if (barSourceToClear === 'all' || `extra_${bar.id}` === barSourceToClear) {
                                    if (this.sendMidiNoteOff) this.sendMidiNoteOff(noteToStop + bar.noteOffset, 9, -1, 'beatmatrix');
                                }
                            });
                        }
                    }
                }
            }
        }
    },
    stopAllBars: function() { // Nova função para parar todas as barras da BM
        if (this.isPlaying) this.togglePlayback();
        if (this.isPlayingSecondary) this.togglePlaybackSecondary();
        if (Array.isArray(this.extraBars)) {
            this.extraBars.forEach(bar => {
                if (bar.isPlaying) this.togglePlaybackExtra(bar);
            });
        }
        this.logDebug("Todas as barras da Beat Matrix paradas.");
    },

    getHUDInfo: function() {
        let info = `<b>BeatMatrix:</b> Grid ${this.rows}x${this.cols}<br>`;
        info += `&nbsp;&nbsp;Barra Principal: ${this.isPlaying ? '▶️' : '⏹️'} BPM: ${((this.useGlobalBPM && this.getGlobalBPMCallback) ? this.getGlobalBPMCallback() : this.currentBPM).toFixed(0)}<br>`;
        info += `&nbsp;&nbsp;Barra Secundária: ${this.isPlayingSecondary ? '▶️' : '⏹️'} BPM: ${this.effectiveBpmSecondary.toFixed(0)} (Offset: ${this.secondaryNoteOffset})<br>`;
        if (Array.isArray(this.extraBars)) {
            this.extraBars.forEach(bar => {
                info += `&nbsp;&nbsp;Barra Extra ${bar.id + 1}: ${bar.isPlaying ? '▶️' : '⏹️'} BPM: ${bar.effectiveBpm.toFixed(0)} (Offset: ${bar.noteOffset})<br>`;
            });
        }
        return info;
    }
};

// Função global para main74.js poder inicializar a Beat Matrix
function initializeBeatMatrix(config) {
    if (beatMatrix && !beatMatrix.isInitialized) {
        beatMatrix.initialize(config);
    }
}

console.log("beatmatrix74.js carregado.");
