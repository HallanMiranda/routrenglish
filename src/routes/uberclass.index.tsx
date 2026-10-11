import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { repo } from "@/data/repo";
import type { DrillPack, PackProgress } from "@/data/types";
import { parseDrillLines } from "@/drills/check";
import { t } from "@/lib/i18n/pt-BR";

const d = t.drills;

export const Route = createFileRoute("/uberclass/")({
  head: () => ({
    meta: [
      { title: "Praticar — Speak Lab" },
      { name: "description", content: "Treinos de tradução guiada: fale em inglês o que o Coach diz em português." },
      { property: "og:title", content: "Praticar — Speak Lab" },
      { property: "og:description", content: "Treinos de tradução guiada: fale em inglês o que o Coach diz em português." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PracticePage,
});

function PracticePage() {
  const [packs, setPacks] = useState<DrillPack[] | null>(null);
  const [progress, setProgress] = useState<Record<string, PackProgress>>({});
  const [creating, setCreating] = useState(false);

  async function load() {
    const list = await repo.listDrillPacks();
    const prog = await Promise.all(list.map((p) => repo.getPackProgress(p.id)));
    setPacks(list);
    setProgress(Object.fromEntries(prog.map((p) => [p.pack_id, p])));
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <AppShell title={d.title}>
      <p className="-mt-2 mb-5 text-sm text-muted-foreground">{d.subtitle}</p>
      {creating ? (
        <NewPackForm onDone={() => { setCreating(false); void load(); }} />
      ) : (
        <Button className="mb-5 w-full" size="lg" onClick={() => setCreating(true)}>
          <Plus /> {d.newPack}
        </Button>
      )}
      {packs && packs.length === 0 && <EmptyState>{d.empty}</EmptyState>}
      <ul className="space-y-3">
        {packs?.map((p) => {
          const pr = progress[p.id];
          return (
            <li key={p.id}>
              <Link
                to="/praticar/$packId"
                params={{ packId: p.id }}
                className="block rounded-2xl border bg-card p-4 transition-colors hover:border-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold leading-tight">{p.title_pt}</h2>
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                    {p.level}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.focus_pt}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
                  <span>{d.items(p.items.length)}</span>
                  <span>{d.bestRound(pr?.best_round ?? 1)}</span>
                  <span className="text-muted-foreground">{d.accuracy(pr?.accuracy ?? null)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}

function NewPackForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const items = parseDrillLines(lines);
    if (!items.length) return setError(d.invalid);
    await repo.saveDrillPack({ title_pt: title.trim() || d.newPack, level: d.userLevel, focus_pt: d.userFocus, items });
    onDone();
  }

  return (
    <div className="mb-5 space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-lg font-bold">{d.newPackTitle}</h2>
      <label className="block space-y-1 text-sm font-medium">
        <span>{d.packName}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={d.packNamePlaceholder} />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        <span>{d.linesLabel}</span>
        <Textarea rows={6} value={lines} onChange={(e) => { setLines(e.target.value); setError(null); }} placeholder={d.linesPlaceholder} />
        <span className="block text-xs font-normal text-muted-foreground">{d.linesHelp}</span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button variant="outline" className="w-full" disabled>
        <Sparkles /> {d.fromMaterial}
      </Button>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onDone}>{d.cancel}</Button>
        <Button className="flex-1" onClick={save}>{d.save}</Button>
      </div>
    </div>
  );
}
