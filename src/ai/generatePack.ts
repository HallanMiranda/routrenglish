import systemPrompt from "./prompts/generatePack.md?raw";
import { AiError, chatJson, type ChatMessage, type ChatPart } from "./openai";
import { parsePackJson } from "@/drills/importPack";
import type { DrillItem, DrillPack, PuloDoGato } from "@/data/types";
import { t } from "@/lib/i18n/pt-BR";

export interface GenerateInput {
  apiKey: string;
  model: string;
  level: string;
  focus: string;
  images: string[];
  text?: string | undefined;
  /** Short descriptions of items already generated, to avoid repeats. */
  avoid?: string[] | undefined;
  signal?: AbortSignal | undefined;
  onFixing?: () => void | undefined;
}
export interface GenerateResult {
  pack: Omit<DrillPack, "id"> & { id?: string };
  pulo: PuloDoGato;
  tokensIn: number;
  tokensOut: number;
}

// Approximate USD per 1M tokens, only for the on-screen estimate.
const PRICE_IN = 0.75;
const PRICE_OUT = 4.5;
export const estimateCost = (tin: number, tout: number) => (tin * PRICE_IN + tout * PRICE_OUT) / 1_000_000;

export function describeItem(i: DrillItem) {
  return i.mode === "ladder" ? i.steps.at(-1)?.en[0] ?? i.title_pt : i.mode === "qa" ? i.q_en : i.en[0] ?? i.pt;
}

export async function generatePack(input: GenerateInput): Promise<GenerateResult> {
  const intro = [
    `Learner level: ${input.level}`,
    `Focus: ${input.focus.trim() || "(none, choose from the material)"}`,
    input.avoid?.length
      ? `Create NEW items only. Do not repeat or rephrase these existing items:\n- ${input.avoid.join("\n- ")}`
      : "",
    input.text ? `Material:\n${input.text}` : "Material: see the images.",
    "Return the DrillPack JSON object.",
  ].filter(Boolean).join("\n\n");
  const parts: ChatPart[] = [
    { type: "text", text: intro },
    ...input.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: parts },
  ];
  let tokensIn = 0;
  let tokensOut = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await chatJson(input.apiKey, input.model, messages, input.signal);
    tokensIn += r.tokensIn;
    tokensOut += r.tokensOut;
    const parsed = parsePackJson(r.content);
    if (parsed.ok) return { pack: parsed.pack, pulo: parsed.pulo, tokensIn, tokensOut };
    if (attempt === 1) throw new AiError(t.ai.invalid, parsed.errors);
    input.onFixing?.();
    messages.push(
      { role: "assistant", content: r.content },
      {
        role: "user",
        content: `The JSON failed validation. Fix these errors and return the full corrected JSON object:\n- ${parsed.errors.join("\n- ")}`,
      },
    );
  }
  throw new AiError(t.ai.empty);
}
