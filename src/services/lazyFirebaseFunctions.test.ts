import { describe, expect, it, vi } from "vitest";
import { callFirebaseFunction } from "./lazyFirebaseFunctions";

const { callable, httpsCallable } = vi.hoisted(() => ({
  callable: vi.fn().mockResolvedValue({ data: { accepted: true } }),
  httpsCallable: vi.fn(),
}));

vi.mock("firebase/functions", () => ({ httpsCallable }));
vi.mock("./firebase", () => ({ firebaseFunctions: "test-functions-instance" }));

describe("lazy Firebase Functions client", () => {
  it("preserves the callable name, payload and response data contract", async () => {
    httpsCallable.mockReturnValue(callable);

    await expect(callFirebaseFunction("checkLieuvaBoundary", { value: 1 }))
      .resolves.toEqual({ accepted: true });
    expect(httpsCallable).toHaveBeenCalledWith(
      "test-functions-instance",
      "checkLieuvaBoundary",
    );
    expect(callable).toHaveBeenCalledWith({ value: 1 });
  });
});
