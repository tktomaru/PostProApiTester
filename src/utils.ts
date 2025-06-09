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

export function showError(message: string, details?: string): void {
    const fullMessage = details ? `${message}\n\nDetails: ${details}` : message;
    showNotification(fullMessage, 'error');
}

/**
 * Enhanced error handling with categorization
 */
export function showNetworkError(url: string, error: any): void {
    let message = 'Network request failed: ';
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
        message += 'Unable to connect to the server. Please check your internet connection and verify the URL is correct.';
    } else if (error.message.includes('CORS')) {
        message += 'Cross-origin request blocked. The server may not allow requests from this browser extension.';
    } else if (error.message.includes('timeout')) {
        message += 'Request timed out. The server may be slow or unreachable.';
    } else if (error.message.includes('SSL') || error.message.includes('certificate')) {
        message += 'SSL/TLS error. The server certificate may be invalid or expired.';
    } else {
        message += error.message || 'Unknown network error occurred.';
    }
    
    showError(message, `URL: ${url}\nError Type: ${error.name || 'Unknown'}`);
}

export function showVariableError(varName: string, error: any): void {
    let message = 'Variable resolution failed: ';
    
    if (error.message.includes('not found') || error.message.includes('見つかりません')) {
        message += `Variable "${varName}" was not found. Please check the variable name and ensure it exists in your environment, global, or collection variables.`;
    } else if (error.message.includes('JSONPath')) {
        message += `JSONPath expression error in "${varName}". Please verify your JSONPath syntax.`;
    } else if (error.message.includes('構文が不正')) {
        message += `Invalid variable syntax in "${varName}". Please check the format: \${"scenarios"."Name"."Request"."response"."property"}`;
    } else {
        message += error.message || 'Unknown variable error occurred.';
    }
    
    showError(message, `Variable: ${varName}`);
}

export function showFileError(fileName: string, error: any): void {
    let message = 'File operation failed: ';
    
    if (error.message.includes('too large') || error.message.includes('size')) {
        message += `File "${fileName}" is too large. Maximum file size is 10MB.`;
    } else if (error.message.includes('type') || error.message.includes('format')) {
        message += `File "${fileName}" has an unsupported format or is corrupted.`;
    } else if (error.message.includes('read')) {
        message += `Unable to read file "${fileName}". The file may be corrupted or in use by another application.`;
    } else {
        message += error.message || 'Unknown file error occurred.';
    }
    
    showError(message, `File: ${fileName}`);
}

export function showStorageError(operation: string, error: any): void {
    let message = 'Storage operation failed: ';
    
    if (error.message.includes('QUOTA_BYTES') || error.message.includes('quota')) {
        message += 'Storage quota exceeded. Please export your data and clear some collections or history to free up space.';
    } else if (error.message.includes('permission')) {
        message += 'Storage permission denied. Please check browser extension permissions.';
    } else {
        message += `Unable to ${operation}. ${error.message || 'Unknown storage error occurred.'}`;
    }
    
    showError(message, `Operation: ${operation}`);
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
    fileName?: string; // ファイル名
    fileType?: string; // ファイルタイプ
    fileSize?: number; // ファイルサイズ
    fileContent?: string; // ファイル内容をBase64で保存
}

export async function collectFormDataWithFiles(containerId: string): Promise<FormDataField[]> {
    const container = document.getElementById(containerId);
    if (!container) return [];

    const rows = container.querySelectorAll('.key-value-row');

    // 非同期処理のためPromise.allを使用
    const promises = Array.from(rows).map(async (row) => {
        const keyInput = row.querySelector('.key-input') as HTMLInputElement;
        const valueTypeSelect = row.querySelector('.value-type-select') as HTMLSelectElement;
        const valueInput = row.querySelector('.value-input') as HTMLInputElement;
        const fileInput = row.querySelector('.file-input') as HTMLInputElement;

        const key = keyInput?.value?.trim();
        if (!key) return null;

        console.log('Collecting field:', {
            key,
            valueTypeSelect: valueTypeSelect?.value,
            hasFile: !!fileInput?.files?.[0],
            textValue: valueInput?.value
        });

        if (valueTypeSelect && valueTypeSelect.value === 'file') {
            const file = fileInput?.files?.[0];
            if (file) {
                try {
                    // ファイル内容をBase64に変換
                    const fileContent = await fileToBase64(file);
                    console.log('Adding file field:', {
                        key,
                        filename: file.name,
                        type: file.type,
                        size: file.size,
                        contentLength: fileContent.length
                    });

                    return {
                        key,
                        type: 'file' as const,
                        file,
                        fileName: file.name,
                        fileType: file.type,
                        fileSize: file.size,
                        fileContent
                    };
                } catch (error: any) {
                    console.error('Failed to convert file to base64:', error);
                    showFileError(file.name, error);
                    return {
                        key,
                        type: 'file' as const,
                        fileName: file.name + ' (conversion failed)'
                    };
                }
            } else {
                // ファイルが選択されていない場合、復元情報があるかチェック
                const fileInfoSpan = row.querySelector('span[data-file-info]') as HTMLElement;
                if (fileInfoSpan) {
                    const savedFileData = JSON.parse(fileInfoSpan.dataset.fileInfo || '{}');
                    if (savedFileData.fileContent) {
                        // 保存されたファイル内容からFileオブジェクトを復元
                        const restoredFile = base64ToFile(
                            savedFileData.fileContent,
                            savedFileData.fileName,
                            savedFileData.fileType
                        );
                        console.log('Restored file from saved data:', savedFileData.fileName);
                        return {
                            key,
                            type: 'file' as const,
                            file: restoredFile,
                            fileName: savedFileData.fileName,
                            fileType: savedFileData.fileType,
                            fileSize: savedFileData.fileSize,
                            fileContent: savedFileData.fileContent
                        };
                    }
                }

                console.log('File field has no file selected:', key);
                return {
                    key,
                    type: 'file' as const,
                    fileName: 'No file selected'
                };
            }
        } else {
            const value = valueInput?.value || '';
            console.log('Adding text field:', { key, value });
            return {
                key,
                type: 'text' as const,
                value
            };
        }
    });

    const results = await Promise.all(promises);
    const filteredResults = results.filter(item => item !== null) as FormDataField[];

    console.log('collectFormDataWithFiles result:', filteredResults);
    return filteredResults;
}

