import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CvcRoomStudy } from "./cvc-room-study.js";

async function input() {
  return JSON.parse(await readFile(new URL("../../../../packages/cvc-room-study/tests/fixtures/room-input.v1.json", import.meta.url), "utf8"));
}

test("CVC tools complete the saved study, comparison, export and resumed-session workflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "cvc-tools-"));
  try {
    const approvals: unknown[] = [];
    const context = { directory: root, ask: async (request: unknown) => { approvals.push(request); } };
    const plugin = await CvcRoomStudy({ directory: root });
    const tools = plugin.tool;
    const schema = JSON.parse(await tools.cvc_study_schema.execute());
    expect(schema.schema.properties.indoorTemperature).toBeDefined();
    const missing = JSON.parse(await tools.cvc_revision_save.execute({ projectId: "synthetic-room", input: {}, parentRevisionId: null }, context));
    expect(missing.ready).toBe(false);
    expect(approvals.length).toBe(0);
    expect(await readdir(root)).toEqual([]);
    const baseline = await input();
    const projectId = baseline.projectId;
    await tools.cvc_project_create.execute({ projectId, name: "Pièce synthétique" }, context);
    await tools.cvc_revision_save.execute({ projectId, input: baseline, parentRevisionId: null }, context);
    const first = JSON.parse(await tools.cvc_calculate.execute({ projectId, revisionId: baseline.revisionId }, context));
    expect(first.totals.heatLossW).toBe(770);
    const changed = structuredClone(baseline);
    changed.revisionId = "revision-2";
    changed.boundaries[0].temperature.value = -10;
    await tools.cvc_revision_save.execute({ projectId, input: changed, parentRevisionId: baseline.revisionId }, context);
    const second = JSON.parse(await tools.cvc_calculate.execute({ projectId, revisionId: changed.revisionId }, context));
    const comparison = JSON.parse(await tools.cvc_runs_compare.execute({ projectId, beforeRunId: first.runId, afterRunId: second.runId }, context));
    expect(comparison.totals.delta.heatLossW).toBe(140.5);
    const exported = JSON.parse(await tools.cvc_report_export.execute({ projectId, runId: second.runId }, context));
    const html = await readFile(join(root, exported.relativePath), "utf8");
    expect(html).toContain(second.runId);
    expect(html).toContain("910,5");
    expect(html).toContain("Température intérieure");
    const resumed = await CvcRoomStudy();
    expect(JSON.parse(await resumed.tool.cvc_run_read.execute({ projectId, runId: first.runId }, context))).toEqual(first);
    const study = JSON.parse(await resumed.tool.cvc_project_read.execute({ projectId }, context));
    expect(study.revisions.length).toBe(2);
    expect(study.runs.length).toBe(2);
    expect(approvals.length).toBeGreaterThan(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CVC writes refuse unavailable or denied runtime authorization", async () => {
  const root = await mkdtemp(join(tmpdir(), "cvc-denied-"));
  try {
    const plugin = await CvcRoomStudy({ directory: root });
    const args = { projectId: "example", name: "Example" };
    await expect(plugin.tool.cvc_project_create.execute(args, { directory: root })).rejects.toThrow();
    await expect(plugin.tool.cvc_project_create.execute(args, { directory: root, ask: async () => { throw new Error("denied"); } })).rejects.toThrow("denied");
    expect(await readdir(root)).toEqual([]);
    await expect(plugin.tool.cvc_project_read.execute({ projectId: "../escape" }, { directory: root, ask: async () => {} })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("large successful writes return saved identities instead of a false failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "cvc-large-"));
  try {
    const context = { directory: root, ask: async () => {} };
    const tools = (await CvcRoomStudy()).tool;
    const baseline = await input();
    const template = baseline.surfaces[0];
    for (let index = 0; index < 60; index++) {
      const extra = structuredClone(template);
      extra.id = `extra-${index}`;
      extra.name = "x".repeat(1900);
      extra.openings = [];
      baseline.surfaces.push(extra);
    }
    const projectId = baseline.projectId;
    await tools.cvc_project_create.execute({ projectId, name: "Large synthetic study" }, context);
    const revision = JSON.parse(await tools.cvc_revision_save.execute({ projectId, input: baseline, parentRevisionId: null }, context));
    expect(revision.truncated).toBe(true);
    expect(revision.revisionId).toBe(baseline.revisionId);
    const run = JSON.parse(await tools.cvc_calculate.execute({ projectId, revisionId: baseline.revisionId }, context));
    expect(run.truncated).toBe(true);
    expect(typeof run.runId).toBe("string");
    const report = JSON.parse(await tools.cvc_report_export.execute({ projectId, runId: run.runId }, context));
    expect(await readFile(join(root, report.relativePath), "utf8")).toContain(run.runId);
  } finally { await rm(root, { recursive: true, force: true }); }
});
