import { createFileRoute } from "@tanstack/react-router";
import { t } from "@/lib/i18n/pt-BR";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Speak Lab" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "description", content: "Entre no Speak Lab para praticar inglês." },
      { property: "og:title", content: "Entrar — Speak Lab" },
      { property: "og:description", content: "Entre no Speak Lab para praticar inglês." },
    ],
  }),
  component: () => (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-extrabold">
        Speak<span className="text-primary">Lab</span>
      </h1>
      <p className="mt-2 text-muted-foreground">{t.app.tagline}</p>
      <p className="mt-8 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        {t.login.subtitle}
      </p>
    </div>
  ),
});
