import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { repo } from "@/data/repo";
import type { Difficulty, DrillPack, PackProgress } from "@/data/types";
import { difficultyOf } from "@/drills/difficulty";
import { cn } from "@/lib/utils";
import { parseDrillLines } from "@/drills/check";
import { parsePackJson } from "@/drills/importPack";
import { t } from "@/lib/i18n/pt-BR";

const d = t.drills;

export const Route = createFileRoute("/uberclass/")({
  head: () => ({
    meta: [
      { title: "UberClass — Speak Lab" },
      { name: "description", content: "Treino rápido de fala: traduza do português e responda perguntas em inglês." },
      { property: "og:title", content: "UberClass — Speak Lab" },
      { property: "og:description", content: "Treino rápido de fala: traduza do português e responda perguntas em inglês." },
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
  const [filter, setFilter] = useState<Difficulty | "todos">("todos");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const shown = packs?.filter((p) => filter === "todos" || difficultyOf(p.level) === filter);

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
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {(["todos", "iniciante", "intermediario", "avancado"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors", filter === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
          >
            {d.difficulty[k]}
          </button>
        ))}
      </div>
      <Link
        to="/uberclass/$packId"
        params={{ packId: "expressa" }}
        search={{ nivel: filter }}
        className="mb-4 flex items-center gap-4 rounded-2xl bg-ink p-4 text-ink-foreground shadow-sm"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-live text-live-foreground"><Zap className="size-5" /></span>
        <span>
          <span className="block font-display text-lg font-bold leading-tight">{d.express}</span>
          <span className="block text-sm opacity-80">{d.expressHelp} · {d.difficulty[filter]}</span>
        </span>
      </Link>
      {creating ? (
        <NewPackForm onDone={() => { setCreating(false); void load(); }} />
      ) : (
        <Button className="mb-5 w-full" size="lg" variant="outline" onClick={() => setCreating(true)}>
          <Plus /> {d.newPack}
        </Button>
      )}
      {shown && shown.length === 0 && <EmptyState>{d.empty}</EmptyState>}
      <ul className="space-y-3">
        {shown?.map((p) => {
          const pr = progress[p.id];
          const diff = difficultyOf(p.level);
          return (
            <li key={p.id} className="relative">
              <Link
                to="/uberclass/$packId"
                params={{ packId: p.id }}
                search={{ nivel: "todos" }}
                className="block rounded-2xl border bg-card p-4 transition-colors hover:border-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold leading-tight">{p.title_pt}</h2>
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                    {diff ? d.difficulty[diff] : p.level}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.focus_pt}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
                  <span>{d.items(p.items.length)}</span>
                  <span>{d.bestRound(pr?.best_round ?? 1)}</span>
                  <span className="text-muted-foreground">{d.accuracy(pr?.accuracy ?? null)}</span>
                </div>
              </Link>
              {p.user_created && confirmId !== p.id && (
                <button
                  type="button"
                  onClick={() => setConfirmId(p.id)}
                  aria-label={`${d.delete} ${p.title_pt}`}
                  className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
              {confirmId === p.id && (
                <div role="alert" className="mt-2 space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <p>{d.deleteConfirm(p.title_pt)}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>{d.cancel}</Button>
                    <Button size="sm" variant="destructive" onClick={async () => { await repo.deleteDrillPack(p.id); setConfirmId(null); void load(); }}>
                      {d.confirmDelete}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}

function NewPackForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"lines" | "json">("lines");
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState("");
  const [json, setJson] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  async function save() {
    if (mode === "lines") {
      const items = parseDrillLines(lines);
      if (!items.length) return setErrors([d.invalid]);
      await repo.saveDrillPack({ title_pt: title.trim() || d.newPack, level: d.userLevel, focus_pt: d.userFocus, items });
      return onDone();
    }
    const r = parsePackJson(json);
    if (!r.ok) return setErrors(r.errors);
    if (Object.keys(r.pulo).length) await repo.mergePuloDoGato(r.pulo);
    await repo.saveDrillPack(r.pack);
    onDone();
  }

  return (
    <div className="mb-5 space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-lg font-bold">{d.newPackTitle}</h2>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist">
        {(["lines", "json"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setErrors([]); }}
            className={cn("rounded-lg px-2 py-1.5 text-sm font-semibold", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {m === "lines" ? d.modeLines : d.modeJson}
          </button>
        ))}
      </div>
      {mode === "lines" ? (
        <>
          <label className="block space-y-1 text-sm font-medium">
            <span>{d.packName}</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={d.packNamePlaceholder} />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>{d.linesLabel}</span>
            <Textarea rows={6} value={lines} onChange={(e) => { setLines(e.target.value); setErrors([]); }} placeholder={d.linesPlaceholder} />
            <span className="block text-xs font-normal text-muted-foreground">{d.linesHelp}</span>
          </label>
          <Button variant="outline" className="w-full" disabled>
            <Sparkles /> {d.fromMaterial}
          </Button>
        </>
      ) : (
        <label className="block space-y-1 text-sm font-medium">
          <span>{d.jsonLabel}</span>
          <Textarea rows={10} className="font-mono text-xs" spellCheck={false} value={json} onChange={(e) => { setJson(e.target.value); setErrors([]); }} placeholder='{"title_pt": "...", "level": "A2", "focus_pt": "...", "items": [...]}' />
          <span className="block text-xs font-normal text-muted-foreground">{d.jsonHelp}</span>
        </label>
      )}
      {errors.length > 0 && (
        <div role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {errors.length > 1 && <p className="mb-1 font-semibold">{d.jsonErrors}</p>}
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onDone}>{d.cancel}</Button>
        <Button className="flex-1" onClick={save}>{mode === "json" ? d.import : d.save}</Button>
      </div>
    </div>
  );
}
