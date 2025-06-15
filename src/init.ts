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
    autoResizeTextarea
} from './utils';

import {
    handleFileSelect,
    handleImport,
    initializeTestScript
} from './importExport';

import { initializeCollections } from './collectionManager';
import { renderHistory } from './historyManager';
import { newScenario, runScenario, initializeScenarios } from './scenarioManager';
import { initializeVariablesManagement } from './variableManager';
import { initializeSettingsUI, initializeSettingsModal } from './settings';

/**
 * 認証関連のイベントハンドラー設定
 * 認証タイプの変更時に適切な認証フォームを表示
 */
function setupAuthHandlers(): void {
    const authTypeSelect = document.getElementById('authType') as HTMLSelectElement;
    authTypeSelect?.addEventListener('change', function () {
        const authType = this.value;
        if (state.currentRequest) {
            state.currentRequest.auth.type = authType as any;
            renderAuthDetails(authType);
        }
    });
}

/**
 * モーダルダイアログのイベントハンドラー設定
 * インポート・エクスポートモーダルの開閉とファイル操作を管理
 */
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

    // Sample import button
    const importSampleBtn = document.getElementById('importSampleBtn');
    importSampleBtn?.addEventListener('click', async () => {
        try {
            const { importSampleData } = await import('./importExport');
            await importSampleData();
            modal.classList.remove('active');
        } catch (error: any) {
            console.error('Failed to import sample data:', error);
        }
    });
}

/**
 * キー・バリューエディタの初期化
 * パラメータ、ヘッダー、フォームデータエディタの初期設定
 */
function initializeKeyValueEditors(): void {
    initializeParamsEditor();
    initializeHeadersEditor();
    setupAddButtons();
}

/**
 * パラメータエディタの初期化
 * 初期の空行を追加して編集可能な状態にする
 */
function initializeParamsEditor(): void {
    const container = document.getElementById('paramsContainer') as HTMLElement;
    if (container && container.children.length === 0) {
        addKeyValueRow(container, 'param');
    }
}

/**
 * ヘッダーエディタの初期化
 * 初期の空行を追加して編集可能な状態にする
 */
function initializeHeadersEditor(): void {
    const container = document.getElementById('headersContainer') as HTMLElement;
    if (container && container.children.length === 0) {
        addKeyValueRow(container, 'header');
    }
}

/**
 * 追加ボタンのイベント設定
 * パラメータ、ヘッダー、フォームデータの行追加ボタンを設定
 */
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

    const addFormDataBtn = document.querySelector('.add-form-data');
    addFormDataBtn?.addEventListener('click', function () {
        const container = document.getElementById('formDataFieldsContainer') as HTMLElement;
        if (container) {
            addKeyValueRow(container, 'body');
        }
    });
}

/**
 * 開発者ツールの使用を促すガイダンスを表示
 */
function showDevToolsGuidance(): void {
    try {
        // さりげない通知でガイダンスを表示
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border: 1px solid rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease-out;
        `;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">🛠️</span>
                <span>Press F12 for better debugging experience</span>
            </div>
        `;

        document.body.appendChild(notification);

        // アニメーション表示
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);

        // 4秒後に自動的に削除
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);

        console.log('Developer tools guidance shown');
    } catch (error) {
        console.warn('Failed to show developer tools guidance:', error);
    }
}


/**
 * プリリクエストスクリプト欄の設定
 * テキストエリアの自動リサイズ機能を設定
 */
function setupPreRequestScript(): void {
    const ta = document.getElementById('preRequestScript') as HTMLTextAreaElement | null;
    if (!ta) return;

    // 初期ロード時にも高さを合わせておく
    autoResizeTextarea(ta);

    // スクリプトをタイプしたり、loadRequestIntoEditor() 等で中身が set されたあとにも
    ta.addEventListener('input', () => autoResizeTextarea(ta));
}

/**
 * テストスクリプト欄の設定
 * テキストエリアの自動リサイズ機能を設定
 */
function setupTestScript(): void {
    const ta = document.getElementById('testScript') as HTMLTextAreaElement | null;
    if (!ta) return;

    // 初期ロード時にも高さを合わせておく
    autoResizeTextarea(ta);

    // スクリプトをタイプしたり、loadRequestIntoEditor() 等で中身が set されたあとにも
    ta.addEventListener('input', () => autoResizeTextarea(ta));
}

/**
 * アプリケーション全体の初期化処理
 * UI、イベントリスナー、データの読み込み、各種マネージャーの初期化を順次実行
 */
async function initializeApp(): Promise<void> {
    try {
        // ─────────────────────────────
        // 1. 最初に UI 周りのイベントだけ設定
        // （タブ切り替え・モーダル開閉・ボタンイベントなど）
        setupEventListeners();
        setupTabSwitching();
        setupModalHandlers();
        setupPreRequestScript();
        setupTestScript();

        // Chrome拡張機能のランタイムメッセージを受け取る
        chrome.runtime.onMessage.addListener((message: any) => {
            if (message.action === 'openDevTools') {
                // レガシー対応：インターセプターのタブを開く
                const devToolsTab = document.querySelector('[data-tab="interceptor"]') as HTMLElement;
                if (devToolsTab) {
                    devToolsTab.click();
                }
            } else if (message.action === 'openDevToolsF12') {
                // 開発者ツールの使用ガイダンスを表示
                showDevToolsGuidance();
            }
        });

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

/**
 * DOMコンテンツ読み込み完了時の初期化処理
 * アプリケーションのメイン初期化と設定機能の初期化を実行
 */
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();

    // 設定機能の初期化
    try {
        initializeSettingsUI();
        initializeSettingsModal();
    } catch (error) {
        console.error('設定の初期化に失敗しました:', error);
    }
});