// variableManager.js
// ───────────────────────────────────────────────────────────────────────────────
// 環境変数・コレクション変数・グローバル変数を管理する

import {
    variables,
    environments,
    currentEnvironment,
    currentCollection,
    saveVariablesToStorage,
    saveEnvironmentsToStorage,
    saveEnvDataToStorage,
    saveCurrentEnvironmentToStorage
} from './state.js';
import { collections } from './state.js';

import { showError, showSuccess, escapeHtml } from './utils.js';

/**
 * initializeVariablesManagement
 *  ページロード時に環境セレクタや「New/Edit/追加」ボタン等のイベント登録 → 描画
 */
export async function initializeVariablesManagement() {
    try {
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
 * setupVariableEventListeners
 *  各「Add」「Edit」ボタン、セレクト変更時のイベント登録
 */
export function setupVariableEventListeners() {
    document.getElementById('newEnvironmentBtn').addEventListener('click', createNewEnvironment);
    document.getElementById('editEnvironmentBtn').addEventListener('click', editCurrentEnvironment);
    document.getElementById('environmentSelect').addEventListener('change', switchEnvironment);

    document.getElementById('addGlobalVarBtn').addEventListener('click', () => addVariableRow('global'));
    document.getElementById('addEnvVarBtn').addEventListener('click', () => addVariableRow('environment'));
    document.getElementById('addCollectionVarBtn').addEventListener('click', () => addVariableRow('collection'));

    document.getElementById('collectionVarSelect').addEventListener('change', () => {
        currentCollection = document.getElementById('collectionVarSelect').value;
        renderVariables('collection');
    });
}

/**
 * renderEnvironmentSelector
 *  環境のプルダウンを再描画
 */
export function renderEnvironmentSelector() {
    const select = document.getElementById('environmentSelect');
    select.innerHTML = '<option value="">No Environment</option>';
    environments.forEach(env => {
        const option = document.createElement('option');
        option.value = env.id;
        option.textContent = env.name;
        if (env.id === currentEnvironment) {
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
        id: Date.now().toString(),
        name: name,
        created: new Date().toISOString()
    };

    environments.push(env);
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
    if (!currentEnvironment) {
        showError('No environment selected');
        return;
    }
    const env = environments.find(e => e.id === currentEnvironment);
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

    if (currentEnvironment) {
        await saveEnvDataToStorage(currentEnvironment);
    }

    currentEnvironment = envId;
    await saveCurrentEnvironmentToStorage();

    if (envId) {
        const envData = await chrome.storage.local.get([`env_${envId}`]);
        variables.environment = envData[`env_${envId}`] || {};
    } else {
        variables.environment = {};
    }

    renderVariables('environment');
    const envName = envId ? environments.find(e => e.id === envId)?.name : 'No Environment';
    showSuccess('Switched to: ' + envName);
}

/**
 * updateCollectionVarSelector
 *  コレクション変数用のプルダウンを再描画
 */
export function updateCollectionVarSelector() {
    const select = document.getElementById('collectionVarSelect');
    select.innerHTML = '<option value="">Select Collection</option>';
    collections.forEach(collection => {
        const option = document.createElement('option');
        option.value = collection.id;
        option.textContent = collection.name;
        if (collection.id == currentCollection) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

/**
 * renderAllVariables
 *  グローバル・環境・コレクションの変数一覧を描画
 */
export function renderAllVariables() {
    renderVariables('global');
    renderVariables('environment');
    renderVariables('collection');
}

/**
 * renderVariables
 *  scope ('global'|'environment'|'collection') に応じた変数一覧を描画
 */
export function renderVariables(scope) {
    let container, data;

    switch (scope) {
        case 'global':
            container = document.getElementById('globalVariablesContainer');
            data = variables.global || {};
            break;
        case 'environment':
            container = document.getElementById('envVariablesContainer');
            if (!currentEnvironment) {
                container.innerHTML = '<p class="empty-message">Select an environment to manage variables</p>';
                return;
            }
            data = variables.environment || {};
            break;
        case 'collection':
            container = document.getElementById('collectionVariablesContainer');
            const selectedCollection = document.getElementById('collectionVarSelect').value;
            if (!selectedCollection) {
                container.innerHTML = '<p class="empty-message">Select a collection to manage variables</p>';
                return;
            }
            data = variables.collection[selectedCollection] || {};
            break;
    }

    container.innerHTML = '';

    const headerRow = document.createElement('div');
    headerRow.className = 'variable-header-row';
    headerRow.innerHTML = `
        <span>Variable</span>
        <span>Value</span>
        <span>Description</span>
        <span></span>
    `;
    container.appendChild(headerRow);

    const entries = Object.entries(data);
    if (entries.length === 0) {
        const emptyRow = document.createElement('div');
        emptyRow.className = 'empty-variables';
        emptyRow.innerHTML = '<p>No variables defined. Click "Add" to create one.</p>';
        container.appendChild(emptyRow);
    } else {
        entries.forEach(([key, value]) => {
            const varData = typeof value === 'object' ? value : { value: value, description: '' };
            const row = createVariableRow(scope, key, varData.value, varData.description);
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
            return key in variables.global;
        case 'environment':
            return key in variables.environment;
        case 'collection':
            return currentCollection && variables.collection[currentCollection] && key in variables.collection[currentCollection];
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
            variables.global[key] = varData;
            await saveVariablesToStorage();
            break;
        case 'environment':
            if (!currentEnvironment) return;
            variables.environment[key] = varData;
            await saveEnvDataToStorage(currentEnvironment);
            break;
        case 'collection':
            if (!currentCollection) return;
            if (!variables.collection[currentCollection]) {
                variables.collection[currentCollection] = {};
            }
            variables.collection[currentCollection][key] = varData;
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
            delete variables.global[key];
            await saveVariablesToStorage();
            break;
        case 'environment':
            if (!currentEnvironment) return;
            delete variables.environment[key];
            await saveEnvDataToStorage(currentEnvironment);
            break;
        case 'collection':
            if (!currentCollection) return;
            delete variables.collection[currentCollection][key];
            await saveVariablesToStorage();
            break;
    }
}

/**
 * addVariableRow
 *  空行を追加してフォーカスを当てる
 */
export function addVariableRow(scope) {
    if (scope === 'environment' && !currentEnvironment) {
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
