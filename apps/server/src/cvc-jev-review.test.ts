import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { roomStudyInputSchema } from "@cvc/room-study";
import { calculateRoomStudy } from "@cvc/room-study/calculator";
import { reviewCvcRun } from "./cvc-jev-review.js";
async function run() {
  const input = roomStudyInputSchema.parse(JSON.parse(await readFile(new URL("../../../packages/cvc-room-study/tests/fixtures/room-input.v1.json", import.meta.url), "utf8")));
  return calculateRoomStudy(input, { runId: "review-fixture", createdAt: "2026-09-27T00:00:00.000Z" });
}
test("missing Jev key does not call service or imply success", async () => {
  const result = await reviewCvcRun(await run());
  expect(result.status).toBe("unavailable"); expect(result.findings).toEqual([]);
});
test("batched decisions are bound to the saved run and cannot change its numbers", async () => {
  const original = await run(); const snapshot = JSON.stringify(original);
  const fetcher = async (_url: string, options: RequestInit) => {
    const request = JSON.parse(String(options?.body));
    expect(Object.keys(request.questions).length).toBe(10);
    return Response.json({ model: "test-model", answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {
      type: "choice", choice: "coherent", confidence: 0.6, probabilities: { coherent: 0.6, clarify: 0.2, insufficient: 0.2 },
    }])) });
  };
  const result = await reviewCvcRun(original, { key: "fixture-key", fetcher });
  expect(result.status).toBe("ready"); expect(result.runId).toBe(original.runId);
  expect(result.findings.every(item => item.decision === "insufficient")).toBe(true);
  expect(JSON.stringify(original)).toBe(snapshot);
});
test("incomplete or malformed service answers fail closed", async () => {
  const fetcher = async () => Response.json({ model: "fixture", answers: {} });
  expect((await reviewCvcRun(await run(), { key: "fixture", fetcher })).status).toBe("unavailable");
});
