export const STORAGE_POLICY_PREFIX = "published/";
export const STORAGE_POLICY_CACHE_CONTROL = "private,no-store";

export function validateStoragePolicyObjectName(value) {
  const unsafeControl = typeof value === "string" && [...value]
    .some((character) => [0, 10, 13].includes(character.charCodeAt(0)));
  if (
    typeof value !== "string"
    || !value.startsWith(STORAGE_POLICY_PREFIX)
    || value.length <= STORAGE_POLICY_PREFIX.length
    || Buffer.byteLength(value, "utf8") > 1_024
    || unsafeControl
  ) throw new Error("storage-policy-object-name-invalid");
  return value;
}

export function storagePolicyMetadataUpdate(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    throw new Error("storage-policy-metadata-invalid");
  const custom = metadata.metadata;
  if (custom !== undefined && (!custom || typeof custom !== "object" || Array.isArray(custom)))
    throw new Error("storage-policy-metadata-invalid");
  const customMetadata = custom ?? {};
  const tokenPresent = Object.hasOwn(customMetadata, "firebaseStorageDownloadTokens")
    && customMetadata.firebaseStorageDownloadTokens !== null
    && customMetadata.firebaseStorageDownloadTokens !== "";
  // Historical revision objects recorded the editor's raw account UID. The
  // immutable object path and manifest already carry all authorization data;
  // retaining that extra identity after finalization is unnecessary.
  const rawUploaderPresent = Object.hasOwn(customMetadata, "uploaderId")
    && customMetadata.uploaderId !== null
    && customMetadata.uploaderId !== "";
  const required = tokenPresent || rawUploaderPresent
    || metadata.cacheControl !== STORAGE_POLICY_CACHE_CONTROL;
  if (!required) return { required: false };
  const metageneration = Number(metadata.metageneration);
  if (!Number.isSafeInteger(metageneration) || metageneration < 1)
    throw new Error("storage-policy-metageneration-invalid");
  return {
    required: true,
    metageneration,
    patch: {
      cacheControl: STORAGE_POLICY_CACHE_CONTROL,
      metadata: {
        ...customMetadata,
        firebaseStorageDownloadTokens: null,
        uploaderId: null,
      },
    },
  };
}

/** GCS startOffset is inclusive. Drop only the exact checkpoint and require
 * strict lexical progress so a malformed list response can never skip work. */
export function storagePolicyPageAfter(files, lastObjectName) {
  if (!Array.isArray(files)) throw new Error("storage-policy-page-invalid");
  const names = files.map((file) => validateStoragePolicyObjectName(file?.name));
  let preceding = lastObjectName === undefined
    ? undefined
    : validateStoragePolicyObjectName(lastObjectName);
  const output = [];
  for (const [index, name] of names.entries()) {
    if (index === 0 && name === preceding) continue;
    if (preceding !== undefined && Buffer.compare(Buffer.from(preceding), Buffer.from(name)) >= 0)
      throw new Error("storage-policy-page-invalid");
    output.push(files[index]);
    preceding = name;
  }
  return output;
}
