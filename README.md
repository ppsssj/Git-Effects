# Git Effects

**Git Effects**는 VS Code에서 `push / pull / commit` 동작을 감지(또는 확장 커맨드로 실행)해, **오른쪽 패널에서 슬라이드 이펙트**로 결과를 보여주는 확장입니다.  
성공/실패를 **색상(초록/빨강)** 으로 구분하고, 가능한 범위에서 **실패 원인 텍스트**도 표시합니다.

![Git Effects Icon](assets/Logo_Light.svg)

---

## 핵심 기능

### 1) 애니메이션 이펙트 UI
- 오른쪽 패널(Beside)에 얇게 등장 → 메시지 표시 → 자동 닫힘
- 성공/실패/정보 상태별 색상 분리
- `repo 경로` + `브랜치 → upstream` 표기

### 2) 자동 감지(Auto-detect)
터미널/VS Code Git UI 등 **어떤 방식으로 Git을 실행해도** 상태 변화를 기반으로 이벤트를 감지합니다.

- **Push 성공 감지:** `ahead > 0 → 0`
- **Pull 성공 감지:** `behind > 0 → 0`
- **Commit 완료 감지(휴리스틱):** `HEAD 커밋 변경 + dirty → clean`

> 자동 감지는 “성공” 판정에 강하고, “실패 원인”은 정확히 못 잡는 경우가 있습니다(터미널 stderr를 직접 읽을 수 없기 때문).

### 3) 정확 모드(Accurate mode) 커맨드
확장 커맨드로 `push / pull / commit`을 실행하면, 확장이 직접 `git`을 실행해 **성공/실패를 확정**하고 **실패 원인(stderr)** 을 표시합니다.

---

## 사용 방법

### 빠른 테스트
1. VS Code에서 확장 실행
2. Command Palette (`Ctrl + Shift + P`)
3. `Git Effects: Manual Effect` 실행 → 이펙트가 뜨면 UI 파이프라인 정상

### 자동 감지 테스트(추천)
1. repo에서 커밋을 만들어 `ahead`를 발생시킵니다.
   ```bash
   echo t >> test.txt
   git add .
   git commit -m "toast test"
   ```
2. `git push` 실행  
3. `ahead 1 → 0` 변화가 잡히면 “Push 성공 ✅” 이펙트가 표시됩니다.

### 정확 모드 테스트(실패 원인까지)
- Command Palette에서 아래 커맨드 실행:
  - `Git Effects: Push (accurate mode)`
  - `Git Effects: Pull (accurate mode)`
  - `Git Effects: Commit (accurate mode)`  
    (커밋 메시지를 입력받고 실행합니다. *staged 상태를 전제로 동작*)

---

## 커맨드 목록

- **Git Effects: Manual Effect**
- **Git Effects: Push (accurate mode)**
- **Git Effects: Pull (accurate mode)**
- **Git Effects: Commit (accurate mode)**

---

## 설정(Settings)

`Settings → Extensions → Git Effects` 또는 `settings.json`에서 제어합니다.

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

- `gitEffects.enabled`: 확장 UI 전체 on/off
- `gitEffects.pollMs`: 자동 감지 폴링 간격(ms) (최소 200)
- `gitEffects.cooldownMs`: 이펙트 최소 간격(ms) (연속 이벤트 억제)
- `gitEffects.durationMs`: 패널 자동 닫힘까지의 시간(ms)
- `gitEffects.autoPush`: push 성공 자동 감지 on/off
- `gitEffects.autoPull`: pull 성공 자동 감지 on/off
- `gitEffects.autoCommit`: commit 완료 자동 감지 on/off

---

## 개발(로컬)

```bash
npm install
npm run compile
# 또는
npm run watch
```

VS Code에서 `F5`로 Extension Development Host를 실행해 테스트합니다.

---

## 로드맵

- 멀티 레포 워크스페이스에서 repo 선택 UI 제공
- Stage/Commit/Push를 한 번에 실행하는 “Workflow” 커맨드 제공
- 실패 케이스 메시지 정리(인증/권한/업스트림 없음 등)
- README에 demo GIF/스크린샷 추가

---

## 라이선스
MIT (필요 시 변경)