// ファイルをBase64に変換する関数
function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            reject(new Error(`File too large: ${formatBytes(file.size)}. Maximum size is ${formatBytes(maxSize)}.`));
            return;
        }

        // Validate file type (allow most common types)
        const allowedTypes = [
            'text/', 'application/json', 'application/xml', 'application/pdf',
            'image/', 'video/', 'audio/', 'application/octet-stream'
        ];
        const isAllowedType = allowedTypes.some(type => file.type.startsWith(type)) || file.type === '';
        
        if (!isAllowedType) {
            console.warn(`File type ${file.type} may not be supported, but proceeding anyway.`);
        }

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const result = reader.result as string;
                if (!result || typeof result !== 'string') {
                    reject(new Error('Failed to read file content'));
                    return;
                }
                // data:プレフィックスを除去してBase64部分のみ返す
                const base64 = result.split(',')[1];
                if (!base64) {
                    reject(new Error('Invalid file format or empty file'));
                    return;
                }
                resolve(base64);
            } catch (error: any) {
                reject(new Error(`Failed to process file "${file.name}": ${error.message}`));
            }
        };
        reader.onerror = () => {
            reject(new Error(`Failed to read file "${file.name}". The file may be corrupted or in use by another application.`));
        };
        reader.readAsDataURL(file);
    });
}

