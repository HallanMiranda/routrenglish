import { describeItem, estimateCost, generatePack } from "@/ai/generatePack";
import { repo } from "@/data/repo";
import type { AiSettings, DrillItem, Material } from "@/data/types";

export interface StudySource {
  kind: "image" | "pdf" | "text";
  images: string[];
  thumbnail?: string | undefined;
  text?: string | undefined;
  truncated?: boolean | undefined;
}

const stamp = () => Date.now().toString(36);
const prefixIds = (items: DrillItem[], p: string) => items.map((i) => ({ ...i, id: `${p}-${i.id}` }));

/** Generates a pack from the source, saves pack + material, returns the material. */
export async function createStudy(
  s: AiSettings,
  src: StudySource,
  level: string,
  focus: string,
  signal: AbortSignal,
  onFixing: () => void,
): Promise<Material> {
  const r = await generatePack({ apiKey: s.api_key!, model: s.model, level, focus, images: src.images, text: src.text, signal, onFixing });
  if (Object.keys(r.pulo).length) await repo.mergePuloDoGato(r.pulo);
  const materialId = `mat-${stamp()}`;
  const pack = await repo.saveDrillPack({ ...r.pack, id: materialId, items: prefixIds(r.pack.items, stamp()), user_created: true, material_id: materialId });
  return repo.saveMaterial({
    id: materialId,
    title: pack.title_pt,
    items: [],
    kind: src.kind,
    thumbnail: src.thumbnail,
    images: src.images,
    text: src.text,
    truncated: src.truncated,
    pack_id: pack.id,
    level,
    focus,
    tokens_in: r.tokensIn,
    tokens_out: r.tokensOut,
    cost_usd: estimateCost(r.tokensIn, r.tokensOut),
  });
}

/** Asks for new items from the same material and appends them to its pack. Returns how many were added. */
export async function generateMore(s: AiSettings, m: Material, signal: AbortSignal, onFixing: () => void) {
  const pack = m.pack_id ? await repo.getDrillPack(m.pack_id) : null;
  if (!pack) return 0;
  const r = await generatePack({
    apiKey: s.api_key!,
    model: s.model,
    level: m.level ?? pack.level,
    focus: m.focus ?? "",
    images: m.images ?? [],
    text: m.text,
    avoid: pack.items.map(describeItem),
    signal,
    onFixing,
  });
  if (Object.keys(r.pulo).length) await repo.mergePuloDoGato(r.pulo);
  const added = prefixIds(r.pack.items, stamp());
  await repo.saveDrillPack({ ...pack, items: [...pack.items, ...added] });
  const tin = (m.tokens_in ?? 0) + r.tokensIn;
  const tout = (m.tokens_out ?? 0) + r.tokensOut;
  await repo.saveMaterial({ ...m, tokens_in: tin, tokens_out: tout, cost_usd: estimateCost(tin, tout) });
  return added.length;
}
