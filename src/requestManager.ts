// requestManager.ts
// ───────────────────────────────────────────────────────────────────────────────
// リクエスト送受信・プリリクエストスクリプト・テストスクリプト・レスポンス表示をまとめる

import type { RequestData, ResponseData, AuthConfig } from './types';
import {
    state,
    saveCollectionsToStorage,
    saveScenariosToStorage
} from './state';

import {
    showLoading,
    showError,
    showSuccess,
    escapeHtml,
    formatBytes
} from './utils';

import { switchMainTab, addKeyValueRow, handleBodyTypeChange, updateAuthData, renderAuthDetails, collectKeyValues, getValueByPath } from './utils';
import { getVariable, replaceVariables, deepReplaceVariables, renderVariables, setVariable } from './variableManager';
import { saveToHistory as saveToHistoryFn } from './historyManager';

interface FetchOptions {
    method: string;
    headers: Record<string, string>;
    bodyData: string | FormData | URLSearchParams | null;
}

interface XhrResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    text(): Promise<string>;
    json(): Promise<any>;
}

interface ProcessedResponse extends ResponseData {
    bodyText: string;
}

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
}

interface ResponseExecution {
    status: number;
    duration: number;
    size: number;
    timestamp: string;
    headers: Record<string, string>;
    body: any;
}

/**
 * loadRequestIntoEditor
 *  コレクションや履歴から呼ばれ、右側エディタ（メソッド、URL、ヘッダ、ボディ、認証）に
 *  state.currentRequest を反映する
 */
