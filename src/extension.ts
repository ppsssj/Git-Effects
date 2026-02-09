import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type GitExtension = { getAPI(version: 1): GitAPI };
type GitAPI = { repositories: Repository[] };

// Git API는 버전/환경마다 shape가 조금씩 달라서 optional로 넓게 잡습니다.
type Repository = {
  rootUri: vscode.Uri;
  state: {
    HEAD: unknown | null;
    // 아래 change 배열들은 환경에 따라 없을 수 있음
    workingTreeChanges?: unknown[];
    indexChanges?: unknown[];
    mergeChanges?: unknown[];
  };
  status?: () => Thenable<void>;
};

type EffectKind = "success" | "error" | "info";
type EffectEvent = "push" | "pull" | "commit" | "manual";

type EffectPayload = {
  kind: EffectKind;
  event: EffectEvent;
  repoPath: string;
  branch?: string;
  upstream?: string;
  title: string;
  detail?: string;
};

const OUT_NAME = "Git Effects";
const PANEL_VIEWTYPE = "gitEffectsPanel";

// ------------------------
// Webview “Effects Panel”
// ------------------------
let panel: vscode.WebviewPanel | undefined;
let lastFireMs = 0;

function getOrCreatePanel(): vscode.WebviewPanel {
  if (panel) return panel;

  panel = vscode.window.createWebviewPanel(
    PANEL_VIEWTYPE,
    " ", // 제목 최소화
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, // 오른쪽 + 포커스 유지
    { enableScripts: true, retainContextWhenHidden: false }
  );

  panel.webview.html = getHtml();

  panel.onDidDispose(() => {
    panel = undefined;
  });

  return panel;
}

function fireEffect(out: vscode.OutputChannel, payload: EffectPayload) {
  const cfg = vscode.workspace.getConfiguration("gitEffects");
  const enabled = cfg.get<boolean>("enabled", true);
  if (!enabled) return;

  const cooldownMs = cfg.get<number>("cooldownMs", 1200);
  const now = Date.now();
  if (now - lastFireMs < cooldownMs) return;
  lastFireMs = now;

  const p = getOrCreatePanel();
  p.reveal(vscode.ViewColumn.Beside, true);

  out.appendLine(
    `[EFFECT] ${payload.kind.toUpperCase()} ${payload.event} :: ${payload.title} :: ${payload.branch ?? "?"} -> ${payload.upstream ?? "?"}`
  );

  p.webview.postMessage({ type: "effect", payload });

  const durationMs = cfg.get<number>("durationMs", 2200);
  setTimeout(() => {
    try {
      panel?.dispose();
    } catch {
      // noop
    }
  }, durationMs);
}

// ------------------------
// Repo selection helpers
// ------------------------
function normalizePath(p: string): string {
  return p.replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();
}

function isPathInside(child: string, parent: string): boolean {
  const c = normalizePath(child);
  const p = normalizePath(parent);
  return c === p || c.startsWith(p + "\\") || c.startsWith(p + "/");
}

function pickRepo(repos: Repository[], out: vscode.OutputChannel): Repository | null {
  if (repos.length === 0) return null;

  const ws0 = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (ws0) {
    const hit = repos.find((r) => isPathInside(ws0, r.rootUri.fsPath));
    out.appendLine(`workspace[0]=${ws0}`);
    out.appendLine(`repo match by workspace[0]? ${Boolean(hit)}`);
    if (hit) return hit;
  }

  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (activePath) {
    const hit = repos.find((r) => isPathInside(activePath, r.rootUri.fsPath));
    out.appendLine(`activeEditor=${activePath}`);
    out.appendLine(`repo match by activeEditor? ${Boolean(hit)}`);
    if (hit) return hit;
  }

  out.appendLine("fallback to repo[0]");
  return repos[0];
}

function headInfo(repo: Repository): { branch?: string; upstream?: string; commit?: string } {
  const head = repo.state.HEAD as any;
  const branch = typeof head?.name === "string" ? head.name : undefined;
  const upstream = typeof head?.upstream?.name === "string" ? head.upstream.name : undefined;
  const commit = typeof head?.commit === "string" ? head.commit : undefined;
  return { branch, upstream, commit };
}

function isDirty(repo: Repository): boolean {
  const wt = repo.state.workingTreeChanges?.length ?? 0;
  const idx = repo.state.indexChanges?.length ?? 0;
  const mg = repo.state.mergeChanges?.length ?? 0;
  return wt + idx + mg > 0;
}

