// variableManager.ts
// ───────────────────────────────────────────────────────────────────────────────
// 環境変数・コレクション変数・グローバル変数を管理する

import type { Environment } from './types';
import {
    sampleGlobalVariables,
    sampleEnvironments,
    sampleEnvironmentVariables,
    sampleCollectionVariables
} from './defaultData';

import {
    saveVariablesToStorage,
    saveEnvironmentsToStorage,
    saveEnvDataToStorage,
    saveCurrentEnvironmentToStorage,
    state
} from './state';

import { showError, showSuccess, escapeHtml } from './utils';
import { JSONPath } from 'jsonpath-plus';

/**
 * setupVariableEventListeners
 *  各「Add」「Edit」ボタン、セレクト変更時のイベント登録
 */
function setupVariableEventListeners(): void {
    const newEnvironmentBtn = document.getElementById('newEnvironmentBtn');
    const editEnvironmentBtn = document.getElementById('editEnvironmentBtn');
    const environmentSelect = document.getElementById('environmentSelect');
    const addGlobalVarBtn = document.getElementById('addGlobalVarBtn');
    const addEnvVarBtn = document.getElementById('addEnvVarBtn');
    const addCollectionVarBtn = document.getElementById('addCollectionVarBtn');
    const collectionVarSelect = document.getElementById('collectionVarSelect') as HTMLSelectElement;

    newEnvironmentBtn?.addEventListener('click', createNewEnvironment);
    editEnvironmentBtn?.addEventListener('click', editCurrentEnvironment);
    environmentSelect?.addEventListener('change', switchEnvironment);

    addGlobalVarBtn?.addEventListener('click', () => addVariableRow('global'));
    addEnvVarBtn?.addEventListener('click', () => addVariableRow('environment'));
    addCollectionVarBtn?.addEventListener('click', () => addVariableRow('collection'));

    collectionVarSelect?.addEventListener('change', () => {
        state.currentCollection = collectionVarSelect.value;
        renderVariables('collection');
    });
}

/**
 * initializeVariablesManagement
 *  ページロード時に環境セレクタや「New/Edit/追加」ボタン等のイベント登録 → 描画
 */
