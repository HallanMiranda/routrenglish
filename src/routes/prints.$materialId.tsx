import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Layers, Play, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { repo } from "@/data/repo";
import type { AiSettings, DrillItem, DrillPack, Material, PrintProgress } from "@/data/types";
import { generateMore } from "@/materials/study";
import { GenerationStatus, useGeneration } from "./prints";
import { t } from "@/lib/i18n/pt-BR";

const p = t.prints;

export const Route = createFileRoute("/prints/$materialId")({
  head: () => ({
    meta: [
      { title: "Material — Speak Lab" },
      { name: "description", content: "O material enviado e o treino de fala gerado a partir dele." },
      { property: "og:title", content: "Material — Speak Lab" },
      { property: "og:description", content: "O material enviado e o treino de fala gerado a partir dele." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MaterialPage,
});

function itemLabel(i: DrillItem) {
  return i.mode === "ladder" ? i.title_pt : i.mode === "qa" ? i.q_en : i.pt;
}

function MaterialPage() {
  const { materialId } = Route.useParams();
  const [m, setM] = useState<Material | null | undefined>(undefined);
  const [pack, setPack] = useState<DrillPack | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const [min, setMin] = useState(10);
  const [prog, setProg] = useState<PrintProgress | null>(null);
  const g = useGeneration();
  const navigate = useNavigate();

  async function load() {
    const mat = await repo.getMaterial(materialId);
    setM(mat);
    setPack(mat?.pack_id ? await repo.getDrillPack(mat.pack_id) : null);
    setSettings(await repo.getAiSettings());
    setProg(await repo.getPrintProgress(materialId));
  }
  useEffect(() => {
    void load();
  }, [materialId]);

  if (m === undefined) return null;
  if (!m) return <AppShell title={t.apiKey.section}><EmptyState>{p.notFound}</EmptyState></AppShell>;

  const groups = (["ladder", "translate", "qa"] as const).map((mode) => ({ mode, items: pack?.items.filter((i) => i.mode === mode) ?? [] }));

  return (
    <AppShell title={m.title}>
      <Link to="/prints" className="-mt-2 mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> {p.back}</Link>
      {m.images?.length ? (
        <div className="mb-4 flex gap-2 overflow-x-auto">{m.images.map((src, i) => <img key={i} src={src} alt="" className="h-40 rounded-xl border object-cover" />)}</div>
      ) : m.thumbnail ? (
        <img src={m.thumbnail} alt="" className="mb-2 h-32 rounded-xl border object-cover" />
      ) : null}
      {m.kind === "image" && !m.images?.length && <p className="mb-4 text-xs text-muted-foreground">{p.imagesDropped}</p>}
      {m.text && <p className="mb-4 max-h-48 overflow-y-auto whitespace-pre-line rounded-xl bg-muted p-3 text-sm">{m.text}</p>}
      {m.tokens_in !== undefined && (
        <p className="mb-4 text-xs text-muted-foreground">{p.cost((m.tokens_in ?? 0) + (m.tokens_out ?? 0), m.cost_usd ?? 0)}</p>
      )}
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t.lesson.length}>
        {[5, 10, 15].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={min === n} onClick={() => setMin(n)}
            className={cn("min-h-11 rounded-lg text-sm font-semibold", min === n ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
            {t.lesson.minutes(n)}
          </button>
        ))}
      </div>
      <Button asChild size="lg" className="mb-2 w-full">
        <Link to="/aula" search={{ modo: "print", mat: m.id, pack: "", tema: "", min, nivel: "todos" }}><Play /> {p.coachLesson}</Link>
      </Button>
      {m.key_items?.length ? (
        <p className="text-caption mb-3 text-center text-muted-foreground">{t.lesson.mastered(prog?.mastered.filter((k) => m.key_items!.includes(k)).length ?? 0, m.key_items.length)}</p>
      ) : null}
      {pack && (
        <Button asChild variant="outline" className="mb-3 w-full">
          <Link to="/aplicabilidade/$packId" params={{ packId: pack.id }} search={{ nivel: "todos" }}><Layers /> {p.cardsTraining}</Link>
        </Button>
      )}
      <div className="mb-4 flex gap-2">
        <Button variant="outline" className="flex-1" disabled={g.busy || !settings?.api_key} onClick={async () => {
          setAdded(null);
          const n = await g.run((signal, onFixing) => generateMore(settings!, m, signal, onFixing));
          if (n !== null) { setAdded(n); await load(); }
        }}>
          <Sparkles /> {p.more}
        </Button>
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}><Trash2 /> {p.delete}</Button>
      </div>
      {!settings?.api_key && <p className="mb-3 text-sm text-destructive">{t.apiKey.missing}</p>}
      {confirm && (
        <div role="alert" className="mb-4 space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p>{p.deleteConfirm}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{p.cancel}</Button>
            <Button size="sm" variant="destructive" onClick={async () => { await repo.deleteMaterial(m.id); void navigate({ to: "/prints" }); }}>{p.confirmDelete}</Button>
          </div>
        </div>
      )}
      <div className="mb-4"><GenerationStatus g={g} /></div>
      {added !== null && <p role="status" className="mb-4 text-sm text-primary">{p.moreDone(added)}</p>}
      {groups.filter((gr) => gr.items.length).map((gr) => (
        <section key={gr.mode} className="mb-5">
          <h2 className="mb-2 text-lg font-bold">{p.groups[gr.mode]} <span className="text-sm font-medium text-muted-foreground">({gr.items.length})</span></h2>
          <ul className="space-y-2">
            {gr.items.map((i) => <li key={i.id} className="rounded-xl border bg-card px-3 py-2 text-sm">{itemLabel(i)}</li>)}
          </ul>
        </section>
      ))}
    </AppShell>
  );
}
