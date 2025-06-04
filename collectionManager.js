// collectionManager.js
// ───────────────────────────────────────────────────────────────────────────────
// コレクション一覧の表示・選択・編集・削除などをまとめる

import {
    collections,
    currentCollection,
    saveCollectionsToStorage,
    saveCurrentCollectionToStorage
} from './state.js';

import { escapeHtml } from './utils.js';
import { showSuccess } from './utils.js';

/**
 * renderCollections
 *  コレクション一覧を画面に描画する
 */
export function renderCollections() {
    const container = document.getElementById('collectionsContainer');

    if (collections.length === 0) {
        container.innerHTML = '<p class="empty-message">No collections created</p>';
        return;
    }

    container.innerHTML = '';
    collections.forEach(collection => {
        const item = document.createElement('div');
        item.className = 'collection-item';
        item.dataset.id = collection.id;
        if (currentCollection == collection.id) {
            item.classList.add('active');
        }

        item.innerHTML = `
            <div class="collection-name">${escapeHtml(collection.name)}</div>
            <div class="collection-meta">${collection.requests?.length || 0} requests</div>
        `;

        item.addEventListener('click', () => selectCollection(collection.id));
        container.appendChild(item);
    });
}

/**
 * selectCollection
 *  コレクションを選択し、画面上の強調・リクエスト一覧を更新する
 */
export async function selectCollection(collectionId) {
    currentCollection = collectionId;
    await saveCurrentCollectionToStorage();

    document.querySelectorAll('.collection-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id == collectionId);
    });

    renderCollectionRequests(collectionId);

    const collectionVarSelect = document.getElementById('collectionVarSelect');
    if (collectionVarSelect) {
        collectionVarSelect.value = collectionId;
        // variableManager.js の renderVariables('collection') を呼び出す想定
        const { renderVariables } = await import('./variableManager.js');
        renderVariables('collection');
    }
}

/**
 * renderCollectionRequests
 *  選択中のコレクションに属するリクエスト一覧を描画する
 */
export function renderCollectionRequests(collectionId) {
    const collection = collections.find(c => c.id == collectionId);
    if (!collection) return;

    const header = document.getElementById('collectionRequestsHeader');
    const container = document.getElementById('collectionRequestsContainer');

    header.innerHTML = `
        <h4>${escapeHtml(collection.name)}</h4>
        <button class="btn btn-sm addRequestToCollection">Add Request</button>
    `;
    // ボタンにイベントを紐づけ
    const btn = header.querySelector('.addRequestToCollection');
    btn.addEventListener('click', () => addRequestToCollection(collectionId));

    container.innerHTML = '';

    if (!collection.requests || collection.requests.length === 0) {
        container.innerHTML = '<p class="empty-message">No requests in this collection</p>';
        return;
    }

    collection.requests.forEach((request, index) => {
        const requestItem = document.createElement('div');
        requestItem.className = 'collection-request';
        requestItem.innerHTML = `
            <span class="request-method-badge method-${request.method}">${request.method}</span>
            <span class="request-name">${escapeHtml(request.name || 'Untitled Request')}</span>
            <span class="request-url">${escapeHtml(request.url)}</span>
            <div class="request-actions">
                <button class="btn-icon edit-btn">✏️</button>
                <button class="btn-icon delete-btn">🗑️</button>
            </div>
        `;

        // 編集ボタン
        const editBtn = requestItem.querySelector('.edit-btn');
        editBtn.addEventListener('click', () => editCollectionRequest(collectionId, index));

        // 削除ボタン
        const deleteBtn = requestItem.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => deleteCollectionRequest(collectionId, index));

        // リクエスト名・URL をクリックするとエディタにロード
        requestItem.addEventListener('click', e => {
            if (!e.target.closest('.request-actions')) {
                loadCollectionRequest(request);
            }
        });

        container.appendChild(requestItem);
    });
}

/**
 * addRequestToCollection
 *  新しいリクエストをコレクションに追加し、Storage に保存 → 再レンダリング
 */
export async function addRequestToCollection(collectionId) {
    const name = prompt('Enter request name:');
    if (!name) return;

    const collection = collections.find(c => c.id == collectionId);
    if (!collection) return;

    if (!collection.requests) {
        collection.requests = [];
    }

    const newRequest = {
        id: Date.now(),
        name: name,
        method: 'GET',
        url: '',
        headers: {},
        params: {},
        body: null,
        auth: { type: 'none' }
    };

    collection.requests.push(newRequest);
    await saveCollectionsToStorage();

    renderCollectionRequests(collectionId);
    loadCollectionRequest(newRequest);
}

/**
 * editCollectionRequest
 *  コレクション内のリクエスト名を変更して再保存 → 再レンダリング
 */
export async function editCollectionRequest(collectionId, requestIndex) {
    const collection = collections.find(c => c.id == collectionId);
    if (!collection || !collection.requests || !collection.requests[requestIndex]) return;

    const request = collection.requests[requestIndex];
    const newName = prompt('Edit request name:', request.name);

    if (newName && newName !== request.name) {
        request.name = newName;
        await saveCollectionsToStorage();
        renderCollectionRequests(collectionId);
        showSuccess('Request renamed');
    }
}

/**
 * deleteCollectionRequest
 *  コレクション内のリクエストを削除して再保存 → 再レンダリング
 */
export async function deleteCollectionRequest(collectionId, requestIndex) {
    if (!confirm('Delete this request?')) return;

    const collection = collections.find(c => c.id == collectionId);
    if (!collection || !collection.requests) return;

    collection.requests.splice(requestIndex, 1);
    await saveCollectionsToStorage();

    renderCollectionRequests(collectionId);
    showSuccess('Request deleted');
}

/**
 * loadCollectionRequest
 *  コレクション内リクエストを右側エディタにロードする
 *  （実装は requestManager.js 側に移譲してもOK）
 */
export async function loadCollectionRequest(request) {
    const { loadRequestIntoEditor } = await import('./requestManager.js');
    loadRequestIntoEditor(request);
    showSuccess('Request loaded from collection');
}
