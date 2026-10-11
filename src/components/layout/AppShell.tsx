import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen pb-24">
      <header className="mx-auto max-w-md px-5 pt-8 pb-4">
        <h1 className="text-3xl font-bold">{title}</h1>
      </header>
      <main className="mx-auto max-w-md px-5">{children}</main>
      <BottomNav />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
