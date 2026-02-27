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

- **v0.0.5 (2026-02-27)** — Character Picker 필터 단순화(All/Male/Female) + 캐릭터 확장  
  - Added:
    - 성별 기반 필터: **All / Male / Female**
    - (확장) `media/models` 캐릭터 폴더 추가 반영
  - Changed:
    - 기존 탭/필터(Free/Installed/Animated 등)를 제거하고 **성별 중심 탐색 UX**로 정리
    - 필터 안정화(캐릭터 메타에 `gender`를 포함해 필터 적용 시 “0개 표시” 이슈 방지)
  - Notes:
    - 성별 분류 규약: `character-male-*`, `character-female-*` (폴더명 기준)

- **v0.0.4 (2026-02-26)** — Character Picker 메뉴 + 캐릭터 프리뷰(model.png) + 모델 선택 적용  
  - Added:
    - Command Palette: **Git Effects: Select Character**
    - `media/models/*` 자동 스캔 기반 캐릭터 목록 생성
    - 각 캐릭터 폴더의 **`model.png`를 메뉴 썸네일로 표시**
  - Changed:
    - 이펙트 패널이 선택된 캐릭터 폴더의 `model.obj / model.mtl`을 로드하도록 변경
  - Notes:
    - 캐릭터 추가 규약: `media/models/<id>/model.obj`, `model.mtl`, `model.png`, `Textures/*`

- **v0.0.3 (2026-02-25)** — Auto Detect 안정화(이벤트 기반 + 디바운스) + SCM 깜박임 개선  
  - Changed:
    - Auto Detect를 **repo state change(event-driven)** 기반으로 전환
    - 짧은 시간 연속 변화에 **debounce** 적용(기본 1200ms)
    - 불필요한 Git 상태 강제 갱신/폴링 제거로 **Source Control 깜박임 및 오버헤드 개선**
  - Docs:
    - 터미널에서 실행한 `git push/pull/commit` 동작 설명 정리(“정확 판정” vs “성공 추정” 구분)

- **v0.0.2 (2026-02-24)** — Documentation update  
  - Changed:
    - README 정리/보강(사용 방법/구조 설명 중심)

- **v0.0.1 (2026-02-23)** — First public release on VS Code Marketplace  
  - What’s included:
    - Git Push/Pull/Commit 결과를 Webview 패널 이펙트로 시각화
    - Manual trigger commands + Auto Detect(초기 버전)

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

- Command Palette에서 캐릭터 선택: **Git Effects: Select Character**
- `media/models/*` 자동 스캔 기반 캐릭터 목록 생성 + 메뉴 프리뷰(`model.png`)
- Character Picker에서 **All / Male / Female** 필터로 빠른 탐색

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
- 짧은 시간 내 연속 변화는 **debounce**로 묶어서 처리해 불필요한 갱신을 줄입니다.
- 실패는 상태 변화가 없을 수 있어 감지가 어렵습니다(기본적으로 성공 UX 중심).

✅ 장점: 터미널에서 실행해도 성공이면 감지될 수 있음  
⚠️ 단점: 실패를 정확히 잡기 어려움(정확 판정이 필요하면 커맨드 모드 권장)

---

## Install

### Marketplace에서 설치
1. VS Code → Extensions 탭
2. `git-effects` 검색
3. 설치

또는 링크:
- https://marketplace.visualstudio.com/items?itemName=ppsssj.git-effects

### VSIX로 설치(오프라인/검색이 안 될 때)
1. `.vsix` 다운로드(릴리즈/빌드 산출물)
2. VS Code → Extensions 탭 → `...` → **Install from VSIX...**
3. `.vsix` 선택 후 설치

---

## Quick Start (Dev)

> Extension Development Host에서 실행(개발용)

```bash
git clone https://github.com/ppsssj/git-Effects.git
cd git-Effects
npm install
```

VS Code에서 프로젝트 열기 → `F5` → Extension Development Host 실행

---

## Commands

Command Palette(`Ctrl+Shift+P`)에서 아래를 실행합니다.

- `Git Effects: Manual Effect`
- `Git Effects: Push (accurate mode)`
- `Git Effects: Pull (accurate mode)`
- `Git Effects: Commit (accurate mode)`
- `Git Effects: Select Character`

> **중요(정확한 의미):**  
> 터미널에서 `git push/pull/commit`을 직접 실행해도 **Auto Detect가 켜져 있으면 성공은 감지될 수 있습니다(상태 변화 기반 추정)**.  
> 다만 **실패/에러 메시지까지 정확히 표시하려면** 확장 커맨드(accurate mode)를 사용하세요.

---

## Settings

`settings.json`에서 아래 옵션을 설정할 수 있습니다.

| Key | Type | Default | Description |
|---|---:|---:|---|
| `gitEffects.enabled` | boolean | `true` | Git Effects UI 사용 여부 |
| `gitEffects.cooldownMs` | number | `1200` | 이펙트 최소 간격(ms) |
| `gitEffects.durationMs` | number | `2200` | 패널 자동 종료 지연(ms) |
| `gitEffects.autoPush` | boolean | `true` | Push 성공 추정 감지 (ahead > 0 → 0) |
| `gitEffects.autoPull` | boolean | `true` | Pull 성공 추정 감지 (behind > 0 → 0) |
| `gitEffects.autoCommit` | boolean | `true` | Commit 완료 추정 감지(휴리스틱) |
| `gitEffects.debounceMs` | number | `1200` | Auto Detect debounce(ms). 연속 변화 묶음 처리 |

> `gitEffects.pollMs`는 구버전(폴링 기반 Auto Detect) 설정 키입니다.  
> v0.0.3부터 Auto Detect는 event-driven으로 동작하며, `debounceMs` 사용을 권장합니다.  
> (하위 호환을 위해 `pollMs`가 남아있더라도 동작에 영향이 없도록 유지하는 것을 권장)

설정 예시:

```json
{
  "gitEffects.enabled": true,
  "gitEffects.cooldownMs": 1200,
  "gitEffects.durationMs": 2200,
  "gitEffects.autoPush": true,
  "gitEffects.autoPull": true,
  "gitEffects.autoCommit": true,
  "gitEffects.debounceMs": 1200
}
```

---

## Error Demo (실패 이펙트 재현)

아래처럼 확실한 실패 케이스를 만들고, **터미널이 아니라** 확장 커맨드로 실행하면 에러 패널을 재현할 수 있습니다.

```bash
git remote set-url origin https://example.invalid/does-not-exist.git
echo "fail-test" >> fail.txt
git add .
git commit -m "fail: invalid remote"
```

- Command Palette → **`Git Effects: Push (accurate mode)`**

원복:

```bash
git remote set-url origin <원래_URL>
```

---

## Character Assets

캐릭터 모델은 아래 규약으로 추가합니다. 폴더명을 그대로 캐릭터 ID로 사용합니다.

```txt
media/models/<character-id>/
  model.obj
  model.mtl
  model.png       # 메뉴 썸네일(미리보기)
  Textures/...
```

- `Git Effects: Select Character`에서 `media/models`를 자동 스캔해 목록을 구성합니다.
- Character Picker에서 폴더명 규약(`character-male-*`, `character-female-*`)을 기반으로 **All/Male/Female** 필터가 동작합니다.
- 이펙트 패널은 선택된 `<character-id>`의 `model.obj / model.mtl`을 로드합니다.


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
    autoDetect.ts               # repo 상태 기반 자동 감지(선택)
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
