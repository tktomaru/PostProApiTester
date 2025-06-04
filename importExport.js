// importExport.js
// ───────────────────────────────────────────────────────────────────────────────
// Import / Export 処理をまとめる

import {
    collections,
    variables,
    environments,
    saveCollectionsToStorage,
    saveVariablesToStorage,
    saveEnvironmentsToStorage
} from './state.js';

import {
    renderCollections
} from './collectionManager.js';

import {
    updateCollectionVarSelector
} from './variableManager.js';

import { currentRequest } from './state.js';

import { renderEnvironmentSelector, renderAllVariables } from './variableManager.js';

import { showSuccess, showError } from './utils.js';

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
        }

        document.getElementById('importExportModal').classList.remove('active');
        showSuccess('Import completed successfully');
    } catch (error) {
        showError('Import failed: ' + error.message);
    }
}

/** importPostmanCollection */
async function importPostmanCollection(data) {
    const collection = {
        id: Date.now(),
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
                variables.global[v.key] = { value: v.value || '', description: v.description || '' };
            }
        });
        await saveVariablesToStorage();
    }

    collections.push(collection);
    await saveCollectionsToStorage();

    renderCollections();
    updateCollectionVarSelector();
}

/** importApiTesterData */
async function importApiTesterData(data) {
    if (data.collections) {
        collections.push(...data.collections);
    }
    if (data.variables) {
        Object.assign(variables.global, data.variables.global || {});
        Object.assign(variables.collection, data.variables.collection || {});
    }
    if (data.environments) {
        environments.push(...data.environments);
    }

    await saveCollectionsToStorage();
    await saveVariablesToStorage();
    await saveEnvironmentsToStorage();

    renderCollections();
    renderEnvironmentSelector();
    updateCollectionVarSelector();
    renderAllVariables();
}

/** importOpenApiSpec */
async function importOpenApiSpec(data) {
    const collection = {
        id: Date.now(),
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
                        id: Date.now() + Math.random(),
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

    renderCollections();
    updateCollectionVarSelector();
}

/** importHarFile */
async function importHarFile(data) {
    const collection = {
        id: Date.now(),
        name: 'HAR Import - ' + new Date().toLocaleString(),
        description: 'Imported from HAR file',
        requests: []
    };

    if (data.log && data.log.entries) {
        data.log.entries.forEach(entry => {
            const request = entry.request;
            if (request) {
                const importedRequest = {
                    id: Date.now() + Math.random(),
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

    renderCollections();
    updateCollectionVarSelector();
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

    // currentRequest を更新
    currentRequest.method = request.method;
    currentRequest.url = request.url;
    currentRequest.headers = { ...request.headers };
    currentRequest.params = {};
    currentRequest.body = request.body || null;
    currentRequest.auth = request.auth || { type: 'none' };

    // ヘッダをセット
    const headersContainer = document.getElementById('headersContainer');
    headersContainer.innerHTML = '';
    Object.entries(request.headers).forEach(([key, value]) => {
        const { addKeyValueRow } = import('./utils.js');
        addKeyValueRow(headersContainer, 'header');
        const rows = headersContainer.querySelectorAll('.key-value-row');
        const lastRow = rows[rows.length - 1];
        lastRow.querySelector('.key-input').value = key;
        lastRow.querySelector('.value-input').value = value;
    });
    if (Object.keys(request.headers).length === 0) {
        const { addKeyValueRow } = import('./utils.js');
        addKeyValueRow(headersContainer, 'header');
    }

    // ボディをセット
    if (request.body) {
        document.querySelector('input[name="bodyType"][value="raw"]').checked = true;
        const { handleBodyTypeChange } = import('./utils.js');
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
        collections: collections,
        variables: {
            global: variables.global,
            collection: variables.collection
        },
        environments: environments,
        currentEnvironment: currentEnvironment,
        history: history.slice(0, 50)
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
