// types.ts
import type * as vscode from "vscode";

export type GitExtension = { getAPI(version: 1): GitAPI };
export type GitAPI = { repositories: Repository[] };

export type Repository = {
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

    // ✅ 추가: Git repo state change 이벤트 (VS Code Git API에 존재)
    onDidChange?: vscode.Event<void>;
  };

  status?: () => Thenable<void>;
};