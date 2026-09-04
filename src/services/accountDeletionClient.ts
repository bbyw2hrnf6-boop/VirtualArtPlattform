export type AccountDeletionResponse = {
  status: "running" | "complete" | "deleted";
  phase?: string;
  retryAfterMs?: number;
  summary?: Record<string, unknown>;
};

export async function continueAccountDeletion(
  erase: () => Promise<AccountDeletionResponse>,
  delay: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)),
) {
  for (let continuation = 0; continuation < 2_048; continuation += 1) {
    const result = await erase();
    if (result.status === "complete" || result.status === "deleted")
      return result.summary ?? {};
    if (result.status !== "running") throw new Error("Account deletion returned an invalid status.");
    const retryAfterMs = Number.isFinite(result.retryAfterMs)
      ? Math.min(2_000, Math.max(50, Number(result.retryAfterMs)))
      : 75;
    await delay(retryAfterMs);
  }
  throw new Error("Account deletion did not complete. Retry safely.");
}
