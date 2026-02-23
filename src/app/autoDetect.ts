import * as vscode from "vscode";
import type { GitAPI } from "../git/types";
import { headInfo, readSnap, type RepoSnap } from "../git/repo";
import { GitEffectsPanel } from "../panel/GitEffectsPanel";

export function startAutoDetect(args: {
  context: vscode.ExtensionContext;
  out: vscode.OutputChannel;
  git: GitAPI;
}) {
  const { context, out, git } = args;

  const repoState = new Map<string, RepoSnap>();

  const pollTick = async () => {
    try {
      const cfg = vscode.workspace.getConfiguration("gitEffects");
      const pollMs = Math.max(200, cfg.get<number>("pollMs", 500));
      const autoPush = cfg.get<boolean>("autoPush", true);
      const autoPull = cfg.get<boolean>("autoPull", true);
      const autoCommit = cfg.get<boolean>("autoCommit", true);

      const repos = git.repositories ?? [];
      if (!repos.length) return pollMs;

      for (const repo of repos) {
        await repo.status?.();

        const key = repo.rootUri.fsPath;
        const cur = readSnap(repo);
        const prev = repoState.get(key);

        if (!prev) {
          repoState.set(key, cur);
          continue;
        }

        const hi = headInfo(repo);

        if (autoPush && prev.ahead > 0 && cur.ahead === 0) {
          GitEffectsPanel.fire(context, out, {
            kind: "success",
            event: "push",
            repoPath: key,
            branch: hi.branch,
            upstream: hi.upstream,
            title: "Push 성공 ✅",
            detail: `${hi.branch ?? "?"} → ${hi.upstream ?? "?"}`,
          });
        }

        if (autoPull && prev.behind > 0 && cur.behind === 0) {
          GitEffectsPanel.fire(context, out, {
            kind: "success",
            event: "pull",
            repoPath: key,
            branch: hi.branch,
            upstream: hi.upstream,
            title: "Pull 성공 ✅",
            detail: `${hi.branch ?? "?"} ← ${hi.upstream ?? "?"}`,
          });
        }

        if (
          autoCommit &&
          cur.commit &&
          prev.commit &&
          cur.commit !== prev.commit &&
          prev.dirty &&
          !cur.dirty
        ) {
          GitEffectsPanel.fire(context, out, {
            kind: "success",
            event: "commit",
            repoPath: key,
            branch: hi.branch,
            upstream: hi.upstream,
            title: "Commit 완료 ✅",
            detail: `HEAD updated (${prev.commit.slice(0, 7)} → ${cur.commit.slice(0, 7)})`,
          });
        }

        repoState.set(key, cur);
      }

      return pollMs;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      out.appendLine(`[ERR] poll failed: ${msg}`);
      return 1000;
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = async () => {
    const nextMs = await pollTick();
    timer = setTimeout(schedule, nextMs);
  };

  schedule();
  context.subscriptions.push({
    dispose: () => timer && clearTimeout(timer),
  });

  out.appendLine("auto-detect started (repo-wise)");
}
