// collectionManager.ts
// ───────────────────────────────────────────────────────────────────────────────
// コレクション一覧の表示・選択・編集・削除などをまとめる

import type { Collection, RequestData } from './types';
import {
    saveCollectionsToStorage,
    saveCurrentCollectionToStorage,
    saveScenariosToStorage,
    saveCurrentScenarioToStorage,
    saveSidebarStateToStorage,
    state
} from './state';
import { showSuccess, showError, switchMainTab } from './utils';
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
        // 既にloadAllStoredData()で読み込み済みのため、ストレージからの再読み込みは不要
        // 画面にレンダリングのみ実行
        renderCollectionsTree();
        renderScenariosTree();

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
        
        // 最新のコレクションデータから該当のリクエストを取得
        const latestRequest = collection.requests.find(r => r.id === request.id);
        if (latestRequest) {
            console.log('Loading latest request data:', latestRequest);
            loadRequestIntoEditor(latestRequest);
            showSuccess('Request loaded from collection');
            return;
        }
    }

    // フォールバック: 渡されたrequestオブジェクトを使用
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

        // ② リクエスト一覧（開閉状態を復元）
        const ul = document.createElement('ul');
        ul.className = 'request-list';
        const isExpanded = state.sidebarState?.expandedCollections.has(col.id) || false;
        ul.style.display = isExpanded ? 'block' : 'none';
        if (isExpanded) {
            toggleIcon.textContent = '▼';
        }

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
                            text: 'リクエストをコピー',
                            icon: '📋',
                            action: () => copyRequest(req, col.id)
                        },
                        {
                            text: 'リクエストを移動',
                            icon: '📁',
                            action: () => moveRequestFromCollection(req, col.id)
                        },
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
        colDiv.addEventListener('click', async () => {
            if (ul.style.display === 'none') {
                ul.style.display = 'block';
                toggleIcon.textContent = '▼';
                // 開閉状態を保存
                state.sidebarState?.expandedCollections.add(col.id);
                await saveSidebarStateToStorage();
                
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
                // 開閉状態を保存
                state.sidebarState?.expandedCollections.delete(col.id);
                await saveSidebarStateToStorage();
            }
        });
    });
}

/**
 * renderScenariosTree
 *  state.scenarios の内容をもとに、サイドバーに「シナリオ行＋子リクエスト一覧」を描画
 */
export function renderScenariosTree(): void {
    const container = document.getElementById('scenariosTree');
    if (!container) return;

    container.innerHTML = ''; // まずクリア

    state.scenarios.forEach((scenario) => {
        // ① シナリオ行
        const scenarioDiv = document.createElement('div');
        scenarioDiv.className = 'scenario-item';
        scenarioDiv.dataset.id = scenario.id;

        // 「▶」トグルアイコン
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.textContent = '▶';
        scenarioDiv.appendChild(toggleIcon);

        // シナリオアイコン
        const scenarioIcon = document.createElement('span');
        scenarioIcon.className = 'scenario-icon';
        scenarioIcon.textContent = '🎬';
        scenarioDiv.appendChild(scenarioIcon);

        // シナリオ名
        const nameSpan = document.createElement('span');
        nameSpan.className = 'scenario-name';
        nameSpan.textContent = scenario.name;
        scenarioDiv.appendChild(nameSpan);

        // 三点リーダーメニュー
        const menuBtn = document.createElement('span');
        menuBtn.className = 'menu-btn';
        menuBtn.textContent = '⋮';
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = menuBtn.getBoundingClientRect();
            showContextMenu(rect.left, rect.top, [
                {
                    text: 'シナリオを編集',
                    icon: '✏️',
                    action: () => {
                        state.currentScenario = scenario.id;
                        saveCurrentScenarioToStorage();
                        switchMainTab('scenarios');
                    }
                },
                {
                    text: 'シナリオを削除',
                    icon: '🗑️',
                    action: () => deleteScenario(scenario.id)
                }
            ]);
        });
        scenarioDiv.appendChild(menuBtn);

        container.appendChild(scenarioDiv);

        // ② リクエスト一覧（開閉状態を復元）
        const ul = document.createElement('ul');
        ul.className = 'request-list';
        const isExpanded = state.sidebarState?.expandedScenarios.has(scenario.id) || false;
        ul.style.display = isExpanded ? 'block' : 'none';
        if (isExpanded) {
            toggleIcon.textContent = '▼';
        }

        if (scenario.requests && scenario.requests.length > 0) {
            scenario.requests.forEach((req) => {
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
                        loadScenarioRequest(req, scenario.id);
                    }
                });

                // メニューボタンのクリックイベント
                const reqMenuBtn = li.querySelector('.menu-btn');
                reqMenuBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    showContextMenu(rect.left, rect.top, [
                        {
                            text: 'リクエストをコピー',
                            icon: '📋',
                            action: () => copyRequestFromScenario(req, scenario.id)
                        },
                        {
                            text: 'リクエストを移動',
                            icon: '📁',
                            action: () => moveRequestFromScenario(req, scenario.id)
                        },
                        {
                            text: 'リクエストを編集',
                            icon: '✏️',
                            action: () => loadScenarioRequest(req, scenario.id)
                        },
                        {
                            text: 'シナリオから削除',
                            icon: '🗑️',
                            action: () => deleteRequestFromScenario(scenario.id, req.id)
                        }
                    ]);
                });

                ul.appendChild(li);
            });
        } else {
            // シナリオにリクエストがない場合
            const li = document.createElement('li');
            li.className = 'request-item empty-message';
            li.textContent = 'No requests';
            ul.appendChild(li);
        }

        container.appendChild(ul);

        // ③ シナリオ行クリックで「リクエスト一覧を開閉」
        scenarioDiv.addEventListener('click', async () => {
            if (ul.style.display === 'none') {
                ul.style.display = 'block';
                toggleIcon.textContent = '▼';
                // 開閉状態を保存
                state.sidebarState?.expandedScenarios.add(scenario.id);
                await saveSidebarStateToStorage();
                
                // クリックされたシナリオを選択状態に
                document.querySelectorAll('.scenario-item').forEach(item => {
                    const element = item as HTMLElement;
                    element.classList.toggle('active', element.dataset.id == scenario.id);
                });
                state.currentScenario = scenario.id;
                saveCurrentScenarioToStorage();
            } else {
                ul.style.display = 'none';
                toggleIcon.textContent = '▶';
                // 開閉状態を保存
                state.sidebarState?.expandedScenarios.delete(scenario.id);
                await saveSidebarStateToStorage();
            }
        });
    });
}

