/**
 * Postman API Implementation Unit Tests
 * 
 * PostmanライクなAPIテスト機能の単体テスト
 * executePostmanTestScript関数とisPostmanStyleScript関数をテストする
 */
import { executePostmanTestScript, isPostmanStyleScript } from '../../src/postmanTestAPI';
import type { RequestData, TestResult } from '../../src/types';

// Mock variable manager
jest.mock('../../src/variableManager', () => ({
    getVariable: jest.fn((key: string) => `mock-${key}`),
    setVariable: jest.fn(() => Promise.resolve())
}));

// Mock JSONPath
jest.mock('jsonpath-plus', () => ({
    JSONPath: {
        query: jest.fn()
    }
}));

// Mock ProcessedResponse interface
interface ProcessedResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    duration: number;
    size: number;
    body: any;
    bodyText: string;
    testResults?: TestResult[];
}

describe('Postman API Tests', () => {
    // テスト用のモックリクエストデータ
    const mockRequestData: RequestData = {
        id: 'test-request-1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://example.com/api/test',
        headers: { 'Content-Type': 'application/json' },
        params: { page: '1' },
        body: null,
        bodyType: 'none',
        auth: { type: 'none' },
        preRequestScript: '',
        testScript: ''
    };

    // テスト用のモックレスポンスデータ
    const mockResponseData: ProcessedResponse = {
        status: 200,
        statusText: 'OK',
        headers: {
            'content-type': 'application/json',
            'x-custom-header': 'test-value'
        },
        duration: 150,
        size: 1024,
        body: {
            success: true,
            data: {
                id: 123,
                name: 'Test User',
                items: ['item1', 'item2', 'item3']
            }
        },
        bodyText: '{"success":true,"data":{"id":123,"name":"Test User","items":["item1","item2","item3"]}}'
    };

    beforeEach(() => {
        // Clear global pm state
        (global as any).pm = undefined;
    });

    /**
     * Postmanスタイルスクリプト判定機能のテスト
     * 
     * 与えられたスクリプトがPostman形式のテストスクリプトかどうかを
     * 正しく判定できるかをテストする
     */
    describe('isPostmanStyleScript', () => {
        /**
         * Postmanスタイルのスクリプトを正しく検出できるかテスト
         * 
         * - pm.test()関数の使用
         * - pm.expect()関数の使用
         * - pm.response関連のAPI使用
         * - pm.environment関連のAPI使用
         * - pmオブジェクトの一般的な使用
         */
        test('should detect Postman-style scripts', () => {
            expect(isPostmanStyleScript('pm.test("test", function() {});')).toBe(true);
            expect(isPostmanStyleScript('pm.expect(123).to.equal(123);')).toBe(true);
            expect(isPostmanStyleScript('pm.response.to.have.status(200);')).toBe(true);
            expect(isPostmanStyleScript('pm.environment.set("key", "value");')).toBe(true);
            expect(isPostmanStyleScript('console.log(pm.request.url);')).toBe(true);
        });

        /**
         * 非Postmanスタイルのスクリプトを正しく除外できるかテスト
         * 
         * - カスタム形式のテストコマンド
         * - 通常のJavaScriptコード
         * - コメントのみの行
         */
        test('should not detect non-Postman scripts', () => {
            expect(isPostmanStyleScript('status 200')).toBe(false);
            expect(isPostmanStyleScript('bodyContains "success"')).toBe(false);
            expect(isPostmanStyleScript('console.log("test");')).toBe(false);
            expect(isPostmanStyleScript('// just a comment')).toBe(false);
        });
    });

    /**
     * Postmanテストスクリプト実行機能のテスト
     * 
     * 実際のPostman形式のテストスクリプトを実行し、
     * 期待される結果が返されるかをテストする
     */
    describe('executePostmanTestScript', () => {
        /**
         * 基本的なステータスコードチェックのテスト
         * 
         * - pm.test()関数の基本的な実行
         * - pm.response.to.have.status()によるステータスコード検証
         * - 成功時のテスト結果の構造確認
         */
        test('should execute simple status check test', async () => {
            const testScript = `
                pm.test("Status code is 200", function () {
                    pm.response.to.have.status(200);
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Status code is 200');
            expect(results[0].passed).toBe(true);
            expect(results[0].error).toBeUndefined();
        });

        /**
         * 失敗するステータスコードチェックのテスト
         * 
         * - 期待値と実際の値が異なる場合の処理
         * - 失敗時のエラーメッセージ生成
         * - テスト結果のpassed: falseの確認
         */
        test('should handle failing status check test', async () => {
            const testScript = `
                pm.test("Status code is 404", function () {
                    pm.response.to.have.status(404);
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Status code is 404');
            expect(results[0].passed).toBe(false);
            expect(results[0].error).toContain('Expected status 404, got 200');
        });

        /**
         * 複数のテストケースの実行テスト
         * 
         * - 一つのスクリプト内で複数のpm.test()実行
         * - 各テストケースの独立した結果取得
         * - 全テストケースの成功確認
         */
        test('should execute multiple tests', async () => {
            const testScript = `
                pm.test("Status code is 200", function () {
                    pm.response.to.have.status(200);
                });

                pm.test("Response has correct content type", function () {
                    pm.response.to.have.header("content-type", "application/json");
                });

                pm.test("Response body contains success", function () {
                    const json = pm.response.json();
                    pm.expect(json.success).to.be.true;
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(3);
            expect(results.every(r => r.passed)).toBe(true);
        });

        /**
         * JSONレスポンスプロパティのテスト
         * 
         * - pm.response.json()によるJSONパース
         * - ネストしたオブジェクトプロパティの検証
         * - 配列の長さと内容の検証
         * - pm.expect()のチェーンメソッド使用
         */
        test('should test JSON response properties', async () => {
            const testScript = `
                pm.test("Response data validation", function () {
                    const json = pm.response.json();
                    pm.expect(json.data.id).to.equal(123);
                    pm.expect(json.data.name).to.equal("Test User");
                    pm.expect(json.data.items).to.have.length(3);
                    pm.expect(json.data.items).to.include("item2");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        /**
         * リクエストプロパティの検証テスト
         * 
         * - pm.request.methodによるHTTPメソッド確認
         * - pm.request.urlによるURL確認
         * - pm.request.headersによるヘッダー確認
         */
        test('should test request properties', async () => {
            const testScript = `
                pm.test("Request validation", function () {
                    pm.expect(pm.request.method).to.equal("GET");
                    pm.expect(pm.request.url.toString()).to.include("example.com");
                    pm.expect(pm.request.headers.get("content-type")).to.equal("application/json");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        /**
         * レスポンスヘッダーの検証テスト
         * 
         * - pm.response.to.have.header()によるヘッダー存在確認
         * - ヘッダー値の完全一致確認
         * - 正規表現によるヘッダー値のパターンマッチング
         */
        test('should handle response headers', async () => {
            const testScript = `
                pm.test("Header tests", function () {
                    pm.response.to.have.header("content-type");
                    pm.response.to.have.header("x-custom-header", "test-value");
                    pm.response.to.have.header("content-type", /json/);
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        /**
         * レスポンス時間とサイズの検証テスト
         * 
         * - pm.response.responseTimeによる応答時間チェック
         * - pm.response.responseSizeによるレスポンスサイズチェック
         * - pm.response.codeによるステータスコード確認
         */
        test('should test response time and size', async () => {
            const testScript = `
                pm.test("Performance tests", function () {
                    pm.expect(pm.response.responseTime).to.be.below(1000);
                    pm.expect(pm.response.responseSize).to.be.above(100);
                    pm.expect(pm.response.code).to.equal(200);
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        /**
         * 環境変数・グローバル変数の操作テスト
         * 
         * - pm.environment.set()/get()による環境変数操作
         * - pm.globals.set()/get()によるグローバル変数操作
         * - モック化された変数マネージャーとの連携確認
         */
        test('should handle environment variables', async () => {
            const testScript = `
                pm.test("Environment variable tests", function () {
                    pm.environment.set("testKey", "testValue");
                    pm.globals.set("globalKey", "globalValue");
                    
                    const envValue = pm.environment.get("testKey");
                    const globalValue = pm.globals.get("globalKey");
                    
                    pm.expect(envValue).to.equal("mock-testKey");
                    pm.expect(globalValue).to.equal("mock-globalKey");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        /**
         * スクリプト実行時エラーのハンドリングテスト
         * 
         * - テスト内でthrowされたエラーの適切な捕捉
         * - エラー情報のテスト結果への反映
         * - passed: falseの設定確認
         */
        test('should handle script execution errors', async () => {
            const testScript = `
                pm.test("Error test", function () {
                    throw new Error("Test error");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(false);
            expect(results[0].error).toBe('Test error');
        });

        /**
         * 構文エラーのハンドリングテスト
         * 
         * - 不正なJavaScript構文の場合の処理
         * - 構文エラー時の適切なエラーレポート生成
         * - スクリプト実行エラーとしての分類
         */
        test('should handle syntax errors', async () => {
            const testScript = `
                pm.test("Syntax error test", function () {
                    invalid javascript syntax here
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Script Execution Error');
            expect(results[0].passed).toBe(false);
            expect(results[0].error).toContain('Unexpected');
        });

        /**
         * 配列とオブジェクトの操作テスト
         * 
         * - オブジェクトプロパティの存在確認
         * - 配列データ型の確認
         * - 配列要素の個別アクセスと値確認
         * - ネストした構造の検証
         */
        test('should test array and object operations', async () => {
            const testScript = `
                pm.test("Array and object tests", function () {
                    const json = pm.response.json();
                    
                    pm.expect(json).to.have.property("data");
                    pm.expect(json.data).to.have.property("items");
                    pm.expect(json.data.items).to.be.an("array");
                    pm.expect(json.data.items).to.have.length(3);
                    pm.expect(json.data.items[0]).to.equal("item1");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });

        /**
         * レスポンステキストの操作テスト
         * 
         * - pm.response.to.include()による文字列包含確認
         * - pm.response.to.match()による正規表現マッチング
         * - pm.response.text()による生テキスト取得
         */
        test('should test response text operations', async () => {
            const testScript = `
                pm.test("Response text tests", function () {
                    pm.response.to.include("success");
                    pm.response.to.include("Test User");
                    pm.response.to.match(/\\{"success":true/);
                    
                    const text = pm.response.text();
                    pm.expect(text).to.include("items");
                });
            `;

            const results = await executePostmanTestScript(testScript, mockResponseData, mockRequestData);
            
            expect(results).toHaveLength(1);
            expect(results[0].passed).toBe(true);
        });
    });
});