export function loadRequestIntoEditor(request: RequestData): void {
    // state.currentRequest の値をまるごと置き換え
    state.currentRequest = JSON.parse(JSON.stringify(request));
    if (state.currentRequest) {
        state.currentRequest.method = request.method;
        state.currentRequest.url = request.url;
        state.currentRequest.headers = { ...request.headers };
        state.currentRequest.params = { ...request.params };
        state.currentRequest.body = request.body;
        state.currentRequest.auth = { ...request.auth };
    }
    
    // ① リクエスト 名称 を表示する
    const nameDisplay = document.getElementById('request-name-display') as HTMLElement;
    if (nameDisplay) {
        nameDisplay.innerHTML = `<input type="text" id="nameInput" value="${request.name}"></input>`;
    }
    
    // ① リクエスト ID を表示する
    const idDisplay = document.getElementById('request-id-display') as HTMLElement;
    if (idDisplay) {
        idDisplay.innerHTML = `<span>Request ID: <em>${request.id}</em></span>`;
    }

    // メソッド + URL を設定
    const methodSelect = document.getElementById('methodSelect') as HTMLSelectElement;
    const urlInput = document.getElementById('urlInput') as HTMLInputElement;
    methodSelect.value = request.method;
    urlInput.value = request.url;

    // ヘッダ描画
    const headersContainer = document.getElementById('headersContainer') as HTMLElement;
    headersContainer.innerHTML = '';
    if (request.headers && Object.keys(request.headers).length > 0) {
        Object.entries(request.headers).forEach(([key, value]) => {
            addKeyValueRow(headersContainer, 'header');
            const rows = headersContainer.querySelectorAll('.key-value-row');
            const lastRow = rows[rows.length - 1] as HTMLElement;
            const keyInput = lastRow.querySelector('.key-input') as HTMLInputElement;
            const valueInput = lastRow.querySelector('.value-input') as HTMLInputElement;
            keyInput.value = key;
            valueInput.value = value;
        });
    } else {
        addKeyValueRow(headersContainer, 'header');
    }

    // パラメータ描画
    const paramsContainer = document.getElementById('paramsContainer') as HTMLElement;
    paramsContainer.innerHTML = '';
    if (request.params && Object.keys(request.params).length > 0) {
        Object.entries(request.params).forEach(([key, value]) => {
            addKeyValueRow(paramsContainer, 'param');
            const rows = paramsContainer.querySelectorAll('.key-value-row');
            const lastRow = rows[rows.length - 1] as HTMLElement;
            const keyInput = lastRow.querySelector('.key-input') as HTMLInputElement;
            const valueInput = lastRow.querySelector('.value-input') as HTMLInputElement;
            keyInput.value = key;
            valueInput.value = value;
        });
    } else {
        addKeyValueRow(paramsContainer, 'param');
    }

    // ボディ描画
    if (request.body) {
        if (typeof request.body === 'string') {
            const rawRadio = document.querySelector('input[name="bodyType"][value="raw"]') as HTMLInputElement;
            rawRadio.checked = true;
            handleBodyTypeChange({ target: { value: 'raw' } } as any);
            const rawBody = document.getElementById('rawBody') as HTMLTextAreaElement;
            rawBody.value = request.body;
        } else {
            const formDataRadio = document.querySelector('input[name="bodyType"][value="form-data"]') as HTMLInputElement;
            formDataRadio.checked = true;
            handleBodyTypeChange({ target: { value: 'form-data' } } as any);
            const formDataContainer = document.getElementById('formDataContainer') as HTMLElement;
            formDataContainer.innerHTML = '';
            Object.entries(request.body as Record<string, string>).forEach(([key, value]) => {
                addKeyValueRow(formDataContainer, 'body');
                const rows = formDataContainer.querySelectorAll('.key-value-row');
                const lastRow = rows[rows.length - 1] as HTMLElement;
                const keyInput = lastRow.querySelector('.key-input') as HTMLInputElement;
                const valueInput = lastRow.querySelector('.value-input') as HTMLInputElement;
                keyInput.value = key;
                valueInput.value = value;
            });
        }
    } else {
        const noneRadio = document.querySelector('input[name="bodyType"][value="none"]') as HTMLInputElement;
        noneRadio.checked = true;
        handleBodyTypeChange({ target: { value: 'none' } } as any);
    }

    // 認証描画
    if (request.auth) {
        const authType = document.getElementById('authType') as HTMLSelectElement;
        authType.value = request.auth.type || 'none';
        renderAuthDetails(request.auth.type);

        switch (request.auth.type) {
            case 'basic':
                const authUsername = document.getElementById('authUsername') as HTMLInputElement;
                const authPassword = document.getElementById('authPassword') as HTMLInputElement;
                authUsername.value = request.auth.username || '';
                authPassword.value = request.auth.password || '';
                break;
            case 'bearer':
                const authToken = document.getElementById('authToken') as HTMLInputElement;
                authToken.value = request.auth.token || '';
                break;
            case 'apikey':
                const authKey = document.getElementById('authKey') as HTMLInputElement;
                const authValue = document.getElementById('authValue') as HTMLInputElement;
                const authAddTo = document.getElementById('authAddTo') as HTMLSelectElement;
                authKey.value = request.auth.key || '';
                authValue.value = request.auth.value || '';
                authAddTo.value = request.auth.addTo || 'header';
                break;
            case 'oauth2':
                const authAccessToken = document.getElementById('authAccessToken') as HTMLInputElement;
                const authTokenType = document.getElementById('authTokenType') as HTMLInputElement;
                authAccessToken.value = request.auth.accessToken || '';
                authTokenType.value = request.auth.tokenType || 'Bearer';
                break;
        }
        updateAuthData();
    }

    // ① 「Pre-request Script」エディタに既存スクリプトをセット
    const preReqTextarea = document.getElementById('preRequestScript') as HTMLTextAreaElement;
    preReqTextarea.value = request.preRequestScript || '';

    // ② 入力が変わったら state.currentRequest.preRequestScript を更新してストレージに保存
    preReqTextarea.addEventListener('blur', async () => {
        const newScript = preReqTextarea.value;
        // state.currentRequest に上書き
        if (state.currentRequest) {
            state.currentRequest.preRequestScript = newScript;
        }

        // どのコレクションのどのリクエストかを特定するには、
        // state.currentCollection と request.id を使って探す必要があります
        const collection = state.collections.find(
            c => c.id === state.currentCollection
        );
        if (collection) {
            const targetReq = collection.requests.find(r => r.id === request.id);
            if (targetReq) {
                targetReq.preRequestScript = newScript;
            }
        }

        // 保存しておく
        await saveCollectionsToStorage();
        showSuccess('Pre-request script を保存しました');
    });

    // ③ Body Type の radio ボタンをチェック
    const bodyType = request.bodyType || 'none';
    document.querySelectorAll('input[name="bodyType"]').forEach(radio => {
        const radioElement = radio as HTMLInputElement;
        radioElement.checked = radioElement.value === bodyType;
    });

    // ④ Body 本文エリアを切り替えて表示する
    const rawBody = document.getElementById('rawBody') as HTMLElement;
    const jsonBodyParent = document.getElementById('jsonBody')?.parentElement as HTMLElement;
    const formDataContainer = document.getElementById('formDataContainer') as HTMLElement;
    
    switch (bodyType) {
        case 'raw':
            rawBody.style.display = 'block';
            if (jsonBodyParent) jsonBodyParent.style.display = 'none';
            formDataContainer.style.display = 'none';
            break;
        case 'json':
            rawBody.style.display = 'none';
            if (jsonBodyParent) jsonBodyParent.style.display = 'block';
            formDataContainer.style.display = 'none';
            break;
        case 'form-data':
            rawBody.style.display = 'none';
            if (jsonBodyParent) jsonBodyParent.style.display = 'none';
            formDataContainer.style.display = 'block';
            break;
        case 'urlencoded':
            rawBody.style.display = 'none';
            if (jsonBodyParent) jsonBodyParent.style.display = 'none';
            formDataContainer.style.display = 'block';
            break;
        default:
            // none
            rawBody.style.display = 'none';
            if (jsonBodyParent) jsonBodyParent.style.display = 'none';
            formDataContainer.style.display = 'none';
            break;
    }

    // ⑤ Body の中身をセット
    const rawBodyTextarea = document.getElementById('rawBody') as HTMLTextAreaElement;
    const jsonBodyTextarea = document.getElementById('jsonBody') as HTMLTextAreaElement;
    rawBodyTextarea.value = (request.body as string) || '';
    jsonBodyTextarea.value = (request.body as string) || '';

    // タブをリクエストタブに切り替え
    switchMainTab('request');
}

/**
 * executeTestScript
 *  Tests タブに書かれたスクリプトを実行し、結果を表示
 */
export async function executeTestScript(responseData: ProcessedResponse): Promise<void> {
    const testScriptElement = document.getElementById('testScript') as HTMLTextAreaElement;
    const raw = testScriptElement?.value;
    if (!raw?.trim()) return;

    // 改行で分割し、空行や先頭が // のコメント行を除外
    const lines = raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('//'));

    const results: TestResult[] = [];
    try {
        for (const line of lines) {
            // runTestCommand は、単一行のテストコマンドを評価し { passed, error } を返す想定
            const result = runTestCommand(line, responseData);
            results.push({ name: line, passed: result.passed, error: result.error });
        }
        displayTestResults(results);
    } catch (error: any) {
        console.error('Test script 実行エラー:', error);
        results.push({
            name: 'Script Execution Error',
            passed: false,
            error: error.message
        });
        displayTestResults(results);
    }
}

/**
 * sendRequest
 *  引数 requestObj を使って XHR 送信を行うバージョン
 */
