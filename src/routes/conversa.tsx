import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Mic, RotateCcw, Square, Trophy, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicButton, type MicState } from "@/components/session/MicButton";
import { CoachAvatar } from "@/components/drill/CoachParts";
import { repo } from "@/data/repo";
import type { TalkSession } from "@/data/types";
import { TOPICS, talkTurn, topicOfToday, type TalkTopic, type TalkTurn } from "@/ai/talk";
import { aiFor } from "@/ai/client";
import { coachSay, stopCoach, unlockAudio } from "@/ai/tts";
import { detectCommand, hearOnce } from "@/lesson/hear";
import { bestTalk, clock, nextGoal } from "@/talk/goal";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n/pt-BR";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conversa")({
  head: () => ({
    meta: [
      { title: t.talk.meta },
      { name: "description", content: "Conversa por voz com a IA, com correção de cada fala e meta de tempo falando inglês." },
    ],
  }),
  component: TalkPage,
});

const T = t.talk;
/** Long answers: wait 2.5 s of silence before closing the turn. */
const SILENCE_MS = 2500;
type Stage = "intro" | "live" | "done";
type Status = "speaking" | "listening" | "thinking" | "waiting" | null;
interface Line extends TalkTurn {
  natural?: string;
  tip?: string;
}
interface Fix {
  mine: string;
  natural: string;
  natural_pt: string;
  tip: string;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function TalkPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("intro");
  const [talks, setTalks] = useState<TalkSession[]>([]);
  const [topic, setTopic] = useState<TalkTopic>(topicOfToday());
  const [goal, setGoal] = useState(60);
  const [spoken, setSpoken] = useState(0);
  const [live, setLive] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [heard, setHeard] = useState("");
  const [mic, setMic] = useState<MicState>("idle");
  const [status, setStatus] = useState<Status>(null);
  const [error, setError] = useState("");
  const [usedAi, setUsedAi] = useState<boolean | null>(null);
  const [result, setResult] = useState<{ reached: boolean; cards: number; next: number } | null>(null);

