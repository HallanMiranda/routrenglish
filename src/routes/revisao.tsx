import { createFileRoute } from "@tanstack/react-router";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { t } from "@/lib/i18n/pt-BR";

export const Route = createFileRoute("/revisao")({
  head: () => ({
    meta: [
      { title: "Revisão — Speak Lab" },
      { name: "description", content: "Revise os cartões criados a partir dos seus erros." },
      { property: "og:title", content: "Revisão — Speak Lab" },
      { property: "og:description", content: "Revise os cartões criados a partir dos seus erros." },
    ],
  }),
  component: () => (
    <AppShell title={t.review.title}>
      <EmptyState>{t.review.empty}</EmptyState>
    </AppShell>
  ),
});
