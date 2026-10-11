import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh pb-28">
      <header className="pt-safe mx-auto max-w-md px-5 pb-4">
        <h1 className="text-large-title mt-6">{title}</h1>
      </header>
      <main className="mx-auto max-w-md space-y-6 px-5">{children}</main>
      <BottomNav />
    </div>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-4 rounded-[20px] border border-dashed bg-card p-8 text-center text-base text-muted-foreground">
      <div>{children}</div>
      {action}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <li key={i} className="h-24 animate-pulse rounded-[20px] bg-muted" />)}
    </ul>
  );
}