export async function sendRequest(requestObj: RequestData): Promise<XhrResponse | string> {
    try {
        showLoading(true);

        // 必須チェック: URL が空でないか
        if (!requestObj.url || !requestObj.url.trim()) {
            showError('URL is required');
            return '';
        }

        // 2. 変数置換後のリクエストを生成
        let processedRequest = processVariables(requestObj);

        // 1. プリリクエストスクリプト実行
        processedRequest = executePreRequestScript(processedRequest.preRequestScript || '', processedRequest);

        // リクエスト実行結果を保存
        const requestExecution = {
            timestamp: new Date().toISOString(),
            method: processedRequest.method,
            url: processedRequest.url,
            headers: processedRequest.headers,
            params: processedRequest.params,
            body: processedRequest.body,
            auth: processedRequest.auth,
            folder: (processedRequest as any).folder || '',
            description: (processedRequest as any).description || '',
            bodyType: processedRequest.bodyType || 'none',
            preRequestScript: processedRequest.preRequestScript || ''
        };

        // 3. XHR 用オプションを作成
        const opts = buildFetchOptions(processedRequest);
        if (!opts) {
            return '';
        }

        const { method, headers, bodyData } = opts;

        // 4. XMLHttpRequest で送信（タイムアウト付き）
        const url = processedRequest.url;
        const startTime = Date.now();

        const responseData = await new Promise<{ response: XhrResponse; duration: number }>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.timeout = 30000; // 30秒

            // ヘッダーを設定
            Object.entries(headers).forEach(([key, value]) => {
                xhr.setRequestHeader(key, value);
            });

            // レスポンス取得時のイベント
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;

                const duration = Date.now() - startTime;

                if (xhr.status !== 0) {
                    // レスポンスヘッダーをパースしてオブジェクトに変換
                    const rawHeaders = xhr.getAllResponseHeaders();
                    const headerLines = rawHeaders.trim().split(/[\r\n]+/);
                    const headerObj: Record<string, string> = {};
                    headerLines.forEach(line => {
                        const parts = line.split(': ');
                        const headerKey = parts.shift();
                        const headerVal = parts.join(': ');
                        if (headerKey) {
                            headerObj[headerKey] = headerVal;
                        }
                    });

                    // レスポンス本文を取得
                    const text = xhr.responseText || '';

                    // Fetch の Response っぽい要素を持つ「疑似レスポンス」を作成
                    const pseudoResponse: XhrResponse = {
                        status: xhr.status,
                        statusText: xhr.statusText,
                        headers: headerObj,  // ヘッダーオブジェクトを直接設定
                        text: async () => text,
                        json: async () => {
                            try {
                                return JSON.parse(text);
                            } catch {
                                return {};
                            }
                        }
                    };

                    resolve({ response: pseudoResponse, duration });
                } else {
                    // ネットワークエラーなど status が 0 のとき
                    reject(new Error('Network error or CORS issue (status 0).'));
                }
            };

            // タイムアウト時
            xhr.ontimeout = () => {
                reject(new Error('Request timeout'));
            };

            // ネットワークエラー時
            xhr.onerror = () => {
                reject(new Error('Network error'));
            };

            // リクエスト送信
            xhr.send(bodyData);
        });

        // 5. processResponse と displayResponse を使って結果を表示
        const { response, duration } = responseData;
        const parsed = await processResponse(response, duration);
        displayResponse(parsed);

        // 6. テストスクリプト実行
        await executeTestScript(parsed);

        // 7. 履歴に保存
        await saveToHistory(processedRequest, parsed);

        // 8. コレクションのリクエストに最新の実行結果を保存
        if (state.currentCollection) {
            const collection = state.collections.find(c => c.id === state.currentCollection);
            if (collection) {
                const request = collection.requests.find(r => r.id === requestObj.id);
                if (request) {
                    // リクエスト実行結果を保存
                    (request as any).lastRequestExecution = requestExecution;

                    // レスポンス実行結果を保存
                    (request as any).lastResponseExecution = {
                        status: parsed.status,
                        duration: parsed.duration,
                        size: parsed.size,
                        timestamp: new Date().toISOString(),
                        headers: parsed.headers,  // パース済みのヘッダーを保存
                        body: parsed.body
                    };

                    await saveCollectionsToStorage();
                }
            }
        }

        // 9. 現在のリクエストにも実行結果を保存
        if (state.currentRequest && state.currentRequest.id === requestObj.id) {
            (state.currentRequest as any).lastRequestExecution = requestExecution;
            (state.currentRequest as any).lastResponseExecution = {
                status: parsed.status,
                duration: parsed.duration,
                size: parsed.size,
                timestamp: new Date().toISOString(),
                headers: parsed.headers,  // パース済みのヘッダーを保存
                body: parsed.body
            };
        }

        return response || "";

    } catch (error: any) {
        showError('Request failed: ' + error.message);
        console.error('Request error:', error);
    } finally {
        showLoading(false);
    }

    return '';
}

/**
 * buildFetchOptions
 *  引数のリクエスト情報をもとに、XHR 送信用の { method, headers, bodyData } を返す
 */
