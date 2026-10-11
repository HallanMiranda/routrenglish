import { fromFirstUnfinished, groupCollections } from "@/drills/collections";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Gauge, HelpCircle, Pause, Play, RotateCcw, Sparkles, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicButton, type MicState } from "@/components/session/MicButton";
import { CoachAvatar, DiffLine, Hearts, LIVES, PuloCard } from "@/components/drill/CoachParts";
import { repo } from "@/data/repo";
import type { Difficulty, DrillPack, DrillTrap, Material, PuloDoGato } from "@/data/types";
import { checkAnswer, checkQa, checkTranslate, isAttentionSlip, type DiffOp } from "@/drills/check";
import { difficultyOf } from "@/drills/difficulty";
import { aiJudge, withMyName } from "@/ai/judge";
import { aiFor, aiOnline } from "@/ai/client";
import { coachSay, playBlob, preload, stopCoach, unlockAudio, type VoiceStyle } from "@/ai/tts";
import { assessPronunciation, type PronResult } from "@/ai/pronunciation";
import { toWav16k } from "@/speech/wav";
import { describeItem } from "@/ai/generatePack";
import { liveLessonTurn, type LessonTurn, type LiveLessonReply } from "@/ai/liveLesson";
import { detectCommand, hearOnce, type VoiceCommand } from "@/lesson/hear";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n/pt-BR";

const L = t.lesson;
const d = t.drills;

type Nivel = Difficulty | "todos";
interface LessonSearch {
  modo: "pacotes" | "livre" | "print";
  pack: string;
  mat: string;
  tema: string;
  min: number;
  nivel: Nivel;
}

