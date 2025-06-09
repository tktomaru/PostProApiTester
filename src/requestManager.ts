// requestManager.ts
// ───────────────────────────────────────────────────────────────────────────────
// リクエスト送受信・プリリクエストスクリプト・テストスクリプト・レスポンス表示をまとめる

import type { RequestData, ResponseData, AuthConfig } from './types';
import { JSONPath } from 'jsonpath-plus';
import {
    state,
    saveCollectionsToStorage,
    saveScenariosToStorage
} from './state';

import {
    showLoading,
    showError,
    showSuccess,
    showNetworkError,
    showVariableError,
    escapeHtml,
    formatBytes,
    autoResizeTextarea
} from './utils';

import {
    switchMainTab, addKeyValueRow, handleBodyTypeChange, updateAuthData, renderAuthDetails, collectKeyValues,
    base64ToFile, serializeFormDataWithFiles, serializeBinaryFile
} from './utils';
import {
    getVariable, replaceVariables, deepReplaceVariables, renderVariables, setVariable
} from './variableManager';
import { saveToHistory as saveToHistoryFn } from './historyManager';

/**
 * getStatusText
 * HTTPステータスコードからstatusTextを取得する
 */
function getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
        200: 'OK',
        201: 'Created',
        204: 'No Content',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable'
    };
    return statusTexts[status] || 'Unknown';
}

/**
 * clearResponseDisplay
 * レスポンス表示エリアをクリアする
 */
function clearResponseDisplay(): void {
    // ステータス情報をクリア
    const statsContainer = document.getElementById('responseStats') as HTMLElement;
    if (statsContainer) {
        statsContainer.innerHTML = '<span class="no-response">No response yet</span>';
    }

    // レスポンスボディをクリア
    const bodyContainer = document.getElementById('responseBody') as HTMLElement;
    if (bodyContainer) {
        bodyContainer.innerHTML = '<div class="no-response">Send a request to see the response</div>';
    }

    // レスポンスヘッダーをクリア
    const headersContainer = document.getElementById('response-headers') as HTMLElement;
    if (headersContainer) {
        headersContainer.innerHTML = '<div class="no-response">No headers</div>';
    }

    // レスポンスクッキーをクリア
    const cookiesContainer = document.getElementById('response-cookies') as HTMLElement;
    if (cookiesContainer) {
        cookiesContainer.innerHTML = '<div class="no-response">No cookies</div>';
    }

    // テスト結果をクリア
    const testsContainer = document.getElementById('response-tests') as HTMLElement;
    if (testsContainer) {
        testsContainer.innerHTML = '<div class="no-response">No tests run</div>';
    }
}

interface FetchOptions {
    method: string;
    headers: Record<string, string>;
    bodyData: string | FormData | URLSearchParams | File | null;
    url: string;
}

interface XhrResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    text(): Promise<string>;
    json(): Promise<any>;
    duration?: number;
}

interface ProcessedResponse extends ResponseData {
    bodyText: string;
}

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
}

/**
 * loadRequestIntoEditor
 *  コレクションや履歴から呼ばれ、右側エディタ（メソッド、URL、ヘッダ、ボディ、認証）に
 *  state.currentRequest を反映する
 */