export function buildFetchOptions(request: RequestData): FetchOptions | null {
    const method = (request.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    let bodyData: string | FormData | URLSearchParams | null = null;

    // 1. カスタムヘッダーをコピー
    if (request.headers) {
        Object.assign(headers, request.headers);
    }

    // 2. 認証ヘッダーを追加
    addAuthenticationHeaders(headers, request.auth);

    // 3. GET/HEAD 以外の場合のみ body を構築する
    if (true) {
        // bodyType の選択状況を取得
        const bodyType = request.bodyType;

        switch (bodyType) {
            case 'json': {
                // JSON 検証
                const rawText = (request.body as string)?.trim();
                if (rawText) {
                    try {
                        JSON.parse(rawText);
                        // 正常にパースできれば bodyData に文字列をセット
                        bodyData = rawText;
                        if (!headers['Content-Type'] && !headers['content-type']) {
                            headers['Content-Type'] = 'application/json';
                        }
                    } catch (e) {
                        // パース失敗ならエラー表示して中断
                        showError('不正な JSON です');
                        return null;
                    }
                }
                break;
            }

            case 'raw': {
                // そのまま文字列を送る
                bodyData = (request.body as string) || '';
                break;
            }

            case 'form-data': {
                // FormData を作成
                const formData = new FormData();
                const formFields = collectKeyValues('formDataContainer');
                Object.entries(formFields).forEach(([key, value]) => {
                    formData.append(key, value);
                });
                bodyData = formData;
                delete headers['Content-Type'];
                break;
            }

            case 'urlencoded': {
                // URLSearchParams を作成
                const params = new URLSearchParams();
                const urlEncodedFields = collectKeyValues('formDataContainer');
                Object.entries(urlEncodedFields).forEach(([key, value]) => {
                    params.append(key, value);
                });
                bodyData = params.toString();
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
                break;
            }

            default:
                // none の場合は bodyData を null のままにする
                break;
        }
    }

    return { method, headers, bodyData };
}

/**
 * addAuthenticationHeaders
 *  auth に応じて Authorization ヘッダなどを追加する
 */
export function addAuthenticationHeaders(headers: Record<string, string>, auth: AuthConfig): void {
    switch (auth.type) {
        case 'basic':
            if (auth.username && auth.password) {
                const credentials = btoa(`${auth.username}:${auth.password}`);
                headers['Authorization'] = `Basic ${credentials}`;
            }
            break;
        case 'bearer':
            if (auth.token) {
                headers['Authorization'] = `Bearer ${auth.token}`;
            }
            break;
        case 'apikey':
            if (auth.key && auth.value) {
                if (auth.addTo === 'header') {
                    headers[auth.key] = auth.value;
                }
                // query には processVariables 側で追加
            }
            break;
        case 'oauth2':
            if (auth.accessToken) {
                headers['Authorization'] = `${auth.tokenType || 'Bearer'} ${auth.accessToken}`;
            }
            break;
    }
}

/**
 * processResponse
 *  XHR で返された疑似レスポンスオブジェクト（または Fetch の Response）をパースし、
 *  status, headers, body 等を返す
 */
export async function processResponse(response: XhrResponse, duration: number): Promise<ProcessedResponse> {
    const responseData: ProcessedResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: {},
        duration: duration,
        size: 0,
        body: null,
        bodyText: ''
    };

    // ① レスポンスヘッダーの取り込み
    if (response.headers) {
        Object.entries(response.headers).forEach(([key, value]) => {
            responseData.headers[key] = value;
        });
    }

    // ② contentType を取得
    const contentType = responseData.headers['content-type'] || '';

    try {
        // ③ レスポンス本文を文字列として取得
        responseData.bodyText = await response.text();
        responseData.size = new Blob([responseData.bodyText]).size;

        // ④ Content-Type に応じて body をオブジェクト化
        if (contentType.includes('application/json')) {
            try {
                responseData.body = JSON.parse(responseData.bodyText);
            } catch (e) {
                responseData.body = responseData.bodyText;
            }
        } else {
            responseData.body = responseData.bodyText;
        }
    } catch (error) {
        responseData.bodyText = 'Error reading response body';
        responseData.body = null;
    }

    return responseData;
}

/**
 * displayResponse
 *  画面右側に「ステータス・時間・サイズ」「Body／Headers／Cookies／Tests」の各タブを描画する
 */
export function displayResponse(responseData: ProcessedResponse, format: string = 'pretty'): void {
    (window as any).lastResponse = responseData;

    // ステータス等の表示
    const statsContainer = document.getElementById('responseStats') as HTMLElement;
    statsContainer.innerHTML = `
        <span class="status-${responseData.status < 400 ? 'success' : 'error'}">
            ${responseData.status} ${responseData.statusText}
        </span>
        <span>${responseData.duration}ms</span>
        <span>${formatBytes(responseData.size)}</span>
    `;

    // Body
    displayResponseBody(responseData, format);

    // Headers
    displayResponseHeaders(responseData.headers);

    // Cookies
    displayResponseCookies(responseData.headers);
}

/**
 * displayResponseBody
 *  Bodyタブ内に Pretty / Raw / Preview のいずれかでコンテンツを表示
 */
export function displayResponseBody(responseData: ProcessedResponse, format: string): void {
    const bodyContainer = document.getElementById('responseBody') as HTMLElement;
    let content = '';
    const contentType = responseData.headers['content-type'] || '';

    switch (format) {
        case 'pretty':
            if (contentType.includes('application/json') && responseData.body && typeof responseData.body === 'object') {
                content = JSON.stringify(responseData.body, null, 2);
            } else {
                content = responseData.bodyText;
            }
            break;
        case 'raw':
            content = responseData.bodyText;
            break;
        case 'preview':
            if (contentType.includes('text/html')) {
                bodyContainer.innerHTML = `<iframe srcdoc="${escapeHtml(responseData.bodyText)}" style="width:100%;height:300px;border:1px solid #ccc;"></iframe>`;
                return;
            } else {
                content = responseData.bodyText;
            }
            break;
    }

    bodyContainer.textContent = content;
}

/**
 * displayResponseHeaders
 *  Headersタブにレスポンスヘッダをリスト表示
 */
