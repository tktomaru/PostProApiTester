// requestManager.js
// ───────────────────────────────────────────────────────────────────────────────
// リクエスト送受信・プリリクエストスクリプト・テストスクリプト・レスポンス表示をまとめる

import {
    state
} from './state.js';

import {
    showLoading,
    showError,
    showSuccess,
    escapeHtml,
    formatBytes
} from './utils.js';

import { switchMainTab, addKeyValueRow, handleBodyTypeChange, updateAuthData, renderAuthDetails } from './utils.js';
import { getVariable, replaceVariables, deepReplaceVariables } from './variableManager.js';
/**
 * loadRequestIntoEditor
 *  コレクションや履歴から呼ばれ、右側エディタ（メソッド、URL、ヘッダ、ボディ、認証）に
 *  state.currentRequest を反映する
 */
export function loadRequestIntoEditor(request) {
    // state.currentRequest の値をまるごと置き換え
    state.currentRequest.method = request.method;
    state.currentRequest.url = request.url;
    state.currentRequest.headers = { ...request.headers };
    state.currentRequest.params = { ...request.params };
    state.currentRequest.body = request.body;
    state.currentRequest.auth = { ...request.auth };

    // メソッド + URL を設定
    document.getElementById('methodSelect').value = request.method;
    document.getElementById('urlInput').value = request.url;

    // ヘッダ描画
    const headersContainer = document.getElementById('headersContainer');
    headersContainer.innerHTML = '';
    if (request.headers && Object.keys(request.headers).length > 0) {
        Object.entries(request.headers).forEach(([key, value]) => {
            addKeyValueRow(headersContainer, 'header');
            const rows = headersContainer.querySelectorAll('.key-value-row');
            const lastRow = rows[rows.length - 1];
            lastRow.querySelector('.key-input').value = key;
            lastRow.querySelector('.value-input').value = value;
        });
    } else {
        addKeyValueRow(headersContainer, 'header');
    }

    // パラメータ描画
    const paramsContainer = document.getElementById('paramsContainer');
    paramsContainer.innerHTML = '';
    if (request.params && Object.keys(request.params).length > 0) {
        Object.entries(request.params).forEach(([key, value]) => {
            addKeyValueRow(paramsContainer, 'param');
            const rows = paramsContainer.querySelectorAll('.key-value-row');
            const lastRow = rows[rows.length - 1];
            lastRow.querySelector('.key-input').value = key;
            lastRow.querySelector('.value-input').value = value;
        });
    } else {
        addKeyValueRow(paramsContainer, 'param');
    }

    // ボディ描画
    if (request.body) {
        if (typeof request.body === 'string') {
            document.querySelector('input[name="bodyType"][value="raw"]').checked = true;
            handleBodyTypeChange({ target: { value: 'raw' } });
            document.getElementById('rawBody').value = request.body;
        } else {
            document.querySelector('input[name="bodyType"][value="form-data"]').checked = true;
            handleBodyTypeChange({ target: { value: 'form-data' } });
            const formDataContainer = document.getElementById('formDataContainer');
            formDataContainer.innerHTML = '';
            Object.entries(request.body).forEach(([key, value]) => {
                addKeyValueRow(formDataContainer, 'body');
                const rows = formDataContainer.querySelectorAll('.key-value-row');
                const lastRow = rows[rows.length - 1];
                lastRow.querySelector('.key-input').value = key;
                lastRow.querySelector('.value-input').value = value;
            });
        }
    } else {
        document.querySelector('input[name="bodyType"][value="none"]').checked = true;
        handleBodyTypeChange({ target: { value: 'none' } });
    }

    // 認証描画
    if (request.auth) {
        document.getElementById('authType').value = request.auth.type || 'none';
        renderAuthDetails(request.auth.type);

        switch (request.auth.type) {
            case 'basic':
                document.getElementById('authUsername').value = request.auth.username || '';
                document.getElementById('authPassword').value = request.auth.password || '';
                break;
            case 'bearer':
                document.getElementById('authToken').value = request.auth.token || '';
                break;
            case 'apikey':
                document.getElementById('authKey').value = request.auth.key || '';
                document.getElementById('authValue').value = request.auth.value || '';
                document.getElementById('authAddTo').value = request.auth.addTo || 'header';
                break;
            case 'oauth2':
                document.getElementById('authAccessToken').value = request.auth.accessToken || '';
                document.getElementById('authTokenType').value = request.auth.tokenType || 'Bearer';
                break;
        }
        updateAuthData();
    }

    // タブをリクエストタブに切り替え
    switchMainTab('request');
}


