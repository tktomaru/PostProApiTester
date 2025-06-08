// init.ts
// ───────────────────────────────────────────────────────────────────────────────
// ページ読み込み時に実行される、全体の初期化処理とイベント登録をまとめる

import {
    state
} from './state';

import {
    setupEventListeners,
    setupTabSwitching,
    renderAuthDetails,
    addKeyValueRow,
    showError,
    showSuccess
} from './utils';

import {
    handleFileSelect,
    handleImport,
    initializeTestScript
} from './importExport';

import {
    initializeVariablesManagement,
    renderEnvironmentSelector,
    updateCollectionVarSelector,
    renderAllVariables
} from './variableManager';

import { initializeCollections } from './collectionManager';
import { renderHistory } from './historyManager';
import { newScenario, runScenario, initializeScenarios } from './scenarioManager';

// Authentication handlers
function setupAuthHandlers(): void {
    const authTypeSelect = document.getElementById('authType') as HTMLSelectElement;
    authTypeSelect?.addEventListener('change', function () {
        const authType = this.value;
        state.currentRequest.auth.type = authType as any;
        renderAuthDetails(authType);
    });
}

// Modal handlers
function setupModalHandlers(): void {
    const modal = document.getElementById('importExportModal');
    if (!modal) return;

    const closeButtons = modal.querySelectorAll('.modal-close');

    closeButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            modal.classList.remove('active');
        });
    });

    // Click outside to close
    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    // File input handling
    const fileInput = document.getElementById('importFile') as HTMLInputElement;
    const fileDropZone = document.getElementById('fileDropZone');

    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    if (fileDropZone) {
        fileDropZone.addEventListener('click', function () {
            fileInput?.click();
        });

        fileDropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            this.classList.add('dragover');
        });

        fileDropZone.addEventListener('dragleave', function () {
            this.classList.remove('dragover');
        });

        fileDropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            this.classList.remove('dragover');

            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                handleFileSelect({ target: { files } } as any);
            }
        });
    }

    // Import submit
    const importSubmitBtn = document.getElementById('importSubmitBtn');
    importSubmitBtn?.addEventListener('click', handleImport);
}

// Key-Value editors initialization
function initializeKeyValueEditors(): void {
    initializeParamsEditor();
    initializeHeadersEditor();
    setupAddButtons();
}

function initializeParamsEditor(): void {
    const container = document.getElementById('paramsContainer') as HTMLElement;
    if (container && container.children.length === 0) {
        addKeyValueRow(container, 'param');
    }
}

function initializeHeadersEditor(): void {
    const container = document.getElementById('headersContainer') as HTMLElement;
    if (container && container.children.length === 0) {
        addKeyValueRow(container, 'header');
    }
}

function setupAddButtons(): void {
    const addParamBtn = document.querySelector('.add-param');
    addParamBtn?.addEventListener('click', function () {
        const container = document.getElementById('paramsContainer') as HTMLElement;
        if (container) {
            addKeyValueRow(container, 'param');
        }
    });

    const addHeaderBtn = document.querySelector('.add-header');
    addHeaderBtn?.addEventListener('click', function () {
        const container = document.getElementById('headersContainer') as HTMLElement;
        if (container) {
            addKeyValueRow(container, 'header');
        }
    });
}

async function initializeApp(): Promise<void> {
    try {
        // ─────────────────────────────
        // 1. 最初に UI 周りのイベントだけ設定
        // （タブ切り替え・モーダル開閉・ボタンイベントなど）
        setupEventListeners();
        setupTabSwitching();
        setupModalHandlers();

        // ─────────────────────────────
        // 2. ストレージからデータをロードし、必要ならサンプル投入

        // 2-2. コレクションの初期化（サンプルコレクション投入）
        await initializeCollections();

        // シナリオ初期化
        await initializeScenarios();

        // ボタンにイベントを紐づけ
        const newScenarioBtn = document.getElementById('newScenarioBtn');
        newScenarioBtn?.addEventListener('click', () => {
            newScenario();
        });

        const runScenarioBtn = document.getElementById('runScenarioBtn');
        runScenarioBtn?.addEventListener('click', () => {
            runScenario();
        });

        // 2-1. 変数管理関連の初期化（グローバル／環境／コレクション変数投入）
        await initializeVariablesManagement();

        // 2-3. 履歴の表示（もし保存済みあれば表示、なければ空状態を表示）
        renderHistory();

        // ─────────────────────────────
        // 3. Key-Value エディタや認証フォームの初期化
        initializeKeyValueEditors();
        setupAuthHandlers();

        // ─────────────────────────────
        // 4. テストスクリプト欄にサンプルをセット
        initializeTestScript();

        // ─────────────────────────────
        console.log('API Tester initialized successfully');
    } catch (error: any) {
        console.error('Initialization error:', error);
        showError('Failed to initialize: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});