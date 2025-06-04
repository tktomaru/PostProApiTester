// injected.js
// ───────────────────────────────────────────────────────────────────────────────
// Injected script for API Tester Chrome Extension
// Runs in the page context to monitor network requests

(function () {
    'use strict';

    // Prevent multiple injection
    if (window.apiTesterInjected) {
        return;
    }
    window.apiTesterInjected = true;

    console.log('API Tester injected script loaded');

    // Configuration
    let config = {
        interceptFetch: true,
        interceptXHR: true,
        logRequests: false,
        autoCapture: false
    };

    // Request tracking
    let requestCounter = 0;
    const pendingRequests = new Map();

    // Store original functions
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalWebSocket = window.WebSocket;

    // Message communication with content script
    function sendMessage(type, payload) {
        window.postMessage({
            type: type,
            payload: payload,
            source: 'api-tester-injected'
        }, '*');
    }

    // Listen for configuration updates
    window.addEventListener('message', function (event) {
        if (event.data.type === 'API_TESTER_CONFIG') {
            config = { ...config, ...event.data.payload };
            console.log('API Tester: Configuration updated', config);
        }
    });

    // Override fetch function
    function overrideFetch() {
        window.fetch = function (...args) {
            const requestId = ++requestCounter;
            const startTime = performance.now();

            // Extract request information
            const requestInfo = extractFetchRequestInfo(args, requestId, startTime);

            // Store pending request
            pendingRequests.set(requestId, requestInfo);

            // Send request notification
            sendMessage('API_TESTER_REQUEST', requestInfo);

            if (config.logRequests) {
                console.group(`🚀 API Request #${requestId}`);
                console.log('URL:', requestInfo.url);
                console.log('Method:', requestInfo.method);
                console.log('Headers:', requestInfo.headers);
                console.log('Body:', requestInfo.body);
            }

            // Call original fetch
            const fetchPromise = originalFetch.apply(this, args);

            // Handle response
            return fetchPromise.then(response => {
                const endTime = performance.now();
                const responseInfo = extractFetchResponseInfo(response, requestId, endTime - startTime);

                // Send response notification
                sendMessage('API_TESTER_RESPONSE', responseInfo);

                if (config.logRequests) {
                    console.log('✅ Response received');
                    console.log('Status:', response.status, response.statusText);
                    console.log('Headers:', responseInfo.headers);
                    console.log('Duration:', responseInfo.duration + 'ms');
                    console.groupEnd();
                }

                // Clean up
                pendingRequests.delete(requestId);

                return response;
            }).catch(error => {
                const endTime = performance.now();
                const errorInfo = {
                    requestId: requestId,
                    error: error.message,
                    duration: endTime - startTime,
                    status: 0
                };

                sendMessage('API_TESTER_RESPONSE', errorInfo);

                if (config.logRequests) {
                    console.error('❌ Request failed:', error);
                    console.log('Duration:', errorInfo.duration + 'ms');
                    console.groupEnd();
                }

                pendingRequests.delete(requestId);
                throw error;
            });
        };
    }

    // Override XMLHttpRequest
    function overrideXHR() {
        XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
            const requestId = ++requestCounter;
            const startTime = performance.now();

            this._apiTesterInfo = {
                requestId: requestId,
                method: method.toUpperCase(),
                url: resolveURL(url),
                startTime: startTime,
                headers: {},
                body: null
            };

            // Override setRequestHeader to capture headers
            const originalSetRequestHeader = this.setRequestHeader;
            this.setRequestHeader = function (header, value) {
                this._apiTesterInfo.headers[header] = value;
                return originalSetRequestHeader.call(this, header, value);
            };

            return originalXHROpen.call(this, method, url, async, user, password);
        };

        XMLHttpRequest.prototype.send = function (body) {
            if (this._apiTesterInfo) {
                this._apiTesterInfo.body = body;

                // Store pending request
                pendingRequests.set(this._apiTesterInfo.requestId, this._apiTesterInfo);

                // Send request notification
                sendMessage('API_TESTER_REQUEST', {
                    requestId: this._apiTesterInfo.requestId,
                    url: this._apiTesterInfo.url,
                    method: this._apiTesterInfo.method,
                    headers: this._apiTesterInfo.headers,
                    body: this._apiTesterInfo.body,
                    initiator: 'XMLHttpRequest'
                });

                if (config.logRequests) {
                    console.group(`🚀 XHR Request #${this._apiTesterInfo.requestId}`);
                    console.log('URL:', this._apiTesterInfo.url);
                    console.log('Method:', this._apiTesterInfo.method);
                    console.log('Headers:', this._apiTesterInfo.headers);
                    console.log('Body:', this._apiTesterInfo.body);
                }

                // Add event listeners
                const self = this;
                this.addEventListener('loadend', function () {
                    const endTime = performance.now();
                    const duration = endTime - self._apiTesterInfo.startTime;

                    const responseInfo = {
                        requestId: self._apiTesterInfo.requestId,
                        status: self.status,
                        statusText: self.statusText,
                        headers: parseXHRResponseHeaders(self.getAllResponseHeaders()),
                        body: self.responseText,
                        duration: duration,
                        size: self.responseText ? new Blob([self.responseText]).size : 0
                    };

                    sendMessage('API_TESTER_RESPONSE', responseInfo);

                    if (config.logRequests) {
                        console.log('✅ XHR Response received');
                        console.log('Status:', self.status, self.statusText);
                        console.log('Duration:', duration + 'ms');
                        console.groupEnd();
                    }

                    pendingRequests.delete(self._apiTesterInfo.requestId);
                });

                this.addEventListener('error', function () {
                    const endTime = performance.now();
                    const duration = endTime - self._apiTesterInfo.startTime;

                    const errorInfo = {
                        requestId: self._apiTesterInfo.requestId,
                        error: 'Network error',
                        duration: duration,
                        status: 0
                    };

                    sendMessage('API_TESTER_RESPONSE', errorInfo);

                    if (config.logRequests) {
                        console.error('❌ XHR Request failed');
                        console.log('Duration:', duration + 'ms');
                        console.groupEnd();
                    }

                    pendingRequests.delete(self._apiTesterInfo.requestId);
                });
            }

            return originalXHRSend.call(this, body);
        };
    }

    // Override WebSocket for WebSocket API monitoring
    function overrideWebSocket() {
        window.WebSocket = function (url, protocols) {
            const requestId = ++requestCounter;
            const startTime = performance.now();

            const ws = new originalWebSocket(url, protocols);

            // Send WebSocket connection notification
            sendMessage('API_TESTER_REQUEST', {
                requestId: requestId,
                url: url,
                method: 'WEBSOCKET',
                headers: {},
                body: null,
                initiator: 'WebSocket',
                protocols: protocols
            });

            if (config.logRequests) {
                console.group(`🔌 WebSocket Connection #${requestId}`);
                console.log('URL:', url);
                console.log('Protocols:', protocols);
            }

            // Override send method to monitor messages
            const originalSend = ws.send;
            ws.send = function (data) {
                if (config.logRequests) {
                    console.log('📤 WebSocket Send:', data);
                }

                sendMessage('API_TESTER_WEBSOCKET_SEND', {
                    requestId: requestId,
                    data: data,
                    timestamp: Date.now()
                });

                return originalSend.call(this, data);
            };

            // Monitor WebSocket events
            ws.addEventListener('open', function () {
                const duration = performance.now() - startTime;

                sendMessage('API_TESTER_RESPONSE', {
                    requestId: requestId,
                    status: 101,
                    statusText: 'Switching Protocols',
                    headers: {},
                    body: 'WebSocket connection established',
                    duration: duration
                });

                if (config.logRequests) {
                    console.log('✅ WebSocket Connected');
                    console.log('Duration:', duration + 'ms');
                }
            });

            ws.addEventListener('message', function (event) {
                if (config.logRequests) {
                    console.log('📥 WebSocket Message:', event.data);
                }

                sendMessage('API_TESTER_WEBSOCKET_MESSAGE', {
                    requestId: requestId,
                    data: event.data,
                    timestamp: Date.now()
                });
            });

            ws.addEventListener('close', function (event) {
                if (config.logRequests) {
                    console.log('🔌 WebSocket Closed:', event.code, event.reason);
                    console.groupEnd();
                }

                sendMessage('API_TESTER_WEBSOCKET_CLOSE', {
                    requestId: requestId,
                    code: event.code,
                    reason: event.reason,
                    timestamp: Date.now()
                });
            });

            ws.addEventListener('error', function (event) {
                if (config.logRequests) {
                    console.error('❌ WebSocket Error:', event);
                    console.groupEnd();
                }

                sendMessage('API_TESTER_WEBSOCKET_ERROR', {
                    requestId: requestId,
                    error: 'WebSocket error',
                    timestamp: Date.now()
                });
            });

            return ws;
        };

        // Copy static properties
        Object.setPrototypeOf(window.WebSocket, originalWebSocket);
        window.WebSocket.prototype = originalWebSocket.prototype;
        window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
        window.WebSocket.OPEN = originalWebSocket.OPEN;
        window.WebSocket.CLOSING = originalWebSocket.CLOSING;
        window.WebSocket.CLOSED = originalWebSocket.CLOSED;
    }

    // Helper functions
    function extractFetchRequestInfo(args, requestId, startTime) {
        const [input, init = {}] = args;

        let url, method, headers, body;

        if (typeof input === 'string') {
            url = input;
        } else if (input instanceof Request) {
            url = input.url;
            method = input.method;
            headers = extractHeaders(input.headers);
            // Note: body is not easily extractable from Request object
        } else {
            url = input.url || input;
        }

        method = method || init.method || 'GET';
        headers = headers || extractHeaders(init.headers) || {};
        body = body || init.body || null;

        return {
            requestId: requestId,
            url: resolveURL(url),
            method: method.toUpperCase(),
            headers: headers,
            body: serializeBody(body),
            initiator: 'fetch',
            startTime: startTime
        };
    }

    function extractFetchResponseInfo(response, requestId, duration) {
        return {
            requestId: requestId,
            status: response.status,
            statusText: response.statusText,
            headers: extractHeaders(response.headers),
            duration: duration,
            size: null, // Will be calculated when body is read
            redirected: response.redirected,
            url: response.url,
            type: response.type
        };
    }

    function extractHeaders(headers) {
        if (!headers) return {};

        const result = {};

        if (headers instanceof Headers) {
            for (const [key, value] of headers.entries()) {
                result[key] = value;
            }
        } else if (typeof headers === 'object') {
            Object.assign(result, headers);
        }

        return result;
    }

    function parseXHRResponseHeaders(headerString) {
        const headers = {};
        if (!headerString) return headers;

        headerString.trim().split('\r\n').forEach(line => {
            const parts = line.split(': ');
            if (parts.length === 2) {
                headers[parts[0]] = parts[1];
            }
        });

        return headers;
    }

    function resolveURL(url) {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        if (url.startsWith('//')) {
            return window.location.protocol + url;
        }
        if (url.startsWith('/')) {
            return window.location.origin + url;
        }
        return new URL(url, window.location.href).href;
    }

    function serializeBody(body) {
        if (!body) return null;

        if (typeof body === 'string') {
            return body;
        }

        if (body instanceof FormData) {
            const result = {};
            for (const [key, value] of body.entries()) {
                result[key] = value;
            }
            return JSON.stringify(result);
        }

        if (body instanceof URLSearchParams) {
            return body.toString();
        }

        if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
            return '[Binary Data]';
        }

        if (body instanceof Blob) {
            return '[Blob Data]';
        }

        try {
            return JSON.stringify(body);
        } catch (e) {
            return String(body);
        }
    }

    // GraphQL detection and monitoring
    function detectGraphQLRequests() {
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check for GraphQL-related attributes or content
                        if (node.textContent && node.textContent.includes('query') &&
                            (node.textContent.includes('{') || node.textContent.includes('mutation'))) {

                            sendMessage('API_TESTER_GRAPHQL_DETECTED', {
                                query: node.textContent,
                                element: node.tagName,
                                timestamp: Date.now()
                            });
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // Monitor console for API-related logs
    function monitorConsole() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        console.log = function (...args) {
            checkForAPILogs('log', args);
            return originalLog.apply(console, args);
        };

        console.error = function (...args) {
            checkForAPILogs('error', args);
            return originalError.apply(console, args);
        };

        console.warn = function (...args) {
            checkForAPILogs('warn', args);
            return originalWarn.apply(console, args);
        };
    }

    function checkForAPILogs(level, args) {
        const message = args.join(' ').toLowerCase();
        if (message.includes('api') || message.includes('xhr') || message.includes('fetch') ||
            message.includes('http') || message.includes('request')) {

            sendMessage('API_TESTER_CONSOLE_LOG', {
                level: level,
                message: args.join(' '),
                timestamp: Date.now()
            });
        }
    }

    // Performance monitoring
    function monitorPerformance() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver(function (list) {
                list.getEntries().forEach(function (entry) {
                    if (entry.entryType === 'navigation' || entry.entryType === 'resource') {
                        if (entry.name.includes('api') || entry.name.includes('/v1/') ||
                            entry.name.includes('/v2/') || entry.name.endsWith('.json')) {

                            sendMessage('API_TESTER_PERFORMANCE', {
                                name: entry.name,
                                type: entry.entryType,
                                duration: entry.duration,
                                size: entry.transferSize,
                                timestamp: entry.startTime
                            });
                        }
                    }
                });
            });

            try {
                observer.observe({ entryTypes: ['navigation', 'resource'] });
            } catch (e) {
                console.warn('Performance monitoring not supported:', e);
            }
        }
    }

    // Cookie monitoring
    function monitorCookies() {
        const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
            Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

        if (originalCookie) {
            Object.defineProperty(document, 'cookie', {
                get: function () {
                    return originalCookie.get.call(document);
                },
                set: function (value) {
                    sendMessage('API_TESTER_COOKIE_SET', {
                        cookie: value,
                        timestamp: Date.now()
                    });
                    return originalCookie.set.call(document, value);
                }
            });
        }
    }

    // Local/Session Storage monitoring
    function monitorStorage() {
        const originalSetItem = Storage.prototype.setItem;
        const originalRemoveItem = Storage.prototype.removeItem;
        const originalClear = Storage.prototype.clear;

        Storage.prototype.setItem = function (key, value) {
            sendMessage('API_TESTER_STORAGE_SET', {
                type: this === localStorage ? 'localStorage' : 'sessionStorage',
                key: key,
                value: value,
                timestamp: Date.now()
            });
            return originalSetItem.call(this, key, value);
        };

        Storage.prototype.removeItem = function (key) {
            sendMessage('API_TESTER_STORAGE_REMOVE', {
                type: this === localStorage ? 'localStorage' : 'sessionStorage',
                key: key,
                timestamp: Date.now()
            });
            return originalRemoveItem.call(this, key);
        };

        Storage.prototype.clear = function () {
            sendMessage('API_TESTER_STORAGE_CLEAR', {
                type: this === localStorage ? 'localStorage' : 'sessionStorage',
                timestamp: Date.now()
            });
            return originalClear.call(this);
        };
    }

    // Initialize all monitoring
    function initialize() {
        if (config.interceptFetch) {
            overrideFetch();
        }

        if (config.interceptXHR) {
            overrideXHR();
        }

        overrideWebSocket();
        detectGraphQLRequests();
        monitorConsole();
        monitorPerformance();
        monitorCookies();
        monitorStorage();

        // Send initialization complete message
        sendMessage('API_TESTER_INITIALIZED', {
            url: window.location.href,
            timestamp: Date.now(),
            userAgent: navigator.userAgent
        });
    }

    // Expose API for manual testing
    window.apiTester = {
        getConfig: () => config,
        setConfig: (newConfig) => {
            config = { ...config, ...newConfig };
            sendMessage('API_TESTER_CONFIG_CHANGED', config);
        },
        getPendingRequests: () => Array.from(pendingRequests.values()),
        clearPendingRequests: () => pendingRequests.clear(),
        testRequest: function (url, options = {}) {
            return fetch(url, options);
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    console.log('API Tester injected script initialized');

})();