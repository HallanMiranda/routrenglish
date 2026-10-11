import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicButton, type MicState } from "@/components/session/MicButton";
import { CoachAvatar } from "@/components/drill/CoachParts";
import { repo } from "@/data/repo";
import type { Card, CardRating } from "@/data/types";
import { judgeCard } from "@/ai/judge";
import { coachSay, stopCoach, unlockAudio } from "@/ai/tts";
import { hearOnce } from "@/lesson/hear";
import { t } from "@/lib/i18n/pt-BR";

const R = t.reviewSession;

export const Route = createFileRoute("/aulas/revisar")({
  head: () => ({
    meta: [
      { title: R.meta },
      { name: "description", content: "Revise por voz os cartões criados a partir dos seus erros." },
      { property: "og:title", content: R.meta },
      { property: "og:description", content: "Revise por voz os cartões criados a partir dos seus erros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewSession,
});

function ReviewSession() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [hasAny, setHasAny] = useState(false);
  const [i, setI] = useState(-1);
  const [mic, setMic] = useState<MicState>("idle");
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  const [shown, setShown] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [talking, setTalking] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      const [due, all] = await Promise.all([repo.listDueCards(), repo.listCards()]);
      setCards(due);
      setHasAny(all.length > 0);
      const future = all.map((c) => c.due_at).filter((d) => new Date(d) > new Date()).sort()[0];
      setNext(future ? new Date(future).toLocaleDateString("pt-BR", { day: "numeric", month: "long" }) : null);
    })();
    return () => { abort.current?.abort(); stopCoach(); };
  }, []);

  const card = cards && i >= 0 ? cards[i] : undefined;

  async function ask(c: Card) {
    setHeard(""); setResult(null); setShown(false);
    setTalking(true);
    await coachSay(`${R.ask} ${c.front.replace(/[.!?…\s]+$/, "")}?`, "pt");
    setTalking(false);
    await answer(c);
  }
  async function answer(c: Card) {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setMic("recording");
    try {
      const h = await hearOnce([c.back], ctrl.signal, setHeard, () => setMic("processing"));
      if (!h.transcript) { setMic("idle"); return; }
      setHeard(h.transcript);
      setMic("checking");
      const r = await judgeCard(c.front, c.back, h.transcript);
      setResult(r.correct);
      setShown(true);
      setTalking(true);
      await coachSay(c.back, "en");
      setTalking(false);
    } catch {
      /* no speech or stopped: answer by button */
    } finally {
      setMic("idle");
    }
  }
  async function rate(rating: CardRating) {
    if (!card || !cards) return;
    abort.current?.abort(); stopCoach();
    await repo.rateCard(card.id, rating);
    if (rating === "good") setCorrect((n) => n + 1);
    const n = i + 1;
    setI(n);
    if (cards[n]) void ask(cards[n]!);
  }

  const finished = cards && i >= cards.length && cards.length > 0;
  return (
    <div className="pt-safe pb-safe mx-auto flex h-dvh max-w-md flex-col px-5">
      <header className="flex items-center gap-2 py-2">
        <Button variant="ghost" size="icon" asChild aria-label={t.aulas.back}><Link to="/aulas"><X /></Link></Button>
        <p className="text-caption flex-1 text-muted-foreground">{R.title}{card && cards ? ` · ${R.count(i + 1, cards.length)}` : ""}</p>
      </header>

      {!cards ? null : cards.length === 0 ? (
        <main className="flex flex-1 flex-col justify-center gap-3 text-center">
          <p className="text-title">{R.noneDue}</p>
          <p className="text-base text-muted-foreground">{hasAny && next ? R.nextDue(next) : R.noCards}</p>
          <Button variant="secondary" asChild><Link to="/aulas">{t.aulas.back}</Link></Button>
        </main>
      ) : finished ? (
        <main className="flex flex-1 flex-col justify-center gap-3 text-center">
          <p className="text-title">{R.finished}</p>
          <p className="text-base text-muted-foreground">{R.correct(correct, cards.length)}</p>
          {next && <p className="text-caption text-muted-foreground">{R.nextDue(next)}</p>}
          <Button size="lg" asChild><Link to="/aulas">{t.aulas.back}</Link></Button>
        </main>
      ) : !card ? (
        <main className="flex flex-1 flex-col justify-end gap-6 pb-8">
          <div className="flex items-center gap-3"><CoachAvatar talking={false} /><h1 className="text-title">{R.title}</h1></div>
          <p className="text-base text-muted-foreground">{R.ready(cards.length)}</p>
          <Button size="lg" className="w-full" onClick={() => { unlockAudio(); setI(0); void ask(cards[0]!); }}><Play /> {R.start}</Button>
        </main>
      ) : (
        <>
          <section className="flex flex-1 flex-col justify-center gap-4 text-center">
            <div className="mx-auto"><CoachAvatar talking={talking} /></div>
            {card.tag && <p className="text-caption mx-auto w-fit rounded-full bg-muted px-2.5 py-0.5">{R.source}: {card.tag}</p>}
            <p className="font-display text-3xl font-bold leading-tight text-balance">{card.front}</p>
            {heard && <p lang="en" className="text-headline">{heard}</p>}
            {result !== null && <p className={result ? "font-semibold text-primary" : "font-semibold text-destructive"}>{result ? R.looksRight : R.looksWrong}</p>}
            {shown && <p lang="en" className="rounded-xl border bg-card p-3 text-lg"><span className="text-caption block text-muted-foreground">{R.answer}</span>{card.back}</p>}
          </section>
          <section className="flex shrink-0 flex-col items-center gap-3 pb-4">
            {!shown ? (
              <>
                <MicButton state={mic} onClick={() => (mic === "recording" ? abort.current?.abort() : mic === "idle" ? void answer(card) : undefined)} />
                <p className="text-caption h-5 font-semibold text-muted-foreground">{t.mic.states[mic]}</p>
                <Button variant="ghost" onClick={() => { abort.current?.abort(); setShown(true); }}><Eye /> {R.show}</Button>
              </>
            ) : (
              <div className="grid w-full grid-cols-3 gap-2">
                <Button variant={result === false ? "default" : "secondary"} onClick={() => void rate("again")}>{R.again}</Button>
                <Button variant="secondary" onClick={() => void rate("hard")}>{R.hard}</Button>
                <Button variant={result ? "default" : "secondary"} onClick={() => void rate("good")}>{R.good}</Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
