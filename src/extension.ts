import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

const OUT_NAME = "Git Effects";
const PANEL_VIEWTYPE = "gitEffectsPanel";

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

  panel = vscode.window.createWebviewPanel(
    PANEL_VIEWTYPE,
    " ", // 제목 최소화
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: false }
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
    }`
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

function pickRepo(repos: Repository[], out: vscode.OutputChannel): Repository | null {
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

function resolveRepo(git: GitAPI, out: vscode.OutputChannel): Repository | null {
  const repos = git.repositories ?? [];
  if (!repos.length) return null;
  return pickRepo(repos, out);
}

function headInfo(repo: Repository) {
  const head = repo.state.HEAD;
  const branch = typeof head?.name === "string" ? head.name : undefined;
  const upstream = typeof head?.upstream?.name === "string" ? head.upstream.name : undefined;
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
type RepoSnap = { ahead: number; behind: number; dirty: boolean; commit: string };

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
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function getHtml(webview: vscode.Webview) {
  const n = nonce();
  const csp = `default-src 'none'; img-src ${webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'nonce-${n}';`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html, body {
      height: 100%;
      margin: 0;
      background: transparent;
      overflow: hidden;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Apple SD Gothic Neo";
    }
    /* stage: 오른쪽 패널 전체 */
    .stage {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }
    /* 슬라임 캔버스는 화면 전체를 쓰되, 실제 슬라임은 우측 하단 근처에만 등장 */
    #slime {
      position: absolute;
      inset: 0;
    }

    /* 텍스트 카드(보조 정보) - 너무 방해 안 되게 하단에 작은 카드 */
    .card {
      position: absolute;
      right: 14px;
      bottom: 14px;
      width: min(420px, calc(100vw - 28px));
      border-radius: 16px;
      background: rgba(20, 20, 24, 0.78);
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 12px 36px rgba(0,0,0,0.45);
      backdrop-filter: blur(10px);
      color: #fff;
      opacity: 0;
      transform: translateX(40px);
      transition: transform 220ms ease, opacity 220ms ease;
    }
    .card.show { opacity: 1; transform: translateX(0); }
    .top {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px 8px;
      font-weight: 900;
      letter-spacing: -0.2px;
    }
    .badge {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      flex: 0 0 auto;
    }
    .title { font-size: 13px; }
    .meta {
      padding: 0 14px 6px;
      font-size: 12px;
      opacity: 0.82;
      word-break: break-word;
    }
    .detail {
      padding: 0 14px 12px;
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
    <canvas id="slime"></canvas>

    <div id="card" class="card k-info">
      <div class="top"><span class="badge"></span><span id="title" class="title">Ready</span></div>
      <div id="meta" class="meta"></div>
      <div id="detail" class="detail"></div>
      <div class="bar"><div id="progress"></div></div>
    </div>
  </div>

  <script nonce="${n}">
    // ---------------------------
    // DOM
    // ---------------------------
    const canvas = document.getElementById("slime");
    const ctx = canvas.getContext("2d", { alpha: true });

    const card = document.getElementById("card");
    const title = document.getElementById("title");
    const meta = document.getElementById("meta");
    const detail = document.getElementById("detail");
    const progress = document.getElementById("progress");

    function resize() {
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    window.addEventListener("resize", resize);
    resize();

    // ---------------------------
    // Helpers
    // ---------------------------
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOutCubic = (t) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
    const rand = (a, b) => a + Math.random() * (b - a);

    // ---------------------------
    // Slime actor (toy 3D 느낌)
    // ---------------------------
    const slime = {
      // 화면 좌표(픽셀)
      x: 0,
      y: 0,
      // 기본 크기
      r: 56,
      // 스쿼시/스트레치
      sx: 1,
      sy: 1,
      // 표정
      mood: "idle", // idle | happy | proud | sad | shocked
      // 진행/상태머신
      phase: "idle", // idle | enter | act | exit
      t0: 0,
      // 이벤트 맵핑
      kind: "info",
      event: "manual",
      label: "",
      // 파티클
      particles: [],
      // 팝 텍스트
      pops: [],
    };

    function setKind(kind) {
      card.classList.remove("k-success","k-error","k-info");
      card.classList.add(kind === "error" ? "k-error" : kind === "success" ? "k-success" : "k-info");
    }

    function showCard(payload) {
      setKind(payload.kind || "info");
      title.textContent = payload.title || "Done";

      const b = payload.branch || "?";
      const u = payload.upstream || "?";
      meta.textContent = payload.repoPath ? \`\${payload.repoPath}  •  \${b} → \${u}\` : \`\${b} → \${u}\`;
      detail.textContent = payload.detail || "";

      // progress bar
      card.classList.add("show");
      progress.style.transition = "none";
      progress.style.width = "0%";
      requestAnimationFrame(() => {
        progress.style.transition = "width 1600ms linear";
        progress.style.width = "100%";
      });

      // 카드가 너무 오래 남지 않게 자연히 흐릿해짐(패널 dispose는 extension 쪽에서)
      setTimeout(() => card.classList.remove("show"), 1900);
    }

    function spawnSparkles(cx, cy, count, tint) {
      for (let i = 0; i < count; i++) {
        slime.particles.push({
          x: cx + rand(-12, 12),
          y: cy + rand(-12, 12),
          vx: rand(-1.2, 1.2),
          vy: rand(-2.8, -1.2),
          life: rand(18, 28),
          max: 28,
          size: rand(2, 4),
          tint
        });
      }
    }

    function popText(text, cx, cy, tint) {
      slime.pops.push({
        text,
        x: cx,
        y: cy,
        vy: -1.6,
        life: 34,
        max: 34,
        tint
      });
    }

    function setScenario(payload) {
      slime.kind = payload.kind || "info";
      slime.event = payload.event || "manual";

      // 기본 위치: 우측 하단 근처(바닥)
      const floorY = window.innerHeight - 84;
      slime.y = floorY;

      // enter: 화면 밖 오른쪽에서 기어오기
      slime.x = window.innerWidth + 140;

      // 기본 스케일
      slime.sx = 1; slime.sy = 1;

      // mood/label
      if (slime.kind === "error") {
        slime.mood = "sad";
      } else if (slime.event === "commit") {
        slime.mood = "proud";
      } else {
        slime.mood = "happy";
      }

      slime.label = (slime.event || "").toUpperCase();

      slime.phase = "enter";
      slime.t0 = performance.now();

      // clear effects
      slime.particles = [];
      slime.pops = [];
    }

    // ---------------------------
    // Draw routines
    // ---------------------------
    function drawSlime(x, y, r, sx, sy, mood, kind) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx, sy);

      // body base color
      const base = (kind === "error") ? "rgba(255, 90, 90, 0.92)" : (kind === "success" ? "rgba(90, 255, 170, 0.92)" : "rgba(120, 180, 255, 0.92)");

      // shadow on floor
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.scale(1.2, 0.45);
      ctx.beginPath();
      ctx.ellipse(0, r*0.95, r*0.95, r*0.55, 0, 0, Math.PI*2);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fill();
      ctx.restore();

      // body gradient (toy 3D)
      const g = ctx.createRadialGradient(-r*0.25, -r*0.35, r*0.2, 0, 0, r*1.25);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(0.25, base);
      g.addColorStop(1, "rgba(0,0,0,0.20)");

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI*2);
      ctx.fillStyle = g;
      ctx.fill();

      // glossy highlight
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(-r*0.25, -r*0.35, r*0.42, r*0.28, -0.2, 0, Math.PI*2);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.globalAlpha = 1;

      // eyes
      const eyeY = -r*0.12;
      const eyeX = r*0.22;
      ctx.fillStyle = "rgba(10,10,12,0.92)";
      ctx.beginPath(); ctx.arc(-eyeX, eyeY, r*0.10, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( eyeX, eyeY, r*0.10, 0, Math.PI*2); ctx.fill();

      // eye shine
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(-eyeX - r*0.03, eyeY - r*0.03, r*0.03, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( eyeX - r*0.03, eyeY - r*0.03, r*0.03, 0, Math.PI*2); ctx.fill();

      // mouth (mood)
      ctx.strokeStyle = "rgba(10,10,12,0.88)";
      ctx.lineWidth = Math.max(2, r*0.06);
      ctx.lineCap = "round";

      ctx.beginPath();
      if (mood === "happy" || mood === "proud") {
        ctx.arc(0, r*0.05, r*0.20, 0.15*Math.PI, 0.85*Math.PI);
      } else if (mood === "sad") {
        ctx.arc(0, r*0.22, r*0.18, 1.15*Math.PI, 1.85*Math.PI);
      } else {
        // shocked
        ctx.ellipse(0, r*0.10, r*0.10, r*0.14, 0, 0, Math.PI*2);
      }
      ctx.stroke();

      // blush for happy
      if (mood === "happy" || mood === "proud") {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "rgba(255,110,160,0.95)";
        ctx.beginPath(); ctx.ellipse(-r*0.32, r*0.02, r*0.16, r*0.11, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse( r*0.32, r*0.02, r*0.16, r*0.11, 0, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }

    function drawParticles() {
      for (const p of slime.particles) {
        const t = p.life / p.max;
        ctx.globalAlpha = clamp(t, 0, 1);
        ctx.fillStyle = p.tint;
        ctx.beginPath();
        // simple sparkle: diamond
        ctx.moveTo(p.x, p.y - p.size);
        ctx.lineTo(p.x + p.size, p.y);
        ctx.lineTo(p.x, p.y + p.size);
        ctx.lineTo(p.x - p.size, p.y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function drawPops() {
      for (const p of slime.pops) {
        const t = p.life / p.max;
        ctx.globalAlpha = clamp(t, 0, 1);
        ctx.font = "900 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
        ctx.fillStyle = p.tint;
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      }
    }

    // ---------------------------
    // Animation loop
    // ---------------------------
    function update(now) {
      const w = window.innerWidth;
      const floorY = window.innerHeight - 84;

      // clear
      ctx.clearRect(0, 0, w, window.innerHeight);

      // phase machine
      const t = now - slime.t0;

      if (slime.phase === "idle") {
        // nothing
      }

      if (slime.phase === "enter") {
        // 0~700ms: crawl in from right
        const dur = 700;
        const tt = clamp(t / dur, 0, 1);
        const e = easeOutCubic(tt);

        const targetX = w - 170;     // 우측 하단 근처
        slime.x = lerp(w + 140, targetX, e);
        slime.y = floorY;

        // crawling squash
        slime.sx = 1.15 - 0.20 * Math.sin(tt * Math.PI);
        slime.sy = 0.90 + 0.18 * Math.sin(tt * Math.PI);

        if (tt >= 1) {
          slime.phase = "act";
          slime.t0 = now;
        }
      }

      if (slime.phase === "act") {
        // scenario by kind/event
        if (slime.kind === "error") {
          // 0~250ms shake, then droop
          const dur = 900;
          const tt = clamp(t / dur, 0, 1);

          const shake = (tt < 0.35) ? Math.sin(tt * 40) * 10 : 0;
          slime.x += shake;

          // droop
          slime.sx = lerp(1.05, 1.25, easeInOutCubic(clamp((tt - 0.25)/0.75,0,1)));
          slime.sy = lerp(0.95, 0.75, easeInOutCubic(clamp((tt - 0.25)/0.75,0,1)));

          if (tt > 0.25 && slime.particles.length === 0) {
            popText("X", slime.x + 16, slime.y - 66, "rgba(255,90,90,0.95)");
          }

          if (tt >= 1) {
            slime.phase = "exit";
            slime.t0 = now;
          }
        } else if (slime.event === "commit") {
          // commit: stamp action
          const dur = 1050;
          const tt = clamp(t / dur, 0, 1);

          // 0~0.45 squash down, 0.45~0.75 stamp pop, 0.75~1 settle
          if (tt < 0.45) {
            const e = easeInOutCubic(tt / 0.45);
            slime.sx = lerp(1.00, 1.35, e);
            slime.sy = lerp(1.00, 0.70, e);
          } else if (tt < 0.75) {
            const e = easeOutCubic((tt - 0.45) / 0.30);
            slime.sx = lerp(1.35, 0.92, e);
            slime.sy = lerp(0.70, 1.18, e);

            if (slime.particles.length === 0) {
              spawnSparkles(slime.x, slime.y - 56, 16, "rgba(255,255,255,0.92)");
              popText("COMMIT!", slime.x - 48, slime.y - 92, "rgba(255,255,255,0.92)");
            }
          } else {
            const e = easeInOutCubic((tt - 0.75) / 0.25);
            slime.sx = lerp(0.92, 1.05, e);
            slime.sy = lerp(1.18, 0.98, e);
          }

          if (tt >= 1) {
            slime.phase = "exit";
            slime.t0 = now;
          }
        } else {
          // success push/pull: bounce + sparkles
          const dur = 950;
          const tt = clamp(t / dur, 0, 1);

          // bounce
          const b = Math.sin(tt * Math.PI) * 18;
          slime.y = floorY - b;

          slime.sx = 1.02 + 0.10 * Math.sin(tt * Math.PI);
          slime.sy = 0.98 + 0.16 * Math.sin(tt * Math.PI);

          if (tt > 0.15 && slime.particles.length === 0) {
            spawnSparkles(slime.x, slime.y - 58, 18, "rgba(255,255,255,0.90)");
          }

          if (tt >= 1) {
            slime.phase = "exit";
            slime.t0 = now;
          }
        }
      }

      if (slime.phase === "exit") {
        // 살짝 오른쪽으로 물러나며 페이드 아웃 느낌
        const dur = 520;
        const tt = clamp(t / dur, 0, 1);
        const e = easeInOutCubic(tt);

        slime.x = slime.x + e * 120;
        slime.sx = lerp(slime.sx, 0.92, e);
        slime.sy = lerp(slime.sy, 0.92, e);

        if (tt >= 1) {
          slime.phase = "idle";
        }
      }

      // update particles
      for (const p of slime.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.life -= 1;
      }
      slime.particles = slime.particles.filter(p => p.life > 0);

      // update pops
      for (const p of slime.pops) {
        p.y += p.vy;
        p.life -= 1;
      }
      slime.pops = slime.pops.filter(p => p.life > 0);

      // render order: particles behind? (원하면 변경 가능)
      drawParticles();
      drawSlime(slime.x, slime.y, slime.r, slime.sx, slime.sy, slime.mood, slime.kind);
      drawPops();

      requestAnimationFrame(update);
    }
    requestAnimationFrame(update);

    // ---------------------------
    // Message handler
    // ---------------------------
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.type !== "effect") return;

      const payload = data.payload || {};
      showCard(payload);
      setScenario(payload);
    });
  </script>
</body>
</html>`;
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

      // ---- Accurate-mode commands (repo는 실행 시점 resolve) ----
      context.subscriptions.push(
        vscode.commands.registerCommand("git-effects.push", async () => {
          const repo = resolveRepo(git, out);
          if (!repo) return vscode.window.showWarningMessage("Git repository를 찾지 못했습니다.");
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
            detail: res.ok ? "git push completed" : shortenReason(res.stderr || res.stdout),
          });
        })
      );

      context.subscriptions.push(
        vscode.commands.registerCommand("git-effects.pull", async () => {
          const repo = resolveRepo(git, out);
          if (!repo) return vscode.window.showWarningMessage("Git repository를 찾지 못했습니다.");
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
            detail: res.ok ? "git pull completed" : shortenReason(res.stderr || res.stdout),
          });
        })
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
          fireEffect(out, {
            kind: res.ok ? "success" : "error",
            event: "commit",
            repoPath: repo.rootUri.fsPath,
            branch: hi.branch,
            upstream: hi.upstream,
            title: res.ok ? "Commit 완료 ✅" : "Commit 실패 ❌",
            detail: res.ok ? msg : shortenReason(res.stderr || res.stdout),
          });
        })
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

            if (autoCommit && cur.commit && prev.commit && cur.commit !== prev.commit && prev.dirty && !cur.dirty) {
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
      context.subscriptions.push({ dispose: () => timer && clearTimeout(timer) });

      out.appendLine("auto-detect started (repo-wise)");
    },
    (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      out.appendLine(`[ERR] vscode.git activate failed: ${msg}`);
      vscode.window.showErrorMessage(`vscode.git activate failed: ${msg}`);
    }
  );

  out.appendLine("=== activate() end ===");
}

export function deactivate() {}