// Base64からFileオブジェクトを復元する関数
export function base64ToFile(base64: string, fileName: string, fileType: string): File {
    try {
        if (!base64 || typeof base64 !== 'string') {
            throw new Error('Invalid Base64 data');
        }

        const byteString = atob(base64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);

        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }

        const blob = new Blob([ab], { type: fileType });
        return new File([blob], fileName, { type: fileType });
    } catch (error: any) {
        console.error('Failed to restore file from Base64:', error);
        if (error.name === 'InvalidCharacterError') {
            throw new Error(`Invalid Base64 data for file "${fileName}". The file data may be corrupted.`);
        }
        throw new Error(`Failed to restore file "${fileName}": ${error.message}`);
    }
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
            state.currentRequest.bodyType = selected as 'none' | 'raw' | 'json' | 'form-data' | 'urlencoded' | 'binary';

            // コレクション内の該当リクエストにも同期
            const col = state.collections.find(c => c.id === state.currentCollection);
            if (col && state.currentRequest) {
                const req = col.requests.find(r => r.id === state.currentRequest!.id);
                if (req) {
                    req.bodyType = selected as 'none' | 'raw' | 'json' | 'form-data' | 'urlencoded' | 'binary';
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
 * 永続化されたコレクション／シナリオの request.body を取得する
 */
function getPersistedBody(requestId: string): any {
    // ① コレクション内
    if (state.currentCollection) {
        const col = state.collections.find(c => c.id === state.currentCollection);
        const req = col?.requests.find(r => r.id === requestId);
        if (req) return req.body;
    }
    // ② シナリオ内
    if (state.currentScenario) {
        const scenario = state.scenarios.find(s => s.id === state.currentScenario);
        const req = scenario?.requests.find(r => r.id === requestId);
        if (req) return req.body;
    }
    return undefined;
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
            requestObj.bodyType = bodyType as 'none' | 'raw' | 'json' | 'form-data' | 'urlencoded' | 'binary';
            requestObj.body = null;

            switch (bodyType) {
                case 'raw': {
                    const rawBody = (document.getElementById('rawBody') as HTMLTextAreaElement)?.value?.trim();
                    requestObj.body = rawBody || requestObj.body;
                    // if the textarea is empty, keep whatever was in state.currentRequest.body
                    break;
                }

                case 'json': {
                    const jsonBody = (document.getElementById('jsonBody') as HTMLTextAreaElement)?.value?.trim();
                    requestObj.body = jsonBody || requestObj.body;
                    break;
                }

                case 'form-data': {
                    const formDataFields = await collectFormDataWithFiles('formDataFieldsContainer');
                    if (formDataFields.length > 0) {
                        // 新しく入力された form-data があればそれを使う
                        requestObj.body = formDataFields as any;
                    } else if (Array.isArray(state?.currentRequest?.body)) {
                        console.log('🔍 [utils.ts] No new form-data selected → using getPersistedBody');
                        // なければコレクション/シナリオに保存済みの body を復元
                        const persisted = getPersistedBody(requestObj.id);
                        requestObj.body = persisted ?? [];
                    }
                    break;
                }

                case 'urlencoded': {
                    const kv = collectKeyValues('formDataFieldsContainer');
                    if (Object.keys(kv).length > 0) {
                        requestObj.body = kv;
                    } else if (typeof state.currentRequest?.body === 'object' && !Array.isArray(state.currentRequest.body)) {
                        requestObj.body = state.currentRequest.body;
                    }
                    break;
                }
                case 'binary': {
                    const binaryFileInput = document.getElementById('binaryFileInput') as HTMLInputElement;
                    // first, try the input
                    let file = binaryFileInput?.files?.[0];
                    // if nothing is selected in the input, but we restored a File in state.currentRequest.body, use that
                    if (!file && state.currentRequest?.body instanceof File) {
                        file = state.currentRequest.body;
                    }
                    if (file) {
                        requestObj.body = file;
                        console.log('🔍 [utils.ts] Sending binary file:', { name: file.name, size: file.size });
                    } else {
                        console.log('🔍 [utils.ts] No new binary selected → using getPersistedBody');
                        // なければコレクション/シナリオに保存済みの body (File or Base64) を復元
                        const persisted = getPersistedBody(requestObj.id);
                        requestObj.body = persisted ?? null;
                    }
                    break;
                }
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

    // Binary File 入力
    const binaryFileInput = document.getElementById('binaryFileInput') as HTMLInputElement;
    if (binaryFileInput) {
        binaryFileInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            const binaryFileInfo = document.getElementById('binaryFileInfo') as HTMLElement;

            if (file && binaryFileInfo) {
                // ファイル情報を表示
                binaryFileInfo.innerHTML = `
                    <div class="selected-binary-file">
                        <span class="file-name">Selected: ${file.name}</span>
                        <span class="file-size">(${formatBytes(file.size)})</span>
                        <span class="file-type">${file.type || 'Unknown type'}</span>
                    </div>
                `;

                console.log('🔍 [utils.ts] Binary file selected:', {
                    name: file.name,
                    size: file.size,
                    type: file.type
                });
            } else if (binaryFileInfo) {
                // ファイルが未選択の場合は情報をクリア
                binaryFileInfo.innerHTML = '';
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
    const binaryContainer = document.getElementById('binaryContainer') as HTMLElement;

    if (!rawBody || !jsonEditor || !formDataContainer || !binaryContainer) return;

    // まずすべて非表示にする
    rawBody.style.display = 'none';
    jsonEditor.style.display = 'none';
    formDataContainer.style.display = 'none';
    binaryContainer.style.display = 'none';

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

        case 'binary':
            binaryContainer.style.display = 'block';
            break;

        default: // 'none'
            // 何もしない（全て非表示のまま）
            break;
    }
}


/**
 * シリアライズ可能な Form-Data フィールド配列を返す
 */
export async function serializeFormDataWithFiles(containerId: string): Promise<FormDataField[]> {
    return await collectFormDataWithFiles(containerId);
}

/**
 * Binary ファイルを Base64 エンコードしてシリアライズ文字列を返す
 */
export async function serializeBinaryFile(inputId: string): Promise<string | null> {
    const fileInput = document.getElementById(inputId) as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) return null;

    try {
        const base64Data = await fileToBase64(file);
        return JSON.stringify({
            type: 'binaryFile',
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            base64Data
        });
    } catch (error: any) {
        showError(`Failed to serialize binary file \"${file.name}\": ${error.message}`);
        return null;
    }
}

export function autoResizeTextarea(textarea: HTMLTextAreaElement) {
    // height をリセット → scrollHeight を正しく得る
    textarea.style.height = 'auto';
    // scrollHeight 分だけ伸ばす
    textarea.style.height = textarea.scrollHeight + 'px';
}