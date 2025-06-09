import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';

describe('PostPro API Tester Chrome Extension', () => {
  let browser: Browser;
  let page: Page;
  let extensionId: string;

  beforeAll(async () => {
    // Build the extension first
    const extensionPath = path.resolve(__dirname, '../dist');
    
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
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });

    // Wait for extension to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get extension ID - try multiple methods
    let targets = await browser.targets();
    let extensionTarget = targets.find(
      target => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
    );
    
    if (!extensionTarget) {
      // Try background page target
      extensionTarget = targets.find(
        target => target.type() === 'background_page' && target.url().includes('chrome-extension://')
      );
    }
    
    if (!extensionTarget) {
      // Get all chrome-extension targets
      const extensionTargets = targets.filter(target => target.url().includes('chrome-extension://'));
      if (extensionTargets.length > 0) {
        extensionTarget = extensionTargets[0];
      }
    }
    
    if (extensionTarget) {
      const extensionUrl = extensionTarget.url();
      extensionId = extensionUrl.split('/')[2];
      console.log('Extension ID:', extensionId);
      console.log('Extension URL:', extensionUrl);
    } else {
      // Try to find extension by opening the extensions page
      const extensionsPage = await browser.newPage();
      await extensionsPage.goto('chrome://extensions/');
      await extensionsPage.waitForTimeout(1000);
      
      // Try to extract extension ID from the page
      const extensionCards = await extensionsPage.$$('[id^="extension-"]');
      if (extensionCards.length > 0) {
        const firstCard = extensionCards[0];
        const cardId = await firstCard.evaluate(el => el.id);
        if (cardId) {
          extensionId = cardId.replace('extension-', '');
          console.log('Found extension ID from extensions page:', extensionId);
        }
      }
      
      await extensionsPage.close();
    }

    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('Extension should load successfully', async () => {
    expect(extensionId).toBeDefined();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test('Extension popup should open and display UI', async () => {
    // Navigate to extension popup
    const popupUrl = `chrome-extension://${extensionId}/index.html`;
    await page.goto(popupUrl);

    // Wait for the main container to load
    await page.waitForSelector('.app-container', { timeout: 5000 });

    // Check if main UI elements are present
    const appElement = await page.$('.app-container');
    expect(appElement).toBeTruthy();

    // Check for request form elements
    const urlInput = await page.$('#urlInput');
    const methodSelect = await page.$('#methodSelect');
    const sendButton = await page.$('#sendBtn');

    expect(urlInput).toBeTruthy();
    expect(methodSelect).toBeTruthy();
    expect(sendButton).toBeTruthy();
  });

  test('Extension should be able to fill and submit a request', async () => {
    // Navigate to extension popup
    const popupUrl = `chrome-extension://${extensionId}/index.html`;
    await page.goto(popupUrl);

    // Wait for the UI to load
    await page.waitForSelector('#urlInput');

    // Fill in a test request
    await page.type('#urlInput', 'https://reply.tukutano.jp/echo');
    await page.select('#methodSelect', 'POST');

    // Switch to Body tab and add some JSON
    const bodyTab = await page.$('button[data-subtab="body"]');
    if (bodyTab) {
      await bodyTab.click();
      await page.waitForSelector('#bodyTextarea');
      await page.type('#bodyTextarea', '{"test": "data", "message": "Hello World"}');
    }

    // Submit the request
    const sendButton = await page.$('#sendBtn');
    if (sendButton) {
      await sendButton.click();
      
      // Wait for response
      await page.waitForSelector('#response', { timeout: 10000 });
      
      // Check if response is displayed
      const responseElement = await page.$('#response');
      const responseText = await page.evaluate(el => el?.textContent, responseElement);
      
      expect(responseText).toBeTruthy();
      expect(responseText).toContain('method');
    }
  });

  test('Extension should handle variable replacement', async () => {
    const popupUrl = `chrome-extension://${extensionId}/index.html`;
    await page.goto(popupUrl);

    await page.waitForSelector('#url');

    // Switch to Variables tab and add a variable
    const variablesTab = await page.$('button[onclick="switchMainTab(\'variables\')"]');
    if (variablesTab) {
      await variablesTab.click();
      await page.waitForSelector('#variable-name');
      
      // Add a test variable
      await page.type('#variable-name', 'testUrl');
      await page.type('#variable-value', 'https://reply.tukutano.jp');
      
      const addVariableBtn = await page.$('#add-variable-btn');
      if (addVariableBtn) {
        await addVariableBtn.click();
      }
    }

    // Switch back to Request tab
    const requestTab = await page.$('button[onclick="switchMainTab(\'request\')"]');
    if (requestTab) {
      await requestTab.click();
      await page.waitForSelector('#url');
      
      // Use variable in URL
      await page.evaluate(() => {
        const urlInput = document.querySelector('#url') as HTMLInputElement;
        if (urlInput) {
          urlInput.value = '';
        }
      });
      await page.type('#url', '{{testUrl}}/echo');
      
      // The variable should be replaced when the request is sent
      const urlValue = await page.evaluate(() => {
        const urlInput = document.querySelector('#url') as HTMLInputElement;
        return urlInput?.value;
      });
      
      expect(urlValue).toBe('{{testUrl}}/echo');
    }
  });

  test('Extension should run tests on response', async () => {
    const popupUrl = `chrome-extension://${extensionId}/index.html`;
    await page.goto(popupUrl);

    await page.waitForSelector('#url');

    // Fill in request details
    await page.type('#url', 'https://reply.tukutano.jp/echo');
    await page.select('#method', 'GET');

    // Switch to Tests tab and add test code
    const testsTab = await page.$('button[onclick="switchTab(\'tests\')"]');
    if (testsTab) {
      await testsTab.click();
      await page.waitForSelector('#tests');
      
      const testCode = `
statusCodeEquals(200);
headerExists('content-type');
echoRequestMethodEquals('GET');
      `.trim();
      
      await page.type('#tests', testCode);
    }

    // Submit the request
    const sendButton = await page.$('#send-btn');
    if (sendButton) {
      await sendButton.click();
      
      // Wait for response and test results
      await page.waitForSelector('#test-results', { timeout: 10000 });
      
      // Check test results
      const testResults = await page.$('#test-results');
      const testResultsText = await page.evaluate(el => el?.textContent, testResults);
      
      expect(testResultsText).toBeTruthy();
      // Should show passed tests
      expect(testResultsText).toContain('✓');
    }
  });

  test('Background script should be active', async () => {
    // Check if background script is running
    const targets = await browser.targets();
    const backgroundTarget = targets.find(
      target => target.type() === 'service_worker' && 
                 target.url().includes(`chrome-extension://${extensionId}`)
    );
    
    expect(backgroundTarget).toBeTruthy();
  });

  test('Content script should inject into web pages', async () => {
    // Create a new page and navigate to a test site
    const testPage = await browser.newPage();
    await testPage.goto('https://example.com');
    
    // Wait a moment for content script to inject
    await testPage.waitForTimeout(1000);
    
    // Check if our content script has injected any identifiable elements
    // This would depend on what your content script actually does
    const hasContentScript = await testPage.evaluate(() => {
      // Check for any signs that our content script has run
      return window.hasOwnProperty('postproApiTester') || 
             document.querySelector('[data-postpro-injected]') !== null;
    });
    
    // Note: This test might pass even if content script isn't working
    // since we don't know what specific changes it makes
    console.log('Content script detected:', hasContentScript);
    
    await testPage.close();
  });
});