/**
 * executeTestScript
 *  Tests タブに書かれたスクリプトを実行し、結果を表示
 */
export async function executeTestScript(responseData) {
    // テキストエリアから文字列を取得
    const raw = document.getElementById('testScript')?.value;
    if (!raw?.trim()) return;

    // 改行で分割し、空行や先頭が // のコメント行を除外
    const lines = raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('//'));

    const results = [];
    try {
        for (const line of lines) {
            // runTestCommand は、単一行のテストコマンドを評価し { passed, error } を返す想定
            const result = runTestCommand(line, responseData);
            results.push({ name: line, passed: result.passed, error: result.error });
        }
        displayTestResults(results);
    } catch (error) {
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
 *  プリリクエストスクリプトを実行 → リクエストを送信 → レスポンスを表示 → テストスクリプトを実行 → 履歴に保存
 */
export async function sendRequest() {
    try {
        showLoading(true);

        if (!state.currentRequest.url.trim()) {
            showError('URL is required');
            return;
        }

        // 1. プリリクエストスクリプト実行
        await executePreRequestScript();

        // 2. 変数置換後のリクエストを生成
        const processedRequest = processVariables(state.currentRequest);

        // 3. fetch オプションを作成
        const fetchOptions = buildFetchOptions(processedRequest);

        // 4. リクエスト送信（タイムアウト付き）
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        let response;
        try {
            fetchOptions.signal = controller.signal;
            response = await fetch(processedRequest.url, fetchOptions);
            clearTimeout(timeoutId);
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
        const duration = Date.now() - startTime;

        // 5. レスポンス解析
        const responseData = await processResponse(response, duration);

        // 6. レスポンス表示
        displayResponse(responseData);

        // 7. テストスクリプト実行
        await executeTestScript(responseData);

        // 8. 履歴に保存
        await saveToHistory(processedRequest, responseData);

    } catch (error) {
        showError('Request failed: ' + error.message);
        console.error('Request error:', error);
    } finally {
        showLoading(false);
    }
}

/**
 * buildFetchOptions
 *  リクエスト情報をもとに fetch 用のオプション（method, headers, body 等）を組み立てる
 */
export function buildFetchOptions(request) {
    const options = {
        method: request.method,
        headers: {}
    };

    // カスタムヘッダを追加
    Object.assign(options.headers, request.headers);

    // 認証ヘッダを追加
    addAuthenticationHeaders(options.headers, request.auth);

    // POST/PUT/PATCH では Body を追加
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const bodyType = document.querySelector('input[name="bodyType"]:checked')?.value || 'none';
        switch (bodyType) {
            case 'raw':
                options.body = request.body;
                if (!options.headers['Content-Type']) {
                    options.headers['Content-Type'] = 'application/json';
                }
                break;
            case 'form-data':
                const formData = new FormData();
                const formFields = collectKeyValues('formDataContainer');
                Object.entries(formFields).forEach(([key, value]) => {
                    formData.append(key, value);
                });
                options.body = formData;
                delete options.headers['Content-Type'];
                break;
            case 'urlencoded':
                const params = new URLSearchParams();
                const urlEncodedFields = collectKeyValues('formDataContainer');
                Object.entries(urlEncodedFields).forEach(([key, value]) => {
                    params.append(key, value);
                });
                options.body = params;
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                break;
        }
    }

    return options;
}

/**
 * addAuthenticationHeaders
 *  state.currentRequest.auth に応じて Authorization ヘッダなどを追加する
 */
export function addAuthenticationHeaders(headers, auth) {
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
 *  fetch から返された Response オブジェクトをパースし、status, headers, body 等を返す
 */
export async function processResponse(response, duration) {
    const responseData = {
        status: response.status,
        statusText: response.statusText,
        headers: {},
        duration: duration,
        size: 0,
        body: null,
        bodyText: ''
    };

    // ヘッダを読み込み
    response.headers.forEach((value, key) => {
        responseData.headers[key] = value;
    });

    // ボディを読み込み
    const contentType = response.headers.get('content-type') || '';
    try {
        responseData.bodyText = await response.text();
        responseData.size = new Blob([responseData.bodyText]).size;

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
export function displayResponse(responseData, format = 'pretty') {
    window.lastResponse = responseData;

    // ステータス等の表示
    const statsContainer = document.getElementById('responseStats');
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
export function displayResponseBody(responseData, format) {
    const bodyContainer = document.getElementById('responseBody');
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
export function displayResponseHeaders(headers) {
    const headersContainer = document.getElementById('response-headers');
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
export function displayResponseCookies(headers) {
    const cookiesContainer = document.getElementById('response-cookies');
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


export function runTestCommand(commandString, responseData) {
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
            const json = responseData.body; // processResponse で JSON.parse 済み or テキスト

            // JSON オブジェクトかどうかをチェック
            if (typeof json !== 'object' || json === null) {
                return {
                    passed: false,
                    error: 'レスポンスボディが JSON オブジェクトではありません'
                };
            }
            // キー存在チェック
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
            // ドット区切りでネストされた配列を取得
            const arr = path.split('.').reduce((o, key) => (o && o[key] !== undefined ? o[key] : undefined), json);
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

        // --- カスタムコマンド例: レスポンスヘッダーの値を変数にセット ---
        case 'setVarFromHeader': {
            const varName = args[0];
            const headerName = args.slice(1).join(' ');
            const headers = responseData.headers || {};

            // ヘッダー名の大文字小文字を区別しない検索
            const headerKeyLower = headerName.toLowerCase();
            let headerValue;
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
            // 例: 非同期で環境変数に保存する関数を呼び出す（await は不要。非同期処理なのでエラーは catch）
            import('./variableManager.js').then(({ setVariable }) => {
                setVariable('environment', varName, headerValue).catch(console.error);
            });
            return { passed: true };
        }

        default:
            return { passed: false, error: `Unknown test command: ${cmd}` };
    }
}

/**
 * executePreRequestScript
 *  Pre-request タブに書かれたスクリプトを実行（pm オブジェクト経由で state.currentRequest を操作可能）
 */

export async function executePreRequestScript() {
    const raw = document.getElementById('preRequestScript')?.value;
    if (!raw?.trim()) return;

    // 行ごとに分割してコマンドを解析
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//'));

    try {
        for (const line of lines) {
            // 空白で先頭コマンドと引数を分割
            const [cmd, ...args] = line.split(/\s+/);

            switch (cmd) {
                case 'setUrl': {
                    // args[0] に URL 文字列が入る
                    const newUrl = args.join(' ');
                    state.currentRequest.url = newUrl;
                    break;
                }

                case 'addHeader': {
                    // args[0] = Header 名, args[1..] = 値 (空白を含む可能性を考慮)
                    const headerName = args[0];
                    const headerValue = args.slice(1).join(' ');
                    state.currentRequest.headers[headerName] = headerValue;
                    break;
                }

                case 'removeHeader': {
                    // args[0] = Header 名
                    const headerName = args[0];
                    delete state.currentRequest.headers[headerName];
                    break;
                }

                case 'setBody': {
                    // args.join(' ') = JSON 文字列 (または自由テキスト)
                    const text = args.join(' ');
                    // JSON 解析を試み、失敗すればそのまま文字列をセット
                    try {
                        state.currentRequest.body = JSON.parse(text);
                    } catch {
                        state.currentRequest.body = text;
                    }
                    break;
                }

                case 'setUrlWithVar': {
                    // 「setUrlWithVar VAR_NAME」で、環境変数から取り出した文字列を URL に設定
                    // 例: setUrlWithVar apiBaseUrl
                    const varName = args[0];
                    const val = getVariable(varName);
                    if (typeof val === 'string') {
                        state.currentRequest.url = val;
                    } else {
                        throw new Error(`変数「${varName}」が文字列ではありません`);
                    }
                    break;
                }

                case 'addHeaderWithVar': {
                    // 「addHeaderWithVar HEADER_NAME VAR_NAME」で、VAR_NAME 変数の値をヘッダー値に設定
                    // 例: addHeaderWithVar Authorization authToken
                    const headerName = args[0];
                    const varName = args[1];
                    const val = getVariable(varName);
                    if (typeof val === 'string') {
                        state.currentRequest.headers[headerName] = val;
                    } else {
                        throw new Error(`変数「${varName}」が文字列ではありません`);
                    }
                    break;
                }

                case 'setBodyWithVar': {
                    // 「setBodyWithVar VAR_NAME」で、変数の中身を body に JSON としてセット
                    // 例: setBodyWithVar requestPayload
                    const varName = args[0];
                    const val = getVariable(varName);
                    state.currentRequest.body = val;
                    break;
                }

                default:
                    throw new Error(`不明なコマンド: ${cmd}`);
            }
        }
    } catch (error) {
        console.error('Pre-request script 実行エラー:', error);
        showError('Pre-request script エラー: ' + error.message);
    }
}
/**
 * createTestPmObject
 *  テスト用 pm オブジェクトを構築
 */
function createTestPmObject(responseData, testResults) {
    return {
        test: (name, testFunction) => {
            try {
                testFunction();
                testResults.push({ name, passed: true });
            } catch (error) {
                testResults.push({ name, passed: false, error: error.message });
            }
        },
        response: {
            code: responseData.status,
            status: responseData.statusText,
            headers: responseData.headers,
            responseTime: responseData.duration,
            responseSize: responseData.size,
            to: {
                have: {
                    status: expectedStatus => {
                        if (responseData.status !== expectedStatus) {
                            throw new Error(`Expected status ${expectedStatus}, got ${responseData.status}`);
                        }
                    },
                    header: headerName => {
                        if (!responseData.headers[headerName]) {
                            throw new Error(`Expected header '${headerName}' not found`);
                        }
                    },
                    jsonBody: (path, value) => {
                        const { getValueByPath } = import('./utils.js');
                        const actual = getValueByPath(responseData.body, path);
                        if (actual !== value) {
                            throw new Error(`Expected ${path} to be ${value}, got ${actual}`);
                        }
                    }
                },
                be: {
                    ok: () => {
                        if (responseData.status >= 400) {
                            throw new Error(`Expected successful response, got ${responseData.status}`);
                        }
                    }
                }
            },
            json: () => {
                if (typeof responseData.body !== 'object' || responseData.body === null) {
                    throw new Error('Response is not JSON');
                }
                return responseData.body;
            },
            text: () => responseData.bodyText
        },
        expect: value => ({
            to: {
                have: {
                    property: prop => {
                        if (typeof value !== 'object' || !(prop in value)) {
                            throw new Error(`Expected object to have property '${prop}'`);
                        }
                        return {
                            with: {
                                value: expectedValue => {
                                    if (value[prop] !== expectedValue) {
                                        throw new Error(`Expected ${prop} to be ${expectedValue}, got ${value[prop]}`);
                                    }
                                }
                            }
                        };
                    }
                },
                equal: expected => {
                    if (value !== expected) {
                        throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
                    }
                },
                include: substring => {
                    if (typeof value !== 'string' || !value.includes(substring)) {
                        throw new Error(`Expected '${value}' to include '${substring}'`);
                    }
                },
                be: {
                    a: type => {
                        const actualType = Array.isArray(value) ? 'array' : typeof value;
                        if (actualType !== type) {
                            throw new Error(`Expected ${type}, got ${actualType}`);
                        }
                    }
                }
            }
        }),
        variables: {
            get: key => getVariable(key),
            set: async (key, value) => {
                const { setVariable } = await import('./variableManager.js');
                await setVariable('environment', key, value);
            }
        }
    };
}

/**
 * displayTestResults
 *  テスト結果を Tests タブに表示
 */
export function displayTestResults(results) {
    const testsContainer = document.getElementById('response-tests');
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
export function processVariables(request) {
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
    const url = new URL(processed.url);
    Object.entries(processed.params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });
    if (processed.auth.type === 'apikey' && processed.auth.addTo === 'query') {
        url.searchParams.set(processed.auth.key, processed.auth.value);
    }
    processed.url = url.toString();
    return processed;
}

/**
 * saveToHistory
 *  historyManager へ委譲
 */
export async function saveToHistory(request, responseData) {
    const { saveToHistory: saveFn } = await import('./historyManager.js');
    await saveFn(request, responseData);
}