// ------------------------
// “Accurate mode” Git commands (gets failure reasons)
// ------------------------
async function runGit(
  repo: Repository,
  args: string[]
): Promise<{ ok: boolean; stdout: string; stderr: string; code?: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: repo.rootUri.fsPath,
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: stdout ?? "", stderr: stderr ?? "" };
  } catch (e: any) {
    const stdout = String(e?.stdout ?? "");
    const stderr = String(e?.stderr ?? e?.message ?? "unknown error");
    const code = typeof e?.code === "number" ? e.code : undefined;
    return { ok: false, stdout, stderr, code };
  }
}

function shortenReason(s: string, max = 220): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  if (!oneLine) return "Unknown error";
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}

// ------------------------
// Activation
// ------------------------
export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel(OUT_NAME);
  out.appendLine("=== activate() start ===");
  out.appendLine(`time: ${new Date().toISOString()}`);
  out.show(true);

  const wsf = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  out.appendLine(`workspaceFolders: ${wsf.join(" | ") || "(none)"}`);

  const gitExt = vscode.extensions.getExtension<GitExtension>("vscode.git");
  out.appendLine(`vscode.git extension found? ${Boolean(gitExt)}`);

  // Manual test command
  context.subscriptions.push(
    vscode.commands.registerCommand("git-effects.helloWorld", () => {
      out.appendLine("[CMD] helloWorld -> manual effect");
      const repoPath = wsf[0] ?? "(no workspace)";
      fireEffect(out, {
        kind: "info",
        event: "manual",
        repoPath,
        title: "Manual Effect ✅",
        detail: "Command Palette trigger",
      });
    })
  );

  if (!gitExt) {
    vscode.window.showWarningMessage("vscode.git 확장을 찾지 못했습니다.");
    out.appendLine("[ERR] vscode.git not found -> abort");
    return;
  }

  gitExt.activate().then(
    () => {
      out.appendLine("vscode.git activate() resolved");
      const git = gitExt.exports.getAPI(1);

      const waitForRepo = async (): Promise<Repository | null> => {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const reposNow = git.repositories ?? [];
          if (reposNow.length > 0) return pickRepo(reposNow, out);
          await new Promise<void>((r) => setTimeout(r, 200));
        }
        return null;
      };

      waitForRepo().then((repo) => {
        const repos = git.repositories ?? [];
        out.appendLine(`repositories.length = ${repos.length}`);
        repos.forEach((r, i) => out.appendLine(`repo[${i}]: ${r.rootUri.fsPath}`));

        if (!repo) {
          vscode.window.showWarningMessage("Git repository를 찾지 못했습니다(10초 timeout).");
          out.appendLine("[ERR] still no repo after waiting -> abort");
          return;
        }

        out.appendLine(`picked repo: ${repo.rootUri.fsPath}`);

        // Accurate-mode commands (uses git process => shows failure reasons)
        context.subscriptions.push(
          vscode.commands.registerCommand("git-effects.push", async () => {
            const hi = headInfo(repo);
            out.appendLine("[CMD] push");
            const res = await runGit(repo, ["push"]);
            if (res.ok) {
              fireEffect(out, {
                kind: "success",
                event: "push",
                repoPath: repo.rootUri.fsPath,
                branch: hi.branch,
                upstream: hi.upstream,
                title: "Push 성공 ✅",
                detail: "git push completed",
              });
            } else {
              fireEffect(out, {
                kind: "error",
                event: "push",
                repoPath: repo.rootUri.fsPath,
                branch: hi.branch,
                upstream: hi.upstream,
                title: "Push 실패 ❌",
                detail: shortenReason(res.stderr || res.stdout),
              });
            }
          })
        );

        context.subscriptions.push(
          vscode.commands.registerCommand("git-effects.pull", async () => {
            const hi = headInfo(repo);
            out.appendLine("[CMD] pull");
            const res = await runGit(repo, ["pull"]);
            if (res.ok) {
              fireEffect(out, {
                kind: "success",
                event: "pull",
                repoPath: repo.rootUri.fsPath,
                branch: hi.branch,
                upstream: hi.upstream,
                title: "Pull 성공 ✅",
                detail: "git pull completed",
              });
            } else {
              fireEffect(out, {
                kind: "error",
                event: "pull",
                repoPath: repo.rootUri.fsPath,
                branch: hi.branch,
                upstream: hi.upstream,
                title: "Pull 실패 ❌",
                detail: shortenReason(res.stderr || res.stdout),
              });
            }
          })
        );

        context.subscriptions.push(
          vscode.commands.registerCommand("git-effects.commit", async () => {
            const hi = headInfo(repo);
            out.appendLine("[CMD] commit");
            const msg = await vscode.window.showInputBox({
              prompt: "Commit message",
              placeHolder: "ex) fix: update toast effects",
              ignoreFocusOut: true,
            });
            if (!msg) return;

            // commit assumes user already staged (배포 버전에서 stage까지 묶고 싶으면 옵션으로 확장 가능)
            const res = await runGit(repo, ["commit", "-m", msg]);
            if (res.ok) {
              fireEffect(out, {
                kind: "success",
                event: "commit",
                repoPath: repo.rootUri.fsPath,
                branch: hi.branch,
                upstream: hi.upstream,
                title: "Commit 완료 ✅",
                detail: msg,
              });
            } else {
              fireEffect(out, {
                kind: "error",
                event: "commit",
                repoPath: repo.rootUri.fsPath,
                branch: hi.branch,
                upstream: hi.upstream,
                title: "Commit 실패 ❌",
                detail: shortenReason(res.stderr || res.stdout),
              });
            }
          })
        );

        // Auto-detect engine (works for terminal/GUI git actions, but failure reasons may be unknown)
        const cfg = vscode.workspace.getConfiguration("gitEffects");
        const pollMs = Math.max(200, cfg.get<number>("pollMs", 500));

        let prevAhead = 0;
        let prevBehind = 0;
        let prevDirty = false;
        let prevCommit = "";
        {
          const hi = headInfo(repo);
          prevCommit = hi.commit ?? "";
          const head = repo.state.HEAD as any;
          prevAhead = Number(head?.ahead ?? 0);
          prevBehind = Number(head?.behind ?? 0);
          prevDirty = isDirty(repo);
          out.appendLine(
            `initial: ahead=${prevAhead}, behind=${prevBehind}, dirty=${prevDirty}, commit=${prevCommit || "(unknown)"}`
          );
        }

        const timer = setInterval(async () => {
          try {
            await repo.status?.();

            const hi = headInfo(repo);
            const head = repo.state.HEAD as any;
            const curAhead = Number(head?.ahead ?? 0);
            const curBehind = Number(head?.behind ?? 0);
            const curDirty = isDirty(repo);
            const curCommit = hi.commit ?? "";

            const autoPush = cfg.get<boolean>("autoPush", true);
            const autoPull = cfg.get<boolean>("autoPull", true);
            const autoCommit = cfg.get<boolean>("autoCommit", true);

            // Push success: ahead >0 -> 0
            if (autoPush && prevAhead > 0 && curAhead === 0) {
              fireEffect(out, {
                kind: "success",
                event: "push",
                repoPath: repo.rootUri.fsPath,
                branch: hi.branch,
                upstream: hi.upstream,
                title: "Push 성공 ✅",
                detail: `${hi.branch ?? "?"} → ${hi.upstream ?? "?"}`,
              });
            }

            // Pull success: behind >0 -> 0
            if (autoPull && prevBehind > 0 && curBehind === 0) {
              fireEffect(out, {
                kind: "success",
                event: "pull",
                repoPath: repo.rootUri.fsPath,
                branch: hi.branch,
                upstream: hi.upstream,
                title: "Pull 성공 ✅",
                detail: `${hi.branch ?? "?"} ← ${hi.upstream ?? "?"}`,
              });
            }

            // Commit done (heuristic): commit hash changed AND dirty -> clean
            if (autoCommit && curCommit && prevCommit && curCommit !== prevCommit && prevDirty && !curDirty) {
              fireEffect(out, {
                kind: "success",
                event: "commit",
                repoPath: repo.rootUri.fsPath,
                branch: hi.branch,
                upstream: hi.upstream,
                title: "Commit 완료 ✅",
                detail: `HEAD updated (${prevCommit.slice(0, 7)} → ${curCommit.slice(0, 7)})`,
              });
            }

            // Debug logging when changes happen
            if (curAhead !== prevAhead || curBehind !== prevBehind || curDirty !== prevDirty || curCommit !== prevCommit) {
              out.appendLine(
                `[STATE] ahead ${prevAhead}->${curAhead}, behind ${prevBehind}->${curBehind}, dirty ${prevDirty}->${curDirty}, commit ${(prevCommit || "").slice(0, 7)}->${(curCommit || "").slice(0, 7)}`
              );
            }

            prevAhead = curAhead;
            prevBehind = curBehind;
            prevDirty = curDirty;
            prevCommit = curCommit;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            out.appendLine(`[ERR] poll failed: ${msg}`);
          }
        }, pollMs);

        context.subscriptions.push({ dispose: () => clearInterval(timer) });
        out.appendLine(`auto-detect started (pollMs=${pollMs})`);
      });
    },
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      out.appendLine(`[ERR] vscode.git activate failed: ${msg}`);
      vscode.window.showErrorMessage(`vscode.git activate failed: ${msg}`);
    }
  );

  out.appendLine("=== activate() end ===");
}

