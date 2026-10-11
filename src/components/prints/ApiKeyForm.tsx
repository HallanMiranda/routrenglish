import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { repo } from "@/data/repo";
import type { AiSettings } from "@/data/types";
import { testModels } from "@/ai/client";
import { previewVoice, VOICES } from "@/ai/tts";
import { cn } from "@/lib/utils";
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
  const [byKind, setByKind] = useState<Partial<Record<string, number>>>({});
  const [ttsModel, setTtsModel] = useState("");
  const [audioModel, setAudioModel] = useState("");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    void repo.getAiSettings().then((s) => {
      setSettings(s);
      setModel(s.model);
      setTModel(s.transcribe_model);
      setTtsModel(s.tts_model);
      setAudioModel(s.audio_model);
    });
    void repo.getAiSpendThisMonth().then(setSpend);
    void repo.getAiSpendByKind().then(setByKind);
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
        {full && (
          <>
            <div>
              <label htmlFor="ai-ttsmodel" className="text-caption mb-1 block font-semibold">{k.ttsModel}</label>
              <Input id="ai-ttsmodel" className="h-11 text-base" value={ttsModel} onChange={(e) => setTtsModel(e.target.value)} onBlur={() => void update({ tts_model: ttsModel.trim() })} />
            </div>
            <div>
              <label htmlFor="ai-voice" className="text-caption mb-1 block font-semibold">{k.ttsVoice}</label>
              <div className="flex gap-2">
                <select id="ai-voice" className="h-11 flex-1 rounded-md border bg-background px-3 text-base" value={settings.tts_voice} onChange={(e) => void update({ tts_voice: e.target.value })}>
                  {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <Button variant="outline" disabled={!settings.api_key || previewing} onClick={async () => {
                  setPreviewing(true); setStatus(null);
                  try { await previewVoice(settings, settings.tts_voice); } catch (e) { setStatus({ ok: false, text: (e as Error).message }); } finally { setPreviewing(false); }
                }}><Volume2 /> {k.preview}</Button>
              </div>
            </div>
            <div>
              <label htmlFor="ai-audiomodel" className="text-caption mb-1 block font-semibold">{k.audioModel}</label>
              <Input id="ai-audiomodel" className="h-11 text-base" value={audioModel} onChange={(e) => setAudioModel(e.target.value)} onBlur={() => void update({ audio_model: audioModel.trim() })} />
            </div>
            <div>
              <p className="text-caption mb-1 font-semibold">{k.pronMode}</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={k.pronMode}>
                {(["always", "final", "ask"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={settings.pron_mode === m} onClick={() => void update({ pron_mode: m })}
                    className={cn("min-h-11 rounded-lg px-2 text-sm font-semibold", settings.pron_mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
                    {k.pronModes[m]}
                  </button>
                ))}
              </div>
              <p className="text-caption mt-1 text-muted-foreground">{k.pronModeHelp}</p>
            </div>
          </>
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
              const s = await update({ model: model.trim(), ...(full ? { transcribe_model: tModel.trim(), tts_model: ttsModel.trim(), audio_model: audioModel.trim() } : {}) });
              try {
                await testModels(s);
                setStatus({ ok: true, text: k.testOkAll });
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
          <span className="mt-1 block">{k.spendSplit(byKind["voice"] ?? 0, byKind["listen"] ?? 0, byKind["judge"] ?? 0, byKind["pronunciation"] ?? 0, (byKind["prints"] ?? 0) + (byKind["converse"] ?? 0) + (byKind["report"] ?? 0) + (byKind["test"] ?? 0))}</span>
        </p>
      )}
    </div>
  );
}

export function MyNameForm() {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [city, setCity] = useState("");
  useEffect(() => {
    void repo.getMyName().then((n) => { setName(n.name); setAliases(n.aliases.join(", ")); setCity(n.city); });
  }, []);
  const save = () => void repo.saveMyName({ name: name.trim() || "Allan", aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), city: city.trim() });
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
      <div>
        <label htmlFor="my-city" className="text-caption mb-1 block font-semibold">{k.myCity}</label>
        <Input id="my-city" className="h-11 text-base" value={city} onChange={(e) => setCity(e.target.value)} onBlur={save} />
      </div>
    </div>
  );
}
