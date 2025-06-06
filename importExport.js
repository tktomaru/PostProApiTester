// importExport.js
// ───────────────────────────────────────────────────────────────────────────────
// Import / Export 処理をまとめる

import {
    saveCollectionsToStorage,
    saveVariablesToStorage,
    saveEnvironmentsToStorage,
    saveScenariosToStorage,
    state
} from './state.js';
import { renderCollectionsTree } from './collectionManager.js';
import { renderEnvironmentSelector, renderAllVariables, updateCollectionVarSelector } from './variableManager.js';
import { showSuccess, showError } from './utils.js';
import { sampleTestScript } from './defaultData.js';
import { addKeyValueRow, handleBodyTypeChange } from './utils.js';
import { renderScenarioList } from './scenarioManager.js';


/** initializeTestScript：ページ上にある TestScript 欄にサンプルを反映 */
export function initializeTestScript() {
    const testTextarea = document.getElementById('testScript');
    if (testTextarea && !testTextarea.value.trim()) {
        testTextarea.value = sampleTestScript;
    }
}

/** openImportModal */
export function openImportModal() {
    document.getElementById('importExportModal').classList.add('active');
    document.getElementById('modalTitle').textContent = 'Import Data';
}

/** handleFileSelect */
export function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        document.getElementById('importText').value = e.target.result;
    };
    reader.readAsText(file);
}

/** handleImport */
export async function handleImport() {
    const importType = document.getElementById('importType').value;
    const importText = document.getElementById('importText').value.trim();

    if (!importText) {
        showError('Please select a file or paste content to import');
        return;
    }

    try {
        let data;
        try {
            data = JSON.parse(importText);
        } catch (e) {
            if (importType === 'curl') {
                data = parseCurlCommand(importText);
            } else {
                throw new Error('Invalid JSON format');
            }
        }

        switch (importType) {
            case 'postman':
                await importPostmanCollection(data);
                break;
            case 'apitester':
                await importApiTesterData(data);
                break;
            case 'openapi':
                await importOpenApiSpec(data);
                break;
            case 'har':
                await importHarFile(data);
                break;
            case 'curl':
                importCurlCommand(data);
                break;
            case 'talentedapitester':
                importTalendData(data);
                break;

        }

        document.getElementById('importExportModal').classList.remove('active');
        showSuccess('Import completed successfully');
    } catch (error) {
        showError('Import failed: ' + error.message);
    }
}


function convertPostmanAuth(postmanAuth) {
    const auth = { type: postmanAuth.type || 'none' };

    switch (postmanAuth.type) {
        case 'basic':
            const basicAuth = postmanAuth.basic?.reduce((acc, item) => {
                acc[item.key] = item.value;
                return acc;
            }, {});
            auth.username = basicAuth?.username || '';
            auth.password = basicAuth?.password || '';
            break;

        case 'bearer':
            const bearerAuth = postmanAuth.bearer?.reduce((acc, item) => {
                acc[item.key] = item.value;
                return acc;
            }, {});
            auth.token = bearerAuth?.token || '';
            break;

        case 'apikey':
            const apikeyAuth = postmanAuth.apikey?.reduce((acc, item) => {
                acc[item.key] = item.value;
                return acc;
            }, {});
            auth.key = apikeyAuth?.key || '';
            auth.value = apikeyAuth?.value || '';
            auth.addTo = apikeyAuth?.in === 'query' ? 'query' : 'header';
            break;
    }

    return auth;
}

function extractPostmanRequests(items, folder = '') {
    const requests = [];

    items.forEach(item => {
        if (item.request) {
            const request = {
                id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                name: item.name || 'Untitled Request',
                method: item.request.method || 'GET',
                url: typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '',
                headers: {},
                params: {},
                body: null,
                auth: { type: 'none' },
                folder: folder
            };

            // Extract headers
            if (item.request.header) {
                item.request.header.forEach(header => {
                    if (!header.disabled) {
                        request.headers[header.key] = header.value;
                    }
                });
            }

            // Extract query parameters
            if (item.request.url?.query) {
                item.request.url.query.forEach(param => {
                    if (!param.disabled) {
                        request.params[param.key] = param.value;
                    }
                });
            }

            // Extract body
            if (item.request.body) {
                switch (item.request.body.mode) {
                    case 'raw':
                        request.body = item.request.body.raw;
                        break;
                    case 'formdata':
                        request.body = item.request.body.formdata?.reduce((acc, field) => {
                            if (!field.disabled) {
                                acc[field.key] = field.value;
                            }
                            return acc;
                        }, {});
                        break;
                }
            }

            // Extract auth
            if (item.request.auth) {
                request.auth = convertPostmanAuth(item.request.auth);
            }

            requests.push(request);
        } else if (item.item) {
            // Folder with sub-items
            const folderName = folder ? `${folder}/${item.name}` : item.name;
            requests.push(...extractPostmanRequests(item.item, folderName));
        }
    });

    return requests;
}

