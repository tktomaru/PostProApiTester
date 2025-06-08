// collectionManager.ts
// ───────────────────────────────────────────────────────────────────────────────
// コレクション一覧の表示・選択・編集・削除などをまとめる

import type { Collection, RequestData } from './types';
import {
    saveCollectionsToStorage,
    saveCurrentCollectionToStorage,
    state
} from './state';
import { sampleCollections } from './defaultData';
import { escapeHtml, showSuccess } from './utils';
import { updateCollectionVarSelector, renderVariables } from './variableManager';
import { addRequestToScenario } from './scenarioManager';
import { loadRequestIntoEditor } from './requestManager';

/**
 * initializeCollections：起動時にコレクション一覧をロードし、必要ならサンプルを投入する
 */
export async function initializeCollections(): Promise<void> {
    try {
        const stored = await chrome.storage.local.get(['collections']);
        if (!stored.collections || stored.collections.length === 0) {
            // まだコレクションがなければサンプルを投入
            state.collections.splice(0, state.collections.length, ...sampleCollections);
            await chrome.storage.local.set({ collections: state.collections });
        } else {
            // すでにあればそちらを優先
            state.collections.splice(0, state.collections.length, ...stored.collections);
        }

        // 画面にレンダリング
        renderCollectionsTree();

        // コレクション変数セレクタも更新
        updateCollectionVarSelector();
    } catch (error) {
        console.error('Error initializing collections:', error);
    }
}

/**
 * selectCollection
 *  コレクションを選択し、画面上の強調・リクエスト一覧を更新する
 */
export async function selectCollection(collectionId: string): Promise<void> {
    state.currentCollection = collectionId;
    await saveCurrentCollectionToStorage();

    // コレクション行の active 切り替え
    document.querySelectorAll('.collection-item').forEach(item => {
        const element = item as HTMLElement;
        element.classList.toggle('active', element.dataset.id == collectionId);
    });

    // 変数セレクタ更新
    const collectionVarSelect = document.getElementById('collectionVarSelect') as HTMLSelectElement;
    if (collectionVarSelect) {
        collectionVarSelect.value = collectionId;
        renderVariables('collection');
    }
}

/**
 * addRequestToCollection
 *  新しいリクエストをコレクションに追加し、Storage に保存 → 再レンダリング
 */
export async function addRequestToCollection(collectionId: string): Promise<void> {
    const name = prompt('Enter request name:');
    if (!name) return;

    const collection = state.collections.find(c => c.id == collectionId);
    if (!collection) return;

    if (!collection.requests) {
        collection.requests = [];
    }

    const newRequest: RequestData = {
        id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: name,
        method: 'GET',
        url: '',
        headers: {},
        params: {},
        body: null,
        bodyType: "none",
        auth: { type: 'none' },
        preRequestScript: "",
    };

    collection.requests.push(newRequest);
    await saveCollectionsToStorage();

    loadCollectionRequest(newRequest);
}

/**
 * editCollectionRequest
 *  コレクション内のリクエスト名を変更して再保存 → 再レンダリング
 */
export async function editCollectionRequest(collectionId: string, requestIndex: number): Promise<void> {
    const collection = state.collections.find(c => c.id == collectionId);
    if (!collection || !collection.requests || !collection.requests[requestIndex]) return;

    const request = collection.requests[requestIndex];
    const newName = prompt('Edit request name:', request.name);

    if (newName && newName !== request.name) {
        request.name = newName;
        await saveCollectionsToStorage();
        showSuccess('Request renamed');
    }
    // ④ 画面再描画
    renderCollectionsTree();                // サイドバーのコレクション一覧
}

/**
 * loadCollectionRequest
 *  コレクション内リクエストを右側エディタにロードする
 *  （実装は requestManager.js 側に移譲してもOK）
 */
export async function loadCollectionRequest(request: RequestData): Promise<void> {
    // リクエストが属するコレクションを探して選択
    const collection = state.collections.find(c => c.requests?.some(r => r.id === request.id));
    if (collection) {
        await selectCollection(collection.id);
    }

    loadRequestIntoEditor(request);
    showSuccess('Request loaded from collection');
}

export function createNewCollection(): void {
    const name = prompt('Enter collection name:');
    if (!name) return;

    const collection: Collection = {
        id: Date.now().toString(),
        name: name,
        requests: []
    };

    state.collections.push(collection);
    chrome.storage.local.set({ collections: state.collections });
    renderCollectionsTree();         // サイドバーのコレクション描画
    updateCollectionVarSelector();

    showSuccess('Collection created: ' + name);
}

/**
 * deleteCollection
 *  指定された ID のコレクションを削除し、Storage に保存 → 再描画
 */
async function deleteCollection(collectionId: string): Promise<void> {
    if (!confirm('本当にこのコレクションを削除しますか？')) {
        return;
    }

    // state.collections から該当を取り除く
    const idx = state.collections.findIndex(col => col.id == collectionId);
    if (idx === -1) return;

    state.collections.splice(idx, 1);
    await saveCollectionsToStorage();

    // currentCollection が削除されたものを指していたらクリア
    if (state.currentCollection == collectionId) {
        state.currentCollection = null;
        await saveCurrentCollectionToStorage();
    }

    // ツリーを再描画
    renderCollectionsTree();
    showSuccess('コレクションを削除しました');
}

/**
 * deleteRequestFromCollection
 *  collectionId 内の requestIndex 番目を削除して再保存 → 再描画
 */
