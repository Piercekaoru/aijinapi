export type PublicFreeModel = {
  id: string;
  object?: string;
  owned_by?: string;
};

export type PublicFreeModelsResponse = {
  object?: string;
  data?: PublicFreeModel[];
  updated_at?: string | null;
  degraded?: boolean;
  fail_closed?: boolean;
  last_error?: string | null;
};

export const publicFreeModelsEndpoint = "/api/backend/public/free-models";

const knownModelNames: Record<string, string> = {
  "big-pickle": "Big Pickle",
  "deepseek-v4-flash-free": "DeepSeek V4 Flash Free",
  "minimax-m2.5-free": "MiniMax M2.5 Free",
  "ring-2.6-1t-free": "Ring 2.6 1T Free",
  "nemotron-3-super-free": "Nemotron 3 Super Free",
};

export function modelDisplayName(id: string) {
  return (
    knownModelNames[id] ??
    id
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export async function loadPublicFreeModels(signal?: AbortSignal) {
  const response = await fetch(publicFreeModelsEndpoint, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`free model catalog request failed: ${response.status}`);
  }

  const payload = (await response.json()) as PublicFreeModelsResponse;
  return {
    ...payload,
    data: (payload.data ?? []).filter((model): model is PublicFreeModel => Boolean(model.id)),
  };
}
