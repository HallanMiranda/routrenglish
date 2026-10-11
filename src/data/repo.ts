import type {
  AiSettings,
  AiUsage,
  MyName,
  Card,
  CardRating,
  Checkpoint,
  DrillAttempt,
  DrillPack,
  PackProgress,
  PuloDoGato,
  PrintProgress,
  ErrorItem,
  Material,
  Mission,
  Session,
  StepIndex,
  Utterance,
} from "./types";
import { localRepo } from "./localRepo";

export interface Repo {
  getTodayMission(): Promise<Mission | null>;
  getMission(id: string): Promise<Mission | null>;
  listMissions(): Promise<Mission[]>;
  startOrResumeSession(missionId: string): Promise<Session>;
  completeStep(sessionId: string, step: StepIndex): Promise<Session>;
  finishSession(sessionId: string): Promise<Session>;
  saveUtterance(u: Omit<Utterance, "id" | "created_at">): Promise<Utterance>;
  upsertError(
    e: Pick<ErrorItem, "original" | "correction"> & Partial<Omit<ErrorItem, "id">>,
  ): Promise<ErrorItem>;
  listActiveErrors(): Promise<ErrorItem[]>;
  createCard(c: Pick<Card, "front" | "back"> & { error_id?: string | null; tag?: string | undefined }): Promise<Card>;
  listDueCards(now?: Date): Promise<Card[]>;
  rateCard(cardId: string, rating: CardRating): Promise<Card>;
  saveCheckpoint(c: Omit<Checkpoint, "id" | "created_at">): Promise<Checkpoint>;
  listCheckpoints(): Promise<Checkpoint[]>;
  listMaterials(): Promise<Material[]>;
  saveMaterial(m: Omit<Material, "id" | "created_at"> & { id?: string }): Promise<Material>;
  getMaterial(id: string): Promise<Material | null>;
  /** Also deletes the pack generated from it. */
  deleteMaterial(id: string): Promise<void>;
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(p: Partial<AiSettings>): Promise<AiSettings>;
  getStreak(): Promise<number>;
  getMyName(): Promise<MyName>;
  saveMyName(n: MyName): Promise<void>;
  logAiUsage(u: Omit<AiUsage, "created_at">): Promise<void>;
  /** Approximate USD spent with AI in the current calendar month. */
  getAiSpendThisMonth(): Promise<number>;
  /** Same, split by usage kind. */
  getAiSpendByKind(): Promise<Partial<Record<AiUsage["kind"], number>>>;
  getPrintProgress(materialId: string): Promise<PrintProgress>;
  savePrintProgress(materialId: string, p: PrintProgress): Promise<void>;
  /** Answers the AI judge accepted, per item id, so they pass locally next time. */
  getLearnedAnswers(): Promise<Record<string, string[]>>;
  addLearnedAnswer(itemId: string, answer: string): Promise<void>;
  listDrillPacks(): Promise<DrillPack[]>;
  getDrillPack(id: string): Promise<DrillPack | null>;
  saveDrillPack(p: Omit<DrillPack, "id"> & { id?: string }): Promise<DrillPack>;
  saveDrillAttempt(a: Omit<DrillAttempt, "id" | "created_at">): Promise<DrillAttempt>;
  getPackProgress(packId: string): Promise<PackProgress>;
  getPuloDoGato(): Promise<PuloDoGato>;
  mergePuloDoGato(p: PuloDoGato): Promise<void>;
  deleteDrillPack(id: string): Promise<void>;
  /** Most recent counted drill attempt, for "Continuar". */
  getLastDrillAttempt(): Promise<DrillAttempt | null>;
  getAutoListen(): Promise<boolean>;
  setAutoListen(on: boolean): Promise<void>;
  getSoundMuted(): Promise<boolean>;
  setSoundMuted(muted: boolean): Promise<void>;
}

// Swap this for a cloud implementation later; the UI only imports `repo`.
export const repo: Repo = localRepo;
