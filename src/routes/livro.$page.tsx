import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Lightbulb, MessagesSquare, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { repo } from "@/data/repo";
import type { DrillPack } from "@/data/types";
import { BOOK_COURSE, fillCorrect, getBookPage, pagesOfUnit, type BookSection } from "@/book/book";
import { coachSay, stopCoach, unlockAudio } from "@/ai/tts";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/pt-BR";

const B = t.book;

export const Route = createFileRoute("/livro/$page")({
  head: () => ({ meta: [{ title: B.meta }, { name: "description", content: "Estude uma página da apostila: vocabulário, gramática, textos e exercícios." }] }),
  component: BookPageScreen,
});

const say = (en: string) => { unlockAudio(); void coachSay(en, "en"); };

/** One book page, studied top to bottom: intro, vocabulary, grammar, adapted texts and exercises. */
function BookPageScreen() {
  const n = Number(Route.useParams().page);
  const pg = getBookPage(n);
  const [done, setDone] = useState<number[]>([]);
  const [unitPack, setUnitPack] = useState<DrillPack | null>(null);
  const [score, setScore] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setScore({});
    window.scrollTo(0, 0);
    void repo.listBookPagesDone().then(setDone);
    if (pg) void repo.listDrillPacks().then((ps) => setUnitPack(ps.find((p) => p.course_id === BOOK_COURSE && p.unit === pg.unit) ?? null));
    return () => stopCoach();
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  const siblings = useMemo(() => (pg ? pagesOfUnit(pg.unit) : []), [pg]);
  if (!pg) return <p className="p-6">{t.errors.notFound}</p>;
  const next = siblings.find((p) => p.page > n);
  const isDone = done.includes(n);
  const answered = Object.values(score);
  const report = (key: string, ok: boolean) => setScore((s) => (key in s ? s : { ...s, [key]: ok }));

  async function toggleDone() {
    const list = await repo.setBookPageDone(n, !isDone);
    setDone(list);
    if (!isDone) haptic(20);
  }

  return (
    <div className="pt-safe pb-safe mx-auto min-h-dvh max-w-md px-5 pb-12">
      <header className="sticky top-0 z-10 -mx-5 flex items-center gap-2 bg-background/95 px-3 py-2 backdrop-blur">
        <Button variant="ghost" size="icon" asChild aria-label={B.backUnit}>
          {unitPack ? <Link to="/aulas/$packId" params={{ packId: unitPack.id }}><ChevronLeft /></Link> : <Link to="/aulas"><ChevronLeft /></Link>}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-caption text-muted-foreground">{t.aulas.unit(pg.unit)} · {B.page(n)}</p>
          <h1 className="text-headline truncate" lang="en">{pg.title}</h1>
        </div>
        {isDone && <span className="grid size-8 place-items-center rounded-full bg-live text-live-foreground"><Check className="size-4" /></span>}
      </header>
      <ol className="mb-5 mt-1 flex gap-1" aria-label={B.pagesDone(siblings.filter((p) => done.includes(p.page)).length, siblings.length)}>
        {siblings.map((p) => (
          <li key={p.page} className="flex-1">
            <Link to="/livro/$page" params={{ page: String(p.page) }} aria-label={B.page(p.page)}
              className={cn("block h-1.5 rounded-full", p.page === n ? "bg-primary" : done.includes(p.page) ? "bg-live" : "bg-muted")} />
          </li>
        ))}
      </ol>
      <p className="text-base text-muted-foreground">{pg.subtitle_pt}</p>

      <div className="mt-5 space-y-6">
        {pg.sections.map((s, i) => <Section key={`${n}-${i}`} s={s} id={`${n}-${i}`} report={report} />)}
      </div>

      <div className="mt-8 space-y-3">
        {answered.length > 0 && <p className="text-caption text-center text-muted-foreground">{B.score(answered.filter(Boolean).length, answered.length)}</p>}
        <Button size="lg" className="w-full" variant={isDone ? "secondary" : "default"} onClick={() => void toggleDone()}>
          {isDone ? <><Check /> {B.done}</> : <><Check /> {B.markDone}</>}
        </Button>
        {next && (
          <Button size="lg" variant="secondary" className="w-full" asChild>
            <Link to="/livro/$page" params={{ page: String(next.page) }}>{B.next(next.page)} <ChevronRight /></Link>
          </Button>
        )}
        {!next && unitPack && (
          <Button size="lg" variant="secondary" className="w-full" asChild>
            <Link to="/tete-a-tete" search={{ u: unitPack.id }}><MessagesSquare /> {B.practiceTete}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function Section({ s, id, report }: { s: BookSection; id: string; report: (key: string, ok: boolean) => void }) {
  switch (s.kind) {
    case "intro":
      return <p className="rounded-2xl bg-muted p-4 text-base">{s.text_pt}</p>;
    case "tip":
      return <p className="rounded-xl border-l-4 border-live bg-live/15 p-3 text-base">🐈 {s.text_pt}</p>;
    case "vocab":
      return (
        <section>
          <h2 className="text-headline mb-2">{s.title_pt}</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {s.items.map((it) => (
              <li key={it.en}>
                <button type="button" onClick={() => say(it.en.replace(/^[\d$.,¢]+\s+/, ""))} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span lang="en" className="block font-semibold">{it.en}</span>
                    <span className="text-caption block text-muted-foreground">{it.pt}</span>
                  </span>
                  <Volume2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      );
    case "grammar":
      return (
        <section className="rounded-2xl border-2 border-primary/30 bg-card p-4">
          <h2 className="text-headline mb-3">📘 {s.title_pt}</h2>
          <dl className="space-y-2">
            {s.rows.map((r) => (
              <div key={r.label + r.en}>
                <dt className="text-caption font-semibold text-muted-foreground">{r.label}</dt>
                <dd><button type="button" lang="en" onClick={() => say(r.en)} className="text-left text-base font-semibold">{r.en}</button></dd>
              </div>
            ))}
          </dl>
          {s.note_pt && <p className="mt-3 flex gap-2 text-base"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{s.note_pt}</p>}
        </section>
      );
    case "dialogue":
      return <Dialogue s={s} />;
    case "fill":
      return (
        <section>
          <h2 className="text-headline mb-2">✏️ {s.title_pt}</h2>
          <ul className="space-y-2">{s.items.map((it, k) => <FillItem key={k} item={it} onAnswer={(ok) => report(`${id}-${k}`, ok)} />)}</ul>
        </section>
      );
    case "choose":
      return (
        <section>
          <h2 className="text-headline mb-2">☑️ {s.title_pt}</h2>
          <ul className="space-y-3">{s.items.map((it, k) => <ChooseItem key={k} item={it} onAnswer={(ok) => report(`${id}-${k}`, ok)} />)}</ul>
        </section>
      );
    case "match":
      return <Match s={s} onAnswer={(ok) => report(id, ok)} />;
    case "speak":
      return (
        <section>
          <h2 className="text-headline mb-2">🗣️ {s.title_pt}</h2>
          <ul className="space-y-2">{s.prompts.map((p) => <SpeakItem key={p.q} p={p} />)}</ul>
        </section>
      );
  }
}

function Dialogue({ s }: { s: Extract<BookSection, { kind: "dialogue" }> }) {
  const [pt, setPt] = useState(false);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-headline">💬 {s.title_pt}</h2>
        <Button size="sm" variant="ghost" onClick={() => setPt(!pt)}>{pt ? B.hidePt : B.showPt}</Button>
      </div>
      <ul className="space-y-2 rounded-2xl border bg-card p-3">
        {s.lines.map((l, k) => (
          <li key={k}>
            <button type="button" onClick={() => say(l.en)} className="flex w-full gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-muted">
              {l.who && <span className="w-16 shrink-0 truncate text-sm font-bold text-primary">{l.who}</span>}
              <span className="min-w-0 flex-1">
                <span lang="en" className="block text-base">{l.en}</span>
                {pt && <span className="text-caption block text-muted-foreground">{l.pt}</span>}
              </span>
              <Volume2 className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {s.note_pt && <p className="text-caption mt-2 text-muted-foreground">{s.note_pt}</p>}
    </section>
  );
}

function FillItem({ item, onAnswer }: { item: { en: string; answers: string[]; pt: string }; onAnswer: (ok: boolean) => void }) {
  const [val, setVal] = useState("");
  const [res, setRes] = useState<boolean | null>(null);
  const [before, after] = item.en.split("___") as [string, string | undefined];
  function check() {
    if (!val.trim()) return;
    const ok = fillCorrect(val, item.answers);
    setRes(ok);
    onAnswer(ok);
    haptic(ok ? 15 : [30, 40, 30]);
    if (ok) say(item.en.replace("___", item.answers[0]!));
  }
  return (
    <li className={cn("rounded-2xl border bg-card p-3", res === true && "border-live", res === false && "border-destructive/60")}>
      <form onSubmit={(e) => { e.preventDefault(); check(); }} className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-base" lang="en">
        <span>{before}</span>
        <input
          value={val}
          onChange={(e) => { setVal(e.target.value); setRes(null); }}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-label={item.pt || item.en}
          className="h-9 w-32 rounded-lg border bg-background px-2 text-base font-semibold outline-none focus:border-primary"
        />
        {after && <span>{after}</span>}
        <Button type="submit" size="sm" variant="secondary" className="ml-auto" disabled={!val.trim()}>{B.check}</Button>
      </form>
      {item.pt && <p className="text-caption mt-1 text-muted-foreground">{item.pt}</p>}
      {res === true && <p className="text-caption mt-1 font-semibold text-primary">{B.correct}</p>}
      {res === false && <p className="text-caption mt-1 font-semibold text-destructive">{B.wrong(item.answers[0]!)}</p>}
    </li>
  );
}

function ChooseItem({ item, onAnswer }: { item: { options: string[]; correct: number; why_pt: string }; onAnswer: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <li className="space-y-2">
      <div className="grid gap-2">
        {item.options.map((o, k) => {
          const show = picked !== null;
          const right = k === item.correct;
          return (
            <button
              key={o}
              type="button"
              lang="en"
              disabled={show}
              onClick={() => { setPicked(k); onAnswer(right); haptic(right ? 15 : [30, 40, 30]); say(item.options[item.correct]!); }}
              className={cn("min-h-12 rounded-2xl border bg-card px-4 py-2 text-left text-base transition-colors",
                show && right && "border-live bg-live/20 font-semibold",
                show && picked === k && !right && "border-destructive/60 bg-destructive/10 line-through")}
            >
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && <p className="text-caption">{picked === item.correct ? "✅ " : "❌ "}{item.why_pt}</p>}
    </li>
  );
}

function Match({ s, onAnswer }: { s: Extract<BookSection, { kind: "match" }>; onAnswer: (ok: boolean) => void }) {
  // Alphabetical on the server, shuffled after hydration (avoids an SSR mismatch).
  const [options, setOptions] = useState(() => [...new Set(s.pairs.map((p) => p.b))].sort());
  useEffect(() => setOptions((o) => [...o].sort(() => Math.random() - 0.5)), [s]);
  const [sel, setSel] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const right = s.pairs.filter((p, k) => sel[k] === p.b).length;
  return (
    <section>
      <h2 className="text-headline mb-2">🔗 {s.title_pt}</h2>
      <ul className="space-y-2">
        {s.pairs.map((p, k) => (
          <li key={k} className={cn("flex items-center gap-2 rounded-2xl border bg-card p-2 pl-4", checked && (sel[k] === p.b ? "border-live" : "border-destructive/60"))}>
            <span lang="en" className="w-24 shrink-0 font-semibold">{p.a}</span>
            <select
              value={sel[k] ?? ""}
              onChange={(e) => { setSel({ ...sel, [k]: e.target.value }); setChecked(false); }}
              className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-2 text-base"
              aria-label={p.a}
            >
              <option value="">…</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {checked && sel[k] !== p.b && <span lang="en" className="text-caption w-20 shrink-0 text-destructive">{p.b}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" variant="secondary" disabled={Object.keys(sel).length === 0} onClick={() => { setChecked(true); onAnswer(right === s.pairs.length); haptic(15); }}>{B.check}</Button>
        {checked && <span className="text-caption font-semibold">{B.matchScore(right, s.pairs.length)}</span>}
      </div>
    </section>
  );
}

function SpeakItem({ p }: { p: { q: string; pt: string; model: string } }) {
  const [show, setShow] = useState(false);
  return (
    <li className="rounded-2xl border bg-card p-3">
      <button type="button" onClick={() => say(p.q)} className="flex w-full items-start gap-2 text-left">
        <span className="min-w-0 flex-1">
          <span lang="en" className="block text-base font-semibold">{p.q}</span>
          <span className="text-caption block text-muted-foreground">{p.pt}</span>
        </span>
        <Volume2 className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {show ? (
        <button type="button" onClick={() => say(p.model)} className="mt-2 flex w-full items-center gap-2 rounded-xl bg-muted px-3 py-2 text-left">
          <span className="min-w-0 flex-1"><span className="text-caption block text-muted-foreground">{B.model}</span><span lang="en" className="block text-base">{p.model}</span></span>
          <Volume2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setShow(true)}>{B.model}</Button>
      )}
    </li>
  );
}
