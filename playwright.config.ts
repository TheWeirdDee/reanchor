import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "evidence/e2e-results.json" }], ["./tests/e2e/redact-paths-reporter.ts", { file: "evidence/e2e-results.json" }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  webServer: { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}/api/meta`, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
