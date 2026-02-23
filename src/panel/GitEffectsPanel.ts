import * as vscode from "vscode";
import { getHtml } from "./html";
import type { EffectPayload } from "../effects/types";

const PANEL_VIEWTYPE = "gitEffectsPanel";

export class GitEffectsPanel {
  private static current: GitEffectsPanel | undefined;
  private static lastFireMs = 0;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {}

  static getOrCreate(context: vscode.ExtensionContext): GitEffectsPanel {
    if (GitEffectsPanel.current) return GitEffectsPanel.current;

    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEWTYPE,
      " ", // 제목 최소화
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      },
    );

    const instance = new GitEffectsPanel(panel, context);
    GitEffectsPanel.current = instance;

    panel.webview.html = getHtml(panel.webview, context);
    panel.onDidDispose(() => (GitEffectsPanel.current = undefined));

    return instance;
  }

  /**
   * 외부에서는 panel 인스턴스를 오래 들고 있지 말고, 호출 시점에 확보하도록.
   * (dispose 이후에도 정상 동작 + activate 시점에 패널이 뜨는 문제 방지)
   */
  static fire(context: vscode.ExtensionContext, out: vscode.OutputChannel, payload: EffectPayload) {
    const panel = GitEffectsPanel.getOrCreate(context);
    panel.fireEffect(out, payload);
  }

  fireEffect(out: vscode.OutputChannel, payload: EffectPayload) {
    const cfg = vscode.workspace.getConfiguration("gitEffects");
    const enabled = cfg.get<boolean>("enabled", true);
    if (!enabled) return;

    const cooldownMs = cfg.get<number>("cooldownMs", 1200);
    const now = Date.now();
    if (now - GitEffectsPanel.lastFireMs < cooldownMs) return;
    GitEffectsPanel.lastFireMs = now;

    this.panel.reveal(vscode.ViewColumn.Beside, true);

    out.appendLine(
      `[EFFECT] ${payload.kind.toUpperCase()} ${payload.event} :: ${payload.title} :: ${payload.branch ?? "?"} -> ${
        payload.upstream ?? "?"
      }`,
    );

    // webview가 아직 준비 전일 수 있어 예외 방어
    try {
      this.panel.webview.postMessage({ type: "effect", payload });
    } catch (e) {
      out.appendLine(`[ERR] postMessage failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const durationMs = cfg.get<number>("durationMs", 2200);
    setTimeout(() => {
      // 탭이 계속 누적되는 걸 막기 위해 기본값은 dispose
      // 다음 이펙트 발생 시 getOrCreate()가 새 패널을 생성함
      try {
        this.panel.dispose();
      } catch {
        // noop
      }
    }, durationMs);
  }
}
