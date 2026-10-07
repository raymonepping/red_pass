import { defineConfig } from '@playwright/test'

// Runs against an already-running control plane (make ui / make ui-start).
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  reporter: 'list',
  use: { baseURL: process.env.RED_PASS_UI_URL || 'http://127.0.0.1:3310' },
})
