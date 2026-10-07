import type { Reporter } from "@playwright/test/reporter";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * The JSON reporter records absolute paths (project folder, user home). The results are published as evidence,
 * so after every run replace them with neutral placeholders. Test outcomes are not touched.
 */
export function redactLocalPaths(file: string, root = process.cwd()): number {
  if (!existsSync(file)) return 0;
  const variants = (p: string) => {
    const back = p.replace(/\//g, "\\");
    const fwd = p.replace(/\\/g, "/");
    // Git Bash form of a Windows path: C:/Users/x becomes /c/Users/x.
    const msys = fwd.replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`);
    // Raw forms, plus the JSON-escaped backslash form.
    return [back.replace(/\\/g, "\\\\"), back, fwd, msys];
  };
  let text = readFileSync(file, "utf8");
  let count = 0;
  for (const [from, to] of [...variants(resolve(root)).map((v) => [v, "<project>"]), ...variants(homedir()).map((v) => [v, "<home>"])] as [string, string][]) {
    const parts = text.split(from);
    count += parts.length - 1;
    text = parts.join(to);
  }
  writeFileSync(file, text);
  return count;
}

export default class RedactPathsReporter implements Reporter {
  constructor(private readonly options: { file: string }) {}
  printsToStdio() {
    return false;
  }
  async onExit() {
    redactLocalPaths(this.options.file);
  }
}
