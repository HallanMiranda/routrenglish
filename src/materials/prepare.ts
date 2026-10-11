// Browser-only helpers to turn uploads into what the model receives.

async function toJpeg(file: Blob, maxW: number, quality: number) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", quality);
}

/** Max 1600px wide JPEG for the model, plus a small thumbnail. */
export async function prepareImage(file: File) {
  return { full: await toJpeg(file, 1600, 0.8), thumb: await toJpeg(file, 240, 0.7) };
}

/** Extracts text from up to the first 10 pages. */
export async function pdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = Math.min(10, doc.numPages);
  const pages: string[] = [];
  for (let i = 1; i <= n; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return { text: pages.join("\n\n").replace(/[ \t]+/g, " ").trim(), pages: doc.numPages, truncated: doc.numPages > 10 };
}
