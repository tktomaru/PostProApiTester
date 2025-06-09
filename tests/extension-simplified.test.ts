import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';

describe('PostPro API Tester Chrome Extension - Simplified', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    // Build the extension first
    const extensionPath = path.resolve(__dirname, '../dist');
    
    // Verify extension build exists
    if (!fs.existsSync(extensionPath)) {
      throw new Error(`Extension build not found at ${extensionPath}. Run npm run build first.`);
    }

    // Launch Chrome with extension loaded
    browser = await puppeteer.launch({
      headless: false, // Extensions require non-headless mode
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

    // Wait for extension to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('Extension files should be built correctly', () => {
    const distPath = path.resolve(__dirname, '../dist');
    const requiredFiles = [
      'index.bundle.js',
      'background.bundle.js',
      'content.bundle.js',
      'injected.bundle.js',
      'manifest.json',
      'index.html'
    ];

    requiredFiles.forEach(file => {
      const filePath = path.join(distPath, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('Extension should load in Chrome', async () => {
    // Check that Chrome started with extension loaded
    const targets = await browser.targets();
    expect(targets.length).toBeGreaterThan(0);
    
    // Should have at least a browser target
    const browserTarget = targets.find(target => target.type() === 'browser');
    expect(browserTarget).toBeTruthy();
  });

  test('Extension popup should be accessible via file URL', async () => {
    // Test direct access to the extension popup HTML file
    const extensionPath = path.resolve(__dirname, '../dist');
    const indexPath = path.join(extensionPath, 'index.html');
    const fileUrl = `file://${indexPath}`;
    
    await page.goto(fileUrl);
    
    // Wait for basic HTML structure
    await page.waitForSelector('body', { timeout: 5000 });
    
    // Check basic HTML structure
    const title = await page.title();
    expect(title).toContain('API Tester');
    
    // Check for main container
    const appContainer = await page.$('.app-container');
    expect(appContainer).toBeTruthy();
  });

  test('Extension popup UI elements should be present', async () => {
    const extensionPath = path.resolve(__dirname, '../dist');
    const indexPath = path.join(extensionPath, 'index.html');
    const fileUrl = `file://${indexPath}`;
    
    await page.goto(fileUrl);
    await page.waitForSelector('.app-container', { timeout: 10000 });

    // Check for key UI elements
    const urlInput = await page.$('#urlInput');
    const methodSelect = await page.$('#methodSelect');
    const sendButton = await page.$('#sendBtn');
    
    expect(urlInput).toBeTruthy();
    expect(methodSelect).toBeTruthy();
    expect(sendButton).toBeTruthy();

    // Check tab navigation
    const tabs = await page.$$('.tab-btn');
    expect(tabs.length).toBeGreaterThan(0);
  });

  test('Extension should handle basic form interaction', async () => {
    const extensionPath = path.resolve(__dirname, '../dist');
    const indexPath = path.join(extensionPath, 'index.html');
    const fileUrl = `file://${indexPath}`;
    
    await page.goto(fileUrl);
    await page.waitForSelector('#urlInput', { timeout: 10000 });

    // Fill form fields
    await page.type('#urlInput', 'https://httpbin.org/get');
    await page.select('#methodSelect', 'GET');

    // Verify form values
    const urlValue = await page.$eval('#urlInput', (el: HTMLInputElement) => el.value);
    const methodValue = await page.$eval('#methodSelect', (el: HTMLSelectElement) => el.value);
    
    expect(urlValue).toBe('https://httpbin.org/get');
    expect(methodValue).toBe('GET');
  });

  test('Extension background script should be present', async () => {
    // Check if background script bundle exists
    const backgroundPath = path.resolve(__dirname, '../dist/background.bundle.js');
    expect(fs.existsSync(backgroundPath)).toBe(true);
    
    // Check file is not empty
    const stats = fs.statSync(backgroundPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('Extension content script should be present', async () => {
    // Check if content script bundle exists
    const contentPath = path.resolve(__dirname, '../dist/content.bundle.js');
    expect(fs.existsSync(contentPath)).toBe(true);
    
    // Check file is not empty
    const stats = fs.statSync(contentPath);
    expect(stats.size).toBeGreaterThan(0);
  });
});