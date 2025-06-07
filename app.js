// サイドバーのリサイズ機能
function initSidebarResize() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    let isResizing = false;
    let startX;
    let startWidth;

    sidebar.addEventListener('mousedown', (e) => {
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

    document.addEventListener('mousemove', (e) => {
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