import { createFileRoute } from "@tanstack/react-router";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { t } from "@/lib/i18n/pt-BR";

export const Route = createFileRoute("/relatorio/$sessionId")({
  head: () => ({
    meta: [
      { title: "Relatório — Speak Lab" },
      { name: "description", content: "Relatório da sessão com seus 3 erros principais." },
      { property: "og:title", content: "Relatório — Speak Lab" },
      { property: "og:description", content: "Relatório da sessão com seus 3 erros principais." },
    ],
  }),
  component: () => (
    <AppShell title={t.report.title}>
      <EmptyState>{t.report.empty}</EmptyState>
    </AppShell>
  ),
});