export function loadRequestIntoEditor(request: RequestData): void {
    console.log('loadRequestIntoEditor called with request:', request);
    console.log('Request params from input:', request.params);

    // state.currentRequest の値をまるごと置き換え
    state.currentRequest = JSON.parse(JSON.stringify(request));

    console.log('After setting state.currentRequest.params:', state.currentRequest?.params);

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
    console.log('Loading request params:', request.params);
    console.log('ParamsContainer element:', paramsContainer);

    if (request.params && Object.keys(request.params).length > 0) {
        // 一度にすべての行を追加
        const paramEntries = Object.entries(request.params);
        paramEntries.forEach(() => {
            addKeyValueRow(paramsContainer, 'param');
        });

        // すべての行を追加した後に値を設定
        setTimeout(() => {
            const rows = paramsContainer.querySelectorAll('.key-value-row');
            console.log(`Found ${rows.length} rows, expected ${paramEntries.length}`);

            paramEntries.forEach(([key, value], index) => {
                if (index < rows.length) {
                    const row = rows[index] as HTMLElement;
                    const keyInput = row.querySelector('.key-input') as HTMLInputElement;
                    const valueInput = row.querySelector('.value-input') as HTMLInputElement;

                    if (keyInput && valueInput) {
                        keyInput.value = key;
                        valueInput.value = value;
                        console.log(`Set param ${index}: ${key} = ${value}`);

                        // 手動でinputイベントを発火してstate.currentRequestを更新
                        keyInput.dispatchEvent(new Event('input', { bubbles: true }));
                        valueInput.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        console.error(`Could not find input elements in row ${index}`);
                    }
                } else {
                    console.error(`Row ${index} not found`);
                }
            });
        }, 50); // 50ms遅延でより確実に

        // state.currentRequestのparamsも更新
        if (state.currentRequest) {
            state.currentRequest.params = { ...request.params };
            console.log('Updated state.currentRequest.params:', state.currentRequest.params);
        }

        const preReqTa = document.getElementById('preRequestScript') as HTMLTextAreaElement;
        preReqTa.value = request.preRequestScript || '';

        // ここで高さを合わせる
        autoResizeTextarea(preReqTa);
    } else {
        console.log('No params to load, adding empty row');
        addKeyValueRow(paramsContainer, 'param');
    }

    // ボディ描画
    if (request.body) {
        if (request.bodyType === 'binary') {
            // 1) すでに File オブジェクトとして入っていればそのまま
            // 2) Base64 文字列なら JSON.parse → base64ToFile → state.currentRequest.body にセット
            const binaryInput = document.getElementById('binaryFileInput') as HTMLInputElement;
            const info = document.getElementById('binaryFileInfo') as HTMLElement;
            if (request.body instanceof File) {
                // file input 側にもセットしておく
                binaryInput.files = new DataTransfer().files; // ここは要調整
                info.textContent = `Saved: ${request.body.name} (${formatBytes(request.body.size)})`;
            } else if (typeof request.body === 'string') {
                try {
                    const meta = JSON.parse(request.body);
                    const f = base64ToFile(meta.base64Data, meta.fileName, meta.fileType);
                    state.currentRequest!.body = f;
                    info.textContent = `Restored: ${meta.fileName} (${formatBytes(meta.fileSize)})`;
                } catch {
                    console.warn('binary の復元に失敗');
                }
            }


        } else
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
                const formDataFieldsContainer = document.getElementById('formDataFieldsContainer') as HTMLElement;
                if (formDataFieldsContainer) {
                    formDataFieldsContainer.innerHTML = '';

                    // FormDataField[]形式の場合（ファイルを含む可能性）
                    if (Array.isArray(request.body)) {
                        console.log('🔍 [loadRequestIntoEditor] FormDataField[]形式で復元:', request.body);
                        (request.body as any[]).forEach((field: any) => {
                            addKeyValueRow(formDataFieldsContainer, 'body');
                            const rows = formDataFieldsContainer.querySelectorAll('.key-value-row');
                            const lastRow = rows[rows.length - 1] as HTMLElement;
                            const keyInput = lastRow.querySelector('.key-input') as HTMLInputElement;
                            const valueTypeSelect = lastRow.querySelector('.value-type-select') as HTMLSelectElement;
                            const valueInput = lastRow.querySelector('.value-input') as HTMLInputElement;
                            const fileInput = lastRow.querySelector('.file-input') as HTMLInputElement;

                            keyInput.value = field.key;

                            if (field.type === 'file') {
                                valueTypeSelect.value = 'file';
                                valueInput.style.display = 'none';
                                fileInput.style.display = 'block';

                                // ファイル情報を表示し、データも保存
                                if (field.fileName) {
                                    const fileInfo = document.createElement('span');
                                    fileInfo.textContent = `Saved: ${field.fileName}`;
                                    fileInfo.style.color = '#666';
                                    fileInfo.style.fontSize = '12px';
                                    fileInfo.style.marginLeft = '8px';
                                    fileInfo.dataset.fileInfo = JSON.stringify({
                                        fileName: field.fileName,
                                        fileType: field.fileType,
                                        fileSize: field.fileSize,
                                        fileContent: field.fileContent
                                    });
                                    fileInput.parentNode?.appendChild(fileInfo);
                                }
                            } else {
                                valueTypeSelect.value = 'text';
                                valueInput.style.display = 'block';
                                fileInput.style.display = 'none';
                                valueInput.value = field.value || '';
                            }
                        });
                    } else {
                        // 従来のRecord<string, string>形式
                        console.log('🔍 [loadRequestIntoEditor] Record形式で復元:', request.body);
                        Object.entries(request.body as Record<string, string>).forEach(([key, value]) => {
                            addKeyValueRow(formDataFieldsContainer, 'body');
                            const rows = formDataFieldsContainer.querySelectorAll('.key-value-row');
                            const lastRow = rows[rows.length - 1] as HTMLElement;
                            const keyInput = lastRow.querySelector('.key-input') as HTMLInputElement;
                            const valueInput = lastRow.querySelector('.value-input') as HTMLInputElement;
                            keyInput.value = key;
                            valueInput.value = value;
                        });
                    }
                }
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

    // ③ Body Type の設定（既存のbody描画の代わりに、より適切な方法で設定）
    const bodyType = request.bodyType || 'none';
    const bodyTypeRadio = document.querySelector(`input[name="bodyType"][value="${bodyType}"]`) as HTMLInputElement;
    if (bodyTypeRadio) {
        bodyTypeRadio.checked = true;
        // Body Type に応じて表示を切り替え
        handleBodyTypeChange({ target: { value: bodyType } } as any);
    } else {
        // デフォルトで'none'を選択
        const noneRadio = document.querySelector('input[name="bodyType"][value="none"]') as HTMLInputElement;
        if (noneRadio) {
            noneRadio.checked = true;
            handleBodyTypeChange({ target: { value: 'none' } } as any);
        }
    }

    // ⑤ Body の中身をセット
    const rawBodyTextarea = document.getElementById('rawBody') as HTMLTextAreaElement;
    const jsonBodyTextarea = document.getElementById('jsonBody') as HTMLTextAreaElement;
    if (rawBodyTextarea) rawBodyTextarea.value = (request.body as string) || '';
    if (jsonBodyTextarea) jsonBodyTextarea.value = (request.body as string) || '';

    // Binary ファイルの復元
    if (bodyType === 'binary') {
        const binaryFileInput = document.getElementById('binaryFileInput') as HTMLInputElement;
        const binaryFileInfo = document.getElementById('binaryFileInfo') as HTMLElement;

        if (request.body instanceof File) {
            // Fileオブジェクトの場合
            if (binaryFileInfo) {
                binaryFileInfo.innerHTML = `
                    <div class="saved-binary-file">
                        <span class="file-name">Saved: ${request.body.name}</span>
                        <span class="file-size">(${formatBytes(request.body.size)})</span>
                        <span class="file-type">${request.body.type || 'Unknown type'}</span>
                    </div>
                `;

                // ファイル情報をdata属性に保存（必要に応じて）
                if (binaryFileInput) {
                    binaryFileInput.dataset.savedFile = JSON.stringify({
                        name: request.body.name,
                        size: request.body.size,
                        type: request.body.type
                    });
                }
            }

            console.log('🔍 [loadRequestIntoEditor] Binary file restored:', {
                name: request.body.name,
                size: request.body.size,
                type: request.body.type
            });
        } else if (typeof request.body === 'string') {
            // Base64文字列形式で保存されたファイルの復元
            try {
                const fileData = JSON.parse(request.body);
                if (fileData.type === 'binaryFile' && fileData.base64Data) {
                    // Base64からFileオブジェクトを復元
                    const restoredFile = base64ToFile(fileData.base64Data, fileData.fileName, fileData.fileType);
                    if (binaryFileInput && binaryFileInfo) {
                        binaryFileInfo.innerHTML = `
                            <div class="saved-binary-file">
                                <span class="file-name">Restored: ${fileData.fileName}</span>
                                <span class="file-size">(${formatBytes(fileData.fileSize || 0)})</span>
                                <span class="file-type">${fileData.fileType || 'Unknown type'}</span>
                            </div>
                        `;

                        // 復元したファイルをcurrentRequestに設定
                        if (state.currentRequest) {
                            state.currentRequest.body = restoredFile;
                        }
                    }

                    console.log('🔍 [loadRequestIntoEditor] Binary file restored from Base64:', {
                        name: fileData.fileName,
                        size: fileData.fileSize,
                        type: fileData.fileType
                    });
                }
            } catch (error) {
                console.error('🔍 [loadRequestIntoEditor] Failed to restore binary file:', error);
            }
        }
    }

    // ⑥ Pre-requestスクリプトを設定
    const preRequestScriptTextarea = document.getElementById('preRequestScript') as HTMLTextAreaElement;
    if (preRequestScriptTextarea) {
        preRequestScriptTextarea.value = request.preRequestScript || '';
    }

    // ⑦ テストスクリプトを設定
    const testScriptTextarea = document.getElementById('testScript') as HTMLTextAreaElement;
    if (testScriptTextarea) {
        testScriptTextarea.value = request.testScript || '';
    }

    // ⑧ 最新のリクエスト・レスポンス履歴を表示または表示をクリア
    if (request.lastRequestExecution || request.lastResponseExecution) {
        // 最新のレスポンス情報がある場合、レスポンスタブに反映
        if (request.lastResponseExecution) {
            // ResponseExecutionからProcessedResponseに変換
            const bodyText = typeof request.lastResponseExecution.body === 'string'
                ? request.lastResponseExecution.body
                : JSON.stringify(request.lastResponseExecution.body, null, 2);

            const responseData: ProcessedResponse = {
                status: request.lastResponseExecution.status,
                statusText: getStatusText(request.lastResponseExecution.status),
                headers: request.lastResponseExecution.headers || {},
                duration: request.lastResponseExecution.duration,
                size: request.lastResponseExecution.size,
                body: request.lastResponseExecution.body,
                bodyText: bodyText
            };
            displayResponse(responseData);

            // 保存されたテスト結果を表示
            if (request.lastResponseExecution.testResults) {
                displayTestResults(request.lastResponseExecution.testResults);
            }
        }
    } else {
        // レスポンス履歴がない場合は表示をクリア
        clearResponseDisplay();
    }

    // タブをリクエストタブに切り替え
    switchMainTab('request');
}

/**
 * executeTestScript
 *  Tests タブに書かれたスクリプトを実行し、結果を表示
 */
export async function executeTestScript(responseData: ProcessedResponse, testScript?: string): Promise<TestResult[]> {
    // テスト結果表示エリアをクリア
    const testsContainer = document.getElementById('response-tests') as HTMLElement;
    if (testsContainer) {
        testsContainer.innerHTML = '<div class="no-response">Tests are running...</div>';
    }

    // テストスクリプトが引数で渡された場合はそれを使用、そうでなければエディタから取得
    let raw: string;
    if (testScript !== undefined) {
        raw = testScript;
    } else {
        const testScriptElement = document.getElementById('testScript') as HTMLTextAreaElement;
        raw = testScriptElement?.value || '';
    }

    console.log('実行するテストスクリプト:', raw);
    if (!raw?.trim()) {
        if (testsContainer) {
            testsContainer.innerHTML = '<div class="no-response">No tests to execute</div>';
        }
        return [];
    }

    // 改行で分割し、空行や先頭が // のコメント行を除外
    const lines = raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('//'));

    console.log('実行するテストコマンド一覧:', lines);
    console.log('レスポンスデータ:', responseData);

    const results: TestResult[] = [];
    try {
        for (const line of lines) {
            console.log('実行中のテストコマンド:', line);
            // runTestCommand は、単一行のテストコマンドを評価し { passed, error } を返す想定
            const result = runTestCommand(line, responseData);
            console.log('テストコマンド結果:', result);
            results.push({ name: line, passed: result.passed, error: result.error });
        }
        displayTestResults(results);
        return results;
    } catch (error: any) {
        console.error('Test script 実行エラー:', error);
        const errorResult = {
            name: 'Script Execution Error',
            passed: false,
            error: error.message
        };
        results.push(errorResult);
        displayTestResults(results);
        return results;
    }
}

