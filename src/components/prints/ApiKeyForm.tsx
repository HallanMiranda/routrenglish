import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { repo } from "@/data/repo";
import type { AiSettings } from "@/data/types";
import { testModels } from "@/ai/client";
import { t } from "@/lib/i18n/pt-BR";

const k = t.apiKey;

/** Key field (Prints shortcut) or, with `full`, the whole "Inteligência artificial" settings. */
export function ApiKeyForm({ onChange, full = false }: { onChange?: (s: AiSettings) => void; full?: boolean }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [tModel, setTModel] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [spend, setSpend] = useState(0);

  useEffect(() => {
    void repo.getAiSettings().then((s) => {
      setSettings(s);
      setModel(s.model);
      setTModel(s.transcribe_model);
    });
    void repo.getAiSpendThisMonth().then(setSpend);
  }, []);

  async function update(p: Partial<AiSettings>) {
    const s = await repo.saveAiSettings(p);
    setSettings(s);
    onChange?.(s);
    return s;
  }

  if (!settings) return null;
  const hasKey = !!settings.api_key && !editing;
  const switches = [
    ["listen_ai", k.listenAi, k.listenAiHelp],
    ["judge_ai", k.judgeAi, k.judgeAiHelp],
    ["converse_ai", k.converseAi, k.converseAiHelp],
  ] as const;

  return (
    <div className="space-y-4 rounded-[20px] border bg-card p-4">
      {hasKey ? (
        <p className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 shrink-0 text-primary" />
          {k.saved} ·{" "}
          <button type="button" className="min-h-11 font-semibold text-primary underline-offset-2 hover:underline" onClick={() => { setKey(""); setEditing(true); }}>
            {k.change}
          </button>
        </p>
      ) : (
        <>
          <label htmlFor="api-key" className="text-headline block">{k.label}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input id="api-key" type={show ? "text" : "password"} autoComplete="off" value={key} placeholder={k.placeholder} onChange={(e) => setKey(e.target.value)} className="h-11 pr-11 text-base" />
              <button type="button" aria-label={show ? k.hide : k.show} onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button disabled={!key.trim()} onClick={async () => { await update({ api_key: key.trim() }); setEditing(false); setStatus(null); }}>
              {k.save}
            </Button>
          </div>
          <p className="text-caption leading-relaxed text-muted-foreground">{k.help}</p>
        </>
      )}

      {full && settings.api_key && (
        <div className="divide-y">
          {switches.map(([field, label, help]) => (
            <div key={field} className="flex min-h-14 items-center justify-between gap-4 py-2">
              <label htmlFor={field} className="min-w-0 text-base">
                {label}
                <span className="text-caption block text-muted-foreground">{help}</span>
              </label>
              <Switch id={field} checked={settings[field]} onCheckedChange={(c) => void update({ [field]: c })} />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3">
        <div>
          <label htmlFor="ai-model" className="text-caption mb-1 block font-semibold">{full ? k.textModel : k.model}</label>
          <Input id="ai-model" className="h-11 text-base" value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => void update({ model: model.trim() })} />
        </div>
        {full && (
          <div>
            <label htmlFor="ai-tmodel" className="text-caption mb-1 block font-semibold">{k.transcribeModel}</label>
            <Input id="ai-tmodel" className="h-11 text-base" value={tModel} onChange={(e) => setTModel(e.target.value)} onBlur={() => void update({ transcribe_model: tModel.trim() })} />
          </div>
        )}
      </div>

      {settings.api_key && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={testing}
            onClick={async () => {
              setTesting(true);
              setStatus(null);
              const s = await update({ model: model.trim(), ...(full ? { transcribe_model: tModel.trim() } : {}) });
              try {
                await testModels(s);
                setStatus({ ok: true, text: k.testOkBoth(s.model, s.transcribe_model) });
              } catch (e) {
                setStatus({ ok: false, text: (e as Error).message });
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? k.testing : k.testBoth}
          </Button>
          <Button variant="ghost" className="text-destructive" onClick={async () => { await update({ api_key: null }); setEditing(false); setStatus({ ok: true, text: k.cleared }); }}>
            {k.clear}
          </Button>
        </div>
      )}
      {status && <p role="status" className={status.ok ? "text-base text-primary" : "text-base text-destructive"}>{status.text}</p>}
      {full && (
        <p className="text-caption text-muted-foreground">
          <span className="font-semibold text-foreground">{k.spend(spend)}</span> · {k.noKeyNote}
        </p>
      )}
    </div>
  );
}

export function MyNameForm() {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  useEffect(() => {
    void repo.getMyName().then((n) => { setName(n.name); setAliases(n.aliases.join(", ")); });
  }, []);
  const save = () => void repo.saveMyName({ name: name.trim() || "Allan", aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean) });
  return (
    <div className="space-y-3 rounded-[20px] border bg-card p-4">
      <div>
        <label htmlFor="my-name" className="text-caption mb-1 block font-semibold">{k.myName}</label>
        <Input id="my-name" className="h-11 text-base" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
      </div>
      <div>
        <label htmlFor="my-aliases" className="text-caption mb-1 block font-semibold">{k.aliases}</label>
        <Input id="my-aliases" className="h-11 text-base" value={aliases} placeholder={k.aliasesPlaceholder} onChange={(e) => setAliases(e.target.value)} onBlur={save} />
        <p className="text-caption mt-1 text-muted-foreground">{k.aliasesHelp} {k.myNameHelp}</p>
      </div>
    </div>
  );
}