async function deleteRequestFromCollection(collectionId: string, requestIndex: number): Promise<void> {
    if (!confirm('本当にこのリクエストを削除しますか？')) return;

    const col = state.collections.find(c => c.id == collectionId);
    if (!col || !col.requests || requestIndex < 0 || requestIndex >= col.requests.length) return;

    col.requests.splice(requestIndex, 1);
    await saveCollectionsToStorage();

    // 削除後のツリーを再描画
    renderCollectionsTree();
    showSuccess('リクエストを削除しました');
}

/**
 * renderCollectionsTree
 *  state.collections の内容をもとに、サイドバーに「コレクション行＋子リクエスト一覧」を描画
 */
export function renderCollectionsTree(): void {
    const container = document.getElementById('collectionsTree');
    if (!container) return;
    
    container.innerHTML = ''; // まずクリア

    state.collections.forEach((col) => {
        // ① コレクション行
        const colDiv = document.createElement('div');
        colDiv.className = 'collection-item';
        colDiv.dataset.id = col.id;

        // 「▶」トグルアイコン
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.textContent = '▶';
        colDiv.appendChild(toggleIcon);

        // フォルダアイコン
        const folderIcon = document.createElement('span');
        folderIcon.className = 'collection-icon';
        folderIcon.textContent = '📁';
        colDiv.appendChild(folderIcon);

        // コレクション名
        const nameSpan = document.createElement('span');
        nameSpan.className = 'collection-name';
        nameSpan.textContent = col.name;
        colDiv.appendChild(nameSpan);

        // ◆ Add to Request ボタン追加
        const addToCollectionBtn = document.createElement('span');
        addToCollectionBtn.className = 'request-collection-request-create-btn';
        addToCollectionBtn.textContent = '🌱';
        addToCollectionBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // リクエスト行のクリック（ロード）を阻止
            if (state.currentCollection) {
                addRequestToCollection(state.currentCollection);
            }
        });
        colDiv.appendChild(addToCollectionBtn);

        // 追加：削除ボタン（🗑️）
        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'collection-delete-btn';
        deleteBtn.textContent = '🗑️';
        // 削除イベント（クリック）
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();  // 親要素の toggle を阻止
            deleteCollection(col.id);
        });
        colDiv.appendChild(deleteBtn);

        container.appendChild(colDiv);

        // ② リクエスト一覧（最初は非表示）
        const ul = document.createElement('ul');
        ul.className = 'request-list';
        ul.style.display = 'none'; // デフォルトで非表示

        if (col.requests && col.requests.length > 0) {
            col.requests.forEach((req, idx) => {
                const li = document.createElement('li');
                li.className = 'request-item';
                li.dataset.id = req.id;

                // メソッドバッジ
                const methodBadge = document.createElement('span');
                methodBadge.className = `method-badge method-${req.method}`;
                methodBadge.textContent = req.method;
                li.appendChild(methodBadge);

                // リクエスト名
                const reqName = document.createElement('span');
                reqName.className = 'request-name';
                reqName.textContent = req.name;
                li.appendChild(reqName);

                // 「🗑️」削除ボタンを作成
                const deleteBtn = document.createElement('span');
                deleteBtn.className = 'request-delete-btn';
                deleteBtn.textContent = '🗑️';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // リクエスト行のクリック（ロード）を阻止
                    deleteRequestFromCollection(col.id, idx);
                });
                li.appendChild(deleteBtn);

                // ◆ Add to Scenario ボタン追加
                const addToScenarioBtn = document.createElement('span');
                addToScenarioBtn.className = 'request-scenario-create-btn';
                addToScenarioBtn.textContent = '🌱';
                addToScenarioBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // リクエスト行のクリック（ロード）を阻止
                    const currentCollection = state.collections.find(s => s.id === state.currentCollection);
                    if (currentCollection && currentCollection.requests) {
                        const idx2 = currentCollection.requests.findIndex(r => r.id === req.id);
                        if (idx2 !== -1) {
                            addRequestToScenario(currentCollection.requests[idx2]);
                        }
                    }
                });
                li.appendChild(addToScenarioBtn);

                // クリック時にリクエストをロード
                li.addEventListener('click', (e) => {
                    e.stopPropagation(); // 上位のコレクションクリックと衝突しないように
                    loadCollectionRequest(req);
                });

                ul.appendChild(li);
            });
        } else {
            // コレクションにリクエストがない場合
            const li = document.createElement('li');
            li.className = 'request-item empty-message';
            li.textContent = 'No requests';
            ul.appendChild(li);
        }

        container.appendChild(ul);

        // ③ コレクション行クリックで「リクエスト一覧を開閉」
        colDiv.addEventListener('click', () => {
            if (ul.style.display === 'none') {
                ul.style.display = 'block';
                toggleIcon.textContent = '▼';
                // クリックされたコレクションを選択状態に
                document.querySelectorAll('.collection-item').forEach(item => {
                    const element = item as HTMLElement;
                    element.classList.toggle('active', element.dataset.id == col.id);
                });
                state.currentCollection = col.id;
                saveCurrentCollectionToStorage();
                // 変数セレクタ更新など
                const collectionVarSelect = document.getElementById('collectionVarSelect') as HTMLSelectElement;
                if (collectionVarSelect) {
                    collectionVarSelect.value = col.id;
                    renderVariables('collection');
                }
            } else {
                ul.style.display = 'none';
                toggleIcon.textContent = '▶';
            }
        });
    });
}