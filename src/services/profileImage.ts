const MAX_PROFILE_IMAGE_BYTES = 512 * 1024;

async function canvasWebp(canvas: HTMLCanvasElement, qualities: readonly number[]) {
  for (const quality of qualities) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (blob && blob.size <= MAX_PROFILE_IMAGE_BYTES) return blob;
  }
  throw new Error("The image could not be compressed enough.");
}

export async function prepareProfileImage(file: File) {
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)
    throw new Error("Choose a JPG, PNG, WebP, or AVIF image under 10 MB.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    if (!edge) throw new Error("The profile image could not be read.");
    const size = Math.min(512, edge);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The profile image could not be prepared.");
    context.drawImage(
      image,
      Math.round((image.naturalWidth - edge) / 2),
      Math.round((image.naturalHeight - edge) / 2),
      edge,
      edge,
      0,
      0,
      size,
      size,
    );
    return await canvasWebp(canvas, [0.82, 0.72, 0.62]);
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function prepareProfileCover(file: File) {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024)
    throw new Error("Choose a JPG, PNG, WebP, or AVIF image under 15 MB.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const targetRatio = 16 / 6;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const cropWidth = sourceRatio > targetRatio ? image.naturalHeight * targetRatio : image.naturalWidth;
    const cropHeight = sourceRatio > targetRatio ? image.naturalHeight : image.naturalWidth / targetRatio;
    if (!cropWidth || !cropHeight) throw new Error("The cover image could not be read.");
    const width = Math.min(1440, Math.round(cropWidth));
    const height = Math.round(width / targetRatio);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The cover image could not be prepared.");
    context.drawImage(
      image,
      Math.round((image.naturalWidth - cropWidth) / 2),
      Math.round((image.naturalHeight - cropHeight) / 2),
      Math.round(cropWidth),
      Math.round(cropHeight),
      0,
      0,
      width,
      height,
    );
    return await canvasWebp(canvas, [0.82, 0.72, 0.62, 0.52]);
  } finally {
    URL.revokeObjectURL(source);
  }
}
