import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Check, ChevronLeft, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PuloCard } from "@/components/drill/CoachParts";
import { repo } from "@/data/repo";
import type { DrillPack, Material, PuloDoGato, UnitProgress, UnitStep } from "@/data/types";
import { markStep, setCurrentStep, unitNumber, unitTitle } from "@/course/course";
import { coachSay, stopCoach, unlockAudio } from "@/ai/tts";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/pt-BR";

const A = t.aulas;

export const Route = createFileRoute("/aulas/$packId")({
  validateSearch: (s: Record<string, unknown>): { etapa?: UnitStep } => {
    const n = Number(s["etapa"]);
    return [1, 2, 3, 4, 5].includes(n) ? { etapa: n as UnitStep } : {};
  },
  head: () => ({
    meta: [
      { title: "Unidade — Aulas — Speak Lab" },
      { name: "description", content: "Uma unidade da apostila em 5 etapas: o que aprender, aula com o Coach, perguntas, livro e desafio." },
      { property: "og:title", content: "Unidade — Aulas — Speak Lab" },
      { property: "og:description", content: "Uma unidade da apostila em 5 etapas: o que aprender, aula com o Coach, perguntas, livro e desafio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UnitPage,
});

function UnitPage() {
  const { packId } = Route.useParams();
  const { etapa } = Route.useSearch();
  const [pack, setPack] = useState<DrillPack | null | undefined>(undefined);
  const [prog, setProg] = useState<UnitProgress | null>(null);
  const [step, setStep] = useState<UnitStep>(1);
  const [pulos, setPulos] = useState<PuloDoGato>({});
  const [prints, setPrints] = useState<Material[]>([]);

  useEffect(() => {
    void (async () => {
      const [pk, pr, pg, mats] = await Promise.all([repo.getDrillPack(packId), repo.getUnitProgress(packId), repo.getPuloDoGato(), repo.listMaterials()]);
      setPack(pk); setProg(pr); setPulos(pg);
      setPrints(mats.filter((m) => m.unit_pack_id === packId));
      setStep(etapa ?? pr.current_step);
    })();
    return () => stopCoach();
  }, [packId, etapa]);

  async function go(s: UnitStep) {
    setStep(s);
    await setCurrentStep(packId, s);
    setProg(await repo.getUnitProgress(packId));
  }
  async function finish(s: UnitStep) {
    const p = await markStep(packId, s);
    setProg(p);
    setStep(p.current_step);
  }

  if (pack === undefined || !prog) return <div className="h-dvh animate-pulse bg-muted" />;
  if (!pack) return <p className="p-6">{t.errors.notFound}</p>;

  const intro = pack.lesson_intro;
  const foci = [...new Set(pack.items.flatMap((it) => (it.mode === "ladder" ? it.steps.map((s) => s.focus) : [it.focus])))];
  const unitPulos = foci.map((f) => pulos[f]).filter((x): x is string => !!x);
  const hasLadders = pack.items.some((i) => i.mode === "ladder");
  const hasQa = pack.items.some((i) => i.mode === "qa");
  const lesson = (parte: "aula" | "perguntas" | "desafio" | "erros") =>
    ({ modo: "unidade" as const, pack: pack.id, parte, mat: "", tema: "", min: 15, nivel: "todos" as const });

  return (
    <div className="pt-safe pb-safe mx-auto min-h-dvh max-w-md px-5 pb-10">
      <header className="flex items-center gap-2 py-3">
        <Button variant="ghost" size="icon" asChild aria-label={A.back}><Link to="/aulas"><ChevronLeft /></Link></Button>
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">{A.unit(unitNumber(pack))}</p>
          <h1 className="text-headline truncate">{unitTitle(pack)}</h1>
        </div>
      </header>

      <ol className="mb-6 grid grid-cols-5 gap-1.5" aria-label="Etapas">
        {([1, 2, 3, 4, 5] as const).map((s) => {
          const done = prog.done_steps.includes(s);
          return (
            <li key={s}>
              <button type="button" onClick={() => void go(s)} aria-current={s === step ? "step" : undefined}
                className={cn("flex min-h-11 w-full flex-col items-center justify-center rounded-xl border text-sm font-bold",
                  s === step ? "border-primary bg-primary text-primary-foreground" : done ? "bg-live text-live-foreground" : "bg-card")}>
                {done && s !== step ? <Check className="size-4" /> : s}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="space-y-5">
        <div>
          <h2 className="text-title">{A.steps[step - 1]}</h2>
          <p className="text-caption text-muted-foreground">{A.min(A.stepMin[step - 1]!)}</p>
        </div>

        {step === 1 && (
          <>
            {intro?.objetivo_pt && (
              <div className="rounded-[20px] border bg-card p-4">
                <p className="text-caption font-semibold text-muted-foreground">{A.objective}</p>
                <p className="mt-1 text-base">{intro.objetivo_pt}</p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => { unlockAudio(); void coachSay(intro.objetivo_pt, "pt"); }}>
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
            <Button size="lg" className="w-full" onClick={() => { stopCoach(); void finish(1); }}><Play /> {A.begin}</Button>
          </>
        )}

        {step === 2 && (hasLadders ? (
          <Button size="lg" className="w-full" asChild><Link to="/aula" search={lesson("aula")}><Play /> {A.startCoach}</Link></Button>
        ) : (
          <><p className="text-base text-muted-foreground">{A.noLadders}</p><Button size="lg" className="w-full" onClick={() => void finish(2)}>{A.next}</Button></>
        ))}

        {step === 3 && (hasQa ? (
          <Button size="lg" className="w-full" asChild><Link to="/aula" search={lesson("perguntas")}><Play /> {A.startQa}</Link></Button>
        ) : (
          <><p className="text-base text-muted-foreground">{A.noQa}</p><Button size="lg" className="w-full" onClick={() => void finish(3)}>{A.next}</Button></>
        ))}

        {step === 4 && (
          <>
            <p className="text-base">{A.bookBody}</p>
            <p className="text-caption text-muted-foreground">{A.bookOptional}</p>
            <Button size="lg" className="w-full" asChild><Link to="/prints" search={{ unidade: pack.id }}><Camera /> {A.bookOpen}</Link></Button>
            {prints.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-headline">{A.bookLessons}</h3>
                {prints.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-[20px] border bg-card p-3">
                    {m.thumbnail && <img src={m.thumbnail} alt="" className="size-12 rounded-lg object-cover" />}
                    <p className="min-w-0 flex-1 truncate font-semibold">{m.title}</p>
                    <Button size="sm" asChild onClick={() => void markStep(pack.id, 4)}>
                      <Link to="/aula" search={{ modo: "print", mat: m.id, pack: "", tema: "", min: 10, nivel: "todos" }}><Play /> {A.bookLesson}</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" className="w-full" onClick={() => void finish(4)}>{prints.length ? A.next : A.skip}</Button>
          </>
        )}

        {step === 5 && (
          <>
            <p className="text-base">{A.challengeBody}</p>
            {prog.last_challenge !== null && <p className="text-caption text-muted-foreground">{A.lastScore(Math.round(prog.last_challenge * 100))}</p>}
            {prog.completed && <p className="text-headline">{A.passed}</p>}
            <Button size="lg" className="w-full" asChild><Link to="/aula" search={lesson("desafio")}><Play /> {A.challengeStart}</Link></Button>
            {!prog.completed && prog.missed.length > 0 && (
              <Button variant="secondary" className="w-full" asChild><Link to="/aula" search={lesson("erros")}>{A.reviewMissed}</Link></Button>
            )}
          </>
        )}
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
