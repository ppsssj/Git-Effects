import * as vscode from "vscode";
import { execFile } from "node:child_process";
import * as path from "node:path";

// -------------------------
// Git API minimal typings
// (당신 프로젝트에 이미 있으면 이 블록은 제거하고 기존 타입 사용)
// -------------------------
type GitExtension = {
  getAPI(version: 1): GitAPI;
};

type GitAPI = {
  repositories: Repository[];
};

type Repository = {
  rootUri: vscode.Uri;
  state: {
    HEAD?: {
      name?: string;
      ahead?: number;
      behind?: number;
      upstream?: { name?: string };
      commit?: string;
    };
    workingTreeChanges?: unknown[];
    indexChanges?: unknown[];
    mergeChanges?: unknown[];
  };
  status?: () => Thenable<void>;
};

// -------------------------
// Effect payload
// -------------------------
type EffectKind = "success" | "error";
type EffectEvent = "push" | "pull" | "commit" | "test";

type EffectPayload = {
  kind: EffectKind;
  event: EffectEvent;
  title: string;
  detail?: string;
  repoPath?: string;
  branch?: string;
  upstream?: string;
  durationMs?: number;
};

// -------------------------
// Utils
// -------------------------
function isDirty(repo: Repository): boolean {
  const wt = repo.state.workingTreeChanges?.length ?? 0;
  const idx = repo.state.indexChanges?.length ?? 0;
  const mg = repo.state.mergeChanges?.length ?? 0;
  return wt + idx + mg > 0;
}

function headInfo(repo: Repository): { branch?: string; upstream?: string; commit?: string; ahead?: number; behind?: number } {
  const head = repo.state.HEAD;
  return {
    branch: head?.name,
    upstream: head?.upstream?.name,
    commit: head?.commit,
    ahead: Number(head?.ahead ?? 0),
    behind: Number(head?.behind ?? 0),
  };
}

function shortenReason(msg?: string): string {
  if (!msg) return "Unknown error";
  const s = msg.replace(/\s+/g, " ").trim();
  // 너무 긴 stderr는 1줄로 줄이기
  return s.length > 240 ? s.slice(0, 240) + "…" : s;
}

function isPathInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// "현재 활성 파일" 기준으로 repo를 고르는 전략
function pickRepo(repos: Repository[], out: vscode.OutputChannel): Repository {
  if (repos.length === 1) return repos[0];

  const active = vscode.window.activeTextEditor?.document?.uri?.fsPath;
  if (active) {
    const hit = repos.find((r) => isPathInside(active, r.rootUri.fsPath));
    if (hit) return hit;
  }

  // fallback: 첫 repo
  out.appendLine(`[pickRepo] active editor 기반 매칭 실패. fallback to first repo (${repos[0].rootUri.fsPath})`);
  return repos[0];
}

function resolveRepo(git: GitAPI, out: vscode.OutputChannel): Repository | null {
  const repos = git.repositories ?? [];
  if (!repos.length) return null;
  return pickRepo(repos, out);
}

function runExecFile(cmd: string, args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; stderr: string; code?: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
      if (err) {
        // err.code 있을 수 있음
        // @ts-ignore
        const code = typeof err.code === "number" ? err.code : undefined;
        resolve({ ok: false, stdout: String(stdout ?? ""), stderr: String(stderr ?? err.message ?? ""), code });
      } else {
        resolve({ ok: true, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      }
    });
  });
}

async function runGit(repo: Repository, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; code?: number }> {
  return runExecFile("git", args, repo.rootUri.fsPath);
}

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

// -------------------------
// Webview Effect Panel
// -------------------------
let panelRef: vscode.WebviewPanel | null = null;

function showEffectPanel(context: vscode.ExtensionContext, payload: EffectPayload, out: vscode.OutputChannel) {
  const cfg = vscode.workspace.getConfiguration("gitEffects");
  const durationMs = payload.durationMs ?? cfg.get<number>("durationMs", 2400);

  // 기존 패널이 있으면 재사용(깜빡임/탭 누적 방지)
  if (!panelRef) {
    panelRef = vscode.window.createWebviewPanel(
      "gitEffects.panel",
      "Git Effects",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: false,
      }
    );

    panelRef.onDidDispose(() => {
      panelRef = null;
    });

    panelRef.webview.html = getHtml(panelRef.webview);
  }

  // payload 주입
  panelRef.webview.postMessage({
    type: "effect",
    payload: { ...payload, durationMs },
  });

  out.appendLine(`[effect] ${payload.kind} ${payload.event} :: ${payload.title}`);

  // 자동 닫기
  setTimeout(() => {
    try {
      panelRef?.dispose();
    } catch {
      // ignore
    }
  }, durationMs + 200);
}

