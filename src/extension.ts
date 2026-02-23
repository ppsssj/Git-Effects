import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

const OUT_NAME = "Git Effects";
const PANEL_VIEWTYPE = "gitEffectsPanel";

// webview에서 로컬 리소스(media/**)를 로드하려면 ExtensionContext가 필요합니다.
let extensionContext: vscode.ExtensionContext | undefined;

// ------------------------
// Types (vscode.git API subset)
// ------------------------
type GitExtension = { getAPI(version: 1): GitAPI };
type GitAPI = { repositories: Repository[] };

type Repository = {
  rootUri: vscode.Uri;
  state: {
    HEAD?: {
      name?: string;
      upstream?: { name?: string };
      ahead?: number;
      behind?: number;
      commit?: string;
    };
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
  repoPath?: string;
  branch?: string;
  upstream?: string;
  title: string;
  detail?: string;
};

// ------------------------
// Webview “Effects Panel”
// ------------------------
let panel: vscode.WebviewPanel | undefined;
let lastFireMs = 0;

function getOrCreatePanel(): vscode.WebviewPanel {
  if (panel) return panel;

  const ctx = extensionContext;
  if (!ctx) throw new Error("extensionContext is not initialized");

  panel = vscode.window.createWebviewPanel(
    PANEL_VIEWTYPE,
    " ", // 제목 최소화
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: false,
      // ✅ media/** 아래 파일을 webview에서 읽을 수 있게 허용
      localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, "media")],
    },
  );

  panel.webview.html = getHtml(panel.webview);

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
    `[EFFECT] ${payload.kind.toUpperCase()} ${payload.event} :: ${payload.title} :: ${payload.branch ?? "?"} -> ${
      payload.upstream ?? "?"
    }`,
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
// Repo selection helpers (OS-safe)
// ------------------------
function isPathInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function pickRepo(
  repos: Repository[],
  out: vscode.OutputChannel,
): Repository | null {
  if (repos.length === 0) return null;
  if (repos.length === 1) return repos[0];

  // 1) active editor 기준
  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (activePath) {
    const hit = repos.find((r) => isPathInside(activePath, r.rootUri.fsPath));
    if (hit) return hit;
  }

  // 2) workspace[0] 기준
  const ws0 = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (ws0) {
    const hit = repos.find((r) => isPathInside(ws0, r.rootUri.fsPath));
    if (hit) return hit;
  }

  out.appendLine("pickRepo: fallback to repo[0]");
  return repos[0];
}

function resolveRepo(
  git: GitAPI,
  out: vscode.OutputChannel,
): Repository | null {
  const repos = git.repositories ?? [];
  if (!repos.length) return null;
  return pickRepo(repos, out);
}

function headInfo(repo: Repository) {
  const head = repo.state.HEAD;
  const branch = typeof head?.name === "string" ? head.name : undefined;
  const upstream =
    typeof head?.upstream?.name === "string" ? head.upstream.name : undefined;
  const commit = typeof head?.commit === "string" ? head.commit : undefined;
  const ahead = Number(head?.ahead ?? 0);
  const behind = Number(head?.behind ?? 0);
  return { branch, upstream, commit, ahead, behind };
}

function isDirty(repo: Repository): boolean {
  const wt = repo.state.workingTreeChanges?.length ?? 0;
  const idx = repo.state.indexChanges?.length ?? 0;
  const mg = repo.state.mergeChanges?.length ?? 0;
  return wt + idx + mg > 0;
}

// ------------------------
// “Accurate mode” Git commands
// ------------------------
async function runGit(repo: Repository, args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: repo.rootUri.fsPath,
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true as const, stdout: stdout ?? "", stderr: stderr ?? "" };
  } catch (e: any) {
    const stdout = String(e?.stdout ?? "");
    const stderr = String(e?.stderr ?? e?.message ?? "unknown error");
    const code = typeof e?.code === "number" ? e.code : undefined;
    return { ok: false as const, stdout, stderr, code };
  }
}

function shortenReason(s: string, max = 220) {
  const oneLine = s.replace(/\s+/g, " ").trim();
  if (!oneLine) return "Unknown error";
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}

// ------------------------
// Auto-detect (repo별 상태 Map)
// ------------------------
type RepoSnap = {
  ahead: number;
  behind: number;
  dirty: boolean;
  commit: string;
};

