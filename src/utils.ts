// utils.ts
// ───────────────────────────────────────────────────────────────────────────────
// 汎用ユーティリティ関数群、タブ切り替え、イベント登録、一部の小さなヘルパーをまとめる

import { state, saveCollectionsToStorage } from './state';
import { displayResponse, saveCurrentRequest, sendRequest } from './requestManager';
import { createNewCollection } from './collectionManager';
import { clearHistory, filterHistory } from './historyManager';
import { startInterceptor, stopInterceptor } from './interceptorManager';
import { openImportModal, exportData } from './importExport';

/**
 * escapeHtml
 *  XSS 対策用にテキストをエスケープして安全に innerHTML に渡す
 */
export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * formatBytes
 *  バイト数を「KB/MB/...」単位で表記に変換
 */
export function formatBytes(bytes: number): string {
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
export function showNotification(message: string, type: string = 'info'): void {
    const area = document.getElementById('notificationArea');
    if (!area) return;
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    area.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

export function showSuccess(message: string): void {
    showNotification(message, 'success');
}

export function showError(message: string): void {
    showNotification(message, 'error');
}

/**
 * getValueByPath
 *  ドット区切りのパス("a.b.c")でネストされたオブジェクトから値を取得
 */
export function getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
}

/**
 * addKeyValueRow
 *  Key-Value Editor（パラメータ／ヘッダなど）の行を追加する
 */
export function addKeyValueRow(container: HTMLElement, type: string): void {
    const row = document.createElement('div');
    row.className = 'key-value-row';
    
    // form-dataの場合はファイル選択オプションも追加
    if (type === 'body' && container.id === 'formDataFieldsContainer') {
        row.innerHTML = `
            <input type="text" placeholder="Key" class="key-input">
            <div class="value-input-container">
                <select class="value-type-select">
                    <option value="text">Text</option>
                    <option value="file">File</option>
                </select>
                <input type="text" placeholder="Value" class="value-input">
                <input type="file" class="file-input" style="display: none;">
            </div>
            <input type="text" placeholder="Description" class="description-input">
            <button type="button" class="delete-btn">×</button>
        `;
    } else {
        row.innerHTML = `
            <input type="text" placeholder="Key" class="key-input">
            <input type="text" placeholder="Value" class="value-input">
            <input type="text" placeholder="Description" class="description-input">
            <button type="button" class="delete-btn">×</button>
        `;
    }
    
    const keyInput = row.querySelector('.key-input') as HTMLInputElement;
    const valueInput = row.querySelector('.value-input') as HTMLInputElement;
    const deleteBtn = row.querySelector('.delete-btn') as HTMLButtonElement;
    const valueTypeSelect = row.querySelector('.value-type-select') as HTMLSelectElement;
    const fileInput = row.querySelector('.file-input') as HTMLInputElement;

    keyInput.addEventListener('input', async () => await updateRequestData(type));
    valueInput.addEventListener('input', async () => await updateRequestData(type));
    deleteBtn.addEventListener('click', () => {
        row.remove();
        updateRequestData(type);
    });

    // form-dataの場合のイベントリスナー
    if (valueTypeSelect && fileInput) {
        valueTypeSelect.addEventListener('change', () => {
            if (valueTypeSelect.value === 'file') {
                valueInput.style.display = 'none';
                fileInput.style.display = 'block';
                valueInput.value = '';
            } else {
                valueInput.style.display = 'block';
                fileInput.style.display = 'none';
                fileInput.value = '';
            }
            updateRequestData(type);
        });

        fileInput.addEventListener('change', () => {
            updateRequestData(type);
        });
    }

    container.appendChild(row);
}

/** collectKeyValues */
export function collectKeyValues(containerId: string): Record<string, string> {
    const container = document.getElementById(containerId);
    if (!container) return {};
    
    const rows = container.querySelectorAll('.key-value-row');
    const result: Record<string, string> = {};
    rows.forEach(row => {
        const keyInput = row.querySelector('.key-input') as HTMLInputElement;
        const valueInput = row.querySelector('.value-input') as HTMLInputElement;
        const key = keyInput.value.trim();
        const value = valueInput.value.trim();
        if (key) {
            result[key] = value;
        }
    });
    return result;
}

/** collectFormDataWithFiles - ファイルを含むform-dataの収集 */
export interface FormDataField {
    key: string;
    type: 'text' | 'file';
    value?: string;
    file?: File;
}

export function collectFormDataWithFiles(containerId: string): FormDataField[] {
    const container = document.getElementById(containerId);
    if (!container) return [];
    
    const rows = container.querySelectorAll('.key-value-row');
    const result: FormDataField[] = [];
    
    rows.forEach(row => {
        const keyInput = row.querySelector('.key-input') as HTMLInputElement;
        const valueTypeSelect = row.querySelector('.value-type-select') as HTMLSelectElement;
        const valueInput = row.querySelector('.value-input') as HTMLInputElement;
        const fileInput = row.querySelector('.file-input') as HTMLInputElement;
        
        const key = keyInput?.value?.trim();
        if (!key) return;
        
        console.log('Collecting field:', { 
            key, 
            valueTypeSelect: valueTypeSelect?.value, 
            hasFile: !!fileInput?.files?.[0],
            textValue: valueInput?.value 
        });
        
        if (valueTypeSelect && valueTypeSelect.value === 'file') {
            const file = fileInput?.files?.[0];
            if (file) {
                console.log('Adding file field:', { 
                    key, 
                    filename: file.name, 
                    type: file.type, 
                    size: file.size,
                    fileObjectType: typeof file,
                    isBlob: file instanceof Blob,
                    isFile: file instanceof File,
                    constructor: file.constructor.name
                });
                result.push({
                    key,
                    type: 'file',
                    file
                });
            } else {
                console.log('File field has no file selected:', key);
            }
        } else {
            const value = valueInput?.value || '';
            console.log('Adding text field:', { key, value });
            result.push({
                key,
                type: 'text',
                value
            });
        }
    });
    
    console.log('collectFormDataWithFiles result:', result);
    return result;
}

/** updateRequestData を async 関数に変更 */
export async function updateRequestData(type: string): Promise<void> {
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

function setupBodyTypeListener(): void {
    document.querySelectorAll('input[name="bodyType"]').forEach(radio => {
        radio.addEventListener('change', async () => {
            // 選択されたラジオの value を取得
            const selected = (document.querySelector('input[name="bodyType"]:checked') as HTMLInputElement)?.value;
            if (!selected || !state.currentRequest) return;

            // state.currentRequest に反映
            state.currentRequest.bodyType = selected;

            // コレクション内の該当リクエストにも同期
            const col = state.collections.find(c => c.id === state.currentCollection);
            if (col && state.currentRequest) {
                const req = col.requests.find(r => r.id === state.currentRequest!.id);
                if (req) {
                    req.bodyType = selected;
                }
            }

            // ストレージ保存
            await saveCollectionsToStorage();
            showSuccess(`Body Type を "${selected}" に切り替えました`);

            // 表示部分も切り替える
            handleBodyTypeChange({ target: { value: selected } } as Event & { target: { value: string } });
        });
    });
}

/**
 * setupEventListeners
 *  ページ全体で使う「クリック・入力」などのイベントを一度にまとめる
 */
export function setupEventListeners(): void {
    // BodyTypeのリスナ登録
    setupBodyTypeListener();
    
    // Save ボタンのクリック登録
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', (e: Event) => {
            e.preventDefault();
            saveCurrentRequest();
        });
    }
    
    // Send ボタン
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', async (e: Event) => {
            e.preventDefault();
            let requestObj = state.currentRequest;
            if (!requestObj) return;
            
            // フォームから最新の値を収集してrequestObjを更新
            const methodSelect = document.getElementById('methodSelect') as HTMLSelectElement;
            const nameInput = document.getElementById('nameInput') as HTMLInputElement;
            const urlInput = document.getElementById('urlInput') as HTMLInputElement;
            
            requestObj.method = methodSelect?.value || requestObj.method;
            requestObj.name = nameInput?.value?.trim() || requestObj.name;
            requestObj.url = urlInput?.value?.trim() || requestObj.url;

            // ヘッダーを収集
            const headerRows = document.querySelectorAll('#headersContainer .key-value-row');
            const newHeaders: Record<string, string> = {};
            headerRows.forEach(row => {
                const rowElement = row as HTMLElement;
                const keyInput = rowElement.querySelector('.key-input') as HTMLInputElement;
                const valueInput = rowElement.querySelector('.value-input') as HTMLInputElement;
                const key = keyInput?.value?.trim();
                const value = valueInput?.value?.trim();
                if (key) newHeaders[key] = value || '';
            });
            requestObj.headers = newHeaders;

            // パラメータを収集
            const paramRows = document.querySelectorAll('#paramsContainer .key-value-row');
            const newParams: Record<string, string> = {};
            paramRows.forEach(row => {
                const rowElement = row as HTMLElement;
                const keyInput = rowElement.querySelector('.key-input') as HTMLInputElement;
                const valueInput = rowElement.querySelector('.value-input') as HTMLInputElement;
                const key = keyInput?.value?.trim();
                const value = valueInput?.value?.trim();
                if (key) newParams[key] = value || '';
            });
            requestObj.params = newParams;
            
            // bodyType の選択状況を反映し、requestObj.body を適宜セット
            const bodyType = (document.querySelector('input[name="bodyType"]:checked') as HTMLInputElement)?.value || 'none';
            requestObj.bodyType = bodyType;
            requestObj.body = null;

            switch (bodyType) {
                case 'raw':
                    const rawBody = document.getElementById('rawBody') as HTMLTextAreaElement;
                    requestObj.body = rawBody?.value || '';
                    break;
                case 'json':
                    const jsonBody = document.getElementById('jsonBody') as HTMLTextAreaElement;
                    requestObj.body = jsonBody?.value || '';
                    break;
                case 'form-data':
                    // form-data の場合はファイルを含む特別な収集処理
                    console.log('🔍 [utils.ts] form-data処理開始');
                    const formDataFields = collectFormDataWithFiles('formDataFieldsContainer');
                    console.log('🔍 [utils.ts] 収集されたformDataFields:', formDataFields);
                    requestObj.body = formDataFields as any;
                    console.log('🔍 [utils.ts] requestObj.bodyに設定完了:', requestObj.body);
                    break;
                case 'urlencoded':
                    // urlencoded の場合は従来通り
                    const urlEncodedFields = collectKeyValues('formDataFieldsContainer');
                    requestObj.body = urlEncodedFields;
                    break;
                default:
                    break;
            }

            // プリリクエストスクリプトも更新
            const preRequestScript = document.getElementById('preRequestScript') as HTMLTextAreaElement;
            if (preRequestScript) {
                requestObj.preRequestScript = preRequestScript.value;
            }

            sendRequest(requestObj);
        });
    }
    
    // メソッド・URL 更新時
    const methodSelect = document.getElementById('methodSelect') as HTMLSelectElement;
    if (methodSelect) {
        methodSelect.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement;
            if (state.currentRequest) {
                state.currentRequest.method = target.value;
            }
        });
    }
    
    const urlInput = document.getElementById('urlInput') as HTMLInputElement;
    if (urlInput) {
        urlInput.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (state.currentRequest) {
                state.currentRequest.url = target.value;
            }
        });
    }
    
    // インポート・エクスポート・設定
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            openImportModal();
        });
    }
    
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportData();
        });
    }

    // コレクション管理（New Collection）
    const createCollectionBtn = document.getElementById('createCollectionBtn');
    if (createCollectionBtn) {
        createCollectionBtn.addEventListener('click', async () => {
            createNewCollection();
        });
    }

    // サイドバーからのシナリオ作成
    const createScenarioFromSidebarBtn = document.getElementById('createScenarioFromSidebarBtn');
    if (createScenarioFromSidebarBtn) {
        createScenarioFromSidebarBtn.addEventListener('click', async () => {
            const { createNewScenario } = await import('./scenarioManager');
            createNewScenario();
        });
    }
    
    // 履歴（検索・クリア）
    const historySearch = document.getElementById('historySearch') as HTMLInputElement;
    if (historySearch) {
        historySearch.addEventListener('input', () => {
            filterHistory();
        });
    }
    
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', async () => {
            clearHistory();
        });
    }
    
    // インターセプタ（開始・停止）
    const startInterceptorBtn = document.getElementById('startInterceptorBtn');
    if (startInterceptorBtn) {
        startInterceptorBtn.addEventListener('click', async () => {
            startInterceptor();
        });
    }
    
    const stopInterceptorBtn = document.getElementById('stopInterceptorBtn');
    if (stopInterceptorBtn) {
        stopInterceptorBtn.addEventListener('click', async () => {
            stopInterceptor();
        });
    }
    
    // Body タイプ切り替え
    document.querySelectorAll('input[name="bodyType"]').forEach(radio => {
        radio.addEventListener('change', (e: Event) => {
            handleBodyTypeChange(e as Event & { target: { value: string } });
        });
    });
    
    // Raw Body 入力
    const rawBody = document.getElementById('rawBody') as HTMLTextAreaElement;
    if (rawBody) {
        rawBody.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLTextAreaElement;
            if (state.currentRequest) {
                state.currentRequest.body = target.value;
            }
        });
    }

}

