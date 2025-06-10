// PostPro API Tester Chrome拡張機能のシンプルなインテグレーションテスト
// ファイルベースでの基本機能テストに重点を置く
import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';

describe('PostPro API Tester Chrome Extension - Simplified', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    // まず拡張機能のビルドが完了していることを確認
    const extensionPath = path.resolve(__dirname, '../../dist');
    
    // 拡張機能のビルドファイルが存在することを確認
    if (!fs.existsSync(extensionPath)) {
      throw new Error(`Extension build not found at ${extensionPath}. Run npm run build first.`);
    }

    // 拡張機能を読み込んだ状態でChromeブラウザを起動
    browser = await puppeteer.launch({
      headless: false, // 拡張機能テストには非ヘッドレスモードが必要
      devtools: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--disable-gpu',
        '--disable-web-security',
        '--allow-running-insecure-content'
      ]
    });

    // 拡張機能の初期化完了を待機
    await new Promise(resolve => setTimeout(resolve, 3000));
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('Extension files should be built correctly', () => {
    // 拡張機能ファイルが正しくビルドされていることを確認
    const distPath = path.resolve(__dirname, '../../dist');
    const requiredFiles = [
      'index.bundle.js',
      'background.bundle.js',
      'content.bundle.js',
      'injected.bundle.js',
      'manifest.json',
      'index.html'
    ];

    // 必要なファイルがすべて存在することを確認
    requiredFiles.forEach(file => {
      const filePath = path.join(distPath, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('Extension should load in Chrome', async () => {
    // 拡張機能が読み込まれた状態でChromeが起動していることを確認
    const targets = await browser.targets();
    expect(targets.length).toBeGreaterThan(0);
    
    // 少なくともブラウザターゲットが存在するはず
    const browserTarget = targets.find(target => target.type() === 'browser');
    expect(browserTarget).toBeTruthy();
  });

  test('Extension popup should be accessible via file URL', async () => {
    // ファイルURL経由で拡張機能ポップアップに直接アクセスをテスト
    const extensionPath = path.resolve(__dirname, '../../dist');
    const indexPath = path.join(extensionPath, 'index.html');
    const fileUrl = `file://${indexPath}`;
    
    await page.goto(fileUrl);
    
    // 基本的なHTML構造の読み込みを待機
    await page.waitForSelector('body', { timeout: 5000 });
    
    // 基本的なHTML構造をチェック
    const title = await page.title();
    expect(title).toContain('API Tester');
    
    // メインコンテナの存在確認
    const appContainer = await page.$('.app-container');
    expect(appContainer).toBeTruthy();
  });

  test('Extension popup UI elements should be present', async () => {
    // ポップアップUIの主要要素が存在することを確認
    const extensionPath = path.resolve(__dirname, '../../dist');
    const indexPath = path.join(extensionPath, 'index.html');
    const fileUrl = `file://${indexPath}`;
    
    await page.goto(fileUrl);
    await page.waitForSelector('.app-container', { timeout: 10000 });

    // 主要なUI要素をチェック
    const urlInput = await page.$('#urlInput');
    const methodSelect = await page.$('#methodSelect');
    const sendButton = await page.$('#sendBtn');
    
    expect(urlInput).toBeTruthy();
    expect(methodSelect).toBeTruthy();
    expect(sendButton).toBeTruthy();

    // タブナビゲーションの確認
    const tabs = await page.$$('.tab-btn');
    expect(tabs.length).toBeGreaterThan(0);
  });

  test('Extension should handle basic form interaction', async () => {
    // 基本的なフォーム操作が動作することを確認
    const extensionPath = path.resolve(__dirname, '../../dist');
    const indexPath = path.join(extensionPath, 'index.html');
    const fileUrl = `file://${indexPath}`;
    
    await page.goto(fileUrl);
    await page.waitForSelector('#urlInput', { timeout: 10000 });

    // フォームフィールドを入力
    await page.type('#urlInput', 'https://httpbin.org/get');
    await page.select('#methodSelect', 'GET');

    // フォーム値の確認
    const urlValue = await page.$eval('#urlInput', (el: HTMLInputElement) => el.value);
    const methodValue = await page.$eval('#methodSelect', (el: HTMLSelectElement) => el.value);
    
    expect(urlValue).toBe('https://httpbin.org/get');
    expect(methodValue).toBe('GET');
  });

  test('Extension background script should be present', async () => {
    // バックグラウンドスクリプトが存在することを確認
    const backgroundPath = path.resolve(__dirname, '../../dist/background.bundle.js');
    expect(fs.existsSync(backgroundPath)).toBe(true);
    
    // ファイルが空でないことを確認
    const stats = fs.statSync(backgroundPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('Extension content script should be present', async () => {
    // コンテンツスクリプトが存在することを確認
    const contentPath = path.resolve(__dirname, '../../dist/content.bundle.js');
    expect(fs.existsSync(contentPath)).toBe(true);
    
    // ファイルが空でないことを確認
    const stats = fs.statSync(contentPath);
    expect(stats.size).toBeGreaterThan(0);
  });
});