function readSnap(repo: Repository): RepoSnap {
  const hi = headInfo(repo);
  return {
    ahead: hi.ahead,
    behind: hi.behind,
    dirty: isDirty(repo),
    commit: hi.commit ?? "",
  };
}

// ------------------------
// Webview HTML (CSP/nonce 적용)
// ------------------------
function nonce() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++)
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function getHtml(webview: vscode.Webview) {
  const ctx = extensionContext;
  if (!ctx) throw new Error("extensionContext is not initialized");

  const n = nonce();
  const csp = [
    "default-src 'none'",
    // three가 텍스처 이미지를 <img>로 로드할 수 있어야 함
    `img-src ${webview.cspSource} https: data:`,
    // OBJ/MTL/텍스처를 fetch/XHR로 읽기 위해 필요
    `connect-src ${webview.cspSource}`,
    "style-src 'unsafe-inline'",
    // ✅ import로 불러오는 모듈 스크립트(three.module.js 등)를 허용해야 함
    `script-src 'nonce-${n}' ${webview.cspSource}`,
  ].join("; ");
  // three + loaders (이 파일들은 media/vendor/three 아래에 있어야 합니다)
  const threeUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      ctx.extensionUri,
      "media",
      "vendor",
      "three",
      "three.module.js",
    ),
  );
  const objLoaderUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      ctx.extensionUri,
      "media",
      "vendor",
      "three",
      "OBJLoader.js",
    ),
  );
  const mtlLoaderUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      ctx.extensionUri,
      "media",
      "vendor",
      "three",
      "MTLLoader.js",
    ),
  );

  // model files (이 파일들은 media/models/character-male-d 아래에 있어야 합니다)
  // model files (media/models 바로 아래에 있다고 가정)
  const modelDir = vscode.Uri.joinPath(ctx.extensionUri, "media", "models");

  const objUri = webview.asWebviewUri(
    vscode.Uri.joinPath(modelDir, "character-male-d.obj"),
  );
  const mtlUri = webview.asWebviewUri(
    vscode.Uri.joinPath(modelDir, "character-male-d.mtl"),
  );

  // OBJ는 models 기준으로 읽어도 되고
  const modelBase = webview.asWebviewUri(modelDir).toString() + "/";

  // ✅ 텍스처 상대경로는 media 기준으로 풀리게 만드는 게 깔끔함
  const mediaBase =
    webview
      .asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, "media"))
      .toString() + "/";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html,body{height:100%;margin:0;background:transparent;overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,"Apple SD Gothic Neo"}
    #c{position:absolute;inset:0}
    .hud{position:absolute;right:14px;bottom:14px;width:min(420px,calc(100vw - 28px));border-radius:16px;background:rgba(20,20,24,.78);border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 36px rgba(0,0,0,.45);backdrop-filter:blur(10px);color:#fff;pointer-events:none;opacity:0;transform:translateX(40px);transition:transform 220ms ease, opacity 220ms ease;}
    .hud.show{opacity:1;transform:translateX(0)}
    .top{display:flex;align-items:center;gap:10px;padding:12px 14px 8px;font-weight:900;letter-spacing:-0.2px}
    .badge{width:10px;height:10px;border-radius:999px;flex:0 0 auto}
    .title{font-size:13px}
    .meta{padding:0 14px 6px;font-size:12px;opacity:.82;word-break:break-word}
    .detail{padding:0 14px 12px;font-size:12px;opacity:.92;line-height:1.35;word-break:break-word}
    .bar{height:3px;background:rgba(255,255,255,.10);border-bottom-left-radius:16px;border-bottom-right-radius:16px;overflow:hidden}
    .bar>div{height:100%;width:0%;transition:width 1600ms linear}
    .k-success .badge{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.15)}
    .k-success .bar>div{background:rgba(34,197,94,.85)}
    .k-error .badge{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.15)}
    .k-error .bar>div{background:rgba(239,68,68,.85)}
    .k-info .badge{background:#60a5fa;box-shadow:0 0 0 4px rgba(96,165,250,.15)}
    .k-info .bar>div{background:rgba(96,165,250,.85)}
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="hud" class="hud k-info">
    <div class="top"><span class="badge"></span><span id="t" class="title">Ready</span></div>
    <div id="m" class="meta"></div>
    <div id="d" class="detail"></div>
    <div class="bar"><div id="p"></div></div>
  </div>

  <script type="module" nonce="${n}">
    import * as THREE from "${threeUri}";
    import { OBJLoader } from "${objLoaderUri}";
    import { MTLLoader } from "${mtlLoaderUri}";

    const hud = document.getElementById('hud');
    const title = document.getElementById('t');
    const meta = document.getElementById('m');
    const detail = document.getElementById('d');
    const progress = document.getElementById('p');

    function setKind(kind){
      hud.classList.remove('k-success','k-error','k-info');
      hud.classList.add(kind === 'error' ? 'k-error' : kind === 'success' ? 'k-success' : 'k-info');
    }

    function showHud(payload){
      setKind(payload.kind || 'info');
      title.textContent = payload.title || '';
      const b = payload.branch || '?';
      const u = payload.upstream || '?';
meta.textContent = payload.repoPath
  ? (payload.repoPath + '  •  ' + b + ' → ' + u)
  : (b + ' → ' + u);      detail.textContent = payload.detail || '';
      hud.classList.add('show');
      progress.style.transition = 'none';
      progress.style.width = '0%';
      requestAnimationFrame(() => {
        progress.style.transition = 'width 1600ms linear';
        progress.style.width = '100%';
      });
      setTimeout(() => hud.classList.remove('show'), 1900);
    }

    const canvas = document.getElementById('c');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
    renderer.setPixelRatio(Math.max(1, window.devicePixelRatio || 1));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.35, 3.1);
    camera.lookAt(0, 0.4, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.78));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(2, 4, 3);
    scene.add(key);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent:true, opacity:0.15 })
    );
    shadow.rotation.x = -Math.PI/2;
    shadow.position.y = -0.95;
    scene.add(shadow);

    function resize(){
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0.4, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    let model = null;
    async function loadModel(){
      const mtlLoader = new MTLLoader();
      mtlLoader.setResourcePath("${modelBase}");
      const materials = await mtlLoader.loadAsync("${mtlUri}");
      materials.preload();

      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.setPath("${modelBase}");
      model = await objLoader.loadAsync("${objUri}");
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      model.position.sub(center); // center to origin

      camera.position.set(0, maxDim * 0.6, maxDim * 2.2);
      camera.lookAt(0, 0, 0);
      model.position.set(0, -0.95, 0);
      model.rotation.y = Math.PI;
      model.scale.setScalar(1.25);
      scene.add(model);
    }

    loadModel().catch((err) => {
      title.textContent = 'Model load failed';
      detail.textContent = String(err?.message || err);
      hud.classList.add('show');
    });

    const state = { phase: 'idle', t0: performance.now(), kind: 'info', event: 'manual' };
    function startAnim(kind, event){
      state.kind = kind || 'info';
      state.event = event || 'manual';
      state.phase = 'enter';
      state.t0 = performance.now();
    }

    function tick(now){
      requestAnimationFrame(tick);
      if (!model) { renderer.render(scene, camera); return; }
      const t = now - state.t0;

      if (state.phase === 'enter'){
        const tt = Math.min(1, t / 650);
        model.position.x = THREE.MathUtils.lerp(2.2, 0.0, 1 - Math.pow(1-tt, 3));
        model.rotation.z = Math.sin(tt * Math.PI * 2) * 0.06;
        model.scale.y = 1.0 - Math.sin(tt * Math.PI) * 0.05;
        if (tt >= 1){ state.phase = 'act'; state.t0 = now; }
      } else if (state.phase === 'act'){
        if (state.kind === 'error'){
          const tt = Math.min(1, t / 900);
          model.rotation.y = Math.PI + Math.sin(tt * 18) * 0.08;
          model.scale.y = THREE.MathUtils.lerp(1.0, 0.92, tt);
          model.position.y = THREE.MathUtils.lerp(-0.95, -1.02, tt);
          if (tt >= 1){ state.phase = 'exit'; state.t0 = now; }
        } else if (state.event === 'commit'){
          const tt = Math.min(1, t / 950);
          const s = tt < 0.45
            ? THREE.MathUtils.lerp(1.0, 0.90, tt/0.45)
            : THREE.MathUtils.lerp(0.90, 1.05, (tt-0.45)/0.55);
          model.scale.y = s;
          model.rotation.x = -Math.sin(tt * Math.PI) * 0.10;
          if (tt >= 1){ state.phase = 'exit'; state.t0 = now; }
        } else {
          const tt = Math.min(1, t / 850);
          model.position.y = -0.95 + Math.sin(tt * Math.PI) * 0.10;
          model.rotation.x = -Math.sin(tt * Math.PI) * 0.08;
          if (tt >= 1){ state.phase = 'exit'; state.t0 = now; }
        }
      } else if (state.phase === 'exit'){
        const tt = Math.min(1, t / 500);
        model.position.x = THREE.MathUtils.lerp(0.0, 2.2, tt);
        model.rotation.z *= (1-tt);
        if (tt >= 1){ state.phase = 'idle'; }
      }

      renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'effect') return;
      const payload = msg.payload || {};
      showHud(payload);
      startAnim(payload.kind || 'info', payload.event || 'manual');
    });
  </script>
