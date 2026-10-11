import drillPacksJson from "@/content/drill-packs.json";
import type { DrillAttempt, DrillItem, DrillPack, PackProgress, PuloDoGato } from "./types";
import missionsJson from "@/content/missions-phase1.json";
import type { Repo } from "./repo";
import type {
  AiSettings,
  AiUsage,
  MyName,
  Card,
  Checkpoint,
  ErrorItem,
  Material,
  MaterialItem,
  Mission,
  Session,
  Utterance,
} from "./types";

interface RawMission {
  id: string;
  title_pt: string;
  scenario: string;
  goal?: string;
  ai_role?: string;
  ai_opening?: string;
  key_phrases: string[];
}
const rawPhase = missionsJson as unknown as { phase?: number; missions?: RawMission[] };
const missions: Mission[] = (rawPhase.missions ?? []).map((m, i) => ({
  id: m.id,
  phase: rawPhase.phase ?? 1,
  day: i + 1,
  title: m.title_pt,
  situation: m.scenario,
  ...(m.goal ? { goal: m.goal } : {}),
  ...(m.ai_role ? { ai_role: m.ai_role } : {}),
  ...(m.ai_opening ? { ai_opening: m.ai_opening } : {}),
  key_phrases: m.key_phrases,
  model_dialogue: [],
}));
const rawPacks = drillPacksJson as unknown as { pulo_do_gato?: PuloDoGato; packs?: DrillPack[] };
/** Items without a mode are translate items. */
const withMode = (p: DrillPack): DrillPack => ({
  ...p,
  items: p.items.map((i) => ({ ...i, mode: (["qa", "ladder"] as const).find((m) => m === (i as { mode?: string }).mode) ?? "translate" }) as DrillItem),
});
const builtInPacks = (rawPacks.packs ?? []).map(withMode);
const puloDoGato: PuloDoGato = rawPacks.pulo_do_gato ?? {};
const PREFIX = "speak-lab:";
const DEFAULT_MODEL = "gpt-5.4-mini";
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
    const put = (r: Material) => write("materials", existing ? rows.map((x) => (x.id === id ? r : x)) : [...rows, r]);
    try {
      put(row);
    } catch {
      // Storage full: keep the thumbnail, drop the full-size images.
      const slim: Material = { ...row, images: undefined };
      put(slim);
      return slim;
    }
    return row;
  },
  async getMaterial(id) {
    return read<Material>("materials").find((m) => m.id === id) ?? null;
  },
  async deleteMaterial(id) {
    const m = read<Material>("materials").find((x) => x.id === id);
    write("materials", read<Material>("materials").filter((x) => x.id !== id));
    if (m?.pack_id) await localRepo.deleteDrillPack(m.pack_id);
  },
  async getAiSettings() {
    const s = read<AiSettings>("ai_settings")[0];
    return {
      api_key: s?.api_key ?? null,
      model: s?.model?.trim() || DEFAULT_MODEL,
      transcribe_model: s?.transcribe_model?.trim() || "gpt-4o-mini-transcribe",
      listen_ai: s?.listen_ai ?? true,
      judge_ai: s?.judge_ai ?? true,
      converse_ai: s?.converse_ai ?? true,
    } satisfies AiSettings;
  },
  async saveAiSettings(p) {
    const next = { ...(await localRepo.getAiSettings()), ...p };
    write("ai_settings", [next]);
    return next;
  },

  async getMyName() {
    return read<MyName>("my_name")[0] ?? { name: "Allan", aliases: ["Alan", "Allen", "Alen"] };
  },
  async saveMyName(n) {
    write("my_name", [n]);
  },
  async logAiUsage(u) {
    write("ai_usage", [...read<AiUsage>("ai_usage"), { ...u, created_at: now() }]);
  },
  async getAiSpendThisMonth() {
    const month = now().slice(0, 7);
    return read<AiUsage>("ai_usage").filter((u) => u.created_at.startsWith(month)).reduce((s, u) => s + u.cost_usd, 0);
  },
  async getLearnedAnswers() {
    return read<Record<string, string[]>>("learned_answers")[0] ?? {};
  },
  async addLearnedAnswer(itemId, answer) {
    const all = await localRepo.getLearnedAnswers();
    const list = all[itemId] ?? [];
    if (!list.includes(answer)) write("learned_answers", [{ ...all, [itemId]: [...list, answer] }]);
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

  async listDrillPacks() {
    return [...builtInPacks, ...read<DrillPack>("drill_packs").map(withMode)];
  },
  async getDrillPack(id) {
    return (await this.listDrillPacks()).find((p) => p.id === id) ?? null;
  },
  async saveDrillPack(p) {
    const row: DrillPack = { ...p, id: p.id ?? uid(), user_created: true };
    write("drill_packs", [...read<DrillPack>("drill_packs").filter((x) => x.id !== row.id), row]);
    return row;
  },
  async saveDrillAttempt(a) {
    const row: DrillAttempt = { ...a, id: uid(), created_at: now() };
    write("drill_attempts", [...read<DrillAttempt>("drill_attempts"), row]);
    return row;
  },
  async getPackProgress(packId) {
    const atts = read<DrillAttempt>("drill_attempts").filter((a) => a.pack_id === packId);
    if (!atts.length) return { pack_id: packId, best_round: 1, accuracy: null } satisfies PackProgress;
    let best = 1;
    for (const a of atts) best = Math.max(best, a.accuracy >= 0.8 ? Math.min(4, a.round + 1) : a.round);
    const inRound = atts.filter((a) => a.round === best);
    const accuracy = inRound.length ? Math.max(...inRound.map((a) => a.accuracy)) : Math.max(...atts.map((a) => a.accuracy));
    return { pack_id: packId, best_round: best as PackProgress["best_round"], accuracy };
  },
  async getPuloDoGato() {
    return { ...puloDoGato, ...(read<PuloDoGato>("pulo_do_gato")[0] ?? {}) };
  },
  async mergePuloDoGato(p) {
    write("pulo_do_gato", [{ ...(read<PuloDoGato>("pulo_do_gato")[0] ?? {}), ...p }]);
  },
  async deleteDrillPack(id) {
    write("drill_packs", read<DrillPack>("drill_packs").filter((x) => x.id !== id));
    write("drill_attempts", read<DrillAttempt>("drill_attempts").filter((a) => a.pack_id !== id));
  },
  async getLastDrillAttempt() {
    return read<DrillAttempt>("drill_attempts").at(-1) ?? null;
  },
  async getAutoListen() {
    return read<boolean>("auto_listen")[0] === true;
  },
  async setAutoListen(on) {
    write("auto_listen", [on]);
  },
  async getSoundMuted() {
    return read<boolean>("sound_muted")[0] === true;
  },
  async setSoundMuted(muted) {
    write("sound_muted", [muted]);
  },
};
