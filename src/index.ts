// index.ts
// ───────────────────────────────────────────────────────────────────────────────
// 各機能モジュールを読み込むエントリーポイント

import './defaultData';

// 1. 状態管理
import './state';

// 3. インポート／エクスポート処理
import './importExport';

// 4. コレクション管理
import './collectionManager';

// 5. 履歴管理
import './historyManager';

// 6. インターセプタ管理
import './interceptorManager';

// 7. リクエスト送受信処理
import './requestManager';

// 8. 変数管理
import './variableManager';

// 9. ユーティリティ関数群
import './utils';

import './init';  // 最後に initializeApp() を実行する