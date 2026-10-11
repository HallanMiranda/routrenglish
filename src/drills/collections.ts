import type { DrillPack, PackProgress } from "@/data/types";

/** Prefix before "-u<digits>" (headway-starter-u01 → headway-starter), or null. */
export function collectionKey(id: string): string | null {
  const m = /^(.+)-u\d+/.exec(id);
  return m ? m[1]! : null;
}

export interface Collection {
  key: string;
  title: string;
  units: DrillPack[];
}

export const unitDone = (p?: PackProgress) => !!p && p.accuracy !== null && p.best_round >= 4;

/** Groups packs sharing a "-u" prefix (2+ units) into collections; the rest stay single. */
export function groupCollections(packs: DrillPack[]): { collections: Collection[]; singles: DrillPack[] } {
  const by = new Map<string, DrillPack[]>();
  for (const p of packs) {
    const k = collectionKey(p.id);
    if (k) by.set(k, [...(by.get(k) ?? []), p]);
  }
  const collections: Collection[] = [];
  const inCol = new Set<string>();
  for (const [key, units] of by) {
    if (units.length < 2) continue;
    units.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    units.forEach((u) => inCol.add(u.id));
    collections.push({ key, title: units[0]!.title_pt.split(" · ")[0]!.trim(), units });
  }
  return { collections, singles: packs.filter((p) => !inCol.has(p.id)) };
}

/** Units of a collection from the first unfinished one onward (all, if every unit is done). */
export function fromFirstUnfinished(units: DrillPack[], progress: Record<string, PackProgress>) {
  const i = units.findIndex((u) => !unitDone(progress[u.id]));
  return i <= 0 ? units : units.slice(i);
}
