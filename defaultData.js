// defaultData.js

/** グローバル変数のサンプル */
export const sampleGlobalVariables = {
    apiUrl: { value: 'https://reply.tukutano.jp', description: '基本となる API の URL' },
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
                name: 'Get Users',
                method: 'GET',
                url: '{{apiUrl}}/users',
                headers: { 'Accept': 'application/json' },
                params: { page: '1' },
                body: null,
                auth: { type: 'bearer', token: '{{devToken}}' },
                folder: '',
                description: 'ユーザー一覧を取得する'
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
headerExists Content-Type
  `;
