import { groupCollections } from "@/drills/collections";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Layers, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiKeyForm } from "@/components/prints/ApiKeyForm";
import { CoachAvatar } from "@/components/drill/CoachParts";
import { repo } from "@/data/repo";
import type { Difficulty, DrillPack } from "@/data/types";
import { t } from "@/lib/i18n/pt-BR";
import { cn } from "@/lib/utils";

const L = t.lesson;

/** "Aula com o Coach" entry at the top of Aplicabilidade. */
export function LessonHero({ packs, nivel }: { packs: DrillPack[]; nivel: Difficulty | "todos" }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"pacotes" | "livre" | null>(null);
  const [min, setMin] = useState(10);
  const [pack, setPack] = useState("");
  const [topic, setTopic] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [prints, setPrints] = useState<string[]>([]);

  useEffect(() => {
    void repo.getAiSettings().then((s) => setHasKey(!!s.api_key));
    void repo.listMaterials().then((ms) => setPrints(ms.filter((m) => m.pack_id).map((m) => m.title)));
  }, []);

  const themes = packs.filter((p) => !p.user_created).map((p) => p.title_pt);
  const go = () =>
    void navigate({ to: "/aula", search: { modo: mode ?? "pacotes", mat: "", pack: mode === "pacotes" ? pack : "", tema: mode === "livre" ? topic.trim() : "", min, nivel } });

  const chip = (active: boolean) => cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold", active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground");

  return (
    <section className="space-y-4 rounded-[20px] bg-ink p-5 text-ink-foreground shadow-card">
      <div className="flex items-center gap-3">
        <CoachAvatar talking={false} />
        <div className="min-w-0">
          <h2 className="text-title">{L.title}</h2>
          <p className="text-caption text-ink-foreground/80">{L.subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([["pacotes", L.fromPacks, L.fromPacksHelp, Layers], ["livre", L.free, L.freeHelp, Wand2]] as const).map(([m, label, help, Icon]) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
            className={cn("flex min-h-24 flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors", mode === m ? "border-live bg-live text-live-foreground" : "border-ink-foreground/20")}>
            <Icon className="size-5" />
            <span className="font-semibold leading-tight">{label}</span>
            <span className={cn("text-caption", mode === m ? "" : "text-ink-foreground/80")}>{help}</span>
          </button>
        ))}
      </div>
      {mode && (
        <div className="space-y-4 rounded-xl bg-card p-4 text-card-foreground">
          <div>
            <p className="text-caption mb-2 font-semibold">{L.length}</p>
            <div className="flex gap-2">
              {[5, 10, 15].map((n) => <button key={n} type="button" className={chip(min === n)} aria-pressed={min === n} onClick={() => setMin(n)}>{L.minutes(n)}</button>)}
            </div>
          </div>
          {mode === "pacotes" ? (
            <label className="block">
              <span className="text-caption mb-2 block font-semibold">{L.pack}</span>
              <select value={pack} onChange={(e) => setPack(e.target.value)} className="h-11 w-full rounded-full border bg-background px-4 text-base">
                <option value="">{L.allAtLevel(t.drills.difficulty[nivel] ?? "")}</option>
                {groupCollections(packs).collections.map((c) => <option key={c.key} value={`col:${c.key}`}>{L.collection(c.title)}</option>)}
                {packs.map((p) => <option key={p.id} value={p.id}>{p.title_pt}</option>)}
              </select>
            </label>
          ) : !hasKey ? (
            <div className="space-y-2">
              <p className="text-base">{L.needKey}</p>
              <ApiKeyForm onChange={(s) => setHasKey(!!s.api_key)} />
            </div>
          ) : (
            <div>
              <p className="text-caption mb-2 font-semibold">{L.topic}</p>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {[...themes, ...prints.map(L.fromPrint)].map((th) => (
                  <button key={th} type="button" className={chip(topic === th)} aria-pressed={topic === th} onClick={() => setTopic(th)}>{th}</button>
                ))}
              </div>
              <Input className="mt-2 h-11 rounded-full px-4 text-base" value={topic} placeholder={L.topicPlaceholder} onChange={(e) => setTopic(e.target.value)} />
            </div>
          )}
          <Button size="lg" className="w-full" disabled={mode === "livre" && (!hasKey || !topic.trim())} onClick={go}>{L.start}</Button>
        </div>
      )}
    </section>
  );
}
