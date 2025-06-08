// interceptorManager.ts
// ───────────────────────────────────────────────────────────────────────────────
// インターセプタ（ネットワークキャプチャ）の開始・停止・受信表示をまとめる

import type { RequestData } from './types';
import { showSuccess, showError, escapeHtml } from './utils';
import { loadRequestIntoEditor } from './requestManager';

interface InterceptorFilters {
    methods: string[];
    domain: string;
}

interface InterceptedRequest {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string | null;
    status?: number;
}

interface RuntimeMessage {
    action: string;
    request?: InterceptedRequest;
    filters?: InterceptorFilters;
}

interface RuntimeResponse {
    success?: boolean;
}

let _isActive = false;

/**
 * startInterceptor
 *  chrome.runtime に対して startInterceptor メッセージを送信し、
 *  onMessage で結果を受け取り、UI 更新
 */
export function startInterceptor(): void {
    if (_isActive) return;

    const filters = getInterceptorFilters();
    chrome.runtime.sendMessage({ action: 'startInterceptor', filters }, (response: RuntimeResponse) => {
        if (response?.success) {
            _isActive = true;
            const startBtn = document.getElementById('startInterceptorBtn') as HTMLButtonElement;
            const stopBtn = document.getElementById('stopInterceptorBtn') as HTMLButtonElement;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            showSuccess('Interceptor started');
        }
    });

    chrome.runtime.onMessage.addListener(handleInterceptedRequest);
}

/**
 * stopInterceptor
 *  chrome.runtime に対して stopInterceptor メッセージを送信し、
 *  onMessage リスナーを解除
 */
export function stopInterceptor(): void {
    if (!_isActive) return;

    chrome.runtime.sendMessage({ action: 'stopInterceptor' }, (response: RuntimeResponse) => {
        if (response?.success) {
            _isActive = false;
            const startBtn = document.getElementById('startInterceptorBtn') as HTMLButtonElement;
            const stopBtn = document.getElementById('stopInterceptorBtn') as HTMLButtonElement;
            startBtn.disabled = false;
            stopBtn.disabled = true;
            showSuccess('Interceptor stopped');
        }
    });

    chrome.runtime.onMessage.removeListener(handleInterceptedRequest);
}

/**
 * getInterceptorFilters
 *  DOM のチェックボックス／ドメイン入力欄を読み取ってフィルタ条件を返す
 */
export function getInterceptorFilters(): InterceptorFilters {
    const methodFilters: string[] = [];
    document.querySelectorAll('.method-filters input:checked').forEach(input => {
        const inputElement = input as HTMLInputElement;
        methodFilters.push(inputElement.value);
    });
    const domainFilterElement = document.getElementById('domainFilter') as HTMLInputElement;
    const domainFilter = domainFilterElement.value.trim();
    return { methods: methodFilters, domain: domainFilter };
}

/**
 * handleInterceptedRequest
 *  background.js→popup から送られてきた「requestIntercepted」メッセージを受け取り、
 *  displayInterceptedRequest を呼び出す
 */
export function handleInterceptedRequest(message: RuntimeMessage): void {
    if (message.action === 'requestIntercepted' && message.request) {
        displayInterceptedRequest(message.request);
    }
}

/**
 * displayInterceptedRequest
 *  受信したリクエストを画面に追加表示し、クリックでロード可能にする
 */
export function displayInterceptedRequest(request: InterceptedRequest): void {
    const container = document.getElementById('interceptorContainer') as HTMLElement;

    const requestDiv = document.createElement('div');
    requestDiv.className = 'intercepted-request';
    requestDiv.innerHTML = `
        <span class="history-method method-${request.method}">${request.method}</span>
        <span class="history-url">${escapeHtml(request.url)}</span>
        <span class="history-status status-${(request.status || 0) < 400 ? 'success' : 'error'}">${request.status || 'Pending'}</span>
        <span class="history-time">${new Date().toLocaleTimeString()}</span>
    `;

    requestDiv.addEventListener('click', () => {
        loadInterceptedRequest(request);
    });

    container.insertBefore(requestDiv, container.firstChild);

    // 50件以上になったら古いものを削除
    while (container.children.length > 50) {
        const lastChild = container.lastChild;
        if (lastChild) {
            container.removeChild(lastChild);
        }
    }
}

/**
 * loadInterceptedRequest
 *  キャプチャしたリクエストを右側エディタにロードする
 */
export async function loadInterceptedRequest(request: InterceptedRequest): Promise<void> {
    const convertedRequest: RequestData = {
        id: `intercepted_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: `Intercepted ${request.method} Request`,
        method: request.method,
        url: request.url,
        headers: request.headers || {},
        params: {},
        body: request.body || null,
        bodyType: "none",
        auth: { type: 'none' },
        preRequestScript: ""
    };
    loadRequestIntoEditor(convertedRequest);
    showSuccess('Request loaded from interceptor');
}