export function displayResponseHeaders(headers: Record<string, string>): void {
    const headersContainer = document.getElementById('response-headers') as HTMLElement;
    let html = '<div class="headers-list">';

    Object.entries(headers).forEach(([key, value]) => {
        html += `
            <div class="header-item">
                <strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}
            </div>
        `;
    });
    html += '</div>';
    headersContainer.innerHTML = html;
}

/**
 * displayResponseCookies
 *  Cookiesタブに Set-Cookie ヘッダを表示
 */
export function displayResponseCookies(headers: Record<string, string>): void {
    const cookiesContainer = document.getElementById('response-cookies') as HTMLElement;
    const setCookieHeader = headers['set-cookie'];

    if (setCookieHeader) {
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        let html = '<div class="cookies-list">';
        cookies.forEach(cookie => {
            html += `<div class="cookie-item">${escapeHtml(cookie)}</div>`;
        });
        html += '</div>';
        cookiesContainer.innerHTML = html;
    } else {
        cookiesContainer.innerHTML = '<p class="empty-message">No cookies in response</p>';
    }
}

export function runTestCommand(commandString: string, responseData: ProcessedResponse): { passed: boolean; error?: string } {
    const [cmd, ...args] = commandString.trim().split(/\s+/);
    switch (cmd) {
        case 'status': {
            const expected = parseInt(args[0], 10);
            if (responseData.status !== expected) {
                return { passed: false, error: `Expected status ${expected}, got ${responseData.status}` };
            }
            return { passed: true };
        }

        case 'jsonHasProperty': {
            const prop = args[0];
            const json = responseData.body;

            if (typeof json !== 'object' || json === null) {
                return {
                    passed: false,
                    error: 'レスポンスボディが JSON オブジェクトではありません'
                };
            }
            if (!(prop in json)) {
                return {
                    passed: false,
                    error: `JSON にプロパティ "${prop}" が見つかりません`
                };
            }
            return { passed: true };
        }

        case 'jsonArrayLengthEquals': {
            const [path, expectedStr] = args;
            const expectedLen = parseInt(expectedStr, 10);
            const json = responseData.body;

            if (typeof json !== 'object' || json === null) {
                return {
                    passed: false,
                    error: 'レスポンスボディが JSON オブジェクトではありません'
                };
            }
            const arr = path.split('.').reduce((o: any, key: string) => (o && o[key] !== undefined ? o[key] : undefined), json);
            if (!Array.isArray(arr)) {
                return {
                    passed: false,
                    error: `パス "${path}" に対応する値が配列ではありません`
                };
            }
            if (arr.length !== expectedLen) {
                return {
                    passed: false,
                    error: `Expected ${path}.length === ${expectedLen}, got ${arr.length}`
                };
            }
            return { passed: true };
        }

        case 'bodyContains': {
            const substr = args.join(' ');
            const text = responseData.bodyText ?? '';
            if (!text.includes(substr)) {
                return {
                    passed: false,
                    error: `レスポンスボディに "${substr}" が含まれていません`
                };
            }
            return { passed: true };
        }

        case 'setVarFromHeader': {
            const varName = args[0];
            const headerName = args.slice(1).join(' ');
            const headers = responseData.headers || {};

            const headerKeyLower = headerName.toLowerCase();
            let headerValue: string | undefined;
            for (const key in headers) {
                if (key.toLowerCase() === headerKeyLower) {
                    headerValue = headers[key];
                    break;
                }
            }
            if (headerValue === undefined) {
                return {
                    passed: false,
                    error: `レスポンスヘッダー "${headerName}" が見つかりません`
                };
            }
            console.log("取得したAuthorizationヘッダ：varName=", varName);
            console.log("取得したAuthorizationヘッダ：headerValue=", headerValue);
            setVariable('environment', varName, headerValue).catch(console.error);
            renderVariables('environment');
            return { passed: true };
        }

        case 'jsonValueEquals': {
            const path = args[0];
            const expectedRaw = args.slice(1).join(' ');
            const expected = isNaN(Number(expectedRaw)) ? expectedRaw : Number(expectedRaw);

            let jsonBody: any;
            if (typeof responseData.bodyText === 'string') {
                try {
                    jsonBody = JSON.parse(responseData.bodyText);
                } catch {
                    return {
                        passed: false,
                        error: `レスポンスボディが有効な JSON ではありません`
                    };
                }
            } else {
                jsonBody = responseData.body;
            }

            const actual = path.split('.').reduce((obj: any, key: string) => {
                if (obj && key in obj) {
                    return obj[key];
                }
                if (key === 'length' && Array.isArray(obj)) {
                    return obj.length;
                }
                return undefined;
            }, jsonBody);

            if (actual === undefined) {
                return {
                    passed: false,
                    error: `パス "${path}" が見つかりません`
                };
            }

            if (actual !== expected) {
                return {
                    passed: false,
                    error: `期待値: ${expected} ですが、実際の値: ${actual} です`
                };
            }
            return { passed: true };
        }

        case 'headerExists': {
            const headerName = args[0].toLowerCase();
            const found = Object.keys(responseData.headers).some(
                k => k.toLowerCase() === headerName
            );
            if (!found) {
                return {
                    passed: false,
                    error: `ヘッダー "${args[0]}" が存在しません`
                };
            }
            return { passed: true };
        }

        case 'headerValueEquals': {
            const headerName = args[0].toLowerCase();
            const expectedValue = args.slice(1).join(' ');
            let actualValue: string | undefined;
            for (const [k, v] of Object.entries(responseData.headers)) {
                if (k.toLowerCase() === headerName) {
                    actualValue = v;
                    break;
                }
            }
            if (actualValue === undefined) {
                return { passed: false, error: `ヘッダー "${args[0]}" が存在しません` };
            }
            if (actualValue !== expectedValue) {
                return { passed: false, error: `"${args[0]}" の値が期待値と異なります (期待: ${expectedValue}, 実際: ${actualValue})` };
            }
            return { passed: true };
        }

        default:
            return { passed: false, error: `Unknown test command: ${cmd}` };
    }
}

