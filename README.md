# PostPro API Tester

**PostPro API Tester** は、API開発とテストを効率化するChrome拡張機能です。リクエストの作成・実行・テスト・管理を一つのツールで行うことができます。

![PostPro API Tester](icons/icon128.png)

## 🚀 主な機能

### 📡 リクエスト送信
- **HTTP メソッド**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- **認証サポート**: Basic, Bearer Token, API Key, OAuth2
- **ボディタイプ**: JSON, Form Data, Raw Text, Binary Files
- **ヘッダー・パラメータ**: 動的な追加・編集
- **Cookie サポート**: 自動Cookie管理

### 🔧 高度な機能
- **Pre-requestスクリプト**: リクエスト前の動的処理
- **テストスクリプト**: レスポンス検証の自動化
- **変数システム**: グローバル・環境・コレクション変数
- **実行結果参照**: 前のリクエスト結果を次のリクエストで使用

### 📁 コレクション・シナリオ管理
- **コレクション**: 関連するリクエストをグループ化
- **シナリオ**: リクエストを順次実行するワークフロー
- **フォルダ整理**: 階層的なリクエスト管理

### 📊 テスト・検証
- **レスポンステスト**: ステータス、ヘッダー、ボディの検証
- **JSONPath**: 複雑なJSON構造からのデータ抽出
- **エコーAPIテスト**: 送信内容の確認（https://reply.tukutano.jp）

### 📈 履歴・分析
- **リクエスト履歴**: 過去のリクエストを自動保存
- **レスポンス表示**: 構造化されたレスポンス表示
- **エラーハンドリング**: 詳細なエラーメッセージと解決方法

## 🛠️ インストール

### 開発版インストール
1. このリポジトリをクローン:
   ```bash
   git clone https://github.com/tktomaru/PostProApiTester.git
   cd PostProApiTester
   ```

2. 依存関係をインストール:
   ```bash
   npm install
   ```

3. 拡張機能をビルド:
   ```bash
   npm run build
   ```

4. Chrome で拡張機能を読み込み:
   - Chrome で `chrome://extensions/` を開く
   - 「デベロッパーモード」を有効にする
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist` フォルダを選択

## 📖 使用方法

### 基本的なリクエスト
1. 拡張機能アイコンをクリックしてツールを開く
2. **URL** を入力（例: `https://api.example.com/users`）
3. **HTTP メソッド** を選択
4. 必要に応じて **Headers**, **Params**, **Body** を設定
5. **Send** ボタンをクリック

### 変数の使用
PostPro API Tester では複数の変数形式をサポートしています：

#### 基本変数
```
{{apiUrl}}           # 環境・グローバル・コレクション変数
${baseUrl}           # シンプルな変数参照
{userId}             # パス変数
```

#### 実行結果参照（高度な機能）
```
${"scenarios"."User Flow"."Login"."response"."headers"."token"}
${"collections"."User API"."Get User"."response"."body".jsonPath("$.data.id")}
```

### Pre-requestスクリプト
リクエスト前に実行されるスクリプトで動的な処理が可能：

```javascript
// ヘッダーを追加
addHeader Authorization Bearer {{token}}

// 変数を使ってヘッダーを追加
addHeaderWithVar X-User-ID ${"scenarios"."Login"."response"."body".jsonPath("$.userId")}

// ボディを動的に設定
setBodyWithVar ${"collections"."Data"."Get Template"."response"."body"}
```

### テストスクリプト
レスポンスの自動検証：

```javascript
// ステータスコードの確認
statusEquals 200

// ヘッダーの確認
headerEquals Content-Type application/json

// JSONパスでボディを確認
bodyJsonPathEquals $.status success

// エコーAPIテスト（送信内容の確認）
echoRequestMethodEquals POST
echoRequestHeaderEquals Authorization Bearer token123
echoRequestBodyEquals {"test":"data"}
```

### シナリオ実行
1. **Scenarios** タブでシナリオを作成
2. リクエストを順番に追加
3. **Run Scenario** で一括実行
4. 各ステップの結果を確認

## 🔧 設定

### 環境変数
**Variables** タブで環境ごとの変数を管理：
- **Global**: 全環境で共通の変数
- **Environment**: 環境固有の変数（Dev, Staging, Production等）
- **Collection**: コレクション固有の変数

