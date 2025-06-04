// state.js
// ───────────────────────────────────────────────────────────────────────────────
// グローバル変数と、chrome.storage への読み書きロジックをまとめる

// リクエスト全般
export let currentRequest = {
    method: 'GET',
    url: '',
    headers: {},
    params: {},
    body: null,
    auth: { type: 'none' }
};

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
