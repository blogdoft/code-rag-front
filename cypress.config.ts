import { defineConfig } from 'cypress';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

export default defineConfig({
  e2e: {
    baseUrl: process.env['CYPRESS_BASE_URL'] ?? 'http://localhost:4200',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: 1280,
    viewportHeight: 800,
    video: false,
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 8000,
    // Every spec starts from a clean origin (localStorage included), so a test never inherits the
    // API base URL / user name / theme another one saved.
    testIsolation: true,
    setupNodeEvents(on, config) {
      // Lets specs assert on files the app downloads (the feedback CSV export).
      on('task', {
        clearDownloads() {
          rmSync(config.downloadsFolder, { recursive: true, force: true });
          mkdirSync(config.downloadsFolder, { recursive: true });
          return null;
        },
        listDownloads() {
          return existsSync(config.downloadsFolder) ? readdirSync(config.downloadsFolder) : [];
        },
      });
      return config;
    },
  },
});
