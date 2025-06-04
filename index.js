// index.js
// ───────────────────────────────────────────────────────────────────────────────
// 各機能モジュールを読み込むエントリーポイント

import './defaultData.js';

// 1. 状態管理
import './state.js';

// 3. インポート／エクスポート処理
import './importExport.js';

// 4. コレクション管理
import './collectionManager.js';

// 5. 履歴管理
import './historyManager.js';

// 6. インターセプタ管理
import './interceptorManager.js';

// 7. リクエスト送受信処理
import './requestManager.js';

// 8. 変数管理
import './variableManager.js';

// 9. ユーティリティ関数群
import './utils.js';

import './init.js';  // 最後に initializeApp() を実行する