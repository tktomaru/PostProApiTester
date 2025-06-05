// utils.js
// ───────────────────────────────────────────────────────────────────────────────
// 汎用ユーティリティ関数群、タブ切り替え、イベント登録、一部の小さなヘルパーをまとめる
// state.js を動的にインポートしてstate.currentRequest を取得
import { state } from './state.js';
import { displayResponse } from './requestManager.js';
import { createNewCollection } from './collectionManager.js';
import { clearHistory } from './historyManager.js';
import { startInterceptor } from './interceptorManager.js';
import { stopInterceptor } from './interceptorManager.js';
/**
 * escapeHtml
 *  XSS 対策用にテキストをエスケープして安全に innerHTML に渡す
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * formatBytes
 *  バイト数を「KB/MB/...」単位で表記に変換
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * showNotification / showSuccess / showError
 *  画面に一時通知バナーを出す
 */
export function showNotification(message, type = 'info') {
    const area = document.getElementById('notificationArea');
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    area.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

export function showSuccess(message) {
    showNotification(message, 'success');
}

export function showError(message) {
    showNotification(message, 'error');
}

/**
 * getValueByPath
 *  ドット区切りのパス(“a.b.c”)でネストされたオブジェクトから値を取得
 */
export function getValueByPath(obj, path) {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
}

/**
 * addKeyValueRow
 *  Key-Value Editor（パラメータ／ヘッダなど）の行を追加する
 */
export function addKeyValueRow(container, type) {
    const row = document.createElement('div');
    row.className = 'key-value-row';
    row.innerHTML = `
        <input type="text" placeholder="Key" class="key-input">
        <input type="text" placeholder="Value" class="value-input">
        <input type="text" placeholder="Description" class="description-input">
        <button type="button" class="delete-btn">×</button>
    `;
    const keyInput = row.querySelector('.key-input');
    const valueInput = row.querySelector('.value-input');
    const deleteBtn = row.querySelector('.delete-btn');

    keyInput.addEventListener('input', async () => await updateRequestData(type));
    valueInput.addEventListener('input', async () => await updateRequestData(type));
    deleteBtn.addEventListener('click', () => {
        row.remove();
        updateRequestData(type);
    });

    container.appendChild(row);
}

/** collectKeyValues */
export function collectKeyValues(containerId) {
    const container = document.getElementById(containerId);
    const rows = container.querySelectorAll('.key-value-row');
    const result = {};
    rows.forEach(row => {
        const key = row.querySelector('.key-input').value.trim();
        const value = row.querySelector('.value-input').value.trim();
        if (key) {
            result[key] = value;
        }
    });
    return result;
}


/** updateRequestData を async 関数に変更 */
export async function updateRequestData(type) {
    // state.currentRequest が undefined の場合は何もしない
    if (!state.currentRequest) {
        console.warn('updateRequestData: state.currentRequest が未定義です');
        return;
    }

    if (type === 'param') {
        state.currentRequest.params = collectKeyValues('paramsContainer');
    } else if (type === 'header') {
        state.currentRequest.headers = collectKeyValues('headersContainer');
    }
}
/**
 * setupEventListeners
 *  ページ全体で使う「クリック・入力」などのイベントを一度にまとめる
 */
export function setupEventListeners() {
    // Send ボタン
    document.getElementById('sendBtn').addEventListener('click', async () => {
        const { sendRequest } = await import('./requestManager.js');
        sendRequest();
    });
    // メソッド・URL 更新時
    document.getElementById('methodSelect').addEventListener('change', e => {
        state.currentRequest.method = e.target.value;
    });
    document.getElementById('urlInput').addEventListener('input', e => {
        state.currentRequest.url = e.target.value;
        // ここで必ず最新の URL を state.currentRequest.url に代入する
        if (state.currentRequest) {
            state.currentRequest.url = e.target.value;
        }
    });
    // インポート・エクスポート・設定
    document.getElementById('importBtn').addEventListener('click', () => {
        import('./importExport.js').then(mod => mod.openImportModal());
    });
    document.getElementById('exportBtn').addEventListener('click', () => {
        import('./importExport.js').then(mod => mod.exportData());
    });
    document.getElementById('settingsBtn').addEventListener('click', () => {
        showError('Settings panel not yet implemented');
    });
    // コレクション管理（New Collection）
    document.getElementById('createCollectionBtn').addEventListener('click', async () => {
        createNewCollection();
    });
    // 履歴（検索・クリア）
    document.getElementById('historySearch').addEventListener('input', () => {
        import('./historyManager.js').then(mod => mod.filterHistory());
    });
    document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
        clearHistory();
    });
    // インターセプタ（開始・停止）
    document.getElementById('startInterceptorBtn').addEventListener('click', async () => {
        startInterceptor();
    });
    document.getElementById('stopInterceptorBtn').addEventListener('click', async () => {
        stopInterceptor();
    });
    // Body タイプ切り替え
    document.querySelectorAll('input[name="bodyType"]').forEach(radio => {
        radio.addEventListener('change', e => {
            handleBodyTypeChange(e);
        });
    });
    // Raw Body 入力
    document.getElementById('rawBody').addEventListener('input', e => {
        state.currentRequest.body = e.target.value;
    });
}

/**
 * setupTabSwitching
 *  メインタブ・サブタブ・レスポンスタブ・フォーマット切り替えを登録
 */