export async function initializeVariablesManagement(): Promise<void> {
    try {
        // --- サンプルデータを自動投入するロジック START ---

        // ── 1) グローバル変数の初期化 ──
        {
            const stored = await chrome.storage.local.get(['variables']);
            const storedVars = stored.variables || {};

            // ストレージに global がなく、あるいは空オブジェクトならサンプルを投入
            if (!storedVars.global || Object.keys(storedVars.global).length === 0) {
                // sampleGlobalVariables はどこかで定義しておくこと
                (state as any).variables.global = { ...sampleGlobalVariables };

                // collection はストレージの existing value があればそれを使い、なければ空オブジェクト
                (state as any).variables.collection = storedVars.collection || {};

                // Chrome ストレージに保存
                await chrome.storage.local.set({
                    variables: {
                        global: (state as any).variables.global,
                        collection: (state as any).variables.collection
                    }
                });
            } else {
                // ストレージに global があれば、既存の変数を保持しながら新しい変数を追加
                (state as any).variables.global = {
                    ...sampleGlobalVariables,
                    ...storedVars.global
                };
                (state as any).variables.collection = storedVars.collection || {};

                // 更新された変数を保存
                await chrome.storage.local.set({
                    variables: {
                        global: (state as any).variables.global,
                        collection: (state as any).variables.collection
                    }
                });
            }
        }

        // ── 2) 環境一覧および環境変数の初期化 ──
        {
            const storedEnvList = await chrome.storage.local.get(['environments']);
            const envsFromStorage = storedEnvList.environments || [];

            // ストレージに環境一覧がなければサンプルを投入
            if (envsFromStorage.length === 0) {
                // sampleEnvironments はどこかで定義しておくこと
                state.environments = [...sampleEnvironments];

                // 各サンプル環境に対応する環境変数を state に設定し、保存
                for (const env of sampleEnvironments) {
                    const envVarsForThis = (sampleEnvironmentVariables as any)[env.id] || {};
                    (state as any).variables.environment = { ...envVarsForThis };
                    await chrome.storage.local.set({ [`env_${env.id}`]: (state as any).variables.environment });
                }

                // ストレージにも環境一覧を保存
                await chrome.storage.local.set({ environments: state.environments });
            } else {
                // ストレージに environment list があれば、それを優先して state に読み込む
                state.environments.splice(0, state.environments.length, ...envsFromStorage);

                // 現在選択中の環境（state.currentEnvironment）に合わせて変数を読み込む
                if (state.currentEnvironment) {
                    const envData = await chrome.storage.local.get([`env_${state.currentEnvironment}`]);
                    (state as any).variables.environment = envData[`env_${state.currentEnvironment}`] || {};
                } else {
                    // 選択中環境がないなら空オブジェクト
                    (state as any).variables.environment = {};
                }
            }
        }

        // ── 3) コレクション変数の初期化 ──
        {
            // 再度 'variables' キーを取得して、collection 部分だけ取り出す
            const storedVars2 = await chrome.storage.local.get(['variables']);
            const colVarsFromStorage = storedVars2.variables?.collection || {};

            // ストレージに collection 変数がなければサンプルを投入
            if (!colVarsFromStorage || Object.keys(colVarsFromStorage).length === 0) {
                // sampleCollectionVariables は { [collectionId]: { key: {value, description}, … }, … } の形で用意しておく
                (state as any).variables.collection = { ...sampleCollectionVariables };

                // 保存
                await chrome.storage.local.set({
                    variables: {
                        global: (state as any).variables.global,
                        collection: (state as any).variables.collection
                    }
                });
            } else {
                // すでにあれば保管されているものを state に読み込む
                (state as any).variables.collection = colVarsFromStorage;
            }
        }

        // --- サンプルデータを自動投入するロジック END ---

        renderEnvironmentSelector();
        setupVariableEventListeners();
        updateCollectionVarSelector();
        renderAllVariables();
        console.log('Variables management initialized');
    } catch (error) {
        console.error('Error initializing variables management:', error);
    }
}

/**
 * renderEnvironmentSelector
 */
