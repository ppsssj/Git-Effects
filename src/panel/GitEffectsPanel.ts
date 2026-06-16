import * as vscode from "vscode";
import { getHtml } from "./html";
import type { EffectPayload } from "../effects/types";
import {
  ACTION_STATE_KEY,
  normalizeActionMap,
  resolveActionId,
} from "../effects/actions";

const PANEL_VIEWTYPE = "gitEffectsPanel";
const STATE_KEY = "gitEffects.selectedCharacterId";
const DEFAULT_CHARACTER_ID = "character-male-d";

export class GitEffectsPanel {
  private static current: GitEffectsPanel | undefined;
  private static lastFireMs = 0;

  private ready = false;
  private pendingPayload: EffectPayload | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly characterId: string,
    private readonly out: vscode.OutputChannel,
  ) {
    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        if (!msg || typeof msg !== "object") return;
        if ((msg as any).type !== "ready") return;

        this.ready = true;
        if (this.pendingPayload) {
          const payload = this.pendingPayload;
          this.pendingPayload = undefined;
          this.postEffect(payload);
        }
      },
      undefined,
      this.context.subscriptions,
    );
  }

  static getOrCreate(
    context: vscode.ExtensionContext,
    out: vscode.OutputChannel,
  ): GitEffectsPanel {
    const selected = GitEffectsPanel.getSelectedCharacterId(context);

    if (GitEffectsPanel.current) {
      if (GitEffectsPanel.current.characterId === selected) {
        return GitEffectsPanel.current;
      }

      GitEffectsPanel.current.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEWTYPE,
      " ",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      },
    );

    const instance = new GitEffectsPanel(panel, context, selected, out);
    GitEffectsPanel.current = instance;

    panel.webview.html = getHtml(panel.webview, context, { characterId: selected });
    panel.onDidDispose(() => {
      if (GitEffectsPanel.current === instance) {
        GitEffectsPanel.current = undefined;
      }
    });

    return instance;
  }

  static fire(context: vscode.ExtensionContext, out: vscode.OutputChannel, payload: EffectPayload) {
    const cfg = vscode.workspace.getConfiguration("gitEffects");
    const enabled = cfg.get<boolean>("enabled", true);
    if (!enabled) {
      return;
    }

    const cooldownMs = cfg.get<number>("cooldownMs", 1200);
    const now = Date.now();
    if (now - GitEffectsPanel.lastFireMs < cooldownMs) {
      return;
    }
    GitEffectsPanel.lastFireMs = now;

    const actionMap = normalizeActionMap(context.globalState.get(ACTION_STATE_KEY));
    const resolvedPayload: EffectPayload = {
      ...payload,
      actionId:
        payload.actionId ??
        resolveActionId(payload.kind, payload.event, actionMap),
    };

    const panel = GitEffectsPanel.getOrCreate(context, out);
    panel.fireEffect(resolvedPayload, cfg.get<number>("durationMs", 2200));
  }

  private static getSelectedCharacterId(context: vscode.ExtensionContext) {
    return context.globalState.get<string>(STATE_KEY) || DEFAULT_CHARACTER_ID;
  }

  private fireEffect(payload: EffectPayload, durationMs: number) {
    this.panel.reveal(vscode.ViewColumn.Beside, true);

    this.out.appendLine(
      `[EFFECT] ${payload.kind.toUpperCase()} ${payload.event} :: ${payload.title} :: ${payload.branch ?? "?"} -> ${
        payload.upstream ?? "?"
      } :: character=${this.characterId} action=${payload.actionId ?? "default"}`,
    );

    if (this.ready) {
      this.postEffect(payload);
    } else {
      this.pendingPayload = payload;
    }

    setTimeout(() => this.dispose(), durationMs);
  }

  private postEffect(payload: EffectPayload) {
    try {
      this.panel.webview.postMessage({ type: "effect", payload });
    } catch (e) {
      this.out.appendLine(`[ERR] postMessage failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private dispose() {
    try {
      this.panel.dispose();
    } catch {
      // noop
    }
  }
}
