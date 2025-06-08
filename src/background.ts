// background.ts
// ───────────────────────────────────────────────────────────────────────────────
// Background script for Chrome extension
// Handles network interception and long-running tasks

import type { RequestData, InterceptedRequest } from './types';

interface InterceptorFilters {
    urls: string[];
    types: string[];
    methods: string[];
}

interface OAuth2Config {
    clientId: string;
    clientSecret?: string;
    authUrl: string;
    tokenUrl: string;
    redirectUri: string;
    scope?: string;
}

interface PerformanceMetrics {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    averageResponseTime: number;
}

// インターセプトされたリクエストを保存するMap
const interceptedRequests = new Map<string, InterceptedRequest>();

// IIFEパターンを使用して、グローバルスコープを汚染しないようにする
(function () {
    let isInterceptorActive = false;
    let interceptorFilters: InterceptorFilters = {
        urls: [],
        types: [],
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    };

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message: any, _: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
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

            case 'sendHttpRequest':
                handleHttpRequest(message.options, sendResponse);
                return true; // 非同期レスポンス
                break;

            case 'sendRequestWithHeaderInjection':
                handleRequestWithHeaderInjection(message.options, sendResponse);
                return true; // 非同期レスポンス
                break;

            default:
                sendResponse({ error: 'Unknown action' });
        }

        return true; // Keep message channel open for async response
    });

    // ユーティリティ: Cookie ヘッダー文字列をパースしてセット
    async function setCookiesFromHeader(url: string, cookieHeader: string): Promise<void> {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const pairs = cookieHeader.split(';').map(s => s.trim());

        console.log('Setting cookies for domain:', domain, 'Pairs:', pairs);

        for (const pair of pairs) {
            const [name, ...rest] = pair.split('=');
            const value = rest.join('=');

            if (name && value) {
                try {
                    await chrome.cookies.set({
                        url,
                        name: name.trim(),
                        value: value.trim(),
                        domain,
                        path: "/",
                        secure: urlObj.protocol === "https:",
                        sameSite: "lax"
                    });
                    console.log(`Set cookie: ${name}=${value} for domain: ${domain}`);
                } catch (error) {
                    console.error(`Failed to set cookie ${name}:`, error);
                }
            }
        }
    }

    // HTTP Request handler for Cookie headers
    async function handleHttpRequest(options: any, sendResponse: (response?: any) => void): Promise<void> {
        try {
            const { method, url, headers, body } = options;
            console.log('🍪 handleHttpRequest with headers:', headers);

            // ① Cookie ヘッダーを本物の Cookie としてセット
            if (headers.Cookie || headers.cookie) {
                const cookieHeader = headers.Cookie || headers.cookie;
                console.log('Found Cookie header:', cookieHeader);
                await setCookiesFromHeader(url, cookieHeader);
            }

            // ② fetch で送信（credentials: include でブラウザが Cookie ヘッダーを自動付加）
            const fetchHeaders: Record<string, string> = {};
            Object.entries(headers).forEach(([k, v]) => {
                if (k.toLowerCase() !== 'cookie') {
                    fetchHeaders[k] = v as string;
                }
            });

            console.log('Fetch headers (without Cookie):', fetchHeaders);

            const fetchOptions: RequestInit = {
                method: method,
                headers: fetchHeaders,
                credentials: 'include', // ブラウザが自動的にCookieヘッダーを付加
                body: body || undefined
            };

            console.log('Fetch options:', fetchOptions);
            const response = await fetch(url, fetchOptions);
            const responseBody = await response.text();
            const responseHeaders: Record<string, string> = {};

            // レスポンスヘッダーを収集
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            console.log('Response received:', { status: response.status, headers: responseHeaders });

            sendResponse({
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseBody
            });
        } catch (error: any) {
            console.error('HTTP Request error:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }

    // Header injection using webRequest API
    let headerInjectionSettings = new Map<string, Record<string, string>>();

    // webRequest APIでヘッダー注入を行う関数
    function setupHeaderInjection() {
        chrome.webRequest.onBeforeSendHeaders.addListener(
            (details) => {
                console.log('webRequest onBeforeSendHeaders:', details.url);
                const headersToInject = headerInjectionSettings.get(details.url);
                if (headersToInject && details.requestHeaders) {
                    console.log('🚀 Injecting headers for:', details.url, headersToInject);

                    // 元のヘッダーをコピー
                    const headers = [...details.requestHeaders];

                    // Cookie → X-Cookie-Data 変換含めて注入
                    Object.entries(headersToInject).forEach(([key, value]) => {
                        if (key.toLowerCase() === 'cookie') {
                            console.log(`Converting Cookie header to X-Cookie-Data: ${value}`);
                            headers.push({ name: 'X-Cookie-Data', value });
                        } else {
                            const idx = headers.findIndex(h => h.name?.toLowerCase() === key.toLowerCase());
                            if (idx >= 0) {
                                headers[idx].value = value;
                            } else {
                                headers.push({ name: key, value });
                            }
                        }
                    });

                    // 一度 inject したら削除
                    headerInjectionSettings.delete(details.url);
                    console.log('Final headers:', headers);
                    return { requestHeaders: headers };
                }
                // マッチしない場合は何も返さない
            },
            { urls: ['<all_urls>'] },
            ['blocking', 'requestHeaders']
        );
    }

    // 初期化時にヘッダー注入を設定
    setupHeaderInjection();

    async function handleRequestWithHeaderInjection(options: any, sendResponse: (response?: any) => void): Promise<void> {
        try {
            const { method, url, headers, body } = options;
            console.log('🔥 handleRequestWithHeaderInjection:', url, headers);

            // URL をキーに一度だけ inject 指定
            headerInjectionSettings.set(url, headers);
            console.log('Set injection settings for URL:', url, 'Headers:', headers);
            console.log('Current injection settings:', Array.from(headerInjectionSettings.entries()));

            // 少し待って fetch（空ヘッダーで送信）
            setTimeout(async () => {
                try {
                    console.log('→ fetching (with injected headers) to:', url);
                    const resp = await fetch(url, {
                        method,
                        headers: {}, // 空のヘッダーで送信（webRequestで注入される）
                        body: body || undefined
                    });
                    const text = await resp.text();
                    const respHeaders: Record<string, string> = {};
                    resp.headers.forEach((v, k) => respHeaders[k] = v);

                    console.log('Response received:', { status: resp.status, headers: respHeaders });
                    sendResponse({
                        success: true,
                        status: resp.status,
                        statusText: resp.statusText,
                        headers: respHeaders,
                        body: text
                    });
                } catch (err: any) {
                    console.error('✖ fetch error:', err);
                    // エラー時は設定をクリーンアップ
                    headerInjectionSettings.delete(url);
                    sendResponse({
                        success: false,
                        error: err.message
                    });
                }
            }, 100);

        } catch (error: any) {
            console.error('handleRequestWithHeaderInjection error:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }

    function startNetworkInterceptor(filters?: InterceptorFilters): void {
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

    function stopNetworkInterceptor(): void {
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

    function handleBeforeRequest(details: chrome.webRequest.OnBeforeRequestDetails): chrome.webRequest.BlockingResponse | undefined {
        if (!shouldInterceptRequest(details)) return undefined;

        const requestData: InterceptedRequest = {
            url: details.url,
            method: details.method,
            headers: {},
            timestamp: Date.now(),
            body: null
        };

        // Extract request body if present
        // if (details.requestBody) {
        //     if (details.requestBody.raw) {
        //         // Binary data
        //         const decoder = new TextDecoder();
        //         requestData.body = details.requestBody.raw.map((data: { bytes?: ArrayBuffer }) =>
        //             decoder.decode(data.bytes!)
        //         ).join('');
        //     } else if (details.requestBody.formData) {
        //         // Form data
        //         const formData: Record<string, string> = {};
        //         Object.entries(details.requestBody.formData).forEach(([key, values]) => {
        //             formData[key] = values.join(',');
        //         });
        //         requestData.body = formData;
        //     }
        // }

        interceptedRequests.set(details.requestId, requestData);
        return undefined;
    }

    function handleSendHeaders(details: chrome.webRequest.OnSendHeadersDetails): void {
        const requestData = interceptedRequests.get(details.requestId);
        if (!requestData) return;

        // Store request headers
        if (details.requestHeaders) {
            details.requestHeaders.forEach((header: chrome.webRequest.HttpHeader) => {
                if (header.name && header.value) {
                    requestData.headers[header.name] = header.value;
                }
            });
        }

        interceptedRequests.set(details.requestId, requestData);
    }

    function handleHeadersReceived(details: chrome.webRequest.OnHeadersReceivedDetails): chrome.webRequest.BlockingResponse | undefined {
        const requestData = interceptedRequests.get(details.requestId);
        if (!requestData) return undefined;

        requestData.status = details.statusCode;
        requestData.responseHeaders = {};

        if (details.responseHeaders) {
            details.responseHeaders.forEach((header: chrome.webRequest.HttpHeader) => {
                if (header.name && header.value) {
                    requestData.responseHeaders![header.name] = header.value;
                }
            });
        }

        interceptedRequests.set(details.requestId, requestData);
        return undefined;
    }

    function handleRequestCompleted(details: chrome.webRequest.OnCompletedDetails): void {
        const requestData = interceptedRequests.get(details.requestId);
        if (!requestData) return;

        requestData.duration = Date.now() - requestData.timestamp;
        requestData.status = details.statusCode;

        // Convert InterceptedRequest to RequestData for updatePerformanceMetrics
        const requestDataForMetrics: RequestData = {
            id: details.requestId,
            name: `Intercepted ${requestData.method} Request`,
            method: requestData.method,
            url: requestData.url,
            headers: requestData.headers,
            params: {},
            body: requestData.body || null,
            bodyType: 'none',
            auth: { type: 'none' },
            preRequestScript: '',
            timestamp: requestData.timestamp,
            status: requestData.status,
            responseHeaders: requestData.responseHeaders,
            duration: requestData.duration
        };

        updatePerformanceMetrics(requestDataForMetrics);
    }

    function handleRequestError(details: chrome.webRequest.OnErrorOccurredDetails): void {
        const requestData = interceptedRequests.get(details.requestId);
        if (!requestData) return;

        requestData.duration = Date.now() - requestData.timestamp;
        requestData.status = 0;
        requestData.error = details.error;

        // Convert InterceptedRequest to RequestData for updatePerformanceMetrics
        const requestDataForMetrics: RequestData = {
            id: details.requestId,
            name: `Intercepted ${requestData.method} Request`,
            method: requestData.method,
            url: requestData.url,
            headers: requestData.headers,
            params: {},
            body: requestData.body || null,
            bodyType: 'none',
            auth: { type: 'none' },
            preRequestScript: '',
            timestamp: requestData.timestamp,
            status: requestData.status,
            responseHeaders: requestData.responseHeaders,
            duration: requestData.duration,
            error: requestData.error
        };

        updatePerformanceMetrics(requestDataForMetrics);
    }

    function shouldInterceptRequest(details: chrome.webRequest.OnBeforeRequestDetails): boolean {
        // Skip chrome-extension URLs
        if (details.url.startsWith('chrome-extension://')) return false;

        // Skip if not in allowed methods
        if (!interceptorFilters.methods.includes(details.method)) return false;

        // Apply domain filter if set
        if (interceptorFilters.urls.length > 0) {
            try {
                const url = new URL(details.url);
                if (!interceptorFilters.urls.includes(url.hostname)) return false;
            } catch (e) {
                return false;
            }
        }

        return true;
    }

    function sendToPopup(message: any): void {
        // Try to send message to popup
        chrome.runtime.sendMessage(message).catch(() => {
            // Popup is not open, ignore error
        });
    }

    // Extension lifecycle events
    chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
        console.log('API Tester extension installed:', details.reason);

        // Initialize default settings
        chrome.storage.local.set({
            settings: {
                timeout: 30000,
                followRedirects: true,
                validateSSL: true,
                maxHistoryItems: 100,
                openDevTools: true
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
    chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
        console.log('Extension icon clicked on tab:', tab.id);
        // 新しいタブで index.html を開く
        chrome.tabs.create({
            url: chrome.runtime.getURL("index.html")
        }, (newTab) => {
            // 設定を確認してから開発者ツールを開く
            if (newTab.id) {
                chrome.storage.local.get(['settings'], (result) => {
                    const settings = result.settings || {};
                    if (settings.openDevTools !== false) { // デフォルトはtrue
                        // ページが完全に読み込まれてからF12キーシミュレーションを実行
                        setTimeout(() => {
                            chrome.tabs.sendMessage(newTab.id!, { action: 'openDevToolsF12' });
                        }, 1500);
                    }
                });
            }
        });
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

    // Set up periodic cleanup
    chrome.runtime.onStartup.addListener(() => {
        chrome.alarms.create('cleanup', {
            delayInMinutes: 60,
            periodInMinutes: 60
        });
    });

    // Handle tab updates for context-aware features
    chrome.tabs.onUpdated.addListener((_: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
        if (changeInfo.status === 'complete' && tab.url) {
            console.log('Tab updated:', tab.url);
        }
    });

    // Storage change listener for sync between popup instances
    chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, namespace: string) => {
        if (namespace === 'local') {
            // Notify popup about storage changes
            sendToPopup({
                action: 'storageChanged',
                changes: changes
            });
        }
    });

    // Network state detection
    chrome.runtime.onConnect.addListener((port: chrome.runtime.Port) => {
        if (port.name === 'popup') {
            port.onMessage.addListener((message: any) => {
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
    chrome.runtime.onMessage.addListener((message: any, _: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (message.action === 'exportInterceptedData') {
            const data = Array.from(interceptedRequests.values());
            sendResponse({ data: data });
            return true;
        }
    });

    // OAuth2 helper functions
    async function handleOAuth2Flow(config: OAuth2Config): Promise<string> {
        const authUrl = buildAuthUrl(config);

        return new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            }, (redirectUrl?: string) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                if (!redirectUrl) {
                    reject(new Error('No redirect URL received'));
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

    function buildAuthUrl(config: OAuth2Config): string {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scope || '',
            state: generateRandomState()
        });

        return `${config.authUrl}?${params.toString()}`;
    }

    function generateRandomState(): string {
        return `state_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    }

    // Token exchange for OAuth2
    async function exchangeCodeForToken(config: OAuth2Config, authCode: string): Promise<any> {
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
            body: new URLSearchParams(tokenData as any)
        });

        if (!response.ok) {
            throw new Error(`Token exchange failed: ${response.statusText}`);
        }

        return await response.json();
    }

    // Refresh token functionality
    async function refreshAccessToken(config: OAuth2Config, refreshToken: string): Promise<any> {
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
            body: new URLSearchParams(tokenData as any)
        });

        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.statusText}`);
        }

        return await response.json();
    }

    // Handle OAuth2 requests from popup
    chrome.runtime.onMessage.addListener(async (message: any, _: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (message.action === 'oauth2Authorize') {
            try {
                const authCode = await handleOAuth2Flow(message.config);
                const tokens = await exchangeCodeForToken(message.config, authCode);
                sendResponse({ success: true, tokens: tokens });
            } catch (error: any) {
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }

        if (message.action === 'oauth2Refresh') {
            try {
                const tokens = await refreshAccessToken(message.config, message.refreshToken);
                sendResponse({ success: true, tokens: tokens });
            } catch (error: any) {
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }
    });

    // Performance monitoring
    let performanceMetrics: PerformanceMetrics = {
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        averageResponseTime: 0
    };

    function updatePerformanceMetrics(requestData: RequestData): void {
        performanceMetrics.totalRequests++;

        if (requestData.duration) {
            const totalTime = performanceMetrics.averageResponseTime * (performanceMetrics.totalRequests - 1);
            performanceMetrics.averageResponseTime = (totalTime + requestData.duration) / performanceMetrics.totalRequests;
        }

        if ((requestData.status && requestData.status >= 400) || requestData.error) {
            performanceMetrics.errorCount++;
        } else {
            performanceMetrics.successCount++;
        }
    }

    // Export performance data
    chrome.runtime.onMessage.addListener((message: any, _: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (message.action === 'getPerformanceMetrics') {
            sendResponse(performanceMetrics);
            return true;
        }

        if (message.action === 'resetPerformanceMetrics') {
            performanceMetrics = {
                totalRequests: 0,
                successCount: 0,
                errorCount: 0,
                averageResponseTime: 0
            };
            sendResponse({ success: true });
            return true;
        }
    });

    console.log('API Tester background script loaded');
})();