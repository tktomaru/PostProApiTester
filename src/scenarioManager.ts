// scenarioManager.ts

import type { Scenario, RequestData } from './types';
import { state, saveScenariosToStorage } from './state';
import { loadRequestIntoEditor, sendRequest } from './requestManager';
import { showSuccess, showError } from './utils';
import { sampleScenarios } from './defaultData';

/**
 * initializeScenarios：起動時に localStorage からシナリオをロードし、もし存在しなければサンプルを挿入
 */
export async function initializeScenarios(): Promise<void> {
    try {
        const stored = await chrome.storage.local.get(['scenarios']);
        if (!stored.scenarios || stored.scenarios.length === 0) {
            // まだシナリオがなければ sampleScenarios を投入
            state.scenarios.splice(0, state.scenarios.length, ...sampleScenarios);
            await chrome.storage.local.set({ scenarios: state.scenarios });
        } else {
            // すでにあればそちらを優先
            state.scenarios.splice(0, state.scenarios.length, ...stored.scenarios);
        }

        // 画面上のシナリオ一覧を描画
        renderScenarioList();
    } catch (error) {
        console.error('Error initializing scenarios:', error);
    }
}


/**
 * renderScenarioList
 *  左サイドのシナリオ一覧を描画
 */
export function renderScenarioList(): void {
    const ul = document.getElementById('scenarioList') as HTMLUListElement;
    ul.innerHTML = '';

    state.scenarios.forEach(scenario => {
        const li = document.createElement('li');
        li.textContent = scenario.name;
        li.dataset.id = scenario.id;
        if (state.currentScenario === scenario.id) {
            li.classList.add('active');
        }
        // クリック → 選択
        li.addEventListener('click', () => selectScenario(scenario.id));
        ul.appendChild(li);
    });
}

/**
 * selectScenario
 *  シナリオを選択し、右エリアにタイトル・リクエスト一覧を描画
 */
export function selectScenario(scenarioId: string): void {
    state.currentScenario = scenarioId;
    renderScenarioList(); // 選択中に .active を付ける

    // 右側の編集エリアにシナリオ名を表示
    const scenario = state.scenarios.find(s => s.id === scenarioId);
    const scenarioTitle = document.getElementById('scenarioTitle') as HTMLElement;
    scenarioTitle.textContent = scenario ? scenario.name : '';

    // シナリオ内のリクエストを描画
    renderScenarioRequests(scenarioId);

    // Run ボタンを有効化
    const runBtn = document.getElementById('runScenarioBtn') as HTMLButtonElement;
    runBtn.disabled = false;
}
/**
 * insertRequestIntoScenario
 *  シナリオ (scenarioId) の requestIndex の位置に、新しいリクエストを挿入する
 */
