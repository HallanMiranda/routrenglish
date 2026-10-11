import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, HelpCircle, MessageCircleQuestion, RotateCcw, Trophy } from "lucide-react";
import { AppShell, ListSkeleton } from "@/components/layout/AppShell";
import { loadCourses, unitNumber, unitTitle, type CourseView } from "@/course/course";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/pt-BR";

const T = t.tete;

export const Route = createFileRoute("/tete-a-tete")({
  validateSearch: (s: Record<string, unknown>): { u?: string } => (typeof s["u"] === "string" ? { u: s["u"] } : {}),
  head: () => ({
    meta: [
      { title: T.meta },
      { name: "description", content: "Pergunta e resposta em cima da apostila: o Coach pergunta em português e você responde em inglês, falando ou digitando." },
    ],
  }),
  component: TetePage,
});

type Part = "aula" | "perguntas" | "desafio" | "erros";
const lesson = (pack: string, parte: Part) => ({ modo: "unidade" as const, pack, parte, mat: "", tema: "", min: 15, nivel: "todos" as const });

/** "Tête-à-tête": the João Antunes-style spoken drill on the book. The learner picks the unit every time. */
function TetePage() {
  const { u } = Route.useSearch();
  const [courses, setCourses] = useState<CourseView[] | null>(null);
  const [open, setOpen] = useState<string | null>(u ?? null);

  useEffect(() => {
    void loadCourses().then(setCourses);
  }, []);

  return (
    <AppShell title={T.title}>
      <p className="-mt-4 text-base text-muted-foreground">{T.subtitle}</p>
      {!courses ? (
        <ListSkeleton />
      ) : (
        courses.map((c) => (
          <section key={c.course.id} className="space-y-3">
            <h2 className="text-headline">{T.choose}</h2>
            <ul className="space-y-2">
              {c.units.map((row, i) => {
                const n = unitNumber(row.pack, i);
                const isOpen = open === row.pack.id;
                const hasLadders = row.pack.items.some((it) => it.mode === "ladder");
                const hasQa = row.pack.items.some((it) => it.mode === "qa");
                return (
                  <li key={row.pack.id} className={cn("rounded-[20px] border bg-card", isOpen && "border-primary")}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : row.pack.id)}
                      className="flex min-h-16 w-full items-center gap-3 p-4 text-left"
                    >
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full font-display font-bold", row.prog.completed ? "bg-live text-live-foreground" : "bg-muted")}>{n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-lg font-bold leading-tight">{unitTitle(row.pack)}</span>
                        <span className="text-caption block text-muted-foreground">
                          {row.prog.completed ? T.passed : row.prog.last_challenge !== null ? T.lastScore(Math.round(row.prog.last_challenge * 100)) : t.aulas.unit(n)}
                        </span>
                      </span>
                      <ChevronDown className={cn("size-5 shrink-0 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && (
                      <div className="grid gap-2 px-4 pb-4">
                        {hasLadders && <Option to={lesson(row.pack.id, "aula")} icon={<MessageCircleQuestion className="size-5" />} title={T.lesson} help={T.lessonHelp} primary />}
                        {hasQa && <Option to={lesson(row.pack.id, "perguntas")} icon={<HelpCircle className="size-5" />} title={T.questions} help={T.questionsHelp} />}
                        <Option to={lesson(row.pack.id, "desafio")} icon={<Trophy className="size-5" />} title={T.challenge} help={T.challengeHelp} />
                        {!row.prog.completed && row.prog.missed.length > 0 && (
                          <Option to={lesson(row.pack.id, "erros")} icon={<RotateCcw className="size-5" />} title={T.missed} help="" />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </AppShell>
  );
}

function Option({ to, icon, title, help, primary }: { to: ReturnType<typeof lesson>; icon: React.ReactNode; title: string; help: string; primary?: boolean }) {
  return (
    <Link
      to="/aula"
      search={to}
      className={cn("flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3", primary ? "bg-primary text-primary-foreground" : "border bg-background")}
    >
      {icon}
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        {help && <span className={cn("text-caption block", primary ? "text-primary-foreground/85" : "text-muted-foreground")}>{help}</span>}
      </span>
    </Link>
  );
}
