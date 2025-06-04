// Global state management - 修正版
let currentRequest = {
    method: 'GET',
    url: '',
    headers: {},
    params: {},
    body: null,
    auth: { type: 'none' }
};

let collections = [];
let history = [];
let variables = {
    global: {},
    environment: {},
    collection: {}
};

// 追加のグローバル変数
let environments = [];
let currentEnvironment = null;
let currentCollection = null;
let isInterceptorActive = false;

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

// Main initialization function - 修正版
async function initializeApp() {
    try {
        // 1. まず基本的なイベントリスナーを設定
        setupEventListeners();
        setupTabSwitching();
        setupModalHandlers();

        // 2. ストレージからデータを読み込む（順序重要）
        await loadAllStoredData();

        // 3. UI初期化
        initializeKeyValueEditors();
        setupAuthHandlers();

        // 4. 変数管理の初期化（環境読み込み後に実行）
        await initializeVariablesManagement();

        // 5. 初期レンダリング
        renderCollections();
        renderHistory();

        console.log('API Tester initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize: ' + error.message);
    }
}

function openImportModal() {
    document.getElementById('importExportModal').classList.add('active');
    document.getElementById('modalTitle').textContent = 'Import Data';
}


function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        document.getElementById('importText').value = e.target.result;
    };
    reader.readAsText(file);
}


async function handleImport() {
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

    // Import variables if present
    if (data.variable) {
        data.variable.forEach(v => {
            if (v.key && !v.disabled) {
                variables.global[v.key] = { value: v.value || '', description: v.description || '' };
            }
        });
        await chrome.storage.local.set({
            variables: {
                global: variables.global,
                collection: variables.collection
            }
        });
    }

    collections.push(collection);
    await chrome.storage.local.set({ collections });
    renderCollections();
    updateCollectionVarSelector();
}

function extractPostmanRequests(items, folder = '') {
    const requests = [];

    items.forEach(item => {
        if (item.request) {
            const request = {
                id: Date.now() + Math.random(),
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

    await chrome.storage.local.set({
        collections,
        variables: {
            global: variables.global,
            collection: variables.collection
        },
        environments
    });

    renderCollections();
    renderEnvironmentSelector();
    updateCollectionVarSelector();
    renderAllVariables();
}

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

                    // Extract parameters
                    if (operation.parameters) {
                        operation.parameters.forEach(param => {
                            if (param.in === 'query') {
                                request.params[param.name] = param.example || '';
                            } else if (param.in === 'header') {
                                request.headers[param.name] = param.example || '';
                            }
                        });
                    }

                    // Extract request body example
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
    await chrome.storage.local.set({ collections });
    renderCollections();
    updateCollectionVarSelector();
}

function getOpenApiBaseUrl(spec) {
    if (spec.servers && spec.servers.length > 0) {
        return spec.servers[0].url;
    }

    // OpenAPI 2.0 format
    if (spec.host) {
        const scheme = spec.schemes && spec.schemes.length > 0 ? spec.schemes[0] : 'https';
        const basePath = spec.basePath || '';
        return `${scheme}://${spec.host}${basePath}`;
    }

    return 'https://api.example.com';
}

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

                // Extract headers
                if (request.headers) {
                    request.headers.forEach(header => {
                        importedRequest.headers[header.name] = header.value;
                    });
                }

                // Extract query parameters
                if (request.queryString) {
                    request.queryString.forEach(param => {
                        importedRequest.params[param.name] = param.value;
                    });
                }

                // Extract body
                if (request.postData) {
                    importedRequest.body = request.postData.text;
                }

                collection.requests.push(importedRequest);
            }
        });
    }

    collections.push(collection);
    await chrome.storage.local.set({ collections });
    renderCollections();
    updateCollectionVarSelector();
}

function parseCurlCommand(curlString) {
    const request = {
        method: 'GET',
        url: '',
        headers: {},
        body: null,
        auth: { type: 'none' }
    };

    // Remove line breaks and extra spaces
    const normalized = curlString.replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim();

    // Extract URL
    const urlMatch = normalized.match(/curl\s+(?:'([^']+)'|"([^"]+)"|(\S+))/);
    if (urlMatch) {
        request.url = urlMatch[1] || urlMatch[2] || urlMatch[3];
    }

    // Extract method
    const methodMatch = normalized.match(/-X\s+(\w+)/);
    if (methodMatch) {
        request.method = methodMatch[1].toUpperCase();
    }

    // Extract headers
    const headerRegex = /-H\s+(?:'([^']+)'|"([^"]+)")/g;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(normalized))) {
        const header = headerMatch[1] || headerMatch[2];
        const [key, ...valueParts] = header.split(':');
        if (key && valueParts.length) {
            request.headers[key.trim()] = valueParts.join(':').trim();
        }
    }

    // Extract data
    const dataMatch = normalized.match(/(?:-d|--data)\s+(?:'([^']+)'|"([^"]+)"|(\S+))/);
    if (dataMatch) {
        request.body = dataMatch[1] || dataMatch[2] || dataMatch[3];
    }

    // Extract basic auth
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

function importCurlCommand(request) {
    // Load the parsed cURL command into the current request editor
    document.getElementById('methodSelect').value = request.method;
    document.getElementById('urlInput').value = request.url;

    // Update current request
    currentRequest = request;

    // Clear and set headers
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

    // Set body if present
    if (request.body) {
        document.querySelector('input[name="bodyType"][value="raw"]').checked = true;
        handleBodyTypeChange({ target: { value: 'raw' } });
        document.getElementById('rawBody').value = request.body;
    }

    // Set auth if present
    if (request.auth && request.auth.type !== 'none') {
        document.getElementById('authType').value = request.auth.type;
        renderAuthDetails(request.auth.type);
        updateAuthData();
    }

    document.getElementById('importExportModal').classList.remove('active');
}

