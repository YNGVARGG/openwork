import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { roomStudyInputSchema, roomStudyRunSchema } from "@cvc/room-study";
import { openRoomStudyStore } from "@cvc/room-study/store";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

const clientToken = "owt_cvc_study_client";
const hostToken = "owt_cvc_study_host";
const stops: Array<() => void | Promise<void>> = [];
const roots: string[] = [];
const priorDataDir = process.env.OPENWORK_DATA_DIR;
const priorTokenStore = process.env.OPENWORK_TOKEN_STORE;
const priorCvcEnabled = process.env.OPENWORK_CVC_ENABLED;

const studySchema = z.object({
  project: z.object({ projectId: z.string() }),
  revisions: z.array(z.object({ parentRevisionId: z.string().nullable() })),
  runs: z.array(roomStudyRunSchema),
});
const temperatureResultSchema = z.object({ run: roomStudyRunSchema, comparison: z.unknown().nullable() });

async function createRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function startOpenworkServer(workspaceRoot: string, readOnly = false): Promise<string> {
  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    configPath: join(workspaceRoot, "server.json"),
    token: clientToken,
    hostToken,
    approval: { mode: "auto", timeoutMs: 1_000 },
    corsOrigins: ["*"],
    workspaces: [{ id: "ws_1", name: "Workspace", path: workspaceRoot, preset: "starter", workspaceType: "local" }],
    authorizedRoots: [workspaceRoot],
    readOnly,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  };
  const server = await startServer(config);
  stops.push(() => server.stop());
  return `http://127.0.0.1:${server.port}`;
}

function clientAuth() {
  return { authorization: `Bearer ${clientToken}`, "content-type": "application/json" };
}

async function seedStudy(root: string) {
  const input = roomStudyInputSchema.parse(JSON.parse(await readFile(new URL("../../../packages/cvc-room-study/tests/fixtures/room-input.v1.json", import.meta.url), "utf8")));
  const store = await openRoomStudyStore(root);
  await store.createProject(input.projectId, "Étude de référence");
  await store.saveRevision(input.projectId, input);
  const run = await store.calculate(input.projectId, input.revisionId);
  return { input, run };
}

beforeEach(async () => {
  const envRoot = await createRoot("openwork-cvc-study-env-");
  process.env.OPENWORK_DATA_DIR = join(envRoot, "data");
  process.env.OPENWORK_TOKEN_STORE = join(envRoot, "tokens.json");
  process.env.OPENWORK_CVC_ENABLED = "1";
});

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
  if (priorDataDir === undefined) delete process.env.OPENWORK_DATA_DIR;
  else process.env.OPENWORK_DATA_DIR = priorDataDir;
  if (priorTokenStore === undefined) delete process.env.OPENWORK_TOKEN_STORE;
  else process.env.OPENWORK_TOKEN_STORE = priorTokenStore;
  if (priorCvcEnabled === undefined) delete process.env.OPENWORK_CVC_ENABLED;
  else process.env.OPENWORK_CVC_ENABLED = priorCvcEnabled;
});

