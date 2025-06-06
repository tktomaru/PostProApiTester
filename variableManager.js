// variableManager.js
// ───────────────────────────────────────────────────────────────────────────────
// 環境変数・コレクション変数・グローバル変数を管理する


// 1. サンプルデータを読み込む
import {
    sampleGlobalVariables,
    sampleEnvironments,
    sampleEnvironmentVariables,
    sampleCollectionVariables
} from './defaultData.js';

import {
    saveVariablesToStorage,
    saveEnvironmentsToStorage,
    saveEnvDataToStorage,
    saveCurrentEnvironmentToStorage,
    state
} from './state.js';

import { showError, showSuccess, escapeHtml } from './utils.js';

/**
 * setupVariableEventListeners
 *  各「Add」「Edit」ボタン、セレクト変更時のイベント登録
 */
function setupVariableEventListeners() {
    document.getElementById('newEnvironmentBtn').addEventListener('click', createNewEnvironment);
    document.getElementById('editEnvironmentBtn').addEventListener('click', editCurrentEnvironment);
    document.getElementById('environmentSelect').addEventListener('change', switchEnvironment);

    document.getElementById('addGlobalVarBtn').addEventListener('click', () => addVariableRow('global'));
    document.getElementById('addEnvVarBtn').addEventListener('click', () => addVariableRow('environment'));
    document.getElementById('addCollectionVarBtn').addEventListener('click', () => addVariableRow('collection'));

    document.getElementById('collectionVarSelect').addEventListener('change', () => {
        state.currentCollection = document.getElementById('collectionVarSelect').value;
        renderVariables('collection');
    });
}

/**
 * initializeVariablesManagement
 *  ページロード時に環境セレクタや「New/Edit/追加」ボタン等のイベント登録 → 描画
 */