/**
 * setupTabSwitching
 *  メインタブ・サブタブ・レスポンスタブ・フォーマット切り替えを登録
 */
export function setupTabSwitching(): void {
    // メインタブ
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function (this: HTMLElement) {
            const tabName = this.dataset.tab;
            if (tabName) {
                switchMainTab(tabName);
            }
        });
    });
    
    // サブタブ
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', function (this: HTMLElement) {
            const subtabName = this.dataset.subtab;
            if (subtabName) {
                switchSubTab(subtabName);
            }
        });
    });
    
    // レスポンスタブ
    document.querySelectorAll('.response-tab-btn').forEach(btn => {
        btn.addEventListener('click', function (this: HTMLElement) {
            const restabName = this.dataset.restab;
            if (restabName) {
                switchResponseTab(restabName);
            }
        });
    });
    
    // フォーマット切り替え
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', function (this: HTMLElement) {
            document.querySelectorAll('.format-btn').forEach(x => x.classList.remove('active'));
            this.classList.add('active');
            const format = this.dataset.format;
            if (format && (window as any).lastResponse) {
                displayResponse((window as any).lastResponse, format);
            }
        });
    });
}

/**
 * switchMainTab
 *  メインタブ選択時の表示切り替え
 */
export function switchMainTab(tabName: string): void {
    console.log(tabName);
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    const tabContent = document.getElementById(`${tabName}-tab`);
    
    if (tabBtn) tabBtn.classList.add('active');
    if (tabContent) tabContent.classList.add('active');
}

