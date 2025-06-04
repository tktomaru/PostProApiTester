// Background script for Chrome extension
// Handles network interception and long-running tasks

let isInterceptorActive = false;
let interceptorFilters = {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    domain: ''
};
let interceptedRequests = new Map();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'startInterceptor':
            startNetworkInterceptor(message.filters);
            sendResponse({ success: true });
            break;

        case 'stopInterceptor':
            stopNetworkInterceptor();
            sendResponse({ success: true });
            break;

        case 'getInterceptorStatus':
            sendResponse({ active: isInterceptorActive });
            break;

        default:
            sendResponse({ error: 'Unknown action' });
    }

    return true; // Keep message channel open for async response
});

function startNetworkInterceptor(filters) {
    if (isInterceptorActive) return;

    isInterceptorActive = true;
    interceptorFilters = filters || interceptorFilters;

    // Register webRequest listeners
    chrome.webRequest.onBeforeRequest.addListener(
        handleBeforeRequest,
        { urls: ["<all_urls>"] },
        ["requestBody"]
    );

    chrome.webRequest.onSendHeaders.addListener(
        handleSendHeaders,
        { urls: ["<all_urls>"] },
        ["requestHeaders"]
    );

    chrome.webRequest.onHeadersReceived.addListener(
        handleHeadersReceived,
        { urls: ["<all_urls>"] },
        ["responseHeaders"]
    );

    chrome.webRequest.onCompleted.addListener(
        handleRequestCompleted,
        { urls: ["<all_urls>"] },
        ["responseHeaders"]
    );

    chrome.webRequest.onErrorOccurred.addListener(
        handleRequestError,
        { urls: ["<all_urls>"] }
    );

    console.log('Network interceptor started');
}

function stopNetworkInterceptor() {
    if (!isInterceptorActive) return;

    isInterceptorActive = false;

    // Remove all webRequest listeners
    chrome.webRequest.onBeforeRequest.removeListener(handleBeforeRequest);
    chrome.webRequest.onSendHeaders.removeListener(handleSendHeaders);
    chrome.webRequest.onHeadersReceived.removeListener(handleHeadersReceived);
    chrome.webRequest.onCompleted.removeListener(handleRequestCompleted);
    chrome.webRequest.onErrorOccurred.removeListener(handleRequestError);

    // Clear stored requests
    interceptedRequests.clear();

    console.log('Network interceptor stopped');
}

function handleBeforeRequest(details) {
    if (!shouldInterceptRequest(details)) return;

    const requestData = {
        id: details.requestId,
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        headers: {},
        body: null,
        status: null,
        responseHeaders: {},
        duration: null
    };

    // Extract request body if present
    if (details.requestBody) {
        if (details.requestBody.raw) {
            // Binary data
            const decoder = new TextDecoder();
            requestData.body = details.requestBody.raw.map(data =>
                decoder.decode(data.bytes)
            ).join('');
        } else if (details.requestBody.formData) {
            // Form data
            requestData.body = details.requestBody.formData;
        }
    }

    interceptedRequests.set(details.requestId, requestData);
}

function handleSendHeaders(details) {
    const requestData = interceptedRequests.get(details.requestId);
    if (!requestData) return;

    // Store request headers
    if (details.requestHeaders) {
        details.requestHeaders.forEach(header => {
            requestData.headers[header.name] = header.value;
        });
    }

    interceptedRequests.set(details.requestId, requestData);
}

function handleHeadersReceived(details) {
    const requestData = interceptedRequests.get(details.requestId);
    if (!requestData) return;

    // Store response headers and status
    requestData.status = details.statusCode;

    if (details.responseHeaders) {
        details.responseHeaders.forEach(header => {
            requestData.responseHeaders[header.name] = header.value;
        });
    }

    interceptedRequests.set(details.requestId, requestData);
}

function handleRequestCompleted(details) {
    const requestData = interceptedRequests.get(details.requestId);
    if (!requestData) return;

    // Calculate duration
    requestData.duration = Date.now() - requestData.timestamp;
    requestData.status = details.statusCode;

    // Send to popup if it's open
    sendToPopup({
        action: 'requestIntercepted',
        request: requestData
    });

    // Clean up old requests (keep only last 100)
    if (interceptedRequests.size > 100) {
        const oldestKey = interceptedRequests.keys().next().value;
        interceptedRequests.delete(oldestKey);
    }
}

function handleRequestError(details) {
    const requestData = interceptedRequests.get(details.requestId);
    if (!requestData) return;

    requestData.duration = Date.now() - requestData.timestamp;
    requestData.status = 0;
    requestData.error = details.error;

    // Send to popup if it's open
    sendToPopup({
        action: 'requestIntercepted',
        request: requestData
    });

    interceptedRequests.delete(details.requestId);
}

function shouldInterceptRequest(details) {
    // Skip chrome-extension URLs
    if (details.url.startsWith('chrome-extension://')) return false;

    // Skip if not in allowed methods
    if (!interceptorFilters.methods.includes(details.method)) return false;

    // Apply domain filter if set
    if (interceptorFilters.domain) {
        try {
            const url = new URL(details.url);
            if (!url.hostname.includes(interceptorFilters.domain)) return false;
        } catch (e) {
            return false;
        }
    }

    return true;
}

function sendToPopup(message) {
    // Try to send message to popup
    chrome.runtime.sendMessage(message).catch(() => {
        // Popup is not open, ignore error
    });
}

