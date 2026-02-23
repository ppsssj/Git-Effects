import * as vscode from "vscode";
import * as path from "node:path";
import type { GitAPI, Repository } from "./types";

export type RepoSnap = {
  ahead: number;
  behind: number;
  dirty: boolean;
  commit: string;
};

export function isPathInside(child: string, parent: string): boolean {
  child = path.resolve(child);
  parent = path.resolve(parent);
  if (child === parent) return true;
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function pickRepo(git: GitAPI, fsPath: string | undefined): Repository | undefined {
  const repos = git.repositories ?? [];
  if (!repos.length) return undefined;
  if (!fsPath) return repos[0];

  // deepest match wins
  const matches = repos
    .map((r) => r.rootUri.fsPath)
    .filter((root) => isPathInside(fsPath, root))
    .sort((a, b) => b.length - a.length);

  const root = matches[0];
  if (!root) return repos[0];
  return repos.find((r) => r.rootUri.fsPath === root) ?? repos[0];
}

export function resolveRepo(git: GitAPI, out: vscode.OutputChannel): Repository | undefined {
  const wsf = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  const active = vscode.window.activeTextEditor?.document.uri.fsPath;
  const picked = pickRepo(git, active ?? wsf[0]);

  out.appendLine(`[repo] active={${active ?? "none"}} -> picked={${picked?.rootUri.fsPath ?? "none"}}`);
  return picked;
}

export function headInfo(repo: Repository) {
  const head = repo.state.HEAD;
  return {
    branch: head?.name ?? "",
    upstream: head?.upstream?.name ?? "",
    ahead: head?.ahead ?? 0,
    behind: head?.behind ?? 0,
    commit: head?.commit ?? "",
  };
}

export function isDirty(repo: Repository): boolean {
  const wt = repo.state.workingTreeChanges?.length ?? 0;
  const idx = repo.state.indexChanges?.length ?? 0;
  const mg = repo.state.mergeChanges?.length ?? 0;
  return wt + idx + mg > 0;
}

export function readSnap(repo: Repository): RepoSnap {
  const head = repo.state.HEAD;
  return {
    ahead: head?.ahead ?? 0,
    behind: head?.behind ?? 0,
    dirty: isDirty(repo),
    commit: head?.commit ?? "",
  };
}
