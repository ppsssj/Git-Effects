import * as vscode from "vscode";
import { getCharacterPickerHtml } from "./html";
import { GitEffectsPanel } from "./GitEffectsPanel";
import {
  ACTION_OPTIONS,
  ACTION_STATE_KEY,
  ACTION_TARGETS,
  type ActionMap,
  normalizeActionMap,
} from "../effects/actions";

const PANEL_VIEWTYPE = "gitEffectsCharacterPicker";
const STATE_KEY = "gitEffects.selectedCharacterId";
const DEFAULT_CHARACTER_ID = "character-male-d";

export type CharacterId = string;

export type CharacterItem = {
  id: string;
  name: string;
  tags?: string[];
  thumbnailUri?: string;
  gender?: "male" | "female" | "other"; // ✅ 추가
};

export class CharacterPickerPanel {
  private static current: CharacterPickerPanel | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly out: vscode.OutputChannel,
  ) {
    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (!msg || typeof msg !== "object") return;

        const type = (msg as any).type;

        if (type === "ready") {
          this.postState();
          return;
        }

        // ✅ webview가 캐릭터 목록 요청
        if (type === "getCharacters") {
          const items = await this.scanCharacters();
          this.panel.webview.postMessage({ type: "characters", items });
          return;
        }

        if (type === "applyCharacter") {
          const id = String((msg as any).id || "").trim();
          if (!id) return;

          await this.context.globalState.update(STATE_KEY, id);
          this.out.appendLine(`[CHAR] selectedCharacterId = ${id}`);
          this.postState();

          vscode.window.setStatusBarMessage(
            `Git-Effects: character set to ${id}`,
            1500,
          );
          return;
        }

        if (type === "applyAction") {
          const target = String((msg as any).target || "").trim();
          const actionId = String((msg as any).actionId || "").trim();
          if (!ACTION_TARGETS.some((item) => item === target)) {
            return;
          }
          if (!ACTION_OPTIONS.some((item) => item.id === actionId)) {
            return;
          }

          const actionMap = this.getActionMap();
          actionMap[target as keyof ActionMap] = actionId as ActionMap[keyof ActionMap];
          await this.context.globalState.update(ACTION_STATE_KEY, actionMap);
          this.out.appendLine(`[ACTION] ${target} = ${actionId}`);
          this.postState();

          vscode.window.setStatusBarMessage(
            `Git-Effects: ${target} action set to ${actionId}`,
            1500,
          );
          return;
        }

        if (type === "previewAction") {
          const target = String((msg as any).target || "manual").trim();
          const actionId = String((msg as any).actionId || "").trim();
          const action = ACTION_OPTIONS.find((item) => item.id === actionId);
          if (!action) {
            return;
          }

          this.out.appendLine(`[ACTION] preview ${target} -> ${actionId}`);
          GitEffectsPanel.fire(this.context, this.out, {
            kind: actionId === "shakeNo" ? "error" : "info",
            event: target === "push" || target === "pull" || target === "commit"
              ? target
              : "manual",
            actionId,
            title: `Preview: ${action.label}`,
            detail: `${target} action preview`,
          });
          return;
        }

        if (type === "close") {
          try {
            this.panel.dispose();
          } catch {}
          return;
        }

        if (type === "openSettings") {
          void vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "gitEffects",
          );
          return;
        }
      },
      undefined,
      this.context.subscriptions,
    );
  }

  static show(context: vscode.ExtensionContext, out: vscode.OutputChannel) {
    if (CharacterPickerPanel.current) {
      CharacterPickerPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
      CharacterPickerPanel.current.postState();
      void CharacterPickerPanel.current.refreshCharacters();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEWTYPE,
      "Git-Effects: Character",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "media"),
          vscode.Uri.joinPath(context.extensionUri, "assets"),
        ],
      },
    );

    const instance = new CharacterPickerPanel(panel, context, out);
    CharacterPickerPanel.current = instance;

    const selected = (context.globalState.get<string>(STATE_KEY) ||
      DEFAULT_CHARACTER_ID) as CharacterId;

    panel.webview.html = getCharacterPickerHtml(panel.webview, context, {
      selected,
      actionMap: instance.getActionMap(),
      actionOptions: [...ACTION_OPTIONS],
    });

    panel.onDidDispose(() => (CharacterPickerPanel.current = undefined));

    instance.postState();
    void instance.refreshCharacters();
  }

  private postState() {
    const selected = (this.context.globalState.get<string>(STATE_KEY) ||
      DEFAULT_CHARACTER_ID) as CharacterId;
    this.panel.webview.postMessage({
      type: "state",
      selected,
      actionMap: this.getActionMap(),
      actionOptions: [...ACTION_OPTIONS],
    });
  }

  private getActionMap() {
    return normalizeActionMap(this.context.globalState.get(ACTION_STATE_KEY));
  }

  private async refreshCharacters() {
    try {
      const items = await this.scanCharacters();
      this.panel.webview.postMessage({ type: "characters", items });
    } catch (e) {
      this.out.appendLine(
        `[CHAR] scanCharacters failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      this.panel.webview.postMessage({ type: "characters", items: [] });
    }
  }

  /**
   * Scan:
   * media/models/<id>/model.obj
   * media/models/<id>/model.mtl
   * media/models/<id>/model.png (optional thumbnail)
   */
  private async scanCharacters(): Promise<CharacterItem[]> {
    const modelsDir = vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
      "models",
    );

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(modelsDir);
    } catch {
      return [];
    }

    const dirNames = entries
      .filter(([, t]) => t === vscode.FileType.Directory)
      .map(([name]) => name);

    const items: CharacterItem[] = [];

    for (const id of dirNames) {
      const dir = vscode.Uri.joinPath(modelsDir, id);

      const obj = vscode.Uri.joinPath(dir, "model.obj");
      const mtl = vscode.Uri.joinPath(dir, "model.mtl");

      const okObj = await exists(obj);
      const okMtl = await exists(mtl);
      if (!okObj || !okMtl) continue;
      const lower = id.toLowerCase();
      const gender: "male" | "female" | "other" = lower.includes("female")
        ? "female"
        : lower.includes("male")
          ? "male"
          : "other";
      // ✅ 썸네일(model.png) 있으면 webview URI로 전달
      const png = vscode.Uri.joinPath(dir, "model.png");
      const okPng = await exists(png);
      const thumbnailUri = okPng
        ? this.panel.webview.asWebviewUri(png).toString()
        : undefined;

      items.push({ id, name: id, tags: [], thumbnailUri, gender });
    }

    items.sort((a, b) => a.id.localeCompare(b.id));
    return items;
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