export async function insertRequestIntoScenario(scenarioId: string, insertIndex: number): Promise<void> {
    const scenario = state.scenarios.find(s => s.id === scenarioId);
    if (!scenario) {
        showError('Scenario not found.');
        return;
    }

    // ① どのリクエストを挿入するかユーザーに入力してもらう（例：ID を入力）
    const inputId = prompt('Insert request ID from any collection:');
    if (!inputId) return;

    // ② state.collections から該当のリクエストを検索
    let foundReq = null;
    for (const col of state.collections) {
        if (!col.requests) continue;
        const match = col.requests.find(r => String(r.id) === inputId);
        if (match) {
            foundReq = match;
            break;
        }
    }

    if (!foundReq) {
        showError('Request ID not found in any collection.');
        return;
    }

    // ③ 深いコピーして、新しいオブジェクトとして挿入
    const newReq = JSON.parse(JSON.stringify(foundReq));
    // 必要なら newReq.id を別のユニーク ID に上書き
    newReq.id = `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    scenario.requests.splice(insertIndex, 0, newReq);

    await saveScenariosToStorage();
    showSuccess(`Inserted "${newReq.name}" at position ${insertIndex + 1}`);

    // 再描画
    renderScenarioRequests(scenarioId);
}
/**
 * renderScenarioRequests
 * 右側のエディタにシナリオ内のリクエスト一覧を描画する
 */
export function renderScenarioRequests(scenarioId: string): void {
    const container = document.getElementById('scenarioRequestsList') as HTMLElement;
    container.innerHTML = '';

    const scenario = state.scenarios.find(s => s.id === scenarioId);
    if (!scenario || !scenario.requests.length) {
        const li = document.createElement('li');
        li.textContent = 'No requests in this scenario.';
        container.appendChild(li);
        return;
    }

    scenario.requests.forEach((req, idx) => {
        const li = document.createElement('li');
        li.className = 'scenario-request-item';

        // ● リクエスト名表示部
        const nameSpan = document.createElement('span');
        nameSpan.className = 'req-name';
        nameSpan.textContent = req.name || 'Untitled Request';
        li.appendChild(nameSpan);

        // ● Load ボタン
        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load';
        loadBtn.title = 'Load this request into editor';
        loadBtn.addEventListener('click', () => {
            const scenario = state.scenarios.find(s => s.id === state.currentScenario);
            if (scenario && scenario.requests) {
                const idx2 = scenario.requests.findIndex(r => r.id === req.id);
                if (idx2 !== -1) {
                    loadRequestIntoEditor(scenario.requests[idx2]);
                }
            }
        });
        li.appendChild(loadBtn);

        // ● ↑ 移動ボタン
        const upBtn = document.createElement('button');
        upBtn.textContent = '↑';
        upBtn.title = 'Move up';
        upBtn.disabled = (idx === 0);
        upBtn.addEventListener('click', () => {
            moveRequestInScenario(scenarioId, idx, idx - 1);
        });
        li.appendChild(upBtn);

        // ● ↓ 移動ボタン
        const downBtn = document.createElement('button');
        downBtn.textContent = '↓';
        downBtn.title = 'Move down';
        downBtn.disabled = (idx === scenario.requests.length - 1);
        downBtn.addEventListener('click', () => {
            moveRequestInScenario(scenarioId, idx, idx + 1);
        });
        li.appendChild(downBtn);

        // ● 追加ボタン（削除ボタンの左に配置）
        const addBtn = document.createElement('button');
        addBtn.textContent = '+';
        addBtn.title = 'Insert a request here';
        addBtn.addEventListener('click', () => {
            insertRequestIntoScenario(scenarioId, idx);
        });
        li.appendChild(addBtn);

        // ● 削除ボタン
        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.title = 'Delete this request';
        delBtn.addEventListener('click', () => {
            deleteRequestFromScenario(scenarioId, idx);
        });
        li.appendChild(delBtn);

        container.appendChild(li);
    });
}

/**
 * moveRequestInScenario
 *  シナリオ内で req を fromIndex から toIndex に移動して再描画・保存
 */
async function moveRequestInScenario(scenarioId: string, fromIndex: number, toIndex: number): Promise<void> {
    const scenario = state.scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const [moved] = scenario.requests.splice(fromIndex, 1);
    scenario.requests.splice(toIndex, 0, moved);

    await saveScenariosToStorage();
    renderScenarioRequests(scenarioId);
}

/**
 * deleteRequestFromScenario
 *  シナリオ内の req を削除して再描画・保存
 */
async function deleteRequestFromScenario(scenarioId: string, requestIndex: number): Promise<void> {
    const scenario = state.scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    scenario.requests.splice(requestIndex, 1);
    await saveScenariosToStorage();
    renderScenarioRequests(scenarioId);
}

/**
 * newScenario
 *  新しいシナリオを作成し、編集画面に移動
 */
export async function newScenario(): Promise<void> {
    const name = prompt('Enter scenario name:');
    if (!name) return;

    const newId = `scenario_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const newScenario: Scenario = {
        id: newId,
        name: name,
        requests: []
    };
    state.scenarios.push(newScenario);
    await saveScenariosToStorage();

    // 自動的に選択して右エリアを空で表示
    selectScenario(newId);
    renderScenarioList();
}

/**
 * addRequestToScenario
 *  引数 req をコピーしてシナリオ (currentScenario) に追加し、再描画・保存
 */
export async function addRequestToScenario(req: RequestData): Promise<void> {
    if (!state.currentScenario) {
        showError('Please select a scenario first.');
        return;
    }
    const scenario = state.scenarios.find(s => s.id === state.currentScenario);
    if (!scenario) return;

    // リクエストを複製して追加（state に直接持たせる）
    const newReq = JSON.parse(JSON.stringify(req));

    // ※ 必要であれば newReq.id をユニークに変える
    //    Date.now() とランダム文字列を組み合わせて一意の ID を作成
    newReq.id = `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    scenario.requests.push(newReq);
    await saveScenariosToStorage();

    renderScenarioRequests(state.currentScenario);
}

/**
 * runScenario
 *  選択中のシナリオを順次実行し、結果を scenarioResultContainer に表示
 */
export async function runScenario(): Promise<void> {
    if (!state.currentScenario) {
        showError('No scenario selected.');
        return;
    }
    const scenario = state.scenarios.find(s => s.id === state.currentScenario);
    if (!scenario || !scenario.requests.length) {
        showError('Scenario has no requests.');
        return;
    }

    const resultContainer = document.getElementById('scenarioResultContainer') as HTMLElement;
    resultContainer.innerHTML = ''; // 一旦クリア

    for (let i = 0; i < scenario.requests.length; i++) {
        const req = scenario.requests[i];

        // 中間ステータス表示
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result-item';
        resultDiv.textContent = `Executing ${i + 1}/${scenario.requests.length}: ${req.name}`;
        resultContainer.appendChild(resultDiv);

        try {
            // 実際に fetch などでリクエストを送信する
            const response = await sendRequest(req);
            if (typeof response === 'string') {
                resultDiv.textContent = `[${i + 1}] ${req.name} → ERROR: ${response}`;
                continue;
            }
            const text = await response.text();
            resultDiv.textContent = `[${i + 1}] ${req.name} → ${response.status} ${response.statusText}`;
            const pre = document.createElement('pre');
            pre.textContent = text;
            resultDiv.appendChild(pre);

            // 任意で「続行 or 停止」のダイアログを挿入可能
            // 例： if (!confirm('Continue to next request?')) break;

        } catch (err: unknown) {
            resultDiv.textContent = `[${i + 1}] ${req.name} → ERROR: ${(err as Error).message}`;
            // エラー時の処理をここで分岐させる（デフォルトは次へ進む、あるいは停止）
            // 例： break; など
        }
    }

    showSuccess('Scenario execution completed.');
}
