import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { AppShell, EmptyState, ListSkeleton } from "@/components/layout/AppShell";
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
      { title: "Aplicabilidade — Speak Lab" },
      { name: "description", content: "Treino rápido de fala: traduza do português e responda perguntas em inglês." },
      { property: "og:title", content: "Aplicabilidade — Speak Lab" },
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
  const [lastId, setLastId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Difficulty | "todos">("todos");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const shown = packs?.filter((p) => filter === "todos" || difficultyOf(p.level) === filter);
  const last = packs?.find((p) => p.id === lastId) ?? null;
  const groups = shown
    ? ([
        [d.groups.material, shown.filter((p) => p.material_id)],
        [d.groups.themes, shown.filter((p) => !p.material_id && !p.user_created)],
        [d.groups.other, shown.filter((p) => !p.material_id && p.user_created)],
      ] as const).filter(([, list]) => list.length > 0)
    : [];

  async function load() {
    const list = await repo.listDrillPacks();
    const prog = await Promise.all(list.map((p) => repo.getPackProgress(p.id)));
    setLastId((await repo.getLastDrillAttempt())?.pack_id ?? null);
    setPacks(list);
    setProgress(Object.fromEntries(prog.map((p) => [p.pack_id, p])));
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <AppShell title={d.title}>
      <p className="-mt-4 text-base text-muted-foreground">{d.subtitle}</p>
      {last && (
        <Link
          to="/uberclass/$packId"
          params={{ packId: last.id }}
          search={{ nivel: "todos" }}
          className="flex min-h-20 items-center gap-4 rounded-[20px] bg-ink p-4 text-ink-foreground shadow-card"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Play className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="text-caption block text-ink-foreground/80">{d.continue}</span>
            <span className="block truncate font-display text-lg font-bold leading-tight">{last.title_pt}</span>
            <span className="text-caption block text-ink-foreground/80">{d.continueHelp(progress[last.id]?.best_round ?? 1)}</span>
          </span>
        </Link>
      )}
      <Link
        to="/uberclass/$packId"
        params={{ packId: "expressa" }}
        search={{ nivel: filter }}
        className={cn("flex min-h-16 items-center gap-4 rounded-[20px] p-4", last ? "border bg-card" : "bg-ink text-ink-foreground shadow-card")}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-live text-live-foreground"><Zap className="size-5" /></span>
        <span className="min-w-0">
          <span className="block font-display text-lg font-bold leading-tight">{d.express}</span>
          <span className={cn("text-caption block", last ? "text-muted-foreground" : "text-ink-foreground/80")}>{d.expressHelp} · {d.difficulty[filter]}</span>
        </span>
      </Link>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist">
        {(["todos", "iniciante", "intermediario", "avancado"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={cn("h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors", filter === k ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground")}
          >
            {d.difficulty[k]}
          </button>
        ))}
      </div>
      {!packs && <ListSkeleton />}
      {shown && shown.length === 0 && <EmptyState>{d.empty}</EmptyState>}
      {groups.map(([label, list]) => (
        <section key={label}>
          <h2 className="text-headline mb-3">{label}</h2>
          <ul className="space-y-3">
            {list.map((p) => {
              const pr = progress[p.id];
              const diff = difficultyOf(p.level);
              const isNew = !pr || pr.accuracy === null;
              const done = isNew ? 0 : (pr.best_round ?? 1);
              return (
                <li key={p.id} className="relative">
                  <Link
                    to="/uberclass/$packId"
                    params={{ packId: p.id }}
                    search={{ nivel: "todos" }}
                    className="block rounded-[20px] border bg-card p-4 pr-12 transition-colors hover:border-primary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-headline min-w-0 font-display">{p.title_pt}</h3>
                      {isNew && <span className="text-caption shrink-0 rounded-full bg-live px-2.5 py-0.5 font-semibold text-live-foreground">{d.isNew}</span>}
                    </div>
                    <p className="mt-1 line-clamp-1 text-base text-muted-foreground">{p.focus_pt}</p>
                    <div className="text-caption mt-3 flex items-center gap-3 text-muted-foreground">
                      {diff && (
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden="true" className={cn("size-2 rounded-full", diff === "iniciante" ? "bg-live" : diff === "intermediario" ? "bg-primary" : "bg-foreground")} />
                          {d.difficulty[diff]}
                        </span>
                      )}
                      <span>{d.items(p.items.length)}</span>
                    </div>
                    <ol className="mt-3 grid grid-cols-4 gap-1" aria-label={d.bestRound(pr?.best_round ?? 1)}>
                      {[1, 2, 3, 4].map((r) => <li key={r} className={cn("h-1 rounded-full", r <= done ? "bg-primary" : "bg-muted")} />)}
                    </ol>
                  </Link>
                  {p.user_created && confirmId !== p.id && (
                    <button
                      type="button"
                      onClick={() => setConfirmId(p.id)}
                      aria-label={`${d.delete} ${p.title_pt}`}
                      className="absolute right-1.5 top-1.5 grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                  {confirmId === p.id && (
                    <div role="alert" className="mt-2 space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-base">
                      <p>{d.deleteConfirm(p.title_pt)}</p>
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setConfirmId(null)}>{d.cancel}</Button>
                        <Button variant="destructive" onClick={async () => { await repo.deleteDrillPack(p.id); setConfirmId(null); void load(); }}>
                          {d.confirmDelete}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {creating ? (
        <NewPackForm onDone={() => { setCreating(false); void load(); }} />
      ) : (
        <Button className="w-full" variant="outline" onClick={() => setCreating(true)}>
          <Plus /> {d.newPack}
        </Button>
      )}
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
    <div className="space-y-3 rounded-[20px] border bg-card p-4">
      <h2 className="text-lg font-bold">{d.newPackTitle}</h2>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1" role="tablist">
        {(["lines", "json"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setErrors([]); }}
            className={cn("min-h-11 rounded-full px-2 text-sm font-semibold", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}
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
            <span className="text-caption block font-normal text-muted-foreground">{d.linesHelp}</span>
          </label>
          <Button variant="outline" className="w-full" disabled>
            <Sparkles /> {d.fromMaterial}
          </Button>
        </>
      ) : (
        <label className="block space-y-1 text-sm font-medium">
          <span>{d.jsonLabel}</span>
          <Textarea rows={10} className="font-mono text-xs" spellCheck={false} value={json} onChange={(e) => { setJson(e.target.value); setErrors([]); }} placeholder='{"title_pt": "...", "level": "A2", "focus_pt": "...", "items": [...]}' />
          <span className="text-caption block font-normal text-muted-foreground">{d.jsonHelp}</span>
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