/**
 * リクエスト実行結果を Collections／Scenarios／currentRequest に注入し、ストレージ保存まで行う
 */
export async function persistExecutionResults(
    requestId: string,
    requestExecution: any,                   // Timestamp, method, url, headers, params, body, auth...
    parsedResponse: ProcessedResponse,       // status, duration, size, headers, body, bodyText...
    testResults: TestResult[]
): Promise<void> {
    // 1. Collection 内の該当リクエスト
    if (state.currentCollection) {
        const col = state.collections.find(c => c.id === state.currentCollection);
        if (col) {
            const req = col.requests.find(r => r.id === requestId) as any;
            if (req) {
                req.lastRequestExecution = requestExecution;
                req.lastResponseExecution = {
                    status: parsedResponse.status,
                    duration: parsedResponse.duration,
                    size: parsedResponse.size,
                    timestamp: new Date().toISOString(),
                    headers: parsedResponse.headers,
                    body: parsedResponse.body,
                    testResults
                };
            }
        }
        await saveCollectionsToStorage();
    }

    // 2. 全 Scenarios 内の該当リクエスト
    state.scenarios.forEach(scenario => {
        const req = (scenario.requests || []).find(r => r.id === requestId) as any;
        if (req) {
            console.log(`🔍 [saveExecutionResult] Saving execution result for scenario "${scenario.name}" request "${req.name}"`);
            req.lastRequestExecution = requestExecution;
            req.lastResponseExecution = {
                status: parsedResponse.status,
                duration: parsedResponse.duration,
                size: parsedResponse.size,
                timestamp: new Date().toISOString(),
                headers: parsedResponse.headers,
                body: parsedResponse.body,
                testResults
            };
            console.log(`🔍 [saveExecutionResult] Saved response data:`, {
                status: parsedResponse.status,
                headers: Object.keys(parsedResponse.headers || {}),
                bodyType: typeof parsedResponse.body
            });
        }
    });
    await saveScenariosToStorage();

    // 3. currentRequest が同一なら更新
    if (state.currentRequest?.id === requestId) {
        const cr = state.currentRequest as any;
        cr.lastRequestExecution = requestExecution;
        cr.lastResponseExecution = {
            status: parsedResponse.status,
            duration: parsedResponse.duration,
            size: parsedResponse.size,
            timestamp: new Date().toISOString(),
            headers: parsedResponse.headers,
            body: parsedResponse.body,
            testResults
        };
    }
}


/**
 * sendRequest
 *  RequestData に従ってリクエストを送信します。
 *  Cookie ヘッダーの有無にかかわらず常に chrome.cookies API 経由で送信し、
 *  レスポンスを処理 → 表示 → テスト実行 → 履歴保存 まで行います。
 *
 * @param requestObj 送信設定を含む RequestData
 * @param forScenario シナリオ実行モードの場合は true（UI 更新をスキップし、結果オブジェクトを返します）
 */
export async function sendRequest(
    requestObj: RequestData,
    forScenario: boolean = false
): Promise<
    XhrResponse |
    string |
    { response: ProcessedResponse; testResults: TestResult[] }
> {
    showLoading(true);
    let req: RequestData = requestObj; // Declare outside try block for access in catch
    
    try {
        // 1. URL が空でないかチェック
        if (!requestObj.url?.trim()) {
            showError('URL is required', 'Please enter a valid URL in the format: http://example.com or https://example.com');
            return '';
        }

        // 2. 変数置換 & プリリクエストスクリプトの実行
        try {
            req = processVariables(requestObj);
        } catch (error: any) {
            console.error('Variable processing error:', error);
            showVariableError('Request processing', error);
            return '';
        }

        try {
            req = executePreRequestScript(req.preRequestScript || '', req);
        } catch (error: any) {
            console.error('Pre-request script error:', error);
            showError('Pre-request script execution failed', `Error: ${error.message}\n\nPlease check your pre-request script syntax and variable references.`);
            return '';
        }
        // リクエスト実行結果を保存
        const requestExecution = {
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url,
            headers: req.headers,
            params: req.params,
            body: req.body,
            auth: req.auth,
            folder: (req as any).folder || '',
            description: (req as any).description || '',
            bodyType: req.bodyType || 'none',
            preRequestScript: req.preRequestScript || ''
        };

        // 3. 送信オプションを作成
        const opts = buildFetchOptions(req);
        if (!opts) return '';

        const { method, headers, bodyData, url } = opts;

        // ───────────────────────────
        // ● 常に chrome.cookies API 経由で送信
        console.log('🍪 Always using sendRequestWithCookieSupport');
        const xhrResp = await sendRequestWithCookieSupport({
            method,
            url,
            headers,
            body: bodyData
        });
        // ───────────────────────────

        // 4. レスポンスの処理と表示
        const parsed = await processResponse(xhrResp, xhrResp.duration || 0);
        if (!forScenario) {
            displayResponse(parsed);
        }

        // 5. テストスクリプトを実行
        const testResults = await executeTestScript(parsed, requestObj.testScript);

        // 6. 履歴に保存
        await saveToHistory(req, parsed, testResults);

        // 8. コレクションのリクエストに最新の実行結果を保存
        // 8. 実行結果を一括して永続化
        await persistExecutionResults(
            requestObj.id,
            requestExecution,
            parsed,
            testResults
        );

        // 8. 返却
        if (forScenario) {
            return { response: parsed, testResults };
        } else {
            return xhrResp;
        }

    } catch (error: any) {
        console.error('Request error:', error);
        
        // Provide more specific error messages based on error type
        if (error.message.includes('Network') || error.message.includes('fetch') || 
            error.message.includes('CORS') || error.message.includes('timeout')) {
            showNetworkError(req.url || requestObj.url, error);
        } else if (error.message.includes('Variable') || error.message.includes('変数')) {
            showVariableError('Request execution', error);
        } else if (error.message.includes('Invalid URL')) {
            showError('Invalid URL format', `The URL "${req.url || requestObj.url}" is not valid. Please check the URL format and ensure all variables are properly resolved.`);
        } else if (error.message.includes('JSON') || error.message.includes('parse')) {
            showError('Response parsing failed', `Unable to parse the response as JSON. The server may have returned invalid JSON or a different content type.\n\nError: ${error.message}`);
        } else {
            showError('Request failed', `An unexpected error occurred while processing your request.\n\nError: ${error.message}\n\nPlease check your request configuration and try again.`);
        }
    } finally {
        showLoading(false);
    }

    return '';
}

/**
 * fileToBase64
 * ファイルをBase64文字列に変換する
 */
