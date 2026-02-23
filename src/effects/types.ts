export type EffectKind = "success" | "error" | "info";
export type EffectEvent = "push" | "pull" | "commit" | "manual";

export type EffectPayload = {
  kind: EffectKind;
  event: EffectEvent;
  repoPath?: string;
  branch?: string;
  upstream?: string;
  title: string;
  detail?: string;
};