/**
 * loadScenarioRequest
 *  シナリオ内リクエストを右側エディタにロードする
 */
async function loadScenarioRequest(request: RequestData, scenarioId: string): Promise<void> {
    // シナリオを選択状態に
    state.currentScenario = scenarioId;
    await saveCurrentScenarioToStorage();
    
    // 最新のシナリオデータから該当のリクエストを取得
    const scenario = state.scenarios.find(s => s.id === scenarioId);
    if (scenario && scenario.requests) {
        const latestRequest = scenario.requests.find(r => r.id === request.id);
        if (latestRequest) {
            console.log('Loading latest scenario request data:', latestRequest);
            loadRequestIntoEditor(latestRequest);
            showSuccess('Request loaded from scenario');
            return;
        }
    }
    
    // フォールバック: 渡されたrequestオブジェクトを使用
    loadRequestIntoEditor(request);
    showSuccess('Request loaded from scenario');
}

/**
 * deleteScenario
 *  指定された ID のシナリオを削除し、Storage に保存 → 再描画
 */
async function deleteScenario(scenarioId: string): Promise<void> {
    if (!confirm('本当にこのシナリオを削除しますか？')) {
        return;
    }

    // state.scenarios から該当を取り除く
    const idx = state.scenarios.findIndex(scenario => scenario.id == scenarioId);
    if (idx === -1) return;

    state.scenarios.splice(idx, 1);
    await saveScenariosToStorage();

    // currentScenario が削除されたものを指していたらクリア
    if (state.currentScenario == scenarioId) {
        state.currentScenario = null;
        await saveCurrentScenarioToStorage();
    }

    // ツリーを再描画
    renderScenariosTree();
    showSuccess('シナリオを削除しました');
}

/**
 * deleteRequestFromScenario
 *  scenarioId 内の requestId を削除して再保存 → 再描画
 */
