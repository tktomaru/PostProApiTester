// defaultData.ts
// ───────────────────────────────────────────────────────────────────────────────

import type { Collection, Scenario, Environment, VariableData } from './types';

/** グローバル変数のサンプル */
export const sampleGlobalVariables: Record<string, VariableData> = {
    apiUrl: { value: 'https://reply.tukutano.jp', description: '基本となる API の URL' },
    baseUrl: { value: 'https://reply.tukutano.jp', description: '基本となる API の URL' },
    timeout: { value: '30000', description: 'タイムアウト（ミリ秒）' }
};

/** 環境（Environment）のサンプル */
export const sampleEnvironments: Environment[] = [
    { id: 'env_dev', name: 'Development', created: new Date().toISOString(), variables: {} },
    { id: 'env_prod', name: 'Production', created: new Date().toISOString(), variables: {} }
];

/** 各環境に対応する変数のサンプル */
// たとえば「env_dev」には devToken、「env_prod」には prodToken
export const sampleEnvironmentVariables: Record<string, Record<string, VariableData>> = {
    env_dev: {
        devToken: { value: 'dev-abcdef12345', description: '開発用トークン' }
    },
    env_prod: {
        prodToken: { value: 'prod-xyz987654', description: '本番用トークン' }
    }
};

/** コレクション（Collection）のサンプル */
export const sampleCollections: Collection[] = [
    {
        id: 'col_sample',
        name: 'Sample Collection',
        description: 'サンプル用コレクション',
        requests: [
            {
                id: 'req1',
                name: 'POST Users',
                method: 'POST',
                url: '{{apiUrl}}/api/auth/login',
                headers: { 'Accept': 'application/json', "removeHeader": "removeHeaderValue" },
                params: { page: '1' },
                body: JSON.stringify({
                    "username": "tomaru",
                    "password": ""
                }),
                auth: { type: 'bearer', token: '{{devToken}}' },
                folder: '',
                description: 'ユーザー一覧を取得する',
                bodyType: "none",
                preRequestScript: `
// リクエスト/レスポンス実行結果の参照例
// リクエストのヘッダーを参照
addHeaderWithVar Authorization \${"collections"."Sample Collection"."POST Users"."request"."headers"."authorization"}

// レスポンスのステータスコードを参照
setVarFromHeader statusCode \${"collections"."Sample Collection"."POST Users"."response"."status"}

// レスポンスのボディから値を取得
setBodyWithVar \${"collections"."Sample Collection"."POST Users"."response"."body"."token"}

// 既存のプリリクエストスクリプト
setUrl https://reply.tukutano.jp/items?page=9
addHeader test scriptadd
removeHeader removeHeader
setBody setBodyWithScript
//setUrlWithVar apiBaseUrl
//addHeaderWithVar Authorization authtoken
//setBodyWithVar requestPayload
  `
            },
            {
                id: 'req_sample_post_1',
                name: 'サンプル POST 1',
                method: 'POST',
                url: 'https://reply.tukutano.jp/items?page=1',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': 'sessionId=abc123def456; userId=12345; theme=dark; language=ja'
                },
                params: {},
                body: "test body text",
                auth: { type: 'none' },
                bodyType: "raw",
                preRequestScript: `
// リクエスト/レスポンス実行結果の参照例
// 前のリクエストのレスポンスから値を取得して使用

// 既存のプリリクエストスクリプト
setUrl https://reply.tukutano.jp/items?page=9
addHeader test scriptadd
addHeader authorization scriptadd-authorization11
removeHeader removeHeader
setBody setBodyWithScript2
//setUrlWithVar apiBaseUrl
//addHeaderWithVar Authorization authtoken
//setBodyWithVar requestPayload
  `
            },
            {
                id: 'req_sample_post_2',
                name: 'サンプル POST 2',
                method: 'POST',
                url: 'https://reply.tukutano.jp/items?page=2',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': 'authToken=xyz789ghi012; csrfToken=csrf_abc123; preferences={"notifications":true}'
                },
                params: {},
                body: "test body text",
                auth: { type: 'none' },
                bodyType: "raw",
                preRequestScript: `
// リクエスト/レスポンス実行結果の参照例
// 前のリクエストのレスポンスから値を取得して使用
addHeaderWithVar Authorization \${"collections"."Sample Collection"."サンプル POST 1"."response"."headers"."authorization"}
setBodyWithVar \${"collections"."Sample Collection"."サンプル POST 1"."response"."body".jsonPath("$.headers.authorization")}

// 既存のプリリクエストスクリプト
setUrl https://reply.tukutano.jp/items?page=9
addHeader test scriptadd
removeHeader removeHeader
//setBody setBodyWithScript2
//setUrlWithVar apiBaseUrl
//addHeaderWithVar Authorization authtoken
//setBodyWithVar requestPayload
  `
            }
        ]
    },
    {
        id: 'col_integration_tests',
        name: 'Integration Tests (Echo API)',
        description: 'reply.tukutano.jpを使用した結合テスト用コレクション',
        requests: [
            {
                id: 'req_echo_get',
                name: 'GET Echo Test',
                method: 'GET',
                url: 'https://reply.tukutano.jp/api/users',
                headers: {
                    'Accept': 'application/json',
                    'X-Test-Header': 'test-value',
                    'User-Agent': 'API-Tester'
                },
                params: {
                    page: '1',
                    limit: '10'
                },
                body: null,
                auth: { type: 'none' },
                bodyType: "none",
                preRequestScript: '',
                testScript: `// reply.tukutano.jpエコーサイト用の結合テスト
status 200
echoRequestMethodEquals GET
echoRequestHeaderEquals Accept application/json
echoRequestHeaderEquals X-Test-Header test-value
echoRequestUrlContains /api/users
echoRequestUrlContains page=1
echoRequestUrlContains limit=10`
            },
            {
                id: 'req_echo_post',
                name: 'POST Echo Test',
                method: 'POST',
                url: 'https://reply.tukutano.jp/api/auth/login',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-API-Key': 'test-api-key',
                    'Cookie': 'loginSession=sess_abc123xyz; rememberMe=true; lastActivity=1640995200'
                },
                params: {},
                body: JSON.stringify({
                    username: "testuser",
                    password: "testpass123",
                    remember: true
                }),
                auth: { type: 'none' },
                bodyType: "json",
                preRequestScript: '',
                testScript: `// POSTリクエストの結合テスト
status 200
echoRequestMethodEquals POST
echoRequestHeaderEquals Content-Type application/json
echoRequestHeaderEquals X-API-Key test-api-key
echoRequestHeaderContains cookie loginSession=sess_abc123xyz; rememberMe=true; lastActivity=1640995200
echoRequestBodyEquals {"username":"testuser","password":"testpass123","remember":true}
echoRequestUrlContains /api/auth/login`
            },
            {
                id: 'req_echo_auth_test',
                name: 'Bearer Auth Echo Test',
                method: 'PUT',
                url: 'https://reply.tukutano.jp/api/users/123',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Cookie': 'userToken=bearer_token_sample; sessionTimeout=3600; secureFlag=true'
                },
                params: {},
                body: JSON.stringify({
                    name: "Updated User",
                    email: "updated@example.com"
                }),
                auth: {
                    type: 'bearer',
                    token: 'test-bearer-token-12345'
                },
                bodyType: "json",
                preRequestScript: '',
                testScript: `// Bearer認証付きリクエストの結合テスト
status 200
echoRequestMethodEquals PUT
echoRequestHeaderEquals Authorization Bearer test-bearer-token-12345
echoRequestHeaderEquals Content-Type application/json
echoRequestHeaderContains cookie userToken=bearer_token_sample; sessionTimeout=3600; secureFlag=true
echoRequestBodyEquals {"name":"Updated User","email":"updated@example.com"}
echoRequestUrlContains /api/users/123`
            }
        ]
    }
];

