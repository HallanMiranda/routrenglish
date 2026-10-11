import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import type { DiffOp } from "@/drills/check";
import { t } from "@/lib/i18n/pt-BR";
import { cn } from "@/lib/utils";

const d = t.drills;
export const LIVES = 3;

export function Hearts({ lives }: { lives: number }) {
  const prev = useRef(lives);
  const [lost, setLost] = useState<number | null>(null);
  useEffect(() => {
    if (lives < prev.current) {
      setLost(lives);
      prev.current = lives;
      const id = window.setTimeout(() => setLost(null), 700);
      return () => window.clearTimeout(id);
    }
    prev.current = lives;
    return undefined;
  }, [lives]);
  return (
    <span className="flex items-center gap-0.5" aria-label={d.lives(lives)} role="img">
      {Array.from({ length: LIVES }, (_, i) => (
        <Heart key={i} className={cn("size-5", i < lives ? "fill-primary text-primary" : "text-muted-foreground/40", lost === i && "animate-heart-out text-primary")} />
      ))}
    </span>
  );
}

export function PuloCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border-l-4 border-live bg-live/15 p-3 text-left">
      <p className="text-caption font-bold">🐈 {d.pulo}</p>
      <p className="mt-1 text-base">{text}</p>
    </div>
  );
}

export function DiffLine({ ops }: { ops: DiffOp[] }) {
  return (
    <p lang="en" className="flex flex-wrap justify-center gap-x-1.5 gap-y-1 text-lg font-medium">
      {ops.map((o, i) =>
        o.type === "equal" ? <span key={i}>{o.word}</span>
        : o.type === "wrong" ? <mark key={i} className="rounded bg-destructive/15 px-1 text-destructive">{o.word}</mark>
        : o.type === "extra" ? <del key={i} className="rounded px-1 text-destructive" title={d.extra}>{o.word}</del>
        : <span key={i} className="rounded border border-dashed border-destructive px-1.5 text-destructive" title={d.missing}>?</span>,
      )}
    </p>
  );
}

export function CoachAvatar({ talking }: { talking: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center">
      <svg viewBox="0 0 64 64" className="size-11" role="img" aria-label={d.coach}>
        <circle cx="32" cy="32" r="31" className="fill-primary" />
        <circle cx="32" cy="36" r="18" className="fill-background" />
        <path d="M14 30c2-12 10-18 18-18s16 6 18 18c-6-6-12-8-18-8s-12 2-18 8z" className="fill-foreground" />
        <circle cx="25" cy="35" r="2.4" className="fill-foreground" />
        <circle cx="39" cy="35" r="2.4" className="fill-foreground" />
        <rect x="27" y="42" width="10" height={talking ? 5 : 2} rx="2.5" className={cn("fill-primary", talking && "motion-safe:animate-pulse")} />
      </svg>
    </div>
  );
}
