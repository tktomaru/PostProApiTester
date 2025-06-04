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
document.addEventListener('DOMContentLoaded', function() {
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

// 統合されたストレージ読み込み関数
async function loadAllStoredData() {
    try {
        // すべての必要なデータを一度に読み込む
        const result = await chrome.storage.local.get([
            'collections',
            'history',
            'variables',
            'environments',
            'currentEnvironment',
            'currentCollection',
            'settings'
        ]);
        
        // Collections
        if (result.collections) {
            collections = result.collections;
        }
        
        // History
        if (result.history) {
            history = result.history;
        }
        
        // Variables - グローバル変数のみ
        if (result.variables?.global) {
            variables.global = result.variables.global;
        }
        
        // Environments
        if (result.environments) {
            environments = result.environments;
        }
        
        // Current environment
        if (result.currentEnvironment) {
            currentEnvironment = result.currentEnvironment;
            // 環境変数を読み込む
            const envData = await chrome.storage.local.get([`env_${currentEnvironment}`]);
            if (envData[`env_${currentEnvironment}`]) {
                variables.environment = envData[`env_${currentEnvironment}`];
            }
        }
        
        // Current collection
        if (result.currentCollection) {
            currentCollection = result.currentCollection;
        }
        
        // Collection variables
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
        if (currentCollection === collection.id) {
            item.classList.add('active');
        }
        
        item.innerHTML = `
            <div class="collection-name">${escapeHtml(collection.name)}</div>
            <div class="collection-meta">${collection.requests?.length || 0} requests</div>
        `;
        
        // クリックイベントを追加
        item.addEventListener('click', function() {
            selectCollection(collection.id);
        });
        
        container.appendChild(item);
    });
}

// コレクション選択機能
function selectCollection(collectionId) {
    currentCollection = collectionId;
    chrome.storage.local.set({ currentCollection });
    
    // UIを更新
    document.querySelectorAll('.collection-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === collectionId);
    });
    
    // コレクション内のリクエストを表示
    renderCollectionRequests(collectionId);
    
    // 変数タブのコレクション選択も更新
    const collectionVarSelect = document.getElementById('collectionVarSelect');
    if (collectionVarSelect) {
        collectionVarSelect.value = collectionId;
        renderVariables('collection');
    }
}

