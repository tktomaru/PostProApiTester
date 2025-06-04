// Global state management
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
let isInterceptorActive = false;

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Main initialization function
function initializeApp() {
    setupEventListeners();
    loadStoredData();
    setupTabSwitching();
    initializeKeyValueEditors();
    setupAuthHandlers();
    setupModalHandlers();
}

// Setup all event listeners
function setupEventListeners() {
    // Send button
    document.getElementById('sendBtn').addEventListener('click', sendRequest);
    
    // Method and URL changes
    document.getElementById('methodSelect').addEventListener('change', function(e) {
        currentRequest.method = e.target.value;
    });
    
    document.getElementById('urlInput').addEventListener('input', function(e) {
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
    document.getElementById('rawBody').addEventListener('input', function(e) {
        currentRequest.body = e.target.value;
    });
}

// Tab switching functionality
function setupTabSwitching() {
    // Main tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchMainTab(tabName);
        });
    });
    
    // Sub tabs (request details)
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const subtabName = this.dataset.subtab;
            switchSubTab(subtabName);
        });
    });
    
    // Response tabs
    document.querySelectorAll('.response-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const restabName = this.dataset.restab;
            switchResponseTab(restabName);
        });
    });
    
    // Response format buttons
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', function() {
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
    addKeyValueRow(container, 'param');
}

function initializeHeadersEditor() {
    const container = document.getElementById('headersContainer');
    addKeyValueRow(container, 'header');
}

