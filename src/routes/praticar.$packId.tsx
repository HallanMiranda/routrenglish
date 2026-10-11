import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { MicButton, type MicState } from "@/components/session/MicButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { repo } from "@/data/repo";
import type { DrillItem, DrillPack, DrillRound } from "@/data/types";
import { checkItem, checkAnswer, type DiffOp } from "@/drills/check";
import { listenLive } from "@/speech/recognize";
import { speak, stopSpeaking } from "@/speech/speak";
import { t } from "@/lib/i18n/pt-BR";
import { cn } from "@/lib/utils";

const d = t.drills;
const ROUND_SECONDS = 6;

export const Route = createFileRoute("/praticar/$packId")({
  head: () => ({
    meta: [
      { title: "Treino de tradução — Speak Lab" },
      { name: "description", content: "Traduza frases do português para o inglês falando com o Coach." },
      { property: "og:title", content: "Treino de tradução — Speak Lab" },
      { property: "og:description", content: "Traduza frases do português para o inglês falando com o Coach." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DrillPage,
});

interface Run {
  round: DrillRound;
  items: DrillItem[];
  queue: string[];
  pos: number;
  /** Wrong tries for the current presentation of the item. */
  tries: number;
  /** Items wrong at least once this round. */
  helped: Set<string>;
  /** Items correct on their first presentation & first try. */
  firstTry: Set<string>;
  seen: Set<string>;
  maxTries: Record<string, number>;
  requeued: Record<string, number>;
  /** Whether this run counts for unlocking (not an errors-only run). */
  counts: boolean;
}

type Feedback =
  | { kind: "praise"; text: string; clear: boolean }
  | { kind: "almost"; text: string; ops: DiffOp[] }
  | { kind: "half"; text: string; ops: DiffOp[] }
  | { kind: "repeat"; text: string }
  | null;

interface Summary {
  round: DrillRound;
  accuracy: number;
  helped: DrillItem[];
  cards: number;
  counts: boolean;
}

function pick<T>(arr: readonly T[]) {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function DrillPage() {
  const { packId } = Route.useParams();
  const [pack, setPack] = useState<DrillPack | null | undefined>(undefined);
  const [bestRound, setBestRound] = useState<DrillRound>(1);
  const [run, setRun] = useState<Run | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const refresh = useCallback(async () => {
    const p = await repo.getDrillPack(packId);
    setPack(p);
    if (p) setBestRound((await repo.getPackProgress(p.id)).best_round);
  }, [packId]);
  useEffect(() => {
    void refresh();
    return () => stopSpeaking();
  }, [refresh]);

  function start(round: DrillRound, items: DrillItem[], counts = true) {
    setSummary(null);
    setRun({
      round, items, queue: items.map((i) => i.id), pos: 0, tries: 0,
      helped: new Set(), firstTry: new Set(), seen: new Set(), maxTries: {}, requeued: {}, counts,
    });
  }

  async function finish(r: Run) {
    if (!pack) return;
    const accuracy = r.items.length ? r.firstTry.size / r.items.length : 0;
    const helped = r.items.filter((i) => r.helped.has(i.id));
    const hard = r.items.filter((i) => (r.maxTries[i.id] ?? 0) >= 3);
    for (const i of hard) await repo.createCard({ front: i.pt, back: i.en[0]! });
    if (r.counts) await repo.saveDrillAttempt({ pack_id: pack.id, round: r.round, accuracy, helped_item_ids: helped.map((i) => i.id) });
    setRun(null);
    setSummary({ round: r.round, accuracy, helped, cards: hard.length, counts: r.counts });
    void refresh();
  }

  if (pack === undefined) return <div className="min-h-dvh bg-background" />;
  if (pack === null)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p>{d.notFound}</p>
        <Button asChild><Link to="/praticar">{d.toPacks}</Link></Button>
      </div>
    );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="icon" asChild aria-label={d.back}>
          <Link to="/praticar" onClick={() => stopSpeaking()}><ArrowLeft /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{pack.title_pt}</p>
          {run && (
            <p className="text-xs text-muted-foreground">
              {d.roundOf(run.round)} · {d.rounds[run.round]} · {d.progress(Math.min(run.pos + 1, run.queue.length), run.queue.length)}
            </p>
          )}
        </div>
      </header>
      {run ? (
        <DrillRunner key={`${run.round}-${run.counts}-${run.items.length}`} run={run} setRun={setRun} onFinish={finish} />
      ) : summary ? (
        <SummaryView
          summary={summary}
          onNext={() => start((summary.round + 1) as DrillRound, pack.items)}
          onRepeat={() => start(summary.round, pack.items)}
          onErrors={() => start(summary.round, summary.helped, false)}
        />
      ) : (
        <RoundPicker best={bestRound} onPick={(r) => start(r, pack.items)} />
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

function SummaryView({ summary, onNext, onRepeat, onErrors }: { summary: Summary; onNext: () => void; onRepeat: () => void; onErrors: () => void }) {
  const passed = summary.accuracy >= 0.8;
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-5 overflow-y-auto px-5 pb-8">
      <h2 className="text-2xl font-bold">{d.endTitle}</h2>
      <div className="rounded-2xl border bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">{d.endAccuracy}</p>
        <p className="font-display text-5xl font-bold">{Math.round(summary.accuracy * 100)}%</p>
        {summary.counts && (
          <p className="mt-2 text-sm font-medium">
            {passed ? (summary.round < 4 ? d.unlocked(summary.round + 1) : d.finished) : d.retryHint}
          </p>
        )}
      </div>
      <div>
        <h3 className="mb-2 font-semibold">{d.needHelp}</h3>
        {summary.helped.length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.noHelp}</p>
        ) : (
          <ul className="space-y-2">
            {summary.helped.map((i) => (
              <li key={i.id} className="rounded-xl border bg-card p-3 text-sm">
                <p className="text-muted-foreground">{i.pt}</p>
                <p className="font-semibold" lang="en">{i.en[0]}</p>
              </li>
            ))}
          </ul>
        )}
        {summary.cards > 0 && <p className="mt-2 text-sm text-muted-foreground">{d.cardsCreated(summary.cards)}</p>}
      </div>
      <div className="space-y-2">
        {passed && summary.counts && summary.round < 4 && <Button size="lg" className="w-full" onClick={onNext}>{d.nextRound}</Button>}
        {summary.helped.length > 0 && <Button size="lg" variant="secondary" className="w-full" onClick={onErrors}>{d.onlyErrors}</Button>}
        <Button size="lg" variant="outline" className="w-full" onClick={onRepeat}>{d.repeatRound}</Button>
        <Button variant="ghost" className="w-full" asChild><Link to="/praticar">{d.toPacks}</Link></Button>
      </div>
    </main>
  );
}

function DrillRunner({ run, setRun, onFinish }: { run: Run; setRun: (r: Run) => void; onFinish: (r: Run) => void }) {
  const item = run.items.find((i) => i.id === run.queue[run.pos])!;
  const [mic, setMic] = useState<MicState>("idle");
  const [heard, setHeard] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const repeatMode = feedback?.kind === "repeat";
  const stepKey = `${run.pos}-${run.queue[run.pos]}`;

  // Tutor speaks on every new item.
  useEffect(() => {
    setHeard(""); setFeedback(null); setTyped(""); setMicError(null);
    busyRef.current = false;
    const timer = window.setTimeout(() => {
      if (run.round === 1) void speak(item.en[0]!, { lang: "en-US", rate: 0.9 }).catch(() => {});
      else void speak(item.pt, { lang: "pt-BR" }).catch(() => {});
    }, 250);
    return () => { window.clearTimeout(timer); abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  // Round 4: 6-second countdown per attempt.
  useEffect(() => {
    if (run.round !== 4 || repeatMode || feedback?.kind === "praise") { setSecondsLeft(null); return; }
    setSecondsLeft(ROUND_SECONDS);
    const id = window.setInterval(() => setSecondsLeft((s) => (s === null ? s : s - 1)), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, run.tries, run.round, repeatMode, feedback?.kind]);
  useEffect(() => {
    if (secondsLeft === 0 && mic !== "processing") {
      abortRef.current?.abort();
      handleAnswer("", null, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  function advance(next: Run) {
    if (next.pos + 1 >= next.queue.length) onFinish(next);
    else setRun({ ...next, pos: next.pos + 1, tries: 0 });
  }

  function handleAnswer(answer: string, confidence: number | null, timeUp = false) {
    if (busyRef.current) return;
    const result = repeatMode ? checkAnswer(answer, [item.en[0]!]) : checkItem(answer, item);
    const firstPresentation = !run.seen.has(item.id);
    if (result.correct && !timeUp) {
      busyRef.current = true;
      const seen = new Set(run.seen).add(item.id);
      const firstTry = new Set(run.firstTry);
      if (firstPresentation && run.tries === 0) firstTry.add(item.id);
      const queue = [...run.queue];
      const requeued = { ...run.requeued };
      if (run.tries > 0 && (requeued[item.id] ?? 0) < 2) {
        queue.push(item.id);
        requeued[item.id] = (requeued[item.id] ?? 0) + 1;
      }
      const clear = confidence !== null && confidence >= 0.85 && Math.random() < 0.4;
      setFeedback({ kind: "praise", text: pick(d.praise), clear });
      window.setTimeout(() => advance({ ...run, seen, firstTry, queue, requeued }), 1100);
      return;
    }
    const tries = run.tries + 1;
    const helped = new Set(run.helped).add(item.id);
    const maxTries = { ...run.maxTries, [item.id]: Math.max(run.maxTries[item.id] ?? 0, tries) };
    setRun({ ...run, tries, helped, maxTries });
    const model = item.en[0]!;
    if (tries >= 3 || repeatMode) {
      setFeedback({ kind: "repeat", text: model });
      void speak(model, { lang: "en-US", rate: 0.85 }).catch(() => {});
    } else if (tries === 2) {
      const words = model.split(/\s+/);
      setFeedback({ kind: "half", text: words.slice(0, Math.max(1, Math.ceil(words.length / 2))).join(" ") + " …", ops: result.ops });
    } else {
      setFeedback({ kind: "almost", text: timeUp ? d.timeUp : result.trap?.hint_pt ?? d.almost, ops: result.ops });
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

  const firstWord = item.en[0]!.split(/\s+/)[0];
  const bubble = repeatMode ? d.repeatWithMe : run.round === 1 ? d.promptRepeat : d.promptTranslate;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 px-4 pb-4">
      {/* Tutor panel */}
      <section className="relative flex flex-1 flex-col rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border">
        <div className="flex items-center gap-3">
          <CoachAvatar talking={!feedback || feedback.kind === "repeat"} />
          <div className="relative rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">
            {feedback?.kind === "praise" ? (
              <span>{feedback.text}{feedback.clear && ` ${d.clear}`}</span>
            ) : feedback?.kind === "almost" ? feedback.text
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
          {run.round === 1 || repeatMode ? (
            <>
              <p lang="en" className="font-display text-3xl font-bold leading-tight">{item.en[0]!}</p>
              <p className="text-sm text-muted-foreground">{item.pt}</p>
            </>
          ) : (
            <>
              <p className="font-display text-3xl font-bold leading-tight">{item.pt}</p>
              {run.round === 2 && (
                <p className="text-sm text-muted-foreground">{d.hintStart} <span lang="en" className="font-semibold text-foreground">{firstWord} …</span></p>
              )}
              {feedback?.kind === "half" && <p lang="en" className="text-lg font-semibold text-primary">{feedback.text}</p>}
            </>
          )}
        </div>
      </section>

      {/* Learner panel */}
      <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl bg-muted/60 p-5 ring-1 ring-border">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.you}</p>
        <div className="min-h-[3.5rem] w-full text-center">
          {(feedback?.kind === "almost" || feedback?.kind === "half") ? (
            <DiffLine ops={feedback.ops} />
          ) : heard ? (
            <p lang="en" className="text-lg font-medium">{heard}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{mic === "recording" ? d.listening : d.tapToSpeak}</p>
          )}
        </div>
        <MicButton state={mic} onClick={toggleMic} disabled={feedback?.kind === "praise"} />
        {micError && <p className="text-center text-sm text-destructive">{micError}</p>}
        {typing ? (
          <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); submitTyped(); }}>
            <Input lang="en" autoCapitalize="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={d.typePlaceholder} disabled={feedback?.kind === "praise"} />
            <Button type="submit" disabled={feedback?.kind === "praise"}>{d.send}</Button>
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
