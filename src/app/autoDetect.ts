import * as vscode from "vscode";
import type { GitAPI, Repository } from "../git/types";
import { headInfo, readSnap, type RepoSnap } from "../git/repo";
import { GitEffectsPanel } from "../panel/GitEffectsPanel";

export function startAutoDetect(args: {
  context: vscode.ExtensionContext;
  out: vscode.OutputChannel;
  git: GitAPI;
}) {
  const { context, out, git } = args;

  const repoState = new Map<string, RepoSnap>();

  // repo별 디바운스 타이머/구독 핸들 관리
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const subscriptions = new Map<string, vscode.Disposable>();

  const cfg = () => vscode.workspace.getConfiguration("gitEffects");

  const evaluateRepo = (repo: Repository) => {
    const key = repo.rootUri.fsPath;

    const cur = readSnap(repo);
    const prev = repoState.get(key);

    if (!prev) {
      repoState.set(key, cur);
      return;
    }

    const autoPush = cfg().get<boolean>("autoPush", true);
    const autoPull = cfg().get<boolean>("autoPull", true);
    const autoCommit = cfg().get<boolean>("autoCommit", true);

    const hi = headInfo(repo);

    // push 감지: ahead가 0으로 떨어짐
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

    // pull 감지: behind가 0으로 떨어짐
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

    // commit 감지: commit hash 변경 + dirty -> clean
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
  };

  const scheduleEvaluate = (repo: Repository) => {
    const key = repo.rootUri.fsPath;

    // 디바운스 시간 (기본 1200ms)
    const debounceMs = Math.max(200, cfg().get<number>("debounceMs", 1200));

    const prevTimer = debounceTimers.get(key);
    if (prevTimer) clearTimeout(prevTimer);

    const t = setTimeout(() => {
      try {
        evaluateRepo(repo);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        out.appendLine(`[ERR] autoDetect evaluate failed: ${msg}`);
      }
    }, debounceMs);

    debounceTimers.set(key, t);
  };

  const attachRepoListener = (repo: Repository) => {
    const key = repo.rootUri.fsPath;
    if (subscriptions.has(key)) return; // 이미 구독 중이면 skip

    // 초기 snap 저장
    repoState.set(key, readSnap(repo));

    const ev = repo.state.onDidChange;
    if (!ev) {
      out.appendLine(`[WARN] repo.state.onDidChange not available for ${key} (fallback: no auto-detect)`);
      return;
    }

    const disp = ev(() => scheduleEvaluate(repo));
    subscriptions.set(key, disp);

    out.appendLine(`[autoDetect] attached onDidChange for ${key}`);
  };

  const ensureRepoListeners = () => {
    const repos = git.repositories ?? [];
    for (const r of repos) attachRepoListener(r);

    // 제거된 repo 정리
    const live = new Set(repos.map((r) => r.rootUri.fsPath));
    for (const [key, disp] of subscriptions.entries()) {
      if (!live.has(key)) {
        try {
          disp.dispose();
        } catch {
          // noop
        }
        subscriptions.delete(key);
        repoState.delete(key);

        const t = debounceTimers.get(key);
        if (t) clearTimeout(t);
        debounceTimers.delete(key);

        out.appendLine(`[autoDetect] detached removed repo ${key}`);
      }
    }
  };

  // 1) 최초 1회 등록
  ensureRepoListeners();

  // 2) 워크스페이스 변경 시 repo 리스너 재등록
  const wfDisp = vscode.workspace.onDidChangeWorkspaceFolders(() => ensureRepoListeners());
  context.subscriptions.push(wfDisp);

  // 3) repo 추가/삭제를 감지할 공식 이벤트가 타입에 없으므로, "리스너만" 10초마다 보강
  //    (repo.status() 같은 Git 상태 갱신 호출이 없어서 SCM 깜박임 유발하지 않음)
  const tick = setInterval(() => ensureRepoListeners(), 10_000);
  context.subscriptions.push({ dispose: () => clearInterval(tick) });

  // 4) dispose cleanup
  context.subscriptions.push({
    dispose: () => {
      for (const t of debounceTimers.values()) clearTimeout(t);
      debounceTimers.clear();

      for (const d of subscriptions.values()) {
        try {
          d.dispose();
        } catch {
          // noop
        }
      }
      subscriptions.clear();
      repoState.clear();
    },
  });

  out.appendLine("auto-detect started (event-driven, debounced)");
}