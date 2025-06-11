// interceptorManager.ts
// ───────────────────────────────────────────────────────────────────────────────
// ネットワークインターセプターの管理
// ネットワークキャプチャの開始・停止・受信表示を管理

import type { RequestData } from './types';
import { showSuccess, escapeHtml } from './utils';
import { loadRequestIntoEditor } from './requestManager';

/**
 * インターセプターフィルター設定
 * キャプチャするリクエストの絞り込み条件
 */
interface InterceptorFilters {
    methods: string[];  // キャプチャ対象のHTTPメソッド
    domain: string;     // キャプチャ対象のドメイン
}

/**
 * キャプチャされたリクエストの情報
 * インターセプトされたリクエストの詳細データ
 */
interface InterceptedRequest {
    method: string;                      // HTTPメソッド
    url: string;                         // リクエストURL
    headers?: Record<string, string>;    // リクエストヘッダー
    body?: string | null;                // リクエストボディ
    status?: number;                     // レスポンスステータスコード
}

/**
 * ランタイムメッセージの形式
 * backgroundスクリプトとの通信に使用
 */
interface RuntimeMessage {
    action: string;                      // アクションタイプ
    request?: InterceptedRequest;        // キャプチャされたリクエスト（オプション）
    filters?: InterceptorFilters;        // フィルター設定（オプション）
}

/**
 * ランタイムレスポンスの形式
 * backgroundスクリプトからの応答
 */
interface RuntimeResponse {
    success?: boolean;  // 操作の成功・失敗
}

// インターセプターの状態管理
let _isActive = false;  // インターセプターがアクティブかどうか

/**
 * インターセプターの開始
 * backgroundスクリプトにstartInterceptorメッセージを送信し、
 * メッセージリスナーを設定してUIを更新
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
 * インターセプターの停止
 * backgroundスクリプトにstopInterceptorメッセージを送信し、
 * メッセージリスナーを解除してUIを更新
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
 * インターセプターフィルターの取得
 * DOMからメソッドフィルターとドメインフィルターを読み取り、
 * フィルター条件オブジェクトを作成
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
 * キャプチャされたリクエストのハンドリング
 * backgroundスクリプトからの「requestIntercepted」メッセージを受け取り、
 * キャプチャされたリクエストを表示処理に渡す
 */
export function handleInterceptedRequest(message: RuntimeMessage): void {
    if (message.action === 'requestIntercepted' && message.request) {
        displayInterceptedRequest(message.request);
    }
}

/**
 * キャプチャされたリクエストの表示
 * 受信したリクエストをUIに追加表示し、
 * クリックでエディターにロード可能にする
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

    // 50件以上になったら古いものを削除（メモリ節約）
    while (container.children.length > 50) {
        const lastChild = container.lastChild;
        if (lastChild) {
            container.removeChild(lastChild);
        }
    }
}

/**
 * キャプチャしたリクエストのロード
 * キャプチャしたリクエストをRequestData形式に変換し、
 * メインエディターにロードして編集可能にする
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