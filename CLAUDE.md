# PostPro API Tester - Claude Code コンテキスト

## プロジェクト概要

PostPro API Testerは、Chrome拡張機能として動作するAPI開発・テスト支援ツールです。
リクエストの作成・実行・テスト・整理を効率的に行うことができます。

## プロジェクト構造

```
src/
├── app.ts                 # アプリケーションのメインロジック
├── background.ts          # Chrome拡張機能のバックグラウンドスクリプト
├── collectionManager.ts   # コレクション・シナリオ管理
├── content.ts             # コンテンツスクリプト
├── defaultData.ts         # サンプルデータとデフォルト設定
├── historyManager.ts      # リクエスト履歴管理
├── importExport.ts        # データのインポート・エクスポート
├── index.ts               # エントリーポイント
├── init.ts                # 初期化処理
├── injected.ts            # ページ注入スクリプト
├── interceptorManager.ts  # HTTPリクエストインターセプト
├── postmanTestAPI.ts      # Postman形式テストAPI実装（NEW!）
├── requestManager.ts      # リクエスト送信・レスポンス処理・テスト実行
├── scenarioManager.ts     # シナリオ管理
├── settings.ts            # 設定管理
├── state.ts               # グローバル状態管理・ローカルストレージ
├── types.ts               # TypeScript型定義
├── utils.ts               # ユーティリティ関数・UI操作
└── variableManager.ts     # 変数管理
```

## 技術スタック

- **TypeScript**: 型安全な開発
- **Vite**: モジュールバンドラー・ビルドツール
- **Chrome Extensions API**: ブラウザ拡張機能
- **XMLHttpRequest**: HTTPリクエスト送信
- **Chrome Storage API**: データ永続化

## よく使うコマンド

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

## コーディング規約

### ファイル命名
- camelCase形式（例: `requestManager.ts`）
- 機能別にファイルを分割
- Managerサフィックスで管理クラスを示す

### 関数命名
- 非同期関数: `async function functionName()`
- イベントハンドラー: `handleEventName` または `onEventName`
- ユーティリティ関数: 動詞 + 目的語（例: `showError`, `loadData`）

### TypeScript
- 厳密な型定義を使用
- `any`型の使用は最小限に
- インターフェースは`types.ts`で一元管理
- 型アサーションよりtype guardsを優先

### エラーハンドリング
- try-catch文を適切に使用
- ユーザーフレンドリーなエラーメッセージ
- `showError(message)`でユーザーに通知

## 主要機能

### 1. リクエスト管理
- HTTP メソッド（GET, POST, PUT, DELETE等）
- ヘッダー、パラメータ、ボディの設定
- 認証（Basic, Bearer, API Key, OAuth2）
- Pre-requestスクリプト実行

### 2. テスト機能
- レスポンス検証（ステータス、ヘッダー、ボディ）
- JSONパス検証
- エコーAPI対応テストコマンド（echo API: https://reply.tukutano.jp）

### 3. コレクション・シナリオ
- リクエストのグループ化（コレクション）
- 順次実行フロー（シナリオ）
- リクエストのコピー・移動機能

### 4. 変数管理
- グローバル変数、環境変数、コレクション変数
- 変数置換（`{{variableName}}`形式）
- 実行時の動的変数設定

## デバッグ・開発時のTips

### Chrome Developer Tools
```javascript
// ローカルストレージの確認
chrome.storage.local.get(null, console.log)

// 状態確認
console.log('Current state:', state)

// リクエスト履歴確認
console.log('History:', state.history)
```

### よくあるトラブルシューティング

1. **リクエストが送信されない**
   - URLの形式確認（http://またはhttps://）
   - CORS設定の確認
   - 認証情報の確認

2. **テストが失敗する**
   - レスポンスフォーマットの確認
   - JSONパスの確認
   - エコーAPIのレスポンス構造確認

3. **データが保存されない**
   - Chrome拡張機能の権限確認
   - ローカルストレージの容量確認
   - 非同期処理の完了待ち

## テスト用エコーAPI

**URL**: https://reply.tukutano.jp

**レスポンス形式**:
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

**エコー用テストコマンド**:
- `echoRequestMethodEquals POST`
- `echoRequestHeaderEquals Content-Type application/json`
- `echoRequestBodyEquals {"test":"data"}`
- `echoRequestUrlContains /api/test`

## リリース・デプロイ

1. バージョン更新（`package.json`, `manifest.json`）
2. `npm run build`でビルド実行
3. `dist/`フォルダをChrome拡張機能として読み込み
4. テスト実行
5. Chrome Web Storeへアップロード（本番時）

## TODO管理

開発中は以下のTodoWriteツールを活用：
- 高優先度タスクの明確化
- 進捗状況の可視化
- 完了タスクの記録