export function setupTabSwitching() {
    // メインタブ
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const tabName = this.dataset.tab;
            switchMainTab(tabName);
        });
    });
    // サブタブ
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const subtabName = this.dataset.subtab;
            switchSubTab(subtabName);
        });
    });
    // レスポンスタブ
    document.querySelectorAll('.response-tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const restabName = this.dataset.restab;
            switchResponseTab(restabName);
        });
    });
    // フォーマット切り替え
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.format-btn').forEach(x => x.classList.remove('active'));
            this.classList.add('active');
            const format = this.dataset.format;
            if (window.lastResponse) {
                displayResponse(window.lastResponse, format);
            }
        });
    });
}

/**
 * switchMainTab
 *  メインタブ選択時の表示切り替え
 */
export function switchMainTab(tabName) {
    console.log(tabName);
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

/**
 * switchSubTab
 *  サブタブ選択時の表示切り替え
 */
export function switchSubTab(subtabName) {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector(`[data-subtab="${subtabName}"]`).classList.add('active');
    document.getElementById(`${subtabName}-subtab`).classList.add('active');
}

/**
 * switchResponseTab
 *  レスポンスタブ選択時の表示切り替え
 */
export function switchResponseTab(restabName) {
    document.querySelectorAll('.response-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.response-tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector(`[data-restab="${restabName}"]`).classList.add('active');
    document.getElementById(`response-${restabName}`).classList.add('active');
}

export function renderAuthDetails(authType) {
    const container = document.getElementById('authDetails');
    container.innerHTML = '';

    switch (authType) {
        case 'basic':
            container.innerHTML = `
                <div class="auth-field">
                    <label>Username</label>
                    <input type="text" id="authUsername" placeholder="Enter username">
                </div>
                <div class="auth-field">
                    <label>Password</label>
                    <input type="password" id="authPassword" placeholder="Enter password">
                </div>
            `;
            break;

        case 'bearer':
            container.innerHTML = `
                <div class="auth-field">
                    <label>Token</label>
                    <input type="text" id="authToken" placeholder="Enter bearer token">
                </div>
            `;
            break;

        case 'apikey':
            container.innerHTML = `
                <div class="auth-field">
                    <label>Key</label>
                    <input type="text" id="authKey" placeholder="Enter API key name">
                </div>
                <div class="auth-field">
                    <label>Value</label>
                    <input type="text" id="authValue" placeholder="Enter API key value">
                </div>
                <div class="auth-field">
                    <label>Add to</label>
                    <select id="authAddTo">
                        <option value="header">Header</option>
                        <option value="query">Query Params</option>
                    </select>
                </div>
            `;
            break;

        case 'oauth2':
            container.innerHTML = `
                <div class="auth-field">
                    <label>Access Token</label>
                    <input type="text" id="authAccessToken" placeholder="Enter access token">
                </div>
                <div class="auth-field">
                    <label>Token Type</label>
                    <select id="authTokenType">
                        <option value="Bearer">Bearer</option>
                        <option value="MAC">MAC</option>
                    </select>
                </div>
                <button class="btn btn-sm" onclick="getOAuth2Token()">Get New Access Token</button>
            `;
            break;
    }

    // Add event listeners to auth inputs
    container.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateAuthData);
        input.addEventListener('change', updateAuthData);
    });
}

export function updateAuthData() {
    // state.currentRequest が undefined であればエラーになってしまうため確認
    if (!state.currentRequest) {
        console.error('updateAuthData: state.currentRequest が undefined です');
        return;
    }

    const authType = state.currentRequest.auth?.type || 'none';
    // auth オブジェクトをいったん置き換える
    state.currentRequest.auth = { type: authType };

    switch (authType) {
        case 'basic':
            state.currentRequest.auth.username = document.getElementById('authUsername')?.value || '';
            state.currentRequest.auth.password = document.getElementById('authPassword')?.value || '';
            break;

        case 'bearer':
            state.currentRequest.auth.token = document.getElementById('authToken')?.value || '';
            break;

        case 'apikey':
            state.currentRequest.auth.key = document.getElementById('authKey')?.value || '';
            state.currentRequest.auth.value = document.getElementById('authValue')?.value || '';
            state.currentRequest.auth.addTo = document.getElementById('authAddTo')?.value || 'header';
            break;

        case 'oauth2':
            state.currentRequest.auth.accessToken = document.getElementById('authAccessToken')?.value || '';
            state.currentRequest.auth.tokenType = document.getElementById('authTokenType')?.value || 'Bearer';
            break;

        default:
            // 何もしない（type が none の場合など）
            break;
    }
}
export function showLoading(show) {
    const sendBtn = document.getElementById('sendBtn');
    if (show) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
    } else {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
    }
}

// Body type handling

export function handleBodyTypeChange(event) {
    const bodyType = event.target.value;
    const rawBody = document.getElementById('rawBody');
    const jsonEditor = document.getElementById('jsonEditor');
    const formDataContainer = document.getElementById('formDataContainer');

    // まずすべて非表示にする
    rawBody.style.display = 'none';
    jsonEditor.style.display = 'none';
    formDataContainer.style.display = 'none';

    // 選択された bodyType に応じて表示切り替え
    switch (bodyType) {
        case 'raw':
            rawBody.style.display = 'block';
            break;

        case 'json':
            jsonEditor.style.display = 'block';
            break;

        case 'form-data':
        case 'urlencoded':
            formDataContainer.style.display = 'block';
            if (!formDataContainer.children.length) {
                // 最初にキー・バリュー行がなければ追加
                addKeyValueRow(formDataContainer, 'body');
            }
            break;

        default: // 'none'
            // 何もしない（全て非表示のまま）
            break;
    }
}