async function exportData() {
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        collections: collections,
        variables: {
            global: variables.global,
            collection: variables.collection
        },
        environments: environments,
        currentEnvironment: currentEnvironment,
        history: history.slice(0, 50) // Export last 50 history items
    };

    const dataStr = JSON.stringify(exportData, null, 2);
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

function createNewCollection() {
    const name = prompt('Enter collection name:');
    if (!name) return;

    const collection = {
        id: Date.now(),
        name: name,
        description: '',
        requests: []
    };

    collections.push(collection);
    chrome.storage.local.set({ collections });
    renderCollections();
    updateCollectionVarSelector();

    showSuccess('Collection created: ' + name);
}

function filterHistory() {
    const searchTerm = document.getElementById('historySearch').value.toLowerCase();
    const historyItems = document.querySelectorAll('.history-item');

    historyItems.forEach(item => {
        const url = item.querySelector('.history-url').textContent.toLowerCase();
        const method = item.querySelector('.history-method').textContent.toLowerCase();

        if (url.includes(searchTerm) || method.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

async function clearHistory() {
    if (confirm('Are you sure you want to clear all request history?')) {
        history = [];
        await chrome.storage.local.set({ history });
        renderHistory();
        showSuccess('History cleared');
    }
}

// Interceptor functions
function startInterceptor() {
    if (isInterceptorActive) return;

    chrome.runtime.sendMessage({
        action: 'startInterceptor',
        filters: getInterceptorFilters()
    }, response => {
        if (response?.success) {
            isInterceptorActive = true;
            document.getElementById('startInterceptorBtn').disabled = true;
            document.getElementById('stopInterceptorBtn').disabled = false;
            showSuccess('Interceptor started');
        }
    });

    // Listen for intercepted requests
    chrome.runtime.onMessage.addListener(handleInterceptedRequest);
}

function stopInterceptor() {
    if (!isInterceptorActive) return;

    chrome.runtime.sendMessage({ action: 'stopInterceptor' }, response => {
        if (response?.success) {
            isInterceptorActive = false;
            document.getElementById('startInterceptorBtn').disabled = false;
            document.getElementById('stopInterceptorBtn').disabled = true;
            showSuccess('Interceptor stopped');
        }
    });

    chrome.runtime.onMessage.removeListener(handleInterceptedRequest);
}

function getInterceptorFilters() {
    const methodFilters = [];
    document.querySelectorAll('.method-filters input:checked').forEach(input => {
        methodFilters.push(input.value);
    });

    const domainFilter = document.getElementById('domainFilter').value.trim();

    return {
        methods: methodFilters,
        domain: domainFilter
    };
}

function handleInterceptedRequest(message) {
    if (message.action === 'requestIntercepted') {
        displayInterceptedRequest(message.request);
    }
}

function displayInterceptedRequest(request) {
    const container = document.getElementById('interceptorContainer');

    const requestDiv = document.createElement('div');
    requestDiv.className = 'intercepted-request';
    requestDiv.innerHTML = `
        <span class="history-method method-${request.method}">${request.method}</span>
        <span class="history-url">${escapeHtml(request.url)}</span>
        <span class="history-status status-${request.status < 400 ? 'success' : 'error'}">${request.status || 'Pending'}</span>
        <span class="history-time">${new Date().toLocaleTimeString()}</span>
    `;

    requestDiv.addEventListener('click', function () {
        loadInterceptedRequest(request);
    });

    container.insertBefore(requestDiv, container.firstChild);

    // Keep only last 50 intercepted requests
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

function loadInterceptedRequest(request) {
    // Convert intercepted request to our format
    const convertedRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers || {},
        params: {},
        body: request.body || null,
        auth: { type: 'none' }
    };

    // Load into editor
    loadCollectionRequest(convertedRequest);
    showSuccess('Request loaded from interceptor');
}

function openSettings() {
    // TODO: Implement settings modal
    showError('Settings panel not yet implemented');
}

// OAuth2 helper
window.getOAuth2Token = async function () {
    // TODO: Implement OAuth2 flow
    showError('OAuth2 flow not yet implemented');
};

// Load all stored data
async function loadAllStoredData() {
    try {
        const result = await chrome.storage.local.get([
            'collections',
            'history',
            'variables',
            'environments',
            'currentEnvironment',
            'currentCollection',
            'settings'
        ]);

        if (result.collections) {
            collections = result.collections;
        }

        if (result.history) {
            history = result.history;
        }

        if (result.variables?.global) {
            variables.global = result.variables.global;
        }

        if (result.environments) {
            environments = result.environments;
        }

        if (result.currentEnvironment) {
            currentEnvironment = result.currentEnvironment;
            const envData = await chrome.storage.local.get([`env_${currentEnvironment}`]);
            if (envData[`env_${currentEnvironment}`]) {
                variables.environment = envData[`env_${currentEnvironment}`];
            }
        }

        if (result.currentCollection) {
            currentCollection = result.currentCollection;
        }

        if (result.variables?.collection) {
            variables.collection = result.variables.collection;
        }

        console.log('Stored data loaded:', {
            collectionsCount: collections.length,
            historyCount: history.length,
            environmentsCount: environments.length,
            currentEnvironment,
            currentCollection
        });

    } catch (error) {
        console.error('Error loading stored data:', error);
        throw error;
    }
}

// Include all the collection management functions from the previous artifacts
// [Collection management functions here - renderCollections, selectCollection, etc.]

// Include all the variable management functions from the previous artifacts
// [Variable management functions here - initializeVariablesManagement, etc.]

// Include the variable replacement functions
function replaceVariables(text) {
    if (typeof text !== 'string') return text;

    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmedName = varName.trim();
        const value = getVariable(trimmedName);
        return value !== undefined ? value : match;
    });
}

function deepReplaceVariables(obj) {
    if (typeof obj === 'string') {
        return replaceVariables(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(deepReplaceVariables);
    }
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            const newKey = replaceVariables(key);
            result[newKey] = deepReplaceVariables(value);
        }
        return result;
    }
    return obj;
}


// Tab switching functionality
function setupTabSwitching() {
    // Main tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const tabName = this.dataset.tab;
            switchMainTab(tabName);
        });
    });

    // Sub tabs (request details)
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const subtabName = this.dataset.subtab;
            switchSubTab(subtabName);
        });
    });

    // Response tabs
    document.querySelectorAll('.response-tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const restabName = this.dataset.restab;
            switchResponseTab(restabName);
        });
    });

    // Response format buttons
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const format = this.dataset.format;
            switchResponseFormat(format);
        });
    });
}