function fileToBase64(file: any): Promise<string> {
    return new Promise((resolve, reject) => {
        console.log('🔍 [fileToBase64] 開始. file詳細:', {
            file: file,
            name: file?.name,
            size: file?.size,
            type: file?.type,
            instanceof_File: file instanceof File,
            instanceof_Blob: file instanceof Blob,
            constructor: file?.constructor?.name,
            typeof: typeof file
        });

        // ファイルオブジェクトの詳細チェック
        if (!file) {
            console.error('🔍 [fileToBase64] ファイルオブジェクトがnullまたはundefined');
            reject(new Error('File object is null or undefined'));
            return;
        }

        if (!(file instanceof File) && !(file instanceof Blob)) {
            console.error('🔍 [fileToBase64] ファイルオブジェクトがFile/Blobインスタンスではありません');
            reject(new Error(`File object is not a File or Blob instance. Type: ${typeof file}, Constructor: ${(file as any)?.constructor?.name}`));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            console.log('🔍 [fileToBase64] FileReader.onload成功');
            const result = reader.result as string;
            // data:プレフィックスを除去してBase64部分のみ返す
            const base64 = result.split(',')[1];
            console.log('🔍 [fileToBase64] Base64変換完了. 長さ:', base64?.length || 0);
            resolve(base64);
        };
        reader.onerror = (error) => {
            console.error('🔍 [fileToBase64] FileReader.onerror:', error);
            reject(error);
        };

        try {
            console.log('🔍 [fileToBase64] FileReader.readAsDataURL呼び出し開始');
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('🔍 [fileToBase64] FileReader.readAsDataURL呼び出しでエラー:', error);
            reject(error);
        }
    });
}

/**
 * buildFetchOptions
 *  引数のリクエスト情報をもとに、XHR 送信用の { method, headers, bodyData } を返す
 */
export function buildFetchOptions(request: RequestData): FetchOptions | null {
    const method = (request.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    let bodyData: string | FormData | URLSearchParams | File | null = null;

    // 1. カスタムヘッダーをコピー
    if (request.headers) {
        Object.assign(headers, request.headers);
    }

    // 2. 認証ヘッダーを追加
    addAuthenticationHeaders(headers, request.auth);

    // 3. URLにパラメータを追加（processVariablesで既に追加済みなので、ここでは何もしない）
    let url = request.url;

    // 4. ボディデータの処理
    if (request.body && method !== 'GET' && method !== 'HEAD') {
        const bodyType = request.bodyType || 'none';
        switch (bodyType) {
            case 'raw': {
                bodyData = request.body.toString();
                break;
            }

            case 'json': {
                bodyData = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
                headers['Content-Type'] = 'application/json';
                break;
            }

            case 'form-data': {
                console.log('🔍 [buildFetchOptions] form-data処理. request.body:', request.body);
                // ファイルを含む場合は元のbodyをそのまま使用（FormDataField[]配列）
                if (Array.isArray(request.body)) {
                    console.log('🔍 [buildFetchOptions] FormDataField[]配列をそのまま返す');
                    bodyData = request.body as any;
                } else {
                    console.log('🔍 [buildFetchOptions] 古いロジック（collectKeyValues）を使用');
                    const formData = new FormData();
                    const formFields = collectKeyValues('formDataFieldsContainer');
                    Object.entries(formFields).forEach(([key, value]) => {
                        formData.append(key, value);
                    });
                    bodyData = formData;
                }
                break;
            }

            case 'urlencoded': {
                // URLSearchParams を作成
                const params = new URLSearchParams();
                const urlEncodedFields = collectKeyValues('formDataFieldsContainer');
                Object.entries(urlEncodedFields).forEach(([key, value]) => {
                    params.append(key, value);
                });
                bodyData = params.toString();
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
                break;
            }

            case 'binary': {
                // Binary ファイルをそのまま送信
                if (request.body instanceof File) {
                    console.log('🔍 [buildFetchOptions] Binary file処理:', {
                        name: request.body.name,
                        size: request.body.size,
                        type: request.body.type
                    });
                    bodyData = request.body;
                    // ファイルのContent-Typeを設定（指定がない場合）
                    if (!headers['Content-Type'] && request.body.type) {
                        headers['Content-Type'] = request.body.type;
                    }
                } else {
                    console.log('🔍 [buildFetchOptions] Binary body is not a File object');
                }
                break;
            }

            default:
                // none の場合は bodyData を null のままにする
                break;
        }
    }

    return { method, headers, bodyData, url };
}

/**
 * sendRequestWithCookieSupport
 *  chrome.cookies APIを使用してCookieヘッダー付きリクエストを送信
 */
async function sendRequestWithCookieSupport(options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | FormData | URLSearchParams | File | null;
}): Promise<XhrResponse> {
    console.log('🍪 sendRequestWithCookieSupport called with:', options);

    return new Promise(async (resolve, reject) => {
        const startTime = Date.now();

        // bodyの処理
        let processedBody: string | null = null;
        let hasFiles = false;

        try {
            console.log('🔍 [requestManager.ts] bodyの処理開始. options.body:', options.body);
            console.log('🔍 [requestManager.ts] options.body type:', typeof options.body);
            console.log('🔍 [requestManager.ts] options.body instanceof FormData:', options.body instanceof FormData);
            console.log('🔍 [requestManager.ts] Array.isArray(options.body):', Array.isArray(options.body));

            if (options.body instanceof FormData) {
                console.log('🔍 [requestManager.ts] FormDataオブジェクトとして処理');
                // FormDataオブジェクトをkey-valueオブジェクトに変換
                const formDataObj: Record<string, string> = {};
                for (const [key, value] of options.body.entries()) {
                    formDataObj[key] = value.toString();
                }
                processedBody = JSON.stringify(formDataObj);
                console.log('🔍 [requestManager.ts] FormData処理完了:', formDataObj);
            } else if (Array.isArray(options.body)) {
                console.log('🔍 [requestManager.ts] FormDataField[]配列として処理');
                // FormDataField[]配列の場合（ファイルを含む可能性あり）
                const formDataFields = options.body as any[];
                console.log('🔍 [requestManager.ts] formDataFields:', formDataFields);
                const processedFields: any[] = [];

                for (const field of formDataFields) {
                    console.log('🔍 [requestManager.ts] 処理中のfield:', field);
                    console.log('🔍 [requestManager.ts] field.file詳細:', {
                        file: field.file,
                        fileType: typeof field.file,
                        isBlob: field.file instanceof Blob,
                        isFile: field.file instanceof File,
                        constructor: field.file?.constructor?.name
                    });

                    if (field.type === 'file' && field.file) {
                        // ファイルオブジェクトの型チェック
                        if (!(field.file instanceof File) && !(field.file instanceof Blob)) {
                            console.error('🔍 [requestManager.ts] field.fileがFile/Blobではありません:', field.file);
                            // エラーをスキップしてテキストフィールドとして処理
                            processedFields.push({
                                key: field.key,
                                type: 'text',
                                value: `[File Error: ${field.file}]`
                            });
                            continue;
                        }

                        console.log('🔍 [requestManager.ts] ファイルフィールドを処理:', {
                            key: field.key,
                            filename: field.file.name,
                            size: field.file.size,
                            type: field.file.type
                        });
                        hasFiles = true;
                        // ファイルをBase64に変換
                        console.log('🔍 [requestManager.ts] Base64変換開始...');
                        console.log('🔍 [requestManager.ts] fileToBase64に渡すfile:', field.file);
                        console.log('🔍 [requestManager.ts] fileToBase64に渡すfile詳細2:', {
                            file: field.file,
                            typeof: typeof field.file,
                            instanceof_File: field.file instanceof File,
                            instanceof_Blob: field.file instanceof Blob,
                            constructor_name: field.file?.constructor?.name,
                            Object_prototype_toString: Object.prototype.toString.call(field.file)
                        });
                        const fileData = await fileToBase64(field.file);
                        console.log('🔍 [requestManager.ts] Base64変換完了. データ長:', fileData.length);
                        processedFields.push({
                            key: field.key,
                            type: 'file',
                            filename: field.file.name,
                            contentType: field.file.type,
                            data: fileData
                        });
                    } else {
                        console.log('🔍 [requestManager.ts] テキストフィールドを処理:', {
                            key: field.key,
                            value: field.value
                        });
                        processedFields.push({
                            key: field.key,
                            type: 'text',
                            value: field.value || ''
                        });
                    }
                }
                processedBody = JSON.stringify(processedFields);
                console.log('🔍 [requestManager.ts] 配列処理完了. hasFiles:', hasFiles);
                console.log('🔍 [requestManager.ts] processedFields:', processedFields);
            } else if (options.body instanceof File) {
                console.log('🔍 [requestManager.ts] Binary File として処理');
                // Binary ファイルを直接ArrayBufferとして送信
                const arrayBuffer = await options.body.arrayBuffer();
                processedBody = JSON.stringify({
                    type: 'binary',
                    filename: options.body.name,
                    contentType: options.body.type,
                    arrayBuffer: Array.from(new Uint8Array(arrayBuffer))
                });
                hasFiles = true;
                console.log('🔍 [requestManager.ts] Binary File 処理完了:', {
                    filename: options.body.name,
                    size: options.body.size,
                    contentType: options.body.type,
                    arrayBufferSize: arrayBuffer.byteLength
                });
            } else if (typeof options.body === 'string') {
                console.log('🔍 [requestManager.ts] 文字列として処理');
                processedBody = options.body;
            } else if (options.body?.toString && options.body.toString() !== '[object Object]') {
                console.log('🔍 [requestManager.ts] toString()で処理');
                processedBody = options.body.toString();
            }

            const messageData = {
                action: 'sendHttpRequest',
                options: {
                    method: options.method,
                    url: options.url,
                    headers: options.headers,
                    body: processedBody,
                    isFormData: options.body instanceof FormData || Array.isArray(options.body) || options.body instanceof File,
                    hasFiles: hasFiles
                }
            };

            console.log('🔍 [requestManager.ts] messageData作成完了:', {
                action: messageData.action,
                method: messageData.options.method,
                url: messageData.options.url,
                headers: messageData.options.headers,
                bodyType: typeof messageData.options.body,
                bodyLength: messageData.options.body?.length || 0,
                isFormData: messageData.options.isFormData,
                hasFiles: messageData.options.hasFiles
            });
            console.log('🔍 [requestManager.ts] Sending message to background script for Cookie handling');

            // Background Scriptにクッキー付きHTTPリクエストを要求
            chrome.runtime.sendMessage(messageData, (response) => {
                console.log('Received response from background script:', response);

                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError.message);
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response.success) {
                    const duration = Date.now() - startTime;
                    const xhrResponse: XhrResponse = {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                        text: async () => response.body,
                        json: async () => {
                            try {
                                return JSON.parse(response.body);
                            } catch {
                                return {};
                            }
                        },
                        duration: duration
                    };
                    console.log('Constructed Cookie XhrResponse:', xhrResponse);
                    resolve(xhrResponse);
                } else {
                    console.error('Background script returned error:', response.error);
                    reject(new Error(response.error || 'Cookie request failed'));
                }
            });
        } catch (error: any) {
            console.error('Error processing request body:', error);
            reject(new Error(`Request processing failed: ${error.message}`));
        }
    });
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
 * formatXml
 *  XML文字列をインデント付きで整形する
 */
