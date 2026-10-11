import drillPacksJson from "@/content/drill-packs.json";
import headwayStarterJson from "@/content/headway-starter.json";
import puloDoGatoJson from "@/content/pulo-do-gato.json";
import { parsePacksJson } from "@/drills/importPack";
import type { DrillAttempt, DrillItem, DrillPack, PackProgress, PrintProgress, PuloDoGato } from "./types";
import missionsJson from "@/content/missions-phase1.json";
import type { Repo } from "./repo";
import type {
  AiSettings,
  AiUsage,
  MyName,
  Card,
  Course,
  UnitProgress,
  Checkpoint,
  ErrorItem,
  Material,
  MaterialItem,
  Mission,
  Session,
  TalkSession,
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
// Built-in course (American Headway Starter): validated like an import, so it shows in Aulas with no setup.
const builtInCourse = parsePacksJson(JSON.stringify(headwayStarterJson));
const builtInCourses: Course[] = builtInCourse.course ? [builtInCourse.course] : [];
// Pulo do Gato: the 10 key verbs (do, does, have, has, will, did, need, can, could, I'd like).
const builtInPulo = parsePacksJson(JSON.stringify(puloDoGatoJson));
const builtInPacks = [
  ...(rawPacks.packs ?? []),
  ...builtInCourse.packs.map((p, i) => ({ ...p, id: p.id ?? `${builtInCourse.course?.id ?? "course"}-${i + 1}` }) as DrillPack),
  ...builtInPulo.packs.map((p, i) => ({ ...p, id: p.id ?? `pulo-do-gato-u${i + 1}` }) as DrillPack),
].map(withMode);
const puloDoGato: PuloDoGato = { ...builtInCourse.pulo, ...builtInPulo.pulo, ...(rawPacks.pulo_do_gato ?? {}) };
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

  async listTalks() {
    return read<TalkSession>("talks");
  },
  async saveTalk(t) {
    const row: TalkSession = { ...t, id: uid(), created_at: now() };
    write("talks", [...read<TalkSession>("talks"), row]);
    return row;
  },
  async getSession(id) {
    return read<Session>("sessions").find((s) => s.id === id) ?? null;
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
      ...(c.tag ? { tag: c.tag } : {}),
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
    // SM-2: Errei = 1, Quase = 3, Acertei = 5.
    const rows = read<Card>("cards");
    const i = rows.findIndex((c) => c.id === cardId);
    if (i < 0) throw new Error(`Card ${cardId} not found`);
    const c = rows[i]!;
    const q = rating === "again" ? 1 : rating === "hard" ? 3 : 5;
    let { interval_days, reps } = c;
    if (q < 3) {
      reps = 0;
      interval_days = 1;
    } else {
      reps += 1;
      interval_days = reps === 1 ? 1 : reps === 2 ? 6 : Math.max(1, Math.round(interval_days * c.ease));
    }
    const ease = Math.max(1.3, c.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    const next: Card = { ...c, ease, interval_days, reps, due_at: new Date(Date.now() + interval_days * DAY).toISOString() };
    rows[i] = next;
    write("cards", rows);
    return next;
  },
  async listCards() {
    return read<Card>("cards");
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
      tts_model: s?.tts_model?.trim() || "gpt-4o-mini-tts",
      tts_voice: s?.tts_voice?.trim() || "coral",
      audio_model: s?.audio_model?.trim() || "gpt-audio-mini",
      pron_mode: s?.pron_mode ?? "final",
    } satisfies AiSettings;
  },
  async saveAiSettings(p) {
    const next = { ...(await localRepo.getAiSettings()), ...p };
    write("ai_settings", [next]);
    return next;
  },

  async getMyName() {
    const n = read<Partial<MyName>>("my_name")[0];
    return { name: n?.name ?? "Allan", aliases: n?.aliases ?? ["Alan", "Allen", "Alen"], city: n?.city ?? "São Paulo" };
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
  async getAiSpendByKind() {
    const month = now().slice(0, 7);
    const out: Partial<Record<AiUsage["kind"], number>> = {};
    for (const u of read<AiUsage>("ai_usage")) if (u.created_at.startsWith(month)) out[u.kind] = (out[u.kind] ?? 0) + u.cost_usd;
    return out;
  },
  async getPrintProgress(materialId) {
    return read<Record<string, PrintProgress>>("print_progress")[0]?.[materialId] ?? { mastered: [], missed: [] };
  },
  async savePrintProgress(materialId, p) {
    write("print_progress", [{ ...(read<Record<string, PrintProgress>>("print_progress")[0] ?? {}), [materialId]: p }]);
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
    // The built-in course always wins over an older imported copy with the same id (progress is kept by id).
    const builtInIds = new Set(builtInPacks.map((p) => p.id));
    return [...builtInPacks, ...read<DrillPack>("drill_packs").map(withMode).filter((p) => !builtInIds.has(p.id))];
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
  async listCourses() {
    const mine = read<Course>("courses");
    return [...builtInCourses.filter((c) => !mine.some((m) => m.id === c.id)), ...mine];
  },
  async saveCourse(c) {
    write("courses", [...read<Course>("courses").filter((x) => x.id !== c.id), c]);
  },
  async getUnitProgress(packId) {
    return (
      read<UnitProgress>("unit_progress").find((u) => u.pack_id === packId) ??
      { pack_id: packId, current_step: 1, done_steps: [], completed: false, missed: [], last_challenge: null }
    );
  },
  async saveUnitProgress(p) {
    write("unit_progress", [...read<UnitProgress>("unit_progress").filter((x) => x.pack_id !== p.pack_id), p]);
  },
};
