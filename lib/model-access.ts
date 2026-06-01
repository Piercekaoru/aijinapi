import type { Language } from "@/lib/i18n-core";

const messagesOnlyModels = new Set(["minimax-m3"]);
const unmeteredModels = new Set(["minimax-m3"]);

export function isMessagesOnlyModel(modelId: string | null | undefined) {
  return typeof modelId === "string" && messagesOnlyModels.has(modelId);
}

export function isUnmeteredModel(modelId: string | null | undefined) {
  return typeof modelId === "string" && unmeteredModels.has(modelId);
}

export function modelAccessNote(modelId: string, language: Language) {
  const notes: string[] = [];

  if (isMessagesOnlyModel(modelId)) {
    notes.push("POST /v1/messages");
  }

  if (isUnmeteredModel(modelId)) {
    notes.push(language === "zh" ? "不计入月度额度" : "No monthly quota");
  }

  return notes.length > 0 ? notes.join(" · ") : null;
}

export function usageTransportLabel(
  path: string,
  isStream: boolean,
  modelId: string | null | undefined,
) {
  if (isMessagesOnlyModel(modelId) || path === "/v1/messages") {
    return "messages";
  }

  return isStream ? "stream" : "json";
}

export function usageQuotaNote(modelId: string | null | undefined, language: Language) {
  if (!isUnmeteredModel(modelId)) return null;
  return language === "zh" ? "不计费" : "No quota";
}
