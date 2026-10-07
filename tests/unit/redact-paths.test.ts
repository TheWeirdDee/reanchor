import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { redactLocalPaths } from "../e2e/redact-paths-reporter";

describe("redactLocalPaths", () => {
  it("replaces the project folder and home folder in every form and leaves results untouched", () => {
    const dir = mkdtempSync(join(tmpdir(), "redact-"));
    const file = join(dir, "results.json");
    const root = process.platform === "win32" ? "C:\\Work\\proj" : "/work/proj";
    const doc = {
      config: { rootDir: `${root}/tests/e2e`, configFile: `${root}\\playwright.config.ts` },
      home: `${homedir()}/x`,
      stats: { expected: 51, unexpected: 0 },
    };
    writeFileSync(file, JSON.stringify(doc));
    const n = redactLocalPaths(file, root);
    const out = readFileSync(file, "utf8");
    expect(n).toBeGreaterThanOrEqual(3);
    expect(out).not.toContain("Work");
    expect(out).not.toContain(homedir().replace(/\\/g, "\\\\"));
    expect(JSON.parse(out).stats).toEqual({ expected: 51, unexpected: 0 });
    expect(JSON.parse(out).config.rootDir).toBe("<project>/tests/e2e");
  });
});
