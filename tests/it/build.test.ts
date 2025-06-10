import fs from 'fs';
import path from 'path';

describe('Extension Build Tests', () => {
  const distPath = path.resolve(__dirname, '../../dist');

  test('Build directory should exist', () => {
    expect(fs.existsSync(distPath)).toBe(true);
  });

  test('Manifest file should exist and be valid', () => {
    const manifestPath = path.join(distPath, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);
    
    expect(manifest.name).toBeDefined();
    expect(manifest.version).toBeDefined();
    expect(manifest.manifest_version).toBe(3);
  });

  test('Required bundle files should exist', () => {
    const requiredFiles = [
      'index.bundle.js',
      'background.bundle.js',
      'content.bundle.js',
      'injected.bundle.js'
    ];

    requiredFiles.forEach(file => {
      const filePath = path.join(distPath, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('HTML file should exist', () => {
    const htmlPath = path.join(distPath, 'index.html');
    expect(fs.existsSync(htmlPath)).toBe(true);
    
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    expect(htmlContent).toContain('API Tester');
    expect(htmlContent).toContain('app-container');
  });

  test('Bundle files should not be empty', () => {
    const bundleFiles = [
      'index.bundle.js',
      'background.bundle.js',
      'content.bundle.js',
      'injected.bundle.js'
    ];

    bundleFiles.forEach(file => {
      const filePath = path.join(distPath, file);
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });
});