/** importPostmanCollection */
async function importPostmanCollection(data) {
    const collection = {
        id: `collection_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: data.info?.name || 'Imported Collection',
        description: data.info?.description || '',
        requests: []
    };

    if (data.item) {
        collection.requests = extractPostmanRequests(data.item);
    }

    // 変数読み込み
    if (data.variable) {
        data.variable.forEach(v => {
            if (v.key && !v.disabled) {
                state.variables.global[v.key] = { value: v.value || '', description: v.description || '' };
            }
        });
        await saveVariablesToStorage();
    }

    state.collections.push(collection);
    await saveCollectionsToStorage();

    updateCollectionVarSelector();
    renderCollectionsTree();         // サイドバーのコレクション描画
}

/**
 * importTalendData（修正版）
 *  - service → state.collections に追加
 *  - scenario → state.scenarios に追加
 *  - environment → state.environments に追加し、同時に state.variables.environment にも格納
 */
export async function importTalendData(talend) {
    // ① Project ノードを探す
    const projectNode = talend.entities.find(e => e.entity.type === 'Project');
    if (!projectNode) {
        throw new Error('Talend JSON に Project が見つかりません');
    }

    const projectChildren = projectNode.children || [];

    // 追加用バッファ
    const collectionsToAdd = [];
    const scenariosToAdd = [];
    const environmentsToAdd = [];

    // ② 各 Service/Scenario をパースして配列を作成
    projectChildren.forEach(child => {
        const { entity, children } = child;

        // ──────────────
        // (A) Service → Collections にマッピング
        // ──────────────
        if (entity.type === 'Service') {
            const svc = entity;
            const requests = (children || [])
                .filter(r => r.entity.type === 'Request')
                .map(rNode => {
                    const e = rNode.entity;
                    return {
                        id: e.id,
                        name: e.name,
                        method: e.method.name,
                        url: e.uri.path,
                        headers: (e.headers || [])
                            .filter(h => h.enabled)
                            .reduce((acc, h) => {
                                acc[h.name] = h.value;
                                return acc;
                            }, {}),
                        params: {},
                        body: (e.body && e.body.textBody) || '',
                        auth: { type: 'none' }
                    };
                });

            collectionsToAdd.push({
                id: svc.id,
                name: svc.name,
                description: '',
                requests
            });
        }

        // ──────────────
        // (B) Scenario → Scenarios にマッピング
        // ──────────────
        else if (entity.type === 'Scenario') {
            const sce = entity;
            const scenarioRequests = (children || [])
                .filter(r => r.entity.type === 'Request')
                .map(rNode => {
                    const e = rNode.entity;
                    return {
                        id: e.id,
                        name: e.name,
                        method: e.method.name,
                        url: e.uri.path,
                        headers: (e.headers || [])
                            .filter(h => h.enabled)
                            .reduce((acc, h) => {
                                acc[h.name] = h.value;
                                return acc;
                            }, {}),
                        params: {},
                        body: (e.body && e.body.textBody) || '',
                        auth: { type: 'none' }
                    };
                });

            scenariosToAdd.push({
                id: sce.id,
                name: sce.name,
                description: '',
                requests: scenarioRequests
            });
        }
    });

    // ③ Talend environments 配列をパースして { id, name, variables } の形にマッピング
    const talendEnvs = talend.environments || [];
    talendEnvs.forEach(envNode => {
        const e = envNode;
        // e.variables は { uuid: { createdAt, name, value, enabled, ... }, ... } という構造
        const vars = {};
        Object.values(e.variables || {}).forEach(v => {
            if (v.enabled) {
                vars[v.name] = {
                    value: v.value,
                    description: '' // 説明がなければ空文字
                };
            }
        });
        environmentsToAdd.push({
            id: e.id,
            name: e.name,
            variables: vars
        });
    });

    // ─────────────────────────────────────────────────────────────
    // ④ state.collections に Collections を追加し、ストレージ保存
    if (collectionsToAdd.length > 0) {
        state.collections.push(...collectionsToAdd);
        await saveCollectionsToStorage();
    }

    // ⑤ state.scenarios に Scenarios を追加し、ストレージ保存
    if (!Array.isArray(state.scenarios)) {
        state.scenarios = [];
    }
    if (scenariosToAdd.length > 0) {
        state.scenarios.push(...scenariosToAdd);
        await saveScenariosToStorage();
    }

    // ⑥ state.environments と state.variables.environment に環境変数を追加
    if (!Array.isArray(state.environments)) {
        state.environments = [];
    }
    if (!state.variables.environment) {
        state.variables.environment = {};
    }

    for (const envObj of environmentsToAdd) {
        // (1) state.environments に追加
        state.environments.push({
            id: envObj.id,
            name: envObj.name,
            variables: { ...envObj.variables } // ここで key/value を格納
        });

        // (2) state.variables.environment[env.id] に変数オブジェクトを追加
        state.variables.environment[envObj.id] = envObj.variables;
        await chrome.storage.local.set({ [`env_${envObj.id}`]: envObj.variables });
    }

    if (environmentsToAdd.length > 0) {
        // 環境一覧と変数ストレージの両方を更新
        await saveEnvironmentsToStorage();
        await saveVariablesToStorage();
    }
    // ─────────────────────────────────────────────────────────────

    // ⑦ 画面表示を更新
    updateCollectionVarSelector();
    renderEnvironmentSelector();
    renderAllVariables();
    renderCollectionsTree();
    renderScenarioList(); // シナリオ一覧を再描画する関数
}


/** importApiTesterData */
async function importApiTesterData(data) {
    if (data.collections) {
        state.collections.push(...data.collections);
    }
    if (data.variables) {
        Object.assign(state.variables.global, data.variables.global || {});
        Object.assign(state.variables.collection, data.variables.collection || {});
    }
    if (data.environments) {
        state.environments.push(...data.environments);
    }

    await saveCollectionsToStorage();
    await saveVariablesToStorage();
    await saveEnvironmentsToStorage();

    renderEnvironmentSelector();
    updateCollectionVarSelector();
    renderAllVariables();
    renderCollectionsTree();         // サイドバーのコレクション描画
}

/** importOpenApiSpec */
async function importOpenApiSpec(data) {
    const collection = {
        id: `collection_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: data.info?.title || 'OpenAPI Import',
        description: data.info?.description || '',
        requests: []
    };
    const baseUrl = getOpenApiBaseUrl(data);

    if (data.paths) {
        Object.entries(data.paths).forEach(([path, pathItem]) => {
            Object.entries(pathItem).forEach(([method, operation]) => {
                if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
                    const request = {
                        id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                        name: operation.summary || `${method.toUpperCase()} ${path}`,
                        method: method.toUpperCase(),
                        url: baseUrl + path,
                        headers: {},
                        params: {},
                        body: null,
                        auth: { type: 'none' },
                        description: operation.description || ''
                    };
                    // パラメータ抽出
                    if (operation.parameters) {
                        operation.parameters.forEach(param => {
                            if (param.in === 'query') {
                                request.params[param.name] = param.example || '';
                            } else if (param.in === 'header') {
                                request.headers[param.name] = param.example || '';
                            }
                        });
                    }
                    // リクエストボディ例
                    if (operation.requestBody?.content) {
                        const jsonContent = operation.requestBody.content['application/json'];
                        if (jsonContent?.example) {
                            request.body = JSON.stringify(jsonContent.example, null, 2);
                        } else if (jsonContent?.schema?.example) {
                            request.body = JSON.stringify(jsonContent.schema.example, null, 2);
                        }
                    }
                    collection.requests.push(request);
                }
            });
        });
    }

    collections.push(collection);
    await saveCollectionsToStorage();

    updateCollectionVarSelector();
    renderCollectionsTree();         // サイドバーのコレクション描画
}

