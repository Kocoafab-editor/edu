// 전역 BLE 연결 및 알림 사용
const getBle = () => window.AppState?.ble?.manager || window.bleManager || window.bleConnection;
const notify = (msg, type) => (window.showNotification ? window.showNotification(msg, type) : console.log(`[${type||'info'}] ${msg}`));

class ButtonGridManager {
    constructor() {
        this.rows = 5;
        this.cols = 5;
        this.maxRows = 5;
        this.maxCols = 5;
        this.minRows = 1;
        this.minCols = 1;
        this.editingButton = null;
        
        // Initialize UI elements
        this.gridRows = document.getElementById('gridRows');
        this.gridCols = document.getElementById('gridCols');
        this.createGridBtn = document.getElementById('createGrid');
        this.buttonGrid = document.getElementById('buttonGrid');
        this.presetSelect = document.getElementById('presetSelect');
        
        // Button editor modal elements
        this.modalOverlay = document.getElementById('btnModalOverlay');
        this.modal = document.getElementById('btnModal');
        this.btnLabel = document.getElementById('btnLabel');
        this.btnValue = document.getElementById('btnValue');
        this.btnIcon = document.getElementById('btnIcon');
        this.btnIconPreview = document.getElementById('btnIconPreview');
        this.btnEmojiPreview = document.getElementById('btnEmojiPreview');
        this.btnBgColor = document.getElementById('btnBgColor');
        this.saveBtnConfig = document.getElementById('saveBtnConfig');
        this.deleteBtnConfig = document.getElementById('deleteBtnConfig');
        this.cancelBtnConfig = document.getElementById('cancelBtnConfig');
        this.editSnapshot = null;
        // 제한: 커스텀 편집 시 라벨은 최대 6자
        if (this.btnLabel) {
            try { this.btnLabel.maxLength = 6; } catch (e) {}
            // IME(한글 조합) 안전 처리
            this.isComposingLabel = false;
            this.btnLabel.addEventListener('compositionstart', () => { this.isComposingLabel = true; });
            this.btnLabel.addEventListener('compositionend', () => {
                this.isComposingLabel = false;
                const v = this.btnLabel.value || '';
                if (v.length > 6) this.btnLabel.value = v.slice(0, 6);
            });
            this.btnLabel.addEventListener('input', () => {
                if (this.isComposingLabel) return;
                const v = this.btnLabel.value || '';
                if (v.length > 6) this.btnLabel.value = v.slice(0, 6);
            });
        }
        
        // Initialize presets
        this.presets = {
            numpad: {
                rows: 3,
                cols: 3,
                buttons: [
                    { label: '', value: '1', icon: '1', bgColor: '#f0f0f0', row: 0, col: 0 },
                    { label: '', value: '2', icon: '2', bgColor: '#f0f0f0', row: 0, col: 1 },
                    { label: '', value: '3', icon: '3', bgColor: '#f0f0f0', row: 0, col: 2 },
                    { label: '', value: '4', icon: '4', bgColor: '#f0f0f0', row: 1, col: 0 },
                    { label: '', value: '5', icon: '5', bgColor: '#f0f0f0', row: 1, col: 1 },
                    { label: '', value: '6', icon: '6', bgColor: '#f0f0f0', row: 1, col: 2 },
                    { label: '', value: '7', icon: '7', bgColor: '#f0f0f0', row: 2, col: 0 },
                    { label: '', value: '8', icon: '8', bgColor: '#f0f0f0', row: 2, col: 1 },
                    { label: '', value: '9', icon: '9', bgColor: '#f0f0f0', row: 2, col: 2 }
                ]
            },
            gamepad: {
                rows: 3,
                cols: 3,
                buttons: [
                    { label: '', value: '1', icon: '↖', bgColor: '#ffcdd2', row: 0, col: 0 },
                    { label: '', value: '2', icon: 'fas fa-arrow-up', bgColor: '#f3e5f5', row: 0, col: 1 },
                    { label: '', value: '3', icon: '↗', bgColor: '#ffcdd2', row: 0, col: 2 },
                    { label: '', value: '4', icon: 'fas fa-arrow-left', bgColor: '#f3e5f5', row: 1, col: 0 },
                    { label: '', value: '5', icon: 'fas fa-stop', bgColor: '#e0e0e0', row: 1, col: 1 },
                    { label: '', value: '6', icon: 'fas fa-arrow-right', bgColor: '#f3e5f5', row: 1, col: 2 },
                    { label: '', value: '7', icon: '↙', bgColor: '#ffcdd2', row: 2, col: 0 },
                    { label: '', value: '8', icon: 'fas fa-arrow-down', bgColor: '#f3e5f5', row: 2, col: 1 },
                    { label: '', value: '9', icon: '↘', bgColor: '#ffcdd2', row: 2, col: 2 }
                ]
            },
            custom: {
                rows: 5,
                cols: 5,
                buttons: []
            }
        };
        
        // Load custom preset from localStorage if exists
        this.loadCustomPreset();
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Preset selector change
        this.presetSelect.addEventListener('change', (e) => {
            const isCustom = e.target.value === 'custom';
            document.body.classList.toggle('custom-preset', isCustom);
            // 편집 모드 강제 종료 및 버튼 상태 업데이트
            if (document.body.classList.contains('edit-mode')) {
                this.toggleEditMode(false);
            }
            const editGridBtn = document.getElementById('editGrid');
            const saveGridBtn = document.getElementById('saveGrid');
            const cancelEditBtn = document.getElementById('cancelEdit');
            if (editGridBtn) {
                editGridBtn.disabled = !isCustom;
                editGridBtn.title = isCustom ? '' : '커스텀 프리셋에서만 편집할 수 있습니다.';
            }
            if (!isCustom && saveGridBtn && cancelEditBtn) {
                saveGridBtn.style.display = 'none';
                cancelEditBtn.style.display = 'none';
            }
            // 프리셋 즉시 적용
            this.loadPreset(e.target.value);
        });
        
        // Create grid button
        this.createGridBtn.addEventListener('click', () => {
            if (this.presetSelect.value !== 'custom') {
                this.showNotification('커스텀 프리셋에서만 그리드를 생성할 수 있습니다.', 'error');
                return;
            }
            this.createCustomGrid();
        });
        
        // Button editor events
        this.saveBtnConfig.addEventListener('click', () => this.saveButtonConfig());
        if (this.deleteBtnConfig) {
            this.deleteBtnConfig.addEventListener('click', () => this.deleteCurrentButton());
        }
        this.cancelBtnConfig.addEventListener('click', () => this.cancelButtonEdit());
        // icon preview
        if (this.btnIcon) {
            this.btnIcon.addEventListener('change', () => this.updateIconPreview());
        }
        
        // Edit grid button
        const editGridBtn = document.getElementById('editGrid');
        const saveGridBtn = document.getElementById('saveGrid');
        const cancelEditBtn = document.getElementById('cancelEdit');
        
        if (editGridBtn) {
            editGridBtn.disabled = this.presetSelect.value !== 'custom';
            editGridBtn.title = this.presetSelect.value === 'custom' ? '' : '커스텀 프리셋에서만 편집할 수 있습니다.';
            editGridBtn.addEventListener('click', () => this.toggleEditMode(true));
        }
        // 초기 커스텀 여부를 바디 클래스에 반영
        document.body.classList.toggle('custom-preset', this.presetSelect.value === 'custom');
        if (saveGridBtn) {
            saveGridBtn.addEventListener('click', () => this.saveGridChanges());
        }
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => this.toggleEditMode(false));
        }
    }
    
    loadPreset(presetName) {
        const preset = this.presets[presetName];
        if (!preset) return;
        
        // Update grid size
        this.rows = preset.rows;
        this.cols = preset.cols;
        
        // Update UI
        this.gridRows.value = this.rows;
        this.gridCols.value = this.cols;
        
        // 커스텀 프리셋일 때만 버튼 배열을 보정
        if (presetName === 'custom') {
            this.ensureCustomButtons();
        }
        
        // Create the grid
        this.createGrid(preset.buttons);
    }
    
    createGrid(buttons = []) {
        this.buttonGrid.innerHTML = '';
        this.buttonGrid.style.gridTemplateColumns = `repeat(${this.cols}, var(--button-width))`;
        
        // Create grid cells
        const inEdit = document.body.classList.contains('edit-mode');
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const button = document.createElement('button');
                button.className = 'grid-btn';
                button.dataset.row = row;
                button.dataset.col = col;
                
                const presetName = this.presetSelect.value;
                if (presetName === 'custom') {
                    // Row-major index
                    const idx = row * this.cols + col;
                    if (idx < buttons.length) {
                        const cfg = { ...buttons[idx], row, col };
                        this.updateButtonUI(button, cfg);
                        button.addEventListener('click', () => this.onButtonClick(button));
                        this.buttonGrid.appendChild(button);
                        continue;
                    }
                    // Add tile at next position only in edit mode and if capacity remains in current layout
                    const hasCapacity = buttons.length < this.rows * this.cols;
                    if (inEdit && idx === buttons.length && hasCapacity) {
                        button.classList.add('add-tile');
                        button.innerHTML = '<span class="add-icon">＋</span><span class="add-label">버튼 추가</span>';
                        button.addEventListener('click', () => this.addNewButton());
                        this.buttonGrid.appendChild(button);
                        continue;
                    }
                    // Otherwise, do not append placeholders in custom mode
                } else {
                    // Preset modes: use exact row/col mapping
                    const btnConfig = buttons.find(b => b.row === row && b.col === col);
                    if (btnConfig) {
                        this.updateButtonUI(button, btnConfig);
                    } else {
                        button.style.visibility = 'hidden';
                        button.style.pointerEvents = 'none';
                    }
                    button.addEventListener('click', () => this.onButtonClick(button));
                    this.buttonGrid.appendChild(button);
                }
            }
        }

        // If grid is full but can grow and we are in edit mode, append a trailing add-tile
        if (this.presetSelect.value === 'custom' && inEdit) {
            const canGrow = (this.rows < this.maxRows) || (this.cols < this.maxCols);
            if (buttons.length >= this.rows * this.cols && canGrow) {
                const addBtn = document.createElement('button');
                addBtn.className = 'grid-btn add-tile';
                addBtn.innerHTML = '<span class="add-icon">＋</span><span class="add-label">버튼 추가</span>';
                addBtn.addEventListener('click', () => this.addNewButton());
                this.buttonGrid.appendChild(addBtn);
            }
        }
    }
    
    createCustomGrid() {
        const rows = parseInt(this.gridRows.value);
        const cols = parseInt(this.gridCols.value);
        
        if (rows < this.minRows || rows > this.maxRows || cols < this.minCols || cols > this.maxCols) {
            alert(`그리드 크기는 ${this.minRows}x${this.minCols}부터 ${this.maxRows}x${this.maxCols} 사이여야 합니다.`);
            return;
        }
        
        this.rows = rows;
        this.cols = cols;
        
        // Update custom preset
        this.presets.custom.rows = rows;
        this.presets.custom.cols = cols;
        
        // Generate default buttons
        const buttons = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const index = row * cols + col + 1;
                buttons.push({
                    label: `버튼 ${index}`,
                    value: `BUTTON_${index}`,
                    icon: '',
                    bgColor: this.getRandomPastelColor(),
                    row: row,
                    col: col
                });
            }
        }
        
        this.presets.custom.buttons = buttons;
        this.saveCustomPreset();
        this.createGrid(buttons);
        
        // Show a message when grid is created
        this.showNotification(`${rows}x${cols} 그리드가 생성되었습니다.`);
    }
    
    // Helper function to generate pastel colors
    getRandomPastelColor() {
        const hue = Math.floor(Math.random() * 360);
        return `hsl(${hue}, 70%, 85%)`;
    }
    
    // Ensure custom buttons array matches the current grid size
    ensureCustomButtons() {
        const preset = this.presets.custom;
        const expected = preset.rows * preset.cols;
        if (preset.buttons.length > expected) {
            preset.buttons.length = expected;
        }
        // Normalize positions to row-major order
        this.normalizeCustomButtons();
    }

    normalizeCustomButtons() {
        const preset = this.presets.custom;
        const normalized = [];
        for (let i = 0; i < preset.buttons.length; i++) {
            const row = Math.floor(i / this.cols);
            const col = i % this.cols;
            const b = preset.buttons[i];
            normalized.push({
                label: b.label || `버튼 ${i + 1}`,
                value: b.value || `BUTTON_${i + 1}`,
                icon: b.icon || '',
                bgColor: b.bgColor || this.getRandomPastelColor(),
                row,
                col
            });
        }
        preset.buttons = normalized;
    }
    
    async onButtonClick(button) {
        if (button.classList.contains('loading')) return;
        
        if (!document.body.classList.contains('edit-mode')) {
            // In normal mode, send the button value
            const value = button.dataset.value;
            if (value) {
                // Show loading state
                button.classList.add('loading');
                
                try {
                    const ble = getBle();
                    if (ble && ble.isConnected()) {
                        await ble.sendMessage(value);
                        this.showNotification(`전송 완료: ${value}`);
                    } else {
                        this.showNotification('오류: BLE 장치가 연결되지 않았습니다.', 'error');
                    }
                } catch (error) {
                    console.error('Error sending message:', error);
                    this.showNotification(`오류: ${error.message}`, 'error');
                } finally {
                    // Remove loading state
                    button.classList.remove('loading');
                    
                    // Show visual feedback
                    button.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        button.style.transform = '';
                    }, 100);
                }
            }
        } else {
            // In edit mode, open the button editor
            this.editButton(button);
        }
    }
    
    saveCustomPreset() {
        localStorage.setItem('customButtonGrid', JSON.stringify({
            rows: this.presets.custom.rows,
            cols: this.presets.custom.cols,
            buttons: this.presets.custom.buttons
        }));
    }
    
    editButton(button) {
        this.editingButton = button;
        const row = parseInt(button.dataset.row);
        const col = parseInt(button.dataset.col);
        const presetName = this.presetSelect.value;
        const preset = this.presets[presetName];
        
        // Find the button config
        let buttonConfig = preset.buttons.find(b => b.row === row && b.col === col);
        
        if (!buttonConfig) {
            // Create new button config if it doesn't exist
            buttonConfig = {
                label: `버튼 ${row * this.cols + col + 1}`,
                value: `BUTTON_${row * this.cols + col + 1}`,
                icon: '',
                bgColor: '#e0e0e0',
                row: row,
                col: col
            };
            preset.buttons.push(buttonConfig);
        }
        
        // Update form with button data
        this.btnLabel.value = buttonConfig.label || '';
        this.btnValue.value = buttonConfig.value || '';
        this.btnIcon.value = buttonConfig.icon || '';
        // Determine current background color; prefer computed style to reflect actual UI
        const computedBg = (button && window.getComputedStyle) ? window.getComputedStyle(button).backgroundColor : '';
        const currentBg = computedBg || buttonConfig.bgColor || '#e0e0e0';
        this.btnBgColor.value = this.toHexColor(currentBg);
        
        // Update icon preview initial
        this.updateIconPreview();
        // Show the modal
        if (this.modalOverlay) {
            this.modalOverlay.classList.remove('hidden');
        }
        this.btnLabel.focus();
    }

    // Convert various CSS color formats (hex/rgb(a)/hsl(a)) to #RRGGBB for <input type="color">
    toHexColor(colorString) {
        if (!colorString) return '#e0e0e0';
        const s = colorString.toString().trim().toLowerCase();
        // Already full hex
        if (/^#([0-9a-f]{6})$/.test(s)) return s;
        // Short hex #abc -> #aabbcc
        if (/^#([0-9a-f]{3})$/.test(s)) {
            const m = s.slice(1);
            return '#' + m.split('').map(c => c + c).join('');
        }
        // rgb/rgba
        if (s.startsWith('rgb')) {
            const nums = s.replace(/rgba?\(|\)/g, '').split(',').map(v => parseFloat(v.trim()));
            const [r,g,b] = nums;
            return '#' + [r,g,b].map(v => {
                const n = Math.max(0, Math.min(255, Math.round(v)));
                const h = n.toString(16).padStart(2, '0');
                return h;
            }).join('');
        }
        // hsl/hsla
        if (s.startsWith('hsl')) {
            const nums = s.replace(/hsla?\(|\)|%/g, '').split(',').map(v => parseFloat(v.trim()));
            const [h, sPerc, lPerc] = nums;
            const c = (1 - Math.abs(2 * (lPerc/100) - 1)) * (sPerc/100);
            const x = c * (1 - Math.abs(((h/60) % 2) - 1));
            const m = (lPerc/100) - c/2;
            let r1=0,g1=0,b1=0;
            if (0 <= h && h < 60) { r1=c; g1=x; b1=0; }
            else if (60 <= h && h < 120) { r1=x; g1=c; b1=0; }
            else if (120 <= h && h < 180) { r1=0; g1=c; b1=x; }
            else if (180 <= h && h < 240) { r1=0; g1=x; b1=c; }
            else if (240 <= h && h < 300) { r1=x; g1=0; b1=c; }
            else { r1=c; g1=0; b1=x; }
            const r = Math.round((r1 + m) * 255);
            const g = Math.round((g1 + m) * 255);
            const b = Math.round((b1 + m) * 255);
            return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
        }
        // Fallback
        return '#e0e0e0';
    }

    deleteCurrentButton() {
        if (!this.editingButton) return;
        const presetName = this.presetSelect.value;
        if (presetName !== 'custom') {
            this.showNotification('기본 프리셋에서는 삭제할 수 없습니다.', 'error');
            return;
        }
        const preset = this.presets.custom;
        if (preset.buttons.length <= 1) {
            this.showNotification('버튼은 최소 1개 이상이어야 합니다.', 'error');
            return;
        }
        const row = parseInt(this.editingButton.dataset.row);
        const col = parseInt(this.editingButton.dataset.col);
        const idx = row * this.cols + col;
        // Remove by index mapping
        preset.buttons.splice(idx, 1);
        this.normalizeCustomButtons();
        this.cancelButtonEdit();
        this.createGrid(this.presets.custom.buttons);
    }
    
    saveButtonConfig() {
        if (!this.editingButton) return;
        
        const row = parseInt(this.editingButton.dataset.row);
        const col = parseInt(this.editingButton.dataset.col);
        const presetName = this.presetSelect.value;
        const preset = this.presets[presetName];
        
        // Find or create button config
        let buttonConfig = preset.buttons.find(b => b.row === row && b.col === col);
        if (!buttonConfig) {
            buttonConfig = { row, col };
            preset.buttons.push(buttonConfig);
        }
        
        // Update button config
        const trimmedLabel = (this.btnLabel.value || '').trim().slice(0, 6);
        this.btnLabel.value = trimmedLabel;
        buttonConfig.label = trimmedLabel;
        buttonConfig.value = this.btnValue.value.trim();
        buttonConfig.icon = this.btnIcon.value.trim();
        buttonConfig.bgColor = this.btnBgColor.value;
        
        // Update button in UI (skip if it is add-tile)
        if (!this.editingButton.classList.contains('add-tile')) {
            this.updateButtonUI(this.editingButton, buttonConfig);
        }
        
        // Do not persist to localStorage here; defer to saveGridChanges()
        
        // Hide modal
        this.cancelButtonEdit();
    }
    
    cancelButtonEdit() {
        this.editingButton = null;
        if (this.modalOverlay) {
            this.modalOverlay.classList.add('hidden');
        }
    }
    
    showNotification(message, type = 'success') {
        // 전역 알림 사용
        notify(message, type);
    }
    
    updateButtonUI(button, config) {
        // Clear existing content
        button.innerHTML = '';
        button.style.backgroundColor = config.bgColor || '';
        
        // Add icon if specified (skip for add-tile)
        let hasIcon = false;
        if (config.icon && !button.classList.contains('add-tile')) {
            const iconVal = (config.icon || '').trim();
            if (iconVal.startsWith('emoji-')) {
                const span = document.createElement('span');
                span.textContent = iconVal.replace('emoji-', '');
                button.appendChild(span);
                hasIcon = true;
            } else {
                const firstToken = iconVal.split(/\s+/)[0] || '';
                const isFontAwesome = ['fa', 'fas', 'far', 'fal', 'fab'].includes(firstToken);
                if (isFontAwesome) {
                    const icon = document.createElement('i');
                    iconVal.split(' ').filter(cls => cls).forEach(cls => icon.classList.add(cls));
                    button.appendChild(icon);
                    hasIcon = true;
                } else {
                    const textIcon = document.createElement('span');
                    textIcon.className = 'text-icon';
                    textIcon.textContent = iconVal;
                    button.appendChild(textIcon);
                    hasIcon = true;
                }
            }
        }
        
        // Add label if specified
        if (config.label) {
            const label = document.createElement('span');
            const labelText = (config.label || '').toString().slice(0, 6);
            label.textContent = labelText;
            if (!hasIcon) {
                // 아이콘이 없는 경우, 라벨을 아이콘 크기/굵기로 표시
                label.classList.add('text-icon');
            }
            button.appendChild(label);
        }
        
        // Update data attributes
        button.dataset.value = config.value || '';
    }
    
    toggleEditMode(enable) {
        const editGridBtn = document.getElementById('editGrid');
        const saveGridBtn = document.getElementById('saveGrid');
        const cancelEditBtn = document.getElementById('cancelEdit');
        
        if (enable) {
            // 커스텀 전용 가드
            if (this.presetSelect.value !== 'custom') {
                this.showNotification('커스텀 프리셋에서만 편집할 수 있습니다.', 'error');
                return;
            }
            // 스냅샷 저장 (취소 시 롤백)
            this.editSnapshot = JSON.stringify(this.presets.custom);
            // 현재 행/열도 함께 저장하여 롤백 시 레이아웃 복원
            this.sizeSnapshot = { rows: this.rows, cols: this.cols };
            document.body.classList.add('edit-mode');
            editGridBtn.style.display = 'none';
            saveGridBtn.style.display = 'inline-block';
            cancelEditBtn.style.display = 'inline-block';
            this.showEditModeIndicator();
            // Re-render to expose add-tile if applicable
            if (this.presetSelect.value === 'custom') {
                this.createGrid(this.presets.custom.buttons);
            }
        } else {
            document.body.classList.remove('edit-mode');
            editGridBtn.style.display = 'inline-block';
            saveGridBtn.style.display = 'none';
            cancelEditBtn.style.display = 'none';
            this.hideEditModeIndicator();
            
            // 모달이 열려있으면 닫기
            if (this.modalOverlay && !this.modalOverlay.classList.contains('hidden')) {
                this.cancelButtonEdit();
            }
            // 편집 취소 시 롤백, 저장 시엔 editSnapshot이 null이어야 함
            if (this.editSnapshot) {
                try {
                    this.presets.custom = JSON.parse(this.editSnapshot);
                    if (this.sizeSnapshot) {
                        this.rows = this.sizeSnapshot.rows;
                        this.cols = this.sizeSnapshot.cols;
                        this.presets.custom.rows = this.rows;
                        this.presets.custom.cols = this.cols;
                    }
                } catch (e) {
                    console.error('Failed to rollback snapshot', e);
                }
            }
            this.editSnapshot = null;
            this.sizeSnapshot = null;
            // 항상 재렌더링하여 add-tile 등 편집용 요소 제거
            const presetName = this.presetSelect.value;
            const preset = this.presets[presetName];
            this.createGrid(preset.buttons);
        }
    }
    
    showEditModeIndicator() {
        // Remove any existing indicator
        this.hideEditModeIndicator();
        
        // Create and show the indicator
        const indicator = document.createElement('div');
        indicator.className = 'edit-mode-indicator';
        indicator.textContent = '편집 모드';
        document.body.appendChild(indicator);
        
        // Add click handler to exit edit mode
        indicator.addEventListener('click', () => this.toggleEditMode(false));
    }
    
    hideEditModeIndicator() {
        const indicator = document.querySelector('.edit-mode-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    saveGridChanges() {
        // Save any pending changes
        if (this.editingButton) {
            this.saveButtonConfig();
        }
        
        // Persist only on save and ensure no add-tiles remain
        if (this.presetSelect.value === 'custom') {
            this.saveCustomPreset();
        }
        this.editSnapshot = null;
        this.sizeSnapshot = null;
        // Re-render clean grid
        this.createGrid(this.presets[this.presetSelect.value].buttons);
        // Exit edit mode
        this.toggleEditMode(false);
    }

    addNewButton() {
        const preset = this.presets.custom;
        // Ensure capacity; expand rows first, then cols if needed
        if (preset.buttons.length >= this.rows * this.cols) {
            if (this.rows < this.maxRows) {
                this.rows += 1;
                preset.rows = this.rows;
            } else if (this.cols < this.maxCols) {
                this.cols += 1;
                preset.cols = this.cols;
            } else {
                this.showNotification('최대 크기에 도달했습니다.', 'error');
                return;
            }
        }
        const index = preset.buttons.length;
        const row = Math.floor(index / this.cols);
        const col = index % this.cols;
        preset.buttons.push({
            label: `버튼 ${index + 1}`,
            value: `BUTTON_${index + 1}`,
            icon: '',
            bgColor: this.getRandomPastelColor(),
            row,
            col
        });
        this.createGrid(preset.buttons);
    }

    updateIconPreview() {
        const val = this.btnIcon.value || '';
        if (this.btnIconPreview) {
            this.btnIconPreview.className = '';
            this.btnIconPreview.style.display = 'none';
        }
        if (this.btnEmojiPreview) {
            this.btnEmojiPreview.textContent = '';
            this.btnEmojiPreview.style.display = 'none';
            try { this.btnEmojiPreview.classList.remove('text-icon'); } catch (e) {}
        }
        if (!val) return;
        if (val.startsWith('emoji-')) {
            if (this.btnEmojiPreview) {
                this.btnEmojiPreview.textContent = val.replace('emoji-', '');
                this.btnEmojiPreview.style.display = 'inline-block';
            }
        } else {
            const firstToken = val.trim().split(/\s+/)[0] || '';
            const isFontAwesome = ['fa', 'fas', 'far', 'fal', 'fab'].includes(firstToken);
            if (isFontAwesome) {
                if (this.btnIconPreview) {
                    val.split(' ').filter(Boolean).forEach(cls => this.btnIconPreview.classList.add(cls));
                    this.btnIconPreview.style.display = 'inline-block';
                }
            } else {
                if (this.btnEmojiPreview) {
                    this.btnEmojiPreview.textContent = val;
                    this.btnEmojiPreview.classList.add('text-icon');
                    this.btnEmojiPreview.style.display = 'inline-block';
                }
            }
        }
    }
    
    loadCustomPreset() {
        const saved = localStorage.getItem('customButtonGrid');
        if (saved) {
            try {
                const config = JSON.parse(saved);
                this.presets.custom = config;
            } catch (e) {
                console.error('Failed to load custom preset:', e);
            }
        }
    }
}

// Export the ButtonGridManager class
export { ButtonGridManager };

// Initialize the button grid when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const buttonGrid = new ButtonGridManager();
    buttonGrid.loadPreset('custom'); // Load custom preset by default
    
    // Add global click handler to close editor when clicking outside
    document.addEventListener('click', (e) => {
        const editor = document.getElementById('buttonEditor');
        if (editor && editor.style.display === 'block' && 
            !editor.contains(e.target) && 
            !e.target.closest('.grid-btn')) {
            buttonGrid.cancelButtonEdit();
        }
    });
    
    // Make buttonGrid available for debugging
    window.buttonGrid = buttonGrid;
    
    // 버튼 보드가 활성화될 때 별도 초기화 불필요 (전역 bleConnection 사용)
});
