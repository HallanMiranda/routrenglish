import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Play, RotateCcw, SkipForward, Square, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicButton, type MicState } from "@/components/session/MicButton";
import { CoachAvatar, DiffLine } from "@/components/drill/CoachParts";
import { repo } from "@/data/repo";
import type { ConverseTurn, Mission, Session } from "@/data/types";
import { checkAnswer, type DiffOp } from "@/drills/check";
import { withMyName } from "@/ai/judge";
import { aiFor } from "@/ai/client";
import { converse, missionReport, type ReportTarget } from "@/ai/converse";
import { coachSay, stopCoach, unlockAudio } from "@/ai/tts";
import { detectCommand, hearOnce, type VoiceCommand } from "@/lesson/hear";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n/pt-BR";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sessao/$sessionId")({
  head: () => ({
    meta: [
      { title: t.mission.meta },
      { name: "description", content: "Missão ao vivo: frases-chave, conversa por voz com a IA e relatório." },
    ],
  }),
  component: MissionSession,
});

const M = t.mission;
type Stage = "loading" | "missing" | "intro" | "phrases" | "live" | "report";
type Status = "speaking" | "listening" | "thinking" | "waiting" | null;
type Heard = { text: string } | { cmd: VoiceCommand } | null | "error";

/** Key phrases worth repeating aloud: no "..." templates, first option of "a / b". */
function speakable(phrases: string[]) {
  return phrases
    .filter((p) => !p.includes("..."))
    .map((p) => (p.split("/")[0] ?? p).trim())
    .filter((p) => p.split(/\s+/).length >= 2);
}