/** importHarFile */
async function importHarFile(data) {
    const collection = {
        id: `collection_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: 'HAR Import - ' + new Date().toLocaleString(),
        description: 'Imported from HAR file',
        requests: []
    };

    if (data.log && data.log.entries) {
        data.log.entries.forEach(entry => {
            const request = entry.request;
            if (request) {
                const importedRequest = {
                    id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                    name: `${request.method} ${new URL(request.url).pathname}`,
                    method: request.method,
                    url: request.url,
                    headers: {},
                    params: {},
                    body: null,
                    auth: { type: 'none' }
                };
                // ヘッダ抽出
                if (request.headers) {
                    request.headers.forEach(header => {
                        importedRequest.headers[header.name] = header.value;
                    });
                }
                // クエリパラメータ抽出
                if (request.queryString) {
                    request.queryString.forEach(param => {
                        importedRequest.params[param.name] = param.value;
                    });
                }
                // ボディ抽出
                if (request.postData) {
                    importedRequest.body = request.postData.text;
                }
                collection.requests.push(importedRequest);
            }
        });
    }

    collections.push(collection);
    await saveCollectionsToStorage();

    updateCollectionVarSelector();
    renderCollectionsTree();         // サイドバーのコレクション描画
}

/** parseCurlCommand */
export function parseCurlCommand(curlString) {
    const request = {
        method: 'GET',
        url: '',
        headers: {},
        body: null,
        auth: { type: 'none' }
    };
    // 改行・余分なスペース除去
    const normalized = curlString.replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim();
    // URL 抽出
    const urlMatch = normalized.match(/curl\s+(?:'([^']+)'|"([^"]+)"|(\S+))/);
    if (urlMatch) {
        request.url = urlMatch[1] || urlMatch[2] || urlMatch[3];
    }
    // メソッド抽出
    const methodMatch = normalized.match(/-X\s+(\w+)/);
    if (methodMatch) {
        request.method = methodMatch[1].toUpperCase();
    }
    // ヘッダ抽出
    const headerRegex = /-H\s+(?:'([^']+)'|"([^"]+)")/g;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(normalized))) {
        const header = headerMatch[1] || headerMatch[2];
        const [key, ...valueParts] = header.split(':');
        if (key && valueParts.length) {
            request.headers[key.trim()] = valueParts.join(':').trim();
        }
    }
    // データ抽出
    const dataMatch = normalized.match(/(?:-d|--data)\s+(?:'([^']+)'|"([^"]+)"|(\S+))/);
    if (dataMatch) {
        request.body = dataMatch[1] || dataMatch[2] || dataMatch[3];
    }
    // Basic Auth 抽出
    const authMatch = normalized.match(/-u\s+(?:'([^']+)'|"([^"]+)"|(\S+))/);
    if (authMatch) {
        const authString = authMatch[1] || authMatch[2] || authMatch[3];
        const [username, password] = authString.split(':');
        if (username) {
            request.auth = {
                type: 'basic',
                username: username,
                password: password || ''
            };
        }
    }
    return request;
}

/** importCurlCommand */
export function importCurlCommand(request) {
    // メソッドとURLを設定
    document.getElementById('methodSelect').value = request.method;
    document.getElementById('urlInput').value = request.url;

    //state.currentRequest を更新
    state.currentRequest.method = request.method;
    state.currentRequest.url = request.url;
    state.currentRequest.headers = { ...request.headers };
    state.currentRequest.params = {};
    state.currentRequest.body = request.body || null;
    state.currentRequest.auth = request.auth || { type: 'none' };

    // ヘッダをセット
    const headersContainer = document.getElementById('headersContainer');
    headersContainer.innerHTML = '';
    Object.entries(request.headers).forEach(([key, value]) => {
        addKeyValueRow(headersContainer, 'header');
        const rows = headersContainer.querySelectorAll('.key-value-row');
        const lastRow = rows[rows.length - 1];
        lastRow.querySelector('.key-input').value = key;
        lastRow.querySelector('.value-input').value = value;
    });
    if (Object.keys(request.headers).length === 0) {

        addKeyValueRow(headersContainer, 'header');
    }

    // ボディをセット
    if (request.body) {
        document.querySelector('input[name="bodyType"][value="raw"]').checked = true;
        handleBodyTypeChange({ target: { value: 'raw' } });
        document.getElementById('rawBody').value = request.body;
    }

    // 認証をセット
    if (request.auth && request.auth.type !== 'none') {
        document.getElementById('authType').value = request.auth.type;
        const { renderAuthDetails, updateAuthData } = import('./utils.js');
        renderAuthDetails(request.auth.type);
        updateAuthData();
    }

    document.getElementById('importExportModal').classList.remove('active');
}

/** exportData */
export async function exportData() {
    const dataToExport = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        collections: state.collections,
        variables: {
            global: state.variables.global,
            collection: state.variables.collection
        },
        environments: state.environments,
        currentEnvironment: state.currentEnvironment,
        history: state.history.slice(0, 50)
    };

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `api-tester-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccess('Data exported successfully');
}
