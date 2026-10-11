import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Heart, Lock, Volume2, VolumeX, Zap } from "lucide-react";
import { MicButton, type MicState } from "@/components/session/MicButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { repo } from "@/data/repo";
import type { Difficulty, DrillItem, DrillPack, DrillRound, DrillTrap, LadderItem, PuloDoGato, QaItem, TranslateItem } from "@/data/types";
import { checkAnswer, checkQa, checkTranslate, isAttentionSlip, type DiffOp } from "@/drills/check";
import { difficultyOf } from "@/drills/difficulty";
import { playError, playSuccess } from "@/drills/sounds";
import { listenLive } from "@/speech/recognize";
import { speak, stopSpeaking } from "@/speech/speak";
import { t } from "@/lib/i18n/pt-BR";
import { cn } from "@/lib/utils";

const d = t.drills;
const LIVES = 3;
const EXPRESS_ID = "expressa";
const EXPRESS_SIZE = 10;

type Nivel = Difficulty | "todos";
const NIVEIS: Nivel[] = ["todos", "iniciante", "intermediario", "avancado"];

export const Route = createFileRoute("/uberclass/$packId")({
  validateSearch: (s: Record<string, unknown>): { nivel: Nivel } => ({
    nivel: NIVEIS.includes(s["nivel"] as Nivel) ? (s["nivel"] as Nivel) : "todos",
  }),
  head: () => ({
    meta: [
      { title: "Desafio UberClass — Speak Lab" },
      { name: "description", content: "Traduza e responda em inglês falando com o Coach, com vidas e pontos." },
      { property: "og:title", content: "Desafio UberClass — Speak Lab" },
      { property: "og:description", content: "Traduza e responda em inglês falando com o Coach, com vidas e pontos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DrillPage,
});

// ---------- helpers ----------
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]!;
/** What is actually asked: ladders are expanded into one translate item per step (+ a QA item for "free"). */
type Playable = TranslateItem | QaItem;
const modelOf = (i: Playable) => (i.mode === "translate" ? i.en[0]! : i.model_answers[0]!);
const promptPtOf = (i: Playable) => (i.mode === "translate" ? i.pt : i.q_pt);
const LADDER_SECONDS = 6;

interface LadderMeta {
  ladderId: string;
  /** 0-based step index; equals steps.length for the free step. */
  index: number;
  total: number;
  free: boolean;
  prevEn: string | null;
  change: string;
  newWords: string[];
  nextId: string | null;
  fast: boolean;
}

const wordsOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
function newWordsOf(prev: string | null, cur: string) {
  const before = new Set(prev ? wordsOf(prev) : []);
  return cur.split(/\s+/).filter((w) => !before.has(wordsOf(w)[0] ?? ""));
}

/** Expands a ladder into playable steps, keyed by id, plus per-step metadata. */
function expandLadder(l: LadderItem, fast: boolean) {
  const suffix = fast ? "~fast" : "";
  const total = l.steps.length + (l.free ? 1 : 0);
  const ids = Array.from({ length: total }, (_, k) => `${l.id}~s${k}${suffix}`);
  const items: Playable[] = l.steps.map((st, k) => ({
    id: ids[k]!, mode: "translate", pt: st.pt, en: st.en, focus: st.focus, traps: st.traps,
  }));
  if (l.free)
    items.push({
      id: ids[l.steps.length]!, mode: "qa", q_en: l.free.prompt_pt, q_pt: l.free.prompt_pt,
      accept_patterns: l.free.accept_patterns, model_answers: l.free.model_answers, focus: l.steps.at(-1)?.focus ?? "", traps: [],
    });
  const meta: Record<string, LadderMeta> = {};
  items.forEach((it, k) => {
    const prevEn = k > 0 ? l.steps[k - 1]?.en[0] ?? null : null;
    const free = k === l.steps.length;
    meta[it.id] = {
      ladderId: l.id, index: k, total, free, prevEn,
      change: free ? "" : l.steps[k]!.change_pt,
      newWords: free ? [] : newWordsOf(prevEn, l.steps[k]!.en[0]!),
      nextId: ids[k + 1] ?? null, fast,
    };
  });
  return { items, meta, firstId: ids[0]! };
}
const firstWords = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(" ");
const variationId = (parent: string, k: number) => `${parent}~v${k}`;
function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface Run {
  round: DrillRound;
  items: Record<string, Playable>;
  ladder: Record<string, LadderMeta>;
  ladders: Record<string, LadderItem>;
  queue: string[];
  pos: number;
  /** Wrong tries for the current presentation. */
  tries: number;
  lives: number;
  score: number;
  attempted: Set<string>;
  firstTry: Set<string>;
  helped: Set<string>;
  requeued: Set<string>;
  expanded: Set<string>;
  maxTries: Record<string, number>;
  missedFocus: Record<string, number>;
  /** Counts toward pack unlocks (not errors-only or express runs). */
  counts: boolean;
  out: boolean;
}

function newRun(round: DrillRound, list: DrillItem[], counts: boolean): Run {
  const items: Record<string, Playable> = {};
  const ladder: Record<string, LadderMeta> = {};
  const ladders: Record<string, LadderItem> = {};
  const queue: string[] = [];
  for (const it of list) {
    if (it.mode === "ladder") {
      if (!it.steps.length) continue;
      ladders[it.id] = it;
      for (const fast of [false, true]) {
        const x = expandLadder(it, fast);
        for (const p of x.items) items[p.id] = p;
        Object.assign(ladder, x.meta);
        if (!fast) queue.push(x.firstId);
      }
    } else {
      items[it.id] = it;
      queue.push(it.id);
    }
  }
  return {
    round, items, ladder, ladders, queue, pos: 0, tries: 0,
    lives: LIVES, score: 0, attempted: new Set(), firstTry: new Set(), helped: new Set(), requeued: new Set(),
    expanded: new Set(), maxTries: {}, missedFocus: {}, counts, out: false,
  };
}

interface Summary {
  round: DrillRound;
  accuracy: number;
  score: number;
  helped: Playable[];
  /** What "Treinar só os erros" replays: missed items, with ladder steps mapped back to their whole ladder. */
  retry: DrillItem[];
  pulos: { focus: string; text: string }[];
  cards: number;
  counts: boolean;
}

// ---------- page ----------
function DrillPage() {
  const { packId } = Route.useParams();
  const { nivel } = Route.useSearch();
  const express = packId === EXPRESS_ID;
  const [pack, setPack] = useState<DrillPack | null | undefined>(undefined);
  const [pulos, setPulos] = useState<PuloDoGato>({});
  const [bestRound, setBestRound] = useState<DrillRound>(1);
  const [run, setRun] = useState<Run | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [muted, setMuted] = useState(false);

  const buildExpress = useCallback(async () => {
    const all = (await repo.listDrillPacks()).filter((p) => nivel === "todos" || difficultyOf(p.level) === nivel);
    return shuffle(all.flatMap((p) => p.items)).slice(0, EXPRESS_SIZE);
  }, [nivel]);

  const start = useCallback((round: DrillRound, list: DrillItem[], counts: boolean) => {
    setSummary(null);
    setRun(newRun(round, list, counts));
    setRunKey((k) => k + 1);
  }, []);

  const refresh = useCallback(async () => {
    setPulos(await repo.getPuloDoGato());
    setMuted(await repo.getSoundMuted());
    if (express) {
      const items = await buildExpress();
      setPack({ id: EXPRESS_ID, title_pt: d.expressTitle, level: "", focus_pt: "", items });
      return;
    }
    const p = await repo.getDrillPack(packId);
    setPack(p);
    if (p) setBestRound((await repo.getPackProgress(p.id)).best_round);
  }, [packId, express, buildExpress]);

  useEffect(() => {
    void refresh();
    return () => stopSpeaking();
  }, [refresh]);

  // Express starts directly in round 3.
  useEffect(() => {
    if (express && pack && pack.items.length && !run && !summary) start(3, pack.items, false);
  }, [express, pack, run, summary, start]);

  async function toggleMute() {
    setMuted(!muted);
    await repo.setSoundMuted(!muted);
  }

  async function finish(r: Run) {
    if (!pack) return;
    const attempted = Object.values(r.items).filter((i) => r.attempted.has(i.id));
    const retry = missedOf(r);
    const accuracy = attempted.length ? r.firstTry.size / attempted.length : 0;
    const helped = attempted.filter((i) => r.helped.has(i.id));
    const hard = attempted.filter((i) => (r.maxTries[i.id] ?? 0) >= 3);
    for (const i of hard) await repo.createCard({ front: promptPtOf(i), back: modelOf(i) });
    if (r.counts) await repo.saveDrillAttempt({ pack_id: pack.id, round: r.round, accuracy, helped_item_ids: helped.map((i) => i.id) });
    const topFocus = Object.entries(r.missedFocus).sort((a, b) => b[1] - a[1]).slice(0, 3);
    setRun(null);
    setSummary({
      round: r.round, accuracy, score: r.score, helped, retry, cards: hard.length, counts: r.counts,
      pulos: topFocus.filter(([f]) => pulos[f]).map(([f]) => ({ focus: f, text: pulos[f]! })),
    });
    if (!express) void refresh();
  }

  function missedOf(r: Run): DrillItem[] {
    const out: DrillItem[] = [];
    const seenLadders = new Set<string>();
    for (const id of r.helped) {
      const m = r.ladder[id];
      if (m) {
        if (!seenLadders.has(m.ladderId)) { seenLadders.add(m.ladderId); out.push(r.ladders[m.ladderId]!); }
      } else if (r.items[id]) out.push(r.items[id]!);
    }
    return out;
  }
  function restartErrors(r: Run) {
    const missed = missedOf(r);
    start(r.round, missed.length ? missed : [...Object.values(r.items).filter((i) => !r.ladder[i.id]), ...Object.values(r.ladders)], false);
  }

  if (pack === undefined) return <div className="min-h-dvh bg-background" />;
  if (pack === null || (express && pack.items.length === 0))
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p>{express ? d.empty : d.notFound}</p>
        <Button asChild><Link to="/uberclass">{d.toPacks}</Link></Button>
      </div>
    );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="icon" asChild aria-label={d.back}>
          <Link to="/uberclass" onClick={() => stopSpeaking()}><ArrowLeft /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-bold leading-tight">
            {express && <Zap className="size-4 text-primary" />}{pack.title_pt}
          </p>
          {run && (
            <p className="text-xs text-muted-foreground">
              {d.roundOf(run.round)} · {d.rounds[run.round]} · {d.progress(Math.min(run.pos + 1, run.queue.length), run.queue.length)}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={toggleMute} aria-label={muted ? d.unmute : d.mute} aria-pressed={muted}>
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
      </header>
      {run ? (
        <DrillRunner key={runKey} run={run} setRun={setRun} onFinish={finish} onRestart={restartErrors} pulos={pulos} muted={muted} />
      ) : summary ? (
        <SummaryView
          summary={summary}
          express={express}
          onNext={() => start((summary.round + 1) as DrillRound, pack.items, true)}
          onRepeat={async () => (express ? start(3, await buildExpress(), false) : start(summary.round, pack.items, true))}
          onErrors={() => start(summary.round, summary.retry, false)}
        />
      ) : (
        !express && <RoundPicker best={bestRound} onPick={(r) => start(r, pack.items, true)} />
      )}
    </div>
  );
}

function RoundPicker({ best, onPick }: { best: DrillRound; onPick: (r: DrillRound) => void }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-5 pb-8">
      <h2 className="mb-4 text-2xl font-bold">{d.chooseRound}</h2>
      <ul className="space-y-3">
        {([1, 2, 3, 4] as DrillRound[]).map((r) => {
          const locked = r > best;
          return (
            <li key={r}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onPick(r)}
                className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors enabled:hover:border-primary disabled:opacity-55"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">{r}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{d.rounds[r]}</span>
                  {locked && <span className="block text-xs text-muted-foreground">{d.locked}</span>}
                </span>
                {locked && <Lock className="size-4 text-muted-foreground" />}
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function SummaryView({ summary, express, onNext, onRepeat, onErrors }: { summary: Summary; express: boolean; onNext: () => void; onRepeat: () => void; onErrors: () => void }) {
  const passed = summary.accuracy >= 0.8;
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-5 overflow-y-auto px-5 pb-8">
      <h2 className="text-2xl font-bold">{d.endTitle}</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">{d.endAccuracy}</p>
          <p className="font-display text-4xl font-bold">{Math.round(summary.accuracy * 100)}%</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">{d.endScore}</p>
          <p className="font-display text-4xl font-bold">{summary.score}</p>
        </div>
      </div>
      {summary.counts && (
        <p className="text-center text-sm font-medium">
          {passed ? (summary.round < 4 ? d.unlocked(summary.round + 1) : d.finished) : d.retryHint}
        </p>
      )}
      <div>
        <h3 className="mb-2 font-semibold">{d.needHelp}</h3>
        {summary.helped.length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.noHelp}</p>
        ) : (
          <ul className="space-y-2">
            {summary.helped.map((i) => (
              <li key={i.id} className="rounded-xl border bg-card p-3 text-sm">
                <p className="text-muted-foreground">{promptPtOf(i)}</p>
                <p className="font-semibold" lang="en">{modelOf(i)}</p>
              </li>
            ))}
          </ul>
        )}
        {summary.cards > 0 && <p className="mt-2 text-sm text-muted-foreground">{d.cardsCreated(summary.cards)}</p>}
      </div>
      {summary.pulos.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">{d.pulosTitle}</h3>
          <ul className="space-y-2">
            {summary.pulos.map((p) => (
              <li key={p.focus}><PuloCard text={p.text} /></li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        {passed && summary.counts && summary.round < 4 && <Button size="lg" className="w-full" onClick={onNext}>{d.nextRound}</Button>}
        {summary.helped.length > 0 && <Button size="lg" variant="secondary" className="w-full" onClick={onErrors}>{d.onlyErrors}</Button>}
        <Button size="lg" variant="outline" className="w-full" onClick={onRepeat}>{express ? d.express : d.repeatRound}</Button>
        <Button variant="ghost" className="w-full" asChild><Link to="/uberclass">{d.toPacks}</Link></Button>
      </div>
    </main>
  );
}

// ---------- runner ----------
type Feedback =
  | { kind: "praise"; text: string; clear: boolean; otherWay: string | null; grows: boolean }
  | { kind: "almost"; text: string; ops: DiffOp[] | null; pulo: string | null }
  | { kind: "half"; text: string; ops: DiffOp[] | null }
  | { kind: "repeat"; text: string }
  | null;

function DrillRunner({ run, setRun, onFinish, onRestart, pulos, muted }: {
  run: Run;
  setRun: (r: Run) => void;
  onFinish: (r: Run) => void;
  onRestart: (r: Run) => void;
  pulos: PuloDoGato;
  muted: boolean;
}) {
  const item = run.items[run.queue[run.pos]!]!;
  const isQa = item.mode === "qa";
  const model = modelOf(item);
  const meta = run.ladder[item.id] ?? null;
  const [showNew, setShowNew] = useState(false);
  const [review, setReview] = useState<{ ladder: LadderItem; next: Run } | null>(null);
  const [mic, setMic] = useState<MicState>("idle");
  const [heard, setHeard] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [showPt, setShowPt] = useState(false);
  const [fine, setFine] = useState<string | null>(null);
  const [lostHeart, setLostHeart] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const repeatMode = feedback?.kind === "repeat";
  const praised = feedback?.kind === "praise";
  const stepKey = `${run.pos}-${run.queue[run.pos]}`;
  const sfx = (ok: boolean) => { if (!muted) (ok ? playSuccess : playError)(); };

  const sayPrompt = useCallback((rate = 1) => {
    if (meta) void speak(item.mode === "qa" ? item.q_pt : item.pt, { lang: "pt-BR", rate }).catch(() => {});
    else if (item.mode === "qa") void speak(item.q_en, { lang: "en-US", rate }).catch(() => {});
    else if (run.round === 1) void speak(item.en[0]!, { lang: "en-US", rate: 0.9 * rate }).catch(() => {});
    else void speak(item.pt, { lang: "pt-BR", rate }).catch(() => {});
  }, [item, run.round, meta]);

  // New challenge: reset and let the tutor speak.
  useEffect(() => {
    setHeard(""); setFeedback(null); setTyped(""); setMicError(null); setShowPt(false); setShowNew(false);
    busyRef.current = false;
    const timer = window.setTimeout(() => sayPrompt(), 300);
    // Ladder round 1: highlight the new words after 3 s if the learner hasn't started.
    const hl = meta && run.round === 1 ? window.setTimeout(() => setShowNew(true), 3000) : undefined;
    return () => { window.clearTimeout(timer); window.clearTimeout(hl); abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  // Fine toast auto-hide.
  useEffect(() => {
    if (!fine) return;
    const id = window.setTimeout(() => { setFine(null); setLostHeart(null); }, 2200);
    return () => window.clearTimeout(id);
  }, [fine]);

  // Round 4 countdown: 6 s translate, 8 s QA.
  useEffect(() => {
    const timed = run.round === 4 || meta?.fast === true;
    if (!timed || repeatMode || praised || run.out || review) { setSecondsLeft(null); return; }
    setSecondsLeft(meta && !meta.free ? LADDER_SECONDS : isQa ? 8 : 6);
    const id = window.setInterval(() => setSecondsLeft((s) => (s === null ? s : s - 1)), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, run.tries, run.round, repeatMode, praised, run.out, review]);
  useEffect(() => {
    if (secondsLeft === 0 && mic !== "processing") {
      abortRef.current?.abort();
      handleAnswer("", null, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  /** After a correct answer: a finished ladder shows its review first. */
  function proceed(next: Run) {
    if (meta && !meta.nextId) {
      const ladder = next.ladders[meta.ladderId];
      if (ladder) { stopSpeaking(); setFeedback(null); setHeard(""); setReview({ ladder, next }); return; }
    }
    advance(next);
  }
  function redoFast() {
    if (!review) return;
    const { ladder, next } = review;
    const fast = expandLadder(ladder, true);
    const queue = [...next.queue];
    queue.splice(next.pos + 1, 0, ...fast.items.map((i) => i.id));
    setReview(null);
    advance({ ...next, queue });
  }

  function advance(next: Run) {
    if (next.pos + 1 >= next.queue.length) onFinish(next);
    else setRun({ ...next, pos: next.pos + 1, tries: 0 });
  }

  function evaluate(answer: string): { correct: boolean; ops: DiffOp[] | null; trap: DrillTrap | null; slip: boolean } {
    if (repeatMode) {
      const r = checkAnswer(answer, [model]);
      return { correct: r.correct, ops: r.ops, trap: null, slip: false };
    }
    if (item.mode === "qa") {
      const r = checkQa(answer, item);
      return { correct: r.correct, ops: null, trap: r.trap, slip: false };
    }
    const r = checkTranslate(answer, item);
    return { correct: r.correct, ops: r.ops, trap: r.trap, slip: !r.correct && isAttentionSlip(r.ops) };
  }

  function handleAnswer(answer: string, confidence: number | null, timeUp = false) {
    if (busyRef.current || run.out) return;
    const res = timeUp ? { correct: false, ops: null, trap: null, slip: false } : evaluate(answer);
    const attempted = new Set(run.attempted).add(item.id);
    const firstPresentation = !run.attempted.has(item.id);

    if (res.correct) {
      busyRef.current = true;
      sfx(true);
      const firstTry = new Set(run.firstTry);
      if (firstPresentation && run.tries === 0) firstTry.add(item.id);
      const queue = [...run.queue];
      const items = { ...run.items };
      const expanded = new Set(run.expanded);
      const requeued = new Set(run.requeued);
      // Variations chain right after the item.
      if (item.mode === "translate" && item.variations?.length && !expanded.has(item.id)) {
        expanded.add(item.id);
        const vars: TranslateItem[] = item.variations.map((v, k) => ({
          id: variationId(item.id, k), mode: "translate", pt: v.pt, en: v.en, focus: item.focus, traps: item.traps,
        }));
        for (const v of vars) items[v.id] = v;
        queue.splice(run.pos + 1, 0, ...vars.map((v) => v.id));
      }
      // Ladders never skip: the next step comes right after this one.
      if (meta?.nextId) queue.splice(run.pos + 1, 0, meta.nextId);
      // Missed items go back to the end of the round once (ladder steps are completed in place).
      if (!meta && run.helped.has(item.id) && !requeued.has(item.id)) {
        requeued.add(item.id);
        queue.push(item.id);
      }
      const gained = run.tries === 0 ? 10 : run.tries === 1 ? 5 : 0;
      const next: Run = { ...run, items, queue, attempted, firstTry, expanded, requeued, score: run.score + gained };
      const clear = confidence !== null && confidence >= 0.85 && Math.random() < 0.4;
      const otherWay = isQa && !repeatMode ? pick(item.model_answers) : null;
      const grows = !!meta?.nextId;
      setFeedback({ kind: "praise", text: pick(d.praise), clear, otherWay, grows });
      setRun(next);
      if (!otherWay) window.setTimeout(() => proceed(next), grows ? 1500 : 1100);
      return;
    }

    sfx(false);
    const tries = run.tries + 1;
    const helped = new Set(run.helped).add(item.id);
    const maxTries = { ...run.maxTries, [item.id]: Math.max(run.maxTries[item.id] ?? 0, tries) };
    const missedFocus = { ...run.missedFocus, [item.focus]: (run.missedFocus[item.focus] ?? 0) + 1 };
    let { lives, score } = run;
    const multa = !timeUp && !repeatMode && (res.trap !== null || res.slip);
    if (multa) {
      setLostHeart(lives - 1);
      lives -= 1;
      score = Math.max(0, score - 5);
      setFine(pick(d.fines));
    }
    const out = lives <= 0;
    setRun({ ...run, attempted, tries, helped, maxTries, missedFocus, lives, score, out });
    if (out) { stopSpeaking(); return; }

    if (tries >= 3 || repeatMode) {
      setFeedback({ kind: "repeat", text: model });
      void speak(model, { lang: "en-US", rate: 0.85 }).catch(() => {});
    } else if (tries === 2) {
      const words = model.split(/\s+/);
      setFeedback({ kind: "half", text: firstWords(model, Math.max(1, Math.ceil(words.length / 2))) + " …", ops: res.ops });
    } else {
      const text = timeUp ? d.timeUp : res.trap?.hint_pt ?? (isQa ? d.qaAlmost : d.almost);
      setFeedback({ kind: "almost", text, ops: res.ops, pulo: pulos[item.focus] ?? null });
    }
  }

  async function toggleMic() {
    if (mic === "recording") { abortRef.current?.abort(); return; }
    stopSpeaking();
    setMicError(null); setHeard("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setMic("recording");
    try {
      const r = await listenLive({ lang: "en-US", signal: ctrl.signal, onInterim: setHeard });
      setMic("processing");
      setHeard(r.transcript);
      await new Promise((res) => window.setTimeout(res, 250));
      setMic("idle");
      if (r.transcript) handleAnswer(r.transcript, r.confidence);
    } catch (e) {
      setMic("idle");
      setMicError(e instanceof Error ? e.message : t.speech.failed);
      setTyping(true);
    }
  }

  function submitTyped() {
    if (!typed.trim()) return;
    setHeard(typed.trim());
    handleAnswer(typed.trim(), null);
    setTyped("");
  }

  const bubble = repeatMode ? d.repeatWithMe
    : meta?.free ? d.ladderFreePrompt
    : meta ? d.promptTranslate
    : isQa ? d.promptAnswer
    : run.round === 1 ? d.promptRepeat : d.promptTranslate;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 px-4 pb-4">
      {/* Tutor panel */}
      <section className="relative flex flex-1 flex-col overflow-hidden rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">
            {meta ? d.badgeLadder : isQa ? d.badgeAnswer : d.badgeTranslate}
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-0.5" aria-label={d.lives(run.lives)}>
              {Array.from({ length: LIVES }, (_, i) => (
                <Heart
                  key={i}
                  className={cn(
                    "size-5",
                    i < run.lives ? "fill-primary text-primary" : "text-muted-foreground/40",
                    lostHeart === i && "animate-heart-out text-primary",
                  )}
                />
              ))}
            </span>
            <span className="font-display text-sm font-bold tabular-nums">{d.points(run.score)}</span>
          </div>
        </div>

        {fine && (
          <div role="status" className="absolute inset-x-4 top-12 z-10 rounded-xl bg-destructive px-3 py-2 text-center text-sm font-semibold text-destructive-foreground shadow animate-in fade-in slide-in-from-top-2">
            {fine}
          </div>
        )}

        <div key={stepKey} className="flex flex-1 flex-col animate-story">
          <div className="mt-3 flex items-center gap-3">
            <CoachAvatar talking={!feedback || feedback.kind === "repeat"} />
            <div className="rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">
              {feedback?.kind === "praise" ? <span>{feedback.text}{feedback.clear && ` ${d.clear}`}{feedback.grows && ` ${d.ladderGrows}`}</span>
                : feedback?.kind === "almost" ? feedback.text
                : feedback?.kind === "half" ? d.half
                : bubble}
            </div>
            {secondsLeft !== null && (
              <span className={cn("ml-auto rounded-full px-2.5 py-1 font-display text-sm font-bold tabular-nums", secondsLeft <= 2 ? "bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground")}>
                {d.timeLeft(Math.max(0, secondsLeft))}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-center gap-3 py-4 text-center">
            {meta && !repeatMode ? (
              <LadderChallenge item={item} meta={meta} round={run.round} showNew={showNew && mic === "idle" && !heard} />
            ) : (
              <Challenge item={item} round={run.round} repeatMode={repeatMode} showPt={showPt} onShowPt={() => setShowPt(true)} onReplay={sayPrompt} />
            )}
            {feedback?.kind === "half" && <p lang="en" className="text-lg font-semibold text-primary">{feedback.text}</p>}
            {feedback?.kind === "almost" && feedback.pulo && <PuloCard text={feedback.pulo} />}
            {feedback?.kind === "praise" && feedback.otherWay && (
              <div className="space-y-3">
                <div className="rounded-xl bg-muted p-3 text-left">
                  <p className="text-xs font-semibold text-muted-foreground">{d.otherWay}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p lang="en" className="flex-1 font-semibold">{feedback.otherWay}</p>
                    <Button size="icon" variant="ghost" aria-label={d.play} onClick={() => void speak(feedback.otherWay!, { lang: "en-US" }).catch(() => {})}>
                      <Volume2 />
                    </Button>
                  </div>
                </div>
                <Button className="w-full" onClick={() => { stopSpeaking(); proceed(run); }}>{d.next}</Button>
              </div>
            )}
          </div>
        </div>

        {review && <LadderReview ladder={review.ladder} onFast={redoFast} onContinue={() => { const n = review.next; setReview(null); advance(n); }} />}

        {run.out && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-card/95 p-6 text-center">
            <Heart className="size-10 text-muted-foreground" />
            <p className="font-display text-xl font-bold">{d.noLives}</p>
            <Button size="lg" onClick={() => onRestart(run)}>{d.restart}</Button>
          </div>
        )}
      </section>

      {/* Learner panel */}
      <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl bg-muted/60 p-5 ring-1 ring-border">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.you}</p>
        <div className="min-h-[3.5rem] w-full text-center">
          {(feedback?.kind === "almost" || feedback?.kind === "half") && feedback.ops ? (
            <DiffLine ops={feedback.ops} />
          ) : heard ? (
            <p lang="en" className="text-lg font-medium">{heard}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{mic === "recording" ? d.listening : d.tapToSpeak}</p>
          )}
        </div>
        <MicButton state={mic} onClick={toggleMic} disabled={praised || run.out} />
        {micError && <p className="text-center text-sm text-destructive">{micError}</p>}
        {typing ? (
          <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); submitTyped(); }}>
            <Input lang="en" autoCapitalize="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={d.typePlaceholder} disabled={praised || run.out} />
            <Button type="submit" disabled={praised || run.out}>{d.send}</Button>
          </form>
        ) : (
          <button type="button" className="text-sm font-medium text-muted-foreground underline underline-offset-4" onClick={() => setTyping(true)}>
            {d.type}
          </button>
        )}
      </section>
    </div>
  );
}

function LadderChallenge({ item, meta, round, showNew }: { item: Playable; meta: LadderMeta; round: DrillRound; showNew: boolean }) {
  const pt = item.mode === "qa" ? item.q_pt : item.pt;
  const showPrev = (round <= 2 || meta.free) && meta.prevEn;
  return (
    <div className="flex items-stretch gap-3 text-left">
      <LadderRail index={meta.index} total={meta.total} />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {meta.free ? d.ladderFree : d.ladderStep(meta.index + 1, meta.total)}
        </p>
        {showPrev && (
          <p lang="en" className="text-sm text-muted-foreground"><span className="font-semibold">{d.previous}</span> {meta.prevEn}</p>
        )}
        {meta.change && (
          <span className="w-fit rounded-full bg-live px-2.5 py-0.5 text-xs font-bold text-live-foreground">{meta.change}</span>
        )}
        <p className="font-display text-2xl font-bold leading-tight">{pt}</p>
        {round === 1 && showNew && meta.newWords.length > 0 && (
          <p className="text-sm text-muted-foreground animate-in fade-in">
            {d.ladderNewWords}{" "}
            {meta.newWords.map((w, i) => (
              <mark key={i} lang="en" className="mr-1 rounded bg-live/40 px-1 font-semibold text-foreground">{w}</mark>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

function LadderRail({ index, total }: { index: number; total: number }) {
  return (
    <ol className="flex flex-col-reverse justify-center gap-1" aria-label={d.ladderStep(index + 1, total)}>
      {Array.from({ length: total }, (_, k) => (
        <li
          key={k}
          className={cn(
            "h-3 w-6 rounded-sm",
            k < index ? "bg-primary" : k === index ? "bg-live ring-2 ring-primary" : "bg-muted",
          )}
        />
      ))}
    </ol>
  );
}

function LadderReview({ ladder, onFast, onContinue }: { ladder: LadderItem; onFast: () => void; onContinue: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col gap-3 overflow-y-auto bg-card p-5">
      <p className="font-display text-xl font-bold">{d.ladderDone}</p>
      <p className="text-sm text-muted-foreground">{ladder.title_pt}</p>
      <ol className="space-y-2">
        {ladder.steps.map((st, k) => (
          <li key={k} className="rounded-xl bg-muted p-2.5 text-sm">
            <p className="text-muted-foreground">{st.pt}</p>
            <div className="flex items-center gap-2">
              <p lang="en" className="flex-1 font-semibold">{st.en[0]}</p>
              <Button size="icon" variant="ghost" aria-label={d.play} onClick={() => void speak(st.en[0]!, { lang: "en-US" }).catch(() => {})}>
                <Volume2 />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-auto space-y-2 pt-2">
        <Button className="w-full" onClick={onFast}><Zap /> {d.ladderAgain}</Button>
        <Button variant="outline" className="w-full" onClick={onContinue}>{d.ladderContinue}</Button>
      </div>
    </div>
  );
}

function Challenge({ item, round, repeatMode, showPt, onShowPt, onReplay }: {
  item: Playable;
  round: DrillRound;
  repeatMode: boolean;
  showPt: boolean;
  onShowPt: () => void;
  onReplay: (rate?: number) => void;
}) {
  const model = modelOf(item);
  if (repeatMode)
    return (
      <>
        <p lang="en" className="font-display text-3xl font-bold leading-tight">{model}</p>
        <p className="text-sm text-muted-foreground">{promptPtOf(item)}</p>
      </>
    );

  if (item.mode === "translate") {
    if (round === 1)
      return (
        <>
          <p lang="en" className="font-display text-3xl font-bold leading-tight">{model}</p>
          <p className="text-sm text-muted-foreground">{item.pt}</p>
        </>
      );
    return (
      <>
        <p className="font-display text-3xl font-bold leading-tight">{item.pt}</p>
        {round === 2 && (
          <p className="text-sm text-muted-foreground">{d.hintStart} <span lang="en" className="font-semibold text-foreground">{firstWords(model, 1)} …</span></p>
        )}
      </>
    );
  }

  // QA
  const replayButtons = (
    <div className="flex justify-center gap-2">
      <Button size="sm" variant="outline" onClick={() => onReplay(1)}><Volume2 /> {d.hearAgain}</Button>
      <Button size="sm" variant="outline" onClick={() => onReplay(0.75)}>{d.slower}</Button>
    </div>
  );
  if (round === 4)
    return (
      <>
        <Volume2 className="mx-auto size-12 text-primary" />
        <p className="font-display text-xl font-bold">{d.listenOnly}</p>
        {replayButtons}
      </>
    );
  return (
    <>
      <p lang="en" className="font-display text-3xl font-bold leading-tight">{item.q_en}</p>
      {round === 1 && (
        <>
          <p className="text-sm text-muted-foreground">{item.q_pt}</p>
          <p className="text-sm text-muted-foreground">{d.modelAnswer} <span lang="en" className="font-semibold text-foreground">{model}</span></p>
        </>
      )}
      {round === 2 && (
        <p className="text-sm text-muted-foreground">{d.hintStart} <span lang="en" className="font-semibold text-foreground">{firstWords(model, 2)} …</span></p>
      )}
      {round === 3 && (
        <>
          {showPt ? (
            <p className="text-sm text-muted-foreground">{item.q_pt}</p>
          ) : (
            <button type="button" className="text-sm font-medium text-muted-foreground underline underline-offset-4" onClick={onShowPt}>{d.showPt}</button>
          )}
          {replayButtons}
        </>
      )}
    </>
  );
}

function PuloCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border-l-4 border-live bg-live/15 p-3 text-left text-sm">
      <p className="text-xs font-bold uppercase tracking-wide">🐈 {d.pulo}</p>
      <p className="mt-1">{text}</p>
    </div>
  );
}

function DiffLine({ ops }: { ops: DiffOp[] }) {
  return (
    <p lang="en" className="flex flex-wrap justify-center gap-x-1.5 gap-y-1 text-lg font-medium">
      {ops.map((o, i) =>
        o.type === "equal" ? <span key={i}>{o.word}</span>
        : o.type === "wrong" ? <mark key={i} className="rounded bg-destructive/15 px-1 text-destructive">{o.word}</mark>
        : o.type === "extra" ? <del key={i} className="rounded px-1 text-destructive" title={d.extra}>{o.word}</del>
        : <span key={i} className="rounded border border-dashed border-destructive px-1.5 text-destructive" title={d.missing}>?</span>,
      )}
    </p>
  );
}

function CoachAvatar({ talking }: { talking: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center">
      <svg viewBox="0 0 64 64" className="size-14" role="img" aria-label={d.coach}>
        <circle cx="32" cy="32" r="31" className="fill-primary" />
        <circle cx="32" cy="36" r="18" className="fill-background" />
        <path d="M14 30c2-12 10-18 18-18s16 6 18 18c-6-6-12-8-18-8s-12 2-18 8z" className="fill-foreground" />
        <circle cx="25" cy="35" r="2.4" className="fill-foreground" />
        <circle cx="39" cy="35" r="2.4" className="fill-foreground" />
        <rect x="27" y="42" width="10" height={talking ? 5 : 2} rx="2.5" className={cn("fill-primary", talking && "motion-safe:animate-pulse")} />
      </svg>
      <span className="text-[10px] font-semibold">{d.coach}</span>
    </div>
  );
}
