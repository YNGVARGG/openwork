import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openRoomStudyStore } from "../src/store.ts";
import { roomStudyInputSchema } from "../src/index.ts";
import { verifySavedRun } from "../src/run-verification.ts";

async function fixture() {
  return roomStudyInputSchema.parse(JSON.parse(await readFile(new URL("./fixtures/room-input.v1.json", import.meta.url), "utf8")));
}

test("complete saved study survives reopening, preserves both revisions and runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "cvc-store-"));
  try {
    const first = await openRoomStudyStore(root);
    assert.deepEqual(await first.listProjects(), []);
    const original = await fixture();
    await first.createProject(original.projectId, "Étude de référence");
    assert.deepEqual(await first.listRuns(original.projectId), []);
    await first.saveRevision(original.projectId, original);
    const run1 = await first.calculate(original.projectId, original.revisionId);
    const revision = structuredClone(original);
    revision.revisionId = "revision-2";
    revision.boundaries[0].temperature.value = -10;
    await first.saveRevision(original.projectId, revision, original.revisionId);
    const run2 = await first.calculate(original.projectId, revision.revisionId);
    const reopened = await openRoomStudyStore(root);
    assert.deepEqual(await reopened.readRun(original.projectId, run1.runId), run1);
    assert.deepEqual(await reopened.readRun(original.projectId, run2.runId), run2);
    assert.equal(run1.totals.heatLossW, 770);
    assert.equal(run2.totals.heatLossW, 910.5);
    assert.equal((await reopened.listProjects())[0].name, "Étude de référence");
    assert.equal((await reopened.listRevisions(original.projectId)).length, 2);
    assert.equal((await reopened.listRuns(original.projectId)).length, 2);
    assert.equal((await reopened.readRevision(original.projectId, original.revisionId)).input.boundaries[0].temperature.value, -5);
    assert.equal((await reopened.readRevision(original.projectId, revision.revisionId)).parentRevisionId, original.revisionId);
    const comparison = await reopened.compareRuns(original.projectId, run1.runId, run2.runId);
    assert.equal(comparison.totals.delta.heatLossW, 140.5);
    const report1 = await reopened.exportReport(original.projectId, run1.runId);
    const html1 = await readFile(join(root, report1.relativePath), "utf8");
    assert.ok(html1.includes(run1.runId));
    assert.ok(html1.includes("770"));
    const report2 = await reopened.exportReport(original.projectId, run2.runId);
    assert.notEqual(report1.relativePath, report2.relativePath);
    assert.equal(await readFile(join(root, report1.relativePath), "utf8"), html1);
    assert.equal(createHash("sha256").update(html1).digest("hex"), report1.sha256);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("concurrent writes cannot overwrite a project or revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "cvc-exclusive-"));
  try {
    const store = await openRoomStudyStore(root);
    const input = await fixture();
    await store.createProject(input.projectId, "Original");
    await assert.rejects(store.createProject(input.projectId, "Replacement"));
    const changed = structuredClone(input);
    changed.indoorTemperature.value = 21;
    const attempts = await Promise.allSettled([store.saveRevision(input.projectId, input), store.saveRevision(input.projectId, changed)]);
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
    assert.equal((await store.readProject(input.projectId)).name, "Original");
    assert.equal((await readdir(join(root, ".cvc", "projects", input.projectId, "revisions"))).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cross-project reads, forged associations, missing parents and path escape fail", async () => {
  const root = await mkdtemp(join(tmpdir(), "cvc-boundary-"));
  try {
    const store = await openRoomStudyStore(root);
    const input = await fixture();
    await store.createProject(input.projectId, "One");
    await store.createProject("other", "Two");
    await assert.rejects(store.saveRevision("other", input));
    await assert.rejects(store.saveRevision(input.projectId, input, "absent"));
    await assert.rejects(store.readProject("../other"));
    await assert.rejects(store.readRun(input.projectId, "../run"));
    await store.saveRevision(input.projectId, input);
    const run = await store.calculate(input.projectId, input.revisionId);
    await assert.rejects(store.readRun("other", run.runId));
    const next = structuredClone(input);
    next.revisionId = "revision-2";
    next.room.id = "other-room";
    await assert.rejects(store.saveRevision(input.projectId, next, input.revisionId));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("checksums and recomputation reject modified values even with a rewritten checksum", async () => {
  const root = await mkdtemp(join(tmpdir(), "cvc-integrity-"));
  try {
    const store = await openRoomStudyStore(root);
    const input = await fixture();
    await store.createProject(input.projectId, "One");
    await store.saveRevision(input.projectId, input);
    const run = await store.calculate(input.projectId, input.revisionId);
    const tampered = structuredClone(run);
    tampered.totals.heatLossW = 1;
    assert.throws(() => verifySavedRun(tampered));
    const path = join(root, ".cvc", "projects", input.projectId, "runs", `${run.runId}.json`);
    const record = JSON.parse(await readFile(path, "utf8"));
    record.run.totals.heatLossW = 1;
    record.runHash = createHash("sha256").update(JSON.stringify(record.run)).digest("hex");
    await writeFile(path, JSON.stringify(record));
    await assert.rejects(store.readRun(input.projectId, run.runId));
    await assert.rejects(store.exportReport(input.projectId, run.runId));
    const revisionPath = join(root, ".cvc", "projects", input.projectId, "revisions", `${input.revisionId}.json`);
    const revision = JSON.parse(await readFile(revisionPath, "utf8"));
    revision.parentRevisionId = "forged-parent";
    await writeFile(revisionPath, JSON.stringify(revision));
    await assert.rejects(store.readRevision(input.projectId, input.revisionId));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("preexisting symlink or Windows junction cannot redirect CVC storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "cvc-links-"));
  const outside = await mkdtemp(join(tmpdir(), "cvc-outside-"));
  try {
    await symlink(outside, join(root, ".cvc"), process.platform === "win32" ? "junction" : "dir");
    const store = await openRoomStudyStore(root);
    await assert.rejects(store.createProject("example", "Example"));
    await assert.rejects(store.listProjects());
    assert.deepEqual(await readdir(outside), []);
  } finally {
    // rm removes the link itself, never the external directory's contents.
    await rm(join(root, ".cvc"), { force: true });
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
