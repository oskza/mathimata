const path = require('node:path');
module.exports = {
  testDir: './tests', testMatch: '**/*.spec.cjs', timeout: 45000,
  webServer: { command: 'python3 -m http.server 8765 --bind 127.0.0.1', url: 'http://127.0.0.1:8765', reuseExistingServer: false },
  fullyParallel: false, workers: 1, reporter: 'list',
  use: { browserName: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--no-sandbox'] }, screenshot: 'only-on-failure' },
};
