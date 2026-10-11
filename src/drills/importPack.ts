import type { DrillItem, DrillPack, DrillTrap, PuloDoGato } from "@/data/types";

export type ImportResult =
  | { ok: true; pack: Omit<DrillPack, "id"> & { id?: string }; pulo: PuloDoGato }
  | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(isStr);

/** Validates a pasted DrillPack JSON; errors are in Portuguese and name the item and field. */
export function parsePackJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["O texto não é um JSON válido. Confira vírgulas, aspas e chaves."] };
  }
  if (!isObj(raw)) return { ok: false, errors: ["O pacote precisa ser um objeto JSON { ... }."] };
  // Accept either a pack, or { pulo_do_gato, packs: [pack] }.
  const top = raw;
  const packRaw = Array.isArray(top["packs"]) ? (top["packs"] as unknown[])[0] : top;
  if (!isObj(packRaw)) return { ok: false, errors: ['"packs" precisa ter pelo menos um pacote.'] };
  return parseOne(top, packRaw);
}

export interface MultiImport {
  packs: (Omit<DrillPack, "id"> & { id?: string })[];
  pulo: PuloDoGato;
  errors: string[];
}

/** A single pack or {pulo_do_gato, packs:[...]}: imports every valid pack, errors name the failing pack. */
export function parsePacksJson(text: string): MultiImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { packs: [], pulo: {}, errors: ["O texto não é um JSON válido. Confira vírgulas, aspas e chaves."] };
  }
  if (!isObj(raw)) return { packs: [], pulo: {}, errors: ["O pacote precisa ser um objeto JSON { ... }."] };
  const list = Array.isArray(raw["packs"]) ? (raw["packs"] as unknown[]) : [raw];
  if (!list.length) return { packs: [], pulo: {}, errors: ['"packs" precisa ter pelo menos um pacote.'] };
  const out: MultiImport = { packs: [], pulo: {}, errors: [] };
  list.forEach((pr, i) => {
    const name = isObj(pr) ? String(pr["id"] ?? pr["title_pt"] ?? i + 1) : String(i + 1);
    if (!isObj(pr)) return void out.errors.push(`Pacote ${name}: precisa ser um objeto.`);
    const r = parseOne(i === 0 ? raw as Obj : {}, pr);
    if (r.ok) { out.packs.push(r.pack); Object.assign(out.pulo, r.pulo); }
    else out.errors.push(...(list.length > 1 ? r.errors.map((e) => `Pacote ${name} → ${e}`) : r.errors));
  });
  return out;
}