const pick = (xs: readonly string[]) => xs[Math.floor(Math.random() * xs.length)] ?? "";
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function MissionSession() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("loading");
  const [mission, setMission] = useState<Mission | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [phrases, setPhrases] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [heard, setHeard] = useState("");
  const [ops, setOps] = useState<DiffOp[] | null>(null);
  const [feedback, setFeedback] = useState("");
  const [mic, setMic] = useState<MicState>("idle");
  const [status, setStatus] = useState<Status>(null);
  const [turns, setTurns] = useState<ConverseTurn[]>([]);
  const [error, setError] = useState("");
  const [report, setReport] = useState<{ targets: ReportTarget[]; ai: boolean } | null>(null);

  const alive = useRef(true);
  const ctrl = useRef<AbortController | null>(null);
  const phase = useRef<Stage>("loading");
  const ended = useRef(false);
  const history = useRef<ConverseTurn[]>([]);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      const s = await repo.getSession(sessionId);
      const m = s ? await repo.getMission(s.mission_id) : null;
      if (!alive.current) return;
      if (!s || !m) return setStage("missing");
      setSession(s);
      setMission(m);
      setPhrases(speakable(m.key_phrases));
      setStage("intro");
    })();
    return () => {
      alive.current = false;
      ctrl.current?.abort();
      stopCoach();
    };
  }, [sessionId]);

  useEffect(() => chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [turns, status]);

  const stopped = () => !alive.current || ended.current;
  const leftPhrases = () => stopped() || phase.current !== "phrases";

  async function say(text: string, style: "pt" | "en" | "repeat") {
    if (stopped()) return;
    await coachSay(text, style);
  }

  /** One listening turn. null = silence; "error" = mic problem (message already shown). */
  async function listen(expected: string[]): Promise<Heard> {
    const c = new AbortController();
    ctrl.current = c;
    setHeard("");
    setMic("recording");
    try {
      const h = await hearOnce(expected, c.signal, setHeard, () => setMic("processing"));
      setMic("idle");
      if (c.signal.aborted || stopped() || !h.transcript) return null;
      setHeard(h.transcript);
      const cmd = detectCommand(h.transcript);
      return cmd ? { cmd } : { text: h.transcript };
    } catch (e) {
      setMic("idle");
      if (c.signal.aborted || stopped()) return null;
      const msg = e instanceof Error ? e.message : t.speech.failed;
      if (msg === t.speech.noSpeech) return null;
      setError(msg);
      return "error";
    }
  }

  // ---- Stage 1: key phrases ("Repete comigo") ----
  async function runPhrases() {
    unlockAudio();
    const sayP = async (text: string, style: "pt" | "repeat") => { if (!leftPhrases()) await coachSay(text, style); };
    phase.current = "phrases";
    setError("");
    setStage("phrases");
    for (let i = 0; i < phrases.length && !leftPhrases(); i++) {
      const p = phrases[i] ?? "";
      setIdx(i);
      setOps(null);
      setFeedback("");
      await sayP(p, "repeat");
      let wrong = 0;
      let silent = 0;
      while (!leftPhrases()) {
        const h = await listen([p]);
        if (h === "error") return;
        if (h === null) {
          if (++silent >= 2) break;
          await sayP(p, "repeat");
          continue;
        }
        if ("cmd" in h) {
          if (h.cmd === "dontKnow") break;
          await sayP(p, "repeat");
          continue;
        }
        const r = checkAnswer(await withMyName(h.text), [p]);
        setOps(r.ops);
        if (r.correct) {
          haptic(20);
          const g = pick(M.good);
          setFeedback(g);
          await sayP(g, "pt");
          break;
        }
        haptic([30, 40, 30]);
        if (++wrong >= 2) {
          setFeedback(M.moveOn);
          await sayP(M.moveOn, "pt");
          break;
        }
        setFeedback(M.tryAgain);
        await sayP(M.tryAgain, "pt");
        await sayP(p, "repeat");
      }
    }
    if (leftPhrases()) return;
    await repo.completeStep(sessionId, 3).catch(() => {});
    void runLive();
  }

  function skipPhrases() {
    phase.current = "live";
    ctrl.current?.abort();
    stopCoach();
    void repo.completeStep(sessionId, 3).catch(() => {});
    window.setTimeout(() => void runLive(), 50);
  }

  // ---- Stage 2: live conversation with the AI in role ----
  async function runLive() {
    if (stopped()) return;
    phase.current = "live";
    setStage("live");
    setHeard("");
    setOps(null);
    if (history.current.length === 0) await aiTurn();
    else void userTurn();
  }

  function push(turn: ConverseTurn) {
    history.current = [...history.current, turn];
    setTurns(history.current);
  }

  async function aiTurn() {
    if (!mission || stopped()) return;
    setStatus("thinking");
    const r = await converse(mission.id, history.current);
    if (stopped()) return;
    push({ role: "ai", text: r.reply });
    void repo.saveUtterance({ session_id: sessionId, step: 4, role: "ai", text: r.reply }).catch(() => {});
    setStatus("speaking");
    await say(r.reply, "en");
    if (stopped()) return;
    if (r.missionEnd) return void finishLive();
    void userTurn();
  }

  async function userTurn() {
    if (!mission || stopped()) return;
    setError("");
    let silent = 0;
    while (!stopped()) {
      setStatus("listening");
      const t0 = Date.now();
      const h = await listen(mission.key_phrases);
      if (stopped()) return;
      if (h === "error") return setStatus("waiting");
      if (h === null) {
        if (++silent >= 2) return setStatus("waiting");
        continue;
      }
      if ("cmd" in h) {
        if (h.cmd === "pause") return setStatus("waiting");
        const last = [...history.current].reverse().find((x) => x.role === "ai");
        if (last) {
          setStatus("speaking");
          await coachSay(last.text, h.cmd === "slower" ? "repeat" : "en");
        }
        continue;
      }
      push({ role: "user", text: h.text });
      setHeard("");
      void repo.saveUtterance({ session_id: sessionId, step: 4, role: "user", text: h.text, duration_ms: Date.now() - t0 }).catch(() => {});
      return void aiTurn();
    }
  }

  async function replayLast() {
    const last = [...history.current].reverse().find((x) => x.role === "ai");
    if (!last || status === "listening" || status === "thinking") return;
    setStatus("speaking");
    await coachSay(last.text, "en");
    setStatus("waiting");
  }

  function finishLive() {
    ended.current = true;
    ctrl.current?.abort();
    stopCoach();
    setStatus(null);
    void buildReport();
  }

  // ---- Stage 3: report ----
  async function buildReport() {
    setStage("report");
    setReport(null);
    await repo.completeStep(sessionId, 4).catch(() => {});
    const ai = !!(await aiFor("converse"));
    const targets = mission && history.current.some((h) => h.role === "user") ? await missionReport(mission.id, history.current) : [];
    if (alive.current) setReport({ targets, ai });
    haptic(20);
  }

  async function conclude() {
    stopCoach();
    await repo.finishSession(sessionId).catch(() => {});
    void navigate({ to: "/" });
  }

  const userTurns = turns.filter((x) => x.role === "user");
  const stageIdx = stage === "phrases" ? 0 : stage === "live" ? 1 : stage === "report" ? 2 : -1;
  const statusText = status === "listening" ? M.listening : status === "thinking" ? M.thinking : status === "speaking" ? M.speaking : status === "waiting" ? M.tapToSpeak : "";

  if (stage === "loading") return <div className="min-h-dvh bg-background" />;
  if (stage === "missing")
    return (
      <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 text-center">
        <p className="text-base">{M.notFound}</p>
        <Button asChild size="lg"><Link to="/">{M.back}</Link></Button>
      </main>
    );

  return (
    <div className="pt-safe pb-safe flex h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-md items-center gap-3 px-5 pt-2">
        <Button variant="ghost" size="icon" asChild aria-label={t.session.exit} className="size-11 rounded-full">
          <Link to="/" onClick={() => { ended.current = true; ctrl.current?.abort(); stopCoach(); }}><X className="size-5" /></Link>
        </Button>
        <ol className="grid flex-1 grid-cols-3 gap-1.5" aria-label={M.stages[Math.max(0, stageIdx)]}>
          {M.stages.map((s, i) => (
            <li key={s} className={cn("h-1.5 rounded-full", i <= stageIdx ? "bg-live" : "bg-muted")} />
          ))}
        </ol>
      </header>

      {stage === "intro" && mission && (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-end gap-5 overflow-y-auto px-5 pb-8">
          <div className="flex items-center gap-3">
            <CoachAvatar talking={false} />
            <h1 className="text-title">{mission.title}</h1>
          </div>
          <p className="text-base text-muted-foreground">{mission.situation}</p>
          {mission.goal && (
            <div className="rounded-2xl bg-muted p-4">
              <p className="text-caption font-semibold text-muted-foreground">{M.yourGoal}</p>
              <p className="text-headline mt-1">{mission.goal}</p>
            </div>
          )}
          {mission.ai_role && <p className="text-base"><span className="font-semibold">{M.youTalkTo}:</span> {mission.ai_role}</p>}
          <p className="text-caption text-muted-foreground">{M.howItWorks}</p>
          <Button size="lg" className="w-full" onClick={() => (phrases.length ? void runPhrases() : (unlockAudio(), void runLive()))}>
            <Play /> {M.start}
          </Button>
        </main>
      )}

      {stage === "phrases" && (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8">
          <p className="text-caption pt-4 font-semibold text-live">{M.phraseOf(idx + 1, phrases.length)}</p>
          <h1 className="text-title mt-1">{M.phrasesTitle}</h1>
          <div className="flex flex-1 flex-col justify-center gap-4 text-center">
            <button type="button" lang="en" onClick={() => void coachSay(phrases[idx] ?? "", "repeat")} className="text-large-title mx-auto flex items-center gap-2">
              {phrases[idx]} <Volume2 className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
            <div className="min-h-8" aria-live="polite">
              {ops && ops.some((o) => o.type !== "equal") ? <DiffLine ops={ops} /> : heard ? <p lang="en" className="text-headline text-muted-foreground">{heard}</p> : null}
            </div>
            {feedback && <p className="text-headline" role="status">{feedback}</p>}
          </div>
          <div className="flex flex-col items-center gap-4">
            <MicButton state={mic} onClick={() => (mic === "recording" ? ctrl.current?.abort() : undefined)} />
            {error && <p role="alert" className="text-base text-destructive">{error}</p>}
            {error && <Button variant="secondary" onClick={() => void runPhrases()}><RotateCcw /> {M.retry}</Button>}
            <Button variant="ghost" onClick={skipPhrases}><SkipForward /> {M.skipPhrases}</Button>
          </div>
        </main>
      )}

      {stage === "live" && (
        <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5 pb-6">
          <div className="flex items-center gap-3 pt-3">
            <CoachAvatar talking={status === "speaking"} />
            <div className="min-w-0">
              <h1 className="text-headline">{M.liveTitle}</h1>
              <p className="text-caption truncate text-muted-foreground">{mission?.ai_role ?? mission?.title}</p>
            </div>
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto py-2" aria-live="polite">
            {turns.map((x, i) => (
              <div key={i} className={cn("flex", x.role === "user" ? "justify-end" : "justify-start")}>
                <p lang="en" className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-base", x.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>
                  {x.text}
                </p>
              </div>
            ))}
            {status === "listening" && heard && (
              <div className="flex justify-end"><p lang="en" className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/40 px-4 py-2.5 text-base italic">{heard}</p></div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="flex flex-col items-center gap-3 pt-2">
            <p role="status" className="h-6 text-base font-semibold">{statusText}</p>
            <MicButton
              state={status === "thinking" ? "processing" : mic}
              disabled={status === "speaking"}
              onClick={() => (mic === "recording" ? ctrl.current?.abort() : status === "waiting" ? void userTurn() : undefined)}
            />
            {error && <p role="alert" className="text-center text-base text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => void replayLast()} disabled={!turns.length}><Volume2 /> {M.replay}</Button>
              <Button variant="ghost" size="sm" onClick={finishLive}><Square /> {M.end}</Button>
            </div>
          </div>
        </main>
      )}

      {stage === "report" && (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 overflow-y-auto px-5 pb-8 pt-4">
          <div className="space-y-2 rounded-[20px] bg-ink p-6 text-center text-ink-foreground">
            <CheckCircle2 className="mx-auto size-10 text-live" aria-hidden="true" />
            <h1 className="text-title">{M.missionDone}</h1>
            <p className="text-base text-ink-foreground/80">{M.stats(userTurns.length, userTurns.reduce((n, x) => n + words(x.text), 0))}</p>
          </div>
          <h2 className="text-headline">{M.reportTitle}</h2>
          {!report && <p className="text-base text-muted-foreground" role="status">{M.building}</p>}
          {report && report.targets.length > 0 && (
            <section className="space-y-3">
              <p className="text-caption font-semibold text-muted-foreground">{M.targetsTitle}</p>
              {report.targets.map((tg, i) => (
                <article key={i} className="space-y-2 rounded-2xl border p-4">
                  <p className="text-caption text-muted-foreground">{M.yourSentence}</p>
                  <p lang="en" className="text-base line-through decoration-destructive/60">{tg.mine}</p>
                  <p className="text-caption text-muted-foreground">{M.natural}</p>
                  <div className="flex items-start gap-2">
                    <p lang="en" className="text-headline flex-1">{tg.natural}</p>
                    <Button size="sm" variant="secondary" onClick={() => void coachSay(tg.natural, "en")}><Volume2 /> {M.listen}</Button>
                  </div>
                  {tg.explanation_pt && <p className="text-base">{tg.explanation_pt}</p>}
                  {tg.hint_pt && <p className="text-caption text-muted-foreground"><span className="font-semibold">{M.hint}:</span> {tg.hint_pt}</p>}
                </article>
              ))}
              <p className="text-caption text-muted-foreground">{M.cardsCreated(report.targets.length)}</p>
            </section>
          )}
          {report && report.targets.length === 0 && <p className="text-base">{report.ai ? M.noTargets : M.noAi}</p>}
          <Button size="lg" className="mt-auto w-full" onClick={() => void conclude()}><CheckCircle2 /> {M.finish}</Button>
        </main>
      )}
    </div>
  );
}
