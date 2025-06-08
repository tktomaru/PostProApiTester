// historyManager.ts
// ───────────────────────────────────────────────────────────────────────────────
// 履歴の記録、表示、クリック時にリクエストを復元するロジック

import type { RequestData, ResponseData, HistoryItem } from './types';
import { saveHistoryToStorage, state } from './state';
import { escapeHtml, showSuccess } from './utils';
import { loadRequestIntoEditor } from './requestManager';

/**
 * renderHistory
 *  history 配列を画面に描画する
 */
export function renderHistory(): void {
    const container = document.getElementById('historyContainer') as HTMLElement;

    if (state.history.length === 0) {
        container.innerHTML = '<p class="empty-message">No request history</p>';
        return;
    }

    container.innerHTML = '';
    state.history.forEach(item => {
        const historyDiv = document.createElement('div');
        historyDiv.className = 'history-item';
        historyDiv.dataset.id = item.id.toString();

        const method = item.request?.method || 'GET';
        const url = item.request?.url || '';
        const status = item.response?.status || 0;

        historyDiv.innerHTML = `
            <span class="history-method method-${method}">${method}</span>
            <span class="history-url">${escapeHtml(url)}</span>
            <span class="history-status status-${status < 400 ? 'success' : 'error'}">${status || 'N/A'}</span>
            <span class="history-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
        `;

        historyDiv.addEventListener('click', () => loadHistoryItem(item.id));
        container.appendChild(historyDiv);
    });
}

/**
 * saveToHistory
 *  リクエストとレスポンスを履歴配列に追加して保存し、renderHistory を呼び出す
 */
export async function saveToHistory(request: RequestData, response: ResponseData): Promise<void> {
    const historyItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        request: {
            id: request.id,
            name: request.name,
            method: request.method,
            url: request.url,
            headers: request.headers,
            params: request.params,
            body: request.body,
            bodyType: request.bodyType,
            auth: request.auth,
            preRequestScript: request.preRequestScript
        },
        response: {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: response.body,
            bodyText: response.bodyText,
            duration: response.duration,
            size: response.size
        }
    };

    state.history.unshift(historyItem);
    if (state.history.length > 100) {
        state.history.splice(100); // 最新 100 件だけ保持
    }

    await saveHistoryToStorage();
    renderHistory();
}

/**
 * loadHistoryItem
 *  クリックされた履歴アイテムのリクエストを復元し、エディタにロードする
 */
export async function loadHistoryItem(historyId: string): Promise<void> {
    const item = state.history.find(h => h.id === historyId);
    if (!item || !item.request) return;

    loadRequestIntoEditor(item.request);
    showSuccess('Request loaded from history');
}

/**
 * clearHistory
 *  全履歴をクリアして保存 → レンダリング
 */
export async function clearHistory(): Promise<void> {
    if (!confirm('Are you sure you want to clear all request history?')) return;
    state.history.length = 0;
    await saveHistoryToStorage();
    renderHistory();
    showSuccess('History cleared');
}

/**
 * filterHistory
 *  検索キーワードをもとに履歴一覧をフィルタリング
 */
export function filterHistory(): void {
    const searchInput = document.getElementById('historySearch') as HTMLInputElement;
    const searchTerm = searchInput.value.toLowerCase();
    const historyItems = document.querySelectorAll('.history-item');

    historyItems.forEach(item => {
        const htmlItem = item as HTMLElement;
        const urlElement = htmlItem.querySelector('.history-url') as HTMLElement;
        const methodElement = htmlItem.querySelector('.history-method') as HTMLElement;
        
        const url = urlElement.textContent?.toLowerCase() || '';
        const method = methodElement.textContent?.toLowerCase() || '';

        if (url.includes(searchTerm) || method.includes(searchTerm)) {
            htmlItem.style.display = 'flex';
        } else {
            htmlItem.style.display = 'none';
        }
    });
}