import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use a global setup file that runs once before all tests.
    // This script prepares the in-memory database.
    globalSetup: ['./tests/globalSetup.ts'],
    // We no longer need the per-file setup.
    // setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    // Increase timeouts to allow for database setup.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});