// init.js
// ───────────────────────────────────────────────────────────────────────────────
// ページ読み込み時に実行される、全体の初期化処理とイベント登録をまとめる

import {
    state
} from './state.js';

import {
    setupEventListeners,
    setupTabSwitching
} from './utils.js';

import {
    handleFileSelect,
    handleImport
} from './importExport.js';

import { initializeTestScript } from './importExport.js';

import {
    initializeVariablesManagement,
    renderEnvironmentSelector,
    updateCollectionVarSelector,
    renderAllVariables
} from './variableManager.js';

import { initializeCollections } from './collectionManager.js';
import { renderHistory } from './historyManager.js';

import { addKeyValueRow } from './utils.js';
import { showError, showSuccess } from './utils.js';

// Authentication handlers
function setupAuthHandlers() {
    const authTypeSelect = document.getElementById('authType');
    authTypeSelect.addEventListener('change', function () {
        const authType = this.value;
        state.currentRequest.auth.type = authType;
        renderAuthDetails(authType);
    });
}

// Modal handlers
function setupModalHandlers() {
    const modal = document.getElementById('importExportModal');
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
    const fileInput = document.getElementById('importFile');
    const fileDropZone = document.getElementById('fileDropZone');

    fileInput.addEventListener('change', handleFileSelect);

    fileDropZone.addEventListener('click', function () {
        fileInput.click();
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

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect({ target: { files } });
        }
    });

    // Import submit
    document.getElementById('importSubmitBtn').addEventListener('click', handleImport);
}


// Key-Value editors initialization
function initializeKeyValueEditors() {
    initializeParamsEditor();
    initializeHeadersEditor();
    setupAddButtons();
}

function initializeParamsEditor() {
    const container = document.getElementById('paramsContainer');
    if (container.children.length === 0) {
        addKeyValueRow(container, 'param');
    }
}

function initializeHeadersEditor() {
    const container = document.getElementById('headersContainer');
    if (container.children.length === 0) {
        addKeyValueRow(container, 'header');
    }
}

function setupAddButtons() {
    document.querySelector('.add-param').addEventListener('click', function () {
        const container = document.getElementById('paramsContainer');
        addKeyValueRow(container, 'param');
    });

    document.querySelector('.add-header').addEventListener('click', function () {
        const container = document.getElementById('headersContainer');
        addKeyValueRow(container, 'header');
    });
}

async function initializeApp() {
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
    } catch (error) {
        console.error('Initialization error:', error);
        // showError は utils.js か別モジュールに定義してある想定
        showError('Failed to initialize: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});
