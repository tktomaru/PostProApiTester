// state.js
// ───────────────────────────────────────────────────────────────────────────────
// グローバル変数と、chrome.storage への読み書きロジックをまとめる

import { renderCollectionsTree } from './collectionManager.js';
import { updateCollectionVarSelector } from './variableManager.js';
import { renderScenarioList } from './scenarioManager.js';

// コレクション・履歴・変数群
export const state = {
    // 現在編集中のリクエスト全体を保持
    // 初期値として最低限必要なフィールドをそろえておく
    currentRequest: {
        method: 'GET',
        url: '',
        headers: {},
        params: {},
        body: null,
        auth: { type: 'none' }
    },

    // 全コレクション一覧
    // 各コレクションは { id, name, description, requests: [...] } という形を想定
    collections: [],

    // リクエスト履歴
    // 各履歴アイテムは { id, timestamp, request: { … }, response: { … } } の形を想定
    history: [],

    // 変数管理用オブジェクト
    variables: {
        // グローバル変数：{ [key]: { value, description } }
        global: {},

        // 環境変数：{ [key]: { value, description } }
        environment: {},

        // コレクションごとの変数：{ [collectionId]: { [key]: { value, description } } }
        collection: {}
    },

    // 環境（Environment）一覧
    // 各環境は { id, name, created } の形を想定
    environments: [],

    // 現在選択中の環境ID（null の場合は未選択）
    currentEnvironment: null,

    // 現在選択中のコレクションID（null の場合は未選択）
    currentCollection: null,

    // テストスクリプトの一覧
    // 各スクリプトは文字列、または { name, code } の形を想定
    testScripts: [],

    // 設定情報
    // 例: { timeout: 30000, followRedirects: true, validateSSL: true, maxHistoryItems: 100, … }
    settings: {},

    // ネットワークインターセプトのオン/オフ
    isInterceptorActive: false,
    // ◆ 新規：scenarios を追加
    scenarios: [
        // {
        //   id: 'scenario1',
        //   name: 'ログイン→取得→ログアウト',
        //   requests: [
        //     { id: 'reqA', name: 'Login', method: 'POST', url: '/api/login', headers: {…}, body: '…', … },
        //     { id: 'reqB', name: 'GetData', method: 'GET', url: '/api/data', … },
        //     { id: 'reqC', name: 'Logout', method: 'POST', url: '/api/logout', … }
        //   ]
        // }
    ],
    currentScenario: null, // 今編集中 or 実行対象のシナリオID
};


/**
 * loadAllStoredData
 *  chrome.storage から以下のキーを読み込み、state を初期化する
 *   - collections
 *   - history
 *   - variables
 *   - environments
 *   - currentEnvironment
 *   - currentCollection
 *   - settings
 */
export async function loadAllStoredData() {
    try {
        const result = await chrome.storage.local.get([
            'collections',
            'history',
            'variables',
            'environments',
            'currentEnvironment',
            'currentCollection',
            'settings'
        ]);

        if (result.collections) {
            state.collections = result.collections;
        }

        if (result.history) {
            state.history = result.history;
        }

        if (result.variables?.global) {
            state.variables.global = result.variables.global;
        }

        if (result.variables?.collection) {
            state.variables.collection = result.variables.collection;
        }

        if (result.environments) {
            state.environments = result.environments;
        }

        if (result.currentEnvironment) {
            state.currentEnvironment = result.currentEnvironment;
            // 環境ごとの詳細データを読み込む
            const envData = await chrome.storage.local.get([`env_${state.currentEnvironment}`]);
            if (envData[`env_${state.currentEnvironment}`]) {
                state.variables.environment = envData[`env_${state.currentEnvironment}`];
            }
        }

        if (result.currentCollection) {
            state.currentCollection = result.currentCollection;
        }

        if (result.settings) {
            state.settings = result.settings;
        }

        console.log('Stored data loaded:', {
            collectionsCount: state.collections.length,
            historyCount: state.history.length,
            environmentsCount: state.environments.length,
            currentEnvironment: state.currentEnvironment,
            currentCollection: state.currentCollection
        });
    } catch (error) {
        console.error('Error loading stored data:', error);
        throw error;
    }
}

/**
 * saveCollectionsToStorage
 *  state.collections を chrome.storage.local に保存
 */
export async function saveCollectionsToStorage() {
    await chrome.storage.local.set({ collections: state.collections });

    const stored = await chrome.storage.local.get(['collections']);
    state.collections.splice(0, state.collections.length, ...stored.collections);
    // 画面にレンダリング
    renderCollectionsTree();
    // コレクション変数セレクタも更新
    updateCollectionVarSelector();

}

/**
 * saveHistoryToStorage
 *  state.history を chrome.storage.local に保存
 */
export async function saveHistoryToStorage() {
    await chrome.storage.local.set({ history: state.history });
}

/**
 * saveVariablesToStorage
 *  state.variables.global と state.variables.collection を chrome.storage.local に保存
 */
export async function saveVariablesToStorage() {
    await chrome.storage.local.set({
        variables: {
            global: state.variables.global,
            collection: state.variables.collection,
            environment: state.variables.environment
        }
    });
}

/**
 * saveEnvironmentsToStorage
 *  state.environments を chrome.storage.local に保存
 */
export async function saveEnvironmentsToStorage() {
    await chrome.storage.local.set({ environments: state.environments });
}

/**
 * saveCurrentEnvironmentToStorage
 *  state.currentEnvironment を chrome.storage.local に保存
 */
export async function saveCurrentEnvironmentToStorage() {
    await chrome.storage.local.set({ currentEnvironment: state.currentEnvironment });
}

/**
 * saveEnvDataToStorage
 *  指定された環境ID の state.variables.environment を保存
 */
export async function saveEnvDataToStorage(envId) {
    await chrome.storage.local.set({ [`env_${envId}`]: state.variables.environment });
}

/**
 * saveCurrentCollectionToStorage
 *  state.currentCollection を chrome.storage.local に保存
 */
export async function saveCurrentCollectionToStorage() {
    await chrome.storage.local.set({ currentCollection: state.currentCollection });
}

/**
 * saveSettingsToStorage
 *  state.settings を chrome.storage.local に保存
 */
export async function saveSettingsToStorage() {
    await chrome.storage.local.set({ settings: state.settings });
}

/**
 * saveScenariosToStorage
 */
export async function saveScenariosToStorage() {
    await chrome.storage.local.set({ scenarios: state.scenarios });
    renderScenarioList();
}

/**
 * toggleInterceptorState
 *  state.isInterceptorActive を切り替えて、chrome.storage にも保存
 */
export async function toggleInterceptorState(active) {
    state.isInterceptorActive = active;
    await chrome.storage.local.set({ isInterceptorActive: active });
}