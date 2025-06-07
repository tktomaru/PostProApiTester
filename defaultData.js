// defaultData.js
// ───────────────────────────────────────────────────────────────────────────────

/** グローバル変数のサンプル */
export const sampleGlobalVariables = {
    apiUrl: { value: 'http://localhost:31013', description: '基本となる API の URL' },
    timeout: { value: '30000', description: 'タイムアウト（ミリ秒）' }
};

/** 環境（Environment）のサンプル */
export const sampleEnvironments = [
    { id: 'env_dev', name: 'Development', created: new Date().toISOString() },
    { id: 'env_prod', name: 'Production', created: new Date().toISOString() }
];

/** 各環境に対応する変数のサンプル */
// たとえば「env_dev」には devToken、「env_prod」には prodToken
export const sampleEnvironmentVariables = {
    env_dev: {
        devToken: { value: 'dev-abcdef12345', description: '開発用トークン' }
    },
    env_prod: {
        prodToken: { value: 'prod-xyz987654', description: '本番用トークン' }
    }
};

/** コレクション（Collection）のサンプル */
export const sampleCollections = [
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
addHeaderWithVar Authorization \${"Sample Collection"."POST Users"."request"."headers"."authorization"}

// レスポンスのステータスコードを参照
setVarFromHeader statusCode \${"Sample Collection"."POST Users"."response"."status"}

// レスポンスのボディから値を取得
setBodyWithVar \${"Sample Collection"."POST Users"."response"."body"."token"}

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
                headers: {},
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
addHeader authorization scriptadd-authorization
removeHeader removeHeader
setBody setBodyWithScript1
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
                headers: {},
                params: {},
                body: "test body text",
                auth: { type: 'none' },
                bodyType: "raw",
                preRequestScript: `
// リクエスト/レスポンス実行結果の参照例
// 前のリクエストのレスポンスから値を取得して使用
addHeaderWithVar Authorization \${"Sample Collection"."サンプル POST 1"."response"."headers"."authorization"}
setBodyWithVar \${"Sample Collection"."サンプル POST 1"."response"."body"}

// 既存のプリリクエストスクリプト
setUrl https://reply.tukutano.jp/items?page=9
addHeader test scriptadd
removeHeader removeHeader
setBody setBodyWithScript2
//setUrlWithVar apiBaseUrl
//addHeaderWithVar Authorization authtoken
//setBodyWithVar requestPayload
  `
            }
        ]
    }
];

/** コレクション変数のサンプル */
// ここでは「col_sample」に対して basePath という変数を設定
export const sampleCollectionVariables = {
    col_sample: {
        basePath: { value: '/v1', description: 'エンドポイントのバージョン' },
        userId: { value: '123', description: 'サンプルユーザーID' }
    }
};

/** テストスクリプトのサンプル */
export const sampleTestScript = `
// ステータスコードが 200 かをチェック
status 200
// Authorization ヘッダーの値を取得して、環境変数 authToken に保存
setVarFromHeader authToken Authorization
// ボディの JSON に users プロパティがあるかをチェック
jsonHasProperty users
jsonArrayLengthEquals users 5
jsonValueEquals data.id 1234
bodyContains success
headerExists Content - Type
                `;



/**
 * サンプルシナリオ
 *  すでに上記の sampleCollections に含まれているリクエストを順番に実行する例
 */
export const sampleScenarios = [
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
                headers: {},
                params: {},
                body: null,
                auth: { type: 'none' },
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
                headers: {},
                params: {},
                body: "{\"jsonKey\" : \"jsonValue\"}",
                auth: { type: 'none' },
                bodyType: "json",
                preRequestScript: `
addHeader test scriptadd2
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
    }
];
