import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, realpath, unlink } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { calculateRoomStudy } from "./calculator.ts";
import { roomStudyInputSchema, roomStudyRunSchema, type RoomStudyInput } from "./index.ts";
import { verifySavedRun } from "./run-verification.ts";
import { compareRoomStudyRuns, renderRoomStudyHtml } from "./report.ts";

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const MAX_RECORD_BYTES = 32 * 1024 * 1024;
const projectSchema = z.strictObject({
  schemaVersion: z.literal(1), projectId: identifier,
  name: z.string().trim().min(1).max(200), createdAt: z.iso.datetime(),
});
const revisionContentSchema = z.strictObject({
  schemaVersion: z.literal(1), createdAt: z.iso.datetime(),
  parentRevisionId: identifier.nullable(), input: roomStudyInputSchema, inputHash: hash,
});
const revisionSchema = revisionContentSchema.extend({ revisionHash: hash });
const storedRunSchema = z.strictObject({
  schemaVersion: z.literal(1), revisionHash: hash, runHash: hash, run: roomStudyRunSchema,
});

// Schema parsing fixes field order before this checksum is calculated.
function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function assertDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Répertoire CVC non sûr ou invalide.");
}

async function ensureChild(parent: string, name: string, create: boolean): Promise<string> {
  await assertDirectory(parent);
  const path = join(parent, name);
  if (create) {
    try { await mkdir(path); } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
  }
  await assertDirectory(path);
  return path;
}

async function readRecord(path: string): Promise<unknown> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_RECORD_BYTES) throw new Error("Fichier CVC non sûr ou trop volumineux.");
  // The caller controls only validated IDs; paths never come from the model.
  const data = await readFile(path);
  if (data.byteLength > MAX_RECORD_BYTES) throw new Error("Fichier CVC trop volumineux.");
  return JSON.parse(data.toString("utf8"));
}

/** Publish a complete file exclusively. link() fails if the destination exists;
 * readers never see a partially written final record. Requires a filesystem
 * supporting hard links (including NTFS); no unsafe overwrite fallback.
 */
async function writeTextOnce(directory: string, filename: string, content: string): Promise<void> {
  await assertDirectory(directory);
  const bytes = Buffer.from(content, "utf8");
  if (bytes.byteLength > MAX_RECORD_BYTES) throw new Error("Enregistrement CVC trop volumineux.");
  const temporary = join(directory, `.pending-${randomUUID()}`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally { await handle.close(); }
    await assertDirectory(directory);
    await link(temporary, join(directory, filename));
  } finally { await unlink(temporary).catch(() => undefined); }
}

async function writeOnce(directory: string, filename: string, value: unknown): Promise<void> {
  return writeTextOnce(directory, filename, `${JSON.stringify(value, null, 2)}\n`);
}

/** Project-scoped append-only records; selected workspace is an explicit host
 * authority, never a tool-supplied path. Static symlinks/junctions are refused.
 * This is not a sandbox against another process racing filesystem mutations.
 */
