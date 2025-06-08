// サイドバーのリサイズ機能
function initSidebarResize(): void {
    const sidebar = document.querySelector('.sidebar') as HTMLElement;
    let isResizing = false;
    let startX: number;
    let startWidth: number;

    sidebar.addEventListener('mousedown', (e: MouseEvent) => {
        // リサイズハンドル上でのみリサイズを開始
        const rect = sidebar.getBoundingClientRect();
        if (e.clientX > rect.right - 4) {
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isResizing) return;

        const width = startWidth + (e.clientX - startX);
        if (width >= 200 && width <= 500) {
            sidebar.style.width = `${width}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
        }
    });
}

// 初期化時にリサイズ機能を有効化
document.addEventListener('DOMContentLoaded', () => {
    initSidebarResize();
    // ... other initialization code ...
});