/** コレクション変数のサンプル */
// ここでは「col_sample」に対して basePath という変数を設定
export const sampleCollectionVariables: Record<string, Record<string, VariableData>> = {
    col_sample: {
        basePath: { value: '/v1', description: 'エンドポイントのバージョン' },
        userId: { value: '123', description: 'サンプルユーザーID' }
    }
};

/** テストスクリプトのサンプル */
export const sampleTestScript: string = `
// ステータスコードが 200 かをチェック
//status 200
// Authorization ヘッダーの値を取得して、環境変数 authToken に保存
//setVarFromHeader authToken Authorization
// ボディの JSON に users プロパティがあるかをチェック
// jsonHasProperty users
// jsonArrayLengthEquals users 5
// jsonValueEquals data.id 1234
// bodyContains success
// headerExists Content - Type
                `;

/**
 * サンプルシナリオ
 *  すでに上記の sampleCollections に含まれているリクエストを順番に実行する例
 */
export const sampleScenarios: Scenario[] = [
    {
        id: 'scenario_sample_post_flow',
        name: 'Sample post Flow',
        requests: [
            // ↑で定義した sampleCollections 内のリクエストをそのまま利用
            {
                id: 'req_sample_POST1',
                name: 'サンプル POST',
                method: 'POST',
                url: 'https://reply.tukutano.jp/items?page=1',
                headers: { "dummyHeader": "dummyHeaderValue" },
                params: {},
                body: "defaultBodyValue",
                auth: { type: 'bearer', token: "dummyToken" },
                bodyType: "raw",
                preRequestScript: `
addHeader test scriptadd1
setBody setBodyWithScript1
                `
            },
            {
                id: 'req_sample_POST2',
                name: 'サンプル POST',
                method: 'POST',
                url: 'https://reply.tukutano.jp/items?page=2',
                headers: {
                    "dummyBody": `\${"scenarios"."Sample post Flow"."サンプル POST"."response"."body".jsonPath("$.body")}`,
                },
                params: {
                    "dummyBody": `\${"scenarios"."Sample post Flow"."サンプル POST"."response"."body".jsonPath("$.body")}`,
                },
                body: "{\"jsonKey\" : \"\${\"scenarios\".\"Sample post Flow\".\"サンプル POST\".\"response\".\"body\".jsonPath(\"$.headers.authorization\")} \"}",
                auth: { type: 'none' },
                bodyType: "json",
                preRequestScript: `
addHeader test scriptadd2
addHeaderWithVar authorization \${"scenarios"."Sample post Flow"."サンプル POST"."response"."headers"."test"}
//setBodyWithVar \${"scenarios"."Sample post Flow"."サンプル POST"."response"."body".jsonPath("$.headers.authorization")}
                `
            },
            {
                id: 'req_sample_POST3',
                name: 'サンプル POST',
                method: 'POST',
                url: 'https://reply.tukutano.jp/items?page=3',
                headers: {},
                params: {},
                body: "{\"jsonKey\" : \"jsonValue\"}",
                auth: { type: 'none' },
                bodyType: "raw",
                preRequestScript: `
addHeader test scriptadd3
setBody setBodyWithScript3
                `
            }
        ]
    },
    {
        id: 'scenario_sample_get_flow2',
        name: 'Sample get Flow',
        requests: [
            // ↑で定義した sampleCollections 内のリクエストをそのまま利用
            {
                id: 'req_sample_get2_1',
                name: 'サンプル GET',
                method: 'GET',
                url: 'https://reply.tukutano.jp/items?page=10',
                headers: {},
                params: {},
                body: "1",
                auth: { type: 'none' },
                bodyType: "raw",
                preRequestScript: `
addHeader test scriptadd1
// bodyをセットしてもGETリクエストのため送信されない事に注意する
setBody setBodyWithScript1
                `
            },
            {
                id: 'req_sample_get2_2',
                name: 'サンプル GET',
                method: 'GET',
                url: 'https://reply.tukutano.jp/items?page=11',
                headers: {},
                params: {},
                body: "{\"jsonKey\" : \"jsonValue\"}",
                auth: { type: 'none' },
                bodyType: "json",
                preRequestScript: `
// key＝test、value=scriptadd2
addHeader test scriptadd2
                `
            },
            {
                id: 'req_sample_get2_3',
                name: 'サンプル GET',
                method: 'GET',
                url: 'https://reply.tukutano.jp/items?page=12',
                headers: {},
                params: {},
                body: null,
                auth: { type: 'none' },
                bodyType: "raw",
                preRequestScript: `
addHeader test scriptadd2
// bodyをセットしてもGETリクエストのため送信されない事に注意する
setBody setBodyWithScript3
                `
            }
        ]
    },
    {
        id: 'scenario_integration_tests',
        name: 'Integration Test Flow (Echo API)',
        requests: [
            {
                id: 'req_scenario_echo_auth',
                name: 'Authentication Test',
                method: 'POST',
                url: 'https://reply.tukutano.jp/api/auth/login',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Cookie': 'deviceId=dev123abc; trackingConsent=accepted; locale=ja-JP'
                },
                params: {},
                body: JSON.stringify({
                    username: "testuser",
                    password: "secret123"
                }),
                auth: { type: 'none' },
                bodyType: "json",
                preRequestScript: `// 認証リクエストの前処理
addHeader X-Request-Source integration-test`,
                testScript: `// 認証リクエストの検証
status 200
echoRequestMethodEquals POST
echoRequestHeaderEquals Content-Type application/json
echoRequestHeaderEquals X-Request-Source integration-test
echoRequestHeaderContains cookie deviceId=dev123abc; trackingConsent=accepted; locale=ja-JP
echoRequestBodyEquals {"username":"testuser","password":"secret123"}
echoRequestUrlContains /api/auth/login`
            },
            {
                id: 'req_scenario_echo_data',
                name: 'Data Retrieval Test',
                method: 'GET',
                url: 'https://reply.tukutano.jp/api/users/profile',
                headers: {
                    'Accept': 'application/json',
                    'X-Test-Flow': 'integration'
                },
                params: {
                    include: 'details',
                    format: 'json'
                },
                body: null,
                auth: {
                    type: 'bearer',
                    token: 'mock-auth-token-from-previous-step'
                },
                bodyType: "none",
                preRequestScript: `// 前のステップの結果を利用（模擬）
// 実際のAPIでは前のレスポンスからトークンを取得
addHeader X-Previous-Step completed`,
                testScript: `// データ取得リクエストの検証
status 200
echoRequestMethodEquals GET
echoRequestHeaderEquals Authorization Bearer mock-auth-token-from-previous-step
echoRequestHeaderEquals X-Test-Flow integration
echoRequestHeaderEquals X-Previous-Step completed
echoRequestUrlContains /api/users/profile
echoRequestUrlContains include=details
echoRequestUrlContains format=json`
            },
            {
                id: 'req_scenario_echo_update',
                name: 'Data Update Test',
                method: 'PUT',
                url: 'https://reply.tukutano.jp/api/users/profile',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Test-Flow': 'integration',
                    'Cookie': 'updateSession=upd789xyz; editMode=true; lastEdit=1640995800'
                },
                params: {},
                body: JSON.stringify({
                    name: "Updated Test User",
                    email: "updated@test.com",
                    preferences: {
                        theme: "dark",
                        notifications: true
                    }
                }),
                auth: {
                    type: 'bearer',
                    token: 'mock-auth-token-from-previous-step'
                },
                bodyType: "json",
                preRequestScript: `// 更新リクエストの前処理
addHeader X-Update-Source integration-flow`,
                testScript: `// データ更新リクエストの検証
status 200
echoRequestMethodEquals PUT
echoRequestHeaderEquals Authorization Bearer mock-auth-token-from-previous-step
echoRequestHeaderEquals Content-Type application/json
echoRequestHeaderEquals X-Test-Flow integration
echoRequestHeaderEquals X-Update-Source integration-flow
echoRequestHeaderContains cookie updateSession=upd789xyz; editMode=true; lastEdit=1640995800
echoRequestBodyEquals {"name":"Updated Test User","email":"updated@test.com","preferences":{"theme":"dark","notifications":true}}
echoRequestUrlContains /api/users/profile`
            }
        ]
    }
];