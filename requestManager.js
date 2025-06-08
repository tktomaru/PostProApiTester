// requestManager.js
// ───────────────────────────────────────────────────────────────────────────────
// リクエスト送受信・プリリクエストスクリプト・テストスクリプト・レスポンス表示をまとめる

import {
    state,
    saveCollectionsToStorage,
    saveScenariosToStorage
} from './state.js';

import {
    showLoading,
    showError,
    showSuccess,
    escapeHtml,
    formatBytes
} from './utils.js';

import { switchMainTab, addKeyValueRow, handleBodyTypeChange, updateAuthData, renderAuthDetails, collectKeyValues, getValueByPath } from './utils.js';
import { getVariable, replaceVariables, deepReplaceVariables, renderVariables, setVariable } from './variableManager.js';
import { saveToHistory as saveToHistoryFn } from './historyManager.js';

/**
 * loadRequestIntoEditor
 *  コレクションや履歴から呼ばれ、右側エディタ（メソッド、URL、ヘッダ、ボディ、認証）に
 *  state.currentRequest を反映する
 */
export function loadRequestIntoEditor(request) {
    // state.currentRequest の値をまるごと置き換え
    state.currentRequest = JSON.parse(JSON.stringify(request));
    state.currentRequest.method = request.method;
    state.currentRequest.url = request.url;
    state.currentRequest.headers = { ...request.headers };
    state.currentRequest.params = { ...request.params };
    state.currentRequest.body = request.body;
    state.currentRequest.auth = { ...request.auth };
    // ① リクエスト 名称 を表示する
    const nameDisplay = document.getElementById('request-name-display');
    if (nameDisplay) {
        // 例：<span>Request ID: <em>...</em></span> の <em> 部分を書き換え
        nameDisplay.innerHTML = `<input type="text" id="nameInput" value="${request.name}"></input>`;
    }
    // ① リクエスト ID を表示する
    const idDisplay = document.getElementById('request-id-display');
    if (idDisplay) {
        // 例：<span>Request ID: <em>...</em></span> の <em> 部分を書き換え
        idDisplay.innerHTML = `<span>Request ID: <em>${request.id}</em></span>`;
    }

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

    // ① 「Pre-request Script」エディタに既存スクリプトをセット
    const preReqTextarea = document.getElementById('preRequestScript');
    preReqTextarea.value = request.preRequestScript || '';

    // ② 入力が変わったら state.currentRequest.preRequestScript を更新してストレージに保存
    preReqTextarea.addEventListener('blur', async () => {
        const newScript = preReqTextarea.value;
        // state.currentRequest に上書き
        state.currentRequest.preRequestScript = newScript;

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
    //    例： <input type="radio" name="bodyType" value="none"> などがある前提
    const bodyType = request.bodyType || 'none';
    document.querySelectorAll('input[name="bodyType"]').forEach(radio => {
        radio.checked = radio.value === bodyType;
    });

    // ④ Body 本文エリアを切り替えて表示する
    switch (bodyType) {
        case 'raw':
            document.getElementById('rawBody').style.display = 'block';
            document.getElementById('jsonBody').parentElement.style.display = 'none';
            document.getElementById('formDataContainer').style.display = 'none';
            break;
        case 'json':
            document.getElementById('rawBody').style.display = 'none';
            document.getElementById('jsonBody').parentElement.style.display = 'block';
            document.getElementById('formDataContainer').style.display = 'none';
            break;
        case 'form-data':
            document.getElementById('rawBody').style.display = 'none';
            document.getElementById('jsonBody').parentElement.style.display = 'none';
            document.getElementById('formDataContainer').style.display = 'block';
            break;
        case 'urlencoded':
            document.getElementById('rawBody').style.display = 'none';
            document.getElementById('jsonBody').parentElement.style.display = 'none';
            document.getElementById('formDataContainer').style.display = 'block';
            break;
        default:
            // none
            document.getElementById('rawBody').style.display = 'none';
            document.getElementById('jsonBody').parentElement.style.display = 'none';
            document.getElementById('formDataContainer').style.display = 'none';
            break;
    }

    // ⑤ Body の中身をセット（たとえば rawBody, jsonBody の textarea に request.body を入れる）
    document.getElementById('rawBody').value = request.body || '';
    document.getElementById('jsonBody').value = request.body || '';
    // ※ form-data / urlencoded 用コンテナは populate するときに独自実装が必要

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
 *  引数 requestObj を使って XHR 送信を行うバージョン
 */
export async function sendRequest(requestObj) {
    try {
        showLoading(true);

        // 必須チェック: URL が空でないか
        if (!requestObj.url || !requestObj.url.trim()) {
            showError('URL is required');
            return;
        }

        // 2. 変数置換後のリクエストを生成
        let processedRequest = processVariables(requestObj);

        // 1. プリリクエストスクリプト実行
        processedRequest = await executePreRequestScript(processedRequest.preRequestScript, processedRequest);

        // リクエスト実行結果を保存
        const requestExecution = {
            timestamp: new Date().toISOString(),
            method: processedRequest.method,
            url: processedRequest.url,
            headers: processedRequest.headers,
            params: processedRequest.params,
            body: processedRequest.body,
            auth: processedRequest.auth,
            folder: processedRequest.folder || '',
            description: processedRequest.description || '',
            bodyType: processedRequest.bodyType || 'none',
            preRequestScript: processedRequest.preRequestScript || ''
        };

        // 3. XHR 用オプションを作成
        const opts = buildFetchOptions(processedRequest);
        if (!opts) {
            return;
        }

        const { method, headers, bodyData } = opts;

        // 4. XMLHttpRequest で送信（タイムアウト付き）
        const url = processedRequest.url;
        const startTime = Date.now();

        const responseData = await new Promise((resolve, reject) => {
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
                    const headerObj = {};
                    headerLines.forEach(line => {
                        const parts = line.split(': ');
                        const headerKey = parts.shift();
                        const headerVal = parts.join(': ');
                        headerObj[headerKey] = headerVal;
                    });

                    // レスポンス本文を取得
                    const text = xhr.responseText || '';

                    // Fetch の Response っぽい要素を持つ「疑似レスポンス」を作成
                    const pseudoResponse = {
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
                    request.lastRequestExecution = requestExecution;

                    // レスポンス実行結果を保存
                    request.lastResponseExecution = {
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
            state.currentRequest.lastRequestExecution = requestExecution;
            state.currentRequest.lastResponseExecution = {
                status: parsed.status,
                duration: parsed.duration,
                size: parsed.size,
                timestamp: new Date().toISOString(),
                headers: parsed.headers,  // パース済みのヘッダーを保存
                body: parsed.body
            };
        }

        return response || "";

    } catch (error) {
        showError('Request failed: ' + error.message);
        console.error('Request error:', error);
    } finally {
        showLoading(false);
    }

    const responseData = {
        status: "",
        statusText: "",
        headers: {},
        duration: "",
        size: 0,
        body: null,
        bodyText: ''
    };
    return responseData;
}

/**
 * buildFetchOptions
 *  引数のリクエスト情報をもとに、XHR 送信用の { method, headers, bodyData } を返す
 *  bodyData は文字列または FormData／URLSearchParams のいずれか、  
 *  GET/HEAD では null になる。
 */
export function buildFetchOptions(request) {
    const method = (request.method || 'GET').toUpperCase();
    const headers = {};   // 新しいオブジェクトを作成して、ここにカスタムヘッダーや認証ヘッダーを入れる
    let bodyData = null;  // XHR に渡すボディ。GET/HEAD の場合は null

    // 1. カスタムヘッダーをコピー
    if (request.headers) {
        Object.assign(headers, request.headers);
    }

    // 2. 認証ヘッダーを追加（関数 addAuthenticationHeaders は既存のものをそのまま）
    addAuthenticationHeaders(headers, request.auth);

    // 3. GET/HEAD 以外の場合のみ body を構築する
    // if (!['GET', 'HEAD'].includes(method)) {
    if (true) {
        // bodyType の選択状況を取得
        const bodyType = request.bodyType;

        switch (bodyType) {
            case 'json': {
                // JSON 検証
                const rawText = request.body?.trim();
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
                bodyData = request.body || '';
                break;
            }

            case 'form-data': {
                // FormData を作成
                const formData = new FormData();
                // collectKeyValues('formDataContainer') は { key: value, … } を返す想定
                const formFields = collectKeyValues('formDataContainer');
                Object.entries(formFields).forEach(([key, value]) => {
                    formData.append(key, value);
                });
                bodyData = formData;
                // FormData を使う場合はブラウザが自動で Content-Type: multipart/form-data; boundary=… をセット
                // したがって明示的に headers['Content-Type'] は削除しておく
                delete headers['Content-Type'];
                break;
            }

            case 'urlencoded': {
                // URLSearchParams を作成
                const params = new URLSearchParams();
                // collectKeyValues('formDataContainer') を使って key/value を取得
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
 *  XHR で返された疑似レスポンスオブジェクト（または Fetch の Response）をパースし、
 *  status, headers, body 等を返す
 */
export async function processResponse(response, duration) {
    const responseData = {
        status: response.status,
        statusText: response.statusText,
        headers: {},   // 実際のすべてのヘッダーを格納する
        duration: duration,
        size: 0,
        body: null,
        bodyText: ''
    };

    // ─────────────────────────────────────────────────────────────
    // ① レスポンスヘッダーの取り込み
    //    - Fetch の場合: response.headers.forEach が使える
    //    - XHR 偽装レスポンスの場合: response.headers は { get: func } のみなので、
    //      そのときは response._headerObj という内部に隠されたオブジェクトから読み出す想定
    if (response.headers) {
        if (typeof response.headers.forEach === 'function') {
            // Fetch の Headers オブジェクト
            response.headers.forEach((value, key) => {
                responseData.headers[key] = value;
            });
        } else if (response._headerObj && typeof response._headerObj === 'object') {
            // XHR 偽装レスポンスで、sendRequest 側で _headerObj を格納しているケース
            Object.entries(response._headerObj).forEach(([key, value]) => {
                responseData.headers[key] = value;
            });
        } else if (response.headers.get) {
            // XHR 偽装レスポンスの get メソッドを使用
            const rawHeaders = response.headers.get('all');
            if (rawHeaders) {
                const headerLines = rawHeaders.trim().split(/[\r\n]+/);
                headerLines.forEach(line => {
                    const parts = line.split(': ');
                    const headerKey = parts.shift();
                    const headerVal = parts.join(': ');
                    responseData.headers[headerKey] = headerVal;
                });
            }
        } else {
            // 万一どちらにも該当しない場合は「response.headers」自体を plain object とみなし、
            // get プロパティはスキップしてコピー
            for (const [key, value] of Object.entries(response.headers)) {
                if (key === 'get' && typeof value === 'function') continue;
                responseData.headers[key] = value;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ② contentType を取得
    const contentType = responseData.headers['content-type'] || '';

    try {
        // ③ レスポンス本文を文字列として取得
        //    Fetch の場合も XHR 偽装レスポンスの場合も、response.text() が使える想定
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
            console.log("取得したAuthorizationヘッダ：varName=", varName);
            console.log("取得したAuthorizationヘッダ：headerValue=", headerValue);
            // 例: 非同期で環境変数に保存する関数を呼び出す（await は不要。非同期処理なのでエラーは catch）
            setVariable('environment', varName, headerValue).catch(console.error);

            // UI上の環境変数タブを再レンダリング
            renderVariables('environment');
            return { passed: true };
        }

        case 'jsonValueEquals': {
            // parts[1]: JSON パス風の文字列 (例: "users.length" や "meta.page")
            // parts[2]: 比較したい「期待値」を文字列で受け取る
            const path = args[0];
            const expectedRaw = args.slice(1).join(' ');
            // もし数値なら数値に変換
            const expected = isNaN(expectedRaw) ? expectedRaw : Number(expectedRaw);

            // responseData.body が文字列の場合はまず JSON としてパース
            let jsonBody;
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
                // すでにオブジェクトならそのまま使用
                jsonBody = responseData.body;
            }

            // パスに従って JSON オブジェクトを辿る
            const actual = path.split('.').reduce((obj, key) => {
                console.log("obj=".obj)
                console.log("key=".key)
                if (obj && key in obj) {
                    return obj[key];
                }
                // "length" を持つ配列なら length を返す
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

            // 値を比較
            if (actual !== expected) {
                return {
                    passed: false,
                    error: `期待値: ${expected} ですが、実際の値: ${actual} です`
                };
            }
            return { passed: true };
        }

        case 'headerExists': {
            // parts[1]: チェックしたいヘッダー名 (大文字小文字区別なし)
            const headerName = args[0].toLowerCase();
            // ヘッダーキーをすべて小文字化して検索
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
            // parts[1]: チェックしたいヘッダー名
            // parts[2]: 期待するヘッダー値
            const headerName = args[0].toLowerCase();
            const expectedValue = args.slice(1).join(' ');
            // 実際のヘッダー値を取得
            let actualValue = undefined;
            for (const [k, v] of Object.entries(responseData.headers)) {
                if (k.toLowerCase() === headerName) {
                    actualValue = v;
                    break;
                }
            }
            if (actualValue === undefined) {
                throw new Error(`ヘッダー "${args[0]}" が存在しません`);
            }
            if (actualValue !== expectedValue) {
                throw new Error(`"${args[1]}" の値が期待値と異なります (期待: ${expectedValue}, 実際: ${actualValue})`);
            }
            return { passed: true };
        }

        default:
            return { passed: false, error: `Unknown test command: ${cmd}` };
    }
}

/**
 * executePreRequestScript
 * プリリクエストスクリプトを実行する
 * @param {string} script - 実行するスクリプト
 * @param {object} requestObj - リクエストオブジェクト
 * @returns {object} 更新されたリクエストオブジェクト
 */
export function executePreRequestScript(script, requestObj) {
    if (!script) return requestObj;

    const lines = script.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('//')) continue;

        // コマンドと引数を分離（最初の空白までをコマンドとして扱う）
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
                    // 最初の空白までをヘッダー名として扱う
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
                        console.warn('addHeaderWithVar requires a header name and variable name');
                        continue;
                    }
                    // 最初の空白までをヘッダー名として扱う
                    const headerVarNameEndIndex = argsString.indexOf(' ');
                    if (headerVarNameEndIndex === -1) {
                        console.warn('addHeaderWithVar requires both header name and variable name');
                        continue;
                    }
                    const headerVarName = argsString.substring(0, headerVarNameEndIndex);
                    const headerVarValue = argsString.substring(headerVarNameEndIndex + 1).trim();
                    const headerVarResult = getVariable(headerVarValue);
                    if (headerVarResult === undefined) {
                        throw new Error(`変数「${headerVarValue}」が変数ではありません`);
                    }
                    requestObj.headers[headerVarName] = headerVarResult;
                    break;

                case 'setBodyWithVar':
                    if (!argsString) {
                        console.warn('setBodyWithVar requires a variable name');
                        continue;
                    }
                    console.log("argsString", argsString);
                    const bodyValue = getVariable(argsString);
                    if (bodyValue === undefined) {
                        throw new Error(`変数「${argsString}」が変数ではありません`);
                    }
                    requestObj.body = bodyValue;
                    break;

                default:
                    console.warn(`Unknown command: ${command}`);
            }
        } catch (error) {
            console.error('Pre-request script 実行エラー:', error);
            throw error;
        }
    }

    return requestObj;
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
    await saveToHistoryFn(request, responseData);
}

/**
 * saveCurrentRequest
 *  - state.currentRequest の内容を取得し、
 *    ● もし「コレクション配下のリクエスト」としてロードされているなら、そのコレクションデータを更新して保存
 *    ● もし「シナリオ配下のリクエスト」としてロードされているなら、そのシナリオデータを更新して保存
 *    ● それ以外（新規作成）なら、state.currentRequest 自体をそのままローカルに保存（履歴などに利用）
 */
export async function saveCurrentRequest() {
    const req = state.currentRequest;
    if (!req || !req.id) {
        showError('No request to save.');
        return;
    }

    try {
        // ① まず、フォームの各入力欄から値を取得して state.currentRequest を更新する
        //    メソッドと URL
        req.method = document.getElementById('methodSelect').value;
        req.name = document.getElementById('nameInput').value.trim();
        req.url = document.getElementById('urlInput').value.trim();

        //    ヘッダー（key/value をループしてオブジェクト化する例。HTML 構造に合わせて修正を）
        const headerRows = document.querySelectorAll('#headersContainer .key-value-row');
        const newHeaders = {};
        headerRows.forEach(row => {
            const key = row.querySelector('.key-input').value.trim();
            const value = row.querySelector('.value-input').value.trim();
            if (key) newHeaders[key] = value;
        });
        req.headers = newHeaders;

        //    パラメータ
        const paramRows = document.querySelectorAll('#paramsContainer .key-value-row');
        const newParams = {};
        paramRows.forEach(row => {
            const key = row.querySelector('.key-input').value.trim();
            const value = row.querySelector('.value-input').value.trim();
            if (key) newParams[key] = value;
        });
        req.params = newParams;

        //    ボディ
        const selectedBodyType = document.querySelector('input[name="bodyType"]').value;
        if (selectedBodyType === 'raw') {
            req.body = document.getElementById('rawBody').value;
        } else if (selectedBodyType === 'json') {
            req.body = document.getElementById('jsonBody').value;
        } else if (selectedBodyType === 'form-data') {
            // form-data の複数 key-value をオブジェクトに格納
            const formRows = document.querySelectorAll('#formDataContainer .key-value-row');
            const formDataObj = {};
            formRows.forEach(row => {
                const key = row.querySelector('.key-input').value.trim();
                const value = row.querySelector('.value-input').value.trim();
                if (key) formDataObj[key] = value;
            });
            req.body = formDataObj;
        } else if (selectedBodyType === 'urlencoded') {
            const urlRows = document.querySelectorAll('#urlEncodedContainer .key-value-row');
            const urlObj = {};
            urlRows.forEach(row => {
                const key = row.querySelector('.key-input').value.trim();
                const value = row.querySelector('.value-input').value.trim();
                if (key) urlObj[key] = value;
            });
            req.body = urlObj;
        } else {
            // none の場合は body を null にしておく
            req.body = null;
        }

        //    認証設定
        const authType = document.getElementById('authType').value;
        req.auth = { type: authType };
        if (authType === 'basic') {
            req.auth.username = document.getElementById('authUsername').value;
            req.auth.password = document.getElementById('authPassword').value;
        } else if (authType === 'bearer') {
            req.auth.token = document.getElementById('authToken').value;
        } else if (authType === 'apikey') {
            req.auth.key = document.getElementById('authKey').value;
            req.auth.value = document.getElementById('authValue').value;
            req.auth.addTo = document.getElementById('authAddTo').value; // query or header
        }
        // ※ OAuth2 や他の認証タイプがあれば適宜追加

        // ② どこに保存するか判定する
        //    a) state.currentCollection に属するリクエストならコレクションを更新
        if (state.currentCollection) {
            const col = state.collections.find(c => c.id === state.currentCollection);
            if (col && col.requests) {
                const idx = col.requests.findIndex(r => r.id === req.id);
                if (idx !== -1) {
                    col.requests[idx] = JSON.parse(JSON.stringify(req)); // オブジェクトを置き換え
                    await saveCollectionsToStorage();
                    showSuccess('Request saved to collection.');
                    return;
                }
            }
        }

        //    b) state.currentScenario に属するリクエストならシナリオを更新
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

        //    c) それ以外（単体リクエストを新規作成 or 履歴として残す場合）は
        //       state.currentRequest をそのままストレージに保持する
        await saveCurrentRequestToStorage(req);
        showSuccess('Request saved.');

    } catch (error) {
        console.error('Error saving request:', error);
        showError('Failed to save request: ' + error.message);
    }
}