// state.js
// ───────────────────────────────────────────────────────────────────────────────
// グローバル変数と、chrome.storage への読み書きロジックをまとめる

// コレクション・履歴・変数群
export let collections = [];
export let history = [];
export let variables = {
    global: {},
    environment: {},
    collection: {}
};

// 環境・コレクション・インターセプタのステート
export let environments = [];
export let currentEnvironment = null;
export let currentCollection = null;
export let isInterceptorActive = false;

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
    isInterceptorActive: false
};



/**
 * loadAllStoredData
 *  ストレージから「collections, history, variables, environments, currentEnvironment, currentCollection」の各キーを
 *  読み出し、必要に応じてグローバル変数を初期化する
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
            collections = result.collections;
        }
        if (result.history) {
            history = result.history;
        }
        if (result.variables?.global) {
            variables.global = result.variables.global;
        }
        if (result.variables?.collection) {
            variables.collection = result.variables.collection;
        }
        if (result.environments) {
            environments = result.environments;
        }
        if (result.currentEnvironment) {
            currentEnvironment = result.currentEnvironment;
            const envData = await chrome.storage.local.get([`env_${currentEnvironment}`]);
            if (envData[`env_${currentEnvironment}`]) {
                variables.environment = envData[`env_${currentEnvironment}`];
            }
        }
        if (result.currentCollection) {
            currentCollection = result.currentCollection;
        }

        console.log('Stored data loaded:', {
            collectionsCount: collections.length,
            historyCount: history.length,
            environmentsCount: environments.length,
            currentEnvironment,
            currentCollection
        });
    } catch (error) {
        console.error('Error loading stored data:', error);
        throw error;
    }
}

/**
 * saveCollectionsToStorage
 *  collections 配列を chrome.storage.local に保存
 */
export async function saveCollectionsToStorage() {
    await chrome.storage.local.set({ collections });
}

/**
 * saveHistoryToStorage
 *  history 配列を chrome.storage.local に保存
 */
export async function saveHistoryToStorage() {
    await chrome.storage.local.set({ history });
}

/**
 * saveVariablesToStorage
 *  グローバル・コレクションの変数を chrome.storage.local に保存
 */
export async function saveVariablesToStorage() {
    await chrome.storage.local.set({
        variables: {
            global: variables.global,
            collection: variables.collection
        }
    });
}

/**
 * saveEnvironmentsToStorage
 *  environments 配列を chrome.storage.local に保存
 */
export async function saveEnvironmentsToStorage() {
    await chrome.storage.local.set({ environments });
}

/**
 * saveCurrentEnvironmentToStorage
 *  currentEnvironment を chrome.storage.local に保存
 */
export async function saveCurrentEnvironmentToStorage() {
    await chrome.storage.local.set({ currentEnvironment });
}

/**
 * saveEnvDataToStorage
 *  指定された環境ID の variables.environment を保存
 */
export async function saveEnvDataToStorage(envId) {
    await chrome.storage.local.set({ [`env_${envId}`]: variables.environment });
}

/**
 * saveCurrentCollectionToStorage
 *  currentCollection を chrome.storage.local に保存
 */
export async function saveCurrentCollectionToStorage() {
    await chrome.storage.local.set({ currentCollection });
}
