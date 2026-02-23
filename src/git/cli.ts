import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Repository } from "./types";

const execFileAsync = promisify(execFile);

export async function runGit(repo: Repository, args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: repo.rootUri.fsPath,
    });
    return {
      ok: true as const,
      stdout: stdout?.toString() ?? "",
      stderr: stderr?.toString() ?? "",
    };
  } catch (e: any) {
    return {
      ok: false as const,
      stdout: e?.stdout?.toString?.() ?? "",
      stderr: e?.stderr?.toString?.() ?? e?.message ?? String(e),
    };
  }
}

export function shortenReason(s: string, max = 220) {
  const oneLine = (s ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}
