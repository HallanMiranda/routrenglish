import missionsJson from "@/content/missions-phase1.json";
import type { Repo } from "./repo";
import type {
  Card,
  Checkpoint,
  ErrorItem,
  Material,
  MaterialItem,
  Mission,
  Session,
  Utterance,
} from "./types";

const missions = missionsJson as Mission[];
const PREFIX = "speak-lab:";
const DAY = 86_400_000;

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(PREFIX + key) ?? "[]") as T[];
  } catch {
    return [];
  }
}
function write<T>(key: string, rows: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFIX + key, JSON.stringify(rows));
}
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
const now = () => new Date().toISOString();
const dayKey = (d: Date) => d.toLocaleDateString("en-CA");

function updateSession(id: string, fn: (s: Session) => Session): Session {
  const rows = read<Session>("sessions");
  const i = rows.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`Session ${id} not found`);
  const next = fn(rows[i]!);
  rows[i] = next;
  write("sessions", rows);
  return next;
}

export const localRepo: Repo = {
  async listMissions() {
    return [...missions].sort((a, b) => a.phase - b.phase || a.day - b.day);
  },
  async getMission(id) {
    return missions.find((m) => m.id === id) ?? null;
  },
  async getTodayMission() {
    const done = new Set(
      read<Session>("sessions").filter((s) => s.status === "finished").map((s) => s.mission_id),
    );
    const list = await localRepo.listMissions();
    return list.find((m) => !done.has(m.id)) ?? null;
  },

  async startOrResumeSession(missionId) {
    const rows = read<Session>("sessions");
    const open = rows.find((s) => s.mission_id === missionId && s.status === "in_progress");
    if (open) return open;
    const s: Session = {
      id: uid(),
      mission_id: missionId,
      status: "in_progress",
      current_step: 1,
      completed_steps: [],
      started_at: now(),
      finished_at: null,
    };
    write("sessions", [...rows, s]);
    return s;
  },
  async completeStep(sessionId, step) {
    return updateSession(sessionId, (s) => {
      const completed = Array.from(new Set([...s.completed_steps, step])).sort();
      const next = Math.min(6, Math.max(s.current_step, step + 1)) as Session["current_step"];
      return { ...s, completed_steps: completed, current_step: next };
    });
  },
  async finishSession(sessionId) {
    return updateSession(sessionId, (s) => ({ ...s, status: "finished", finished_at: now() }));
  },

  async saveUtterance(u) {
    const row: Utterance = { ...u, id: uid(), created_at: now() };
    write("utterances", [...read<Utterance>("utterances"), row]);
    return row;
  },

  async upsertError(e) {
    const rows = read<ErrorItem>("errors");
    const key = e.original.trim().toLowerCase();
    const i = rows.findIndex((r) => r.original.trim().toLowerCase() === key);
    if (i >= 0) {
      const prev = rows[i]!;
      const next: ErrorItem = { ...prev, ...e, id: prev.id, occurrences: prev.occurrences + 1, active: true, updated_at: now() } as ErrorItem;
      rows[i] = next;
      write("errors", rows);
      return next;
    }
    const row: ErrorItem = {
      id: uid(),
      session_id: null,
      br_error_id: null,
      occurrences: 1,
      active: true,
      created_at: now(),
      updated_at: now(),
      ...e,
    } as ErrorItem;
    write("errors", [...rows, row]);
    return row;
  },
  async listActiveErrors() {
    return read<ErrorItem>("errors").filter((e) => e.active);
  },

  async createCard(c) {
    const row: Card = {
      id: uid(),
      error_id: c.error_id ?? null,
      front: c.front,
      back: c.back,
      ease: 2.5,
      interval_days: 0,
      reps: 0,
      due_at: now(),
      created_at: now(),
    };
    write("cards", [...read<Card>("cards"), row]);
    return row;
  },
  async listDueCards(at = new Date()) {
    return read<Card>("cards")
      .filter((c) => new Date(c.due_at) <= at)
      .sort((a, b) => a.due_at.localeCompare(b.due_at));
  },
  async rateCard(cardId, rating) {
    const rows = read<Card>("cards");
    const i = rows.findIndex((c) => c.id === cardId);
    if (i < 0) throw new Error(`Card ${cardId} not found`);
    const c = rows[i]!;
    let { ease, interval_days, reps } = c;
    if (rating === "again") {
      reps = 0;
      interval_days = 0;
      ease = Math.max(1.3, ease - 0.2);
    } else {
      reps += 1;
      const mult = rating === "hard" ? 1.2 : rating === "easy" ? ease * 1.3 : ease;
      interval_days = reps === 1 ? (rating === "easy" ? 3 : 1) : Math.max(1, Math.round(interval_days * mult));
      if (rating === "hard") ease = Math.max(1.3, ease - 0.15);
      if (rating === "easy") ease += 0.15;
    }
    const due = rating === "again" ? Date.now() + 10 * 60_000 : Date.now() + interval_days * DAY;
    const next: Card = { ...c, ease, interval_days, reps, due_at: new Date(due).toISOString() };
    rows[i] = next;
    write("cards", rows);
    return next;
  },

  async saveCheckpoint(c) {
    const row: Checkpoint = { ...c, id: uid(), created_at: now() };
    write("checkpoints", [...read<Checkpoint>("checkpoints"), row]);
    return row;
  },
  async listCheckpoints() {
    return read<Checkpoint>("checkpoints");
  },

  async listMaterials() {
    return read<Material>("materials");
  },
  async saveMaterial(m) {
    const rows = read<Material>("materials");
    const id = m.id ?? uid();
    const items: MaterialItem[] = m.items.map((it, idx) => ({
      ...it,
      id: it.id || uid(),
      material_id: id,
      position: it.position ?? idx,
    }));
    const existing = rows.find((r) => r.id === id);
    const row: Material = { ...m, id, items, created_at: existing?.created_at ?? now() };
    write("materials", existing ? rows.map((r) => (r.id === id ? row : r)) : [...rows, row]);
    return row;
  },

  async getStreak() {
    const days = new Set(
      read<Session>("sessions")
        .filter((s) => s.finished_at)
        .map((s) => dayKey(new Date(s.finished_at!))),
    );
    let cursor = new Date();
    if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY);
    let streak = 0;
    while (days.has(dayKey(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - DAY);
    }
    return streak;
  },
};