  const alive = useRef(true);
  const ended = useRef(false);
  const ctrl = useRef<AbortController | null>(null);
  const history = useRef<TalkTurn[]>([]);
  const fixes = useRef<Fix[]>([]);
  const spokenRef = useRef(0);
  const reachedRef = useRef(false);
  const me = useRef({ name: "", city: "" });
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      const [list, name] = await Promise.all([repo.listTalks(), repo.getMyName()]);
      if (!alive.current) return;
      me.current = { name: name.name, city: name.city ?? "" };
      setTalks(list);
      setGoal(nextGoal(list));
    })();
    return () => {
      alive.current = false;
      ctrl.current?.abort();
      stopCoach();
    };
  }, []);

  useEffect(() => chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [lines, status, heard]);

  const stopped = () => !alive.current || ended.current;

  function addSpoken(sec: number) {
    spokenRef.current += sec;
    setSpoken(spokenRef.current);
    if (!reachedRef.current && spokenRef.current >= goal) {
      reachedRef.current = true;
      haptic([20, 60, 20]);
    }
  }

  async function start() {
    unlockAudio();
    ended.current = false;
    history.current = [];
    fixes.current = [];
    spokenRef.current = 0;
    reachedRef.current = false;
    setSpoken(0);
    setLines([]);
    setResult(null);
    setError("");
    setStage("live");
    setUsedAi(!!(await aiFor("converse")));
    await aiTurn();
  }

  async function aiTurn() {
    if (stopped()) return;
    setStatus("thinking");
    const c = new AbortController();
    ctrl.current = c;
    let r: Awaited<ReturnType<typeof talkTurn>>;
    try {
      r = await talkTurn(topic, history.current, me.current, c.signal);
    } catch {
      return;
    }
    if (stopped()) return;
    setUsedAi(r.ai);
    const lastUser = [...history.current].reverse().find((h) => h.role === "user");
    if (lastUser && !r.correct && r.natural) {
      fixes.current.push({ mine: lastUser.text, natural: r.natural, natural_pt: r.natural_pt, tip: r.tip_pt });
      setLines((ls) => {
        const out = [...ls];
        for (let i = out.length - 1; i >= 0; i--) if (out[i]!.role === "user") { out[i] = { ...out[i]!, natural: r.natural, tip: r.tip_pt }; break; }
        return out;
      });
    }
    history.current = [...history.current, { role: "ai", text: r.reply }];
    setLines((ls) => [...ls, { role: "ai", text: r.reply }]);
    setStatus("speaking");
    if (lastUser && !r.correct && r.natural) await coachSay(`${T.betterSpoken} ${r.natural}`, "repeat");
    if (stopped()) return;
    await coachSay(r.reply, "en");
    if (stopped()) return;
    void userTurn();
  }

  async function userTurn() {
    if (stopped()) return;
    setError("");
    let silent = 0;
    while (!stopped()) {
      setStatus("listening");
      setHeard("");
      setMic("recording");
      const c = new AbortController();
      ctrl.current = c;
      let firstWord = 0;
      const tick = window.setInterval(() => setLive(firstWord ? (Date.now() - firstWord) / 1000 : 0), 250);
      const lastAi = [...history.current].reverse().find((h) => h.role === "ai")?.text ?? "";
      try {
        const h = await hearOnce([lastAi], c.signal, (x) => { if (x && !firstWord) firstWord = Date.now(); setHeard(x); }, () => setMic("processing"), false, SILENCE_MS);
        window.clearInterval(tick);
        setLive(0);
        setMic("idle");
        if (c.signal.aborted || stopped()) return;
        const text = h.transcript.trim();
        if (!text) {
          if (++silent >= 2) return setStatus("waiting");
          continue;
        }
        const cmd = detectCommand(text);
        if (cmd === "pause") return setStatus("waiting");
        if (cmd === "repeat" || cmd === "slower") {
          setStatus("speaking");
          await coachSay(lastAi, cmd === "slower" ? "repeat" : "en");
          continue;
        }
        const talked = firstWord ? Math.max(1, (Date.now() - firstWord - SILENCE_MS) / 1000) : Math.max(1, h.seconds - SILENCE_MS / 1000);
        addSpoken(Math.min(talked, h.seconds));
        setHeard("");
        history.current = [...history.current, { role: "user", text }];
        setLines((ls) => [...ls, { role: "user", text }]);
        return void aiTurn();
      } catch (e) {
        window.clearInterval(tick);
        setLive(0);
        setMic("idle");
        if (c.signal.aborted || stopped()) return;
        const msg = e instanceof Error ? e.message : t.speech.failed;
        if (msg === t.speech.noSpeech) {
          if (++silent >= 2) return setStatus("waiting");
          continue;
        }
        setError(msg);
        return setStatus("waiting");
      }
    }
  }

  async function replay() {
    const last = [...history.current].reverse().find((h) => h.role === "ai");
    if (!last || status === "listening" || status === "thinking") return;
    setStatus("speaking");
    await coachSay(last.text, "en");
    setStatus("waiting");
  }

  async function finish() {
    ended.current = true;
    ctrl.current?.abort();
    stopCoach();
    setStatus(null);
    setMic("idle");
    const userTurns = history.current.filter((h) => h.role === "user");
    const reached = spokenRef.current >= goal;
    for (const f of fixes.current) await repo.createCard({ front: f.natural_pt || f.mine, back: f.natural, tag: T.tag }).catch(() => {});
    if (userTurns.length) {
      const saved = await repo.saveTalk({
        topic: topic.id,
        seconds: Math.round(spokenRef.current),
        goal_seconds: goal,
        turns: userTurns.length,
        longest: userTurns.reduce((m, u) => Math.max(m, words(u.text)), 0),
        reached,
      });
      const all = [...talks, saved];
      setTalks(all);
      setResult({ reached, cards: fixes.current.length, next: nextGoal(all) });
    } else setResult({ reached: false, cards: 0, next: goal });
    if (reached) haptic([20, 60, 20]);
    setStage("done");
  }

  const pct = Math.min(1, (spoken + live) / goal);
  const userTurns = lines.filter((l) => l.role === "user");
  const statusText = status === "listening" ? T.listening : status === "thinking" ? T.thinking : status === "speaking" ? T.speaking : status === "waiting" ? T.tapToSpeak : "";
  const lastUser = userTurns.at(-1);

  return (
    <div className="pt-safe pb-safe flex h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-md items-center gap-3 px-5 pt-2">
        <Button variant="ghost" size="icon" asChild aria-label={T.back} className="size-11 rounded-full">
          <Link to="/" onClick={() => { ended.current = true; ctrl.current?.abort(); stopCoach(); }}><X className="size-5" /></Link>
        </Button>
        {stage === "live" ? (
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-caption text-muted-foreground">{T.spoken}</span>
              <span className="font-display text-lg font-bold tabular-nums">
                {clock(spoken + live)} <span className="text-caption font-normal text-muted-foreground">{T.of} {clock(goal)}</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.round(spoken)}>
              <div className={cn("h-full rounded-full transition-[width] duration-300", pct >= 1 ? "bg-live" : "bg-primary")} style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
        ) : (
          <span className="flex-1" />
        )}
      </header>

      {stage === "intro" && (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-end gap-5 overflow-y-auto px-5 pb-8">
          <div className="flex items-center gap-3">
            <CoachAvatar talking={false} />
            <div>
              <p className="text-caption font-semibold text-primary">{T.eyebrow}</p>
              <h1 className="text-title">{T.goal(clock(goal))}</h1>
            </div>
          </div>
          {talks.length > 0 && <p className="text-caption text-muted-foreground">{T.best(clock(bestTalk(talks)))}</p>}
          <div>
            <p className="text-caption mb-2 font-semibold text-muted-foreground">{T.topic}</p>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((tp) => (
                <button
                  key={tp.id}
                  type="button"
                  aria-pressed={topic.id === tp.id}
                  onClick={() => setTopic(tp)}
                  className={cn("h-11 rounded-full border px-4 text-sm font-semibold transition-colors", topic.id === tp.id ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground")}
                >
                  {T.topics[tp.id]}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-muted p-4">
            <p className="text-caption font-semibold text-muted-foreground">{T.howTitle}</p>
            <ul className="mt-2 space-y-1.5 text-base">
              {T.how.map((h) => <li key={h} className="flex gap-2"><span aria-hidden="true">•</span>{h}</li>)}
            </ul>
          </div>
          <Button size="lg" className="w-full" onClick={() => void start()}><Mic /> {T.start}</Button>
        </main>
      )}

      {stage === "live" && (
        <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5 pb-6">
          <div className="flex items-center gap-3 pt-3">
            <CoachAvatar talking={status === "speaking"} />
            <div className="min-w-0">
              <h1 className="text-headline">{T.topics[topic.id]}</h1>
              {reachedRef.current && <p className="text-caption font-semibold text-primary">🏆 {T.goalReached}</p>}
            </div>
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto py-2" aria-live="polite">
            {lines.map((l, i) => (
              <div key={i} className={cn("flex flex-col", l.role === "user" ? "items-end" : "items-start")}>
                <p lang="en" className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-base", l.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>{l.text}</p>
                {l.natural && (
                  <div className="mt-1.5 max-w-[85%] rounded-xl border-l-4 border-live bg-live/15 px-3 py-2 text-left">
                    <p className="text-caption font-semibold text-muted-foreground">{T.natural}</p>
                    <p lang="en" className="text-base font-semibold">{l.natural}</p>
                    {l.tip && <p className="text-caption mt-1">{l.tip}</p>}
                  </div>
                )}
              </div>
            ))}
            {status === "listening" && heard && (
              <div className="flex justify-end"><p lang="en" className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/40 px-4 py-2.5 text-base italic">{heard}</p></div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="flex flex-col items-center gap-3 pt-2">
            {lastUser && words(lastUser.text) < 8 && status === "listening" && <p className="text-caption text-center text-muted-foreground">{T.longer}</p>}
            <p role="status" className="min-h-6 text-center text-base font-semibold">{statusText}</p>
            <MicButton
              state={status === "thinking" ? "processing" : mic}
              disabled={status === "speaking"}
              onClick={() => (mic === "recording" ? ctrl.current?.abort() : status === "waiting" ? void userTurn() : undefined)}
            />
            {error && <p role="alert" className="text-center text-base text-destructive">{error}</p>}
            {usedAi === false && <p className="text-caption text-center text-muted-foreground">{T.noAi}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => void replay()} disabled={!lines.length}><Volume2 /> {T.replay}</Button>
              <Button variant="ghost" size="sm" onClick={() => void finish()}><Square /> {T.end}</Button>
            </div>
          </div>
        </main>
      )}

      {stage === "done" && result && (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 overflow-y-auto px-5 pb-8 pt-4">
          <div className="space-y-2 rounded-[20px] bg-ink p-6 text-center text-ink-foreground">
            {result.reached ? <Trophy className="mx-auto size-10 text-live" aria-hidden="true" /> : <CheckCircle2 className="mx-auto size-10 text-live" aria-hidden="true" />}
            <h1 className="text-title">{result.reached ? T.reached : T.notReached}</h1>
            <p className="font-display text-4xl font-bold tabular-nums">{clock(spoken)} <span className="text-base font-normal text-ink-foreground/70">/ {clock(goal)}</span></p>
            <p className="text-base text-ink-foreground/80">{T.stats(clock(spoken), userTurns.length, userTurns.reduce((m, u) => Math.max(m, words(u.text)), 0))}</p>
            <p className="text-caption font-semibold text-live">{T.nextGoal(clock(result.next))}</p>
          </div>
          <h2 className="text-headline">{T.corrections}</h2>
          {fixes.current.length === 0 ? (
            <p className="text-base">{usedAi ? T.noCorrections : T.noAi}</p>
          ) : (
            <section className="space-y-3">
              {fixes.current.map((f, i) => (
                <article key={i} className="space-y-1.5 rounded-2xl border p-4">
                  <p lang="en" className="text-base text-muted-foreground line-through decoration-destructive/60">{f.mine}</p>
                  <div className="flex items-start gap-2">
                    <p lang="en" className="text-headline flex-1">{f.natural}</p>
                    <Button size="sm" variant="secondary" onClick={() => void coachSay(f.natural, "en")}><Volume2 /> {T.listen}</Button>
                  </div>
                  {f.tip && <p className="text-caption"><span className="font-semibold">{T.tip}:</span> {f.tip}</p>}
                </article>
              ))}
              <p className="text-caption text-muted-foreground">{T.cardsCreated(result.cards)}</p>
            </section>
          )}
          <div className="mt-auto flex flex-col gap-2">
            <Button size="lg" className="w-full" onClick={() => { setGoal(result.next); setStage("intro"); }}><RotateCcw /> {T.again}</Button>
            <Button size="lg" variant="secondary" className="w-full" onClick={() => void navigate({ to: "/" })}>{T.back}</Button>
          </div>
        </main>
      )}
    </div>
  );
}
