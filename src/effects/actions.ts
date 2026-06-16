import type { EffectEvent, EffectKind } from "./types";

export const ACTION_STATE_KEY = "gitEffects.selectedActions";

export const ACTION_TARGETS = ["push", "pull", "commit", "error"] as const;
export type ActionTarget = (typeof ACTION_TARGETS)[number];

export const ACTION_OPTIONS = [
  { id: "pop", label: "Pop" },
  { id: "jumpSpin", label: "Jump + Spin" },
  { id: "nod", label: "Nod" },
  { id: "shakeNo", label: "Shake No" },
  { id: "slide", label: "Slide" },
] as const;

export type ActionId = (typeof ACTION_OPTIONS)[number]["id"];

export type ActionMap = Record<ActionTarget, ActionId>;

export const DEFAULT_ACTION_MAP: ActionMap = {
  push: "jumpSpin",
  pull: "pop",
  commit: "nod",
  error: "shakeNo",
};

const ACTION_ID_SET = new Set<string>(ACTION_OPTIONS.map((item) => item.id));

export function normalizeActionMap(value: unknown): ActionMap {
  const raw = value && typeof value === "object" ? value : {};
  const result: ActionMap = { ...DEFAULT_ACTION_MAP };

  for (const target of ACTION_TARGETS) {
    const candidate = (raw as Record<string, unknown>)[target];
    if (typeof candidate === "string" && ACTION_ID_SET.has(candidate)) {
      result[target] = candidate as ActionId;
    }
  }

  return result;
}

export function resolveActionId(
  kind: EffectKind,
  event: EffectEvent,
  actionMap: ActionMap,
): ActionId {
  if (kind === "error") {
    return actionMap.error;
  }

  if (event === "push" || event === "pull" || event === "commit") {
    return actionMap[event];
  }
  return "pop";
}