export async function openRoomStudyStore(workspace: string) {
  const root = await realpath(workspace);
  await assertDirectory(root);
  async function projects(create: boolean) {
    const cvc = await ensureChild(root, ".cvc", create);
    return ensureChild(cvc, "projects", create);
  }
  async function projectPath(projectId: string, create = false) {
    const id = identifier.parse(projectId);
    return ensureChild(await projects(create), id, create);
  }
  async function readProject(projectId: string) {
    const data = projectSchema.parse(await readRecord(join(await projectPath(projectId), "project.json")));
    if (data.projectId !== projectId) throw new Error("Le projet ne correspond pas à son dossier.");
    return data;
  }
  async function records(projectId: string, collection: "revisions" | "runs", create = false) {
    await readProject(projectId);
    return ensureChild(await projectPath(projectId), collection, create);
  }
  async function readRevision(projectId: string, revisionId: string) {
    const id = identifier.parse(revisionId);
    const data = revisionSchema.parse(await readRecord(join(await records(projectId, "revisions"), `${id}.json`)));
    if (data.input.projectId !== projectId || data.input.revisionId !== revisionId || data.inputHash !== checksum(data.input)) throw new Error("Révision CVC incohérente ou altérée.");
    const { revisionHash, ...content } = data;
    if (revisionHash !== checksum(content)) throw new Error("Métadonnées de révision altérées.");
    return data;
  }
  async function readRun(projectId: string, runId: string) {
    const id = identifier.parse(runId);
    const data = storedRunSchema.parse(await readRecord(join(await records(projectId, "runs"), `${id}.json`)));
    if (data.run.runId !== runId || data.run.inputSnapshot.projectId !== projectId || data.runHash !== checksum(data.run)) throw new Error("Calcul CVC incohérent ou altéré.");
    const revision = await readRevision(projectId, data.run.inputSnapshot.revisionId);
    if (data.revisionHash !== revision.revisionHash || !isDeepStrictEqual(revision.input, data.run.inputSnapshot)) throw new Error("Le calcul ne correspond pas à la révision enregistrée.");
    return verifySavedRun(data.run);
  }
  async function listIds(projectId: string, collection: "revisions" | "runs") {
    let path: string;
    try { path = await records(projectId, collection); } catch (error) {
      // An existing project with no collection has no records yet.
      await readProject(projectId);
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
    return (await readdir(path)).filter((name) => name.endsWith(".json")).map((name) => identifier.parse(name.slice(0, -5))).sort();
  }
  return {
    async createProject(projectId: string, name: string) {
      const project = projectSchema.parse({ schemaVersion: 1, projectId, name, createdAt: new Date().toISOString() });
      await writeOnce(await projectPath(projectId, true), "project.json", project);
      return project;
    },
    readProject,
    async listProjects() {
      let path: string;
      try { path = await projects(false); } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
        throw error;
      }
      const items = await readdir(path, { withFileTypes: true });
      const output = [];
      for (const item of items) {
        if (item.isSymbolicLink()) throw new Error("Lien de projet interdit.");
        if (item.isDirectory()) output.push(await readProject(identifier.parse(item.name)));
      }
      return output.sort((a, b) => a.projectId.localeCompare(b.projectId));
    },
    async saveRevision(projectId: string, candidate: unknown, parentRevisionId: string | null = null) {
      const input: RoomStudyInput = roomStudyInputSchema.parse(candidate);
      if (input.projectId !== projectId) throw new Error("La révision appartient à un autre projet.");
      if (parentRevisionId !== null) {
        const parent = await readRevision(projectId, parentRevisionId);
        if (parent.input.room.id !== input.room.id) throw new Error("La révision parente concerne une autre pièce.");
      }
      const content = revisionContentSchema.parse({ schemaVersion: 1, createdAt: new Date().toISOString(), parentRevisionId, input, inputHash: checksum(input) });
      const revision = revisionSchema.parse({ ...content, revisionHash: checksum(content) });
      await writeOnce(await records(projectId, "revisions", true), `${input.revisionId}.json`, revision);
      return revision;
    },
    readRevision,
    async listRevisions(projectId: string) {
      return Promise.all((await listIds(projectId, "revisions")).map((id) => readRevision(projectId, id)));
    },
    async calculate(projectId: string, revisionId: string) {
      const revision = await readRevision(projectId, revisionId);
      const run = calculateRoomStudy(revision.input, { runId: randomUUID(), createdAt: new Date().toISOString() });
      const saved = storedRunSchema.parse({ schemaVersion: 1, revisionHash: revision.revisionHash, runHash: checksum(run), run });
      await writeOnce(await records(projectId, "runs", true), `${run.runId}.json`, saved);
      return run;
    },
    readRun,
    async compareRuns(projectId: string, beforeRunId: string, afterRunId: string) {
      return compareRoomStudyRuns(await readRun(projectId, beforeRunId), await readRun(projectId, afterRunId));
    },
    async exportReport(projectId: string, runId: string) {
      const run = await readRun(projectId, runId);
      const html = renderRoomStudyHtml(run);
      const directory = await ensureChild(await projectPath(projectId), "exports", true);
      const filename = `${run.runId}-${randomUUID()}.html`;
      await writeTextOnce(directory, filename, html);
      return { runId: run.runId, revisionId: run.inputSnapshot.revisionId, relativePath: `.cvc/projects/${projectId}/exports/${filename}`, sha256: createHash("sha256").update(html).digest("hex") };
    },
    async listRuns(projectId: string) {
      return Promise.all((await listIds(projectId, "runs")).map((id) => readRun(projectId, id)));
    },
  };
}
