/// <reference lib="webworker" />

type Request = { file: File; maximumDimension: number; maximumBytes: number };

self.addEventListener("message", async (event: MessageEvent<Request>) => {
  try {
    const bitmap = await createImageBitmap(event.data.file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(
      1,
      event.data.maximumDimension / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image canvas is unavailable.");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    let quality = 0.78;
    let blob = await canvas.convertToBlob({ type: "image/webp", quality });
    while (blob.size > event.data.maximumBytes && quality > 0.38) {
      quality -= 0.08;
      blob = await canvas.convertToBlob({ type: "image/webp", quality });
    }
    if (blob.size > event.data.maximumBytes)
      throw new Error("Image could not be compressed below the gallery limit.");
    self.postMessage({ ok: true, blob, aspect: width / height });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : "Image preparation failed.",
    });
  }
});

export {};
