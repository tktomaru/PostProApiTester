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

// コンテキストメニューの型定義
interface MenuItem {
    text: string;
    icon: string;
    action: () => void;
}

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
 * ユニークなIDを生成する
 */
function generateId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

/**
 * addRequestToCollection
 *  新しいリクエストをコレクションに追加し、Storage に保存 → 再レンダリング
 */
export async function addRequestToCollection(collectionId: string): Promise<void> {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const name = prompt('リクエスト名を入力してください:');
    if (!name) return;

    const newRequest: RequestData = {
        id: generateId(),
        name: name,
        method: 'GET',
        url: '',
        headers: {},
        params: {},
        body: null,
        auth: { type: 'none' },
        preRequestScript: '',
        bodyType: 'none'
    };

    collection.requests.push(newRequest);
    await saveCollectionsToStorage();

    // 表示を更新
    renderCollectionsTree();
    
    // 新しく追加したリクエストを選択状態にする
    state.currentRequest = newRequest;
    loadRequestIntoEditor(newRequest);
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
async function deleteRequestFromCollection(collectionId: string, requestId: string): Promise<void> {
    if (!confirm('本当にこのリクエストを削除しますか？')) return;

    const col = state.collections.find(c => c.id == collectionId);
    if (!col || !col.requests || !col.requests.some(r => r.id === requestId)) return;

    col.requests = col.requests.filter(r => r.id !== requestId);
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

        // 三点リーダーメニュー
        const menuBtn = document.createElement('span');
        menuBtn.className = 'menu-btn';
        menuBtn.textContent = '⋮';
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = menuBtn.getBoundingClientRect();
            showContextMenu(rect.left, rect.top, [
                {
                    text: 'リクエストを追加',
                    icon: '🌱',
                    action: () => addRequestToCollection(col.id)
                },
                {
                    text: 'コレクションを削除',
                    icon: '🗑️',
                    action: () => deleteCollection(col.id)
                }
            ]);
        });
        colDiv.appendChild(menuBtn);

        container.appendChild(colDiv);

        // ② リクエスト一覧（最初は非表示）
        const ul = document.createElement('ul');
        ul.className = 'request-list';
        ul.style.display = 'none'; // デフォルトで非表示

        if (col.requests && col.requests.length > 0) {
            col.requests.forEach((req) => {
                const li = document.createElement('li');
                li.className = 'request-item';
                li.innerHTML = `
                    <span class="method-badge method-${req.method}">${req.method}</span>
                    <span class="request-name">${req.name}</span>
                    <span class="menu-btn">⋮</span>
                `;

                // リクエスト選択時の処理
                li.addEventListener('click', (e) => {
                    if (!(e.target as HTMLElement).classList.contains('menu-btn')) {
                        e.stopPropagation();
                        loadCollectionRequest(req);
                    }
                });

                // メニューボタンのクリックイベント
                const reqMenuBtn = li.querySelector('.menu-btn');
                reqMenuBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    showContextMenu(rect.left, rect.top, [
                        {
                            text: 'シナリオに追加',
                            icon: '🌱',
                            action: () => addRequestToScenario(req)
                        },
                        {
                            text: 'リクエストを削除',
                            icon: '🗑️',
                            action: () => deleteRequestFromCollection(col.id, req.id)
                        }
                    ]);
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

/**
 * showContextMenu
 * 指定された位置にコンテキストメニューを表示する
 */
function showContextMenu(x: number, y: number, items: MenuItem[]): void {
    // 既存のメニューを削除
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    // メニュー要素を作成
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // メニュー項目を追加
    items.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.innerHTML = `<span class="menu-icon">${item.icon}</span>${item.text}`;
        menuItem.addEventListener('click', () => {
            item.action();
            menu.remove();
        });
        menu.appendChild(menuItem);
    });

    // メニューを表示
    document.body.appendChild(menu);

    // メニュー外クリックで閉じる
    const closeMenu = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    document.addEventListener('click', closeMenu);
}