import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { AppShell, EmptyState } from "@/components/layout/AppShell";
import { t } from "@/lib/i18n/pt-BR";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca — Speak Lab" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "description", content: "Missões e materiais de estudo." },
      { property: "og:title", content: "Biblioteca — Speak Lab" },
      { property: "og:description", content: "Missões e materiais de estudo." },
    ],
  }),
  component: Library,
});

function Library() {
  const child = useMatch({ from: "/biblioteca/$materialId", shouldThrow: false });
  if (child) return <Outlet />;
  return (
    <AppShell title={t.library.title}>
      <EmptyState>{t.library.empty}</EmptyState>
    </AppShell>
  );
}