// Extension lifecycle events
chrome.runtime.onInstalled.addListener((details) => {
    console.log('API Tester extension installed:', details.reason);

    // Initialize default settings
    chrome.storage.local.set({
        settings: {
            timeout: 30000,
            followRedirects: true,
            validateSSL: true,
            maxHistoryItems: 100
        },
        collections: [],
        history: [],
        variables: {
            global: {},
            environment: {},
            collection: {}
        }
    });
});

chrome.runtime.onStartup.addListener(() => {
    console.log('API Tester extension started');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // This will open the popup automatically due to manifest configuration
    console.log('Extension icon clicked on tab:', tab.id);
    // 新しいタブで index.html を開く
    chrome.tabs.create({
        url: chrome.runtime.getURL("index.html")
    });
    // if (info.menuItemId === 'interceptRequest') {
    //     // Send the URL to popup for testing
    //     chrome.storage.local.set({
    //         pendingRequest: {
    //             url: info.linkUrl,
    //             method: 'GET',
    //             timestamp: Date.now()
    //         }
    //     });
    // }
});

// Context menu setup (optional feature)
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.clear(() => {
        console.log('debug用の暫定処理：ストレージをクリアしました（onInstalled）');
    });
    chrome.contextMenus.create({
        id: 'interceptRequest',
        title: 'Test this API with API Tester',
        contexts: ['link'],
        targetUrlPatterns: ['http://*/*', 'https://*/*']
    });
});

// Alarm for cleanup tasks
// chrome.alarms.onAlarm.addListener((alarm) => {
//     if (alarm.name === 'cleanup') {
//         performCleanup();
//     }
// });

// Set up periodic cleanup
chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create('cleanup', {
        delayInMinutes: 60,
        periodInMinutes: 60
    });
});

async function performCleanup() {
    try {
        const result = await chrome.storage.local.get(['history', 'settings']);
        const settings = result.settings || {};
        const maxHistoryItems = settings.maxHistoryItems || 100;

        if (result.history && result.history.length > maxHistoryItems) {
            const trimmedHistory = result.history.slice(0, maxHistoryItems);
            await chrome.storage.local.set({ history: trimmedHistory });
            console.log(`Cleaned up history: ${result.history.length} -> ${trimmedHistory.length} items`);
        }

        // Clear old intercepted requests
        if (interceptedRequests.size > 50) {
            const requestsToKeep = Array.from(interceptedRequests.entries())
                .slice(-50);
            interceptedRequests.clear();
            requestsToKeep.forEach(([key, value]) => {
                interceptedRequests.set(key, value);
            });
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Handle tab updates for context-aware features
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Could be used for auto-detection of API endpoints
        console.log('Tab updated:', tab.url);
    }
});

// Storage change listener for sync between popup instances
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        // Notify popup about storage changes
        sendToPopup({
            action: 'storageChanged',
            changes: changes
        });
    }
});

// Network state detection
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'popup') {
        port.onMessage.addListener((message) => {
            if (message.action === 'getNetworkState') {
                port.postMessage({
                    interceptorActive: isInterceptorActive,
                    interceptedCount: interceptedRequests.size
                });
            }
        });
    }
});

// Export intercepted data
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'exportInterceptedData') {
        const data = Array.from(interceptedRequests.values());
        sendResponse({ data: data });
        return true;
    }
});

// OAuth2 helper functions
async function handleOAuth2Flow(config) {
    const authUrl = buildAuthUrl(config);

    return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
        }, (redirectUrl) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            try {
                const urlParams = new URL(redirectUrl).searchParams;
                const code = urlParams.get('code');
                const error = urlParams.get('error');

                if (error) {
                    reject(new Error(error));
                } else if (code) {
                    resolve(code);
                } else {
                    reject(new Error('No authorization code received'));
                }
            } catch (e) {
                reject(e);
            }
        });
    });
}

function buildAuthUrl(config) {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scope || '',
        state: generateRandomState()
    });

    return `${config.authUrl}?${params.toString()}`;
}

function generateRandomState() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

// Token exchange for OAuth2
async function exchangeCodeForToken(config, authCode) {
    const tokenData = {
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: authCode,
        redirect_uri: config.redirectUri
    };

    const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(tokenData)
    });

    if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return await response.json();
}

// Refresh token functionality
async function refreshAccessToken(config, refreshToken) {
    const tokenData = {
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken
    };

    const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(tokenData)
    });

    if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    return await response.json();
}

// Handle OAuth2 requests from popup
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'oauth2Authorize') {
        try {
            const authCode = await handleOAuth2Flow(message.config);
            const tokens = await exchangeCodeForToken(message.config, authCode);
            sendResponse({ success: true, tokens: tokens });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }

    if (message.action === 'oauth2Refresh') {
        try {
            const tokens = await refreshAccessToken(message.config, message.refreshToken);
            sendResponse({ success: true, tokens: tokens });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }
});

// Performance monitoring
let performanceMetrics = {
    requestCount: 0,
    averageResponseTime: 0,
    errorCount: 0
};

function updatePerformanceMetrics(requestData) {
    performanceMetrics.requestCount++;

    if (requestData.duration) {
        const totalTime = performanceMetrics.averageResponseTime * (performanceMetrics.requestCount - 1);
        performanceMetrics.averageResponseTime = (totalTime + requestData.duration) / performanceMetrics.requestCount;
    }

    if (requestData.status >= 400 || requestData.error) {
        performanceMetrics.errorCount++;
    }
}

// Export performance data
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPerformanceMetrics') {
        sendResponse(performanceMetrics);
        return true;
    }

    if (message.action === 'resetPerformanceMetrics') {
        performanceMetrics = {
            requestCount: 0,
            averageResponseTime: 0,
            errorCount: 0
        };
        sendResponse({ success: true });
        return true;
    }
});

console.log('API Tester background script loaded');