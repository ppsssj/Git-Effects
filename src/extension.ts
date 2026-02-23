import * as vscode from "vscode";
import type { GitExtension } from "./git/types";
import { registerCommands } from "./app/registerCommands";
import { startAutoDetect } from "./app/autoDetect";

const OUT_NAME = "Git Effects";

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel(OUT_NAME);
  out.appendLine("=== activate() start ===");

  const gitExt = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!gitExt) {
    vscode.window.showWarningMessage("vscode.git 확장을 찾지 못했습니다.");
    out.appendLine("[ERR] vscode.git not found -> abort");
    return;
  }

  gitExt.activate().then(
    () => {
      out.appendLine("vscode.git activate() resolved");
      const git = gitExt.exports.getAPI(1);

      // ✅ 패널은 '이펙트를 실제로 쏠 때' 지연 생성(lazy create)
      // - 개발자 모드에서 바로 캐릭터가 보이는 문제 방지
      // - dispose 후에도 다음 이펙트에서 새 패널 생성 가능
      registerCommands({ context, out, git });
      startAutoDetect({ context, out, git });

      out.appendLine("=== activate() end ===");
    },
    (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      out.appendLine(`[ERR] vscode.git activate failed: ${msg}`);
      vscode.window.showErrorMessage(`vscode.git activate failed: ${msg}`);
    },
  );
}

export function deactivate() {}