function switchMainTab(tabName) {
    // Remove active class from all tabs and contents
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Add active class to selected tab and content
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

function switchSubTab(subtabName) {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));

    document.querySelector(`[data-subtab="${subtabName}"]`).classList.add('active');
    document.getElementById(`${subtabName}-subtab`).classList.add('active');
}

function switchResponseTab(restabName) {
    document.querySelectorAll('.response-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.response-tab-content').forEach(content => content.classList.remove('active'));

    document.querySelector(`[data-restab="${restabName}"]`).classList.add('active');
    document.getElementById(`response-${restabName}`).classList.add('active');
}

function switchResponseFormat(format) {
    document.querySelectorAll('.format-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-format="${format}"]`).classList.add('active');

    // Re-render response with new format
    if (window.lastResponse) {
        displayResponse(window.lastResponse, format);
    }
}

// Key-Value editors initialization
function initializeKeyValueEditors() {
    initializeParamsEditor();
    initializeHeadersEditor();
    setupAddButtons();
}

function initializeParamsEditor() {
    const container = document.getElementById('paramsContainer');
    if (container.children.length === 0) {
        addKeyValueRow(container, 'param');
    }
}

function initializeHeadersEditor() {
    const container = document.getElementById('headersContainer');
    if (container.children.length === 0) {
        addKeyValueRow(container, 'header');
    }
}

function setupAddButtons() {
    document.querySelector('.add-param').addEventListener('click', function () {
        const container = document.getElementById('paramsContainer');
        addKeyValueRow(container, 'param');
    });

    document.querySelector('.add-header').addEventListener('click', function () {
        const container = document.getElementById('headersContainer');
        addKeyValueRow(container, 'header');
    });
}

function addKeyValueRow(container, type) {
    const row = document.createElement('div');
    row.className = 'key-value-row';
    row.innerHTML = `
        <input type="text" placeholder="Key" class="key-input">
        <input type="text" placeholder="Value" class="value-input">
        <input type="text" placeholder="Description" class="description-input">
        <button type="button" class="delete-btn">×</button>
    `;

    // Add event listeners
    const keyInput = row.querySelector('.key-input');
    const valueInput = row.querySelector('.value-input');
    const deleteBtn = row.querySelector('.delete-btn');

    keyInput.addEventListener('input', function () {
        updateRequestData(type);
    });

    valueInput.addEventListener('input', function () {
        updateRequestData(type);
    });

    deleteBtn.addEventListener('click', function () {
        row.remove();
        updateRequestData(type);
    });

    container.appendChild(row);
}

function updateRequestData(type) {
    if (type === 'param') {
        currentRequest.params = collectKeyValues('paramsContainer');
    } else if (type === 'header') {
        currentRequest.headers = collectKeyValues('headersContainer');
    }
}

function collectKeyValues(containerId) {
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

// Authentication handlers
function setupAuthHandlers() {
    const authTypeSelect = document.getElementById('authType');
    authTypeSelect.addEventListener('change', function () {
        const authType = this.value;
        currentRequest.auth.type = authType;
        renderAuthDetails(authType);
    });
}

function renderAuthDetails(authType) {
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

// Main request sending function
async function sendRequest() {
    try {
        showLoading(true);

        // Validate request
        if (!currentRequest.url.trim()) {
            showError('URL is required');
            return;
        }

        // Execute pre-request script FIRST
        await executePreRequestScript();

        // Process variables AFTER pre-request script
        const processedRequest = processVariables(currentRequest);

        // Build fetch options
        const fetchOptions = buildFetchOptions(processedRequest);

        // Record start time
        const startTime = Date.now();

        // Send request with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        try {
            fetchOptions.signal = controller.signal;
            const response = await fetch(processedRequest.url, fetchOptions);
            clearTimeout(timeoutId);

            const endTime = Date.now();

            // Process response
            const responseData = await processResponse(response, endTime - startTime);

            // Display response
            displayResponse(responseData);

            // Execute test script
            await executeTestScript(responseData);

            // Save to history
            await saveToHistory(processedRequest, responseData);

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }

    } catch (error) {
        showError('Request failed: ' + error.message);
        console.error('Request error:', error);
    } finally {
        showLoading(false);
    }
}

function buildFetchOptions(request) {
    const options = {
        method: request.method,
        headers: {}
    };

    // Add custom headers
    Object.assign(options.headers, request.headers);

    // Add authentication
    addAuthenticationHeaders(options.headers, request.auth);

    // Add body for POST, PUT, PATCH requests
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
                // Don't set Content-Type for FormData
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

function addAuthenticationHeaders(headers, auth) {
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
                // Query params will be handled in URL processing
            }
            break;

        case 'oauth2':
            if (auth.accessToken) {
                headers['Authorization'] = `${auth.tokenType || 'Bearer'} ${auth.accessToken}`;
            }
            break;
    }
}

async function processResponse(response, duration) {
    const responseData = {
        status: response.status,
        statusText: response.statusText,
        headers: {},
        duration: duration,
        size: 0,
        body: null,
        bodyText: ''
    };

    // Extract headers
    response.headers.forEach((value, key) => {
        responseData.headers[key] = value;
    });

    // Get response body
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

function displayResponse(responseData, format = 'pretty') {
    window.lastResponse = responseData;

    // Update response stats
    const statsContainer = document.getElementById('responseStats');
    statsContainer.innerHTML = `
        <span class="status-${responseData.status < 400 ? 'success' : 'error'}">
            ${responseData.status} ${responseData.statusText}
        </span>
        <span>${responseData.duration}ms</span>
        <span>${formatBytes(responseData.size)}</span>
    `;

    // Display response body
    displayResponseBody(responseData, format);

    // Display response headers
    displayResponseHeaders(responseData.headers);

    // Display cookies if any
    displayResponseCookies(responseData.headers);
}

function displayResponseBody(responseData, format) {
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

function displayResponseHeaders(headers) {
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

function displayResponseCookies(headers) {
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

// Pre-request and test scripts
async function executePreRequestScript() {
    const script = document.getElementById('preRequestScript')?.value;
    if (!script?.trim()) return;

    try {
        const pm = {
            request: {
                url: currentRequest.url,
                method: currentRequest.method,
                headers: currentRequest.headers,
                body: currentRequest.body,

                setUrl: function (newUrl) {
                    currentRequest.url = newUrl;
                },
                addHeader: function (key, value) {
                    currentRequest.headers[key] = value;
                },
                removeHeader: function (key) {
                    delete currentRequest.headers[key];
                },
                setBody: function (newBody) {
                    currentRequest.body = newBody;
                }
            },

            variables: {
                get: function (key) {
                    return getVariable(key);
                },
                set: async function (key, value) {
                    await setVariable('environment', key, value);
                }
            },

            globals: {
                get: function (key) {
                    return variables.global[key]?.value || variables.global[key];
                },
                set: async function (key, value) {
                    await setVariable('global', key, value);
                }
            }
        };

        const scriptFunction = new Function('pm', script);
        await scriptFunction(pm);

    } catch (error) {
        console.error('Pre-request script error:', error);
        showError('Pre-request script error: ' + error.message);
    }
}

async function executeTestScript(responseData) {
    const script = document.getElementById('testScript')?.value;
    if (!script?.trim()) return;

    const results = [];

    try {
        const pm = createTestPmObject(responseData, results);

        const scriptFunction = new Function('pm', script);
        await scriptFunction(pm);

        displayTestResults(results);

    } catch (error) {
        console.error('Test script error:', error);
        results.push({
            name: 'Script Execution Error',
            passed: false,
            error: error.message
        });
        displayTestResults(results);
    }
}

function createTestPmObject(responseData, testResults) {
    return {
        test: function (name, testFunction) {
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
                    status: function (expectedStatus) {
                        if (responseData.status !== expectedStatus) {
                            throw new Error(`Expected status ${expectedStatus}, got ${responseData.status}`);
                        }
                    },
                    header: function (headerName) {
                        if (!responseData.headers[headerName]) {
                            throw new Error(`Expected header '${headerName}' not found`);
                        }
                    },
                    jsonBody: function (path, value) {
                        const actual = getValueByPath(responseData.body, path);
                        if (actual !== value) {
                            throw new Error(`Expected ${path} to be ${value}, got ${actual}`);
                        }
                    }
                },
                be: {
                    ok: function () {
                        if (responseData.status >= 400) {
                            throw new Error(`Expected successful response, got ${responseData.status}`);
                        }
                    }
                }
            },

            json: function () {
                if (typeof responseData.body !== 'object' || responseData.body === null) {
                    throw new Error('Response is not JSON');
                }
                return responseData.body;
            },

            text: function () {
                return responseData.bodyText;
            }
        },

        expect: function (value) {
            return {
                to: {
                    have: {
                        property: function (prop) {
                            if (typeof value !== 'object' || !(prop in value)) {
                                throw new Error(`Expected object to have property '${prop}'`);
                            }
                            return {
                                with: {
                                    value: function (expectedValue) {
                                        if (value[prop] !== expectedValue) {
                                            throw new Error(`Expected ${prop} to be ${expectedValue}, got ${value[prop]}`);
                                        }
                                    }
                                }
                            };
                        }
                    },
                    equal: function (expected) {
                        if (value !== expected) {
                            throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
                        }
                    },
                    include: function (substring) {
                        if (typeof value !== 'string' || !value.includes(substring)) {
                            throw new Error(`Expected '${value}' to include '${substring}'`);
                        }
                    },
                    be: {
                        a: function (type) {
                            const actualType = Array.isArray(value) ? 'array' : typeof value;
                            if (actualType !== type) {
                                throw new Error(`Expected ${type}, got ${actualType}`);
                            }
                        }
                    }
                }
            };
        },

        variables: {
            get: function (key) {
                return getVariable(key);
            },
            set: async function (key, value) {
                await setVariable('environment', key, value);
            }
        }
    };
}


function displayTestResults(results) {
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


// Utility functions
function getValueByPath(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

function getVariable(key) {
    // Priority: Environment > Collection > Global
    if (variables.environment[key]) {
        const val = variables.environment[key];
        return typeof val === 'object' ? val.value : val;
    }
    if (currentCollection && variables.collection[currentCollection]?.[key]) {
        const val = variables.collection[currentCollection][key];
        return typeof val === 'object' ? val.value : val;
    }
    if (variables.global[key]) {
        const val = variables.global[key];
        return typeof val === 'object' ? val.value : val;
    }
    return undefined;
}

async function setVariable(scope, key, value) {
    const varData = { value, description: '' };

    switch (scope) {
        case 'global':
            variables.global[key] = varData;
            await chrome.storage.local.set({
                variables: {
                    global: variables.global,
                    collection: variables.collection
                }
            });
            break;
        case 'environment':
            if (currentEnvironment) {
                variables.environment[key] = varData;
                await chrome.storage.local.set({
                    [`env_${currentEnvironment}`]: variables.environment
                });
            }
            break;
    }
}


function showLoading(show) {
    const sendBtn = document.getElementById('sendBtn');
    if (show) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
    } else {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// Modal handlers
function setupModalHandlers() {
    const modal = document.getElementById('importExportModal');
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
    const fileInput = document.getElementById('importFile');
    const fileDropZone = document.getElementById('fileDropZone');

    fileInput.addEventListener('change', handleFileSelect);

    fileDropZone.addEventListener('click', function () {
        fileInput.click();
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

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect({ target: { files } });
        }
    });

    // Import submit
    document.getElementById('importSubmitBtn').addEventListener('click', handleImport);
}

function updateAuthData() {
    const authType = currentRequest.auth.type;
    currentRequest.auth = { type: authType };

    switch (authType) {
        case 'basic':
            currentRequest.auth.username = document.getElementById('authUsername')?.value || '';
            currentRequest.auth.password = document.getElementById('authPassword')?.value || '';
            break;

        case 'bearer':
            currentRequest.auth.token = document.getElementById('authToken')?.value || '';
            break;

        case 'apikey':
            currentRequest.auth.key = document.getElementById('authKey')?.value || '';
            currentRequest.auth.value = document.getElementById('authValue')?.value || '';
            currentRequest.auth.addTo = document.getElementById('authAddTo')?.value || 'header';
            break;

        case 'oauth2':
            currentRequest.auth.accessToken = document.getElementById('authAccessToken')?.value || '';
            currentRequest.auth.tokenType = document.getElementById('authTokenType')?.value || 'Bearer';
            break;
    }
}


// Body type handling
function handleBodyTypeChange(event) {
    const bodyType = event.target.value;
    const rawBody = document.getElementById('rawBody');
    const formDataContainer = document.getElementById('formDataContainer');

    // Hide all body editors
    rawBody.style.display = 'none';
    formDataContainer.style.display = 'none';

    // Show appropriate editor
    switch (bodyType) {
        case 'raw':
            rawBody.style.display = 'block';
            break;
        case 'form-data':
        case 'urlencoded':
            formDataContainer.style.display = 'block';
            if (!formDataContainer.children.length) {
                addKeyValueRow(formDataContainer, 'body');
            }
            break;
    }
}


function processVariables(request) {
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

// Notification system
function showNotification(message, type = 'info') {
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

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

// Setup all event listeners
function setupEventListeners() {
    // Send button
    document.getElementById('sendBtn').addEventListener('click', sendRequest);

    // Method and URL changes
    document.getElementById('methodSelect').addEventListener('change', function (e) {
        currentRequest.method = e.target.value;
    });

    document.getElementById('urlInput').addEventListener('input', function (e) {
        currentRequest.url = e.target.value;
    });

    // Import/Export buttons
    document.getElementById('importBtn').addEventListener('click', openImportModal);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('settingsBtn').addEventListener('click', openSettings);

    // Collection management
    document.getElementById('newCollectionBtn').addEventListener('click', createNewCollection);

    // History management
    document.getElementById('historySearch').addEventListener('input', filterHistory);
    document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);

    // Interceptor controls
    document.getElementById('startInterceptorBtn').addEventListener('click', startInterceptor);
    document.getElementById('stopInterceptorBtn').addEventListener('click', stopInterceptor);

    // Body type selection
    document.querySelectorAll('input[name="bodyType"]').forEach(radio => {
        radio.addEventListener('change', handleBodyTypeChange);
    });

    // Raw body input
    document.getElementById('rawBody').addEventListener('input', function (e) {
        currentRequest.body = e.target.value;
    });
}



// コレクション管理の改善
function renderCollections() {
    const container = document.getElementById('collectionsContainer');

    if (collections.length === 0) {
        container.innerHTML = '<p class="empty-message">No collections created</p>';
        return;
    }

    container.innerHTML = '';
    collections.forEach(collection => {
        const item = document.createElement('div');
        item.className = 'collection-item';
        item.dataset.id = collection.id;
        if (currentCollection == collection.id) {
            item.classList.add('active');
        }

        item.innerHTML = `
            <div class="collection-name">${escapeHtml(collection.name)}</div>
            <div class="collection-meta">${collection.requests?.length || 0} requests</div>
        `;

        item.addEventListener('click', function () {
            selectCollection(collection.id);
        });

        container.appendChild(item);
    });
}

function selectCollection(collectionId) {
    currentCollection = collectionId;
    chrome.storage.local.set({ currentCollection });

    document.querySelectorAll('.collection-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id == collectionId);
    });

    renderCollectionRequests(collectionId);

    const collectionVarSelect = document.getElementById('collectionVarSelect');
    if (collectionVarSelect) {
        collectionVarSelect.value = collectionId;
        renderVariables('collection');
    }
}


function renderCollectionRequests(collectionId) {
    const collection = collections.find(c => c.id == collectionId);
    if (!collection) return;

    const header = document.getElementById('collectionRequestsHeader');
    const container = document.getElementById('collectionRequestsContainer');

    header.innerHTML = `
        <h4>${escapeHtml(collection.name)}</h4>
        <button class="btn btn-sm addRequestToCollection">Add Request</button>
    `;

    // 2) DOM に挿入後、必ず addEventListener を使ってイベントハンドラを登録する
    const btn = header.querySelector('.addRequestToCollection');
    btn.addEventListener('click', () => {
        addRequestToCollection(collectionId);
    });

    container.innerHTML = '';

    if (!collection.requests || collection.requests.length === 0) {
        container.innerHTML = '<p class="empty-message">No requests in this collection</p>';
        return;
    }

    collection.requests.forEach((request, index) => {
        const requestItem = document.createElement('div');
        requestItem.className = 'collection-request';
        requestItem.innerHTML = `
            <span class="request-method-badge method-${request.method}">${request.method}</span>
            <span class="request-name">${escapeHtml(request.name || 'Untitled Request')}</span>
            <span class="request-url">${escapeHtml(request.url)}</span>
            <div class="request-actions">
                <button class="btn-icon edit-btn">✏️</button>
                <button class="btn-icon delete-btn">🗑️</button>
            </div>
        `;

        // DOM 追加後にそれぞれイベントを設定
        const editBtn = requestItem.querySelector('.edit-btn');
        editBtn.addEventListener('click', () => {
            editCollectionRequest(collectionId, index);
        });

        const deleteBtn = requestItem.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            deleteCollectionRequest(collectionId, index);
        });


        requestItem.addEventListener('click', function (e) {
            if (!e.target.closest('.request-actions')) {
                loadCollectionRequest(request);
            }
        });

        container.appendChild(requestItem);
    });
}

function loadCollectionRequest(request) {
    currentRequest = JSON.parse(JSON.stringify(request));

    document.getElementById('methodSelect').value = request.method;
    document.getElementById('urlInput').value = request.url;

    // Headers
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

    // Params
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

    // Body
    if (request.body) {
        if (typeof request.body === 'string') {
            document.querySelector('input[name="bodyType"][value="raw"]').checked = true;
            handleBodyTypeChange({ target: { value: 'raw' } });
            document.getElementById('rawBody').value = request.body;
        } else if (typeof request.body === 'object') {
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

    // Auth
    if (request.auth) {
        document.getElementById('authType').value = request.auth.type || 'none';
        renderAuthDetails(request.auth.type);

        // Populate auth fields
        switch (request.auth.type) {
            case 'basic':
                if (document.getElementById('authUsername')) {
                    document.getElementById('authUsername').value = request.auth.username || '';
                }
                if (document.getElementById('authPassword')) {
                    document.getElementById('authPassword').value = request.auth.password || '';
                }
                break;
            case 'bearer':
                if (document.getElementById('authToken')) {
                    document.getElementById('authToken').value = request.auth.token || '';
                }
                break;
            case 'apikey':
                if (document.getElementById('authKey')) {
                    document.getElementById('authKey').value = request.auth.key || '';
                }
                if (document.getElementById('authValue')) {
                    document.getElementById('authValue').value = request.auth.value || '';
                }
                if (document.getElementById('authAddTo')) {
                    document.getElementById('authAddTo').value = request.auth.addTo || 'header';
                }
                break;
            case 'oauth2':
                if (document.getElementById('authAccessToken')) {
                    document.getElementById('authAccessToken').value = request.auth.accessToken || '';
                }
                if (document.getElementById('authTokenType')) {
                    document.getElementById('authTokenType').value = request.auth.tokenType || 'Bearer';
                }
                break;
        }

        updateAuthData();
    }

    // Switch to request tab
    switchMainTab('request');

    showSuccess('Request loaded from collection');
}

window.addRequestToCollection = async function (collectionId) {
    const name = prompt('Enter request name:');
    if (!name) return;

    const collection = collections.find(c => c.id == collectionId);
    if (!collection) return;

    if (!collection.requests) {
        collection.requests = [];
    }

    const newRequest = {
        id: Date.now(),
        name: name,
        method: 'GET',
        url: '',
        headers: {},
        params: {},
        body: null,
        auth: { type: 'none' }
    };

    collection.requests.push(newRequest);
    await chrome.storage.local.set({ collections });

    renderCollectionRequests(collectionId);
    loadCollectionRequest(newRequest);
};

window.editCollectionRequest = async function (collectionId, requestIndex) {
    const collection = collections.find(c => c.id == collectionId);
    if (!collection || !collection.requests || !collection.requests[requestIndex]) return;

    const request = collection.requests[requestIndex];
    const newName = prompt('Edit request name:', request.name);

    if (newName && newName !== request.name) {
        request.name = newName;
        await chrome.storage.local.set({ collections });
        renderCollectionRequests(collectionId);
        showSuccess('Request renamed');
    }
};

window.deleteCollectionRequest = async function (collectionId, requestIndex) {
    if (!confirm('Delete this request?')) return;

    const collection = collections.find(c => c.id == collectionId);
    if (!collection || !collection.requests) return;

    collection.requests.splice(requestIndex, 1);
    await chrome.storage.local.set({ collections });

    renderCollectionRequests(collectionId);
    showSuccess('Request deleted');
};

// History functions with complete request data
async function saveToHistory(request, response) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        request: {
            method: request.method,
            url: request.url,
            headers: request.headers,
            params: request.params,
            body: request.body,
            auth: request.auth
        },
        response: {
            status: response.status,
            duration: response.duration,
            size: response.size
        }
    };

    history.unshift(historyItem);

    if (history.length > 100) {
        history = history.slice(0, 100);
    }

    await chrome.storage.local.set({ history });
    renderHistory();
}


// 履歴からリクエストを復元
function loadHistoryItem(historyId) {
    const item = history.find(h => h.id == historyId);
    if (!item || !item.request) return;

    loadCollectionRequest(item.request); // 同じロジックを再利用
    showSuccess('Request loaded from history');
}

// Notification system
function showNotification(message, type = 'info') {
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

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

// 修正されたreplaceVariables関数
function replaceVariables(text) {
    if (typeof text !== 'string') return text;

    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmedName = varName.trim();
        let value;

        // Priority: Environment > Collection > Global
        if (variables.environment[trimmedName]) {
            const envVar = variables.environment[trimmedName];
            value = typeof envVar === 'object' ? envVar.value : envVar;
        } else if (currentCollection && variables.collection[currentCollection]?.[trimmedName]) {
            const colVar = variables.collection[currentCollection][trimmedName];
            value = typeof colVar === 'object' ? colVar.value : colVar;
        } else if (variables.global[trimmedName]) {
            const globalVar = variables.global[trimmedName];
            value = typeof globalVar === 'object' ? globalVar.value : globalVar;
        }

        return value !== undefined ? value : match;
    });
}

// Deep replace for objects
function deepReplaceVariables(obj) {
    if (typeof obj === 'string') {
        return replaceVariables(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(deepReplaceVariables);
    }
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            // Replace both key and value
            const newKey = replaceVariables(key);
            result[newKey] = deepReplaceVariables(value);
        }
        return result;
    }
    return obj;
}

// Process variables with deep replacement
function processVariables(request) {
    const processed = JSON.parse(JSON.stringify(request));

    // Process URL
    processed.url = replaceVariables(processed.url);

    // Process headers
    processed.headers = deepReplaceVariables(processed.headers);

    // Process params
    processed.params = deepReplaceVariables(processed.params);

    // Process body
    if (processed.body) {
        if (typeof processed.body === 'string') {
            processed.body = replaceVariables(processed.body);
        } else {
            processed.body = deepReplaceVariables(processed.body);
        }
    }

    // Build final URL with params
    const url = new URL(processed.url);
    Object.entries(processed.params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    // Add API key to query if needed
    if (processed.auth.type === 'apikey' && processed.auth.addTo === 'query') {
        url.searchParams.set(processed.auth.key, processed.auth.value);
    }

    processed.url = url.toString();

    return processed;
}

// 修正されたhistory表示関数
function renderHistory() {
    const container = document.getElementById('historyContainer');

    if (history.length === 0) {
        container.innerHTML = '<p class="empty-message">No request history</p>';
        return;
    }

    container.innerHTML = '';
    history.forEach(item => {
        const historyDiv = document.createElement('div');
        historyDiv.className = 'history-item';
        historyDiv.dataset.id = item.id;

        const method = item.request?.method || item.method || 'GET';
        const url = item.request?.url || item.url || '';
        const status = item.response?.status || item.status || 0;

        historyDiv.innerHTML = `
            <span class="history-method method-${method}">${method}</span>
            <span class="history-url">${escapeHtml(url)}</span>
            <span class="history-status status-${status < 400 ? 'success' : 'error'}">${status || 'N/A'}</span>
            <span class="history-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
        `;

        historyDiv.addEventListener('click', function () {
            loadHistoryItem(this.dataset.id);
        });

        container.appendChild(historyDiv);
    });
}

function loadHistoryItem(historyId) {
    const item = history.find(h => h.id == historyId);
    if (!item || !item.request) return;

    loadCollectionRequest(item.request);
    showSuccess('Request loaded from history');
}

// Variable Management Functions
async function initializeVariablesManagement() {
    try {
        renderEnvironmentSelector();
        setupVariableEventListeners();
        updateCollectionVarSelector();
        renderAllVariables();

        console.log('Variables management initialized');
    } catch (error) {
        console.error('Error initializing variables management:', error);
    }
}

function setupVariableEventListeners() {
    document.getElementById('newEnvironmentBtn').addEventListener('click', createNewEnvironment);
    document.getElementById('editEnvironmentBtn').addEventListener('click', editCurrentEnvironment);
    document.getElementById('environmentSelect').addEventListener('change', switchEnvironment);

    document.getElementById('addGlobalVarBtn').addEventListener('click', () => addVariableRow('global'));
    document.getElementById('addEnvVarBtn').addEventListener('click', () => addVariableRow('environment'));
    document.getElementById('addCollectionVarBtn').addEventListener('click', () => addVariableRow('collection'));

    document.getElementById('collectionVarSelect').addEventListener('change', function () {
        currentCollection = this.value;
        renderVariables('collection');
    });
}

async function createNewEnvironment() {
    const name = prompt('Enter environment name:');
    if (!name) return;

    const env = {
        id: Date.now().toString(),
        name: name,
        created: new Date().toISOString()
    };

    environments.push(env);
    await chrome.storage.local.set({ environments });

    await chrome.storage.local.set({ [`env_${env.id}`]: {} });

    renderEnvironmentSelector();
    document.getElementById('environmentSelect').value = env.id;
    await switchEnvironment();

    showSuccess('Environment created: ' + name);
}

async function editCurrentEnvironment() {
    if (!currentEnvironment) {
        showError('No environment selected');
        return;
    }

    const env = environments.find(e => e.id === currentEnvironment);
    if (!env) return;

    const newName = prompt('Edit environment name:', env.name);
    if (!newName || newName === env.name) return;

    env.name = newName;
    await chrome.storage.local.set({ environments });
    renderEnvironmentSelector();

    showSuccess('Environment renamed to: ' + newName);
}

async function switchEnvironment() {
    const envId = document.getElementById('environmentSelect').value;

    if (currentEnvironment) {
        await chrome.storage.local.set({ [`env_${currentEnvironment}`]: variables.environment });
    }

    currentEnvironment = envId;
    await chrome.storage.local.set({ currentEnvironment });

    if (envId) {
        const envData = await chrome.storage.local.get([`env_${envId}`]);
        variables.environment = envData[`env_${envId}`] || {};
    } else {
        variables.environment = {};
    }

    renderVariables('environment');

    const envName = envId ? environments.find(e => e.id === envId)?.name : 'No Environment';
    showSuccess('Switched to: ' + envName);
}

function renderEnvironmentSelector() {
    const select = document.getElementById('environmentSelect');
    const currentValue = select.value;

    select.innerHTML = '<option value="">No Environment</option>';

    environments.forEach(env => {
        const option = document.createElement('option');
        option.value = env.id;
        option.textContent = env.name;
        if (env.id === currentEnvironment) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function updateCollectionVarSelector() {
    const select = document.getElementById('collectionVarSelect');
    select.innerHTML = '<option value="">Select Collection</option>';

    collections.forEach(collection => {
        const option = document.createElement('option');
        option.value = collection.id;
        option.textContent = collection.name;
        if (collection.id == currentCollection) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function renderAllVariables() {
    renderVariables('global');
    renderVariables('environment');
    renderVariables('collection');
}

function renderVariables(scope) {
    let container, data;

    switch (scope) {
        case 'global':
            container = document.getElementById('globalVariablesContainer');
            data = variables.global || {};
            break;

        case 'environment':
            container = document.getElementById('envVariablesContainer');
            if (!currentEnvironment) {
                container.innerHTML = '<p class="empty-message">Select an environment to manage variables</p>';
                return;
            }
            data = variables.environment || {};
            break;

        case 'collection':
            container = document.getElementById('collectionVariablesContainer');
            const selectedCollection = document.getElementById('collectionVarSelect').value;
            if (!selectedCollection) {
                container.innerHTML = '<p class="empty-message">Select a collection to manage variables</p>';
                return;
            }
            data = variables.collection[selectedCollection] || {};
            break;
    }

    container.innerHTML = '';

    const headerRow = document.createElement('div');
    headerRow.className = 'variable-header-row';
    headerRow.innerHTML = `
        <span>Variable</span>
        <span>Value</span>
        <span>Description</span>
        <span></span>
    `;
    container.appendChild(headerRow);

    const entries = Object.entries(data);
    if (entries.length === 0) {
        const emptyRow = document.createElement('div');
        emptyRow.className = 'empty-variables';
        emptyRow.innerHTML = '<p>No variables defined. Click "Add" to create one.</p>';
        container.appendChild(emptyRow);
    } else {
        entries.forEach(([key, value]) => {
            const varData = typeof value === 'object' ? value : { value: value, description: '' };
            const row = createVariableRow(scope, key, varData.value, varData.description);
            container.appendChild(row);
        });
    }
}

function createVariableRow(scope, key = '', value = '', description = '') {
    const row = document.createElement('div');
    row.className = 'variable-row';
    row.dataset.originalKey = key;

    row.innerHTML = `
        <input type="text" class="var-key" placeholder="Variable name" value="${escapeHtml(key)}">
        <input type="text" class="var-value" placeholder="Value" value="${escapeHtml(value)}">
        <input type="text" class="var-description" placeholder="Description" value="${escapeHtml(description)}">
        <button class="delete-btn">×</button>
    `;

    const keyInput = row.querySelector('.var-key');
    const valueInput = row.querySelector('.var-value');
    const descInput = row.querySelector('.var-description');
    const deleteBtn = row.querySelector('.delete-btn');

    const updateVariable = async () => {
        const newKey = keyInput.value.trim();
        const newValue = valueInput.value;
        const newDesc = descInput.value;
        const originalKey = row.dataset.originalKey;

        if (!newKey) {
            if (originalKey) {
                await deleteVariable(scope, originalKey);
                row.remove();
            }
            return;
        }

        if (newKey !== originalKey && variableExists(scope, newKey)) {
            showError(`Variable "${newKey}" already exists in this scope`);
            keyInput.value = originalKey;
            return;
        }

        if (originalKey && originalKey !== newKey) {
            await deleteVariable(scope, originalKey);
        }

        await saveVariable(scope, newKey, newValue, newDesc);
        row.dataset.originalKey = newKey;
    };

    keyInput.addEventListener('blur', updateVariable);
    valueInput.addEventListener('blur', updateVariable);
    descInput.addEventListener('blur', updateVariable);

    deleteBtn.addEventListener('click', async () => {
        const keyToDelete = row.dataset.originalKey || keyInput.value.trim();
        if (keyToDelete) {
            if (confirm(`Delete variable "${keyToDelete}"?`)) {
                await deleteVariable(scope, keyToDelete);
                row.remove();
                showSuccess(`Variable "${keyToDelete}" deleted`);
            }
        } else {
            row.remove();
        }
    });

    return row;
}

function variableExists(scope, key) {
    switch (scope) {
        case 'global':
            return key in variables.global;
        case 'environment':
            return key in variables.environment;
        case 'collection':
            const selectedCollection = document.getElementById('collectionVarSelect').value;
            return selectedCollection && variables.collection[selectedCollection] &&
                key in variables.collection[selectedCollection];
    }
    return false;
}

async function saveVariable(scope, key, value, description) {
    const varData = { value, description };

    switch (scope) {
        case 'global':
            variables.global[key] = varData;
            await chrome.storage.local.set({
                variables: {
                    global: variables.global,
                    collection: variables.collection
                }
            });
            break;

        case 'environment':
            if (!currentEnvironment) return;
            variables.environment[key] = varData;
            await chrome.storage.local.set({
                [`env_${currentEnvironment}`]: variables.environment
            });
            break;

        case 'collection':
            const selectedCollection = document.getElementById('collectionVarSelect').value;
            if (!selectedCollection) return;

            if (!variables.collection[selectedCollection]) {
                variables.collection[selectedCollection] = {};
            }
            variables.collection[selectedCollection][key] = varData;

            await chrome.storage.local.set({
                variables: {
                    global: variables.global,
                    collection: variables.collection
                }
            });
            break;
    }
}

async function deleteVariable(scope, key) {
    switch (scope) {
        case 'global':
            delete variables.global[key];
            await chrome.storage.local.set({
                variables: {
                    global: variables.global,
                    collection: variables.collection
                }
            });
            break;

        case 'environment':
            if (!currentEnvironment) return;
            delete variables.environment[key];
            await chrome.storage.local.set({
                [`env_${currentEnvironment}`]: variables.environment
            });
            break;

        case 'collection':
            const selectedCollection = document.getElementById('collectionVarSelect').value;
            if (selectedCollection && variables.collection[selectedCollection]) {
                delete variables.collection[selectedCollection][key];
                await chrome.storage.local.set({
                    variables: {
                        global: variables.global,
                        collection: variables.collection
                    }
                });
            }
            break;
    }
}

function addVariableRow(scope) {
    if (scope === 'environment' && !currentEnvironment) {
        showError('Please select an environment first');
        return;
    }

    if (scope === 'collection' && !document.getElementById('collectionVarSelect').value) {
        showError('Please select a collection first');
        return;
    }

    let container;
    switch (scope) {
        case 'global':
            container = document.getElementById('globalVariablesContainer');
            break;
        case 'environment':
            container = document.getElementById('envVariablesContainer');
            break;
        case 'collection':
            container = document.getElementById('collectionVariablesContainer');
            break;
    }

    const emptyMsg = container.querySelector('.empty-variables');
    if (emptyMsg) {
        emptyMsg.remove();
    }

    const row = createVariableRow(scope);
    container.appendChild(row);

    row.querySelector('.var-key').focus();
}