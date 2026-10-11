import { repo } from "@/data/repo";
import type { Course, DrillPack, UnitProgress, UnitStep } from "@/data/types";

export interface UnitRow {
  pack: DrillPack;
  prog: UnitProgress;
  /** Previous unit completed (or first unit). */
  unlocked: boolean;
}
export interface CourseView {
  course: Course;
  units: UnitRow[];
  /** First unfinished unit, or null when the course is done. */
  current: UnitRow | null;
}

export const unitNumber = (p: DrillPack, i = 0) => p.unit ?? i + 1;
export const unitTag = (p: DrillPack) => `Unidade ${unitNumber(p)} · ${p.title_pt}`;

export async function loadCourses(): Promise<CourseView[]> {
  const [courses, packs] = await Promise.all([repo.listCourses(), repo.listDrillPacks()]);
  return Promise.all(
    courses.map(async (course) => {
      const list = packs.filter((p) => p.course_id === course.id).sort((a, b) => (a.unit ?? 0) - (b.unit ?? 0) || a.id.localeCompare(b.id, undefined, { numeric: true }));
      const progs = await Promise.all(list.map((p) => repo.getUnitProgress(p.id)));
      const units = list.map((pack, i) => ({ pack, prog: progs[i]!, unlocked: i === 0 || progs[i - 1]!.completed }));
      return { course, units, current: units.find((u) => !u.prog.completed) ?? null };
    }),
  );
}

/** Marks a unit step done and moves the resume point to the next unfinished step. */
export async function markStep(packId: string, step: UnitStep, patch: Partial<UnitProgress> = {}) {
  const p = await repo.getUnitProgress(packId);
  const done = [...new Set([...p.done_steps, step])].sort() as UnitStep[];
  const next = ([1, 2, 3, 4, 5] as const).find((s) => !done.includes(s)) ?? 5;
  const row = { ...p, ...patch, done_steps: done, current_step: next };
  await repo.saveUnitProgress(row);
  return row;
}

export async function setCurrentStep(packId: string, step: UnitStep) {
  const p = await repo.getUnitProgress(packId);
  await repo.saveUnitProgress({ ...p, current_step: step });
}

/** Saves a challenge result; 80%+ completes the unit (and counts as unit finished in Aplicabilidade). */
export async function saveChallenge(packId: string, accuracy: number, missed: { pt: string; en: string[] }[]) {
  const passed = accuracy >= 0.8;
  if (passed) await repo.saveDrillAttempt({ pack_id: packId, round: 4, accuracy, helped_item_ids: [] });
  const p = await repo.getUnitProgress(packId);
  const row: UnitProgress = passed
    ? { ...p, completed: true, done_steps: [...new Set([...p.done_steps, 5 as const])].sort() as UnitStep[], missed: [], last_challenge: accuracy }
    : { ...p, current_step: 5, missed, last_challenge: accuracy };
  await repo.saveUnitProgress(row);
  return passed;
}
