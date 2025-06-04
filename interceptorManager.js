// interceptorManager.js
// ───────────────────────────────────────────────────────────────────────────────
// インターセプタ（ネットワークキャプチャ）の開始・停止・受信表示をまとめる

import { showSuccess, showError, escapeHtml } from './utils.js';

let _isActive = false;

/**
 * startInterceptor
 *  chrome.runtime に対して startInterceptor メッセージを送信し、
 *  onMessage で結果を受け取り、UI 更新
 */
export function startInterceptor() {
    if (_isActive) return;

    const filters = getInterceptorFilters();
    chrome.runtime.sendMessage({ action: 'startInterceptor', filters }, response => {
        if (response?.success) {
            _isActive = true;
            document.getElementById('startInterceptorBtn').disabled = true;
            document.getElementById('stopInterceptorBtn').disabled = false;
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
export function stopInterceptor() {
    if (!_isActive) return;

    chrome.runtime.sendMessage({ action: 'stopInterceptor' }, response => {
        if (response?.success) {
            _isActive = false;
            document.getElementById('startInterceptorBtn').disabled = false;
            document.getElementById('stopInterceptorBtn').disabled = true;
            showSuccess('Interceptor stopped');
        }
    });

    chrome.runtime.onMessage.removeListener(handleInterceptedRequest);
}

/**
 * getInterceptorFilters
 *  DOM のチェックボックス／ドメイン入力欄を読み取ってフィルタ条件を返す
 */
export function getInterceptorFilters() {
    const methodFilters = [];
    document.querySelectorAll('.method-filters input:checked').forEach(input => {
        methodFilters.push(input.value);
    });
    const domainFilter = document.getElementById('domainFilter').value.trim();
    return { methods: methodFilters, domain: domainFilter };
}

/**
 * handleInterceptedRequest
 *  background.js→popup から送られてきた「requestIntercepted」メッセージを受け取り、
 *  displayInterceptedRequest を呼び出す
 */
export function handleInterceptedRequest(message) {
    if (message.action === 'requestIntercepted') {
        displayInterceptedRequest(message.request);
    }
}

/**
 * displayInterceptedRequest
 *  受信したリクエストを画面に追加表示し、クリックでロード可能にする
 */
export function displayInterceptedRequest(request) {
    const container = document.getElementById('interceptorContainer');

    const requestDiv = document.createElement('div');
    requestDiv.className = 'intercepted-request';
    requestDiv.innerHTML = `
        <span class="history-method method-${request.method}">${request.method}</span>
        <span class="history-url">${escapeHtml(request.url)}</span>
        <span class="history-status status-${request.status < 400 ? 'success' : 'error'}">${request.status || 'Pending'}</span>
        <span class="history-time">${new Date().toLocaleTimeString()}</span>
    `;

    requestDiv.addEventListener('click', () => {
        loadInterceptedRequest(request);
    });

    container.insertBefore(requestDiv, container.firstChild);

    // 50件以上になったら古いものを削除
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

/**
 * loadInterceptedRequest
 *  キャプチャしたリクエストを右側エディタにロードする
 */
export async function loadInterceptedRequest(request) {
    const convertedRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers || {},
        params: {},
        body: request.body || null,
        auth: { type: 'none' }
    };
    const { loadRequestIntoEditor } = await import('./requestManager.js');
    loadRequestIntoEditor(convertedRequest);
    showSuccess('Request loaded from interceptor');
}