function formatXml(xml: string): string {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, 'application/xml');

        if (xmlDoc.querySelector('parsererror')) {
            return xml;
        }

        const serializer = new XMLSerializer();
        const formatted = serializer.serializeToString(xmlDoc);

        // 基本的なインデント処理
        return formatted.replace(/></g, '>\n<')
            .replace(/^\s*\n/gm, '')
            .split('\n')
            .map((line) => {
                const depth = (line.match(/</g) || []).length - (line.match(/\//g) || []).length;
                return '  '.repeat(Math.max(0, depth)) + line.trim();
            })
            .join('\n');
    } catch (e) {
        return xml;
    }
}

/**
 * formatHtml
 *  HTML文字列をインデント付きで整形する
 */
function formatHtml(html: string): string {
    try {
        return html.replace(/></g, '>\n<')
            .replace(/^\s*\n/gm, '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map((line, index, arr) => {
                const prevLine = arr[index - 1];
                const depth = prevLine ? (prevLine.match(/</g) || []).length - (prevLine.match(/\//g) || []).length : 0;
                return '  '.repeat(Math.max(0, depth)) + line;
            })
            .join('\n');
    } catch (e) {
        return html;
    }
}

/**
 * formatCss
 *  CSS文字列をインデント付きで整形する
 */
function formatCss(css: string): string {
    try {
        return css.replace(/\{/g, ' {\n')
            .replace(/\}/g, '\n}\n')
            .replace(/;/g, ';\n')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                if (line.includes('{') && !line.includes('}')) {
                    return line;
                } else if (line === '}') {
                    return line;
                } else {
                    return '  ' + line;
                }
            })
            .join('\n');
    } catch (e) {
        return css;
    }
}

/**
 * formatJavaScript
 *  JavaScript文字列をインデント付きで整形する（基本的な処理）
 */
