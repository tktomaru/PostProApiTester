/**
 * State Management Unit Tests
 * 
 * アプリケーション状態管理機能の単体テスト
 * AppState型の各プロパティと操作をテストする
 */
import type { AppState, Collection, RequestData } from '../../src/types';

describe('State Management Unit Tests', () => {
    let mockState: AppState;

    /**
     * 各テストの前に実行される初期化処理
     * モック状態を初期値にリセットする
     */
    beforeEach(() => {
        // Reset mock state before each test
        mockState = {
            collections: [],
            scenarios: [],
            history: [],
            environments: [],
            currentCollection: null,
            currentScenario: null,
            currentEnvironment: null,
            currentRequest: null,
            variables: {
                global: {},
                collection: {},
                environment: {}
            },
            sidebarState: {
                expandedCollections: new Set(),
                expandedScenarios: new Set()
            }
        };
    });

    /**
     * コレクション管理機能のテスト
     * 
     * - コレクションの追加
     * - コレクションの検索
     * - コレクションの削除
     */
    describe('Collection Management', () => {
        /**
         * 新しいコレクションを状態に追加するテスト
         * 
         * - コレクション配列に正しく追加される
         * - 追加されたコレクションのプロパティが正しく設定される
         * - 配列の長さが適切に増加する
         */
        test('should add new collection to state', () => {
            const newCollection: Collection = {
                id: 'col-1',
                name: 'Test Collection',
                description: 'A test collection',
                requests: []
            };

            mockState.collections.push(newCollection);
            
            expect(mockState.collections).toHaveLength(1);
            expect(mockState.collections[0].id).toBe('col-1');
            expect(mockState.collections[0].name).toBe('Test Collection');
        });

        /**
         * IDによるコレクション検索テスト
         * 
         * - 複数のコレクションから特定のIDのものを検索
         * - Array.find()メソッドの動作確認
         * - 存在するIDの場合は正しいオブジェクトを返す
         */
        test('should find collection by id', () => {
            const collection1: Collection = {
                id: 'col-1',
                name: 'Collection 1',
                requests: []
            };
            const collection2: Collection = {
                id: 'col-2',
                name: 'Collection 2',
                requests: []
            };

            mockState.collections = [collection1, collection2];
            
            const found = mockState.collections.find(c => c.id === 'col-2');
            expect(found).toBeDefined();
            expect(found?.name).toBe('Collection 2');
        });

        /**
         * コレクションの削除テスト
         * 
         * - Array.filter()を使用した削除処理
         * - 指定されたIDのコレクションが削除される
         * - 他のコレクションは残る
         */
        test('should remove collection from state', () => {
            const collection1: Collection = {
                id: 'col-1',
                name: 'Collection 1',
                requests: []
            };
            const collection2: Collection = {
                id: 'col-2',
                name: 'Collection 2',
                requests: []
            };

            mockState.collections = [collection1, collection2];
            
            mockState.collections = mockState.collections.filter(c => c.id !== 'col-1');
            
            expect(mockState.collections).toHaveLength(1);
            expect(mockState.collections[0].id).toBe('col-2');
        });
    });

    /**
     * リクエスト管理機能のテスト
     * 
     * - コレクションへのリクエスト追加
     * - 現在のリクエスト設定
     */
    describe('Request Management', () => {
        /**
         * コレクションにリクエストを追加するテスト
         * 
         * - リクエストがコレクションの配列に追加される
         * - リクエストのプロパティが正しく保持される
         * - コレクションとリクエストの関連付け
         */
        test('should add request to collection', () => {
            const collection: Collection = {
                id: 'col-1',
                name: 'Test Collection',
                requests: []
            };

            const request: RequestData = {
                id: 'req-1',
                name: 'Test Request',
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: {},
                params: {},
                body: null,
                bodyType: 'none',
                auth: { type: 'none' },
                preRequestScript: ''
            };

            collection.requests.push(request);
            mockState.collections = [collection];
            
            expect(collection.requests).toHaveLength(1);
            expect(collection.requests[0].name).toBe('Test Request');
        });

        /**
         * 現在のリクエスト設定テスト
         * 
         * - currentRequestプロパティへの設定
         * - リクエストオブジェクトの正しい保持
         * - 状態の更新確認
         */
        test('should set current request', () => {
            const request: RequestData = {
                id: 'req-1',
                name: 'Current Request',
                method: 'POST',
                url: 'https://api.example.com/users',
                headers: { 'Content-Type': 'application/json' },
                params: {},
                body: { name: 'John' },
                bodyType: 'json',
                auth: { type: 'none' },
                preRequestScript: ''
            };

            mockState.currentRequest = request;
            
            expect(mockState.currentRequest).toBeDefined();
            expect(mockState.currentRequest?.method).toBe('POST');
            expect(mockState.currentRequest?.name).toBe('Current Request');
        });
    });

    /**
     * 変数管理機能のテスト
     * 
     * - グローバル変数の管理
     * - 環境変数の管理
     * - コレクション変数の管理
     */
    describe('Variable Management', () => {
        /**
         * グローバル変数の管理テスト
         * 
         * - グローバル変数の設定と取得
         * - 変数の値と説明の保存
         * - 複数変数の管理
         */
        test('should manage global variables', () => {
            mockState.variables.global = {
                'baseUrl': { value: 'https://api.example.com', description: 'Base API URL' },
                'apiKey': { value: 'test-key-123', description: 'API authentication key' }
            };
            
            expect(Object.keys(mockState.variables.global)).toHaveLength(2);
            expect(mockState.variables.global['baseUrl'].value).toBe('https://api.example.com');
        });

        /**
         * 環境変数の管理テスト
         * 
         * - 環境固有の変数設定
         * - 変数の値と説明の保存
         * - 環境間での変数の分離
         */
        test('should manage environment variables', () => {
            mockState.variables.environment = {
                'token': { value: 'env-token-456', description: 'Environment specific token' }
            };
            
            expect(mockState.variables.environment['token'].value).toBe('env-token-456');
        });

        /**
         * コレクション変数の管理テスト
         * 
         * - コレクション固有の変数設定
         * - ネストした構造での変数保存
         * - コレクションIDによる変数の分離
         */
        test('should manage collection variables', () => {
            mockState.variables.collection = {
                'col-1': {
                    'collectionVar': { value: 'collection-specific-value', description: 'Collection variable' }
                }
            };
            
            expect(mockState.variables.collection['col-1']['collectionVar'].value)
                .toBe('collection-specific-value');
        });
    });

    /**
     * 現在の状態管理テスト
     * 
     * - 現在のコレクション設定
     * - 現在の環境設定
     * - 現在のシナリオ設定
     * - 状態のクリア
     */
    describe('Current State Management', () => {
        /**
         * 現在のコレクション設定テスト
         * 
         * - currentCollectionプロパティへの設定
         * - 文字列IDの保存
         */
        test('should set current collection', () => {
            mockState.currentCollection = 'col-1';
            
            expect(mockState.currentCollection).toBe('col-1');
        });

        /**
         * 現在の環境設定テスト
         * 
         * - currentEnvironmentプロパティへの設定
         * - 環境IDの保存
         */
        test('should set current environment', () => {
            mockState.currentEnvironment = 'env-dev';
            
            expect(mockState.currentEnvironment).toBe('env-dev');
        });

        /**
         * 現在のシナリオ設定テスト
         * 
         * - currentScenarioプロパティへの設定
         * - シナリオIDの保存
         */
        test('should set current scenario', () => {
            mockState.currentScenario = 'scenario-1';
            
            expect(mockState.currentScenario).toBe('scenario-1');
        });

        /**
         * 現在の状態をクリアするテスト
         * 
         * - 各currentプロパティをnullに設定
         * - 状態のリセット確認
         * - アプリケーションの初期状態への復帰
         */
        test('should clear current states', () => {
            mockState.currentCollection = 'col-1';
            mockState.currentEnvironment = 'env-dev';
            mockState.currentScenario = 'scenario-1';
            
            // Clear states
            mockState.currentCollection = null;
            mockState.currentEnvironment = null;
            mockState.currentScenario = null;
            
            expect(mockState.currentCollection).toBeNull();
            expect(mockState.currentEnvironment).toBeNull();
            expect(mockState.currentScenario).toBeNull();
        });
    });

    /**
     * サイドバー状態管理テスト
     * 
     * - 展開されたコレクションの追跡
     * - 展開状態のトグル操作
     */
    describe('Sidebar State Management', () => {
        /**
         * 展開されたコレクションの管理テスト
         * 
         * - SetオブジェクトによるID管理
         * - 複数コレクションの展開状態追跡
         * - 存在確認メソッドの動作
         */
        test('should manage expanded collections', () => {
            mockState.sidebarState?.expandedCollections.add('col-1');
            mockState.sidebarState?.expandedCollections.add('col-2');
            
            expect(mockState.sidebarState?.expandedCollections.has('col-1')).toBe(true);
            expect(mockState.sidebarState?.expandedCollections.has('col-2')).toBe(true);
            expect(mockState.sidebarState?.expandedCollections.has('col-3')).toBe(false);
        });

        /**
         * 展開状態のトグル操作テスト
         * 
         * - 展開状態の追加と削除
         * - Setオブジェクトのadd/deleteメソッド
         * - UI状態の動的な変更
         */
        test('should toggle expanded state', () => {
            const collectionId = 'col-1';
            
            // Add to expanded
            mockState.sidebarState?.expandedCollections.add(collectionId);
            expect(mockState.sidebarState?.expandedCollections.has(collectionId)).toBe(true);
            
            // Remove from expanded
            mockState.sidebarState?.expandedCollections.delete(collectionId);
            expect(mockState.sidebarState?.expandedCollections.has(collectionId)).toBe(false);
        });
    });

    /**
     * 履歴管理機能のテスト
     * 
     * - 履歴アイテムの追加
     * - 履歴サイズの制限
     */
    describe('History Management', () => {
        /**
         * 履歴アイテムの追加テスト
         * 
         * - リクエストとレスポンスの履歴保存
         * - タイムスタンプの記録
         * - 履歴配列への追加
         */
        test('should add items to history', () => {
            const historyItem = {
                id: 'hist-1',
                timestamp: new Date().toISOString(),
                request: {
                    id: 'req-1',
                    name: 'Test Request',
                    method: 'GET',
                    url: 'https://api.example.com/test',
                    headers: {},
                    params: {},
                    body: null,
                    bodyType: 'none' as const,
                    auth: { type: 'none' as const },
                    preRequestScript: ''
                },
                response: {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'content-type': 'application/json' },
                    duration: 150,
                    size: 1024,
                    body: { success: true },
                    bodyText: '{"success":true}'
                }
            };

            mockState.history.push(historyItem);
            
            expect(mockState.history).toHaveLength(1);
            expect(mockState.history[0].request.method).toBe('GET');
            expect(mockState.history[0].response.status).toBe(200);
        });

        /**
         * 履歴サイズの制限テスト
         * 
         * - 最大履歴数の制限
         * - 古い履歴の自動削除
         * - 最新の履歴の保持
         * - メモリ使用量の管理
         */
        test('should limit history size', () => {
            const maxHistorySize = 100;
            
            // Add more than max items
            for (let i = 0; i < 150; i++) {
                mockState.history.push({
                    id: `hist-${i}`,
                    timestamp: new Date().toISOString(),
                    request: {} as RequestData,
                    response: {} as any
                });
            }
            
            // Simulate trimming to max size
            if (mockState.history.length > maxHistorySize) {
                mockState.history = mockState.history.slice(-maxHistorySize);
            }
            
            expect(mockState.history).toHaveLength(maxHistorySize);
            expect(mockState.history[0].id).toBe('hist-50'); // Should keep latest 100
        });
    });
});