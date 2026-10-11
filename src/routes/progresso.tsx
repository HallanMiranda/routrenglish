import { createFileRoute } from "@tanstack/react-router";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { t } from "@/lib/i18n/pt-BR";
import { Moon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme/ThemeProvider";
import { ApiKeyForm } from "@/components/prints/ApiKeyForm";
import { useEffect, useState } from "react";
import { repo } from "@/data/repo";

export const Route = createFileRoute("/progresso")({
  head: () => ({
    meta: [
      { title: "Progresso — Speak Lab" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "description", content: "Sequência, fluência e evolução dos erros." },
      { property: "og:title", content: "Progresso — Speak Lab" },
      { property: "og:description", content: "Sequência, fluência e evolução dos erros." },
    ],
  }),
  component: Progress,
});

function Progress() {
  const { dark, theme, setTheme } = useTheme();
  const [auto, setAuto] = useState(false);
  useEffect(() => { void repo.getAutoListen().then(setAuto); }, []);
  return (
    <AppShell title={t.progress.title}>
      <EmptyState>{t.progress.empty}</EmptyState>
      <section className="border-t pt-6">
        <h2 className="text-headline mb-2">{t.theme.title}</h2>
        <div className="flex min-h-11 items-center justify-between gap-4 py-2">
          <label htmlFor="theme-dark" className="flex items-center gap-2 text-base"><Moon className="size-4" />{t.theme.dark}</label>
          <Switch id="theme-dark" checked={dark} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
        </div>
        <div className="flex min-h-11 items-center justify-between gap-4 py-2">
          <label htmlFor="theme-system" className="text-base text-muted-foreground">{t.theme.system}</label>
          <Switch id="theme-system" checked={theme === "system"} onCheckedChange={(checked) => setTheme(checked ? "system" : dark ? "dark" : "light")} />
        </div>
      </section>
      <section className="border-t pt-6">
        <h2 className="text-headline mb-2">{t.progress.practice}</h2>
        <div className="flex min-h-11 items-center justify-between gap-4 py-2">
          <label htmlFor="auto-listen" className="text-base">
            {t.drills.autoListen}
            <span className="text-caption block text-muted-foreground">{t.drills.autoListenHelp}</span>
          </label>
          <Switch id="auto-listen" checked={auto} onCheckedChange={(c) => { setAuto(c); void repo.setAutoListen(c); }} />
        </div>
      </section>
      <section className="border-t pt-6">
        <h2 className="text-headline mb-4">{t.apiKey.section}</h2>
        <ApiKeyForm />
      </section>
    </AppShell>
  );
}