### 認証設定
複数の認証方式をサポート：
- **Basic Auth**: ユーザー名・パスワード
- **Bearer Token**: JWTトークン等
- **API Key**: クエリパラメータまたはヘッダー
- **OAuth2**: 自動認証フロー

## 📝 エコーAPIテスト

PostPro API Tester は専用のエコーAPI（https://reply.tukutano.jp）と連携し、送信したリクエストの内容を確認できます：

**エコーAPIレスポンス例:**
```json
{
  "method": "POST",
  "url": "/api/test",
  "headers": {
    "content-type": "application/json",
    "authorization": "Bearer token123"
  },
  "body": "{\"test\":\"data\"}"
}
```

**エコー用テストコマンド:**
- `echoRequestMethodEquals POST`
- `echoRequestHeaderEquals Content-Type application/json`
- `echoRequestBodyEquals {"test":"data"}`
- `echoRequestUrlContains /api/test`

## 🛡️ エラーハンドリング

PostPro API Tester は包括的なエラーハンドリングを提供：

### ネットワークエラー
- **接続エラー**: インターネット接続の確認を促す
- **CORS エラー**: サーバー設定の説明を提供
- **タイムアウト**: サーバーの応答性に関する情報
- **SSL エラー**: 証明書の問題を説明

### 変数エラー
- **変数が見つからない**: 変数の存在確認とスコープの説明
- **構文エラー**: 正しい変数参照形式の例示
- **JSONPath エラー**: JSONPath構文の確認方法

### ファイルエラー
- **サイズ制限**: 10MB制限の説明
- **形式エラー**: サポートされるファイル形式の情報
- **読み込みエラー**: ファイルの状態確認方法

## 📁 プロジェクト構造

```
src/
├── app.ts                 # メインアプリケーションロジック
├── background.ts          # Chrome拡張バックグラウンドスクリプト
├── collectionManager.ts   # コレクション管理
├── content.ts             # コンテンツスクリプト
├── defaultData.ts         # サンプルデータ
├── historyManager.ts      # 履歴管理
├── importExport.ts        # データインポート・エクスポート
├── index.ts               # エントリーポイント
├── init.ts                # 初期化処理
├── injected.ts            # ページ注入スクリプト
├── interceptorManager.ts  # リクエストインターセプト
├── requestManager.ts      # リクエスト処理・テスト実行
├── scenarioManager.ts     # シナリオ管理
├── settings.ts            # 設定管理
├── state.ts               # グローバル状態・ストレージ
├── types.ts               # TypeScript型定義
├── utils.ts               # ユーティリティ・UI操作
└── variableManager.ts     # 変数管理
```

## 🔨 開発

### 技術スタック
- **TypeScript**: 型安全な開発
- **Vite**: 高速ビルドツール
- **Chrome Extensions API**: ブラウザ拡張機能
- **JSONPath Plus**: JSONパス処理

### 開発コマンド
```bash
# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# ウォッチモード（開発中）
npm run watch

# 型チェック
npx tsc --noEmit

# プレビュー
npm run preview
```

### コーディング規約
- **ファイル命名**: camelCase形式
- **関数命名**: 
  - 非同期関数: `async function functionName()`
  - イベントハンドラー: `handleEventName` または `onEventName`
- **TypeScript**: 厳密な型定義、`any`型の最小使用
- **エラーハンドリング**: 適切なtry-catch文とユーザーフレンドリーなメッセージ

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. 機能ブランチを作成: `git checkout -b feature/amazing-feature`
3. 変更をコミット: `git commit -m 'Add amazing feature'`
4. ブランチにプッシュ: `git push origin feature/amazing-feature`
5. プルリクエストを作成

## 📜 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。

## 🐛 問題報告

バグ報告や機能リクエストは [Issues](https://github.com/tktomaru/PostProApiTester/issues) でお知らせください。

## 📞 サポート

- **ドキュメント**: このREADMEと`CLAUDE.md`を参照
- **エコーAPI**: https://reply.tukutano.jp
- **Issues**: GitHub Issues でお気軽にお問い合わせください

---

**PostPro API Tester** で効率的なAPI開発を始めましょう！ 🚀