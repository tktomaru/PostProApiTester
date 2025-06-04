// init.js
// ───────────────────────────────────────────────────────────────────────────────
// ページ読み込み時に実行される、全体の初期化処理とイベント登録をまとめる

import {
    loadAllStoredData,
    collections,
    currentCollection,
    variables,
    environments
} from './state.js';

import {
    setupEventListeners,
    setupTabSwitching
} from './utils.js';

import {
    handleFileSelect,
    handleImport
} from './importExport.js';


import {
    initializeVariablesManagement,
    renderEnvironmentSelector,
    updateCollectionVarSelector,
    renderAllVariables
} from './variableManager.js';

import { renderCollections } from './collectionManager.js';
import { renderHistory } from './historyManager.js';

import { addKeyValueRow } from './utils.js';


// Authentication handlers
function setupAuthHandlers() {
    const authTypeSelect = document.getElementById('authType');
    authTypeSelect.addEventListener('change', function () {
        const authType = this.value;
        currentRequest.auth.type = authType;
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


document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. イベントリスナー／タブ切り替え登録など
        setupEventListeners();
        setupTabSwitching();
        setupModalHandlers();

        // 2. ストレージからデータを読み込む
        await loadAllStoredData();

        // 3. UI初期化：Key-Value エディタ、Auth ハンドラ
        initializeKeyValueEditors();
        setupAuthHandlers();

        // 4. 変数管理の初期化（環境読み込み後）
        await initializeVariablesManagement();

        // 5. 初期レンダリング：コレクション一覧、履歴一覧、環境セレクタ
        renderCollections();
        renderHistory();
        renderEnvironmentSelector();
        updateCollectionVarSelector();
        renderAllVariables();

        console.log('API Tester initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
        // showError は utils.js 経由で呼べる想定
        const { showError } = await import('./utils.js');
        showError('Failed to initialize: ' + error.message);
    }
});