function formatJavaScript(js: string): string {
    try {
        return js.replace(/\{/g, ' {\n')
            .replace(/\}/g, '\n}\n')
            .replace(/;/g, ';\n')
            .replace(/,/g, ',\n')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map((line, index, arr) => {
                const openBraces = (line.match(/\{/g) || []).length;
                const closeBraces = (line.match(/\}/g) || []).length;
                const prevLines = arr.slice(0, index);
                const depth = prevLines.reduce((acc, l) => {
                    return acc + (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
                }, 0);

                if (closeBraces > 0 && openBraces === 0) {
                    return '  '.repeat(Math.max(0, depth - closeBraces)) + line;
                } else {
                    return '  '.repeat(Math.max(0, depth)) + line;
                }
            })
            .join('\n');
    } catch (e) {
        return js;
    }
}

/**
 * detectContentType
 *  Content-Typeヘッダーとレスポンス内容から実際のコンテンツタイプを推測
 */
function detectContentType(contentType: string, bodyText: string): string {
    const lowerContentType = contentType.toLowerCase();

    if (lowerContentType.includes('json')) {
        return 'json';
    }
    if (lowerContentType.includes('xml')) {
        return 'xml';
    }
    if (lowerContentType.includes('html')) {
        return 'html';
    }
    if (lowerContentType.includes('css')) {
        return 'css';
    }
    if (lowerContentType.includes('javascript') || lowerContentType.includes('text/js')) {
        return 'javascript';
    }

    // Content-Typeがtext/plainやその他の場合、内容から推測
    const trimmedBody = bodyText.trim();
    if (trimmedBody.startsWith('{') || trimmedBody.startsWith('[')) {
        try {
            JSON.parse(trimmedBody);
            return 'json';
        } catch (e) {
            // JSONパースに失敗した場合は継続
        }
    }
    if (trimmedBody.startsWith('<') && (trimmedBody.includes('<?xml') || trimmedBody.includes('<'))) {
        if (trimmedBody.includes('<!DOCTYPE html') || trimmedBody.includes('<html')) {
            return 'html';
        } else {
            return 'xml';
        }
    }

    return 'text';
}

/**
 * displayResponseBody
 *  Bodyタブ内に Pretty / Raw / Preview のいずれかでコンテンツを表示
 */
export function displayResponseBody(responseData: ProcessedResponse, format: string): void {
    const bodyContainer = document.getElementById('responseBody') as HTMLElement;
    let content = '';
    const contentType = responseData.headers['content-type'] || '';
    const detectedType = detectContentType(contentType, responseData.bodyText);

    switch (format) {
        case 'pretty':
            switch (detectedType) {
                case 'json':
                    try {
                        if (typeof responseData.body === 'object') {
                            content = JSON.stringify(responseData.body, null, 2);
                        } else {
                            const parsed = JSON.parse(responseData.bodyText);
                            content = JSON.stringify(parsed, null, 2);
                        }
                    } catch (e) {
                        content = responseData.bodyText;
                    }
                    break;
                case 'xml':
                    content = formatXml(responseData.bodyText);
                    break;
                case 'html':
                    content = formatHtml(responseData.bodyText);
                    break;
                case 'css':
                    content = formatCss(responseData.bodyText);
                    break;
                case 'javascript':
                    content = formatJavaScript(responseData.bodyText);
                    break;
                default:
                    content = responseData.bodyText;
                    break;
            }
            break;
        case 'raw':
            content = responseData.bodyText;
            break;
        case 'preview':
            if (detectedType === 'html') {
                bodyContainer.innerHTML = `<iframe srcdoc="${escapeHtml(responseData.bodyText)}" style="width:100%;height:300px;border:1px solid #ccc;"></iframe>`;
                return;
            } else if (detectedType === 'json') {
                try {
                    const jsonData = typeof responseData.body === 'object' ? responseData.body : JSON.parse(responseData.bodyText);
                    content = `<pre style="background:#f5f5f5;padding:10px;border-radius:4px;overflow:auto;">${JSON.stringify(jsonData, null, 2)}</pre>`;
                    bodyContainer.innerHTML = content;
                    return;
                } catch (e) {
                    content = responseData.bodyText;
                }
            } else {
                content = responseData.bodyText;
            }
            break;
    }

    // syntax highlighting用のクラスを追加
    bodyContainer.innerHTML = `<pre class="response-content response-${detectedType}">${escapeHtml(content)}</pre>`;
}

/**
 * displayResponseHeaders
 *  Headersタブにレスポンスヘッダをリスト表示
 */
export function displayResponseHeaders(headers: Record<string, string>): void {
    const headersContainer = document.getElementById('response-headers') as HTMLElement;
    let html = '<div class="headers-list">';

    Object.entries(headers).forEach(([key, value]) => {
        html += `<div class="header-item"><span class="header-key">${escapeHtml(key)}</span><span class="header-value">${escapeHtml(value)}</span></div>`;
    });
    html += '</div>';
    headersContainer.innerHTML = html;
}

/**
 * displayResponseCookies
 *  Cookiesタブに Set-Cookie と Cookie ヘッダを
 *  key=value 単位で1行ずつ表示
 */
export function displayResponseCookies(
    headers: Record<string, string | string[]>
): void {
    const cookiesContainer = document.getElementById(
        'response-cookies'
    ) as HTMLElement;

    // set-cookie と cookie の両方を取得
    const setCookieRaw = headers['set-cookie'];
    const cookieRaw = headers['cookie'];

    // 単一文字列／配列いずれにも対応してまとめる
    const cookies: string[] = [];
    if (setCookieRaw) {
        if (Array.isArray(setCookieRaw)) {
            cookies.push(...setCookieRaw);
        } else {
            cookies.push(setCookieRaw);
        }
    }
    if (cookieRaw) {
        if (Array.isArray(cookieRaw)) {
            cookies.push(...cookieRaw);
        } else {
            cookies.push(cookieRaw);
        }
    }

    // 表示
    if (cookies.length > 0) {
        let html = '<div class="cookies-list">';
        cookies.forEach((rawCookie: string) => {
            // セミコロンで分割し、key=value 単位に正規化
            const pairs: string[] = rawCookie
                .split(';')
                .map((part: string) => part.trim())
                .filter((part: string) => part.length > 0);

            pairs.forEach((pair: string) => {
                html += `<div class="cookie-item">${escapeHtml(pair)}</div>`;
            });
        });
        html += '</div>';
        cookiesContainer.innerHTML = html;
    } else {
        cookiesContainer.innerHTML =
            '<p class="empty-message">No cookies in response</p>';
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

        case 'echoRequestHeaderEquals': {
            // reply.tukutano.jpのようなエコーサイト用: リクエストヘッダーがレスポンスに正しく反映されているかチェック
            const headerName = args[0];
            const expectedValue = args.slice(1).join(' ');

            // レスポンスボディからリクエストヘッダー情報を取得
            try {
                let responseBody = responseData.body;

                // レスポンスボディが文字列の場合はJSONパースを試行
                if (typeof responseBody === 'string') {
                    try {
                        responseBody = JSON.parse(responseBody);
                    } catch (e) {
                        return { passed: false, error: 'レスポンスボディのJSONパースに失敗しました' };
                    }
                }

                if (typeof responseBody === 'object' && responseBody.headers) {
                    const echoedHeaders = responseBody.headers;
                    // ヘッダー名を小文字で検索（reply.tukutano.jpは小文字で返す）
                    const headerKeyLower = headerName.toLowerCase();
                    const actualValue = echoedHeaders[headerKeyLower];

                    if (actualValue === undefined) {
                        return { passed: false, error: `エコーされたリクエストヘッダー "${headerName}" が見つかりません` };
                    }
                    if (actualValue !== expectedValue) {
                        return { passed: false, error: `エコーされたヘッダー "${headerName}" の値が期待値と異なります (期待: ${expectedValue}, 実際: ${actualValue})` };
                    }
                    return { passed: true };
                } else {
                    return { passed: false, error: 'レスポンスボディにheaders情報が含まれていません' };
                }
            } catch (error) {
                return { passed: false, error: `レスポンスボディの解析に失敗しました: ${error}` };
            }
        }

        case 'echoRequestHeaderContains': {
            const headerName = args[0];
            const expectedValue = args.slice(1).join(' ');
            try {
                let responseBody = responseData.body;
                if (typeof responseBody === 'string') {
                    responseBody = JSON.parse(responseBody);
                }
                if (typeof responseBody === 'object' && responseBody.headers) {
                    const echoedHeaders = responseBody.headers;
                    const key = headerName.toLowerCase();
                    const actualValue = echoedHeaders[key];
                    if (actualValue === undefined) {
                        return {
                            passed: false,
                            error: `エコーされたリクエストヘッダー "${headerName}" が見つかりません`
                        };
                    }

                    // Cookie ヘッダーは順序を無視して key=value ペアの存在をチェック
                    if (key === 'cookie') {
                        // 実際のヘッダ値をペアに分割
                        const actualPairs = actualValue
                            .split(';')
                            .map((s: string) => s.trim())
                            .filter((s: string) => s.length > 0);
                        // 期待値も同様に分割
                        const expectedPairs = expectedValue
                            .split(';')
                            .map(s => s.trim())
                            .filter(s => s.length > 0);

                        // 期待ペアがすべて actualPairs に含まれているかチェック
                        const missing = expectedPairs.filter(p => !actualPairs.includes(p));
                        if (missing.length === 0) {
                            return { passed: true };
                        } else {
                            return {
                                passed: false,
                                error: `Cookie ヘッダーに以下のペアが含まれていません: ${missing.join(', ')} (実際: ${actualValue})`
                            };
                        }
                    }

                    // それ以外は部分一致チェック
                    if (actualValue.includes(expectedValue)) {
                        return { passed: true };
                    } else {
                        return {
                            passed: false,
                            error: `エコーされたヘッダー "${headerName}" に "${expectedValue}" が含まれていません (実際: ${actualValue})`
                        };
                    }
                } else {
                    return {
                        passed: false,
                        error: 'レスポンスボディに headers 情報が含まれていません'
                    };
                }
            } catch (e) {
                return {
                    passed: false,
                    error: `レスポンスボディの解析に失敗しました: ${e}`
                };
            }
        }

        case 'echoRequestMethodEquals': {
            // reply.tukutano.jpのようなエコーサイト用: リクエストメソッドがレスポンスに正しく反映されているかチェック
            const expectedMethod = args[0];

            try {
                let responseBody = responseData.body;

                // レスポンスボディが文字列の場合はJSONパースを試行
                if (typeof responseBody === 'string') {
                    try {
                        responseBody = JSON.parse(responseBody);
                    } catch (e) {
                        return { passed: false, error: 'レスポンスボディのJSONパースに失敗しました' };
                    }
                }

                if (typeof responseBody === 'object' && responseBody.method) {
                    const actualMethod = responseBody.method;
                    if (actualMethod !== expectedMethod) {
                        return { passed: false, error: `エコーされたメソッド "${actualMethod}" が期待値 "${expectedMethod}" と異なります` };
                    }
                    return { passed: true };
                } else {
                    return { passed: false, error: 'レスポンスボディにmethod情報が含まれていません' };
                }
            } catch (error) {
                return { passed: false, error: `レスポンスボディの解析に失敗しました: ${error}` };
            }
        }

        case 'echoRequestBodyEquals': {
            // reply.tukutano.jpのようなエコーサイト用: リクエストボディがレスポンスに正しく反映されているかチェック
            const expectedBody = args.join(' ');

            try {
                let responseBody = responseData.body;

                // レスポンスボディが文字列の場合はJSONパースを試行
                if (typeof responseBody === 'string') {
                    try {
                        responseBody = JSON.parse(responseBody);
                    } catch (e) {
                        return { passed: false, error: 'レスポンスボディのJSONパースに失敗しました' };
                    }
                }

                if (typeof responseBody === 'object' && responseBody.body !== undefined) {
                    // reply.tukutano.jpはbodyを文字列として返す
                    const actualBody = responseBody.body;

                    if (actualBody !== expectedBody) {
                        return { passed: false, error: `エコーされたボディが期待値と異なります\n期待: ${expectedBody}\n実際: ${actualBody}` };
                    }
                    return { passed: true };
                } else {
                    return { passed: false, error: 'レスポンスボディにbody情報が含まれていません' };
                }
            } catch (error) {
                return { passed: false, error: `レスポンスボディの解析に失敗しました: ${error}` };
            }
        }

        case 'echoRequestUrlContains': {
            // reply.tukutano.jpのようなエコーサイト用: リクエストURLがレスポンスに正しく反映されているかチェック
            const expectedUrlPart = args.join(' ');

            try {
                let responseBody = responseData.body;

                // レスポンスボディが文字列の場合はJSONパースを試行
                if (typeof responseBody === 'string') {
                    try {
                        responseBody = JSON.parse(responseBody);
                    } catch (e) {
                        return { passed: false, error: 'レスポンスボディのJSONパースに失敗しました' };
                    }
                }

                if (typeof responseBody === 'object' && responseBody.url) {
                    const actualUrl = responseBody.url;
                    if (!actualUrl.includes(expectedUrlPart)) {
                        return { passed: false, error: `エコーされたURL "${actualUrl}" に "${expectedUrlPart}" が含まれていません` };
                    }
                    return { passed: true };
                } else {
                    return { passed: false, error: 'レスポンスボディにURL情報が含まれていません' };
                }
            } catch (error) {
                return { passed: false, error: `レスポンスボディの解析に失敗しました: ${error}` };
            }
        }

        case 'bodyJsonPathEquals': {
            // JSONPathを使ってレスポンスボディの特定の値をチェック
            // 使用例: bodyJsonPathEquals $.data.status success
            if (args.length < 2) {
                return { passed: false, error: 'bodyJsonPathEquals requires JSONPath and expected value' };
            }

            const jsonPath = args[0];
            const expectedValue = args.slice(1).join(' ');

            try {
                let jsonBody: any;

                // レスポンスボディをJSONとしてパース
                if (typeof responseData.body === 'string') {
                    try {
                        jsonBody = JSON.parse(responseData.body);
                    } catch (e) {
                        return { passed: false, error: 'レスポンスボディが有効なJSONではありません' };
                    }
                } else if (typeof responseData.bodyText === 'string') {
                    try {
                        jsonBody = JSON.parse(responseData.bodyText);
                    } catch (e) {
                        return { passed: false, error: 'レスポンスボディが有効なJSONではありません' };
                    }
                } else {
                    jsonBody = responseData.body;
                }

                if (!jsonBody) {
                    return { passed: false, error: 'レスポンスボディが空です' };
                }

                // JSONPathで値を取得
                const result = JSONPath({ path: jsonPath, json: jsonBody });

                if (!Array.isArray(result) || result.length === 0) {
                    return { passed: false, error: `JSONPath "${jsonPath}" に一致する値が見つかりません` };
                }

                const actualValue = result[0];

                // 期待値と実際の値を比較（文字列として比較）
                const actualStr = String(actualValue);
                const expectedStr = String(expectedValue);

                if (actualStr !== expectedStr) {
                    return { 
                        passed: false, 
                        error: `JSONPath "${jsonPath}" の値が期待値と異なります\n期待: ${expectedStr}\n実際: ${actualStr}` 
                    };
                }

                return { passed: true };

            } catch (error: any) {
                return { 
                    passed: false, 
                    error: `JSONPath "${jsonPath}" の評価中にエラーが発生しました: ${error.message}` 
                };
            }
        }

        default:
            return { passed: false, error: `Unknown test command: ${cmd}` };
    }
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
                    // ファイルデータが含まれている場合は警告を表示
                    if ((Array.isArray(requestObj.body) && requestObj.body.some((field: any) => field.type === 'file')) ||
                        (requestObj.bodyType === 'binary' && requestObj.body instanceof File)) {
                        console.warn('⚠️ setBody: Request contains file data. setBody command will be ignored to preserve file data.');
                        showError('setBody command ignored: Request contains file data');
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
                    // ファイルデータが含まれている場合は警告を表示
                    if ((Array.isArray(requestObj.body) && requestObj.body.some((field: any) => field.type === 'file')) ||
                        (requestObj.bodyType === 'binary' && requestObj.body instanceof File)) {
                        console.warn('⚠️ setBodyWithVar: Request contains file data. setBodyWithVar command will be ignored to preserve file data.');
                        showError('setBodyWithVar command ignored: Request contains file data');
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

    let html = `<div class="test-summary"><span class="test-passed">✓ ${passed} passed</span><span class="test-failed">✗ ${failed} failed</span></div><div class="test-results">`;
    results.forEach(result => {
        html += `<div class="test-result ${result.passed ? 'passed' : 'failed'}"><span class="test-icon">${result.passed ? '✓' : '✗'}</span><span class="test-name">${escapeHtml(result.name)}</span>${result.error ? `<span class="test-error">${escapeHtml(result.error)}</span>` : ''}</div>`;
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
    // バイナリファイルの復元処理
    let requestWithRestoredFiles = { ...request };
    if (request.bodyType === 'binary' && typeof request.body === 'string') {
        try {
            const binaryData = JSON.parse(request.body);
            if (binaryData.type === 'binaryFile' && binaryData.base64Data) {
                // Base64からFileオブジェクトを復元
                const restoredFile = base64ToFile(binaryData.base64Data, binaryData.fileName, binaryData.fileType);
                requestWithRestoredFiles = { ...request, body: restoredFile };
                console.log('🔍 [processVariables] Binary file restored from Base64:', {
                    name: binaryData.fileName,
                    size: binaryData.fileSize,
                    type: binaryData.fileType
                });
            }
        } catch (error) {
            console.error('🔍 [processVariables] Failed to restore binary file:', error);
        }
    }

    // File objectsを含む場合はJSON.stringify/parseできないため、特別な処理が必要
    const hasFiles = (Array.isArray(requestWithRestoredFiles.body) &&
        requestWithRestoredFiles.body.some((field: any) => field.type === 'file' && (field.file || field.fileContent))) ||
        (requestWithRestoredFiles.bodyType === 'binary' && requestWithRestoredFiles.body instanceof File);

    let processed: RequestData;
    if (hasFiles) {
        // Fileオブジェクトを含む場合は手動でクローン
        console.log('🔍 [processVariables] File objects detected, using manual clone');
        processed = {
            ...requestWithRestoredFiles,
            headers: { ...requestWithRestoredFiles.headers },
            params: { ...requestWithRestoredFiles.params },
            auth: { ...requestWithRestoredFiles.auth },
            // bodyは元のオブジェクトを保持（File objectsを保護）
            body: Array.isArray(requestWithRestoredFiles.body) ? requestWithRestoredFiles.body.map((field: any) => {
                if (field.type === 'file' && field.fileContent && !field.file) {
                    // Base64からFileオブジェクトを復元
                    try {
                        const restoredFile = base64ToFile(field.fileContent, field.fileName, field.fileType);
                        return { ...field, file: restoredFile };
                    } catch (error) {
                        console.error('Failed to restore file from base64:', error);
                        return field;
                    }
                }
                return field;
            }) as any : requestWithRestoredFiles.body
        };
    } else {
        // 通常の場合はJSONクローン
        console.log('🔍 [processVariables] No file objects, using JSON clone');
        processed = JSON.parse(JSON.stringify(requestWithRestoredFiles));
    }

    // URLの変数置換を最初に行う
    processed.url = replaceVariables(processed.url);
    // URLの有効性チェック
    if (!processed.url || !processed.url.trim()) {
        throw new Error('URL is required');
    }

    // URLが変数置換後も変数を含む場合はエラー
    // if (processed.url.includes('{') || processed.url.includes('}')) {
    //     throw new Error(`Invalid URL: ${processed.url} - Variables not resolved`);
    // }

    try {
        const url = new URL(processed.url);

        // パラメータの変数置換
        processed.params = deepReplaceVariables(processed.params);
        Object.entries(processed.params).forEach(([key, value]) => {
            url.searchParams.set(key, String(value));
        });

        // APIキーの処理
        if (processed.auth.type === 'apikey' && processed.auth.addTo === 'query') {
            if (processed.auth.key && processed.auth.value) {
                url.searchParams.set(processed.auth.key, processed.auth.value);
            }
        }

        processed.url = url.toString();

        // その他のプロパティの変数置換
        processed.headers = deepReplaceVariables(processed.headers);
        // ─── (B) 変数置換：認証情報にも適用 ─────────────────────────
        switch (processed.auth.type) {
            case 'basic':
                if (processed.auth.username) {
                    processed.auth.username = replaceVariables(processed.auth.username);
                }
                if (processed.auth.password) {
                    processed.auth.password = replaceVariables(processed.auth.password);
                }
                break;

            case 'bearer':
                if (processed.auth.token) {
                    processed.auth.token = replaceVariables(processed.auth.token);
                }
                break;

            case 'apikey':
                if (processed.auth.key) {
                    processed.auth.key = replaceVariables(processed.auth.key);
                }
                if (processed.auth.value) {
                    processed.auth.value = replaceVariables(processed.auth.value);
                }
                break;
        }
        // ──────────────────────────────────────────────────────────────
        if (processed.body) {
            if (typeof processed.body === 'string') {
                processed.body = replaceVariables(processed.body);
            } else if (hasFiles) {
                // Fileオブジェクトを含む場合は変数置換をスキップ
                console.log('🔍 [processVariables] Skipping variable replacement for body with files');
                // File以外のフィールドのみ変数置換
                if (Array.isArray(processed.body)) {
                    processed.body = (processed.body as any[]).map((field: any) => {
                        if (field.type === 'file') {
                            return field; // Fileフィールドはそのまま
                        } else {
                            return {
                                ...field,
                                value: field.value ? replaceVariables(field.value) : field.value
                            };
                        }
                    }) as any;
                }
            } else {
                processed.body = deepReplaceVariables(processed.body);
            }
        }
    } catch (error) {
        throw new Error(`Invalid URL: ${processed.url}`);
    }

    return processed;
}

/**
 * saveToHistory
 *  historyManager へ委譲
 */
export async function saveToHistory(request: RequestData, responseData: ProcessedResponse, testResults: any[] = []): Promise<void> {
    await saveToHistoryFn(request, responseData, testResults);
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
        console.log('saveCurrentRequest: Found param rows:', paramRows.length);
        const newParams: Record<string, string> = {};
        paramRows.forEach((row, index) => {
            const rowElement = row as HTMLElement;
            const keyInput = rowElement.querySelector('.key-input') as HTMLInputElement;
            const valueInput = rowElement.querySelector('.value-input') as HTMLInputElement;
            const key = keyInput.value.trim();
            const value = valueInput.value.trim();
            console.log(`saveCurrentRequest: Row ${index}: ${key} = ${value}`);
            if (key) newParams[key] = value;
        });
        console.log('saveCurrentRequest: New params object:', newParams);
        req.params = newParams;


        // ボディタイプと内容を保存
        const selectedBodyType = document.querySelector('input[name="bodyType"]:checked') as HTMLInputElement;
        req.bodyType = selectedBodyType.value as any;

        switch (req.bodyType) {
            case 'raw':
                req.body = (document.getElementById('rawBody') as HTMLTextAreaElement).value;
                break;

            case 'json':
                req.body = (document.getElementById('jsonBody') as HTMLTextAreaElement).value;
                break;

            case 'form-data':
                // helper returns FormDataField[]
                req.body = await serializeFormDataWithFiles('formDataFieldsContainer');
                break;

            case 'urlencoded':
                req.body = collectKeyValues('urlEncodedContainer');
                break;

            case 'binary':
                // helper returns JSON string or null
                const bin = await serializeBinaryFile('binaryFileInput');
                req.body = bin;
                break;

            default:
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

        // プリリクエストスクリプトとテストスクリプト
        const preRequestScriptTextarea = document.getElementById('preRequestScript') as HTMLTextAreaElement;
        const testScriptTextarea = document.getElementById('testScript') as HTMLTextAreaElement;
        req.preRequestScript = preRequestScriptTextarea?.value || '';
        req.testScript = testScriptTextarea?.value || '';

        console.log('保存するリクエスト:', req);
        console.log('保存するテストスクリプト:', req.testScript);

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
    console.log('🔍 [getValueFromVarString] Processing variable string:', varString);

    // Use the new getVariable function from variableManager.ts
    try {
        const value = getVariable(varString);
        if (value === undefined) {
            throw new Error(`変数「${varString}」が見つかりません`);
        }
        console.log('🔍 [getValueFromVarString] Resolved value:', value);
        return value;
    } catch (error: any) {
        console.error('🔍 [getValueFromVarString] Error resolving variable:', error);
        throw new Error(`変数解析エラー: ${error.message}`);
    }
}