import { createFileRoute, Link, Outlet, useMatch, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, ClipboardPaste, FileText, Loader2, Play, X } from "lucide-react";
import { AppShell, EmptyState, ListSkeleton } from "@/components/layout/AppShell";
import { ApiKeyForm } from "@/components/prints/ApiKeyForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { repo } from "@/data/repo";
import type { AiSettings, DrillPack, Material, PackProgress } from "@/data/types";
import { AiError } from "@/ai/openai";
import { pdfText, prepareImage } from "@/materials/prepare";
import { createStudy, type StudySource } from "@/materials/study";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/pt-BR";

const p = t.prints;

export const Route = createFileRoute("/prints")({
  head: () => ({
    meta: [
      { title: "Prints — Speak Lab" },
      { name: "description", content: "Transforme prints, páginas de livro, PDFs e textos em treinos de fala." },
      { property: "og:title", content: "Prints — Speak Lab" },
      { property: "og:description", content: "Transforme prints, páginas de livro, PDFs e textos em treinos de fala." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrintsRoute,
});

function PrintsRoute() {
  const child = useMatch({ from: "/prints/$materialId", shouldThrow: false });
  if (child) return <Outlet />;
  return <PrintsHome />;
}

type Row = { m: Material; pack: DrillPack | null; prog: PackProgress | null };

function PrintsHome() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<StudySource | null>(null);
  const [pasting, setPasting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  async function load() {
    setSettings(await repo.getAiSettings());
    const list = (await repo.listMaterials()).filter((m) => m.pack_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    setRows(await Promise.all(list.map(async (m) => ({ m, pack: await repo.getDrillPack(m.pack_id!), prog: await repo.getPackProgress(m.pack_id!) }))));
  }
  useEffect(() => {
    void load();
  }, []);

  async function onImages(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, 5);
    setNote(files.length > 5 ? p.tooMany : null);
    try {
      const prepared = await Promise.all(list.map(prepareImage));
      setSource({ kind: "image", images: prepared.map((x) => x.full), thumbnail: prepared[0]!.thumb });
    } catch {
      setError(p.imageFailed);
    }
  }
  async function onPdf(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const r = await pdfText(file);
      if (!r.text) return setError(p.pdfNoText);
      setNote(r.truncated ? p.pdfCut(r.pages) : null);
      setSource({ kind: "pdf", images: [], text: r.text, truncated: r.truncated });
    } catch {
      setError(p.pdfFailed);
    }
  }

  return (
    <AppShell title={p.title}>
      {settings && !settings.api_key && (
        <ApiKeyForm onChange={setSettings} />
      )}
      {source ? (
        <NewStudy source={source} settings={settings} note={note} onClose={() => { setSource(null); setNote(null); }} />
      ) : pasting ? (
        <PasteText onCancel={() => setPasting(false)} onDone={(text) => { setPasting(false); setSource({ kind: "text", images: [], text }); }} />
      ) : (
        <div>
          <Button size="lg" className="h-20 w-full text-lg" onClick={() => imgRef.current?.click()}>
            <Camera className="size-6" /> {p.newPrint}
          </Button>
          <p className="text-caption mt-2 text-center text-muted-foreground">{p.newPrintHelp}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => pdfRef.current?.click()}><FileText /> {p.pdf}</Button>
            <Button size="sm" variant="ghost" onClick={() => setPasting(true)}><ClipboardPaste /> {p.paste}</Button>
          </div>
          <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void onImages(e.target.files); e.target.value = ""; }} />
          <input ref={pdfRef} type="file" accept="application/pdf" hidden onChange={(e) => { void onPdf(e.target.files?.[0]); e.target.value = ""; }} />
          {error && <p role="alert" className="mt-3 text-base text-destructive">{error}</p>}
        </div>
      )}
      {!rows && !source && <ListSkeleton rows={2} />}
      {rows && rows.length === 0 && !source && <EmptyState>{p.empty}</EmptyState>}
      {!source && rows && rows.length > 0 && (
        <ul className="grid grid-cols-2 gap-3">
          {rows.map(({ m, pack, prog }) => {
            const done = prog?.accuracy == null ? 0 : prog.best_round;
            return (
              <li key={m.id} className="relative">
                <Link to="/aula" search={{ modo: "print", mat: m.id, pack: "", tema: "", min: 10, nivel: "todos" }} aria-label={p.playLesson(m.title)}
                  className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
                  <Play className="size-5 fill-current" />
                </Link>
                <Link to="/prints/$materialId" params={{ materialId: m.id }} className="block overflow-hidden rounded-[20px] border bg-card">
                  <Thumb m={m} className="aspect-[4/3] w-full rounded-none border-0" />
                  <span className="block space-y-1 p-3">
                    <span className="text-headline line-clamp-2 block leading-tight">{m.title}</span>
                    <span className="text-caption block text-muted-foreground">{p.items(pack?.items.length ?? 0)}</span>
                    <span className="grid grid-cols-4 gap-1 pt-1" aria-label={t.drills.bestRound(prog?.best_round ?? 1)}>
                      {[1, 2, 3, 4].map((r) => <span key={r} className={cn("h-1 rounded-full", r <= done ? "bg-primary" : "bg-muted")} />)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

export function Thumb({ m, className }: { m: Material; className?: string }) {
  if (m.thumbnail) return <img src={m.thumbnail} alt="" className={cn("shrink-0 rounded-xl border object-cover", className)} />;
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground", className)}>
      {m.kind === "pdf" ? <FileText className="size-6" /> : <ClipboardPaste className="size-6" />}
    </span>
  );
}

function PasteText({ onCancel, onDone }: { onCancel: () => void; onDone: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <Textarea className="text-base" rows={8} value={text} placeholder={p.pastePlaceholder} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>{p.cancel}</Button>
        <Button className="flex-1" disabled={!text.trim()} onClick={() => onDone(text.trim())}>{t.drills.ladderContinue}</Button>
      </div>
    </div>
  );
}

function usePhases(active: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return setI(0);
    const id = setInterval(() => setI((x) => Math.min(x + 1, p.phases.length - 1)), 6000);
    return () => clearInterval(id);
  }, [active]);
  return p.phases[i]!;
}

export function useGeneration() {
  const [busy, setBusy] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [errors, setErrors] = useState<{ message: string; details: string[] } | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const phase = usePhases(busy);
  async function run<T>(fn: (signal: AbortSignal, onFixing: () => void) => Promise<T>): Promise<T | null> {
    ctrl.current = new AbortController();
    setBusy(true);
    setFixing(false);
    setErrors(null);
    try {
      return await fn(ctrl.current.signal, () => setFixing(true));
    } catch (e) {
      if ((e as Error).name === "AbortError") setErrors({ message: p.cancelled, details: [] });
      else setErrors({ message: (e as Error).message, details: e instanceof AiError ? e.details : [] });
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, label: fixing ? p.fixing : phase, errors, run, cancel: () => ctrl.current?.abort() };
}

export function GenerationStatus({ g }: { g: ReturnType<typeof useGeneration> }) {
  return (
    <>
      {g.busy && (
        <div role="status" className="space-y-3 rounded-xl bg-muted p-3 text-base">
          <ol className="space-y-1.5">
            {p.phases.map((ph, i) => {
              const cur = p.phases.indexOf(g.label as (typeof p.phases)[number]);
              const at = cur === -1 ? p.phases.length - 1 : cur;
              return (
                <li key={ph} className={cn("flex items-center gap-2", i > at && "text-muted-foreground", i < at && "text-muted-foreground line-through")}>
                  {i === at ? <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" /> : <span className="size-4 shrink-0 text-center">{i < at ? "✓" : "·"}</span>}
                  {i === at && cur === -1 ? g.label : ph}
                </li>
              );
            })}
          </ol>
          <Button variant="outline" className="w-full" onClick={g.cancel}><X /> {p.cancel}</Button>
        </div>
      )}
      {g.errors && (
        <div role="alert" className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-base">
          <p>{g.errors.message}</p>
          {g.errors.details.length > 0 && (
            <ul className="text-caption list-disc pl-5">{g.errors.details.slice(0, 12).map((d) => <li key={d}>{d}</li>)}</ul>
          )}
        </div>
      )}
    </>
  );
}

function NewStudy({ source, settings, note, onClose }: { source: StudySource; settings: AiSettings | null; note: string | null; onClose: () => void }) {
  const [level, setLevel] = useState("A2");
  const [focus, setFocus] = useState("");
  const g = useGeneration();
  const navigate = useNavigate();
  const hasKey = !!settings?.api_key;

  return (
    <div className="space-y-4 rounded-[20px] border bg-card p-4">
      {source.kind === "image" ? (
        <div className="flex gap-2 overflow-x-auto">
          {source.images.map((src, i) => <img key={i} src={src} alt="" className="h-28 rounded-lg border object-cover" />)}
        </div>
      ) : (
        <p className="line-clamp-5 whitespace-pre-line rounded-xl bg-muted p-3 text-base">{source.text}</p>
      )}
      {note && <p className="text-caption text-muted-foreground">{note}</p>}
      <div>
        <p className="mb-2 text-sm font-semibold">{p.level}</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {(["A1", "A2", "B1"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => setLevel(l)}
              className={cn("min-h-11 rounded-full border px-2 text-sm font-semibold", level === l ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
              {p.levels[l]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="focus" className="mb-1 block text-sm font-semibold">{p.focus}</label>
        <Input id="focus" value={focus} placeholder={p.focusPlaceholder} onChange={(e) => setFocus(e.target.value)} />
      </div>
      {!hasKey && <p className="text-base text-destructive">{t.apiKey.missing}</p>}
      <GenerationStatus g={g} />
      {!g.busy && (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>{p.discard}</Button>
          <Button className="flex-1" size="lg" disabled={!hasKey} onClick={async () => {
            const m = await g.run((signal, onFixing) => createStudy(settings!, source, level, focus, signal, onFixing));
            if (m) void navigate({ to: "/prints/$materialId", params: { materialId: m.id } });
          }}>
            {p.generate}
          </Button>
        </div>
      )}
    </div>
  );
}
