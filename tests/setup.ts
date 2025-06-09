// Jest setup file for Chrome extension testing
import puppeteer from 'puppeteer';

declare global {
  var browser: puppeteer.Browser;
  var page: puppeteer.Page;
}

beforeAll(async () => {
  // Setup is handled in individual test files
});

afterAll(async () => {
  // Cleanup is handled in individual test files
});