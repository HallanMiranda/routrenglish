import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { repo } from "@/data/repo";
import type { AiSettings } from "@/data/types";
import { testKey } from "@/ai/openai";
import { t } from "@/lib/i18n/pt-BR";

const k = t.apiKey;

export function ApiKeyForm({ onChange }: { onChange?: (s: AiSettings) => void }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void repo.getAiSettings().then((s) => {
      setSettings(s);
      setModel(s.model);
    });
  }, []);

  async function update(p: Partial<AiSettings>) {
    const s = await repo.saveAiSettings(p);
    setSettings(s);
    onChange?.(s);
    return s;
  }

  if (!settings) return null;
  const hasKey = !!settings.api_key && !editing;

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      {hasKey ? (
        <p className="flex items-center gap-2 text-sm">
          <KeyRound className="size-4 text-primary" />
          {k.saved} ·{" "}
          <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => { setKey(""); setEditing(true); }}>
            {k.change}
          </button>
        </p>
      ) : (
        <>
          <label htmlFor="api-key" className="block text-sm font-semibold">{k.label}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input id="api-key" type={show ? "text" : "password"} autoComplete="off" value={key} placeholder={k.placeholder} onChange={(e) => setKey(e.target.value)} className="pr-10" />
              <button type="button" aria-label={show ? k.hide : k.show} onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button disabled={!key.trim()} onClick={async () => { await update({ api_key: key.trim() }); setEditing(false); setStatus(null); }}>
              {k.save}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{k.help}</p>
        </>
      )}
      <div>
        <label htmlFor="ai-model" className="mb-1 block text-sm font-semibold">{k.model}</label>
        <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => void update({ model: model.trim() })} />
      </div>
      {settings.api_key && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={testing}
            onClick={async () => {
              setTesting(true);
              setStatus(null);
              const s = await update({ model: model.trim() });
              try {
                await testKey(s.api_key!, s.model);
                setStatus({ ok: true, text: k.testOk(s.model) });
              } catch (e) {
                setStatus({ ok: false, text: (e as Error).message });
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? k.testing : k.test}
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await update({ api_key: null }); setEditing(false); setStatus({ ok: true, text: k.cleared }); }}>
            {k.clear}
          </Button>
        </div>
      )}
      {status && (
        <p role="status" className={status.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{status.text}</p>
      )}
    </div>
  );
}
