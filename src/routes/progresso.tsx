import { createFileRoute } from "@tanstack/react-router";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { t } from "@/lib/i18n/pt-BR";
import { Moon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme/ThemeProvider";
import { ApiKeyForm } from "@/components/prints/ApiKeyForm";

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
  return (
    <AppShell title={t.progress.title}>
      <EmptyState>{t.progress.empty}</EmptyState>
      <section className="mt-8 border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">{t.theme.title}</h2>
        <div className="flex items-center justify-between gap-4 py-3">
          <label htmlFor="theme-dark" className="flex items-center gap-2 text-sm"><Moon className="size-4" />{t.theme.dark}</label>
          <Switch id="theme-dark" checked={dark} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <label htmlFor="theme-system" className="text-sm text-muted-foreground">{t.theme.system}</label>
          <Switch id="theme-system" checked={theme === "system"} onCheckedChange={(checked) => setTheme(checked ? "system" : dark ? "dark" : "light")} />
        </div>
      </section>
      <section className="mt-8 border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">{t.apiKey.section}</h2>
        <ApiKeyForm />
      </section>
    </AppShell>
  );
}
