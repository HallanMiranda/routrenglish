import { createFileRoute } from "@tanstack/react-router";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { t } from "@/lib/i18n/pt-BR";

export const Route = createFileRoute("/biblioteca/$materialId")({
  head: () => ({
    meta: [
      { title: "Material — Speak Lab" },
      { name: "description", content: "Detalhes do material de estudo." },
      { property: "og:title", content: "Material — Speak Lab" },
      { property: "og:description", content: "Detalhes do material de estudo." },
    ],
  }),
  component: () => (
    <AppShell title={t.material.title}>
      <EmptyState>{t.common.comingSoon}</EmptyState>
    </AppShell>
  ),
});
