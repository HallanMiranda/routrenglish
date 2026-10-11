import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Camera, Check, ChevronLeft, MessagesSquare, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PuloCard } from "@/components/drill/CoachParts";
import { repo } from "@/data/repo";
import type { DrillPack, Material, PuloDoGato, UnitStep } from "@/data/types";
import { unitNumber, unitTitle } from "@/course/course";
import { BOOK_COURSE, pagesOfUnit } from "@/book/book";
import { coachSay, stopCoach, unlockAudio } from "@/ai/tts";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/pt-BR";

const A = t.aulas;
const B = t.book;

export const Route = createFileRoute("/aulas/$packId")({
  validateSearch: (s: Record<string, unknown>): { etapa?: UnitStep } => {
    const n = Number(s["etapa"]);
    return [1, 2, 3, 4, 5].includes(n) ? { etapa: n as UnitStep } : {};
  },
  head: () => ({
    meta: [
      { title: "Unidade — Book Students — Speak Lab" },
      { name: "description", content: "Uma unidade da apostila, página por página: vocabulário, gramática, textos e exercícios." },
      { property: "og:title", content: "Unidade — Book Students — Speak Lab" },
      { property: "og:description", content: "Uma unidade da apostila, página por página: vocabulário, gramática, textos e exercícios." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UnitPage,
});

function UnitPage() {
  const { packId } = Route.useParams();
  const [pack, setPack] = useState<DrillPack | null | undefined>(undefined);
  const [pulos, setPulos] = useState<PuloDoGato>({});
  const [prints, setPrints] = useState<Material[]>([]);
  const [done, setDone] = useState<number[]>([]);

  useEffect(() => {
    void (async () => {
      const [pk, pg, mats, pages] = await Promise.all([repo.getDrillPack(packId), repo.getPuloDoGato(), repo.listMaterials(), repo.listBookPagesDone()]);
      setPack(pk); setPulos(pg); setDone(pages);
      setPrints(mats.filter((m) => m.unit_pack_id === packId));
    })();
    return () => stopCoach();
  }, [packId]);

  if (pack === undefined) return <div className="h-dvh animate-pulse bg-muted" />;
  if (!pack) return <p className="p-6">{t.errors.notFound}</p>;

  const intro = pack.lesson_intro;
  const foci = [...new Set(pack.items.flatMap((it) => (it.mode === "ladder" ? it.steps.map((s) => s.focus) : [it.focus])))];
  const unitPulos = foci.map((f) => pulos[f]).filter((x): x is string => !!x);
  const pages = pack.course_id === BOOK_COURSE ? pagesOfUnit(unitNumber(pack)) : [];
  const doneN = pages.filter((p) => done.includes(p.page)).length;
  const nextPage = pages.find((p) => !done.includes(p.page));

  return (
    <div className="pt-safe pb-safe mx-auto min-h-dvh max-w-md px-5 pb-10">
      <header className="flex items-center gap-2 py-3">
        <Button variant="ghost" size="icon" asChild aria-label={A.back}><Link to="/aulas"><ChevronLeft /></Link></Button>
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">{A.unit(unitNumber(pack))}</p>
          <h1 className="text-headline truncate">{unitTitle(pack)}</h1>
        </div>
      </header>

      <section className="space-y-6">
        <div>
          <div className="mb-2">
            <h2 className="text-title">{B.pagesTitle}</h2>
            {pages.length > 0 && <p className="text-caption font-semibold text-muted-foreground">{B.pagesDone(doneN, pages.length)}</p>}
          </div>
          {pages.length === 0 ? (
            <p className="rounded-2xl bg-muted p-4 text-base">{B.noPages}</p>
          ) : (
            <>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-live" style={{ width: `${(doneN / pages.length) * 100}%` }} /></div>
              {nextPage && (
                <Button size="lg" className="mb-3 w-full" asChild>
                  <Link to="/livro/$page" params={{ page: String(nextPage.page) }}><BookOpen /> {B.page(nextPage.page)} · {nextPage.title}</Link>
                </Button>
              )}
              <ul className="space-y-2">
                {pages.map((p) => {
                  const ok = done.includes(p.page);
                  return (
                    <li key={p.page}>
                      <Link to="/livro/$page" params={{ page: String(p.page) }} className="flex min-h-16 items-center gap-3 rounded-[20px] border bg-card p-3">
                        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl font-display text-base font-bold", ok ? "bg-live text-live-foreground" : "bg-muted")}>
                          {ok ? <Check className="size-5" /> : p.page}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span lang="en" className="block truncate font-semibold">{p.title}</span>
                          <span className="text-caption block truncate text-muted-foreground">{B.page(p.page)} · {p.subtitle_pt}</span>
                        </span>
                        <span className="text-caption shrink-0 font-semibold text-primary">{ok ? B.review : B.studyPage}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <details className="rounded-[20px] border bg-card p-4" open={pages.length === 0}>
          <summary className="text-headline cursor-pointer">{B.whatYouLearn}</summary>
          <div className="mt-3 space-y-4">
            {intro?.objetivo_pt && (
              <div>
                <p className="text-base">{intro.objetivo_pt}</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => { unlockAudio(); void coachSay(intro.objetivo_pt, "pt"); }}>
                  <Volume2 /> {A.readAloud}
                </Button>
              </div>
            )}
            {!!intro?.gramatica_pt.length && <List title={A.grammar} items={intro.gramatica_pt} />}
            {!!intro?.vocabulario_pt.length && <List title={A.vocab} items={intro.vocabulario_pt} />}
            {unitPulos.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-headline">{A.pulos}</h3>
                {unitPulos.map((p) => <PuloCard key={p} text={p} />)}
              </div>
            )}
          </div>
        </details>

        <div className="space-y-3">
          <h2 className="text-headline">{B.withBook}</h2>
          <p className="text-base text-muted-foreground">{A.bookBody}</p>
          <Button variant="secondary" className="w-full" asChild><Link to="/prints" search={{ unidade: pack.id }}><Camera /> {A.bookOpen}</Link></Button>
          {prints.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-[20px] border bg-card p-3">
              {m.thumbnail && <img src={m.thumbnail} alt="" className="size-12 rounded-lg object-cover" />}
              <p className="min-w-0 flex-1 truncate font-semibold">{m.title}</p>
              <Button size="sm" asChild>
                <Link to="/aula" search={{ modo: "print", mat: m.id, pack: "", tema: "", min: 10, nivel: "todos" }}><Play /> {A.bookLesson}</Link>
              </Button>
            </div>
          ))}
        </div>

        <Button size="lg" variant="secondary" className="w-full" asChild>
          <Link to="/tete-a-tete" search={{ u: pack.id }}><MessagesSquare /> {B.practiceTete}</Link>
        </Button>
      </section>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-headline mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((x) => <li key={x} className="rounded-xl border bg-card px-3 py-2 text-base">{x}</li>)}
      </ul>
    </div>
  );
}
