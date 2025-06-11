// app.ts
// ───────────────────────────────────────────────────────────────────────────────
// メインアプリケーションのロジック
// UIコンポーネントの初期化やサイドバーのリサイズ機能を提供

/**
 * サイドバーのリサイズ機能を初期化
 * ユーザーがサイドバーの右端をドラッグしてサイズを変更できるようにする
 */
function initSidebarResize(): void {
    const sidebar = document.querySelector('.sidebar') as HTMLElement;
    let isResizing = false;     // リサイズ中フラグ
    let startX: number;         // ドラッグ開始時のX座標
    let startWidth: number;     // ドラッグ開始時のサイドバー幅

    // マウスダウンイベント：リサイズ開始の判定
    sidebar.addEventListener('mousedown', (e: MouseEvent) => {
        // リサイズハンドル上（右端4px以内）でのみリサイズを開始
        const rect = sidebar.getBoundingClientRect();
        if (e.clientX > rect.right - 4) {
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;
            document.body.style.cursor = 'col-resize';  // カーソルを変更
            e.preventDefault();
        }
    });

    // マウス移動イベント：リサイズ中の幅調整
    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isResizing) return;

        const width = startWidth + (e.clientX - startX);
        // 最小200px、最大500pxに制限
        if (width >= 200 && width <= 500) {
            sidebar.style.width = `${width}px`;
        }
    });

    // マウスアップイベント：リサイズ終了
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';  // カーソルを元に戻す
        }
    });
}

// DOM読み込み完了時の初期化処理
document.addEventListener('DOMContentLoaded', () => {
    initSidebarResize();  // サイドバーリサイズ機能を有効化
    // ... その他の初期化コード ...
});