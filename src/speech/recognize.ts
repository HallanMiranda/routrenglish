import { t } from "@/lib/i18n/pt-BR";

/* eslint-disable @typescript-eslint/no-explicit-any */
type RecognitionCtor = new () => any;

export class RecognitionUnsupportedError extends Error {
  constructor() {
    super(t.speech.unsupported);
    this.name = "RecognitionUnsupportedError";
  }
}

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isRecognitionSupported() {
  return getCtor() !== null;
}

export interface ListenOptions {
  lang?: string;
  signal?: AbortSignal;
}

/** Listens for one utterance and resolves with the transcript. */
export function listen({ lang = "en-US", signal }: ListenOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor = getCtor();
    if (!Ctor) {
      reject(new RecognitionUnsupportedError());
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let transcript = "";
    let failed = false;

    rec.onresult = (e: any) => {
      transcript = Array.from(e.results as ArrayLike<any>)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    rec.onerror = (e: any) => {
      failed = true;
      const msg =
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? t.speech.denied
          : e.error === "no-speech"
            ? t.speech.noSpeech
            : t.speech.failed;
      reject(new Error(msg));
    };
    rec.onend = () => {
      if (!failed) resolve(transcript);
    };
    signal?.addEventListener("abort", () => rec.stop(), { once: true });
    rec.start();
  });
}

export interface LiveResult {
  transcript: string;
  /** 0..1, or null when the browser does not report it. */
  confidence: number | null;
}

/** Like listen(), but streams interim text and reports confidence. */
export function listenLive({ lang = "en-US", signal, onInterim }: ListenOptions & { onInterim?: (text: string) => void } = {}): Promise<LiveResult> {
  return new Promise((resolve, reject) => {
    const Ctor = getCtor();
    if (!Ctor) {
      reject(new RecognitionUnsupportedError());
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let transcript = "";
    let confidence: number | null = null;
    let failed = false;
    rec.onresult = (e: any) => {
      const results = Array.from(e.results as ArrayLike<any>);
      transcript = results.map((r) => r[0]?.transcript ?? "").join(" ").trim();
      const finals = results.filter((r) => r.isFinal && typeof r[0]?.confidence === "number" && r[0].confidence > 0);
      if (finals.length) confidence = finals.reduce((s, r) => s + r[0].confidence, 0) / finals.length;
      onInterim?.(transcript);
    };
    rec.onerror = (e: any) => {
      if (e.error === "aborted") return;
      failed = true;
      reject(new Error(
        e.error === "not-allowed" || e.error === "service-not-allowed" ? t.speech.denied : e.error === "no-speech" ? t.speech.noSpeech : t.speech.failed,
      ));
    };
    rec.onend = () => {
      if (!failed) resolve({ transcript, confidence });
    };
    signal?.addEventListener("abort", () => rec.stop(), { once: true });
    rec.start();
  });
}
