export {};

// content.ts
// ───────────────────────────────────────────────────────────────────────────────
// Content script for API Tester Chrome Extension
// Handles page-level interactions and communication with injected scripts

interface PageRequestInfo {
    id: number;
    timestamp: number;
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
    initiator: string;
    status: string | number;
    statusText?: string;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    duration?: number;
    size?: number;
    error?: string;
}

interface PageConfig {
    interceptFetch: boolean;
    interceptXHR: boolean;
    logRequests: boolean;
    autoCapture: boolean;
}

interface DetectedEndpoint {
    url: string;
    text: string;
    context: string;
}

interface Technologies {
    framework: string;
    hasGraphQL: boolean;
    hasRestAPI: boolean;
    hasWebSocket: boolean;
}

// Extend Window interface for our custom properties
declare global {
    interface Window {
        apiTesterContentScript?: boolean;
    }
    interface XMLHttpRequest {
        _apiTesterInfo?: {
            requestId: number;
            method: string;
            url: string;
            startTime: number;
            headers: Record<string, string>;
            body?: any;
        };
    }
}

// IIFEパターンを使用して、グローバルスコープを汚染しないようにする
(function () {
    // Prevent multiple injection
    if (window.apiTesterContentScript) {
        return;
    }
    window.apiTesterContentScript = true;

    console.log('API Tester content script loaded on:', window.location.href);

    // Configuration
    const CONFIG: PageConfig = {
        interceptFetch: true,
        interceptXHR: true,
        logRequests: true,
        autoCapture: false
    };

    // Store original functions
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    // Request tracking
    let requestId = 0;
    let activeRequests = new Map<number, PageRequestInfo>();

    // Initialize the content script
    function initializeContentScript(): void {
        // Inject the monitoring script into the page
        injectPageScript();

        // Set up message listener
        setupMessageListener();

        // Set up DOM observer for API endpoint detection
        setupDOMObserver();

        // Override network functions if needed
        if (CONFIG.interceptFetch || CONFIG.interceptXHR) {
            overrideNetworkFunctions();
        }
    }

    // Inject script into page context
    function injectPageScript(): void {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = function () {
            script.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    // Set up communication with background and popup
    function setupMessageListener(): void {
        // Listen for messages from injected script
        window.addEventListener('message', function (event: MessageEvent) {
            if (event.source !== window) return;

            if (event.data.type === 'API_TESTER_REQUEST') {
                handlePageRequest(event.data.payload);
            } else if (event.data.type === 'API_TESTER_RESPONSE') {
                handlePageResponse(event.data.payload);
            }
        }, false);

        // Listen for messages from popup/background
        chrome.runtime.onMessage.addListener((message: any, _: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
            switch (message.action) {
                case 'getPageRequests':
                    sendResponse({
                        requests: Array.from(activeRequests.values()),
                        url: window.location.href
                    });
                    break;

                case 'clearPageRequests':
                    activeRequests.clear();
                    sendResponse({ success: true });
                    break;

                case 'injectTestRequest':
                    injectTestRequest(message.request);
                    sendResponse({ success: true });
                    break;

                case 'enableAutoCapture':
                    CONFIG.autoCapture = message.enabled;
                    updatePageConfiguration();
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ error: 'Unknown action' });
            }

            return true;
        });
    }

    // Handle requests detected on the page
    function handlePageRequest(requestData: any): void {
        const request: PageRequestInfo = {
            id: ++requestId,
            timestamp: Date.now(),
            url: requestData.url,
            method: requestData.method,
            headers: requestData.headers,
            body: requestData.body,
            initiator: requestData.initiator || 'unknown',
            status: 'pending'
        };

        activeRequests.set(request.id, request);

        // Send to background script
        chrome.runtime.sendMessage({
            action: 'pageRequestDetected',
            request: request,
            pageUrl: window.location.href
        });

        if (CONFIG.logRequests) {
            console.log('API Tester: Request detected', request);
        }
    }

    // Handle responses detected on the page
    function handlePageResponse(responseData: any): void {
        const request = activeRequests.get(responseData.requestId);
        if (!request) return;

        // Update request with response data
        request.status = responseData.status;
        request.statusText = responseData.statusText;
        request.responseHeaders = responseData.headers;
        request.responseBody = responseData.body;
        request.duration = Date.now() - request.timestamp;
        request.size = responseData.size;

        activeRequests.set(request.id, request);

        // Send to background script
        chrome.runtime.sendMessage({
            action: 'pageResponseDetected',
            request: request,
            pageUrl: window.location.href
        });

        if (CONFIG.logRequests) {
            console.log('API Tester: Response detected', request);
        }
    }

    // Override network functions for monitoring
    function overrideNetworkFunctions(): void {
        // Override fetch
        if (CONFIG.interceptFetch) {
            window.fetch = function (...args: Parameters<typeof fetch>): Promise<Response> {
                const startTime = Date.now();
                const requestInfo = extractFetchInfo(args);

                // Call original fetch
                const fetchPromise = originalFetch.apply(this, args);

                // Monitor the response
                return fetchPromise.then(response => {
                    const responseInfo = {
                        ...requestInfo,
                        status: response.status,
                        statusText: response.statusText,
                        headers: extractResponseHeaders(response.headers),
                        duration: Date.now() - startTime
                    };

                    handleFetchResponse(responseInfo, response.clone());
                    return response;
                }).catch(error => {
                    const errorInfo = {
                        ...requestInfo,
                        error: error.message,
                        duration: Date.now() - startTime
                    };

                    handleFetchError(errorInfo);
                    throw error;
                });
            };
        }

        // Override XMLHttpRequest
        if (CONFIG.interceptXHR) {
            XMLHttpRequest.prototype.open = function (method: string, url: string, async: boolean = true, user?: string | null, password?: string | null) {
                this._apiTesterInfo = {
                    requestId: ++requestId,
                    method: method,
                    url: url,
                    startTime: Date.now(),
                    headers: {},
                    body: null
                };

                return originalXHROpen.call(this, method, url, async, user, password);
            };

            XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
                if (this._apiTesterInfo) {
                    this._apiTesterInfo.body = body;

                    // Add event listeners
                    this.addEventListener('loadend', function (this: XMLHttpRequest) {
                        if (!this._apiTesterInfo) return;
                        
                        const info = {
                            ...this._apiTesterInfo,
                            status: this.status,
                            statusText: this.statusText,
                            responseHeaders: parseResponseHeaders(this.getAllResponseHeaders()),
                            responseBody: this.responseText,
                            duration: Date.now() - this._apiTesterInfo.startTime
                        };

                        handleXHRResponse(info);
                    });
                }

                return originalXHRSend.call(this, body);
            };
        }
    }

    // Extract information from fetch arguments
    function extractFetchInfo(args: Parameters<typeof fetch>): Partial<PageRequestInfo> {
        const [input, init = {}] = args;

        const url = typeof input === 'string' ? input : 
                   input instanceof URL ? input.href :
                   input instanceof Request ? input.url : '';

        const method = init.method || 'GET';
        const headers = extractRequestHeaders(init.headers);
        const body = init.body;

        return {
            url: url,
            method: method.toUpperCase(),
            headers: headers,
            body: body,
            initiator: 'fetch'
        };
    }

    // Extract headers from various formats
    function extractRequestHeaders(headers?: HeadersInit): Record<string, string> {
        if (!headers) return {};

        if (headers instanceof Headers) {
            const result: Record<string, string> = {};
            for (const [key, value] of headers.entries()) {
                result[key] = value;
            }
            return result;
        }

        if (Array.isArray(headers)) {
            const result: Record<string, string> = {};
            for (const [key, value] of headers) {
                result[key] = value;
            }
            return result;
        }

        return headers as Record<string, string> || {};
    }

    // Extract response headers
    function extractResponseHeaders(headers: Headers): Record<string, string> {
        const result: Record<string, string> = {};
        if (headers instanceof Headers) {
            for (const [key, value] of headers.entries()) {
                result[key] = value;
            }
        }
        return result;
    }

    // Parse XHR response headers
    function parseResponseHeaders(headerString: string): Record<string, string> {
        const headers: Record<string, string> = {};
        if (!headerString) return headers;

        headerString.split('\r\n').forEach(line => {
            const parts = line.split(': ');
            if (parts.length === 2) {
                headers[parts[0]] = parts[1];
            }
        });

        return headers;
    }

    // Handle fetch response
    function handleFetchResponse(info: any, response: Response): void {
        // Try to read response body
        response.text().then(text => {
            const requestData = {
                ...info,
                responseBody: text,
                size: new Blob([text]).size
            };

            handlePageResponse({
                requestId: requestId,
                ...requestData
            });
        }).catch(error => {
            console.warn('Failed to read response body:', error);
            handlePageResponse({
                requestId: requestId,
                ...info
            });
        });

        handlePageRequest(info);
    }

    // Handle fetch error
    function handleFetchError(info: any): void {
        handlePageRequest({
            ...info,
            status: 0,
            error: info.error
        });
    }

    // Handle XHR response
    function handleXHRResponse(info: any): void {
        handlePageRequest(info);
        handlePageResponse({
            requestId: requestId,
            ...info
        });
    }

    // Set up DOM observer for API endpoint detection
    function setupDOMObserver(): void {
        const observer = new MutationObserver(function (mutations: MutationRecord[]) {
            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            detectAPIEndpoints(node as Element);
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial scan
        detectAPIEndpoints(document.body);
    }

    // Detect potential API endpoints in the DOM
    function detectAPIEndpoints(element: Element): void {
        if (!element.querySelectorAll) return;

        // Look for links that might be API endpoints
        const links = element.querySelectorAll('a[href*="api"], a[href*="/v1/"], a[href*="/v2/"], a[href*=".json"]');
        const endpoints: DetectedEndpoint[] = [];

        links.forEach(link => {
            const href = (link as HTMLAnchorElement).href;
            if (href && (href.includes('api') || href.includes('/v') || href.endsWith('.json'))) {
                endpoints.push({
                    url: href,
                    text: link.textContent?.trim() || '',
                    context: 'link'
                });
            }
        });

        // Look for script tags with API URLs
        const scripts = element.querySelectorAll('script');
        scripts.forEach(script => {
            if (script.textContent) {
                const apiUrls = extractAPIUrlsFromText(script.textContent);
                apiUrls.forEach(url => {
                    endpoints.push({
                        url: url,
                        context: 'script',
                        text: 'Found in script'
                    });
                });
            }
        });

        // Send detected endpoints to background
        if (endpoints.length > 0) {
            chrome.runtime.sendMessage({
                action: 'endpointsDetected',
                endpoints: endpoints,
                pageUrl: window.location.href
            });
        }
    }

    // Extract API URLs from text content
    function extractAPIUrlsFromText(text: string): string[] {
        const apiPatterns = [
            /https?:\/\/[^\s"']+\/api\/[^\s"']*/g,
            /https?:\/\/api\.[^\s"']+/g,
            /\/api\/[^\s"']*/g,
            /\/v\d+\/[^\s"']*/g
        ];

        const urls: string[] = [];

        apiPatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                urls.push(...matches);
            }
        });

        return [...new Set(urls)]; // Remove duplicates
    }

    // Inject a test request into the page
    function injectTestRequest(request: any): void {
        const script = document.createElement('script');
        script.textContent = `
          (function() {
              const request = ${JSON.stringify(request)};
              
              fetch(request.url, {
                  method: request.method,
                  headers: request.headers,
                  body: request.body
              }).then(response => {
                  console.log('API Tester: Test request completed', response);
                  return response.text();
              }).then(text => {
                  console.log('API Tester: Response body', text);
              }).catch(error => {
                  console.error('API Tester: Test request failed', error);
              });
          })();
      `;

        document.head.appendChild(script);
        script.remove();
    }

    // Update page configuration
    function updatePageConfiguration(): void {
        window.postMessage({
            type: 'API_TESTER_CONFIG',
            payload: CONFIG
        }, '*');
    }

    // Helper function to detect if page uses GraphQL
    function detectGraphQL(): boolean {
        // Look for GraphQL indicators
        const indicators = [
            'graphql',
            'apollo',
            'relay',
            '__schema',
            'query',
            'mutation',
            'subscription'
        ];

        const pageText = document.documentElement.textContent?.toLowerCase() || '';
        const scripts = Array.from(document.querySelectorAll('script')).map(s => (s as HTMLScriptElement).src).join(' ');

        return indicators.some(indicator =>
            pageText.includes(indicator) || scripts.includes(indicator)
        );
    }

    // Monitor for SPA route changes
    let currentUrl = window.location.href;
    function monitorURLChanges(): void {
        const observer = new MutationObserver(function () {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;

                // Notify about route change
                chrome.runtime.sendMessage({
                    action: 'routeChanged',
                    newUrl: currentUrl,
                    timestamp: Date.now()
                });

                // Re-scan for API endpoints
                setTimeout(() => {
                    detectAPIEndpoints(document.body);
                }, 1000);
            }
        });

        observer.observe(document, {
            subtree: true,
            childList: true
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeContentScript);
    } else {
        initializeContentScript();
    }

    // Start monitoring for URL changes in SPAs
    monitorURLChanges();

    // Detect and report page technology
    function detectPageTechnology(): void {
        const technologies: Technologies = {
            framework: detectFramework(),
            hasGraphQL: detectGraphQL(),
            hasRestAPI: detectRestAPI(),
            hasWebSocket: detectWebSocket()
        };

        chrome.runtime.sendMessage({
            action: 'pageTechnologyDetected',
            technologies: technologies,
            pageUrl: window.location.href
        });
    }

    function detectFramework(): string {
        if ((window as any).React) return 'React';
        if ((window as any).Vue) return 'Vue';
        if ((window as any).angular) return 'Angular';
        if ((window as any).jQuery) return 'jQuery';
        return 'Unknown';
    }

    function detectRestAPI(): boolean {
        const pageText = document.documentElement.textContent?.toLowerCase() || '';
        return pageText.includes('rest') || pageText.includes('api');
    }

    function detectWebSocket(): boolean {
        return 'WebSocket' in window && (document.documentElement.textContent?.toLowerCase().includes('websocket') || false);
    }

    // Run technology detection
    setTimeout(detectPageTechnology, 2000);

    console.log('API Tester content script initialized');
})();