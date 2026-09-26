import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { roomStudyInputSchema, roomStudyRunSchema, validateRoomStudy } from "../src/index.ts";
import type { RoomStudyInput } from "../src/index.ts";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.v1.json`, import.meta.url), "utf8"));
}
const baseline = () => roomStudyInputSchema.parse(fixture("room-input"));

test("versioned synthetic input and transport result parse and round-trip", () => {
  const input = baseline();
  const run = roomStudyRunSchema.parse(fixture("room-run"));
  assert.deepEqual(run.inputSnapshot, input);
  assert.deepEqual(roomStudyRunSchema.parse(JSON.parse(JSON.stringify(run))), run);
  assert.equal(run.totals.heatLossW, 770);
  assert.equal(run.contributions.find((item) => item.kind === "opaque")?.netAreaM2, 8);
});

test("missing input produces field issues and no ready input or numerical output", () => {
  const input = baseline();
  const { indoorTemperature, ...missing } = input;
  const result = validateRoomStudy(missing);
  assert.equal(result.ready, false);
  assert.equal("input" in result, false);
  assert.ok(result.issues.some((issue) => issue.path === "indoorTemperature"));
  assert.equal("totals" in result, false);
  assert.ok(result.issues.every((issue) => issue.question.length > 0));
  assert.equal(indoorTemperature.value, 20);
});

const invalidCases: [string, (input: RoomStudyInput) => unknown][] = [
  ["unsupported version", (input) => ({ ...input, schemaVersion: 2 })],
  ["unsupported method", (input) => ({ ...input, method: "EN12831" })],
  ["unknown fields", (input) => ({ ...input, inferredClimate: true })],
  ["unknown units", (input) => ({ ...input, indoorTemperature: { ...input.indoorTemperature, unit: "degF" } })],
  ["numeric strings", (input) => ({ ...input, indoorTemperature: { ...input.indoorTemperature, value: "20" } })],
  ["missing provenance", (input) => ({ ...input, indoorTemperature: { value: 20, unit: "degC" } })],
  ["empty assumption detail", (input) => { input.indoorTemperature.provenance.detail = " "; return input; }],
  ["NaN", (input) => { input.indoorTemperature.value = NaN; return input; }],
  ["infinite value", (input) => { input.airExchange.flow.value = Infinity; return input; }],
  ["negative area", (input) => { input.surfaces[0].grossArea.value = -1; return input; }],
  ["zero U value", (input) => { input.surfaces[0].thermalTransmittance.value = 0; return input; }],
  ["negative flow", (input) => { input.airExchange.flow.value = -1; return input; }],
  ["zero density", (input) => { input.airExchange.density.value = 0; return input; }],
  ["negative specific heat", (input) => { input.airExchange.specificHeat.value = -1; return input; }],
  ["absolute zero", (input) => { input.boundaries[0].temperature.value = -273.15; return input; }],
  ["warmer boundary", (input) => { input.boundaries[0].temperature.value = 21; return input; }],
  ["missing boundary reference", (input) => { input.surfaces[0].boundaryId = "absent"; return input; }],
  ["duplicate condition", (input) => { input.boundaries.push(structuredClone(input.boundaries[0])); return input; }],
  ["indoor air boundary", (input) => { input.airExchange.boundaryId = "roomBelow"; return input; }],
  ["ground boundary", (input) => ({ ...input, boundaries: [{ ...input.boundaries[0], kind: "ground" }] })],
  ["heat recovery", (input) => ({ ...input, airExchange: { ...input.airExchange, mode: "heat-recovery" } })],
  ["oversized openings", (input) => { input.surfaces[0].openings[0].area.value = 11; return input; }],
  ["duplicate opening in same parent", (input) => { input.surfaces[0].openings.push(structuredClone(input.surfaces[0].openings[0])); return input; }],
  ["duplicate opening across parents", (input) => { input.surfaces[1].openings.push(structuredClone(input.surfaces[0].openings[0])); return input; }],
  ["opening reused as opaque surface", (input) => { input.surfaces[1].id = input.surfaces[0].openings[0].id; return input; }],
  ["bridge with unknown parent", (input) => { if (input.thermalBridges.mode === "included") input.thermalBridges.items[0].surfaceId = "absent"; return input; }],
  ["included but empty bridges", (input) => ({ ...input, thermalBridges: { mode: "included", items: [] } })],
  ["excluded bridges without reason", (input) => ({ ...input, thermalBridges: { mode: "excluded", reason: "" } })],
  ["unsafe project identifier", (input) => ({ ...input, projectId: "../other-project" })],
];

for (const [label, mutate] of invalidCases) {
  test(`blocks ${label}`, () => assert.equal(validateRoomStudy(mutate(baseline())).ready, false));
}

test("explicit zero flow, isothermal boundaries and acknowledged bridge exclusions are valid", () => {
  const input = baseline();
  input.airExchange.flow.value = 0;
  input.thermalBridges = { mode: "excluded", reason: "Not modelled in this preliminary scenario." };
  assert.equal(validateRoomStudy(input).ready, true);
});

test("all-glazed parent retains a valid zero net opaque area", () => {
  const input = baseline();
  input.surfaces[0].openings[0].area.value = input.surfaces[0].grossArea.value;
  assert.equal(validateRoomStudy(input).ready, true);
});

// Independent arithmetic oracle for fixtures only. This is not a production
// calculator and is not exported to the application or its agent tools.
function referenceLosses(input: RoomStudyInput) {
  const temperatures = new Map(input.boundaries.map((item) => [item.id, item.temperature.value]));
  function delta(boundaryId: string) {
    const boundary = temperatures.get(boundaryId);
    assert.notEqual(boundary, undefined);
    if (boundary === undefined) throw new Error("Missing boundary");
    return input.indoorTemperature.value - boundary;
  }
  const losses = new Map<string, number>();
  for (const surface of input.surfaces) {
    const net = surface.grossArea.value - surface.openings.reduce((sum, opening) => sum + opening.area.value, 0);
    losses.set(surface.id, net * surface.thermalTransmittance.value * delta(surface.boundaryId));
    for (const opening of surface.openings) losses.set(opening.id, opening.area.value * opening.thermalTransmittance.value * delta(surface.boundaryId));
  }
  if (input.thermalBridges.mode === "included") for (const bridge of input.thermalBridges.items) {
    const parent = input.surfaces.find((surface) => surface.id === bridge.surfaceId);
    assert.ok(parent);
    losses.set(bridge.id, bridge.length.value * bridge.linearTransmittance.value * delta(parent.boundaryId));
  }
  const air = input.airExchange;
  losses.set("air-exchange", air.flow.value / 3600 * air.density.value * air.specificHeat.value * delta(air.boundaryId));
  return losses;
}

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("hand-checked golden contributions and subtotals match independent arithmetic", () => {
  const run = roomStudyRunSchema.parse(fixture("room-run"));
  const losses = referenceLosses(run.inputSnapshot);
  assert.equal(losses.size, run.contributions.length);
  for (const item of run.contributions) {
    const actual = losses.get(item.inputId);
    assert.notEqual(actual, undefined);
    close(actual ?? NaN, item.heatLossW);
    close(item.coefficientWK * item.deltaTK, item.heatLossW);
  }
  const subtotal = (kinds: string[]) => run.contributions.filter((item) => kinds.includes(item.kind)).reduce((sum, item) => sum + item.heatLossW, 0);
  close(subtotal(["opaque", "opening"]), run.totals.transmissionW);
  close(subtotal(["thermal-bridge"]), run.totals.thermalBridgesW);
  close(subtotal(["air-exchange"]), run.totals.airExchangeW);
  close([...losses.values()].reduce((sum, value) => sum + value, 0), 770);
});

test("one shared outdoor temperature change produces the independent 910.5 W case", () => {
  const original = baseline();
  const changed = structuredClone(original);
  changed.revisionId = "revision-2";
  changed.boundaries[0].temperature.value = -10;
  const losses = referenceLosses(roomStudyInputSchema.parse(changed));
  const expected = [72, 84, 37.5, 0, 0, 72, 30, 15, 600];
  [...losses.values()].forEach((value, index) => close(value, expected[index]));
  const total = [...losses.values()].reduce((sum, value) => sum + value, 0);
  close(total, 910.5);
  close(total - 770, 140.5);
  assert.equal(original.boundaries[0].temperature.value, -5);
  assert.equal(original.revisionId, "revision-1");
});

test("run transport rejects nonfinite output, unsupported version and missing trace area", () => {
  const run = roomStudyRunSchema.parse(fixture("room-run"));
  assert.equal(roomStudyRunSchema.safeParse({ ...run, totals: { ...run.totals, heatLossW: Infinity } }).success, false);
  assert.equal(roomStudyRunSchema.safeParse({ ...run, method: { ...run.method, version: "2.0.0" } }).success, false);
  assert.equal(roomStudyRunSchema.safeParse({ ...run, contributions: [{ inputId: "north", kind: "opaque", coefficientWK: 2.4, deltaTK: 25, heatLossW: 60 }] }).success, false);
});

test("run transport rejects missing, duplicate and fabricated contributions", () => {
  const run = roomStudyRunSchema.parse(fixture("room-run"));
  assert.equal(roomStudyRunSchema.safeParse({ ...run, contributions: run.contributions.slice(1) }).success, false);
  assert.equal(roomStudyRunSchema.safeParse({ ...run, contributions: [...run.contributions, run.contributions[0]] }).success, false);
  assert.equal(roomStudyRunSchema.safeParse({ ...run, contributions: run.contributions.map((item, index) => index === 0 ? { ...item, inputId: "unknown" } : item) }).success, false);
});

test("fixture labels retain French UTF-8", () => {
  const input = baseline();
  assert.match(input.room.name, /Pièce/);
  assert.equal(input.surfaces[0].openings[0].name, "Fenêtre nord");
});