export async function initializeVariablesManagement() {
    try {

        // --- サンプルデータを自動投入するロジック START ---


        // ── 1) グローバル変数の初期化 ──
        {
            const stored = await chrome.storage.local.get(['variables']);
            const storedVars = stored.variables || {};

            // ストレージに global がなく、あるいは空オブジェクトならサンプルを投入
            if (!storedVars.global || Object.keys(storedVars.global).length === 0) {
                // sampleGlobalVariables はどこかで定義しておくこと
                state.variables.global = { ...sampleGlobalVariables };

                // collection はストレージの existing value があればそれを使い、なければ空オブジェクト
                state.variables.collection = storedVars.collection || {};

                // Chrome ストレージに保存
                await chrome.storage.local.set({
                    variables: {
                        global: state.variables.global,
                        collection: state.variables.collection
                    }
                });
            } else {
                // ストレージに global があればそちらを優先して state に読み込む
                state.variables.global = storedVars.global;
                state.variables.collection = storedVars.collection || {};
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
                // sampleEnvironmentVariables は { [envId]: { key: { value, description }, … }, … } の形で用意しておく
                for (const env of sampleEnvironments) {
                    const envVarsForThis = sampleEnvironmentVariables[env.id] || {};
                    // state.variables.environment を一旦空にしてから、サンプルをセット
                    // ※ここでは、複数のサンプル環境がある場合に `state.variables.environment` を上書きしてしまわないよう、
                    //   “現在の環境を最後のサンプルに合わせる” 形だと都合が悪いならば、初期状態として全サンプルを別管理しておく方法もあります。
                    //   ここでは「最後に処理した env.id のものが state.currentEnvironment が null の状態でも反映される」というサンプルとして示しています。
                    state.variables.environment = { ...envVarsForThis };
                    await chrome.storage.local.set({ [`env_${env.id}`]: state.variables.environment });
                }

                // ストレージにも環境一覧を保存
                await chrome.storage.local.set({ environments: state.environments });
            } else {
                // ストレージに environment list があれば、それを優先して state に読み込む
                state.environments.splice(0, state.environments.length, ...envsFromStorage);

                // 現在選択中の環境（state.currentEnvironment）に合わせて変数を読み込む
                if (state.currentEnvironment) {
                    const envData = await chrome.storage.local.get([`env_${state.currentEnvironment}`]);
                    state.variables.environment = envData[`env_${state.currentEnvironment}`] || {};
                } else {
                    // 選択中環境がないなら空オブジェクト
                    state.variables.environment = {};
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
                state.variables.collection = { ...sampleCollectionVariables };

                // 保存
                await chrome.storage.local.set({
                    variables: {
                        global: state.variables.global,
                        collection: state.variables.collection
                    }
                });
            } else {
                // すでにあれば保管されているものを state に読み込む
                state.variables.collection = colVarsFromStorage;
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
 *   - state.environments: [{ id, name, created }, …]
 *   - state.currentEnvironment: 選択中の環境ID
 * 
 * 環境選択用の <select id="environmentSelect"> を作り直します。
 */
export function renderEnvironmentSelector() {
    const select = document.getElementById('environmentSelect');
    if (!select) return;

    // 既存の option をクリア
    select.innerHTML = '';

    // 「No Environment」 を先頭に追加
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
 *  新しい環境を作成し、Storage に保存 → セレクタ再描画 → 切り替え
 */
export async function createNewEnvironment() {
    const name = prompt('Enter environment name:');
    if (!name) return;

    const env = {
        id: `env_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        name: name,
        created: new Date().toISOString()
    };

    state.environments.push(env);
    await saveEnvironmentsToStorage();
    await chrome.storage.local.set({ [`env_${env.id}`]: {} });

    renderEnvironmentSelector();
    document.getElementById('environmentSelect').value = env.id;
    await switchEnvironment();
    showSuccess('Environment created: ' + name);
}

/**
 * editCurrentEnvironment
 *  選択中の環境の名称を変更して保存 → セレクタ再描画
 */
export async function editCurrentEnvironment() {
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
 *  切り替え前に現在の環境変数を保存 → currentEnvironment を更新 → 新しい環境の変数を取得 → 描画
 */
export async function switchEnvironment() {
    const select = document.getElementById('environmentSelect');
    const envId = select.value;

    if (state.currentEnvironment) {
        await saveEnvDataToStorage(state.currentEnvironment);
    }

    state.currentEnvironment = envId;
    await saveCurrentEnvironmentToStorage();

    if (envId) {
        const envData = await chrome.storage.local.get([`env_${envId}`]);
        state.variables.environment = envData[`env_${envId}`] || {};
    } else {
        state.variables.environment = {};
    }
    const envName = envId ? state.environments.find(e => e.id === envId)?.name : 'No Environment';
    showSuccess('Switched to: ' + envName);
    renderVariables('environment');
}


/**
 * updateCollectionVarSelector
 *   - state.collections: [{ id, name, … }, …]
 *   - state.currentCollection: 選択中のコレクションID
 * 
 * コレクション変数管理タブの <select id="collectionVarSelect"> を更新します。
 */
export function updateCollectionVarSelector() {
    const select = document.getElementById('collectionVarSelect');
    if (!select) return;

    // 既存の option をクリア
    select.innerHTML = '';

    // 「Select Collection」を先頭に追加
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
 *   - state.variables.global: { [key]: { value, description } }
 *   - state.variables.environment: { [key]: { value, description } }
 *   - state.variables.collection: { [collectionId]: { [key]: { value, description } } }
 * 
 * 「グローバル変数」「環境変数」「コレクション変数」をそれぞれ描画します。
 * 内部で renderVariables(scope) を呼び出す想定とします。
 */
export function renderAllVariables() {
    // グローバル変数
    renderVariables('global');

    // 環境変数
    renderVariables('environment');

    // コレクション変数
    renderVariables('collection');
}


/**
 * renderVariables
 *   ・scope が 'global' のときは state.variables.global を使う
 *   ・scope が 'environment' のときは state.currentEnvironment に紐づく state.variables.environment を使う
 *   ・scope が 'collection' のときは state.currentCollection に紐づく state.variables.collection[state.currentCollection] を使う
 *
 * 変数一覧を描画するサンプル実装。各 scope ごとに、
 * 適切な DOM ノード（#globalVariablesContainer、#envVariablesContainer、#collectionVariablesContainer）を参照し、
 * 行を組み立てて append するものとします。
 */
export function renderVariables(scope) {
    let container;
    let data;

    if (scope === 'global') {
        container = document.getElementById('globalVariablesContainer');
        data = state.variables.global;
    } else if (scope === 'environment') {
        container = document.getElementById('envVariablesContainer');
        // 環境が未選択の場合は空メッセージを表示
        if (!state.currentEnvironment) {
            container.innerHTML = '<p class="empty-message">Select an environment to manage variables</p>';
            console.log("renderVariables is return currentEnvironment");
            return;
        }
        data = state.variables.environment;
    } else if (scope === 'collection') {
        container = document.getElementById('collectionVariablesContainer');
        // コレクションが未選択の場合は空メッセージを表示
        if (!state.currentCollection) {
            container.innerHTML = '<p class="empty-message">Select a collection to manage variables</p>';
            console.log("renderVariables is return currentCollection");
            return;
        }
        data = state.variables.collection || {};
    } else {
        console.log("renderVariables is return");
        return;
    }

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
        entries.forEach(([key, val]) => {
            const { value, description } = val;
            const row = createVariableRow(scope, key, value, description);
            container.appendChild(row);
        });
    }
}
/**
 * createVariableRow
 *  新規・既存変数の行を作成し、blur／削除ボタンにイベントを登録して返す
 */
export function createVariableRow(scope, key = '', value = '', description = '') {
    const row = document.createElement('div');
    row.className = 'variable-row';
    row.dataset.originalKey = key;

    row.innerHTML = `
        <input type="text" class="var-key" placeholder="Variable name" value="${escapeHtml(key)}">
        <input type="text" class="var-value" placeholder="Value" value="${escapeHtml(value)}">
        <input type="text" class="var-description" placeholder="Description" value="${escapeHtml(description)}">
        <button class="delete-btn">×</button>
    `;

    const keyInput = row.querySelector('.var-key');
    const valueInput = row.querySelector('.var-value');
    const descInput = row.querySelector('.var-description');
    const deleteBtn = row.querySelector('.delete-btn');

    const updateVariable = async () => {
        const newKey = keyInput.value.trim();
        const newValue = valueInput.value;
        const newDesc = descInput.value;
        const originalKey = row.dataset.originalKey;

        if (!newKey) {
            if (originalKey) {
                await deleteVariable(scope, originalKey);
                row.remove();
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
    };

    keyInput.addEventListener('blur', updateVariable);
    valueInput.addEventListener('blur', updateVariable);
    descInput.addEventListener('blur', updateVariable);

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
 *  指定スコープ内に同名の変数がすでに存在するかを判定
 */
export function variableExists(scope, key) {
    switch (scope) {
        case 'global':
            return key in state.variables.global;
        case 'environment':
            return key in state.variables.environment;
        case 'collection':
            return state.currentCollection && state.variables.collection[state.currentCollection] && key in state.variables.collection[state.currentCollection];
    }
    return false;
}

/**
 * saveVariable
 *  指定スコープの変数を保存し、必要があれば chrome.storage を更新
 */
export async function saveVariable(scope, key, value, description) {
    const varData = { value, description };
    switch (scope) {
        case 'global':
            state.variables.global[key] = varData;
            await saveVariablesToStorage();
            break;
        case 'environment':
            if (!state.currentEnvironment) return;
            state.variables.environment[state.currentEnvironment] = varData;
            await saveEnvDataToStorage(state.currentEnvironment);
            break;
        case 'collection':
            if (!state.currentCollection) return;
            if (!state.variables.collection[state.currentCollection]) {
                state.variables.collection[state.currentCollection] = {};
            }
            state.variables.collection[state.currentCollection][key] = varData;
            await saveVariablesToStorage();
            break;
    }
}

/**
 * deleteVariable
 *  指定スコープの変数を削除し、Storage 更新
 */
export async function deleteVariable(scope, key) {
    switch (scope) {
        case 'global':
            delete state.variables.global[key];
            await saveVariablesToStorage();
            break;
        case 'environment':
            if (!state.currentEnvironment) return;
            delete state.variables.environment[key];
            await saveEnvDataToStorage(state.currentEnvironment);
            break;
        case 'collection':
            if (!state.currentCollection) return;
            delete state.variables.collection[state.currentCollection][key];
            await saveVariablesToStorage();
            break;
    }
    switch (scope) {
        case 'global':
            renderVariables('global');
            break;
        case 'environment':
            renderVariables('environment');
            break;
        case 'collection':
            renderVariables('collection');
            break;
    }
}

/**
 * addVariableRow
 *  空行を追加してフォーカスを当てる
 */
export function addVariableRow(scope) {
    if (scope === 'environment' && !state.currentEnvironment) {
        showError('Please select an environment first');
        return;
    }
    if (scope === 'collection' && !document.getElementById('collectionVarSelect').value) {
        showError('Please select a collection first');
        return;
    }
    let container;
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
    }
    const emptyMsg = container.querySelector('.empty-variables');
    if (emptyMsg) {
        emptyMsg.remove();
    }
    const row = createVariableRow(scope);
    container.appendChild(row);
    row.querySelector('.var-key').focus();
}

export function getVariable(key) {
    // Priority: Environment > Collection > Global
    if (state.variables.environment[key]) {
        const val = state.variables.environment[key];
        return typeof val === 'object' ? val.value : val;
    }
    if (state.currentCollection && state.variables.collection[state.currentCollection]?.[key]) {
        const val = state.variables.collection[state.currentCollection][key];
        return typeof val === 'object' ? val.value : val;
    }
    if (state.variables.global[key]) {
        const val = state.variables.global[key];
        return typeof val === 'object' ? val.value : val;
    }
    return undefined;
}

// Include the variable replacement functions
export function replaceVariables(text) {
    if (typeof text !== 'string') return text;

    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmedName = varName.trim();
        const value = getVariable(trimmedName);
        return value !== undefined ? value : match;
    });
}


export function deepReplaceVariables(obj) {
    if (typeof obj === 'string') {
        return replaceVariables(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(deepReplaceVariables);
    }
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            const newKey = replaceVariables(key);
            result[newKey] = deepReplaceVariables(value);
        }
        return result;
    }
    return obj;
}

export async function setVariable(scope, key, value) {
    const varData = { value, description: '' };

    switch (scope) {
        case 'global':
            state.variables.global[key] = varData;
            await chrome.storage.local.set({
                variables: {
                    global: state.variables.global,
                    collection: state.variables.collection
                }
            });
            break;
        case 'environment':
            if (state.currentEnvironment) {
                state.variables.environment[key] = varData;
                await chrome.storage.local.set({
                    [`env_${state.currentEnvironment}`]: state.variables.environment
                });
            }
            break;
    }
}

