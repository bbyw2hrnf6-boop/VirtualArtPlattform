export function shouldUseFirebaseVerificationFallback(code: string) {
  const normalizedCode = code.toLowerCase();
  return ["not-found", "unimplemented", "failed-precondition"].some((value) =>
    normalizedCode.includes(value),
  );
}
