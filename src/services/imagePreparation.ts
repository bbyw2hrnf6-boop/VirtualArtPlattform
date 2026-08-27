import type { Artwork } from "../features/gallery/types";

export const ARTWORK_IMAGE_MAXIMUM_DIMENSION = 2048;
export const ARTWORK_IMAGE_MAXIMUM_BYTES = 570_000;
const ARTWORK_IMAGE_MAXIMUM_DATA_URL_LENGTH = 779_000;

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
    worker.postMessage({
      file,
      maximumDimension: ARTWORK_IMAGE_MAXIMUM_DIMENSION,
      maximumBytes: ARTWORK_IMAGE_MAXIMUM_BYTES,
    });
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
    const scale = Math.min(
      1,
      ARTWORK_IMAGE_MAXIMUM_DIMENSION /
        Math.max(image.naturalWidth, image.naturalHeight),
    );
    let canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.9;
    let type = "image/webp";
    let src = canvas.toDataURL(type, quality);
    if (!src.startsWith("data:image/webp")) {
      type = "image/jpeg";
      src = canvas.toDataURL(type, quality);
    }
    while (src.length > ARTWORK_IMAGE_MAXIMUM_DATA_URL_LENGTH && quality > 0.56) {
      quality -= 0.06;
      src = canvas.toDataURL(type, quality);
    }
    while (
      src.length > ARTWORK_IMAGE_MAXIMUM_DATA_URL_LENGTH &&
      Math.max(canvas.width, canvas.height) > 960
    ) {
      const resized = document.createElement("canvas");
      resized.width = Math.max(1, Math.round(canvas.width * 0.86));
      resized.height = Math.max(1, Math.round(canvas.height * 0.86));
      const resizedContext = resized.getContext("2d");
      if (!resizedContext)
        throw new Error("Your browser could not resize this image.");
      resizedContext.drawImage(canvas, 0, 0, resized.width, resized.height);
      canvas = resized;
      quality = 0.82;
      src = canvas.toDataURL(type, quality);
    }
    if (src.length > ARTWORK_IMAGE_MAXIMUM_DATA_URL_LENGTH)
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
      if (src.length > ARTWORK_IMAGE_MAXIMUM_DATA_URL_LENGTH)
        throw new Error(`${file.name} could not be compressed below the gallery limit.`);
      return { src, aspect: prepared.aspect };
    } catch (error) {
      console.warn("Image worker fallback", error);
    }
  }
  return mainThreadImage(file);
}