/**
 * 変数参照から値を取得する
 * @param varPath 変数パス（例: ["Collection", "Request", "response", "headers", "key"]）
 * @returns 取得した値
 */
function getValueFromVarPath(varPath: string[]): any {
    console.log('変数パス:', varPath);
    
    const collection = state.collections.find(c => c.name === varPath[0]);
    if (!collection) {
        throw new Error(`コレクション「${varPath[0]}」が見つかりません`);
    }
    const request = collection.requests.find(r => r.name === varPath[1]);
    if (!request) {
        throw new Error(`リクエスト「${varPath[1]}」が見つかりません`);
    }
    if (!request.lastResponseExecution) {
        throw new Error('request の実行結果が存在しません');
    }
    
    let value: any = request.lastResponseExecution as ResponseExecution;
    console.log('初期値:', value);
    
    // response.headers や response.body などのパスを処理
    for (let i = 2; i < varPath.length; i++) {
        const path = varPath[i];
        console.log(`パス[${i}]:`, path, '現在の値:', value);
        
        if (path === 'response') {
            value = value;
        } else if (path === 'headers' && value.headers) {
            value = value.headers;
        } else if (path === 'body' && value.body) {
            value = value.body;
        } else if (path.startsWith('jsonPath(') && path.endsWith(')')) {
            // jsonPath式を処理
            const jsonPathExpr = path.slice(9, -1);
            console.log('JSONPath式:', jsonPathExpr);
            try {
                if (typeof value === 'string') {
                    try {
                        value = JSON.parse(value);
                    } catch (e) {
                        throw new Error('JSONのパースに失敗しました');
                    }
                }
                value = evaluateJsonPath(value, jsonPathExpr);
            } catch (error: any) {
                throw new Error(`JSONPath評価エラー: ${error.message}`);
            }
        } else if (value && typeof value === 'object' && path in value) {
            value = value[path];
        } else {
            // パスが見つからない場合、残りのパスを結合してエラーメッセージを生成
            const remainingPath = varPath.slice(0, i + 1).join('.');
            throw new Error(`パス「${remainingPath}」が見つかりません`);
        }
        console.log(`パス[${i}]処理後:`, value);
    }
    
    if (value === undefined) {
        throw new Error(`変数「${varPath.join('.')}」の値が取得できません`);
    }
    return value;
}

/**
 * JSONPath式を評価して値を取得する
 * @param json JSONオブジェクト
 * @param path JSONPath式
 * @returns 取得した値
 */
function evaluateJsonPath(json: any, path: string): any {
    console.log('JSONPath評価:', { json, path });
    
    // 単純なドット記法のパスを処理
    if (path.startsWith('$.')) {
        const keys = path.slice(2).split('.');
        console.log('JSONPathキー:', keys);
        
        let value = json;
        for (const key of keys) {
            console.log('キー処理:', key, '現在の値:', value);
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                throw new Error(`JSONPath「${path}」が見つかりません`);
            }
        }
        return value;
    }
    throw new Error(`未対応のJSONPath式です: ${path}`);
}

/**
 * executePreRequestScript
 * プリリクエストスクリプトを実行する
 */
export function executePreRequestScript(script: string, requestObj: RequestData): RequestData {
    if (!script) return requestObj;

    const lines = script.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('//')) continue;

        const firstSpaceIndex = trimmedLine.indexOf(' ');
        if (firstSpaceIndex === -1) {
            console.warn(`Invalid command format: ${trimmedLine}`);
            continue;
        }

        const command = trimmedLine.substring(0, firstSpaceIndex);
        const argsString = trimmedLine.substring(firstSpaceIndex + 1).trim();
        console.log('Executing command:', command, argsString);

        try {
            switch (command) {
                case 'setBody':
                    if (!argsString) {
                        showError('setBody requires a body content');
                        continue;
                    }
                    requestObj.body = argsString;
                    // Content-Typeが設定されていない場合はapplication/jsonを設定
                    if (!requestObj.headers['Content-Type'] && !requestObj.headers['content-type']) {
                        requestObj.headers['Content-Type'] = 'application/json';
                    }
                    break;

                case 'removeHeader':
                    if (!argsString) {
                        showError('removeHeader requires a header name');
                        continue;
                    }
                    // ヘッダー名の大文字小文字を区別せずに削除
                    const headerToRemove = argsString.toLowerCase();
                    Object.keys(requestObj.headers).forEach(key => {
                        if (key.toLowerCase() === headerToRemove) {
                            delete requestObj.headers[key];
                        }
                    });
                    break;

                case 'setUrl':
                    if (!argsString) {
                        console.warn('setUrl requires a URL');
                        continue;
                    }
                    requestObj.url = argsString;
                    break;

                case 'setUrlWithVar':
                    if (!argsString) {
                        console.warn('setUrlWithVar requires a variable name');
                        continue;
                    }
                    const urlValue = getVariable(argsString);
                    if (urlValue === undefined) {
                        throw new Error(`変数「${argsString}」が変数ではありません`);
                    }
                    requestObj.url = urlValue;
                    break;

                case 'addHeader':
                    if (!argsString) {
                        console.warn('addHeader requires a header name and value');
                        continue;
                    }
                    const headerNameEndIndex = argsString.indexOf(' ');
                    if (headerNameEndIndex === -1) {
                        console.warn('addHeader requires both header name and value');
                        continue;
                    }
                    const headerName = argsString.substring(0, headerNameEndIndex);
                    const headerValue = argsString.substring(headerNameEndIndex + 1).trim();
                    requestObj.headers[headerName] = headerValue;
                    break;

                case 'addHeaderWithVar':
                    if (!argsString) {
                        showError('addHeaderWithVar requires a header name and variable name');
                        continue;
                    }
                    const headerVarNameEndIndex = argsString.indexOf(' ');
                    if (headerVarNameEndIndex === -1) {
                        showError('addHeaderWithVar requires both header name and variable name');
                        continue;
                    }
                    const headerVarName = argsString.substring(0, headerVarNameEndIndex);
                    const headerVarValue = argsString.substring(headerVarNameEndIndex + 1).trim();
                    
                    try {
                        const value = getValueFromVarString(headerVarValue);
                        requestObj.headers[headerVarName] = String(value);
                    } catch (error: any) {
                        showError(error.message);
                        continue;
                    }
                    break;

                case 'setBodyWithVar':
                    if (!argsString) {
                        showError('setBodyWithVar requires a variable name');
                        continue;
                    }
                    
                    try {
                        const value = getValueFromVarString(argsString);
                        requestObj.body = String(value);
                    } catch (error: any) {
                        showError(error.message);
                        continue;
                    }
                    break;

                default:
                    console.warn(`Unknown command: ${command}`);
            }
        } catch (error: any) {
            console.error('Pre-request script 実行エラー:', error);
            showError(`Pre-request script 実行エラー: ${error.message}`);
            throw error;
        }
    }

    return requestObj;
}