function getHtml(webview: vscode.Webview): string {
  const n = nonce();
  const csp = `default-src 'none'; img-src ${webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'nonce-${n}';`;

  // UI는 MVP 수준: slide-in 카드 + progress
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Git Effects</title>
  <style>
    :root { --bg:#0f1115; --card:#171a21; --text:#e7e9ee; --muted:#a7adbb; --ok:#3fb950; --err:#f85149; }
    body { margin:0; padding:0; background:transparent; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
    .wrap { position: fixed; top: 24px; right: 16px; width: 360px; z-index: 9999; pointer-events: none; }
    .card {
      background: var(--card);
      color: var(--text);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 14px;
      padding: 14px 14px 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      transform: translateX(420px);
      opacity: 0;
      transition: transform .35s ease, opacity .35s ease;
    }
    .card.show { transform: translateX(0); opacity: 1; }
    .top { display:flex; align-items:center; gap:10px; }
    .badge { width: 10px; height:10px; border-radius:999px; background: var(--ok); }
    .badge.err { background: var(--err); }
    .title { font-size: 14px; font-weight: 700; letter-spacing: .2px; }
    .detail { margin-top: 6px; font-size: 12.5px; color: var(--muted); line-height: 1.35; }
    .meta { margin-top: 10px; display:flex; gap:8px; flex-wrap: wrap; }
    .chip { font-size: 11px; color: rgba(255,255,255,.85); background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.07); padding: 4px 8px; border-radius: 999px; }
    .bar { margin-top: 10px; height: 3px; background: rgba(255,255,255,.08); border-radius: 999px; overflow:hidden; }
    .bar > div { height: 100%; width: 100%; transform-origin: left; transform: scaleX(1); background: rgba(255,255,255,.22); }
    .bar.ok > div { background: rgba(63,185,80,.65); }
    .bar.err > div { background: rgba(248,81,73,.65); }
  </style>
</head>
<body>
  <div class="wrap">
    <div id="card" class="card">
      <div class="top">
        <div id="badge" class="badge"></div>
        <div id="title" class="title">...</div>
      </div>
      <div id="detail" class="detail"></div>
      <div id="meta" class="meta"></div>
      <div id="bar" class="bar ok"><div id="barFill"></div></div>
    </div>
  </div>

  <script nonce="${n}">
    const vscode = acquireVsCodeApi();

    const $card = document.getElementById('card');
    const $badge = document.getElementById('badge');
    const $title = document.getElementById('title');
    const $detail = document.getElementById('detail');
    const $meta = document.getElementById('meta');
    const $bar = document.getElementById('bar');
    const $barFill = document.getElementById('barFill');

    function setMeta(payload) {
      $meta.innerHTML = '';
      const chips = [];
      if (payload.repoPath) chips.push({ label: payload.repoPath });
      if (payload.branch) chips.push({ label: 'branch: ' + payload.branch });
      if (payload.upstream) chips.push({ label: 'upstream: ' + payload.upstream });
      for (const c of chips.slice(0, 3)) {
        const el = document.createElement('div');
        el.className = 'chip';
        el.textContent = c.label;
        $meta.appendChild(el);
      }
    }

    function animate(durationMs, kind) {
      // reset
      $card.classList.remove('show');
      void $card.offsetWidth;
      $card.classList.add('show');

      $bar.className = 'bar ' + (kind === 'error' ? 'err' : 'ok');

      $barFill.style.transition = 'none';
      $barFill.style.transform = 'scaleX(1)';
      void $barFill.offsetWidth;

      $barFill.style.transition = 'transform ' + durationMs + 'ms linear';
      $barFill.style.transform = 'scaleX(0)';
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'effect') return;

      const p = msg.payload || {};
      const kind = p.kind || 'success';

      $badge.className = 'badge' + (kind === 'error' ? ' err' : '');
      $title.textContent = p.title || '';
      $detail.textContent = p.detail || '';
      setMeta(p);

      animate(p.durationMs || 2400, kind);
    });
  </script>
