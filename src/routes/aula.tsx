import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HelpCircle, Pause, Play, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicButton, type MicState } from "@/components/session/MicButton";
import { CoachAvatar, DiffLine, Hearts, LIVES, PuloCard } from "@/components/drill/CoachParts";
import { repo } from "@/data/repo";
import type { Difficulty, DrillPack, DrillTrap, PuloDoGato } from "@/data/types";
import { checkAnswer, checkQa, checkTranslate, isAttentionSlip, type DiffOp } from "@/drills/check";
import { difficultyOf } from "@/drills/difficulty";
import { aiJudge, withMyName } from "@/ai/judge";
import { aiFor } from "@/ai/client";
import { liveLessonTurn, type LessonTurn, type LiveLessonReply } from "@/ai/liveLesson";
import { detectCommand, hearOnce, type VoiceCommand } from "@/lesson/hear";
import { speak, stopSpeaking } from "@/speech/speak";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n/pt-BR";

const L = t.lesson;
const d = t.drills;

type Nivel = Difficulty | "todos";
interface LessonSearch {
  modo: "pacotes" | "livre";
  pack: string;
  tema: string;
  min: number;
  nivel: Nivel;
}

export const Route = createFileRoute("/aula")({
  validateSearch: (s: Record<string, unknown>): LessonSearch => ({
    modo: s["modo"] === "livre" ? "livre" : "pacotes",
    pack: typeof s["pack"] === "string" ? s["pack"] : "",
    tema: typeof s["tema"] === "string" ? s["tema"] : "",
    min: [5, 10, 15].includes(Number(s["min"])) ? Number(s["min"]) : 10,
    nivel: (["todos", "iniciante", "intermediario", "avancado"] as const).find((n) => n === s["nivel"]) ?? "todos",
  }),
  head: () => ({
    meta: [
      { title: L.meta },
      { name: "description", content: "Aula falada com o Coach: ele pergunta em português, você responde em inglês, sem tocar na tela." },
      { property: "og:title", content: L.meta },
      { property: "og:description", content: "Aula falada com o Coach: ele pergunta em português, você responde em inglês, sem tocar na tela." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LessonPage,
});

interface Chunk {
  pt: string;
  accepted: string[];
  focus: string;
  traps: DrillTrap[];
  change: string;
  prevEn: string | null;
  /** Free step: judged by meaning (AI) or local patterns. */
  patterns?: string[];
  first: boolean;
}
interface Verdict {
  correct: boolean;
  hint: string;
  model: string;
  multa: boolean;
  ops: DiffOp[] | null;
  pulo: string;
}
interface Summary {
  seconds: number;
  completed: number;
  accuracy: number;
  missed: { focus: string; pulo: string }[];
  cards: number;
  cost: number | null;
}
type Listened = { text: string } | { cmd: VoiceCommand } | null;

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]!;
const LEVEL: Record<string, string> = { iniciante: "A1", intermediario: "A2", avancado: "B1", todos: "A2" };

/** Ladder steps (then the free prompt) become chains; packs without ladders use their translate items. */
function chainsOf(packs: DrillPack[]): Chunk[][] {
  const chains: Chunk[][] = [];
  for (const p of packs)
    for (const it of p.items) {
      if (it.mode === "ladder" && it.steps.length) {
        const chain: Chunk[] = it.steps.map((st, k) => ({
          pt: st.pt, accepted: st.en, focus: st.focus, traps: st.traps, change: st.change_pt, prevEn: k > 0 ? it.steps[k - 1]!.en[0]! : null, first: k === 0,
        }));
        if (it.free) chain.push({ pt: it.free.prompt_pt, accepted: it.free.model_answers, patterns: it.free.accept_patterns, focus: it.steps.at(-1)!.focus, traps: [], change: "", prevEn: null, first: false });
        chains.push(chain);
      }
    }
  if (chains.length) return chains;
  for (const p of packs)
    for (const it of p.items)
      if (it.mode === "translate") chains.push([{ pt: it.pt, accepted: it.en, focus: it.focus, traps: it.traps, change: "", prevEn: null, first: true }]);
  return chains.sort(() => Math.random() - 0.5);
}

function LessonPage() {
  const search = Route.useSearch();
  const [phase, setPhase] = useState<"ready" | "live" | "summary">("ready");
  const [coach, setCoach] = useState("");
  const [talking, setTalking] = useState(false);
  const [chunk, setChunk] = useState<Chunk | null>(null);
  const [heard, setHeard] = useState("");
  const [ops, setOps] = useState<DiffOp[] | null>(null);
  const [pulo, setPulo] = useState<string | null>(null);
  const [mic, setMic] = useState<MicState>("idle");
  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(search.min * 60);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const btnCmd = useRef<VoiceCommand | null>(null);
  const resumeRef = useRef<(() => void) | null>(null);
  const slowRef = useRef(false);
  const clock = useRef({ start: 0, pausedAt: 0, pausedTotal: 0 });

  useEffect(() => () => { stopRef.current = true; abortRef.current?.abort(); stopSpeaking(); }, []);

  // Session clock (paused time excluded).
  useEffect(() => {
    if (phase !== "live") return;
    const id = window.setInterval(() => setLeft(Math.max(0, search.min * 60 - activeSeconds())), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function activeSeconds() {
    const c = clock.current;
    const pausedNow = c.pausedAt ? Date.now() - c.pausedAt : 0;
    return (Date.now() - c.start - c.pausedTotal - pausedNow) / 1000;
  }

  async function say(pt: string, en?: string) {
    if (stopRef.current) return;
    setCoach(en ? `${pt} ${en}`.trim() : pt);
    setTalking(true);
    if (pt) await speak(pt, { lang: "pt-BR" }).catch(() => {});
    if (en && !stopRef.current) await speak(en, { lang: "en-US", rate: slowRef.current ? 0.7 : 0.9 }).catch(() => {});
    setTalking(false);
  }

  async function doPause() {
    abortRef.current?.abort();
    stopSpeaking();
    clock.current.pausedAt = Date.now();
    setPaused(true);
    await new Promise<void>((res) => { resumeRef.current = res; });
    clock.current.pausedTotal += Date.now() - clock.current.pausedAt;
    clock.current.pausedAt = 0;
    setPaused(false);
    setError(null);
  }

  function button(cmd: VoiceCommand) {
    btnCmd.current = cmd;
    abortRef.current?.abort();
    stopSpeaking();
  }

  async function listen(expected: string[], spoken: { s: number }): Promise<Listened> {
    if (btnCmd.current) { const c = btnCmd.current; btnCmd.current = null; return { cmd: c }; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setHeard("");
    setMic("recording");
    try {
      const h = await hearOnce(expected, ctrl.signal, setHeard, () => setMic("processing"));
      setMic("idle");
      if (btnCmd.current) { const c = btnCmd.current; btnCmd.current = null; return { cmd: c }; }
      spoken.s += h.seconds;
      if (!h.transcript) return null;
      const cmd = detectCommand(h.transcript);
      return cmd ? { cmd } : { text: h.transcript };
    } catch (e) {
      setMic("idle");
      if (btnCmd.current) { const c = btnCmd.current; btnCmd.current = null; return { cmd: c }; }
      const msg = e instanceof Error ? e.message : t.speech.failed;
      if (msg === t.speech.noSpeech) return null;
      setError(msg);
      return { cmd: "pause" };
    }
  }

  async function start() {
    stopRef.current = false;
    setBlocked(null);
    setSummary(null);
    setLives(LIVES); setScore(0); setOps(null); setPulo(null); setHeard(""); setChunk(null);
    const spendBefore = await repo.getAiSpendThisMonth();
    const pulos: PuloDoGato = await repo.getPuloDoGato();
    const me = await repo.getMyName();
    const learnedPulos: Record<string, string> = {};

    // Chunk source
    let chains: Chunk[][] = [];
    let ai = null as Awaited<ReturnType<typeof aiFor>>;
    let pending: LiveLessonReply | null = null;
    const history: LessonTurn[] = [];
    if (search.modo === "livre") {
      ai = await aiFor("converse") ?? (await repo.getAiSettings());
      if (!ai.api_key) { setBlocked(L.needKey); return; }
    } else {
      const all = await repo.listDrillPacks();
      const packs = search.pack ? all.filter((p) => p.id === search.pack) : all.filter((p) => search.nivel === "todos" || difficultyOf(p.level) === search.nivel);
      chains = chainsOf(packs);
      if (!chains.length) { setBlocked(L.noLadders); return; }
    }

    setPhase("live");
    clock.current = { start: Date.now(), pausedAt: 0, pausedTotal: 0 };
    setLeft(search.min * 60);
    const stats = { attempted: 0, firstTry: 0, completed: 0, missedFocus: {} as Record<string, number>, cards: [] as { front: string; back: string }[] };
    const spoken = { s: 0 };
    let livesNow = LIVES;
    let scoreNow = 0;
    let chainIdx = 0;
    let stepIdx = 0;

    async function aiTurn(current: Chunk | null, answer: string | null) {
      setMic("checking");
      try {
        return await liveLessonTurn(ai!, {
          topic: search.tema || "dia a dia", level: LEVEL[search.nivel]!, name: me.name, city: me.city, history,
          current: current ? { chunk_pt: current.pt, accepted_en: current.accepted } : null, answer,
        });
      } finally {
        setMic("idle");
      }
    }

    async function nextChunk(): Promise<Chunk | null> {
      if (search.modo === "livre") {
        if (!pending) pending = await aiTurn(null, null).catch(() => null);
        if (!pending?.next_chunk_pt) return null;
        const c: Chunk = { pt: pending.next_chunk_pt, accepted: pending.next_accepted_en, focus: pending.focus, traps: [], change: pending.change_pt, prevEn: null, first: history.length === 0 || pending.end_of_chain };
        return c;
      }
      const chain = chains[chainIdx % chains.length]!;
      const c = chain[stepIdx]!;
      stepIdx++;
      if (stepIdx >= chain.length) { stepIdx = 0; chainIdx++; }
      return c;
    }

    async function verdict(ch: Chunk, raw: string): Promise<Verdict> {
      const ans = await withMyName(raw);
      if (search.modo === "livre") {
        const local = checkTranslate(ans, { en: ch.accepted, traps: [] });
        let r: LiveLessonReply | null = null;
        try { r = await aiTurn(ch, ans); } catch { setError(L.aiFailed); }
        if (r) pending = r;
        const correct = local.correct || (r?.correct ?? false);
        if (r?.pulo_do_gato) learnedPulos[ch.focus] = r.pulo_do_gato;
        history.push({ chunk_pt: ch.pt, answer: ans, correct });
        return { correct, hint: r?.hint_pt || r?.feedback_pt || "", model: r?.model_en || ch.accepted[0] || "", multa: !correct && (r?.is_multa ?? false), ops: local.ops, pulo: r?.pulo_do_gato ?? "" };
      }
      if (ch.patterns) {
        const local = checkQa(ans, { accept_patterns: ch.patterns, traps: [] });
        if (local.correct) return { correct: true, hint: "", model: ch.accepted[0]!, multa: false, ops: null, pulo: "" };
        setMic("checking");
        const v = await aiJudge({ prompt: ch.pt, accepted: ch.accepted, focus: ch.focus, transcript: ans });
        setMic("idle");
        return { correct: v?.correct ?? false, hint: v?.hint_pt ?? "", model: ch.accepted[0]!, multa: v?.is_multa ?? false, ops: null, pulo: pulos[ch.focus] ?? "" };
      }
      const r = checkTranslate(ans, { en: ch.accepted, traps: ch.traps });
      if (r.correct) return { correct: true, hint: "", model: ch.accepted[0]!, multa: false, ops: r.ops, pulo: "" };
      setMic("checking");
      const v = await aiJudge({ prompt: ch.pt, accepted: ch.accepted, focus: ch.focus, transcript: ans, traps: ch.traps.map((x) => x.word) });
      setMic("idle");
      return {
        correct: v?.correct ?? false,
        hint: v?.hint_pt || r.trap?.hint_pt || "",
        model: ch.accepted[0]!,
        multa: !(v?.correct ?? false) && (r.trap !== null || isAttentionSlip(r.ops) || v?.is_multa === true),
        ops: r.ops,
        pulo: pulos[ch.focus] ?? "",
      };
    }

    async function repeatAfterMe(ch: Chunk, model: string) {
      for (let k = 0; k < 3 && !stopRef.current; k++) {
        await say(L.repeatWithMe, model);
        const r = await listen([model], spoken);
        if (stopRef.current) return;
        if (!r) continue;
        if ("cmd" in r) { if (r.cmd === "pause") await doPause(); if (r.cmd === "slower") slowRef.current = true; continue; }
        setHeard(r.text);
        const res = checkAnswer(await withMyName(r.text), [model]);
        if (res.correct) { setOps(null); await say(pick(L.praise)); stats.completed++; return; }
        setOps(res.ops);
      }
      stats.cards.push({ front: ch.pt, back: model });
      await say(L.moveOn);
    }

    async function askChunk(ch: Chunk) {
      stats.attempted++;
      const intro = ch.patterns ? L.freePrompt : ch.first ? L.ask : pick(L.grow);
      let tries = 0;
      let silent = 0;
      while (!stopRef.current) {
        setChunk(ch); setOps(null); setPulo(null);
        await say(ch.patterns ? `${intro} ${ch.pt}` : `${intro} ${ch.pt.replace(/[.!?…\s]+$/, "")}?`);
        const r = await listen(ch.accepted, spoken);
        if (stopRef.current) return;
        if (!r) { silent++; if (silent >= 3) { silent = 0; await doPause(); } else await say(L.notHeard); continue; }
        if ("cmd" in r) {
          if (r.cmd === "repeat") continue;
          if (r.cmd === "slower") { slowRef.current = true; await say(L.slower); continue; }
          if (r.cmd === "pause") { await doPause(); continue; }
          stats.missedFocus[ch.focus] = (stats.missedFocus[ch.focus] ?? 0) + 1;
          return repeatAfterMe(ch, ch.accepted[0] ?? pending?.model_en ?? "");
        }
        setHeard(r.text);
        const v = await verdict(ch, r.text);
        if (stopRef.current) return;
        if (v.correct) {
          haptic(10);
          if (tries === 0) stats.firstTry++;
          stats.completed++;
          scoreNow += tries === 0 ? 10 : 5;
          setScore(scoreNow);
          await say(pick(L.praise), v.model);
          return;
        }
        setOps(v.ops);
        if (v.pulo) setPulo(v.pulo);
        stats.missedFocus[ch.focus] = (stats.missedFocus[ch.focus] ?? 0) + 1;
        if (v.multa) {
          haptic([30, 40, 30]);
          livesNow -= 1; scoreNow = Math.max(0, scoreNow - 5);
          setLives(livesNow); setScore(scoreNow);
          await say(L.fine(ch.focus));
          if (livesNow <= 0) return;
        }
        tries++;
        if (tries === 1) { await say(`${L.almost} ${v.hint}`.trim()); continue; }
        return repeatAfterMe(ch, v.model);
      }
    }

    while (!stopRef.current) {
      if (activeSeconds() >= search.min * 60) { await say(L.timeUp); break; }
      setCoach(L.thinking);
      const ch = await nextChunk();
      if (!ch) { setError(L.aiFailed); break; }
      if (search.modo === "livre") pending = null;
      await askChunk(ch);
      if (livesNow <= 0) { await say(L.outOfLives); break; }
    }
    if (stopRef.current) return;

    for (const c of stats.cards) await repo.createCard(c);
    const spendAfter = await repo.getAiSpendThisMonth();
    const top = Object.entries(stats.missedFocus).sort((a, b) => b[1] - a[1]).slice(0, 3);
    setSummary({
      seconds: spoken.s,
      completed: stats.completed,
      accuracy: stats.attempted ? stats.firstTry / stats.attempted : 0,
      missed: top.map(([focus]) => ({ focus, pulo: learnedPulos[focus] ?? pulos[focus] ?? "" })),
      cards: stats.cards.length,
      cost: spendAfter > spendBefore ? spendAfter - spendBefore : search.modo === "livre" ? 0 : null,
    });
    setPhase("summary");
  }

  function end() {
    stopRef.current = true;
    abortRef.current?.abort();
    stopSpeaking();
    resumeRef.current?.();
  }

  const title = search.modo === "livre" ? L.free : L.fromPacks;

  return (
    <div className="pt-safe pb-safe flex h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-md items-center gap-2 px-3 py-1">
        <Button variant="ghost" size="icon" asChild aria-label={L.end}>
          <Link to="/aplicabilidade" onClick={end}><X /></Link>
        </Button>
        <p className="text-caption min-w-0 flex-1 truncate text-muted-foreground">
          {phase === "live" ? `${title} · ${L.left(Math.ceil(left / 60))}` : title}
        </p>
        {phase === "live" && <Hearts lives={lives} />}
        {phase === "live" && <span className="font-display text-base font-bold tabular-nums">{d.points(score)}</span>}
      </header>

      {phase === "ready" && (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-end gap-6 px-5 pb-8">
          <div className="flex items-center gap-3">
            <CoachAvatar talking={false} />
            <h1 className="text-title">{L.title}</h1>
          </div>
          <p className="text-base text-muted-foreground">{L.ready}</p>
          {search.tema && <p className="text-headline">{L.topic}: {search.tema}</p>}
          {blocked && <p role="alert" className="text-base text-destructive">{blocked}</p>}
          <Button size="lg" className="w-full" onClick={() => void start()}><Play /> {L.start}</Button>
        </main>
      )}

      {phase === "live" && (
        <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5">
          <section className="flex min-h-[16rem] flex-1 flex-col">
            <div className="flex items-start gap-3 pt-2">
              <CoachAvatar talking={talking} />
              <p className="text-base min-w-0 flex-1 pt-2 text-muted-foreground" aria-live="polite">{coach}</p>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-3 py-4 text-center">
              {chunk?.prevEn && <p lang="en" className="text-caption text-muted-foreground"><span className="font-semibold">{d.previous}:</span> {chunk.prevEn}</p>}
              {chunk?.change && <span className="text-caption mx-auto w-fit rounded-full bg-live px-2.5 py-0.5 font-semibold text-live-foreground">{chunk.change}</span>}
              {chunk && <p className="font-display text-3xl font-bold leading-tight text-balance">{chunk.pt}</p>}
              {pulo && <PuloCard text={pulo} />}
            </div>
          </section>
          <section className="flex shrink-0 flex-col items-center gap-3 pb-4">
            <div className="flex min-h-14 w-full items-center justify-center text-center">
              {ops && ops.some((o) => o.type !== "equal") ? <DiffLine ops={ops} /> : heard ? <p lang="en" className="text-headline">{heard}</p> : null}
            </div>
            <MicButton state={mic} onClick={() => (mic === "recording" ? abortRef.current?.abort() : undefined)} disabled={mic !== "recording"} />
            <p role="status" aria-live="polite" className="text-caption h-5 font-semibold text-muted-foreground">{t.mic.states[mic]}</p>
            {error && <p role="alert" className="text-center text-base text-destructive">{error}</p>}
            <div className="grid w-full grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => button("repeat")}><RotateCcw /> {L.repeat}</Button>
              <Button variant="secondary" onClick={() => button("dontKnow")}><HelpCircle /> {L.dontKnow}</Button>
              <Button variant="secondary" onClick={() => button("pause")}><Pause /> {L.pause}</Button>
            </div>
          </section>
          {paused && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/95 p-6 text-center">
              <p className="text-title">{L.paused}</p>
              {error && <p className="text-base text-destructive">{error}</p>}
              <Button size="lg" onClick={() => resumeRef.current?.()}><Play /> {L.resume}</Button>
              <Button variant="ghost" asChild><Link to="/aplicabilidade" onClick={end}>{L.end}</Link></Button>
            </div>
          )}
        </div>
      )}

      {phase === "summary" && summary && (
        <main className="mx-auto w-full max-w-md flex-1 space-y-5 overflow-y-auto px-5 pb-8 pt-4">
          <h2 className="text-title">{L.summaryTitle}</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              [L.spoken, (summary.seconds / 60).toFixed(1)],
              [L.chunks, String(summary.completed)],
              [L.accuracy, `${Math.round(summary.accuracy * 100)}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[20px] border bg-card p-3 text-center">
                <p className="text-caption text-muted-foreground">{label}</p>
                <p className="font-display text-3xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-headline mb-2">{L.missedTitle}</h3>
            {summary.missed.length === 0 ? <p className="text-base text-muted-foreground">{L.noMissed}</p> : (
              <ul className="space-y-2">
                {summary.missed.map((m) => (
                  <li key={m.focus}>{m.pulo ? <PuloCard text={m.pulo} /> : <p className="rounded-xl border bg-card p-3 text-base">{m.focus}</p>}</li>
                ))}
              </ul>
            )}
            {summary.cards > 0 && <p className="mt-2 text-base text-muted-foreground">{L.cards(summary.cards)}</p>}
          </div>
          {summary.cost !== null && <p className="text-caption text-muted-foreground">{L.cost(summary.cost)}</p>}
          <div className="space-y-2">
            <Button size="lg" className="w-full" onClick={() => void start()}><RotateCcw /> {L.again}</Button>
            <Button variant="ghost" className="w-full" asChild><Link to="/aplicabilidade">{L.back}</Link></Button>
          </div>
        </main>
      )}
    </div>
  );
}
