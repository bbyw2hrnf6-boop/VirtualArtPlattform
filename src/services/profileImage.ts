const MAX_PROFILE_IMAGE_BYTES = 512 * 1024;

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
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    if (!blob || blob.size > MAX_PROFILE_IMAGE_BYTES)
      throw new Error("The profile image could not be compressed enough.");
    return blob;
  } finally {
    URL.revokeObjectURL(source);
  }
}
