import type { Artwork } from "../features/gallery/types";

async function workerImage(file: File) {
  return new Promise<{ blob: Blob; aspect: number }>((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/imageProcessor.worker.ts", import.meta.url),
      { type: "module" },
    );
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("Image preparation timed out."));
    }, 30_000);
    worker.addEventListener("message", (event: MessageEvent<{
      ok: boolean;
      blob?: Blob;
      aspect?: number;
      message?: string;
    }>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (!event.data.ok || !event.data.blob || !event.data.aspect) {
        reject(new Error(event.data.message || "Image preparation failed."));
        return;
      }
      resolve({ blob: event.data.blob, aspect: event.data.aspect });
    });
    worker.addEventListener("error", () => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error("Image worker unavailable."));
    });
    worker.postMessage({ file, maximumDimension: 1200, maximumBytes: 540_000 });
  });
}

function blobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Image result is unavailable.")),
    );
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Image result could not be read.")),
    );
    reader.readAsDataURL(blob);
  });
}

async function mainThreadImage(file: File): Promise<Pick<Artwork, "src" | "aspect">> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(
        `${file.name} could not be opened. Please export it as JPG, PNG, or WebP.`,
      ));
      image.src = url;
    });
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.78;
    let src = canvas.toDataURL("image/webp", quality);
    if (!src.startsWith("data:image/webp")) src = canvas.toDataURL("image/jpeg", 0.82);
    while (src.length > 720_000 && quality > 0.38) {
      quality -= 0.08;
      src = canvas.toDataURL(src.startsWith("data:image/webp") ? "image/webp" : "image/jpeg", quality);
    }
    if (src.length > 780_000)
      throw new Error(`${file.name} could not be compressed below the gallery limit.`);
    return { src, aspect: canvas.width / canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function imageFromFile(file: File): Promise<Pick<Artwork, "src" | "aspect">> {
  if (file.size > 30 * 1024 * 1024)
    throw new Error(`${file.name} is larger than 30 MB.`);
  if ("Worker" in window && "OffscreenCanvas" in window && "createImageBitmap" in window) {
    try {
      const prepared = await workerImage(file);
      const src = await blobAsDataUrl(prepared.blob);
      if (src.length > 780_000)
        throw new Error(`${file.name} could not be compressed below the gallery limit.`);
      return { src, aspect: prepared.aspect };
    } catch (error) {
      console.warn("Image worker fallback", error);
    }
  }
  return mainThreadImage(file);
}