/**
 * displayTestResults
 *  テスト結果を Tests タブに表示
 */
export function displayTestResults(results: TestResult[]): void {
    const testsContainer = document.getElementById('response-tests') as HTMLElement;
    if (results.length === 0) {
        testsContainer.innerHTML = '<p class="empty-message">No tests executed</p>';
        return;
    }
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    let html = `
        <div class="test-summary">
            <span class="test-passed">✓ ${passed} passed</span>
            <span class="test-failed">✗ ${failed} failed</span>
        </div>
        <div class="test-results">
    `;
    results.forEach(result => {
        html += `
            <div class="test-result ${result.passed ? 'passed' : 'failed'}">
                <span class="test-icon">${result.passed ? '✓' : '✗'}</span>
                <span class="test-name">${escapeHtml(result.name)}</span>
                ${result.error ? `<span class="test-error">${escapeHtml(result.error)}</span>` : ''}
            </div>
        `;
    });
    html += '</div>';
    testsContainer.innerHTML = html;
}

/**
 * processVariables
 *  state.currentRequest の各プロパティ（URL, headers, params, body）について
 *  変数置換を行った結果を返す
 */
export function processVariables(request: RequestData): RequestData {
    const processed = JSON.parse(JSON.stringify(request));
    processed.url = replaceVariables(processed.url);
    processed.headers = deepReplaceVariables(processed.headers);
    processed.params = deepReplaceVariables(processed.params);
    if (processed.body) {
        if (typeof processed.body === 'string') {
            processed.body = replaceVariables(processed.body);
        } else {
            processed.body = deepReplaceVariables(processed.body);
        }
    }

    // URLの有効性チェック
    if (!processed.url || !processed.url.trim()) {
        throw new Error('URL is required');
    }

    try {
        const url = new URL(processed.url);
        Object.entries(processed.params).forEach(([key, value]) => {
            url.searchParams.set(key, String(value));
        });
        if (processed.auth.type === 'apikey' && processed.auth.addTo === 'query') {
            if (processed.auth.key && processed.auth.value) {
                url.searchParams.set(processed.auth.key, processed.auth.value);
            }
        }
        processed.url = url.toString();
    } catch (error) {
        throw new Error(`Invalid URL: ${processed.url}`);
    }
    return processed;
}

/**
 * saveToHistory
 *  historyManager へ委譲
 */
export async function saveToHistory(request: RequestData, responseData: ProcessedResponse): Promise<void> {
    await saveToHistoryFn(request, responseData);
}

/**
 * saveCurrentRequest
 *  - state.currentRequest の内容を取得し、
 *    ● もし「コレクション配下のリクエスト」としてロードされているなら、そのコレクションデータを更新して保存
 *    ● もし「シナリオ配下のリクエスト」としてロードされているなら、そのシナリオデータを更新して保存
 *    ● それ以外（新規作成）なら、state.currentRequest 自体をそのままローカルに保存（履歴などに利用）
 */
