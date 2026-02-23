import * as vscode from "vscode";
import type { GitAPI } from "../git/types";
import { resolveRepo, headInfo } from "../git/repo";
import { runGit, shortenReason } from "../git/cli";
import { GitEffectsPanel } from "../panel/GitEffectsPanel";

export function registerCommands(args: {
  context: vscode.ExtensionContext;
  out: vscode.OutputChannel;
  git: GitAPI;
}) {
  const { context, out, git } = args;

  const wsf = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];

  context.subscriptions.push(
    vscode.commands.registerCommand("git-effects.helloWorld", () => {
      out.appendLine("[CMD] helloWorld -> manual effect");
      const repoPath = wsf[0] ?? "(no workspace)";
      GitEffectsPanel.fire(context, out, {
        kind: "info",
        event: "manual",
        repoPath,
        title: "Manual Effect ✅",
        detail: "Command Palette trigger",
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("git-effects.push", async () => {
      const repo = resolveRepo(git, out);
      if (!repo) return vscode.window.showWarningMessage("Git repository를 찾지 못했습니다.");
      const hi = headInfo(repo);

      out.appendLine(`[CMD] push @ ${repo.rootUri.fsPath}`);
      const res = await runGit(repo, ["push"]);
      GitEffectsPanel.fire(context, out, {
        kind: res.ok ? "success" : "error",
        event: "push",
        repoPath: repo.rootUri.fsPath,
        branch: hi.branch,
        upstream: hi.upstream,
        title: res.ok ? "Push 성공 ✅" : "Push 실패 ❌",
        detail: res.ok ? "git push completed" : shortenReason(res.stderr || res.stdout),
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("git-effects.pull", async () => {
      const repo = resolveRepo(git, out);
      if (!repo) return vscode.window.showWarningMessage("Git repository를 찾지 못했습니다.");
      const hi = headInfo(repo);

      out.appendLine(`[CMD] pull @ ${repo.rootUri.fsPath}`);
      const res = await runGit(repo, ["pull"]);
      GitEffectsPanel.fire(context, out, {
        kind: res.ok ? "success" : "error",
        event: "pull",
        repoPath: repo.rootUri.fsPath,
        branch: hi.branch,
        upstream: hi.upstream,
        title: res.ok ? "Pull 성공 ✅" : "Pull 실패 ❌",
        detail: res.ok ? "git pull completed" : shortenReason(res.stderr || res.stdout),
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("git-effects.commit", async () => {
      const repo = resolveRepo(git, out);
      if (!repo) return vscode.window.showWarningMessage("Git repository를 찾지 못했습니다.");
      const hi = headInfo(repo);

      out.appendLine(`[CMD] commit @ ${repo.rootUri.fsPath}`);
      const msg = await vscode.window.showInputBox({
        prompt: "Commit message",
        placeHolder: "ex) fix: update toast effects",
        ignoreFocusOut: true,
      });
      if (!msg) return;

      const res = await runGit(repo, ["commit", "-m", msg]);
      GitEffectsPanel.fire(context, out, {
        kind: res.ok ? "success" : "error",
        event: "commit",
        repoPath: repo.rootUri.fsPath,
        branch: hi.branch,
        upstream: hi.upstream,
        title: res.ok ? "Commit 완료 ✅" : "Commit 실패 ❌",
        detail: res.ok ? msg : shortenReason(res.stderr || res.stdout),
      });
    }),
  );
}
