import type {
  Card,
  CardRating,
  Checkpoint,
  DrillAttempt,
  DrillPack,
  PackProgress,
  PuloDoGato,
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
  createCard(c: Pick<Card, "front" | "back"> & { error_id?: string | null }): Promise<Card>;
  listDueCards(now?: Date): Promise<Card[]>;
  rateCard(cardId: string, rating: CardRating): Promise<Card>;
  saveCheckpoint(c: Omit<Checkpoint, "id" | "created_at">): Promise<Checkpoint>;
  listCheckpoints(): Promise<Checkpoint[]>;
  listMaterials(): Promise<Material[]>;
  saveMaterial(m: Omit<Material, "id" | "created_at"> & { id?: string }): Promise<Material>;
  getStreak(): Promise<number>;
  listDrillPacks(): Promise<DrillPack[]>;
  getDrillPack(id: string): Promise<DrillPack | null>;
  saveDrillPack(p: Omit<DrillPack, "id"> & { id?: string }): Promise<DrillPack>;
  saveDrillAttempt(a: Omit<DrillAttempt, "id" | "created_at">): Promise<DrillAttempt>;
  getPackProgress(packId: string): Promise<PackProgress>;
  getPuloDoGato(): Promise<PuloDoGato>;
  mergePuloDoGato(p: PuloDoGato): Promise<void>;
  deleteDrillPack(id: string): Promise<void>;
  getSoundMuted(): Promise<boolean>;
  setSoundMuted(muted: boolean): Promise<void>;
}

// Swap this for a cloud implementation later; the UI only imports `repo`.
export const repo: Repo = localRepo;
