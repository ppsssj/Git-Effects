<p align="center">
  <img src="assets/icon.png" alt="git-Effects logo" width="200" />
</p>

<h1 align="center">git-Effects</h1>

<p align="center">
  VS Code에서 Git 작업 결과(push/pull/commit)를 <b>슬라이드 인(aside panel) 이펙트</b>로 보여주는 확장(Extension)
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ppsssj.git-effects">VS Code Marketplace</a> •
  <a href="https://github.com/ppsssj/git-Effects">GitHub</a> •
  <a href="#demo">Demo</a> •
  <a href="#features">Features</a> •
  <a href="#install">Install</a> •
  <a href="#quick-start-dev">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#settings">Settings</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#troubleshooting">Troubleshooting</a> •
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ppsssj.git-effects">
    <img alt="VS Code Marketplace Version" src="https://img.shields.io/visual-studio-marketplace/v/ppsssj.git-effects" />
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=ppsssj.git-effects">
    <img alt="VS Code Marketplace Installs" src="https://img.shields.io/visual-studio-marketplace/i/ppsssj.git-effects" />
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=ppsssj.git-effects">
    <img alt="VS Code Marketplace Rating" src="https://img.shields.io/visual-studio-marketplace/r/ppsssj.git-effects" />
  </a>
</p>

---

## VS Code Marketplace

- Install: https://marketplace.visualstudio.com/items?itemName=ppsssj.git-effects
- Publisher: `ppsssj`
- Extension ID: `ppsssj.git-effects`

> **Compatibility**  
> 설치가 안 된다면, 사용 중인 VS Code 버전이 확장 최소 지원 버전보다 낮을 가능성이 큽니다.  
> (예: “현재 버전과 호환되지 않음” 팝업)

---

## Release / Publish Log

- **v0.0.1 (2026-02-23)** — First public release on VS Code Marketplace  
  - Marketplace: https://marketplace.visualstudio.com/items?itemName=ppsssj.git-effects  
  - What’s included:
    - Git Push/Pull/Commit 결과를 Webview 패널 이펙트로 시각화
    - Manual trigger commands + Auto-detect(polling) 지원

---

## Demo

> 실제 실행 영상(GIF) — Commit / Push

### Commit
<p align="center">
  <img src="assets/demo/commit_demo.gif" alt="git-Effects commit demo" width="900" />
</p>

### Push
<p align="center">
  <img src="assets/demo/push_demo.gif" alt="git-Effects push demo" width="900" />
</p>

---

## Why git-Effects?

VS Code에서 `git push / pull / commit` 결과는 대부분 **터미널 텍스트 로그**로만 확인됩니다.  
git-Effects는 결과를 **시각적 피드백(이펙트/캐릭터)** 으로 바꿔서:

- 성공/실패를 더 빠르게 인지
- 개발 흐름(Flow)을 끊지 않음 (패널은 `preserveFocus`)
- “성공/실패”를 명확히 분리한 UX 제공

---

## Features

- 오른쪽 패널(Beside) Webview에 **slide-in** 이펙트 표시
- 포커스 뺏지 않음: `preserveFocus: true`
- 일정 시간 후 자동 종료(`auto-hide` / `dispose`)
- 상태별 메시지 분리
  - `success`: 성공 이펙트
  - `error`: 실패 이펙트 (stderr 요약)
  - `info`: 안내/수동 트리거

---

## Supported Workflows

git-Effects는 2가지 트리거 경로를 가집니다.

### 1) Extension Commands (권장: 성공/실패 모두 안정적으로 처리)

- 확장 커맨드가 내부에서 `git` CLI를 실행하고(stdout/stderr) 결과를 Webview로 전달합니다.
- 실패도 안정적으로 잡을 수 있습니다.

✅ 장점: 성공/실패 모두 1:1 대응  
⚠️ 단점: 사용자가 커맨드로 실행해야 함

### 2) Auto Detect (선택: “성공 추정” 중심)

- repo 상태 변화(ahead/behind/dirty/HEAD 변화)를 기준으로 “성공처럼 보이는 사건”을 추정합니다.
- 실패는 상태 변화가 없을 수 있어 감지가 어렵습니다.

✅ 장점: 터미널에서 실행해도 성공이면 감지될 수 있음  
⚠️ 단점: 실패를 정확히 잡기 어려움(기본적으로 성공 UX 중심)

---

## Install

### Marketplace에서 설치
1. VS Code → Extensions 탭
2. `git-effects` 검색
3. 설치

또는 링크:
- https://marketplace.visualstudio.com/items?itemName=ppsssj.git-effects

### VSIX로 설치(오프라인/검색이 안 될 때)
1. `git-effects-0.0.1.vsix` 다운로드(또는 릴리즈/빌드 산출물)
2. VS Code → Extensions 탭 → `...` → **Install from VSIX...**
3. `.vsix` 선택 후 설치

---

## Quick Start (Dev)

> Extension Development Host에서 실행(개발용)

### 1) 설치/실행

```bash
git clone https://github.com/ppsssj/git-Effects.git
cd git-Effects
npm install
```

