// historyManager.js
// ───────────────────────────────────────────────────────────────────────────────
// 履歴の記録、表示、クリック時にリクエストを復元するロジック

import { history, saveHistoryToStorage } from './state.js';
import { escapeHtml } from './utils.js';
import { showSuccess } from './utils.js';

/**
 * renderHistory
 *  history 配列を画面に描画する
 */
export function renderHistory() {
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

        const method = item.request?.method || item.method || 'GET';
        const url = item.request?.url || item.url || '';
        const status = item.response?.status || item.status || 0;

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
export async function saveToHistory(request, response) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        request: {
            method: request.method,
            url: request.url,
            headers: request.headers,
            params: request.params,
            body: request.body,
            auth: request.auth
        },
        response: {
            status: response.status,
            duration: response.duration,
            size: response.size
        }
    };

    history.unshift(historyItem);
    if (history.length > 100) {
        history.splice(100); // 最新 100 件だけ保持
    }

    await saveHistoryToStorage();
    renderHistory();
}

/**
 * loadHistoryItem
 *  クリックされた履歴アイテムのリクエストを復元し、エディタにロードする
 */
export async function loadHistoryItem(historyId) {
    const item = history.find(h => h.id == historyId);
    if (!item || !item.request) return;

    const { loadRequestIntoEditor } = await import('./requestManager.js');
    loadRequestIntoEditor(item.request);
    showSuccess('Request loaded from history');
}

/**
 * clearHistory
 *  全履歴をクリアして保存 → レンダリング
 */
export async function clearHistory() {
    if (!confirm('Are you sure you want to clear all request history?')) return;
    history.length = 0;
    await saveHistoryToStorage();
    renderHistory();
    showSuccess('History cleared');
}

/**
 * filterHistory
 *  検索キーワードをもとに履歴一覧をフィルタリング
 */
export function filterHistory() {
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