function setupAddButtons() {
    document.querySelector('.add-param').addEventListener('click', function() {
        const container = document.getElementById('paramsContainer');
        addKeyValueRow(container, 'param');
    });
    
    document.querySelector('.add-header').addEventListener('click', function() {
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
    
    keyInput.addEventListener('input', function() {
        updateRequestData(type);
    });
    
    valueInput.addEventListener('input', function() {
        updateRequestData(type);
    });
    
    deleteBtn.addEventListener('click', function() {
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
        if (key && value) {
            result[key] = value;
        }
    });
    
    return result;
}

// Authentication handlers
function setupAuthHandlers() {
    const authTypeSelect = document.getElementById('authType');
    authTypeSelect.addEventListener('change', function() {
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
            `;
            break;
    }
    
    // Add event listeners to auth inputs
    container.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateAuthData);
        input.addEventListener('change', updateAuthData);
    });
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
    const bodyEditor = document.getElementById('bodyEditor');
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

// Main request sending function
async function sendRequest() {
    try {
        showLoading(true);
        
        // Validate request
        if (!currentRequest.url.trim()) {
            showError('URL is required');
            return;
        }
        
        // Process variables in URL and other fields
        const processedRequest = processVariables(currentRequest);
        
        // Build fetch options
        const fetchOptions = buildFetchOptions(processedRequest);
        
        // Execute pre-request script
        await executePreRequestScript();
        
        // Record start time
        const startTime = Date.now();
        
        // Send request
        const response = await fetch(processedRequest.url, fetchOptions);
        const endTime = Date.now();
        
        // Process response
        const responseData = await processResponse(response, endTime - startTime);
        
        // Display response
        displayResponse(responseData);
        
        // Execute test script
        await executeTestScript(responseData);
        
        // Save to history
        saveToHistory(processedRequest, responseData);
        
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
        const bodyType = document.querySelector('input[name="bodyType"]:checked').value;
        
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
            responseData.body = JSON.parse(responseData.bodyText);
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
            if (contentType.includes('application/json') && responseData.body) {
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
        cookiesContainer.innerHTML = '<p>No cookies in response</p>';
    }
}

// Utility functions
function processVariables(request) {
    const processed = JSON.parse(JSON.stringify(request));
    
    // Process URL
    processed.url = replaceVariables(processed.url);
    
    // Add query parameters
    const url = new URL(processed.url);
    Object.entries(processed.params).forEach(([key, value]) => {
        url.searchParams.set(key, replaceVariables(value));
    });
    
    // Add API key to query if needed
    if (processed.auth.type === 'apikey' && processed.auth.addTo === 'query') {
        url.searchParams.set(processed.auth.key, processed.auth.value);
    }
    
    processed.url = url.toString();
    
    // Process headers
    Object.keys(processed.headers).forEach(key => {
        processed.headers[key] = replaceVariables(processed.headers[key]);
    });
    
    // Process body
    if (processed.body) {
        processed.body = replaceVariables(processed.body);
    }
    
    return processed;
}

function replaceVariables(text) {
    if (typeof text !== 'string') return text;
    
    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmedName = varName.trim();
        return variables.environment[trimmedName] || 
               variables.collection[trimmedName] || 
               variables.global[trimmedName] || 
               match;
    });
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

function showError(message) {
    // Simple error display - could be enhanced with a modal or toast
    alert('Error: ' + message);
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

// Script execution functions
async function executePreRequestScript() {
    const script = document.getElementById('testScript').value;
    if (!script.trim()) return;
    
    try {
        // Create a simple pm object for script execution
        const pm = createPmObject();
        
        // Execute the script in a safe context
        const scriptFunction = new Function('pm', script);
        scriptFunction(pm);
    } catch (error) {
        console.error('Pre-request script error:', error);
    }
}

async function executeTestScript(responseData) {
    const script = document.getElementById('testScript').value;
    if (!script.trim()) return;
    
    const results = [];
    
    try {
        // Create pm object with response data
        const pm = createPmObject(responseData, results);
        
        // Execute the script
        const scriptFunction = new Function('pm', script);
        scriptFunction(pm);
        
        // Display test results
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

function createPmObject(responseData = null, testResults = []) {
    return {
        test: function(name, testFunction) {
            try {
                testFunction();
                testResults.push({ name, passed: true });
            } catch (error) {
                testResults.push({ name, passed: false, error: error.message });
            }
        },
        
        response: responseData ? {
            to: {
                have: {
                    status: function(expectedStatus) {
                        if (responseData.status !== expectedStatus) {
                            throw new Error(`Expected status ${expectedStatus}, got ${responseData.status}`);
                        }
                    }
                }
            },
            json: function() {
                return responseData.body;
            }
        } : null,
        
        expect: function(value) {
            return {
                to: {
                    have: {
                        property: function(prop) {
                            if (typeof value !== 'object' || !(prop in value)) {
                                throw new Error(`Expected object to have property '${prop}'`);
                            }
                        }
                    },
                    equal: function(expected) {
                        if (value !== expected) {
                            throw new Error(`Expected ${value} to equal ${expected}`);
                        }
                    }
                }
            };
        },
        
        variables: {
            get: function(key) {
                return variables.environment[key] || variables.collection[key] || variables.global[key];
            },
            set: function(key, value) {
                variables.environment[key] = value;
            }
        }
    };
}

function displayTestResults(results) {
    const testsContainer = document.getElementById('response-tests');
    
    if (results.length === 0) {
        testsContainer.innerHTML = '<p>No tests executed</p>';
        return;
    }
    
    let html = '<div class="test-results">';
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

// Storage functions
async function loadStoredData() {
    try {
        const result = await chrome.storage.local.get(['collections', 'history', 'variables']);
        
        if (result.collections) {
            collections = result.collections;
            renderCollections();
        }
        
        if (result.history) {
            history = result.history;
            renderHistory();
        }
        
        if (result.variables) {
            variables = { ...variables, ...result.variables };
        }
    } catch (error) {
        console.error('Error loading stored data:', error);
    }
}

async function saveToHistory(request, response) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        method: request.method,
        url: request.url,
        status: response.status,
        duration: response.duration
    };
    
    history.unshift(historyItem);
    
    // Keep only last 100 items
    if (history.length > 100) {
        history = history.slice(0, 100);
    }
    
    await chrome.storage.local.set({ history });
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('historyContainer');
    
    if (history.length === 0) {
        container.innerHTML = '<p>No request history</p>';
        return;
    }
    
    let html = '';
    history.forEach(item => {
        html += `
            <div class="history-item" data-id="${item.id}">
                <span class="history-method method-${item.method}">${item.method}</span>
                <span class="history-url">${escapeHtml(item.url)}</span>
                <span class="history-status status-${item.status < 400 ? 'success' : 'error'}">${item.status}</span>
                <span class="history-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Add click handlers to history items
    container.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', function() {
            // Load this request into the current editor
            // This would need to be implemented based on stored request data
            console.log('Load history item:', this.dataset.id);
        });
    });
}

