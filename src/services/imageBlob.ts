const SUPPORTED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type SupportedImageType =
  | "image/avif"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

function declaredImageType(blob: Blob): SupportedImageType | undefined {
  const type = blob.type.split(";", 1)[0].trim().toLowerCase();
  return SUPPORTED_IMAGE_TYPES.has(type) ? type as SupportedImageType : undefined;
}

export async function normalizedImageBlob(blob: Blob): Promise<{
  blob: Blob;
  contentType: SupportedImageType;
}> {
  const declared = declaredImageType(blob);
  if (declared) {
    return {
      blob: blob.type === declared ? blob : blob.slice(0, blob.size, declared),
      contentType: declared,
    };
  }

  const bytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  let contentType: SupportedImageType | undefined;
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) contentType = "image/png";
  else if (
    bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  ) contentType = "image/jpeg";
  else if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) contentType = "image/webp";
  else if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (brand === "avif" || brand === "avis") contentType = "image/avif";
  }

  if (!contentType) throw new Error("The prepared image uses an unsupported format.");
  return { blob: blob.slice(0, blob.size, contentType), contentType };
}
