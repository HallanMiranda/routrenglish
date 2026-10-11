import { Link } from "@tanstack/react-router";
import { BarChart3, Camera, Layers, MessageSquareText, Sun } from "lucide-react";
import { t } from "@/lib/i18n/pt-BR";

const items = [
  { to: "/", label: t.nav.today, icon: Sun },
  { to: "/uberclass", label: t.nav.practice, icon: MessageSquareText },
  { to: "/revisao", label: t.nav.review, icon: Layers },
  { to: "/prints", label: t.nav.prints, icon: Camera },
  { to: "/progresso", label: t.nav.progress, icon: BarChart3 },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur pb-safe">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex flex-col items-center gap-1 min-h-14 justify-center py-2 text-[13px] font-medium text-muted-foreground transition-colors data-[status=active]:text-primary"
            >
              <Icon className="size-5" strokeWidth={2.2} />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
