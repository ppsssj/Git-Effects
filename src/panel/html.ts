import * as vscode from "vscode";

export function getHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  opts?: { characterId?: string },
) {
  const ctx = context;
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

  // model files (media/models/<characterId>/model.{obj,mtl} + Textures/*)
  const characterId = (opts?.characterId || "character-male-d").trim();
  const modelDir = vscode.Uri.joinPath(
    ctx.extensionUri,
    "media",
    "models",
    characterId,
  );

  // Loader base path (folder of model.obj/model.mtl)
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
    /* 개발자 모드에서 패널이 뜨면 바로 캐릭터가 보이는 문제 방지: 기본은 숨김 */
    #c{position:absolute;inset:0;opacity:0;transform:translateX(40px);transition:transform 220ms ease, opacity 220ms ease;}
    body.show #c{opacity:1;transform:translateX(0)}
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

    console.log("[git-effects] webview script boot");
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
      document.body.classList.add('show');
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
      setTimeout(() => {
        hud.classList.remove('show');
        document.body.classList.remove('show');
      }, 1900);
    }

    const canvas = document.getElementById('c');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
    renderer.setPixelRatio(Math.max(1, window.devicePixelRatio || 1));

    const scene = new THREE.Scene();

    // IMPORTANT: must be declared BEFORE any function that references them (resize/tick)
    let model = null;
    let followTarget = new THREE.Vector3(0, 0, 0);
    let hasTarget = false;

    // NOTE: Camera is dynamically re-framed after the model loads.
    // Keep a sane default so the scene isn't blank during the first frame.
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(0, 1.1, 3.0);
    camera.lookAt(0, 0.35, 0);
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

      if (hasTarget) camera.lookAt(followTarget);
    }
    window.addEventListener('resize', resize);
    resize();

    function frameObjectToCamera(obj, camera, {
      fitOffset = 1.25,                        // 1.1~1.5 추천
      viewDir = new THREE.Vector3(0, 0.10, 1), // y 낮추면 카메라가 "더 내려감"
      targetYOffset = 0.0                      // 모델이 바닥쪽이면 -값 추천
    } = {}) {
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      box.getSize(size);

      // 빈 오브젝트/로드 실패 방어
      if (!isFinite(size.x) || !isFinite(size.y) || !isFinite(size.z) || size.length() === 0) {
        return null;
      }

      const center = new THREE.Vector3();
      box.getCenter(center);
      center.y += targetYOffset;

      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);

      const fov = THREE.MathUtils.degToRad(camera.fov);
      const dist = (sphere.radius * fitOffset) / Math.sin(fov / 2);

      const dir = viewDir.clone().normalize();
      const pos = center.clone().add(dir.multiplyScalar(dist));

      camera.position.copy(pos);
      camera.near = Math.max(0.01, dist - sphere.radius * 4);
      camera.far  = dist + sphere.radius * 4;
      camera.updateProjectionMatrix();

      followTarget.copy(center);
      hasTarget = true;
      camera.lookAt(followTarget);

      return { center, sphere, dist };
    }

    // ===== Action System (A: static OBJ reactions) =====
    // NOTE: Must be in the top-level scope of the webview script.
    // If declared inside loadModel(), tick() can't see it and you'll get:
    //   ReferenceError: base is not defined
    const ActionType = {
      IDLE: "idle",
      COMMIT: "commit",
      PUSH_OK: "pushOk",
      ERROR: "error",
    };

    let base = null; // { pos, rot, scale }

    function setBaseFromModel(m){
      base = {
        pos: m.position.clone(),
        rot: m.rotation.clone(),
        scale: m.scale.clone(),
      };
    }

    async function loadModel(){
      const mtlLoader = new MTLLoader();
      mtlLoader.setResourcePath("${modelBase}");
      if (typeof mtlLoader.setPath === "function") mtlLoader.setPath("${modelBase}");
      const materials = await mtlLoader.loadAsync("model.mtl");
      materials.preload();

      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.setPath("${modelBase}");
      model = await objLoader.loadAsync("model.obj");
      // --- Robust placement ---
      // 1) Center the model to origin (prevents camera framing from being off)
      const box0 = new THREE.Box3().setFromObject(model);
      const center0 = box0.getCenter(new THREE.Vector3());
      model.position.sub(center0);

      // 2) Put the model's feet on the ground plane (y = -0.95)
      //    This is safer than hard-setting model.position.y, because different OBJ exports
      //    can have different pivots.
      const box1 = new THREE.Box3().setFromObject(model);
      const minY = box1.min.y;
      const groundY = -0.95;
      model.position.y += (groundY - minY);

      model.rotation.y = 0;
      model.scale.setScalar(1.25);
      scene.add(model);

      // 모델 로드 성공 후 딱 1번 (tick()에서 base 기준으로 모션 계산)
      setBaseFromModel(model);
      // ✅ Auto-frame the camera based on the true bounding box.
      // If you still can't see the character, increase fitOffset to ~1.45.
      frameObjectToCamera(model, camera, {
        fitOffset: 1.30,
        viewDir: new THREE.Vector3(0, 0.18, 1),
        targetYOffset: 0.10,
      });
    }

    loadModel().catch((err) => {
      title.textContent = 'Model load failed';
      detail.textContent = String(err?.message || err);
      hud.classList.add('show');
    });

    // ===== Runtime Animation State =====
    // Keep the existing enter/exit slide so the panel still "arrives".
    // The "act" phase differs per situation (Commit / Push success / Error).
    const state = {
      phase: 'idle',
      t0: performance.now(),
      kind: 'info',
      event: 'manual',
      actMs: 900,
    };

    function startAnim(kind, event){
      state.kind = kind || 'info';
      state.event = event || 'manual';

      // Priority: error kind always uses fail signature.
      if (state.kind === 'error') state.actMs = 1700;            // 1.4~1.8s
      else if (state.event === 'commit') state.actMs = 780;      // 0.6~0.9s
      else if (state.event === 'push') state.actMs = 1450;       // 1.2~1.6s
      else state.actMs = 950;                                    // default

      state.phase = 'enter';
      state.t0 = performance.now();
    }

    function clamp01(x){ return Math.min(1, Math.max(0, x)); }
    function lerp(a,b,t){ return a + (b-a)*t; }
    function easeOutCubic(t){ t = clamp01(t); return 1 - Math.pow(1-t, 3); }
    function easeInOutSine(t){ t = clamp01(t); return -(Math.cos(Math.PI*t) - 1) / 2; }
    function smoothstep(e0, e1, x){
      const t = clamp01((x - e0) / (e1 - e0));
      return t * t * (3 - 2 * t);
    }

    function tick(now){
      requestAnimationFrame(tick);
      if (!model) { renderer.render(scene, camera); return; }
      const t = now - state.t0;

      // Always start from the base transform to prevent drift.
      if (base){
        model.position.copy(base.pos);
        model.rotation.set(base.rot.x, base.rot.y, base.rot.z);
        model.scale.copy(base.scale);
      }

      if (state.phase === 'enter'){
        const tt = clamp01(t / 520);
        const e = easeOutCubic(tt);
        model.position.x = lerp(2.2, base?.pos.x ?? 0.0, e);
        model.rotation.z += Math.sin(tt * Math.PI * 2) * 0.05;
        model.scale.y *= (1.0 - Math.sin(tt * Math.PI) * 0.04);
        if (tt >= 1){ state.phase = 'act'; state.t0 = now; }
      } else if (state.phase === 'act'){
        const tt = clamp01(t / state.actMs);

        // ---- Error / Fail signature ----
        if (state.kind === 'error'){
          // Step back quickly, then shake "no" + slight crouch/shrink.
          const step = easeOutCubic(clamp01(tt / 0.35));
          model.position.z += lerp(0.0, -0.18, step);

          const env = smoothstep(0.08, 0.22, tt) * (1 - smoothstep(0.86, 1.0, tt));
          const shake = Math.sin(tt * Math.PI * 14) * 0.14 * env;
          model.rotation.y += shake;
          model.position.x += Math.sin(tt * Math.PI * 14) * 0.07 * env;

          const shrink = easeOutCubic(tt);
          model.scale.y *= lerp(1.0, 0.82, shrink);
          model.scale.x *= lerp(1.0, 0.92, shrink);
          model.scale.z *= lerp(1.0, 0.92, shrink);
          model.position.y += lerp(0.0, -0.07, shrink);

          if (tt >= 1){ state.phase = 'exit'; state.t0 = now; }
        }

        // ---- Commit: nod twice + very short forward "툭" ----
        else if (state.event === 'commit'){
          const env = Math.sin(Math.PI * tt); // 0..1..0
          const nod = -Math.sin(tt * Math.PI * 4) * 0.12 * env; // 2 nods
          model.rotation.x += nod;

          // Forward impulse (towards camera = +z) with a tiny recoil.
          const fwd1 = 0.16 * Math.exp(-Math.pow((tt - 0.18) / 0.11, 2));
          const fwd2 = -0.04 * Math.exp(-Math.pow((tt - 0.40) / 0.10, 2));
          model.position.z += (fwd1 + fwd2);

          // Small squash on the "check".
          model.scale.y *= (1.0 - 0.06 * env);
          model.scale.x *= (1.0 + 0.03 * env);
          model.scale.z *= (1.0 + 0.03 * env);

          if (tt >= 1){ state.phase = 'exit'; state.t0 = now; }
        }

        // ---- Push Success: jump + landing bounce + 180~360 spin ----
        else if (state.event === 'push'){
          const spin = THREE.MathUtils.degToRad(320); // ~320°
          model.rotation.y += spin * easeOutCubic(tt);

          const landT = 0.62;
          if (tt <= landT){
            const jt = tt / landT;
            model.position.y += Math.sin(Math.PI * jt) * 0.34; // jump
            // air stretch
            model.scale.y *= (1.0 + 0.06 * Math.sin(Math.PI * jt));
            model.scale.x *= (1.0 - 0.03 * Math.sin(Math.PI * jt));
            model.scale.z *= (1.0 - 0.03 * Math.sin(Math.PI * jt));
          } else {
            const bt = (tt - landT) / (1 - landT);
            const damp = Math.exp(-4.2 * bt);
            const bounce = Math.sin(bt * Math.PI * 6) * 0.10 * damp;
            model.position.y += bounce;

            // landing squash
            const squash = Math.max(0, Math.sin(bt * Math.PI)) * damp;
            model.scale.y *= (1.0 - 0.10 * squash);
            model.scale.x *= (1.0 + 0.06 * squash);
            model.scale.z *= (1.0 + 0.06 * squash);
          }

          if (tt >= 1){ state.phase = 'exit'; state.t0 = now; }
        }

        // ---- Default / Pull / Manual: subtle pop ----
        else {
          const env = Math.sin(Math.PI * tt);
          model.position.y += env * 0.10;
          model.rotation.x += -env * 0.08;
          if (tt >= 1){ state.phase = 'exit'; state.t0 = now; }
        }
      } else if (state.phase === 'exit'){
        const tt = clamp01(t / 480);
        const e = easeInOutSine(tt);
        model.position.x = lerp(base?.pos.x ?? 0.0, 2.2, e);
        model.rotation.z *= (1-tt);
        if (tt >= 1){ state.phase = 'idle'; }
      }
if (hasTarget) camera.lookAt(followTarget);
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

export function getCharacterPickerHtml(
  webview: vscode.Webview,
  _context: vscode.ExtensionContext,
  args: { selected: string },
) {
  const n = nonce();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${n}' ${webview.cspSource}`,
  ].join("; ");

  const initialSelected = String(args.selected || "character-male-d");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Git-Effects Character</title>
    <style>
      :root{
        --bg: var(--vscode-editor-background);
        --fg: var(--vscode-foreground);
        --muted: var(--vscode-descriptionForeground);
        --border: var(--vscode-panel-border);
        --card: var(--vscode-sideBar-background);
        --input: var(--vscode-input-background);
        --inputBorder: var(--vscode-input-border);
        --btn: var(--vscode-button-background);
        --btnFg: var(--vscode-button-foreground);
        --btnHover: var(--vscode-button-hoverBackground);
        --focus: var(--vscode-focusBorder);
        --chipBg: var(--vscode-badge-background);
        --chipFg: var(--vscode-badge-foreground);
      }
      *{box-sizing:border-box}
      html,body{height:100%}
      body{
        margin:0;
        background:var(--bg);
        color:var(--fg);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;
      }
      .wrap{min-height:100%;display:flex;flex-direction:column}
      header{
        position:sticky;top:0;z-index:10;
        background:color-mix(in srgb, var(--bg) 88%, transparent);
        backdrop-filter: blur(8px);
        border-bottom:1px solid var(--border);
        padding:14px 14px 10px;
      }
      .row{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .brand{display:flex;align-items:center;gap:10px;min-width:0}
      .logo{width:26px;height:26px;border-radius:999px;background:var(--btn);display:grid;place-items:center;color:var(--btnFg);font-weight:800}
      .app{font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .actions{display:flex;gap:6px}
      .iconBtn{border:1px solid transparent;background:transparent;color:var(--muted);border-radius:10px;padding:6px;cursor:pointer}
      .iconBtn:hover{background:color-mix(in srgb, var(--card) 75%, transparent);color:var(--fg)}
      h1{margin:10px 0 2px;font-size:20px;letter-spacing:-0.2px}
      .sub{margin:0;color:var(--muted);font-size:12px}

      .controls{padding:12px 14px 0;display:flex;flex-direction:column;gap:10px}
      .search{
        display:flex;align-items:center;gap:8px;
        background:var(--input);
        border:1px solid var(--inputBorder, var(--border));
        border-radius:10px;
        padding:8px 10px;
      }
      .search input{flex:1;border:0;outline:0;background:transparent;color:var(--fg);font-size:13px}
      .chips{display:flex;gap:8px;overflow:auto;padding-bottom:2px}
      .chip{
        border:1px solid var(--border);
        background:transparent;
        color:var(--muted);
        border-radius:999px;
        padding:6px 10px;
        font-size:12px;
        font-weight:650;
        cursor:pointer;
        white-space:nowrap;
      }
      .chip.active{background:var(--btn);border-color:var(--btn);color:var(--btnFg)}
      .metaRow{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}

      main{flex:1;padding:12px 14px 14px;overflow:auto}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      @media (max-width:520px){.grid{grid-template-columns:1fr}}
      .card{
        background:color-mix(in srgb, var(--card) 88%, transparent);
        border:1px solid var(--border);
        border-radius:14px;
        padding:12px;
        display:flex;
        flex-direction:column;
        gap:10px;
        min-height:250px;
        position:relative;
      }
      .card:hover{border-color:color-mix(in srgb, var(--focus) 50%, var(--border))}
      .card.selected{border:2px solid var(--focus);box-shadow:0 0 0 4px color-mix(in srgb, var(--focus) 18%, transparent)}
      .check{position:absolute;top:10px;right:10px;width:18px;height:18px;border-radius:999px;background:var(--focus);display:none;place-items:center;color:#fff;font-size:12px;font-weight:900}
      .card.selected .check{display:grid}
      .preview{flex:1;border-radius:12px;background:color-mix(in srgb, var(--bg) 80%, transparent);border:1px solid color-mix(in srgb, var(--border) 70%, transparent);display:grid;place-items:center;overflow:hidden}
      .shape{width:64px;height:64px;opacity:.9}
      .shape.circle{border-radius:999px;background:linear-gradient(135deg,color-mix(in srgb,var(--btn) 80%,#6ea9ff),#6ea9ff)}
      .shape.rounded{border-radius:16px;background:linear-gradient(135deg,#b66bff,#ff79c6);transform:rotate(12deg)}
      .shape.capsule{width:68px;height:44px;border-radius:999px;background:linear-gradient(180deg,#4ade80,#10b981)}
      .shape.square{border-radius:10px;background:linear-gradient(135deg,#fb923c,#ef4444)}

      .name{font-weight:800;font-size:14px;margin:0}
      .tags{display:flex;flex-wrap:wrap;gap:6px}
      .tag{font-size:10px;font-weight:800;border-radius:999px;padding:3px 7px;border:1px solid color-mix(in srgb,var(--border) 70%,transparent);color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
      .tag.accent{background:color-mix(in srgb,var(--btn) 18%,transparent);border-color:color-mix(in srgb,var(--btn) 38%,transparent);color:color-mix(in srgb,var(--btn) 90%,var(--fg))}

      .btn{width:100%;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:850;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--fg)}
      .btn.primary{background:var(--btn);border-color:var(--btn);color:var(--btnFg)}
      .btn.primary:hover{background:var(--btnHover)}
      .btn.ghost{border-color:color-mix(in srgb,var(--btn) 60%,var(--border));color:color-mix(in srgb,var(--btn) 90%,var(--fg))}
      .btn.ghost:hover{background:color-mix(in srgb,var(--btn) 10%,transparent)}
      .btn.disabled{opacity:.55;cursor:default}

      footer{border-top:1px solid var(--border);padding:12px 14px;background:color-mix(in srgb,var(--bg) 86%,transparent)}
      .footTop{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .current{display:flex;align-items:center;gap:8px;font-size:12px}
      .pill{background:var(--chipBg);color:var(--chipFg);padding:3px 8px;border-radius:999px;font-weight:800;font-size:11px}
      .hint{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px}
      .links{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--border) 65%,transparent)}
      a{color:color-mix(in srgb,var(--btn) 95%,var(--fg));text-decoration:none;font-weight:650;font-size:12px}
      a:hover{text-decoration:underline}
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div class="row">
          <div class="brand">
            <div class="logo">G</div>
            <div class="app">Git-Effects</div>
          </div>
          <div class="actions">
            <button class="iconBtn" id="btnSettings" title="Settings">⚙</button>
            <button class="iconBtn" id="btnClose" title="Close">✕</button>
          </div>
        </div>
        <h1>Character</h1>
        <p class="sub">Choose a character for Git actions</p>
      </header>

      <section class="controls">
        <div class="search">
          <span style="color:var(--muted)">⌕</span>
          <input id="q" type="text" placeholder="Search characters..." />
        </div>
        <div class="chips" role="tablist">
          <button class="chip active" data-filter="all">All</button>
          <button class="chip" data-filter="free">Free</button>
          <button class="chip" data-filter="installed">Installed</button>
          <button class="chip" data-filter="animated">Animated</button>
        </div>
        <div class="metaRow">
          <span>Characters</span>
          <span title="Not implemented">Sort: Default ▾</span>
        </div>
      </section>

      <main>
        <div id="grid" class="grid"></div>
      </main>

      <footer>
        <div class="footTop">
          <div class="current">
            <span style="color:var(--muted);font-weight:800">Current:</span>
            <span id="current" class="pill">${escapeHtml(initialSelected)}</span>
          </div>
          <div class="hint"><span>ℹ</span><span>Changes apply instantly</span></div>
        </div>
        <div class="links">
          <a href="#" id="docLink">Documentation ↗</a>
          <a href="#" id="learnLink">Learn more</a>
        </div>
      </footer>
    </div>

    <script nonce="${n}">
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ type: 'getCharacters' });

      let data = [];

      const state = {
        selected: ${JSON.stringify(initialSelected)},
        filter: 'all',
        query: '',
      };
      function hashCode(str){
        let h = 0;
        for (let i = 0; i < str.length; i++){
          h = ((h << 5) - h) + str.charCodeAt(i);
          h |= 0;
        }
        return h;
      }
      const grid = document.getElementById('grid');
      const q = document.getElementById('q');
      const current = document.getElementById('current');

      function matchesFilter(_item){
        // 현재는 폴더 스캔 기반 목록이라 price/installed/animated 정보가 없음
        // → 필터 UI는 유지하되, 일단 전체 통과
        return true;
      }      

      function matchesQuery(item){
        const x = (state.query || '').trim().toLowerCase();
        if (!x) return true;
        const name = (item.name || item.id || '').toLowerCase();
        const id = (item.id || '').toLowerCase();
        return name.includes(x) || id.includes(x);      
      }

      function render(){
  const items = data.filter(d => matchesFilter(d) && matchesQuery(d));
  grid.innerHTML = '';

  for (const it of items){
    const card = document.createElement('div');
    card.className = 'card' + (it.id === state.selected ? ' selected' : '');
    card.setAttribute('data-id', it.id);

    const check = document.createElement('div');
    check.className = 'check';
    check.textContent = '✓';
    card.appendChild(check);

    // ✅ Preview (thumbnailUri 있으면 model.png 보여주기)
    const preview = document.createElement('div');
    preview.className = 'preview';

    if (it.thumbnailUri) {
      const img = document.createElement('img');
      img.src = it.thumbnailUri;
      img.alt = it.name || it.id;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.padding = '14px';
      img.style.userSelect = 'none';
      img.draggable = false;
      preview.appendChild(img);
    } else {
      // fallback: 기존 도형
      const shape = document.createElement('div');
      const shapes = ['circle','rounded','capsule','square'];
      const idx = Math.abs(hashCode(it.id)) % shapes.length;
      shape.className = 'shape ' + shapes[idx];
      preview.appendChild(shape);
    }

    card.appendChild(preview);

    const meta = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'name';
    name.textContent = it.name || it.id;

    const tags = document.createElement('div');
    tags.className = 'tags';
    const tagList = Array.isArray(it.tags) ? it.tags : [];
    for (const t of tagList){
      const tag = document.createElement('span');
      tag.className = 'tag' + (String(t).toLowerCase() === 'active' ? ' accent' : '');
      tag.textContent = t;
      tags.appendChild(tag);
    }

    meta.appendChild(name);
    meta.appendChild(tags);
    card.appendChild(meta);

    const btn = document.createElement('button');
    btn.className = 'btn';
    if (it.id === state.selected){
      btn.classList.add('disabled');
      btn.textContent = 'Selected';
      btn.disabled = true;
    } else {
      btn.classList.add('primary');
      btn.textContent = 'Apply';
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      vscode.postMessage({ type: 'applyCharacter', id: it.id });
      // UX: 즉시 선택 반영
      state.selected = it.id;
      current.textContent = it.id;
      render();
    });

    card.addEventListener('click', () => {
      state.selected = it.id;
      current.textContent = it.id;
      render();
    });

    card.appendChild(btn);
    grid.appendChild(card);
  }
}
      for (const el of document.querySelectorAll('.chip')){
        el.addEventListener('click', () => {
          for (const x of document.querySelectorAll('.chip')) x.classList.remove('active');
          el.classList.add('active');
          state.filter = el.getAttribute('data-filter') || 'all';
          render();
        });
      }

      q.addEventListener('input', () => {
        state.query = q.value;
        render();
      });

      document.getElementById('btnClose').addEventListener('click', () => {
        vscode.postMessage({ type: 'close' });
        try { window.close(); } catch {}
      });
      document.getElementById('btnSettings').addEventListener('click', () => {
        vscode.postMessage({ type: 'openSettings' });
      });

      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'state'){
          state.selected = (msg.selected || 'character-male-d');
          current.textContent = state.selected;
          render();
          return;
        }

        if (msg.type === 'characters'){
          // msg.items: [{ id, name, tags? }, ...]
          data = Array.isArray(msg.items) ? msg.items : [];
          // 현재 선택이 리스트에 없으면 첫 번째로 보정
          if (data.length > 0 && !data.some(x => x.id === state.selected)) {
            state.selected = data[0].id;
            current.textContent = state.selected;
          }
          render();
          return;
        }
      });

      render();
      vscode.postMessage({ type: 'ready' });
    </script>
  </body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nonce() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++)
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
