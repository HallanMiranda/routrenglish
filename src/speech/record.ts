// Browser audio recording for AI transcription (webm/opus, or mp4 on iPhone).
export function canRecord() {
  return typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;
}

export interface Recording {
  stop(): Promise<{ blob: Blob; seconds: number }>;
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const t0 = Date.now();
  rec.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        const done = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve({ blob: new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }), seconds: (Date.now() - t0) / 1000 });
        };
        if (rec.state === "inactive") return done();
        rec.onstop = done;
        rec.stop();
      }),
  };
}