export async function saveCurrentRequest(): Promise<void> {
    const req = state.currentRequest;
    if (!req || !req.id) {
        showError('No request to save.');
        return;
    }

    try {
        // ① まず、フォームの各入力欄から値を取得して state.currentRequest を更新する
        const methodSelect = document.getElementById('methodSelect') as HTMLSelectElement;
        const nameInput = document.getElementById('nameInput') as HTMLInputElement;
        const urlInput = document.getElementById('urlInput') as HTMLInputElement;
        
        req.method = methodSelect.value;
        req.name = nameInput.value.trim();
        req.url = urlInput.value.trim();

        // ヘッダー
        const headerRows = document.querySelectorAll('#headersContainer .key-value-row');
        const newHeaders: Record<string, string> = {};
        headerRows.forEach(row => {
            const rowElement = row as HTMLElement;
            const keyInput = rowElement.querySelector('.key-input') as HTMLInputElement;
            const valueInput = rowElement.querySelector('.value-input') as HTMLInputElement;
            const key = keyInput.value.trim();
            const value = valueInput.value.trim();
            if (key) newHeaders[key] = value;
        });
        req.headers = newHeaders;

        // パラメータ
        const paramRows = document.querySelectorAll('#paramsContainer .key-value-row');
        const newParams: Record<string, string> = {};
        paramRows.forEach(row => {
            const rowElement = row as HTMLElement;
            const keyInput = rowElement.querySelector('.key-input') as HTMLInputElement;
            const valueInput = rowElement.querySelector('.value-input') as HTMLInputElement;
            const key = keyInput.value.trim();
            const value = valueInput.value.trim();
            if (key) newParams[key] = value;
        });
        req.params = newParams;

        // ボディ
        const selectedBodyType = document.querySelector('input[name="bodyType"]:checked') as HTMLInputElement;
        if (selectedBodyType?.value === 'raw') {
            const rawBody = document.getElementById('rawBody') as HTMLTextAreaElement;
            req.body = rawBody.value;
        } else if (selectedBodyType?.value === 'json') {
            const jsonBody = document.getElementById('jsonBody') as HTMLTextAreaElement;
            req.body = jsonBody.value;
        } else if (selectedBodyType?.value === 'form-data') {
            const formRows = document.querySelectorAll('#formDataContainer .key-value-row');
            const formDataObj: Record<string, string> = {};
            formRows.forEach(row => {
                const rowElement = row as HTMLElement;
                const keyInput = rowElement.querySelector('.key-input') as HTMLInputElement;
                const valueInput = rowElement.querySelector('.value-input') as HTMLInputElement;
                const key = keyInput.value.trim();
                const value = valueInput.value.trim();
                if (key) formDataObj[key] = value;
            });
            req.body = formDataObj;
        } else if (selectedBodyType?.value === 'urlencoded') {
            const urlRows = document.querySelectorAll('#urlEncodedContainer .key-value-row');
            const urlObj: Record<string, string> = {};
            urlRows.forEach(row => {
                const rowElement = row as HTMLElement;
                const keyInput = rowElement.querySelector('.key-input') as HTMLInputElement;
                const valueInput = rowElement.querySelector('.value-input') as HTMLInputElement;
                const key = keyInput.value.trim();
                const value = valueInput.value.trim();
                if (key) urlObj[key] = value;
            });
            req.body = urlObj;
        } else {
            req.body = null;
        }

        // 認証設定
        const authType = document.getElementById('authType') as HTMLSelectElement;
        req.auth = { type: authType.value as AuthConfig['type'] };
        if (authType.value === 'basic') {
            const authUsername = document.getElementById('authUsername') as HTMLInputElement;
            const authPassword = document.getElementById('authPassword') as HTMLInputElement;
            req.auth.username = authUsername.value;
            req.auth.password = authPassword.value;
        } else if (authType.value === 'bearer') {
            const authToken = document.getElementById('authToken') as HTMLInputElement;
            req.auth.token = authToken.value;
        } else if (authType.value === 'apikey') {
            const authKey = document.getElementById('authKey') as HTMLInputElement;
            const authValue = document.getElementById('authValue') as HTMLInputElement;
            const authAddTo = document.getElementById('authAddTo') as HTMLSelectElement;
            req.auth.key = authKey.value;
            req.auth.value = authValue.value;
            req.auth.addTo = authAddTo.value as 'query' | 'header';
        }

        // ② どこに保存するか判定する
        if (state.currentCollection) {
            const col = state.collections.find(c => c.id === state.currentCollection);
            if (col && col.requests) {
                const idx = col.requests.findIndex(r => r.id === req.id);
                if (idx !== -1) {
                    col.requests[idx] = JSON.parse(JSON.stringify(req));
                    await saveCollectionsToStorage();
                    showSuccess('Request saved to collection.');
                    return;
                }
            }
        }

        if (state.currentScenario) {
            const scenario = state.scenarios.find(s => s.id === state.currentScenario);
            if (scenario && scenario.requests) {
                const idx2 = scenario.requests.findIndex(r => r.id === req.id);
                if (idx2 !== -1) {
                    scenario.requests[idx2] = JSON.parse(JSON.stringify(req));
                    await saveScenariosToStorage();
                    showSuccess('Request saved to scenario.');
                    return;
                }
            }
        }

        showSuccess('Request saved.');

    } catch (error: any) {
        console.error('Error saving request:', error);
        showError('Failed to save request: ' + error.message);
    }
}

/**
 * 変数参照文字列から値を取得する
 * @param varString 変数参照文字列（例: ${"Collection"."Request"."response"."headers"."key"}）
 * @returns 取得した値
 */
function getValueFromVarString(varString: string): any {
    console.log('変数参照文字列:', varString);
    
    if (varString.startsWith('${') && varString.endsWith('}')) {
        // jsonPathを含む場合の特別な処理
        if (varString.includes('jsonPath(')) {
            const parts = varString.slice(2, -1).split('"."');
            const varPath: string[] = [];
            
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i].replace(/"/g, '');
                if (part.includes('jsonPath(')) {
                    // jsonPathの前の部分を追加
                    const beforeJsonPath = part.split('.jsonPath(')[0];
                    if (beforeJsonPath) {
                        varPath.push(beforeJsonPath);
                    }
                    // jsonPath部分を追加
                    varPath.push('jsonPath(' + part.split('.jsonPath(')[1]);
                } else {
                    varPath.push(part);
                }
            }
            console.log('パースされた変数パス:', varPath);
            return getValueFromVarPath(varPath);
        } else {
            const varPath = varString.slice(2, -1).split('"."').map(s => s.replace(/"/g, ''));
            console.log('パースされた変数パス:', varPath);
            return getValueFromVarPath(varPath);
        }
    } else {
        const value = getVariable(varString);
        if (value === undefined) {
            throw new Error(`変数「${varString}」が変数ではありません`);
        }
        return value;
    }
}