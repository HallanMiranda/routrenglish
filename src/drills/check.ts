import type { DrillTrap, QaItem, TranslateItem } from "@/data/types";

const CONTRACTIONS: Record<string, string> = {
  "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is", "it's": "it is",
  "what's": "what is", "that's": "that is", "name's": "name is", "isn't": "is not",
  "aren't": "are not", "don't": "do not", "doesn't": "does not", "i'll": "i will",
  "i've": "i have", "there's": "there is", "haven't": "have not", "can't": "cannot", "won't": "will not",
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
    const w = raw[i]!;
    const nx = raw[i + 1] ?? "";
    if (w === "us") { out.push("united", "states"); continue; }
    if (w === "can" && nx === "not") { out.push("cannot"); i++; continue; }
    if (w === "twenty" && UNITS[nx]) { out.push(String(20 + UNITS[nx]!)); i++; continue; }
    if (NUMBERS[w]) { out.push(String(NUMBERS[w]!)); continue; }
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
  const at = (i: number, j: number) => d[i]![j]!;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      d[i]![j] = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + (got[i - 1] === want[j - 1]! ? 0 : 1));
  const ops: DiffOp[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && at(i, j) === at(i - 1, j - 1) + (got[i - 1] === want[j - 1]! ? 0 : 1)) {
      ops.unshift(got[i - 1] === want[j - 1]! ? { type: "equal", word: got[i - 1]! } : { type: "wrong", word: got[i - 1]!, expected: want[j - 1]! });
      i--; j--;
    } else if (i > 0 && at(i, j) === at(i - 1, j) + 1) {
      ops.unshift({ type: "extra", word: got[i - 1]! }); i--;
    } else {
      ops.unshift({ type: "missing", expected: want[j - 1]! }); j--;
    }
  }
  return { distance: at(n, m), ops };
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

/** Words where one letter matters: the attention errors the method trains. */
const STRICT = new Set(["his", "her", "their", "he", "she", "they", "is", "are", "am", "was", "were", "do", "does", "did", "dont", "doesnt", "not", "a", "an", "the", "in", "on", "at", "for", "to", "from", "of"]);

export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/** Lowercased tokens of words capitalized mid-sentence in the accepted answer (names, places). */
function properNouns(text: string) {
  const out = new Set<string>();
  text.split(/\s+/).forEach((w, i) => {
    if (i > 0 && /^[A-Z]/.test(w) && w !== "I") for (const t of normalizeTokens(w)) out.add(t);
  });
  return out;
}

/** Replaces recognizer misspellings with the accepted word: 1 letter for 5+ letter words, 2 for proper nouns. */
export function snapTokens(got: string[], want: string[], proper: Set<string> = new Set()) {
  return got.map((g) => {
    if (want.includes(g) || STRICT.has(g)) return g;
    for (const w of want) {
      if (STRICT.has(w)) continue;
      const d = levenshtein(g, w);
      if (proper.has(w) && d <= 2) return w;
      if (g.length >= 5 && w.length >= 5 && d === 1) return w;
    }
    return g;
  });
}

/** Swaps the recognizer's spellings of the learner's name for the real one. */
export function applyMyName(text: string, name: string, aliases: string[]) {
  let out = text;
  for (const a of aliases.map((x) => x.trim()).filter(Boolean)) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${esc}\\b`, "gi"), name);
  }
  return out;
}

export function checkAnswer(answer: string, accepted: string[], traps: DrillTrap[] = []): CheckResult {
  const raw = normalizeTokens(answer);
  const got = raw;
  let best = { idx: 0, distance: Infinity, ops: [] as DiffOp[], tokens: [] as string[] };
  for (let k = 0; k < accepted.length; k++) {
    const want = normalizeTokens(accepted[k]!);
    const got = snapTokens(raw, want, properNouns(accepted[k]!));
    if (want.join(" ") === got.join(" ")) return { correct: true, closest: accepted[k]!, ops: want.map((w) => ({ type: "equal", word: w })), trap: null };
    const r = wordDiff(got, want);
    if (r.distance < best.distance) best = { idx: k, distance: r.distance, ops: r.ops, tokens: want };
  }
  const trap = traps.find((t) => {
    const tw = normalizeTokens(t.word);
    return containsSeq(got, tw) && !containsSeq(best.tokens, tw);
  }) ?? null;
  return { correct: false, closest: accepted[best.idx] ?? "", ops: best.ops, trap };
}

export const checkTranslate = (answer: string, item: Pick<TranslateItem, "en" | "traps">) => checkAnswer(answer, item.en, item.traps);

/** QA: at least 3 words and contains any accept pattern as a whole-word phrase. */
export function checkQa(answer: string, item: Pick<QaItem, "accept_patterns" | "traps">): { correct: boolean; trap: DrillTrap | null } {
  const got = normalizeTokens(answer);
  const correct = got.length >= 3 && item.accept_patterns.some((p) => containsSeq(got, normalizeTokens(p)));
  if (correct) return { correct, trap: null };
  const trap = item.traps.find((t) => containsSeq(got, normalizeTokens(t.word))) ?? null;
  return { correct, trap };
}

const SWAP_GROUPS = [["his", "her", "their"], ["is", "are", "am"]];
/** Translate mode: the only differences are his/her/their, is/are/am, or a final -s. */
export function isAttentionSlip(ops: DiffOp[]): boolean {
  const diffs = ops.filter((o) => o.type !== "equal");
  if (!diffs.length) return false;
  return diffs.every((o) => {
    if (o.type !== "wrong") return false;
    const a = o.word, b = o.expected;
    if (a + "s" === b || b + "s" === a) return true;
    return SWAP_GROUPS.some((g) => g.includes(a) && g.includes(b));
  });
}

/** Parses "português | english | alt" lines into translate items (no traps, focus "chunks"). */
export function parseDrillLines(text: string): TranslateItem[] {
  return text.split(/\r?\n/).map((l) => l.split("|").map((p) => p.trim())).filter((p) => p.length >= 2 && p[0] && p[1])
    .map((p, i) => ({ id: `u-${Date.now().toString(36)}-${i}`, mode: "translate" as const, pt: p[0]!, en: p.slice(1).filter(Boolean), focus: "chunks", traps: [] }));
}
