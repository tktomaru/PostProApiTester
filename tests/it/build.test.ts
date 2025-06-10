import fs from 'fs';
import path from 'path';

/**
 * Extension Build Tests
 * 
 * Chrome拡張機能のビルド成果物を検証する結合テスト
 * npm run build実行後のdistディレクトリ内容をチェックする
 */
describe('Extension Build Tests', () => {
  const distPath = path.resolve(__dirname, '../../dist');

  /**
   * ビルドディレクトリの存在確認
   * 
   * - distフォルダがプロジェクトルートに作成されているかを確認
   * - ビルドプロセスが正常に実行されたかの基本チェック
   */
  test('Build directory should exist', () => {
    expect(fs.existsSync(distPath)).toBe(true);
  });

  /**
   * Chrome拡張機能マニフェストファイルの検証
   * 
   * - manifest.jsonの存在確認
   * - JSON形式として有効かチェック
   * - 必須プロパティ（name, version）の存在確認
   * - Manifest V3形式であることを確認
   */
  test('Manifest file should exist and be valid', () => {
    const manifestPath = path.join(distPath, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);
    
    expect(manifest.name).toBeDefined();
    expect(manifest.version).toBeDefined();
    expect(manifest.manifest_version).toBe(3);
  });

  /**
   * 必要なJavaScriptバンドルファイルの存在確認
   * 
   * - index.bundle.js: メインのポップアップUI
   * - background.bundle.js: バックグラウンドスクリプト
   * - content.bundle.js: コンテンツスクリプト
   * - injected.bundle.js: ページ注入スクリプト
   */
  test('Required bundle files should exist', () => {
    const requiredFiles = [
      'index.bundle.js',      // メインのポップアップUI
      'background.bundle.js',  // Chrome拡張機能のバックグラウンド処理
      'content.bundle.js',     // Webページに注入されるコンテンツスクリプト
      'injected.bundle.js'     // ページ内で実行される注入スクリプト
    ];

    requiredFiles.forEach(file => {
      const filePath = path.join(distPath, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  /**
   * HTMLファイルの存在と内容確認
   * 
   * - index.html（ポップアップHTML）の存在確認
   * - HTMLファイル内に期待される文字列が含まれているかチェック
   * - 'API Tester': アプリケーション名の表示確認
   * - 'app-container': メインコンテナ要素の存在確認
   */
  test('HTML file should exist', () => {
    const htmlPath = path.join(distPath, 'index.html');
    expect(fs.existsSync(htmlPath)).toBe(true);
    
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    expect(htmlContent).toContain('API Tester');
    expect(htmlContent).toContain('app-container');
  });

  /**
   * バンドルファイルのサイズ検証
   * 
   * - 各JavaScriptバンドルファイルが空でないことを確認
   * - ファイルサイズが0バイトより大きいかチェック
   * - ビルドプロセスが正常にコードをバンドルしたかの検証
   */
  test('Bundle files should not be empty', () => {
    const bundleFiles = [
      'index.bundle.js',      // メインUIバンドル
      'background.bundle.js',  // バックグラウンドスクリプトバンドル
      'content.bundle.js',     // コンテンツスクリプトバンドル
      'injected.bundle.js'     // 注入スクリプトバンドル
    ];

    bundleFiles.forEach(file => {
      const filePath = path.join(distPath, file);
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });
});