</body>
</html>`;
}
// Activation
// ------------------------
export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
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
    }),
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

      // ---- Accurate-mode commands (repo는 실행 시점 resolve) ----
      context.subscriptions.push(
        vscode.commands.registerCommand("git-effects.push", async () => {
          const repo = resolveRepo(git, out);
          if (!repo)
            return vscode.window.showWarningMessage(
              "Git repository를 찾지 못했습니다.",
            );
          const hi = headInfo(repo);

          out.appendLine(`[CMD] push @ ${repo.rootUri.fsPath}`);
          const res = await runGit(repo, ["push"]);
          fireEffect(out, {
            kind: res.ok ? "success" : "error",
            event: "push",
            repoPath: repo.rootUri.fsPath,
            branch: hi.branch,
            upstream: hi.upstream,
            title: res.ok ? "Push 성공 ✅" : "Push 실패 ❌",
            detail: res.ok
              ? "git push completed"
              : shortenReason(res.stderr || res.stdout),
          });
        }),
      );

      context.subscriptions.push(
        vscode.commands.registerCommand("git-effects.pull", async () => {
          const repo = resolveRepo(git, out);
          if (!repo)
            return vscode.window.showWarningMessage(
              "Git repository를 찾지 못했습니다.",
            );
          const hi = headInfo(repo);

          out.appendLine(`[CMD] pull @ ${repo.rootUri.fsPath}`);
          const res = await runGit(repo, ["pull"]);
          fireEffect(out, {
            kind: res.ok ? "success" : "error",
            event: "pull",
            repoPath: repo.rootUri.fsPath,
            branch: hi.branch,
            upstream: hi.upstream,
            title: res.ok ? "Pull 성공 ✅" : "Pull 실패 ❌",
            detail: res.ok
              ? "git pull completed"
              : shortenReason(res.stderr || res.stdout),
          });
        }),
      );

      context.subscriptions.push(
        vscode.commands.registerCommand("git-effects.commit", async () => {
          const repo = resolveRepo(git, out);
          if (!repo)
            return vscode.window.showWarningMessage(
              "Git repository를 찾지 못했습니다.",
            );
          const hi = headInfo(repo);

          out.appendLine(`[CMD] commit @ ${repo.rootUri.fsPath}`);
          const msg = await vscode.window.showInputBox({
            prompt: "Commit message",
            placeHolder: "ex) fix: update toast effects",
            ignoreFocusOut: true,
          });
          if (!msg) return;

          const res = await runGit(repo, ["commit", "-m", msg]);
          fireEffect(out, {
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

      // ---- Auto-detect engine (repo별) ----
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
              fireEffect(out, {
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
              fireEffect(out, {
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
              fireEffect(out, {
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

      let timer: NodeJS.Timeout | undefined;
      const schedule = async () => {
        const nextMs = await pollTick();
        timer = setTimeout(schedule, nextMs);
      };

      schedule();
      context.subscriptions.push({
        dispose: () => timer && clearTimeout(timer),
      });

      out.appendLine("auto-detect started (repo-wise)");
    },
    (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      out.appendLine(`[ERR] vscode.git activate failed: ${msg}`);
      vscode.window.showErrorMessage(`vscode.git activate failed: ${msg}`);
    },
  );

  out.appendLine("=== activate() end ===");
}

export function deactivate() {}
