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
  };
  status?: () => Thenable<void>;
};
