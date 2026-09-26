import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateRoomStudy } from "../src/calculator.ts";
import { roomStudyInputSchema, roomStudyRunSchema } from "../src/index.ts";

const identity = { runId: "calculation-1", createdAt: "2026-09-26T12:00:00Z" };
const input = () => roomStudyInputSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/room-input.v1.json", import.meta.url), "utf8")));
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("production calculator matches every independently checked reference contribution", () => {
  const reference = roomStudyRunSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/room-run.v1.json", import.meta.url), "utf8")));
  const actual = calculateRoomStudy(input(), identity);
  assert.equal(actual.contributions.length, reference.contributions.length);
  for (const expected of reference.contributions) {
    const found = actual.contributions.find((item) => item.kind === expected.kind && item.inputId === expected.inputId);
    assert.ok(found);
    close(found.coefficientWK, expected.coefficientWK);
    close(found.deltaTK, expected.deltaTK);
    close(found.heatLossW, expected.heatLossW);
    if (found.kind === "opaque" && expected.kind === "opaque") close(found.netAreaM2, expected.netAreaM2);
  }
  close(actual.totals.transmissionW, 257.5);
  close(actual.totals.thermalBridgesW, 12.5);
  close(actual.totals.airExchangeW, 500);
  close(actual.totals.heatLossW, 770);
});

test("changing a shared temperature changes every linked contribution and preserves the original", () => {
  const source = input();
  const first = calculateRoomStudy(source, identity);
  source.boundaries[0].temperature.value = -10;
  source.revisionId = "revision-2";
  const second = calculateRoomStudy(source, { ...identity, runId: "calculation-2" });
  close(second.totals.heatLossW, 910.5);
  close(second.totals.heatLossW - first.totals.heatLossW, 140.5);
  close(second.totals.transmissionW, 295.5);
  close(second.totals.thermalBridgesW, 15);
  close(second.totals.airExchangeW, 600);
  assert.equal(first.inputSnapshot.boundaries[0].temperature.value, -5);
  assert.equal(first.inputSnapshot.revisionId, "revision-1");
  assert.notEqual(first.inputSnapshot, source);
});

test("identical inputs and identity are deterministic without input mutation", () => {
  const source = input();
  const original = structuredClone(source);
  const run = calculateRoomStudy(source, identity);
  assert.deepEqual(calculateRoomStudy(source, identity), run);
  assert.deepEqual(source, original);
  run.inputSnapshot.surfaces[0].name = "Changed copy";
  assert.deepEqual(source, original);
});

test("explicit bridge exclusion changes the total and records the reason", () => {
  const source = input();
  source.thermalBridges = { mode: "excluded", reason: "Bridge data unavailable for this synthetic comparison." };
  const run = calculateRoomStudy(source, identity);
  close(run.totals.thermalBridgesW, 0);
  close(run.totals.heatLossW, 757.5);
  assert.equal(run.contributions.some((item) => item.kind === "thermal-bridge"), false);
  assert.ok(run.warnings.some((warning) => warning.includes("Bridge data unavailable")));
});

test("zero air flow and equal temperatures produce a valid zero loss", () => {
  const source = input();
  for (const boundary of source.boundaries) boundary.temperature.value = source.indoorTemperature.value;
  source.airExchange.flow.value = 0;
  const run = calculateRoomStudy(source, identity);
  close(run.totals.heatLossW, 0);
  assert.ok(run.contributions.every((item) => item.heatLossW === 0));
});

test("all-glazed wall has zero opaque loss and one opening contribution", () => {
  const source = input();
  source.surfaces[0].openings[0].area.value = 10;
  const run = calculateRoomStudy(source, identity);
  const opaque = run.contributions.find((item) => item.kind === "opaque" && item.inputId === "north");
  assert.ok(opaque);
  close(opaque.heatLossW, 0);
  close(run.totals.heatLossW, 990);
});

test("incomplete data, unsupported boundaries and invalid run identity cannot create a run", () => {
  assert.throws(() => calculateRoomStudy({}, identity));
  const source = input();
  source.boundaries[0].temperature.value = 30;
  assert.throws(() => calculateRoomStudy(source, identity));
  assert.throws(() => calculateRoomStudy(input(), { ...identity, runId: "../escape" }));
  assert.throws(() => calculateRoomStudy(input(), { ...identity, createdAt: "yesterday" }));
});

test("finite input overflow is rejected rather than saved as infinity or NaN", () => {
  const source = input();
  source.airExchange.flow.value = Number.MAX_VALUE;
  source.airExchange.density.value = Number.MAX_VALUE;
  assert.throws(() => calculateRoomStudy(source, identity));
});

test("surface ordering does not change totals", () => {
  const source = input();
  const before = calculateRoomStudy(source, identity);
  source.surfaces.reverse();
  const after = calculateRoomStudy(source, identity);
  close(after.totals.heatLossW, before.totals.heatLossW);
});

test("decimal rounding cannot reject an exactly filled parent or create negative loss", () => {
  const source = input();
  const parent = source.surfaces[0];
  parent.grossArea.value = 0.3;
  parent.openings[0].area.value = 0.1;
  const second = structuredClone(parent.openings[0]);
  second.id = "second-window";
  second.area.value = 0.2;
  parent.openings.push(second);
  const run = calculateRoomStudy(source, identity);
  const opaque = run.contributions.find((item) => item.kind === "opaque" && item.inputId === parent.id);
  assert.ok(opaque);
  close(opaque.heatLossW, 0);
  second.area.value = 0.20000001;
  assert.throws(() => calculateRoomStudy(source, identity));
});

test("a maximum-length valid exclusion reason still produces a valid warning", () => {
  const source = input();
  source.thermalBridges = { mode: "excluded", reason: "x".repeat(2000) };
  const run = calculateRoomStudy(source, identity);
  assert.ok(run.warnings.some((warning) => warning.endsWith("x".repeat(2000))));
});