export const Route = createFileRoute("/aula")({
  validateSearch: (s: Record<string, unknown>): LessonSearch => ({
    modo: s["modo"] === "livre" ? "livre" : s["modo"] === "print" ? "print" : "pacotes",
    pack: typeof s["pack"] === "string" ? s["pack"] : "",
    mat: typeof s["mat"] === "string" ? s["mat"] : "",
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
  /** Last step of its chain (for "Na frase final"). */
  last?: boolean;
  keyItem?: string | undefined;
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
  pron: number | null;
  inton: number | null;
  issues: string[];
  mastered: string | null;
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
          pt: st.pt, accepted: st.en, focus: st.focus, traps: st.traps, change: st.change_pt, prevEn: k > 0 ? it.steps[k - 1]!.en[0]! : null, first: k === 0, last: k === it.steps.length - 1 && !it.free,
        }));
        if (it.free) chain.push({ pt: it.free.prompt_pt, accepted: it.free.model_answers, patterns: it.free.accept_patterns, focus: it.steps.at(-1)!.focus, traps: [], change: "", prevEn: null, first: false, last: true });
        chains.push(chain);
      }
    }
  if (chains.length) return chains;
  for (const p of packs)
    for (const it of p.items)
      if (it.mode === "translate") chains.push([{ pt: it.pt, accepted: it.en, focus: it.focus, traps: it.traps, change: "", prevEn: null, first: true, last: true }]);
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
  const [slow, setSlow] = useState(false);
  const [pron, setPron] = useState<{ r: PronResult; target: string; mine: Blob | null } | null>(null);
  const [assessQueued, setAssessQueued] = useState(false);
  const [material, setMaterial] = useState<Material | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const assessRef = useRef(false);
  const lastAudio = useRef<Blob | null>(null);

  const stopRef = useRef(false);
  /** Record answers for pronunciation feedback (key saved and online). */
  const wantAudio = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const btnCmd = useRef<VoiceCommand | null>(null);
  const resumeRef = useRef<(() => void) | null>(null);
  const slowRef = useRef(false);
  const clock = useRef({ start: 0, pausedAt: 0, pausedTotal: 0 });

  useEffect(() => () => { stopRef.current = true; abortRef.current?.abort(); stopCoach(); }, []);
  useEffect(() => { if (search.mat) void repo.getMaterial(search.mat).then(setMaterial); }, [search.mat]);

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

  async function say(pt: string, en?: string, enStyle: VoiceStyle = "en") {
    if (stopRef.current) return;
    setCoach(en ? `${pt} ${en}`.trim() : pt);
    setTalking(true);
    const speed = slowRef.current ? "slow" : "normal";
    if (pt) await coachSay(pt, "pt", speed);
    if (en && !stopRef.current) await coachSay(en, enStyle, speed);
    setTalking(false);
  }
  function setSpeed(v: boolean) { slowRef.current = v; setSlow(v); }

  async function doPause() {
    abortRef.current?.abort();
    stopCoach();
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
    stopCoach();
  }

  async function listen(expected: string[], spoken: { s: number }): Promise<Listened> {
    if (btnCmd.current) { const c = btnCmd.current; btnCmd.current = null; return { cmd: c }; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setHeard("");
    setMic("recording");
    try {
      const h = await hearOnce(expected, ctrl.signal, setHeard, () => setMic("processing"), wantAudio.current);
      setMic("idle");
      lastAudio.current = h.audio;
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
    unlockAudio();
    setLives(LIVES); setScore(0); setOps(null); setPulo(null); setHeard(""); setChunk(null); setPron(null);
    const online = await aiOnline();
    wantAudio.current = !!online;
    const pronMode = online?.pron_mode ?? "final";
    const pronStats = { p: [] as number[], i: [] as number[], issues: {} as Record<string, number> };
    const keyDone = new Set<string>();
    const keyMissed = new Set<string>();
    let source: { material_text: string; key_items: string[] } | undefined;
    const mat = search.modo === "print" ? await repo.getMaterial(search.mat) : null;
    const printProg = mat ? await repo.getPrintProgress(mat.id) : null;
    const spendBefore = await repo.getAiSpendThisMonth();
    const pulos: PuloDoGato = await repo.getPuloDoGato();
    const me = await repo.getMyName();
    const learnedPulos: Record<string, string> = {};

    // Chunk source
    let chains: Chunk[][] = [];
    let ai = null as Awaited<ReturnType<typeof aiFor>>;
    let pending: LiveLessonReply | null = null;
    const history: LessonTurn[] = [];
    let aiMode = search.modo === "livre";
    if (search.modo === "print") {
      if (!mat) { setBlocked(t.prints.notFound); return; }
      const pack = mat.pack_id ? await repo.getDrillPack(mat.pack_id) : null;
      let keys = mat.key_items?.length ? mat.key_items : (pack?.items.map(describeItem) ?? []).slice(0, 15);
      const missed = printProg?.missed ?? [];
      keys = [...missed.filter((k) => keys.includes(k)), ...keys.filter((k) => !missed.includes(k))];
      source = { material_text: mat.material_text || mat.text || "", key_items: keys };
      if (online) { ai = online; aiMode = true; }
      else {
        chains = pack ? chainsOf([pack]) : [];
        if (!chains.length) { setBlocked(L.needKey); return; }
        setError(L.printNeedsKey);
      }
    } else if (search.modo === "livre") {
      ai = await aiFor("converse") ?? (await repo.getAiSettings());
      if (!ai.api_key) { setBlocked(L.needKey); return; }
    } else {
      const all = await repo.listDrillPacks();
      const colKey = search.pack.startsWith("col:") ? search.pack.slice(4) : null;
      let units: typeof all = [];
      if (colKey) {
        units = groupCollections(all).collections.find((c) => c.key === colKey)?.units ?? [];
        const prog = Object.fromEntries((await Promise.all(units.map((u) => repo.getPackProgress(u.id)))).map((p) => [p.pack_id, p]));
        units = fromFirstUnfinished(units, prog);
      }
      const packs = colKey ? units : search.pack ? all.filter((p) => p.id === search.pack) : all.filter((p) => search.nivel === "todos" || difficultyOf(p.level) === search.nivel);
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
    let lastEnded = false;
    let stepIdx = 0;

    async function aiTurn(current: Chunk | null, answer: string | null) {
      setMic("checking");
      try {
        return await liveLessonTurn(ai!, {
          topic: mat?.title || search.tema || "dia a dia", level: LEVEL[search.nivel]!, name: me.name, city: me.city, history,
          current: current ? { chunk_pt: current.pt, accepted_en: current.accepted } : null, answer, source,
        });
      } finally {
        setMic("idle");
      }
    }

    async function nextChunk(): Promise<Chunk | null> {
      if (aiMode) {
        if (!pending) pending = await aiTurn(null, null).catch(() => null);
        if (!pending?.next_chunk_pt) return null;
        const c: Chunk = { pt: pending.next_chunk_pt, accepted: pending.next_accepted_en, focus: pending.focus, traps: [], change: pending.change_pt, prevEn: null, first: history.length === 0 || lastEnded, last: pending.end_of_chain, keyItem: pending.key_item || undefined };
        lastEnded = pending.end_of_chain;
        if (c.accepted[0]) preload(c.accepted[0], "en");
        return c;
      }
      const chain = chains[chainIdx % chains.length]!;
      const c = chain[stepIdx]!;
      stepIdx++;
      if (stepIdx >= chain.length) { stepIdx = 0; chainIdx++; }
      if (c.accepted[0]) preload(c.accepted[0], "en", slowRef.current ? "slow" : "normal");
      return c;
    }

    async function verdict(ch: Chunk, raw: string): Promise<Verdict> {
      const ans = await withMyName(raw);
      if (aiMode) {
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

    /** Feedback on the last recording; returns true when there were issues. */
    async function assess(target: string): Promise<PronResult | null> {
      const audio = lastAudio.current;
      const s = await aiOnline();
      if (!audio || !s || stopRef.current) return null;
      setMic("checking");
      try {
        const r = await assessPronunciation(s, await toWav16k(audio), target);
        setPron({ r, target, mine: audio });
        pronStats.p.push(r.pronunciation_score); pronStats.i.push(r.intonation_score);
        for (const is of r.issues) pronStats.issues[is.kind_pt] = (pronStats.issues[is.kind_pt] ?? 0) + 1;
        return r;
      } catch {
        return null;
      } finally {
        setMic("idle");
      }
    }

    /** Speaks the verdict; on issues: tip, model with stress, "Repete comigo", one re-check. Max 2 repeats. */
    async function coachPron(target: string, repeats: number) {
      let r = await assess(target);
      for (let k = 0; r && !stopRef.current; k++) {
        await say(r.verdict_pt);
        if (!r.issues.length || k + repeats >= 2) return;
        await say(r.issues[0]!.problem_pt);
        await say(L.repeatWithMe, target, "repeat");
        const h = await listen([target], spoken);
        if (!h || "cmd" in h) return;
        setHeard(h.text);
        r = await assess(target);
      }
    }
    function shouldAssess(ch: Chunk) {
      if (!wantAudio.current) return false;
      if (assessRef.current) { assessRef.current = false; setAssessQueued(false); return true; }
      return pronMode === "always" || (pronMode === "final" && !!ch.last);
    }

    async function repeatAfterMe(ch: Chunk, model: string) {
      for (let k = 0; k < 3 && !stopRef.current; k++) {
        await say(L.repeatWithMe, model, "repeat");
        const r = await listen([model], spoken);
        if (stopRef.current) return;
        if (!r) continue;
        if ("cmd" in r) { if (r.cmd === "pause") await doPause(); if (r.cmd === "slower") setSpeed(true); continue; }
        setHeard(r.text);
        const res = checkAnswer(await withMyName(r.text), [model]);
        if (res.correct) {
          setOps(null); await say(pick(L.praise)); stats.completed++;
          if (ch.keyItem) keyDone.add(ch.keyItem);
          if (wantAudio.current) { assessRef.current = false; setAssessQueued(false); await coachPron(model, 1); }
          return;
        }
        setOps(res.ops);
      }
      stats.cards.push({ front: ch.pt, back: model });
      if (ch.keyItem) keyMissed.add(ch.keyItem);
      await say(L.moveOn);
    }

    async function askChunk(ch: Chunk) {
      stats.attempted++;
      const intro = ch.patterns ? L.freePrompt : ch.first ? L.ask : pick(L.grow);
      let tries = 0;
      let silent = 0;
      while (!stopRef.current) {
        setChunk(ch); setOps(null); setPulo(null); setPron(null);
        await say(ch.patterns ? `${intro} ${ch.pt}` : `${intro} ${ch.pt.replace(/[.!?…\s]+$/, "")}?`);
        const r = await listen(ch.accepted, spoken);
        if (stopRef.current) return;
        if (!r) { silent++; if (silent >= 3) { silent = 0; await doPause(); } else await say(L.notHeard); continue; }
        if ("cmd" in r) {
          if (r.cmd === "repeat") continue;
          if (r.cmd === "slower") { setSpeed(true); await say(L.slower); continue; }
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
          if (ch.keyItem) keyDone.add(ch.keyItem);
          await say(pick(L.praise), v.model);
          if (shouldAssess(ch)) await coachPron(v.model, 0);
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

    for (const p of L.praise) preload(p, "pt");
    if (search.modo === "print") await say(L.printOpen);
    while (!stopRef.current) {
      if (activeSeconds() >= search.min * 60) { await say(L.timeUp); break; }
      setCoach(L.thinking);
      const ch = await nextChunk();
      if (!ch) { setError(L.aiFailed); break; }
      if (aiMode) pending = null;
      await askChunk(ch);
      if (livesNow <= 0) { await say(L.outOfLives); break; }
    }
    if (stopRef.current) return;

    for (const c of stats.cards) await repo.createCard({ ...c, ...(mat ? { tag: mat.title } : {}) });
    let masteredLabel: string | null = null;
    if (mat && source) {
      const prevM = new Set(printProg?.mastered ?? []);
      for (const k of keyDone) if (!keyMissed.has(k)) prevM.add(k);
      for (const k of keyMissed) prevM.delete(k);
      const missedAll = [...new Set([...keyMissed, ...(printProg?.missed ?? []).filter((k) => !keyDone.has(k))])];
      await repo.savePrintProgress(mat.id, { mastered: [...prevM], missed: missedAll });
      masteredLabel = L.mastered([...prevM].filter((k) => source!.key_items.includes(k)).length, source.key_items.length);
    }
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const spendAfter = await repo.getAiSpendThisMonth();
    const top = Object.entries(stats.missedFocus).sort((a, b) => b[1] - a[1]).slice(0, 3);
    setSummary({
      seconds: spoken.s,
      completed: stats.completed,
      accuracy: stats.attempted ? stats.firstTry / stats.attempted : 0,
      missed: top.map(([focus]) => ({ focus, pulo: learnedPulos[focus] ?? pulos[focus] ?? "" })),
      cards: stats.cards.length,
      cost: spendAfter > spendBefore ? spendAfter - spendBefore : aiMode ? 0 : null,
      pron: avg(pronStats.p),
      inton: avg(pronStats.i),
      issues: Object.entries(pronStats.issues).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
      mastered: masteredLabel,
    });
    setPhase("summary");
  }

  function end() {
    stopRef.current = true;
    abortRef.current?.abort();
    stopCoach();
    resumeRef.current?.();
  }

  const title = search.modo === "livre" ? L.free : search.modo === "print" ? L.printTitle(material?.title ?? "") : L.fromPacks;
  const toPrint = search.modo === "print" && !!search.mat;
  const Back = ({ children, ...rest }: { children: ReactNode; onClick?: () => void; className?: string }) =>
    toPrint ? <Link to="/prints/$materialId" params={{ materialId: search.mat }} {...rest}>{children}</Link>
    : <Link to="/aplicabilidade" {...rest}>{children}</Link>;
  const printImg = material?.images?.[0] ?? material?.thumbnail;

  return (
    <div className="pt-safe pb-safe flex h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-md items-center gap-2 px-3 py-1">
        <Button variant="ghost" size="icon" asChild aria-label={L.end}>
          <Back onClick={end}><X /></Back>
        </Button>
        <p className="text-caption min-w-0 flex-1 truncate text-muted-foreground">
          {phase === "live" ? `${title} · ${L.left(Math.ceil(left / 60))}` : title}
        </p>
        {phase === "live" && (
          <Button variant="ghost" size="sm" aria-label={L.speed} aria-pressed={slow} onClick={() => setSpeed(!slow)} className="h-9 px-2 text-xs">
            <Gauge className="size-4" /> {slow ? L.speedSlow : L.speedNormal}
          </Button>
        )}
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
              {printImg && (
                <button type="button" aria-label={L.showPrint} onClick={() => { setShowPrint(true); button("pause"); }} className="shrink-0 overflow-hidden rounded-lg border">
                  <img src={printImg} alt="" className="size-12 object-cover" />
                </button>
              )}
            </div>
            <div className="flex flex-1 flex-col justify-center gap-3 py-4 text-center">
              {chunk?.prevEn && <p lang="en" className="text-caption text-muted-foreground"><span className="font-semibold">{d.previous}:</span> {chunk.prevEn}</p>}
              {chunk?.change && <span className="text-caption mx-auto w-fit rounded-full bg-live px-2.5 py-0.5 font-semibold text-live-foreground">{chunk.change}</span>}
              {chunk && <p className="font-display text-3xl font-bold leading-tight text-balance">{chunk.pt}</p>}
              {pulo && <PuloCard text={pulo} />}
              {pron && <PronCard p={pron} slow={slow} />}
            </div>
          </section>
          <section className="flex shrink-0 flex-col items-center gap-3 pb-4">
            <div className="flex min-h-14 w-full items-center justify-center text-center">
              {ops && ops.some((o) => o.type !== "equal") ? <DiffLine ops={ops} /> : heard ? <p lang="en" className="text-headline">{heard}</p> : null}
            </div>
            <MicButton state={mic} onClick={() => (mic === "recording" ? abortRef.current?.abort() : undefined)} disabled={mic !== "recording"} />
            <p role="status" aria-live="polite" className="text-caption h-5 font-semibold text-muted-foreground">{t.mic.states[mic]}</p>
            {error && <p role="alert" className="text-center text-base text-destructive">{error}</p>}
            {wantAudio.current && (
              <Button variant="ghost" size="sm" disabled={assessQueued} onClick={() => { assessRef.current = true; setAssessQueued(true); }}>
                <Sparkles /> {assessQueued ? L.assessQueued : L.assess}
              </Button>
            )}
            <div className="grid w-full grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => button("repeat")}><RotateCcw /> {L.repeat}</Button>
              <Button variant="secondary" onClick={() => button("dontKnow")}><HelpCircle /> {L.dontKnow}</Button>
              <Button variant="secondary" onClick={() => button("pause")}><Pause /> {L.pause}</Button>
            </div>
          </section>
          {paused && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/95 p-6 text-center">
              {showPrint && printImg ? <img src={printImg} alt={material?.title ?? ""} className="max-h-[65dvh] w-full rounded-xl border object-contain" /> : <p className="text-title">{L.paused}</p>}
              {error && <p className="text-base text-destructive">{error}</p>}
              <Button size="lg" onClick={() => { setShowPrint(false); resumeRef.current?.(); }}><Play /> {showPrint ? L.closePrint : L.resume}</Button>
              <Button variant="ghost" asChild><Back onClick={end}>{L.end}</Back></Button>
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
          {summary.mastered && <p className="text-headline">{summary.mastered}</p>}
          {summary.pron !== null && (
            <div>
              <div className="grid grid-cols-2 gap-3">
                {[[L.pronAvg, summary.pron], [L.intonAvg, summary.inton ?? 0]].map(([label, v]) => (
                  <div key={String(label)} className="rounded-[20px] border bg-card p-3 text-center">
                    <p className="text-caption text-muted-foreground">{label}</p>
                    <p className="font-display text-3xl font-bold">{v}</p>
                  </div>
                ))}
              </div>
              {summary.issues.length > 0 && (
                <>
                  <h3 className="text-headline mb-2 mt-4">{L.pronIssues}</h3>
                  <ul className="space-y-2">{summary.issues.map((i) => <li key={i} className="rounded-xl border bg-card p-3 text-base">{i}</li>)}</ul>
                </>
              )}
            </div>
          )}
          {summary.cost !== null && <p className="text-caption text-muted-foreground">{L.cost(summary.cost)}</p>}
          <div className="space-y-2">
            <Button size="lg" className="w-full" onClick={() => void start()}><RotateCcw /> {L.again}</Button>
            <Button variant="ghost" className="w-full" asChild><Back>{L.back}</Back></Button>
          </div>
        </main>
      )}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="text-caption flex justify-between font-semibold"><span>{label}</span><span className="tabular-nums">{value}</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function PronCard({ p, slow }: { p: { r: PronResult; target: string; mine: Blob | null }; slow: boolean }) {
  const stress = new Set(p.r.stress_words.map((w) => w.toLowerCase().replace(/[^a-z']/g, "")));
  return (
    <div className="space-y-3 rounded-[20px] border bg-card p-4 text-left">
      <div className="flex gap-4">
        <Meter label={L.pron} value={p.r.pronunciation_score} />
        <Meter label={L.inton} value={p.r.intonation_score} />
      </div>
      <p lang="en" className="text-headline">
        {p.target.split(/\s+/).map((w, i) => {
          const bare = w.toLowerCase().replace(/[^a-z']/g, "");
          return <span key={i}>{i > 0 && " "}{stress.has(bare) ? <strong className="text-primary">{w}</strong> : w}</span>;
        })}{" "}
        <span aria-label={p.r.intonation}>{p.r.intonation === "rising" ? "↗" : "↘"}</span>
      </p>
      {p.r.issues.map((is) => <p key={is.word + is.problem_pt} className="text-caption"><span className="font-semibold">{is.word}:</span> {is.problem_pt}</p>)}
      {p.r.intonation_tip_pt && <p className="text-caption text-muted-foreground">{p.r.intonation_tip_pt}</p>}
      <div className="flex gap-2">
        {p.mine && <Button size="sm" variant="secondary" onClick={() => void playBlob(p.mine!).catch(() => {})}><Volume2 /> {L.hearMe}</Button>}
        <Button size="sm" variant="secondary" onClick={() => void coachSay(p.target, "repeat", slow ? "slow" : "normal")}><Volume2 /> {L.hearModel}</Button>
      </div>
    </div>
  );
}
