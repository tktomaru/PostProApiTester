// state.ts
// ───────────────────────────────────────────────────────────────────────────────
// グローバル変数と、chrome.storage への読み書きロジックをまとめる

import type { AppState, RequestData } from './types';
import { updateCollectionVarSelector } from './variableManager';
import { renderScenarioList } from './scenarioManager';

// コレクション・履歴・変数群
export const state: AppState = {
    // 現在編集中のリクエスト全体を保持
    // 初期値として最低限必要なフィールドをそろえておく
    currentRequest: {
        id: '',
        name: '',
        method: 'GET',
        url: '',
        headers: {},
        params: {},
        body: null,
        auth: { type: 'none' },
        folder: '',
        description: '',
        bodyType: 'none',
        preRequestScript: ''
    },

    // 全コレクション一覧
    collections: [],

    // リクエスト履歴
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
    environments: [],

    // 現在選択中の環境ID（null の場合は未選択）
    currentEnvironment: null,

    // 現在選択中のコレクションID（null の場合は未選択）
    currentCollection: null,

    // シナリオ一覧
    scenarios: [],
    
    currentScenario: null, // 今編集中 or 実行対象のシナリオID
    
    // サイドバーの開閉状態
    sidebarState: {
        expandedCollections: new Set<string>(),
        expandedScenarios: new Set<string>()
    }
};

// Additional state properties not in AppState interface
interface ExtendedState extends AppState {
    testScripts: any[];
    settings: Record<string, any>;
    isInterceptorActive: boolean;
}

const extendedState = state as ExtendedState;
extendedState.testScripts = [];
extendedState.settings = {};
extendedState.isInterceptorActive = false;

/**
 * loadAllStoredData
 *  chrome.storage から以下のキーを読み込み、state を初期化する
 */
