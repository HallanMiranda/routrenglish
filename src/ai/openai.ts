import { t } from "@/lib/i18n/pt-BR";

const BASE = "https://api.openai.com/v1";

/** Error with a Portuguese message ready to show. */
export class AiError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(message);
  }
}

async function describe(res: Response, model: string): Promise<AiError> {
  let original = "";
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    original = body.error?.message ?? "";
  } catch {
    /* no body */
  }
  const s = res.status;
  const msg =
    s === 401 ? t.ai.unauthorized
    : s === 403 ? t.ai.forbidden
    : s === 404 ? t.ai.notFound(model)
    : s === 429 ? t.ai.rateLimit
    : s === 400 ? t.ai.badRequest
    : s >= 500 ? t.ai.server(s)
    : t.ai.other(s);
  return new AiError(original ? `${msg} ${t.ai.original} ${original}` : msg);
}

async function call(path: string, key: string, model: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new AiError(t.ai.network);
  }
  if (!res.ok) throw await describe(res, model);
  return res.json();
}

/** Tiny free check: looks up the model with the key. */
export async function testKey(key: string, model: string) {
  await call(`/models/${encodeURIComponent(model)}`, key, model);
}

export type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
}

export async function chatJson(key: string, model: string, messages: ChatMessage[], signal?: AbortSignal) {
  const data = (await call("/chat/completions", key, model, {
    method: "POST",
    signal: signal ?? null,
    body: JSON.stringify({ model, messages, response_format: { type: "json_object" } }),
  })) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new AiError(t.ai.empty);
  return { content, tokensIn: data.usage?.prompt_tokens ?? 0, tokensOut: data.usage?.completion_tokens ?? 0 };
}