describe("CVC study routes", () => {
  test("reads verified records, creates an immutable temperature revision, compares it, and renders its note", async () => {
    const root = resolve(await createRoot("openwork-cvc-study-"));
    const { input, run: sourceRun } = await seedStudy(root);
    const base = await startOpenworkServer(root);

    const studyResponse = await fetch(`${base}/workspace/ws_1/cvc/studies/${input.projectId}`, { headers: clientAuth() });
    expect(studyResponse.status).toBe(200);
    const study = studySchema.parse(await studyResponse.json());
    expect(study.project.projectId).toBe(input.projectId);
    expect(study.revisions).toHaveLength(1);
    expect(study.runs.map((item) => item.runId)).toEqual([sourceRun.runId]);
    expect(sourceRun.totals.heatLossW).toBe(770);

    const changedResponse = await fetch(`${base}/workspace/ws_1/cvc/studies/${input.projectId}/temperature`, {
      method: "POST",
      headers: clientAuth(),
      body: JSON.stringify({
        revisionId: input.revisionId,
        boundaryId: "exteriorAir",
        temperature: -10,
        provenanceDetail: "Measured design outdoor temperature.",
      }),
    });
    expect(changedResponse.status).toBe(200);
    const changed = temperatureResultSchema.parse(await changedResponse.json());
    expect(changed.run.inputSnapshot.revisionId).not.toBe(input.revisionId);
    expect(changed.run.totals.heatLossW).toBe(910.5);
    expect(changed.run.inputSnapshot.boundaries.find((item) => item.id === "exteriorAir")?.temperature).toEqual({
      value: -10,
      unit: "degC",
      provenance: { kind: "supplied", detail: "Measured design outdoor temperature." },
    });
    expect(changed.comparison).toMatchObject({
      before: { runId: sourceRun.runId },
      after: { runId: changed.run.runId },
      totals: { before: { heatLossW: 770 }, after: { heatLossW: 910.5 }, delta: { heatLossW: 140.5 } },
    });

    const noteResponse = await fetch(`${base}/workspace/ws_1/cvc/studies/${input.projectId}/runs/${changed.run.runId}/note`, { headers: clientAuth() });
    expect(noteResponse.status).toBe(200);
    await expect(noteResponse.json()).resolves.toMatchObject({ html: expect.stringContaining(changed.run.runId) });

    const stored = await (await openRoomStudyStore(root)).readRevision(input.projectId, changed.run.inputSnapshot.revisionId);
    expect(stored.parentRevisionId).toBe(input.revisionId);

    await stops.pop()?.();
    const restartedBase = await startOpenworkServer(root);
    const restartedResponse = await fetch(`${restartedBase}/workspace/ws_1/cvc/studies/${input.projectId}`, { headers: clientAuth() });
    expect(restartedResponse.status).toBe(200);
    const restarted = studySchema.parse(await restartedResponse.json());
    expect(restarted.revisions).toHaveLength(2);
    expect(restarted.runs.map((item) => item.totals.heatLossW).sort((left, right) => left - right)).toEqual([770, 910.5]);
  });

  test("rejects study changes while the server is read-only", async () => {
    const root = resolve(await createRoot("openwork-cvc-study-read-only-"));
    const { input } = await seedStudy(root);
    const base = await startOpenworkServer(root, true);

    const response = await fetch(`${base}/workspace/ws_1/cvc/studies/${input.projectId}/temperature`, {
      method: "POST",
      headers: clientAuth(),
      body: JSON.stringify({ revisionId: input.revisionId, boundaryId: "exteriorAir", temperature: -10, provenanceDetail: "Measured." }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "read_only" });
  });

  test("hides CVC routes until CVC is enabled", async () => {
    const root = resolve(await createRoot("openwork-cvc-study-disabled-"));
    const { input } = await seedStudy(root);
    const base = await startOpenworkServer(root);
    delete process.env.OPENWORK_CVC_ENABLED;

    const response = await fetch(`${base}/workspace/ws_1/cvc/studies/${input.projectId}`, { headers: clientAuth() });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "not_found" });
  });

  test("requires authentication before reading a CVC study", async () => {
    const root = resolve(await createRoot("openwork-cvc-study-auth-"));
    const { input } = await seedStudy(root);
    const base = await startOpenworkServer(root);

    const response = await fetch(`${base}/workspace/ws_1/cvc/studies/${input.projectId}`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "unauthorized" });
  });

  test("does not save a revision when a boundary is missing or becomes warmer than the room", async () => {
    const root = resolve(await createRoot("openwork-cvc-study-invalid-"));
    const { input } = await seedStudy(root);
    const base = await startOpenworkServer(root);
    const endpoint = `${base}/workspace/ws_1/cvc/studies/${input.projectId}/temperature`;

    const missingBoundary = await fetch(endpoint, {
      method: "POST",
      headers: clientAuth(),
      body: JSON.stringify({ revisionId: input.revisionId, boundaryId: "missing", temperature: -10, provenanceDetail: "Measured." }),
    });
    expect(missingBoundary.status).toBe(404);
    await expect(missingBoundary.json()).resolves.toMatchObject({ code: "cvc_boundary_not_found" });

    const warmerBoundary = await fetch(endpoint, {
      method: "POST",
      headers: clientAuth(),
      body: JSON.stringify({ revisionId: input.revisionId, boundaryId: "exteriorAir", temperature: 21, provenanceDetail: "Measured." }),
    });
    expect(warmerBoundary.status).toBe(400);

    const overflowingCalculation = await fetch(endpoint, {
      method: "POST",
      headers: clientAuth(),
      body: JSON.stringify({ revisionId: input.revisionId, boundaryId: "exteriorAir", temperature: -Number.MAX_VALUE, provenanceDetail: "Extreme test input." }),
    });
    expect(overflowingCalculation.status).toBe(400);

    const store = await openRoomStudyStore(root);
    expect(await store.listRevisions(input.projectId)).toHaveLength(1);
    expect(await store.listRuns(input.projectId)).toHaveLength(1);
  });

  test("rejects an altered saved run even when its stored hash is rewritten", async () => {
    const root = resolve(await createRoot("openwork-cvc-study-altered-"));
    const { input, run } = await seedStudy(root);
    const path = join(root, ".cvc", "projects", input.projectId, "runs", `${run.runId}.json`);
    const stored = z.object({ run: roomStudyRunSchema, runHash: z.string() }).passthrough().parse(
      JSON.parse(await readFile(path, "utf8")),
    );
    stored.run.totals.heatLossW = 1;
    stored.runHash = createHash("sha256").update(JSON.stringify(stored.run)).digest("hex");
    await writeFile(path, JSON.stringify(stored), "utf8");
    const base = await startOpenworkServer(root);

    const response = await fetch(`${base}/workspace/ws_1/cvc/studies/${input.projectId}`, { headers: clientAuth() });
    expect(response.status).toBe(500);
  });
});
