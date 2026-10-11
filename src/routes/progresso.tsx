import { createFileRoute } from "@tanstack/react-router";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { t } from "@/lib/i18n/pt-BR";

export const Route = createFileRoute("/progresso")({
  head: () => ({
    meta: [
      { title: "Progresso — Speak Lab" },
      { name: "description", content: "Sequência, fluência e evolução dos erros." },
      { property: "og:title", content: "Progresso — Speak Lab" },
      { property: "og:description", content: "Sequência, fluência e evolução dos erros." },
    ],
  }),
  component: () => (
    <AppShell title={t.progress.title}>
      <EmptyState>{t.progress.empty}</EmptyState>
    </AppShell>
  ),
});