async function deleteRequestFromScenario(scenarioId: string, requestId: string): Promise<void> {
    if (!confirm('本当にこのリクエストをシナリオから削除しますか？')) return;

    const scenario = state.scenarios.find(s => s.id == scenarioId);
    if (!scenario || !scenario.requests || !scenario.requests.some(r => r.id === requestId)) return;

    scenario.requests = scenario.requests.filter(r => r.id !== requestId);
    await saveScenariosToStorage();

    // 削除後のツリーを再描画
    renderScenariosTree();
    showSuccess('リクエストをシナリオから削除しました');
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

/**
 * リクエストをコピーして同じコレクションに追加
 */
async function copyRequest(request: RequestData, collectionId: string): Promise<void> {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    // リクエストのディープコピーを作成
    const copiedRequest: RequestData = {
        ...JSON.parse(JSON.stringify(request)),
        id: generateId(),
        name: `${request.name} (Copy)`
    };

    // 履歴関連のプロパティは削除
    delete (copiedRequest as any).lastRequestExecution;
    delete (copiedRequest as any).lastResponseExecution;

    // コレクションに追加
    collection.requests.push(copiedRequest);
    await saveCollectionsToStorage();

    // 表示を更新
    renderCollectionsTree();
    showSuccess(`"${request.name}" をコピーしました`);
}

/**
 * シナリオ内でリクエストを複製
 */
async function copyRequestFromScenario(request: RequestData, scenarioId: string): Promise<void> {
    const scenario = state.scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    // リクエストのディープコピーを作成
    const copiedRequest: RequestData = {
        ...JSON.parse(JSON.stringify(request)),
        id: generateId(),
        name: `${request.name} (Copy)`
    };

    // 履歴関連のプロパティは削除
    delete (copiedRequest as any).lastRequestExecution;
    delete (copiedRequest as any).lastResponseExecution;

    // シナリオに追加
    scenario.requests.push(copiedRequest);
    await saveScenariosToStorage();

    // 表示を更新
    renderScenariosTree();
    showSuccess(`"${request.name}" をシナリオ内でコピーしました`);
}

/**
 * コレクション間でリクエストを移動
 */
async function moveRequestFromCollection(request: RequestData, sourceCollectionId: string): Promise<void> {
    // 移動先のコレクションを選択
    const targetCollections = state.collections.filter(c => c.id !== sourceCollectionId);
    if (targetCollections.length === 0) {
        showError('移動先のコレクションがありません。');
        return;
    }

    const collectionNames = targetCollections.map(c => c.name);
    const selectedCollectionName = prompt(
        `"${request.name}" を移動するコレクションを選択してください:\n\n${collectionNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\n番号を入力してください:`
    );

    if (!selectedCollectionName) return;
    
    const collectionIndex = parseInt(selectedCollectionName, 10) - 1;
    if (isNaN(collectionIndex) || collectionIndex < 0 || collectionIndex >= targetCollections.length) {
        showError('無効な番号です');
        return;
    }

    const targetCollection = targetCollections[collectionIndex];
    const sourceCollection = state.collections.find(c => c.id === sourceCollectionId);
    
    if (!sourceCollection) return;

    // ソースコレクションからリクエストを削除
    sourceCollection.requests = sourceCollection.requests.filter(r => r.id !== request.id);
    
    // ターゲットコレクションにリクエストを追加
    targetCollection.requests.push(request);
    
    await saveCollectionsToStorage();

    // 表示を更新
    renderCollectionsTree();
    showSuccess(`"${request.name}" を "${targetCollection.name}" に移動しました`);
}

/**
 * シナリオ間でリクエストを移動
 */
async function moveRequestFromScenario(request: RequestData, sourceScenarioId: string): Promise<void> {
    // 移動先のシナリオを選択
    const targetScenarios = state.scenarios.filter(s => s.id !== sourceScenarioId);
    if (targetScenarios.length === 0) {
        showError('移動先のシナリオがありません。');
        return;
    }

    const scenarioNames = targetScenarios.map(s => s.name);
    const selectedScenarioName = prompt(
        `"${request.name}" を移動するシナリオを選択してください:\n\n${scenarioNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\n番号を入力してください:`
    );

    if (!selectedScenarioName) return;
    
    const scenarioIndex = parseInt(selectedScenarioName, 10) - 1;
    if (isNaN(scenarioIndex) || scenarioIndex < 0 || scenarioIndex >= targetScenarios.length) {
        showError('無効な番号です');
        return;
    }

    const targetScenario = targetScenarios[scenarioIndex];
    const sourceScenario = state.scenarios.find(s => s.id === sourceScenarioId);
    
    if (!sourceScenario) return;

    // ソースシナリオからリクエストを削除
    sourceScenario.requests = sourceScenario.requests.filter(r => r.id !== request.id);
    
    // ターゲットシナリオにリクエストを追加
    targetScenario.requests.push(request);
    
    await saveScenariosToStorage();

    // 表示を更新
    renderScenariosTree();
    showSuccess(`"${request.name}" を "${targetScenario.name}" に移動しました`);
}