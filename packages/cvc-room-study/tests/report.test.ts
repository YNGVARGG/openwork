import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateRoomStudy } from "../src/calculator.ts";
import { roomStudyInputSchema } from "../src/index.ts";
import { compareRoomStudyRuns, renderRoomStudyHtml } from "../src/report.ts";

const identity = { runId: "report-run-1", createdAt: "2026-09-26T12:00:00Z" };

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

function input() {
  return roomStudyInputSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/room-input.v1.json", import.meta.url), "utf8")));
}

function productionRun(candidate: unknown, runId = identity.runId) {
  return calculateRoomStudy(candidate, { ...identity, runId });
}

test("renders a verified, self-contained French calculation note", () => {
  const html = renderRoomStudyHtml(productionRun(input()));
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /lang="fr"/);
  assert.match(html, /Note de calcul/);
  assert.match(html, /770 W/);
  assert.match(html, /257.5 W/);
  assert.match(html, /Provenance/);
  assert.match(html, /Ponts thermiques/);
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("https://"), false);
});

test("escapes input names, provenance, warnings, and exclusion reasons", () => {
  const source = input();
  source.room.name = "<img src=x onerror=alert(1)>";
  source.envelopeDescription = "<b>Enveloppe</b>";
  source.surfaces[0].name = "<svg onload=alert(1)>";
  source.surfaces[0].openings[0].name = "<iframe src=bad>";
  source.surfaces[0].grossArea.provenance.detail = "<em>source</em>";
  source.thermalBridges = { mode: "excluded", reason: "<script>alert(1)</script>" };

  const html = renderRoomStudyHtml(productionRun(source));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;Enveloppe&lt;\/b&gt;/);
  assert.match(html, /&lt;svg onload=alert\(1\)&gt;/);
  assert.match(html, /&lt;iframe src=bad&gt;/);
  assert.match(html, /&lt;em&gt;source&lt;\/em&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("<img src=x"), false);
});

test("compares verified revisions with each changed contribution and total delta", () => {
  const firstInput = input();
  const secondInput = structuredClone(firstInput);
  const exterior = secondInput.boundaries.find((boundary) => boundary.id === "exteriorAir");
  if (!exterior) throw new Error("Fixture missing exteriorAir");
  exterior.temperature.value = -10;
  const before = productionRun(firstInput, "comparison-before");
  const after = productionRun(secondInput, "comparison-after");

  const comparison = compareRoomStudyRuns(before, after);
  assert.equal(comparison.before.runId, "comparison-before");
  assert.equal(comparison.after.runId, "comparison-after");
  assert.equal(comparison.totals.before.heatLossW, 770);
  assert.equal(comparison.totals.after.heatLossW, 910.5);
  assert.equal(comparison.totals.delta.heatLossW, 140.5);
  assert.deepEqual(
    comparison.contributions.map((contribution) => [contribution.kind, contribution.inputId]),
    [
      ["air-exchange", "air-exchange"],
      ["opaque", "ceiling"],
      ["opaque", "north"],
      ["opening", "north-window"],
      ["thermal-bridge", "north-bridge"],
    ],
  );
  const expectedDeltas = [100, 12, 12, 14, 2.5];
  comparison.contributions.forEach((contribution, index) => close(contribution.deltaHeatLossW, expectedDeltas[index]));
});

test("reports added and removed verified contributions", () => {
  const included = input();
  const excluded = input();
  excluded.thermalBridges = { mode: "excluded", reason: "No bridge data." };

  const withoutBridge = productionRun(excluded, "without-bridge");
  const withBridge = productionRun(included, "with-bridge");
  const added = compareRoomStudyRuns(withoutBridge, withBridge).contributions;
  assert.deepEqual(added, [{
    kind: "thermal-bridge",
    inputId: "north-bridge",
    change: "added",
    beforeHeatLossW: null,
    afterHeatLossW: 12.5,
    deltaHeatLossW: 12.5,
  }]);

  const removed = compareRoomStudyRuns(withBridge, withoutBridge).contributions;
  assert.deepEqual(removed, [{
    kind: "thermal-bridge",
    inputId: "north-bridge",
    change: "removed",
    beforeHeatLossW: 12.5,
    afterHeatLossW: null,
    deltaHeatLossW: -12.5,
  }]);
});

test("rejects tampered runs and comparisons across projects", () => {
  const valid = productionRun(input());
  const tampered = structuredClone(valid);
  tampered.totals.heatLossW = 771;
  assert.throws(() => renderRoomStudyHtml(tampered));

  const otherProjectInput = input();
  otherProjectInput.projectId = "other-project";
  const otherProject = productionRun(otherProjectInput, "other-project-run");
  assert.throws(() => compareRoomStudyRuns(valid, otherProject));
});