</body>
</html>`;
}

// -------------------------
// Auto-detect (repo별 상태)
// -------------------------
type RepoSnap = {
  ahead: number;
  behind: number;
  dirty: boolean;
  commit: string;
};

function readSnap(repo: Repository): RepoSnap {
  const hi = headInfo(repo);
  return {
    ahead: Number(hi.ahead ?? 0),
    behind: Number(hi.behind ?? 0),
    dirty: isDirty(repo),
    commit: hi.commit ?? "",
  };
}

// -------------------------
// activate
// -------------------------
export async function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel("Git Effects");
  context.subscriptions.push(out);

  // Git extension API
  const gitExt = vscode.extensions.getExtension<GitExtension>("vscode.git")?.exports;
  if (!gitExt) {
    vscode.window.showWarningMessage("Git Effects: VS Code Git extension(vscode.git)을 찾을 수 없습니다.");
    return;
  }
  const git = gitExt.getAPI(1);

  // -------------------------
  // Commands (repo는 실행 시점 resolve)
  // -------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("git-effects.helloWorld", async () => {
      showEffectPanel(context, { kind: "success", event: "test", title: "Git Effects 테스트 ✨", detail: "HelloWorld effect" }, out);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("git-effects.push", async () => {
      const repo = resolveRepo(git, out);
      if (!repo) return vscode.window.showWarningMessage("Git repository를 찾지 못했습니다.");

      const hi = headInfo(repo);
      out.appendLine(`[CMD] push @ ${repo.rootUri.fsPath}`);

      const res = await runGit(repo, ["push"]);
      if (res.ok) {
        showEffectPanel(
          context,
          { kind: "success", event: "push", title: "Push 성공 ✅", detail: "git push completed", repoPath: repo.rootUri.fsPath, branch: hi.branch, upstream: hi.upstream },
          out
        );
      } else {
        showEffectPanel(
          context,
          { kind: "error", event: "push", title: "Push 실패 ❌", detail: shortenReason(res.stderr || res.stdout), repoPath: repo.rootUri.fsPath, branch: hi.branch, upstream: hi.upstream },
          out
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("git-effects.pull", async () => {
      const repo = resolveRepo(git, out);
      if (!repo) return vscode.window.showWarningMessage("Git repository를 찾지 못했습니다.");

      const hi = headInfo(repo);
      out.appendLine(`[CMD] pull @ ${repo.rootUri.fsPath}`);

      const res = await runGit(repo, ["pull"]);
      if (res.ok) {
        showEffectPanel(
          context,
          { kind: "success", event: "pull", title: "Pull 성공 ✅", detail: "git pull completed", repoPath: repo.rootUri.fsPath, branch: hi.branch, upstream: hi.upstream },
          out
        );
      } else {
        showEffectPanel(
          context,
          { kind: "error", event: "pull", title: "Pull 실패 ❌", detail: shortenReason(res.stderr || res.stdout), repoPath: repo.rootUri.fsPath, branch: hi.branch, upstream: hi.upstream },
          out
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("git-effects.commit", async () => {
      const repo = resolveRepo(git, out);
      if (!repo) return vscode.window.showWarningMessage("Git repository를 찾지 못했습니다.");

      const hi = headInfo(repo);
      out.appendLine(`[CMD] commit @ ${repo.rootUri.fsPath}`);

      const msg = await vscode.window.showInputBox({
        title: "Commit message",
        placeHolder: "feat: ...",
        ignoreFocusOut: true,
      });
      if (!msg) return;

      const res = await runGit(repo, ["commit", "-m", msg]);
      if (res.ok) {
        showEffectPanel(
          context,
          { kind: "success", event: "commit", title: "Commit 완료 ✅", detail: msg, repoPath: repo.rootUri.fsPath, branch: hi.branch, upstream: hi.upstream },
          out
        );
      } else {
        showEffectPanel(
          context,
          { kind: "error", event: "commit", title: "Commit 실패 ❌", detail: shortenReason(res.stderr || res.stdout), repoPath: repo.rootUri.fsPath, branch: hi.branch, upstream: hi.upstream },
          out
        );
      }
    })
  );

  // -------------------------
  // Auto-detect loop (repo별 상태 Map)
  // -------------------------
  const cfg = vscode.workspace.getConfiguration("gitEffects");
  const pollMs = cfg.get<number>("pollMs", 1200);

  const repoState = new Map<string, RepoSnap>();

  const timer = setInterval(async () => {
    try {
      const repos = git.repositories ?? [];
      if (!repos.length) return;

      const cfg2 = vscode.workspace.getConfiguration("gitEffects");
      const autoPush = cfg2.get<boolean>("autoPush", true);
      const autoPull = cfg2.get<boolean>("autoPull", true);
      const autoCommit = cfg2.get<boolean>("autoCommit", true);

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
          showEffectPanel(
            context,
            {
              kind: "success",
              event: "push",
              title: "Push 성공 ✅",
              detail: `${hi.branch ?? "?"} → ${hi.upstream ?? "?"}`,
              repoPath: key,
              branch: hi.branch,
              upstream: hi.upstream,
            },
            out
          );
        }

        if (autoPull && prev.behind > 0 && cur.behind === 0) {
          showEffectPanel(
            context,
            {
              kind: "success",
              event: "pull",
              title: "Pull 성공 ✅",
              detail: `${hi.branch ?? "?"} ← ${hi.upstream ?? "?"}`,
              repoPath: key,
              branch: hi.branch,
              upstream: hi.upstream,
            },
            out
          );
        }

        if (autoCommit && cur.commit && prev.commit && cur.commit !== prev.commit && prev.dirty && !cur.dirty) {
          showEffectPanel(
            context,
            {
              kind: "success",
              event: "commit",
              title: "Commit 완료 ✅",
              detail: `HEAD updated (${prev.commit.slice(0, 7)} → ${cur.commit.slice(0, 7)})`,
              repoPath: key,
              branch: hi.branch,
              upstream: hi.upstream,
            },
            out
          );
        }

        repoState.set(key, cur);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      out.appendLine(`[ERR] poll failed: ${msg}`);
    }
  }, pollMs);

  context.subscriptions.push(new vscode.Disposable(() => clearInterval(timer)));

  out.appendLine("[activate] Git Effects activated");
}

export function deactivate() {
  // VS Code가 dispose 호출
}