export async function loadAllStoredData(): Promise<void> {
    try {
        const result = await chrome.storage.local.get([
            'collections',
            'history',
            'variables',
            'environments',
            'currentEnvironment',
            'currentCollection',
            'settings',
            'scenarios'
        ]);

        if (result.collections) {
            state.collections = result.collections;
            console.log('Collections loaded from storage:', state.collections.length, state.collections);
        } else {
            console.log('No collections found in storage');
        }

        if (result.history) {
            state.history = result.history;
        }

        if (result.variables?.global) {
            state.variables.global = result.variables.global;
            console.log('Global variables loaded from storage:', Object.keys(state.variables.global).length, state.variables.global);
        } else {
            console.log('No global variables found in storage');
        }

        if (result.variables?.collection) {
            state.variables.collection = result.variables.collection;
            console.log('Collection variables loaded from storage:', Object.keys(state.variables.collection).length, state.variables.collection);
        } else {
            console.log('No collection variables found in storage');
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
            extendedState.settings = result.settings;
        }

        if (result.scenarios) {
            state.scenarios = result.scenarios;
        }

        // サイドバー状態を復元
        await loadSidebarStateFromStorage();

        console.log('Stored data loaded:', {
            collectionsCount: state.collections.length,
            historyCount: state.history.length,
            environmentsCount: state.environments.length,
            currentEnvironment: state.currentEnvironment,
            currentCollection: state.currentCollection,
            scenariosCount: state.scenarios.length
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
export async function saveCollectionsToStorage(): Promise<void> {
    try {
        console.log('Saving collections to storage:', state.collections.length, 'collections');
        await chrome.storage.local.set({ collections: state.collections });
        // 保存後にストレージから再読み込みする必要はない
        // コレクション変数セレクタも更新
        updateCollectionVarSelector();
    } catch (error: any) {
        console.error('Failed to save collections to storage:', error);
        const { showStorageError } = await import('./utils');
        showStorageError('save collections', error);
        throw error; // Re-throw to allow caller to handle if needed
    }
}

/**
 * saveHistoryToStorage
 *  state.history を chrome.storage.local に保存
 */
export async function saveHistoryToStorage(): Promise<void> {
    try {
        await chrome.storage.local.set({ history: state.history });
    } catch (error: any) {
        console.error('Failed to save history to storage:', error);
        const { showStorageError } = await import('./utils');
        showStorageError('save history', error);
        throw error;
    }
}

/**
 * saveVariablesToStorage
 *  state.variables.global と state.variables.collection を chrome.storage.local に保存
 */
export async function saveVariablesToStorage(): Promise<void> {
    console.log('Saving variables to storage:', {
        globalCount: Object.keys(state.variables.global).length,
        collectionCount: Object.keys(state.variables.collection).length,
        environmentCount: Object.keys(state.variables.environment).length
    });
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
export async function saveEnvironmentsToStorage(): Promise<void> {
    await chrome.storage.local.set({ environments: state.environments });
}

/**
 * saveCurrentEnvironmentToStorage
 *  state.currentEnvironment を chrome.storage.local に保存
 */
export async function saveCurrentEnvironmentToStorage(): Promise<void> {
    await chrome.storage.local.set({ currentEnvironment: state.currentEnvironment });
}

/**
 * saveEnvDataToStorage
 *  指定された環境ID の state.variables.environment を保存
 */
export async function saveEnvDataToStorage(envId: string): Promise<void> {
    await chrome.storage.local.set({ [`env_${envId}`]: state.variables.environment });
}

/**
 * saveCurrentCollectionToStorage
 *  state.currentCollection を chrome.storage.local に保存
 */
export async function saveCurrentCollectionToStorage(): Promise<void> {
    await chrome.storage.local.set({ currentCollection: state.currentCollection });
}

/**
 * saveSettingsToStorage
 *  state.settings を chrome.storage.local に保存
 */
export async function saveSettingsToStorage(): Promise<void> {
    await chrome.storage.local.set({ settings: extendedState.settings });
}

/**
 * saveScenariosToStorage
 */
export async function saveScenariosToStorage(): Promise<void> {
    await chrome.storage.local.set({ scenarios: state.scenarios });
    renderScenarioList();
}

/**
 * saveCurrentScenarioToStorage
 */
export async function saveCurrentScenarioToStorage(): Promise<void> {
    await chrome.storage.local.set({ currentScenario: state.currentScenario });
}

/**
 * saveCurrentRequestToStorage
 *  state.currentRequest を chrome.storage.local に保存
 */
export async function saveCurrentRequestToStorage(request: RequestData): Promise<void> {
    await chrome.storage.local.set({ currentRequest: request });
}

/**
 * toggleInterceptorState
 *  state.isInterceptorActive を切り替えて、chrome.storage にも保存
 */
export async function toggleInterceptorState(active: boolean): Promise<void> {
    extendedState.isInterceptorActive = active;
    await chrome.storage.local.set({ isInterceptorActive: active });
}

/**
 * サイドバーの開閉状態を保存
 */
export async function saveSidebarStateToStorage(): Promise<void> {
    try {
        if (state.sidebarState) {
            const sidebarState = {
                expandedCollections: Array.from(state.sidebarState.expandedCollections),
                expandedScenarios: Array.from(state.sidebarState.expandedScenarios)
            };
            await chrome.storage.local.set({ sidebarState });
        }
    } catch (error) {
        console.error('Error saving sidebar state:', error);
    }
}

/**
 * サイドバーの開閉状態を復元
 */
export async function loadSidebarStateFromStorage(): Promise<void> {
    try {
        const stored = await chrome.storage.local.get(['sidebarState']);
        if (stored.sidebarState) {
            state.sidebarState = {
                expandedCollections: new Set(stored.sidebarState.expandedCollections || []),
                expandedScenarios: new Set(stored.sidebarState.expandedScenarios || [])
            };
        }
    } catch (error) {
        console.error('Error loading sidebar state:', error);
    }
}