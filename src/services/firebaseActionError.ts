function firebaseCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String(error.code).toLowerCase()
    : "";
}

function firebaseMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    && typeof error.message === "string"
    ? error.message
    : "";
}

/**
 * Callable Functions intentionally hide unexpected server details behind
 * `internal`. Keep those implementation details out of the interface while
 * still telling the user what happened to their room.
 */
export function firebaseActionErrorMessage(
  error: unknown,
  fallback: string,
) {
  const code = firebaseCode(error);
  const message = firebaseMessage(error);
  if (code.includes("unauthenticated"))
    return "Your session expired. Sign in again, then retry.";
  if (code.includes("permission-denied"))
    return "This account does not have permission to change this Space.";
  if (code.includes("not-found"))
    return "This Space no longer exists. Refresh your Space list.";
  if (code.includes("failed-precondition"))
    return message && message !== "internal"
      ? message
      : "This Space is not ready for that action. Refresh it, then retry.";
  if (code.includes("invalid-argument"))
    return "That Space setting is not valid. Refresh the page, then retry.";
  if (code.includes("resource-exhausted"))
    return "The current preview limit has been reached. Nothing was changed.";
  if (
    code.includes("internal") ||
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("network-request-failed")
  )
    return "LIEUVA Space management is temporarily unavailable. Nothing was changed; retry shortly.";
  return message && message !== "internal"
    ? message
    : fallback;
}