function renderCollections() {
    const container = document.getElementById('collectionsContainer');
    
    if (collections.length === 0) {
        container.innerHTML = '<p>No collections created</p>';
        return;
    }
    
    let html = '';
    collections.forEach(collection => {
        html += `
            <div class="collection-item" data-id="${collection.id}">
                <div class="collection-name">${escapeHtml(collection.name)}</div>
                <div class="collection-meta">${collection.requests?.length || 0} requests</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Modal handlers
function setupModalHandlers() {
    const modal = document.getElementById('importExportModal');
    const closeButtons = modal.querySelectorAll('.modal-close');
    
    closeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            modal.classList.remove('active');
        });
    });
    
    // Click outside to close
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
    
    // File input handling
    const fileInput = document.getElementById('importFile');
    const fileDropZone = document.getElementById('fileDropZone');
    
    fileInput.addEventListener('change', handleFileSelect);
    
    fileDropZone.addEventListener('click', function() {
        fileInput.click();
    });
    
    fileDropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('dragover');
    });
    
    fileDropZone.addEventListener('dragleave', function() {
        this.classList.remove('dragover');
    });
    
    fileDropZone.addEventListener('drop', function(e) {
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

function openImportModal() {
    document.getElementById('importExportModal').classList.add('active');
    document.getElementById('modalTitle').textContent = 'Import Data';
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
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
                await importApiTesterSettings(data);
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
    
    collections.push(collection);
    await chrome.storage.local.set({ collections });
    renderCollections();
}

function extractPostmanRequests(items, folder = '') {
    const requests = [];
    
    items.forEach(item => {
        if (item.request) {
            // Single request
            const request = {
                id: Date.now() + Math.random(),
                name: item.name || 'Untitled Request',
                method: item.request.method || 'GET',
                url: typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '',
                headers: {},
                params: {},
                body: null,
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
                        // Convert form data to key-value pairs
                        request.body = item.request.body.formdata?.reduce((acc, field) => {
                            if (!field.disabled) {
                                acc[field.key] = field.value;
                            }
                            return acc;
                        }, {});
                        break;
                }
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

async function importApiTesterSettings(data) {
    // ApiTester format - adapt based on actual ApiTester export format
    if (data.collections) {
        data.collections.forEach(collection => {
            collections.push({
                id: Date.now() + Math.random(),
                name: collection.name || 'ApiTester Import',
                description: collection.description || '',
                requests: collection.requests || []
            });
        });
    }
    
    if (data.variables) {
        Object.assign(variables.global, data.variables);
    }
    
    await chrome.storage.local.set({ collections, variables });
    renderCollections();
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
                    
                    collection.requests.push(request);
                }
            });
        });
    }
    
    collections.push(collection);
    await chrome.storage.local.set({ collections });
    renderCollections();
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
                    body: null
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
}

function parseCurlCommand(curlString) {
    // Basic cURL parsing - can be enhanced
    const request = {
        method: 'GET',
        url: '',
        headers: {},
        body: null
    };
    
    const parts = curlString.split(/\s+/);
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (part === '-X' || part === '--request') {
            request.method = parts[i + 1];
            i++;
        } else if (part === '-H' || part === '--header') {
            const header = parts[i + 1].replace(/['"]/g, '');
            const [key, value] = header.split(':').map(s => s.trim());
            if (key && value) {
                request.headers[key] = value;
            }
            i++;
        } else if (part === '-d' || part === '--data') {
            request.body = parts[i + 1].replace(/['"]/g, '');
            i++;
        } else if (part.startsWith('http')) {
            request.url = part.replace(/['"]/g, '');
        }
    }
    
    return request;
}

function importCurlCommand(request) {
    // Load the parsed cURL command into the current request editor
    document.getElementById('methodSelect').value = request.method;
    document.getElementById('urlInput').value = request.url;
    
    // Clear existing headers and add new ones
    const headersContainer = document.getElementById('headersContainer');
    headersContainer.innerHTML = '';
    
    Object.entries(request.headers).forEach(([key, value]) => {
        addKeyValueRow(headersContainer, 'header');
        const rows = headersContainer.querySelectorAll('.key-value-row');
        const lastRow = rows[rows.length - 1];
        lastRow.querySelector('.key-input').value = key;
        lastRow.querySelector('.value-input').value = value;
    });
    
    // Set body if present
    if (request.body) {
        document.querySelector('input[name="bodyType"][value="raw"]').checked = true;
        handleBodyTypeChange({ target: { value: 'raw' } });
        document.getElementById('rawBody').value = request.body;
    }
    
    // Update current request object
    Object.assign(currentRequest, request);
}

function exportData() {
    const exportData = {
        collections: collections,
        variables: variables,
        timestamp: new Date().toISOString()
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
    }
}

// Interceptor functions
function startInterceptor() {
    if (isInterceptorActive) return;
    
    // Send message to background script to start intercepting
    chrome.runtime.sendMessage({
        action: 'startInterceptor',
        filters: getInterceptorFilters()
    });
    
    isInterceptorActive = true;
    document.getElementById('startInterceptorBtn').disabled = true;
    document.getElementById('stopInterceptorBtn').disabled = false;
    
    // Listen for intercepted requests
    chrome.runtime.onMessage.addListener(handleInterceptedRequest);
}

function stopInterceptor() {
    if (!isInterceptorActive) return;
    
    chrome.runtime.sendMessage({ action: 'stopInterceptor' });
    
    isInterceptorActive = false;
    document.getElementById('startInterceptorBtn').disabled = false;
    document.getElementById('stopInterceptorBtn').disabled = true;
    
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
    
    requestDiv.addEventListener('click', function() {
        loadInterceptedRequest(request);
    });
    
    container.insertBefore(requestDiv, container.firstChild);
    
    // Keep only last 50 intercepted requests
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

function loadInterceptedRequest(request) {
    // Load intercepted request into the request editor
    document.getElementById('methodSelect').value = request.method;
    document.getElementById('urlInput').value = request.url;
    
    // Switch to request tab
    switchMainTab('request');
    
    // Load headers
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
    
    // Load body if present
    if (request.body) {
        document.querySelector('input[name="bodyType"][value="raw"]').checked = true;
        handleBodyTypeChange({ target: { value: 'raw' } });
        document.getElementById('rawBody').value = request.body;
    }
    
    updateRequestData('header');
}

function openSettings() {
    // Simple settings modal - could be enhanced
    const settings = {
        timeout: 30000,
        followRedirects: true,
        validateSSL: true
    };
    
    const settingsJson = JSON.stringify(settings, null, 2);
    const newSettings = prompt('Edit settings (JSON format):', settingsJson);
    
    if (newSettings) {
        try {
            const parsed = JSON.parse(newSettings);
            chrome.storage.local.set({ settings: parsed });
            showSuccess('Settings saved');
        } catch (error) {
            showError('Invalid JSON format');
        }
    }
}

function showSuccess(message) {
    // Simple success display - could be enhanced with a toast notification
    console.log('Success:', message);
    // You could implement a toast notification here
}

// Initialize app when popup is opened
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}