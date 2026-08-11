export type PublishStatus =
  | "idle"
  | "preparing"
  | "publishing"
  | "published"
  | "error";

export type PublishEvent =
  | { type: "PREPARE" }
  | { type: "WRITE" }
  | { type: "SUCCEED" }
  | { type: "FAIL" }
  | { type: "RESET" };

const TRANSITIONS: Record<
  PublishStatus,
  Partial<Record<PublishEvent["type"], PublishStatus>>
> = {
  idle: { PREPARE: "preparing", RESET: "idle" },
  preparing: { WRITE: "publishing", FAIL: "error", RESET: "idle" },
  publishing: { SUCCEED: "published", FAIL: "error" },
  published: { RESET: "idle" },
  error: { PREPARE: "preparing", RESET: "idle" },
};

export function publishStatusReducer(
  status: PublishStatus,
  event: PublishEvent,
): PublishStatus {
  return TRANSITIONS[status][event.type] ?? status;
}