function parseOne(top: Obj, packRaw: Obj): ImportResult {
  const errors: string[] = [];
  const err = (where: string, field: string, what: string) => errors.push(`${where}: campo "${field}" ${what}.`);

  for (const f of ["title_pt", "level", "focus_pt"]) if (!isStr(packRaw[f])) err("Pacote", f, "é obrigatório e precisa ser texto");
  if (packRaw["id"] !== undefined && !isStr(packRaw["id"])) err("Pacote", "id", "precisa ser texto");
  const itemsRaw = packRaw["items"];
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) err("Pacote", "items", "precisa ser uma lista com pelo menos um item");

  const traps = (where: string, v: unknown): DrillTrap[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) { err(where, "traps", "precisa ser uma lista"); return []; }
    v.forEach((t, k) => {
      if (!isObj(t) || !isStr(t["word"]) || !isStr(t["hint_pt"])) err(where, `traps[${k}]`, 'precisa ter "word" e "hint_pt"');
    });
    return v as DrillTrap[];
  };

  const ids = new Set<string>();
  const items: DrillItem[] = [];
  (Array.isArray(itemsRaw) ? itemsRaw : []).forEach((it, i) => {
    const where = `Item ${i + 1}${isObj(it) && isStr(it["id"]) ? ` (${it["id"]})` : ""}`;
    if (!isObj(it)) return void errors.push(`${where}: precisa ser um objeto.`);
    if (!isStr(it["id"])) err(where, "id", "é obrigatório");
    else if (ids.has(it["id"])) err(where, "id", "está repetido");
    else ids.add(it["id"]);
    const mode = it["mode"] ?? "translate";
    if (mode === "translate") {
      if (!isStr(it["pt"])) err(where, "pt", "é obrigatório");
      if (!isStrArr(it["en"])) err(where, "en", "precisa ser uma lista de respostas em inglês");
      if (!isStr(it["focus"])) err(where, "focus", "é obrigatório");
      if (it["variations"] !== undefined) {
        if (!Array.isArray(it["variations"])) err(where, "variations", "precisa ser uma lista");
        else (it["variations"] as unknown[]).forEach((v, k) => {
          if (!isObj(v) || !isStr(v["pt"]) || !isStrArr(v["en"])) err(where, `variations[${k}]`, 'precisa ter "pt" e "en"');
        });
      }
      items.push({ ...(it as object), mode: "translate", traps: traps(where, it["traps"]) } as DrillItem);
    } else if (mode === "qa") {
      for (const f of ["q_en", "q_pt", "focus"]) if (!isStr(it[f])) err(where, f, "é obrigatório");
      for (const f of ["accept_patterns", "model_answers"]) if (!isStrArr(it[f])) err(where, f, "precisa ser uma lista de textos");
      items.push({ ...(it as object), mode: "qa", traps: traps(where, it["traps"]) } as DrillItem);
    } else if (mode === "ladder") {
      if (!isStr(it["title_pt"])) err(where, "title_pt", "é obrigatório");
      const steps = it["steps"];
      if (!Array.isArray(steps) || steps.length === 0) err(where, "steps", "precisa ser uma lista com pelo menos um degrau");
      else steps.forEach((st, k) => {
        const sw = `${where}, degrau ${k + 1}`;
        if (!isObj(st)) return void errors.push(`${sw}: precisa ser um objeto.`);
        if (!isStr(st["pt"])) err(sw, "pt", "é obrigatório");
        if (!isStrArr(st["en"])) err(sw, "en", "precisa ser uma lista de respostas em inglês");
        if (!isStr(st["focus"])) err(sw, "focus", "é obrigatório");
        if (k > 0 && !isStr(st["change_pt"])) err(sw, "change_pt", 'é obrigatório (ex.: "+ quando")');
        st["traps"] = traps(sw, st["traps"]);
        if (st["change_pt"] === undefined) st["change_pt"] = "";
      });
      const free = it["free"];
      if (free !== undefined) {
        if (!isObj(free)) err(where, "free", "precisa ser um objeto");
        else {
          if (!isStr(free["prompt_pt"])) err(`${where}, free`, "prompt_pt", "é obrigatório");
          for (const f of ["accept_patterns", "model_answers"]) if (!isStrArr(free[f])) err(`${where}, free`, f, "precisa ser uma lista de textos");
        }
      }
      items.push({ ...(it as object), mode: "ladder" } as DrillItem);
    } else {
      err(where, "mode", 'precisa ser "translate", "qa" ou "ladder"');
    }
  });

  const puloRaw = top["pulo_do_gato"] ?? packRaw["pulo_do_gato"];
  let pulo: PuloDoGato = {};
  if (puloRaw !== undefined) {
    if (!isObj(puloRaw) || !Object.values(puloRaw).every(isStr)) err("Pacote", "pulo_do_gato", "precisa ser um objeto { foco: texto }");
    else pulo = puloRaw as PuloDoGato;
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    pulo,
    pack: {
      ...(isStr(packRaw["id"]) ? { id: packRaw["id"] } : {}),
      title_pt: packRaw["title_pt"] as string,
      level: packRaw["level"] as string,
      focus_pt: packRaw["focus_pt"] as string,
      items,
    },
  };
}