// コレクション内リクエストの表示
function renderCollectionRequests(collectionId) {
    const collection = collections.find(c => c.id == collectionId);
    if (!collection) return;
    
    const header = document.getElementById('collectionRequestsHeader');
    const container = document.getElementById('collectionRequestsContainer');
    
    header.innerHTML = `
        <h4>${escapeHtml(collection.name)}</h4>
        <button class="btn btn-sm" onclick="addRequestToCollection('${collectionId}')">Add Request</button>
    `;
    
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
                <button class="btn-icon" onclick="editCollectionRequest('${collectionId}', ${index})">✏️</button>
                <button class="btn-icon" onclick="deleteCollectionRequest('${collectionId}', ${index})">🗑️</button>
            </div>
        `;
        
        requestItem.addEventListener('click', function(e) {
            if (!e.target.closest('.request-actions')) {
                loadCollectionRequest(request);
            }
        });
        
        container.appendChild(requestItem);
    });
}

// コレクションリクエストを現在のエディタに読み込む
function loadCollectionRequest(request) {
    currentRequest = JSON.parse(JSON.stringify(request)); // Deep copy
    
    // UIに反映
    document.getElementById('methodSelect').value = request.method;
    document.getElementById('urlInput').value = request.url;
    
    // Headers
    const headersContainer = document.getElementById('headersContainer');
    headersContainer.innerHTML = '';
    if (request.headers) {
        Object.entries(request.headers).forEach(([key, value]) => {
            addKeyValueRow(headersContainer, 'header');
            const rows = headersContainer.querySelectorAll('.key-value-row');
            const lastRow = rows[rows.length - 1];
            lastRow.querySelector('.key-input').value = key;
            lastRow.querySelector('.value-input').value = value;
        });
    }
    
    // Params
    const paramsContainer = document.getElementById('paramsContainer');
    paramsContainer.innerHTML = '';
    if (request.params) {
        Object.entries(request.params).forEach(([key, value]) => {
            addKeyValueRow(paramsContainer, 'param');
            const rows = paramsContainer.querySelectorAll('.key-value-row');
            const lastRow = rows[rows.length - 1];
            lastRow.querySelector('.key-input').value = key;
            lastRow.querySelector('.value-input').value = value;
        });
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
            // Form data handling...
        }
    }
    
    // Auth
    if (request.auth) {
        document.getElementById('authType').value = request.auth.type || 'none';
        renderAuthDetails(request.auth.type);
        // Populate auth fields...
    }
    
    // Switch to request tab
    switchMainTab('request');
    
    showSuccess('Request loaded from collection');
}

// コレクションに新しいリクエストを追加
window.addRequestToCollection = async function(collectionId) {
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

// コレクションリクエストの削除
window.deleteCollectionRequest = async function(collectionId, requestIndex) {
    if (!confirm('Delete this request?')) return;
    
    const collection = collections.find(c => c.id == collectionId);
    if (!collection || !collection.requests) return;
    
    collection.requests.splice(requestIndex, 1);
    await chrome.storage.local.set({ collections });
    
    renderCollectionRequests(collectionId);
};

// 履歴機能の改善 - 完全な情報を保存
async function saveToHistory(request, response) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        // 完全なリクエスト情報を保存
        request: {
            method: request.method,
            url: request.url,
            headers: request.headers,
            params: request.params,
            body: request.body,
            auth: request.auth
        },
        // レスポンス情報
        response: {
            status: response.status,
            duration: response.duration,
            size: response.size
        }
    };
    
    history.unshift(historyItem);
    
    // Keep only last 100 items
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
        
        historyDiv.innerHTML = `
            <span class="history-method method-${item.request?.method || item.method}">${item.request?.method || item.method}</span>
            <span class="history-url">${escapeHtml(item.request?.url || item.url)}</span>
            <span class="history-status status-${(item.response?.status || item.status) < 400 ? 'success' : 'error'}">${item.response?.status || item.status || 'N/A'}</span>
            <span class="history-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
        `;
        
        historyDiv.addEventListener('click', function() {
            loadHistoryItem(this.dataset.id);
        });
        
        container.appendChild(historyDiv);
    });
}

// 変数管理機能の修正版実装

// Initialize variables management - 修正版
async function initializeVariablesManagement() {
    try {
        // 環境をロード（すでにloadAllStoredDataで読み込み済み）
        renderEnvironmentSelector();
        
        // イベントリスナーを設定
        setupVariableEventListeners();
        
        // コレクションセレクタを更新
        updateCollectionVarSelector();
        
        // すべての変数を表示
        renderAllVariables();
        
        console.log('Variables management initialized');
    } catch (error) {
        console.error('Error initializing variables management:', error);
    }
}

// Setup event listeners for variables
function setupVariableEventListeners() {
    // Environment management
    document.getElementById('newEnvironmentBtn').addEventListener('click', createNewEnvironment);
    document.getElementById('editEnvironmentBtn').addEventListener('click', editCurrentEnvironment);
    document.getElementById('environmentSelect').addEventListener('change', switchEnvironment);
    
    // Add variable buttons
    document.getElementById('addGlobalVarBtn').addEventListener('click', () => addVariableRow('global'));
    document.getElementById('addEnvVarBtn').addEventListener('click', () => addVariableRow('environment'));
    document.getElementById('addCollectionVarBtn').addEventListener('click', () => addVariableRow('collection'));
    
    // Collection selector
    document.getElementById('collectionVarSelect').addEventListener('change', function() {
        currentCollection = this.value;
        renderVariables('collection');
    });
}

// Create new environment
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
    
    // Initialize empty variables for this environment
    await chrome.storage.local.set({ [`env_${env.id}`]: {} });
    
    renderEnvironmentSelector();
    document.getElementById('environmentSelect').value = env.id;
    await switchEnvironment();
    
    showSuccess('Environment created: ' + name);
}

// Edit current environment name
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

// Switch environment - 修正版
async function switchEnvironment() {
    const envId = document.getElementById('environmentSelect').value;
    
    // Save current environment variables if any
    if (currentEnvironment) {
        await chrome.storage.local.set({ [`env_${currentEnvironment}`]: variables.environment });
    }
    
    // Update current environment
    currentEnvironment = envId;
    await chrome.storage.local.set({ currentEnvironment });
    
    // Load new environment variables
    if (envId) {
        const envData = await chrome.storage.local.get([`env_${envId}`]);
        variables.environment = envData[`env_${envId}`] || {};
    } else {
        variables.environment = {};
    }
    
    // Re-render environment variables
    renderVariables('environment');
    
    const envName = envId ? environments.find(e => e.id === envId)?.name : 'No Environment';
    showSuccess('Switched to: ' + envName);
}

// Render environment selector
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

// Update collection variable selector
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

// Render all variables
function renderAllVariables() {
    renderVariables('global');
    renderVariables('environment');
    renderVariables('collection');
}

// Render variables for a specific scope - 修正版
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
    
    // Add header row
    const headerRow = document.createElement('div');
    headerRow.className = 'variable-header-row';
    headerRow.innerHTML = `
        <span>Variable</span>
        <span>Value</span>
        <span>Description</span>
        <span></span>
    `;
    container.appendChild(headerRow);
    
    // Add variable rows
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

// Create variable row element - 修正版
function createVariableRow(scope, key = '', value = '', description = '') {
    const row = document.createElement('div');
    row.className = 'variable-row';
    row.dataset.originalKey = key; // Store original key
    
    row.innerHTML = `
        <input type="text" class="var-key" placeholder="Variable name" value="${escapeHtml(key)}">
        <input type="text" class="var-value" placeholder="Value" value="${escapeHtml(value)}">
        <input type="text" class="var-description" placeholder="Description" value="${escapeHtml(description)}">
        <button class="delete-btn">×</button>
    `;
    
    // Add event listeners
    const keyInput = row.querySelector('.var-key');
    const valueInput = row.querySelector('.var-value');
    const descInput = row.querySelector('.var-description');
    const deleteBtn = row.querySelector('.delete-btn');
    
    // Update on blur
    const updateVariable = async () => {
        const newKey = keyInput.value.trim();
        const newValue = valueInput.value;
        const newDesc = descInput.value;
        const originalKey = row.dataset.originalKey;
        
        if (!newKey) {
            if (originalKey) {
                // If key is empty but we had a key before, delete it
                await deleteVariable(scope, originalKey);
                row.remove();
            }
            return;
        }
        
        // Check for duplicate keys
        if (newKey !== originalKey && variableExists(scope, newKey)) {
            showError(`Variable "${newKey}" already exists in this scope`);
            keyInput.value = originalKey;
            return;
        }
        
        // Delete old key if renamed
        if (originalKey && originalKey !== newKey) {
            await deleteVariable(scope, originalKey);
        }
        
        // Save new/updated variable
        await saveVariable(scope, newKey, newValue, newDesc);
        row.dataset.originalKey = newKey; // Update stored key
    };
    
    keyInput.addEventListener('blur', updateVariable);
    valueInput.addEventListener('blur', updateVariable);
    descInput.addEventListener('blur', updateVariable);
    
    // Delete button
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

// Check if variable exists in scope
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

// Save variable - 修正版
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

// Delete variable - 修正版
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

// Add new variable row
function addVariableRow(scope) {
    // Check if scope is available
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
    
    // Remove empty message if exists
    const emptyMsg = container.querySelector('.empty-variables');
    if (emptyMsg) {
        emptyMsg.remove();
    }
    
    const row = createVariableRow(scope);
    container.appendChild(row);
    
    // Focus on key input
    row.querySelector('.var-key').focus();
}

// CSS for empty variables message
const style = document.createElement('style');
style.textContent = `
    .empty-variables {
        grid-column: 1 / -1;
        text-align: center;
        padding: 20px;
        color: #6c757d;
        font-style: italic;
    }
`;
document.head.appendChild(style);