VS Code에서 프로젝트 열기 → `F5` → Extension Development Host 실행

### 2) 동작 확인

Extension Development Host에서:

- `Ctrl+Shift+P` → `Git Effects: Push (accurate mode)` 실행
- 성공/실패에 따라 Webview 패널 이펙트가 뜨는지 확인

---

## Commands

Command Palette(`Ctrl+Shift+P`)에서 아래를 실행합니다.

- `Git Effects: Manual Effect`
- `Git Effects: Push (accurate mode)`
- `Git Effects: Pull (accurate mode)`
- `Git Effects: Commit (accurate mode)`

> **중요:** 터미널에서 `git push`를 직접 실행하면, 확장이 그 프로세스를 “가로채지” 않습니다.  
> 성공/실패 이펙트를 확실하게 보려면 확장 커맨드를 사용하세요.

---

## Settings

`settings.json`에서 아래 옵션을 설정할 수 있습니다.

| Key | Type | Default | Description |
|---|---:|---:|---|
| `gitEffects.enabled` | boolean | `true` | Git Effects UI 사용 여부 |
| `gitEffects.pollMs` | number | `500` | Auto-detect 폴링 간격(ms) |
| `gitEffects.cooldownMs` | number | `1200` | 이펙트 최소 간격(ms) |
| `gitEffects.durationMs` | number | `2200` | 패널 자동 종료 지연(ms) |
| `gitEffects.autoPush` | boolean | `true` | Push 성공 추정 감지 (ahead > 0 → 0) |
| `gitEffects.autoPull` | boolean | `true` | Pull 성공 추정 감지 (behind > 0 → 0) |
| `gitEffects.autoCommit` | boolean | `true` | Commit 완료 추정 감지(휴리스틱) |

설정 예시:

```json
{
  "gitEffects.enabled": true,
  "gitEffects.pollMs": 500,
  "gitEffects.cooldownMs": 1200,
  "gitEffects.durationMs": 2200,
  "gitEffects.autoPush": true,
  "gitEffects.autoPull": true,
  "gitEffects.autoCommit": true
}
```

---

## Error Demo (실패 이펙트 재현)

### 케이스 A) 없는 리모트로 push 실패(확실)

```bash
git remote set-url origin https://example.invalid/does-not-exist.git
echo "fail-test" >> fail.txt
git add .
git commit -m "fail: invalid remote"
```

이 상태에서 **터미널에서 `git push`가 아니라**,  
VS Code Command Palette에서 **`Git Effects: Push (accurate mode)`** 를 실행해야 패널 에러가 뜹니다.

- 터미널에서 `git push`를 직접 실행하면: 터미널에만 `fatal: ...` 출력 (패널은 안 뜨는 게 정상)

원복:

```bash
git remote set-url origin <원래_URL>
```

---

## Architecture

### High-level

- **Extension(Backend)**  
  - Git repo 선택/상태 스냅샷/명령 실행  
  - 결과 payload 생성 후 Webview로 전달

- **Webview(Frontend)**  
  - payload 수신 → 이펙트 렌더 → 자동 숨김

### Message Flow

```txt
[User Action]
  | (Command Palette: Git Effects: Push/Pull/Commit)
  v
[Extension]
  - runGit(...) 실행
  - 결과(stdout/stderr) 파싱
  - payload = { kind, event, title, detail, repoPath, branch... }
  v  postMessage
[Webview]
  - 메시지 수신
  - slide-in 효과 + 캐릭터/텍스트
  - autoHideMs 후 숨김/종료
```

### Code Structure (refactor 기준)

```txt
src/
  extension.ts                  # activate/deactivate + wiring
  app/
    registerCommands.ts         # 커맨드 등록
    autoDetect.ts               # repo 상태 폴링(선택)
  git/
    types.ts                    # Git API 타입
    repo.ts                     # repo 선택/스냅샷/HEAD
    cli.ts                      # runGit/에러 요약
  panel/
    GitEffectsPanel.ts          # WebviewPanel lifecycle + postMessage
    html.ts                     # Webview HTML (UI)
  effects/
    types.ts                    # payload 타입
```

---

## Troubleshooting

### 설치가 안 되고 “현재 버전과 호환되지 않음”이 뜬다
- VS Code 버전을 최신으로 업데이트하거나,
- 확장 최소 지원 버전(`engines.vscode`)이 너무 높게 잡혀 있지 않은지 확인하세요.

### Marketplace에서 검색이 안 뜬다
- VS Code 빌드가 Microsoft Marketplace를 사용하는지 확인(일부 배포판은 다른 갤러리를 사용)
- 또는 VSIX 설치로 우회하세요.

---

## Roadmap

- [ ] 여러 테마(캐릭터/이펙트) 프리셋
- [ ] stderr 파싱 강화(친절한 메시지 매핑)
- [ ] 번들링(esbuild)으로 패키지 용량/파일 수 최적화
- [ ] 항상 살아있는 패널 모드(탭 churn 최소화)
- [ ] 멀티 repo 지원 UX 개선(현재 repo 표시/선택)

---

## License

MIT

---

## Credits

- VS Code Extension API
- Git CLI