/**
 * switchSubTab
 *  サブタブ選択時の表示切り替え
 */
export function switchSubTab(subtabName: string): void {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));
    
    const subTabBtn = document.querySelector(`[data-subtab="${subtabName}"]`);
    const subTabContent = document.getElementById(`${subtabName}-subtab`);
    
    if (subTabBtn) subTabBtn.classList.add('active');
    if (subTabContent) subTabContent.classList.add('active');
}

/**
 * switchResponseTab
 *  レスポンスタブ選択時の表示切り替え
 */
export function switchResponseTab(restabName: string): void {
    document.querySelectorAll('.response-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.response-tab-content').forEach(content => content.classList.remove('active'));
    
    const responseTabBtn = document.querySelector(`[data-restab="${restabName}"]`);
    const responseTabContent = document.getElementById(`response-${restabName}`);
    
    if (responseTabBtn) responseTabBtn.classList.add('active');
    if (responseTabContent) responseTabContent.classList.add('active');
}

export function renderAuthDetails(authType: string): void {
    const container = document.getElementById('authDetails');
    if (!container) return;
    
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

export function updateAuthData(): void {
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
            const authUsername = document.getElementById('authUsername') as HTMLInputElement;
            const authPassword = document.getElementById('authPassword') as HTMLInputElement;
            state.currentRequest.auth.username = authUsername?.value || '';
            state.currentRequest.auth.password = authPassword?.value || '';
            break;

        case 'bearer':
            const authToken = document.getElementById('authToken') as HTMLInputElement;
            state.currentRequest.auth.token = authToken?.value || '';
            break;

        case 'apikey':
            const authKey = document.getElementById('authKey') as HTMLInputElement;
            const authValue = document.getElementById('authValue') as HTMLInputElement;
            const authAddTo = document.getElementById('authAddTo') as HTMLSelectElement;
            state.currentRequest.auth.key = authKey?.value || '';
            state.currentRequest.auth.value = authValue?.value || '';
            state.currentRequest.auth.addTo = (authAddTo?.value as 'header' | 'query') || 'header';
            break;

        case 'oauth2':
            const authAccessToken = document.getElementById('authAccessToken') as HTMLInputElement;
            const authTokenType = document.getElementById('authTokenType') as HTMLSelectElement;
            state.currentRequest.auth.accessToken = authAccessToken?.value || '';
            state.currentRequest.auth.tokenType = authTokenType?.value || 'Bearer';
            break;

        default:
            // 何もしない（type が none の場合など）
            break;
    }
}

export function showLoading(show: boolean): void {
    const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
    if (!sendBtn) return;
    
    if (show) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
    } else {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
    }
}

// Body type handling
export function handleBodyTypeChange(event: Event & { target: { value: string } }): void {
    const bodyType = event.target.value;
    const rawBody = document.getElementById('rawBody') as HTMLElement;
    const jsonEditor = document.getElementById('jsonEditor') as HTMLElement;
    const formDataContainer = document.getElementById('formDataContainer') as HTMLElement;

    if (!rawBody || !jsonEditor || !formDataContainer) return;

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
            const formDataFieldsContainer = document.getElementById('formDataFieldsContainer');
            if (formDataFieldsContainer && !formDataFieldsContainer.children.length) {
                // 最初にキー・バリュー行がなければ追加
                addKeyValueRow(formDataFieldsContainer, 'body');
            }
            break;

        default: // 'none'
            // 何もしない（全て非表示のまま）
            break;
    }
}