export function deactivate() {}

// ------------------------
// Webview HTML (color split + reason text + branch)
// ------------------------
function getHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      height: 100%;
      margin: 0;
      background: transparent;
      overflow: hidden;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Apple SD Gothic Neo";
    }

    .stage {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 18px;
      pointer-events: none;
    }

    .card {
      width: min(460px, 92vw);
      border-radius: 16px;
      background: rgba(20, 20, 24, 0.90);
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 12px 36px rgba(0,0,0,0.45);
      backdrop-filter: blur(10px);
      color: #fff;

      opacity: 0;
      transform: translateX(48px) scale(0.98);
      transition: transform 240ms ease, opacity 240ms ease;
    }
    .card.show { opacity: 1; transform: translateX(0) scale(1.0); }
    .card.hide { opacity: 0; transform: translateX(60px) scale(0.98); transition: transform 200ms ease, opacity 200ms ease; }

    .top {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px 10px 16px;
      font-weight: 900;
      letter-spacing: -0.2px;
    }

    .badge {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      box-shadow: 0 0 0 4px rgba(34,197,94,0.15);
      flex: 0 0 auto;
    }

    .title { font-size: 13px; }
    .meta {
      padding: 0 16px 8px 16px;
      font-size: 12px;
      opacity: 0.85;
      word-break: break-word;
    }
    .detail {
      padding: 0 16px 14px 16px;
      font-size: 12px;
      opacity: 0.92;
      line-height: 1.35;
      word-break: break-word;
    }

    .bar {
      height: 3px;
      background: rgba(255,255,255,0.10);
      border-bottom-left-radius: 16px;
      border-bottom-right-radius: 16px;
      overflow: hidden;
    }
    .bar > div {
      height: 100%;
      width: 0%;
      transition: width 1600ms linear;
    }

    /* kind colors */
    .k-success .badge { background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,0.15); }
    .k-success .bar > div { background: rgba(34,197,94,0.85); }

    .k-error .badge { background: #ef4444; box-shadow: 0 0 0 4px rgba(239,68,68,0.15); }
    .k-error .bar > div { background: rgba(239,68,68,0.85); }

    .k-info .badge { background: #60a5fa; box-shadow: 0 0 0 4px rgba(96,165,250,0.15); }
    .k-info .bar > div { background: rgba(96,165,250,0.85); }
  </style>
</head>
<body>
  <div class="stage">
    <div id="card" class="card k-info">
      <div class="top"><span class="badge"></span><span id="title" class="title">Ready</span></div>
      <div id="meta" class="meta"></div>
      <div id="detail" class="detail"></div>
      <div class="bar"><div id="progress"></div></div>
    </div>
  </div>

  <script>
    const card = document.getElementById("card");
    const title = document.getElementById("title");
    const meta = document.getElementById("meta");
    const detail = document.getElementById("detail");
    const progress = document.getElementById("progress");

    function setKind(kind) {
      card.classList.remove("k-success","k-error","k-info");
      card.classList.add(kind === "error" ? "k-error" : kind === "success" ? "k-success" : "k-info");
    }

    function play(payload) {
      // reset
      card.classList.remove("hide");
      card.classList.remove("show");
      progress.style.transition = "none";
      progress.style.width = "0%";

      setKind(payload.kind || "info");

      title.textContent = payload.title || "Done";
      const b = payload.branch || "?";
      const u = payload.upstream || "?";
      meta.textContent = payload.repoPath ? \`\${payload.repoPath}  •  \${b} → \${u}\` : \`\${b} → \${u}\`;

      detail.textContent = payload.detail || "";

      requestAnimationFrame(() => {
        card.classList.add("show");
        requestAnimationFrame(() => {
          progress.style.transition = "width 1600ms linear";
          progress.style.width = "100%";
        });
      });

      setTimeout(() => card.classList.add("hide"), 1750);
    }

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.type !== "effect") return;
      play(data.payload || {});
    });
  </script>
</body>
</html>`;
}