export function renderEnvironmentSelector(): void {
    const select = document.getElementById('environmentSelect') as HTMLSelectElement;
    if (!select) return;

    // 既存の option をクリア
    select.innerHTML = '';

    // "No Environment" を先頭に追加
    const noEnvOption = document.createElement('option');
    noEnvOption.value = '';
    noEnvOption.textContent = 'No Environment';
    select.appendChild(noEnvOption);

    // state.environments からオプションを生成
    state.environments.forEach(env => {
        const option = document.createElement('option');
        option.value = env.id;
        option.textContent = env.name;
        if (env.id === state.currentEnvironment) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

/**
 * createNewEnvironment
 */
export async function createNewEnvironment(): Promise<void> {
    const name = prompt('Enter environment name:');
    if (!name) return;

    const env: Environment = {
        id: `env_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: name,
        variables: {},
        created: new Date().toISOString()
    };

    state.environments.push(env);
    await saveEnvironmentsToStorage();
    await chrome.storage.local.set({ [`env_${env.id}`]: {} });

    renderEnvironmentSelector();
    const environmentSelect = document.getElementById('environmentSelect') as HTMLSelectElement;
    if (environmentSelect) {
        environmentSelect.value = env.id;
    }
    await switchEnvironment();
    showSuccess('Environment created: ' + name);
}

/**
 * editCurrentEnvironment
 */
export async function editCurrentEnvironment(): Promise<void> {
    if (!state.currentEnvironment) {
        showError('No environment selected');
        return;
    }
    const env = state.environments.find(e => e.id === state.currentEnvironment);
    if (!env) return;
    const newName = prompt('Edit environment name:', env.name);
    if (!newName || newName === env.name) return;
    env.name = newName;
    await saveEnvironmentsToStorage();
    renderEnvironmentSelector();
    showSuccess('Environment renamed to: ' + newName);
}

/**
 * switchEnvironment
 */
export async function switchEnvironment(): Promise<void> {
    const select = document.getElementById('environmentSelect') as HTMLSelectElement;
    if (!select) return;
    
    const envId = select.value;

    if (state.currentEnvironment) {
        await saveEnvDataToStorage(state.currentEnvironment);
    }

    state.currentEnvironment = envId;
    await saveCurrentEnvironmentToStorage();

    if (envId) {
        const envData = await chrome.storage.local.get([`env_${envId}`]);
        (state as any).variables.environment = envData[`env_${envId}`] || {};
    } else {
        (state as any).variables.environment = {};
    }
    const envName = envId ? state.environments.find(e => e.id === envId)?.name : 'No Environment';
    showSuccess('Switched to: ' + envName);
    renderVariables('environment');
}

/**
 * updateCollectionVarSelector
 */
export function updateCollectionVarSelector(): void {
    const select = document.getElementById('collectionVarSelect') as HTMLSelectElement;
    if (!select) return;

    // 既存の option をクリア
    select.innerHTML = '';

    // "Select Collection"を先頭に追加
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Collection';
    select.appendChild(defaultOption);

    // state.collections からオプションを生成
    state.collections.forEach(col => {
        const option = document.createElement('option');
        option.value = col.id;
        option.textContent = col.name;
        if (col.id === state.currentCollection) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

/**
 * renderAllVariables
 */
export function renderAllVariables(): void {
    // グローバル変数
    renderVariables('global');

    // 環境変数
    renderVariables('environment');

    // コレクション変数
    renderVariables('collection');
}

/**
 * renderVariables
 */
export function renderVariables(scope: string): void {
    let container: HTMLElement | null;
    let data: any;

    if (scope === 'global') {
        container = document.getElementById('globalVariablesContainer');
        data = (state as any).variables.global;
    } else if (scope === 'environment') {
        container = document.getElementById('envVariablesContainer');
        // 環境が未選択の場合は空メッセージを表示
        if (!state.currentEnvironment) {
            if (container) {
                container.innerHTML = '<p class="empty-message">Select an environment to manage variables</p>';
            }
            console.log("renderVariables is return currentEnvironment");
            return;
        }
        data = (state as any).variables.environment;
    } else if (scope === 'collection') {
        container = document.getElementById('collectionVariablesContainer');
        // コレクションが未選択の場合は空メッセージを表示
        if (!state.currentCollection) {
            if (container) {
                container.innerHTML = '<p class="empty-message">Select a collection to manage variables</p>';
            }
            console.log("renderVariables is return currentCollection");
            return;
        }
        data = (state as any).variables.collection || {};
    } else {
        console.log("renderVariables is return");
        return;
    }

    if (!container) return;

    // 既存コンテンツをクリア
    container.innerHTML = '';

    // ヘッダ行
    const headerRow = document.createElement('div');
    headerRow.className = 'variable-header-row';
    headerRow.innerHTML = `
      <span>Variable</span>
      <span>Value</span>
      <span>Description</span>
      <span></span>
    `;
    container.appendChild(headerRow);

    const entries = Object.entries(data || {});
    if (entries.length === 0) {
        const emptyRow = document.createElement('div');
        emptyRow.className = 'empty-variables';
        emptyRow.innerHTML = '<p>No variables defined. Click "Add" to create one.</p>';
        container.appendChild(emptyRow);
    } else {
        entries.forEach(([key, val]: [string, any]) => {
            const { value, description } = val;
            const row = createVariableRow(scope, key, value, description);
            container.appendChild(row);
        });
    }
}

/**
 * createVariableRow
 */
export function createVariableRow(scope: string, key: string = '', value: string = '', description: string = ''): HTMLElement {
    const row = document.createElement('div');
    row.className = 'variable-row';
    row.dataset.originalKey = key;

    row.innerHTML = `
        <input type="text" class="var-key" placeholder="Variable name" value="${escapeHtml(key)}">
        <input type="text" class="var-value" placeholder="Value" value="${escapeHtml(value)}">
        <input type="text" class="var-description" placeholder="Description" value="${escapeHtml(description)}">
        <button class="delete-btn">×</button>
    `;

    const keyInput = row.querySelector('.var-key') as HTMLInputElement;
    const valueInput = row.querySelector('.var-value') as HTMLInputElement;
    const descInput = row.querySelector('.var-description') as HTMLInputElement;
    const deleteBtn = row.querySelector('.delete-btn') as HTMLButtonElement;

    const updateVariable = async () => {
        const newKey = keyInput.value.trim();
        const newValue = valueInput.value;
        const newDesc = descInput.value;
        const originalKey = row.dataset.originalKey || '';

        if (!newKey) {
            if (originalKey) {
                await deleteVariable(scope, originalKey);
                // deleteVariable内でrenderVariablesが呼ばれるのでここでは何もしない
            }
            return;
        }
        if (newKey !== originalKey && variableExists(scope, newKey)) {
            showError(`Variable "${newKey}" already exists in this scope`);
            keyInput.value = originalKey;
            return;
        }
        if (originalKey && originalKey !== newKey) {
            await deleteVariable(scope, originalKey);
        }
        await saveVariable(scope, newKey, newValue, newDesc);
        row.dataset.originalKey = newKey;
        
        // 成功メッセージを表示（オプション）
        console.log(`Variable "${newKey}" saved successfully`);
    };

    // debounce機能付きの保存
    let saveTimeout: NodeJS.Timeout | null = null;
    const debouncedSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(updateVariable, 500);
    };

    keyInput.addEventListener('blur', updateVariable);
    valueInput.addEventListener('blur', updateVariable);
    descInput.addEventListener('blur', updateVariable);
    
    // リアルタイム保存（デバウンス付き）
    keyInput.addEventListener('input', debouncedSave);
    valueInput.addEventListener('input', debouncedSave);
    descInput.addEventListener('input', debouncedSave);

    deleteBtn.addEventListener('click', async () => {
        const keyToDelete = row.dataset.originalKey || keyInput.value.trim();
        if (keyToDelete) {
            if (confirm(`Delete variable "${keyToDelete}"?`)) {
                await deleteVariable(scope, keyToDelete);
                row.remove();
                showSuccess(`Variable "${keyToDelete}" deleted`);
            }
        } else {
            row.remove();
        }
    });

    return row;
}

/**
 * variableExists
 */
export function variableExists(scope: string, key: string): boolean {
    switch (scope) {
        case 'global':
            return key in (state as any).variables.global;
        case 'environment':
            return key in (state as any).variables.environment;
        case 'collection':
            return state.currentCollection && (state as any).variables.collection[state.currentCollection] && key in (state as any).variables.collection[state.currentCollection];
    }
    return false;
}

/**
 * saveVariable
 */
export async function saveVariable(scope: string, key: string, value: string, description: string): Promise<void> {
    const varData = { value, description };
    switch (scope) {
        case 'global':
            (state as any).variables.global[key] = varData;
            await saveVariablesToStorage();
            break;
        case 'environment':
            if (!state.currentEnvironment) {
                console.error('No environment selected for saving variable');
                return;
            }
            (state as any).variables.environment[key] = varData;
            console.log('Saving environment variable:', key, varData, 'to environment:', state.currentEnvironment);
            console.log('Current environment variables:', (state as any).variables.environment);
            await saveEnvDataToStorage(state.currentEnvironment);
            break;
        case 'collection':
            if (!state.currentCollection) return;
            if (!(state as any).variables.collection[state.currentCollection]) {
                (state as any).variables.collection[state.currentCollection] = {};
            }
            (state as any).variables.collection[state.currentCollection][key] = varData;
            await saveVariablesToStorage();
            break;
    }
    
    // 変数保存後、画面を再描画
    console.log(`Variable saved: ${scope}.${key} = ${value}`);
}

/**
 * deleteVariable
 */
export async function deleteVariable(scope: string, key: string): Promise<void> {
    switch (scope) {
        case 'global':
            delete (state as any).variables.global[key];
            await saveVariablesToStorage();
            renderVariables('global');
            break;
        case 'environment':
            if (!state.currentEnvironment) return;
            delete (state as any).variables.environment[key];
            await saveEnvDataToStorage(state.currentEnvironment);
            renderVariables('environment');
            break;
        case 'collection':
            if (!state.currentCollection) return;
            delete (state as any).variables.collection[state.currentCollection][key];
            await saveVariablesToStorage();
            renderVariables('collection');
            break;
    }
}

/**
 * addVariableRow
 */
export function addVariableRow(scope: string): void {
    if (scope === 'environment' && !state.currentEnvironment) {
        showError('Please select an environment first');
        return;
    }
    const collectionVarSelect = document.getElementById('collectionVarSelect') as HTMLSelectElement;
    if (scope === 'collection' && !collectionVarSelect?.value) {
        showError('Please select a collection first');
        return;
    }
    let container: HTMLElement | null;
    switch (scope) {
        case 'global':
            container = document.getElementById('globalVariablesContainer');
            break;
        case 'environment':
            container = document.getElementById('envVariablesContainer');
            break;
        case 'collection':
            container = document.getElementById('collectionVariablesContainer');
            break;
        default:
            return;
    }
    if (!container) return;
    
    const emptyMsg = container.querySelector('.empty-variables');
    if (emptyMsg) {
        emptyMsg.remove();
    }
    const row = createVariableRow(scope);
    container.appendChild(row);
    const keyInput = row.querySelector('.var-key') as HTMLInputElement;
    keyInput?.focus();
}

/**
 * getVariable
 */
export function getVariable(varName: string): any {
    // --- 1) 新フォーマット ${"..."} の処理 ---
    if (varName.startsWith('${') && varName.endsWith('}')) {
        // 中身を取り出し
        const inner = varName.slice(2, -1);

        // "Collection"."Request"."response" と .jsonPath("…") をパース
        const parts: any[] = [];
        const regex = /\.?"([^"]+)"|\.jsonPath\("([^"]+)"\)/g;
        let match;
        let lastIndex = 0;
        while ((match = regex.exec(inner)) !== null) {
            // マッチした位置が前回のマッチの直後でない場合、エラー
            if (match.index !== lastIndex) {
                throw new Error(`変数参照構文が不正です: ${inner.slice(lastIndex, match.index)}`);
            }
            lastIndex = match.index + match[0].length;

            if (match[1]) {
                // 例えば "Sample Collection"
                parts.push(match[1]);
            } else if (match[2]) {
                // 例えば jsonPath("$.Headers.date") → jsonPath("$.Headers.date") のまま
                let jsonPathExpr = match[2];  // toLowerCase()を削除
                // JSONPathの式が$で始まっていない場合は追加
                if (!jsonPathExpr.startsWith('$')) {
                    jsonPathExpr = '$' + jsonPathExpr;
                }
                console.log("jsonPathExpr", jsonPathExpr);
                parts.push({ jsonPath: jsonPathExpr });
            }
        }

        // 最後のマッチ以降に文字が残っている場合、エラー
        if (lastIndex < inner.length) {
            throw new Error(`変数参照構文が不正です: ${inner.slice(lastIndex)}`);
        }

        if (parts.length < 4) {
            throw new Error(`変数参照構文が不正です: ${varName}`);
        }

        // 各要素を分解
        const [collectionName, requestName, type, ...pathParts] = parts;

        // コレクション／リクエストを探す
        const collection = state.collections.find(c => c.name === collectionName);
        if (!collection) {
            throw new Error(`コレクション「${collectionName}」が見つかりません`);
        }
        const request = collection.requests.find(r => r.name === requestName);
        if (!request) {
            throw new Error(`リクエスト「${requestName}」が見つかりません`);
        }

        // 実行結果オブジェクトを取得
        const execution =
            type === 'response'
                ? ((request as any).lastResponseExecution || (request as any).lastResponse)
                : ((request as any).lastRequestExecution || (request as any).lastRequest);
        if (!execution) {
            throw new Error(`${type} の実行結果が存在しません`);
        }

        // プロパティパスに従って値を掘り下げ
        let value = execution;
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];

            // --- headers.xxx の場合 ---
            if (part === 'headers') {
                const key = pathParts[++i];
                if (!key) throw new Error('ヘッダー名が指定されていません');
                // 大文字小文字を無視して検索
                const found = Object.entries(value.headers || {}).find(
                    ([k]) => k.toLowerCase() === key.toLowerCase()
                );
                if (!found) {
                    throw new Error(`ヘッダー "${key}" が見つかりません`);
                }
                return found[1];
            }

            // --- body.jsonPath(...) の場合 ---
            if (part === 'body') {
                value = value.body;
                const next = pathParts[i + 1];
                if (next && typeof next === 'object' && next.jsonPath) {
                    console.log("next.jsonPath", next.jsonPath);
                    // JSONPath 処理
                    try {
                        const json = typeof value === 'string' ? JSON.parse(value) : value;
                        console.log("JSONPath処理前のJSON:", json);
                        console.log("使用するJSONPath:", next.jsonPath);

                        const result = JSONPath({ path: next.jsonPath, json: json });
                        console.log("JSONPath処理結果:", result);
                        if (!Array.isArray(result) || result.length === 0) {
                            throw new Error(`JSONPath "${next.jsonPath}" に一致する値がありません`);
                        }
                        return result[0];
                    } catch (e: any) {
                        console.error("JSONPath処理エラー:", e);
                        throw new Error(`JSONPath の処理に失敗しました: ${e.message}`);
                    }
                }
                return value;
            }

            // --- 通常のネストしたプロパティアクセス ---
            if (value != null && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                throw new Error(`プロパティ "${part}" が見つかりません`);
            }
        }

        return value;
    }

    // --- 2) 既存の {{...}} フォーマット ---
    if (varName.startsWith('{{') && varName.endsWith('}}')) {
        const key = varName.slice(2, -2).trim();
        // 環境変数
        if ((state as any).variables.environment[key]) {
            return (state as any).variables.environment[key].value;
        }
        // グローバル変数
        if ((state as any).variables.global[key]) {
            return (state as any).variables.global[key].value;
        }
        // コレクション変数
        if (
            state.currentCollection &&
            (state as any).variables.collection[state.currentCollection]?.[key]
        ) {
            return (state as any).variables.collection[state.currentCollection][key].value;
        }
        return undefined;
    }

    // --- 3) 通常の変数名 ---
    const plainKey = varName.trim();
    if ((state as any).variables.environment[plainKey]) {
        return (state as any).variables.environment[plainKey].value;
    }
    if ((state as any).variables.global[plainKey]) {
        return (state as any).variables.global[plainKey].value;
    }
    if (
        state.currentCollection &&
        (state as any).variables.collection[state.currentCollection]?.[plainKey]
    ) {
        return (state as any).variables.collection[state.currentCollection][plainKey].value;
    }
    return undefined;
}

// Include the variable replacement functions
export function replaceVariables(text: string): string {
    if (typeof text !== 'string') return text;

    // {{apiUrl}}形式の置換
    text = text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmedName = varName.trim();
        const value = getVariable(trimmedName);
        return value !== undefined ? value : match;
    });

    // ${apiUrl}形式の置換
    text = text.replace(/\${([^}]+)}/g, (match, varName) => {
        const trimmedName = varName.trim();
        const value = getVariable(trimmedName);
        return value !== undefined ? value : match;
    });

    // {petId}形式の置換
    text = text.replace(/\{([^}]+)\}/g, (match, varName) => {
        const trimmedName = varName.trim();
        const value = getVariable(trimmedName);
        return value !== undefined ? value : match;
    });

    return text;
}

export function deepReplaceVariables(obj: any): any {
    if (typeof obj === 'string') {
        return replaceVariables(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(deepReplaceVariables);
    }
    if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            const newKey = replaceVariables(key);
            result[newKey] = deepReplaceVariables(value);
        }
        return result;
    }
    return obj;
}

export async function setVariable(scope: string, key: string, value: string): Promise<void> {
    const varData = { value, description: '' };

    switch (scope) {
        case 'global':
            (state as any).variables.global[key] = varData;
            await chrome.storage.local.set({
                variables: {
                    global: (state as any).variables.global,
                    collection: (state as any).variables.collection
                }
            });
            break;
        case 'environment':
            if (state.currentEnvironment) {
                (state as any).variables.environment[key] = varData;
                await chrome.storage.local.set({
                    [`env_${state.currentEnvironment}`]: (state as any).variables.environment
                });
            }
            break;
    }
}