interface Settings {
    openDevTools: boolean;
    requestTimeout: number;
    followRedirects: boolean;
    validateSSL: boolean;
    maxHistoryItems: number;
}

const defaultSettings: Settings = {
    openDevTools: true,
    requestTimeout: 30000,
    followRedirects: true,
    validateSSL: true,
    maxHistoryItems: 100
};

export class SettingsManager {
    private static instance: SettingsManager;
    private settings: Settings;

    private constructor() {
        this.settings = { ...defaultSettings };
        this.loadSettings();
    }

    public static getInstance(): SettingsManager {
        if (!SettingsManager.instance) {
            SettingsManager.instance = new SettingsManager();
        }
        return SettingsManager.instance;
    }

    private async loadSettings(): Promise<void> {
        try {
            const result = await chrome.storage.sync.get('settings');
            if (result.settings) {
                this.settings = { ...defaultSettings, ...result.settings };
            }
        } catch (error) {
            console.error('設定の読み込みに失敗しました:', error);
        }
    }

    public async saveSettings(settings: Partial<Settings>): Promise<void> {
        try {
            this.settings = { ...this.settings, ...settings };
            await chrome.storage.sync.set({ settings: this.settings });
        } catch (error) {
            console.error('設定の保存に失敗しました:', error);
        }
    }

    public getSettings(): Settings {
        return { ...this.settings };
    }

    public async resetSettings(): Promise<void> {
        try {
            this.settings = { ...defaultSettings };
            await chrome.storage.sync.set({ settings: this.settings });
        } catch (error) {
            console.error('設定のリセットに失敗しました:', error);
        }
    }
}

// 設定UIの初期化とイベントハンドラの設定
export function initializeSettingsUI(): void {
    const settingsManager = SettingsManager.getInstance();
    const settings = settingsManager.getSettings();

    // 設定値の反映
    const openDevToolsInput = document.getElementById('openDevTools') as HTMLInputElement;
    const requestTimeoutInput = document.getElementById('requestTimeout') as HTMLInputElement;
    const followRedirectsInput = document.getElementById('followRedirects') as HTMLInputElement;
    const validateSSLInput = document.getElementById('validateSSL') as HTMLInputElement;
    const maxHistoryItemsInput = document.getElementById('maxHistoryItems') as HTMLInputElement;

    if (openDevToolsInput) openDevToolsInput.checked = settings.openDevTools;
    if (requestTimeoutInput) requestTimeoutInput.value = settings.requestTimeout.toString();
    if (followRedirectsInput) followRedirectsInput.checked = settings.followRedirects;
    if (validateSSLInput) validateSSLInput.checked = settings.validateSSL;
    if (maxHistoryItemsInput) maxHistoryItemsInput.value = settings.maxHistoryItems.toString();

    // 設定の保存ボタンのイベントハンドラ
    const saveButton = document.getElementById('saveSettings');
    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            const newSettings: Partial<Settings> = {
                openDevTools: openDevToolsInput?.checked ?? true,
                requestTimeout: parseInt(requestTimeoutInput?.value ?? '30000'),
                followRedirects: followRedirectsInput?.checked ?? true,
                validateSSL: validateSSLInput?.checked ?? true,
                maxHistoryItems: parseInt(maxHistoryItemsInput?.value ?? '100')
            };

            await settingsManager.saveSettings(newSettings);
            closeSettingsModal();
        });
    }

    // 設定のリセットボタンのイベントハンドラ
    const resetButton = document.getElementById('resetSettings');
    if (resetButton) {
        resetButton.addEventListener('click', async () => {
            await settingsManager.resetSettings();
            initializeSettingsUI();
        });
    }
}

// 設定モーダルの表示
export function showSettingsModal(): void {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('active');
    }
}

// 設定モーダルの非表示
export function closeSettingsModal(): void {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// 設定モーダルの初期化
export function initializeSettingsModal(): void {
    const settingsButton = document.getElementById('settingsBtn');
    const closeButton = document.querySelector('#settingsModal .close-btn');

    settingsButton?.addEventListener('click', showSettingsModal);
    closeButton?.addEventListener('click', closeSettingsModal);

    // モーダル外クリックで閉じる
    document.getElementById('settingsModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeSettingsModal();
        }
    });
} 