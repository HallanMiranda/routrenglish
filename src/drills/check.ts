import type { DrillItem, DrillTrap } from "@/data/types";

const CONTRACTIONS: Record<string, string> = {
  "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is", "it's": "it is",
  "what's": "what is", "that's": "that is", "name's": "name is", "isn't": "is not",
  "aren't": "are not", "don't": "do not", "doesn't": "does not", "i'll": "i will",
  "i've": "i have", "can't": "cannot", "won't": "will not",
};
const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const NUMBERS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
};

/** Normalizes an English answer into comparable tokens. */
export function normalizeTokens(text: string): string[] {
  let s = text.toLowerCase().replace(/[’‘`]/g, "'");
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/\bu\.\s?s\.?(?=\s|$|[^a-z])/g, " united states ");
  s = s.replace(/[a-z]+'[a-z]+/g, (w) => CONTRACTIONS[w] ?? w);
  s = s.replace(/'/g, "").replace(/[^a-z0-9\s]/g, " ");
  const raw = s.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    if (w === "us") { out.push("united", "states"); continue; }
    if (w === "can" && raw[i + 1] === "not") { out.push("cannot"); i++; continue; }
    if (w === "twenty" && UNITS[raw[i + 1]]) { out.push(String(20 + UNITS[raw[i + 1]])); i++; continue; }
    if (NUMBERS[w]) { out.push(String(NUMBERS[w])); continue; }
    out.push(w);
  }
  return out;
}

export type DiffOp =
  | { type: "equal"; word: string }
  | { type: "wrong"; word: string; expected: string }
  | { type: "missing"; expected: string }
  | { type: "extra"; word: string };

/** Word-level edit distance with the operations to turn `got` into `want`. */
export function wordDiff(got: string[], want: string[]): { distance: number; ops: DiffOp[] } {
  const n = got.length, m = want.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (got[i - 1] === want[j - 1] ? 0 : 1));
  const ops: DiffOp[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (got[i - 1] === want[j - 1] ? 0 : 1)) {
      ops.unshift(got[i - 1] === want[j - 1] ? { type: "equal", word: got[i - 1] } : { type: "wrong", word: got[i - 1], expected: want[j - 1] });
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.unshift({ type: "extra", word: got[i - 1] }); i--;
    } else {
      ops.unshift({ type: "missing", expected: want[j - 1] }); j--;
    }
  }
  return { distance: d[n][m], ops };
}

function containsSeq(tokens: string[], seq: string[]) {
  if (!seq.length) return false;
  for (let i = 0; i + seq.length <= tokens.length; i++)
    if (seq.every((w, k) => tokens[i + k] === w)) return true;
  return false;
}

export interface CheckResult {
  correct: boolean;
  /** Closest accepted answer (original text). */
  closest: string;
  ops: DiffOp[];
  trap: DrillTrap | null;
}

export function checkAnswer(answer: string, accepted: string[], traps: DrillTrap[] = []): CheckResult {
  const got = normalizeTokens(answer);
  let best = { idx: 0, distance: Infinity, ops: [] as DiffOp[], tokens: [] as string[] };
  for (let k = 0; k < accepted.length; k++) {
    const want = normalizeTokens(accepted[k]);
    if (want.join(" ") === got.join(" ")) return { correct: true, closest: accepted[k], ops: want.map((w) => ({ type: "equal", word: w })), trap: null };
    const r = wordDiff(got, want);
    if (r.distance < best.distance) best = { idx: k, distance: r.distance, ops: r.ops, tokens: want };
  }
  const trap = traps.find((t) => {
    const tw = normalizeTokens(t.word);
    return containsSeq(got, tw) && !containsSeq(best.tokens, tw);
  }) ?? null;
  return { correct: false, closest: accepted[best.idx] ?? "", ops: best.ops, trap };
}

export const checkItem = (answer: string, item: DrillItem) => checkAnswer(answer, item.en, item.traps);

/** Parses "português | english | alt" lines into drill items (no traps). */
export function parseDrillLines(text: string): DrillItem[] {
  return text.split(/\r?\n/).map((l) => l.split("|").map((p) => p.trim())).filter((p) => p.length >= 2 && p[0] && p[1])
    .map((p, i) => ({ id: `u-${Date.now().toString(36)}-${i}`, pt: p[0], en: p.slice(1).filter(Boolean), focus: "custom", traps: [] }));
}
