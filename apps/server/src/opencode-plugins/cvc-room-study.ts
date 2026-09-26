import { z } from "zod";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { openWorkspaceFileForReading } from "./workspace-file-identity.js";
import { roomStudyInputSchema, validateRoomStudy } from "@cvc/room-study";
import { openRoomStudyStore } from "@cvc/room-study/store";
import { appendAgentInstructions, createInstructionSection } from "./agent-instruction-compose.js";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const projectArgs = z.strictObject({ projectId: id });
const revisionArgs = z.strictObject({ projectId: id, revisionId: id });
const runArgs = z.strictObject({ projectId: id, runId: id });
const createArgs = z.strictObject({ projectId: id, name: z.string().min(1).max(200) });
const saveArgs = z.strictObject({ projectId: id, input: z.unknown(), parentRevisionId: id.optional().describe("Omettre pour la première révision ; sinon identifiant de la révision parente existante.") });
const importArgs = z.strictObject({ projectId: id, relativePath: z.string().min(1).max(1000), parentRevisionId: id.optional() });
const compareArgs = z.strictObject({ projectId: id, beforeRunId: id, afterRunId: id });

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function directory(value: unknown): string | undefined {
  const source = record(value) && record(value.context) ? value.context : value;
  return record(source) && typeof source.directory === "string" && source.directory.trim() ? source.directory : undefined;
}
function output(value: unknown): string {
  const text = JSON.stringify(value);
  if (text.length > 80_000) {
    // A successful write must never be reported as failed just because its echo is large.
    if (record(value) && typeof value.runId === "string") return JSON.stringify({ runId: value.runId, totals: value.totals, truncated: true, nextAction: "Exporter la note avec cvc_report_export pour lire toutes les contributions." });
    if (record(value) && record(value.input) && typeof value.input.revisionId === "string") return JSON.stringify({ revisionId: value.input.revisionId, projectId: value.input.projectId, revisionHash: value.revisionHash, truncated: true, nextAction: "La révision est sauvegardée ; consulter le fichier du projet pour toutes les données." });
    throw new Error("Résultat trop volumineux pour la conversation ; utilisez la note exportée ou ouvrez le fichier du projet.");
  }
  return text;
}
async function authorize(context: unknown, permission: "read" | "edit", projectId: string | null) {
  if (!record(context) || typeof context.ask !== "function") throw new Error("Le contrôle d'accès de la session est indisponible.");
  await context.ask({ permission, patterns: [projectId ? `.cvc/projects/${projectId}/**` : ".cvc/projects/**"], always: [], metadata: { action: permission === "edit" ? "Enregistrer l'étude CVC" : "Lire l'étude CVC", projectId } });
}

// Exactly one export: OpenCode treats exported functions as plugin factories.
export const CvcRoomStudy = async (factoryInput?: unknown) => {
  async function store(context: unknown, permission: "read" | "edit", projectId: string | null) {
    const root = directory(context) ?? directory(factoryInput);
    if (!root) throw new Error("Ouvrez un dossier de projet avant d'utiliser les outils CVC.");
    await authorize(context, permission, projectId);
    return openRoomStudyStore(root);
  }
  return {
    "experimental.chat.system.transform": async (_input: unknown, result: { system: string[] }) => {
      appendAgentInstructions(result.system, createInstructionSection("cvc-room-study", `## Étude CVC d'une pièce
Répondez en français dès le premier message pour cette étude. Si les données existent dans un fichier JSON du dossier actif, utilisez cvc_revision_import avec son chemin relatif : ne recopiez jamais le gros objet dans cvc_revision_save. Omettez parentRevisionId pour la première révision ; ne fournissez ni null ni parent fictif. Réutilisez un projet déjà créé. Après deux erreurs identiques, arrêtez les tentatives et expliquez le blocage sans déléguer des répétitions. Utilisez cvc_study_schema pour connaître les données requises ; demandez les valeurs manquantes sans inventer de température, U, débit ou propriété de l'air. Enregistrez la provenance de chaque donnée. Présentez les hypothèses à l'utilisateur. cvc_revision_save valide avant toute écriture et renvoie les champs à corriger.
Les parois portent des aires brutes ; leurs ouvertures sont imbriquées et déduites une seule fois. Les limites sont des conditions nommées ; les ouvertures et ponts héritent de leur paroi. Le débit est le débit extérieur total déclaré sans récupération. Exclure les ponts exige un motif explicite.
Créez un projet, enregistrez une révision complète avec un nouvel identifiant, puis appelez cvc_calculate. Seuls les outils de calcul produisent les nombres ; ne calculez pas les résultats dans le texte ou via un script. Citez toujours l'identifiant du calcul sauvegardé. Cette méthode préliminaire ne certifie aucune conformité et ne sélectionne aucun équipement.
Pour une modification, lisez la révision précédente, enregistrez une nouvelle révision avec parentRevisionId puis calculez et comparez les deux calculs. Pour reprendre un projet dans une autre conversation, utilisez cvc_project_list, cvc_project_read et cvc_run_read. Pour livrer une note, utilisez cvc_report_export et proposez le lien relatif retourné ; ne prétendez pas avoir exporté avant sa réussite. Les anciens calculs ne doivent jamais être écrasés.`));
    },
    tool: {
      cvc_study_schema: {
        description: "Lire le schéma et les unités nécessaires à une étude préliminaire de déperditions hivernales d'une pièce.", args: {},
        async execute() { return output({ schema: z.toJSONSchema(roomStudyInputSchema), note: "Aucune valeur climatique ou constructive par défaut. Identifiants nouveaux pour chaque révision ; unités littérales et provenance obligatoires." }); },
      },
      cvc_project_list: {
        description: "Retrouver les études CVC du dossier actif.", args: {},
        async execute(_args: unknown, context?: unknown) { return output(await (await store(context, "read", null)).listProjects()); },
      },
      cvc_project_create: {
        description: "Créer une étude CVC locale sans écraser une étude existante.", args: createArgs.shape,
        async execute(raw: unknown, context?: unknown) { const args = createArgs.parse(raw); return output(await (await store(context, "edit", args.projectId)).createProject(args.projectId, args.name)); },
      },
      cvc_project_read: {
        description: "Lire l'identité d'une étude et retrouver ses révisions et calculs sauvegardés.", args: projectArgs.shape,
        async execute(raw: unknown, context?: unknown) {
          const args = projectArgs.parse(raw); const service = await store(context, "read", args.projectId);
          return output({ project: await service.readProject(args.projectId), revisions: (await service.listRevisions(args.projectId)).map((revision) => ({ revisionId: revision.input.revisionId, parentRevisionId: revision.parentRevisionId, createdAt: revision.createdAt })), runs: (await service.listRuns(args.projectId)).map((run) => ({ runId: run.runId, revisionId: run.inputSnapshot.revisionId, createdAt: run.createdAt, totals: run.totals })) });
        },
      },
      cvc_revision_read: {
        description: "Lire les données et leur provenance pour une révision sauvegardée.", args: revisionArgs.shape,
        async execute(raw: unknown, context?: unknown) { const args = revisionArgs.parse(raw); return output(await (await store(context, "read", args.projectId)).readRevision(args.projectId, args.revisionId)); },
      },
      cvc_revision_import: {
        description: "Importer directement un fichier JSON du dossier actif comme révision, sans retranscription. Omettre parentRevisionId pour la première révision. Le projet doit déjà exister.", args: importArgs.shape,
        async execute(raw: unknown, context?: unknown) {
          const args = importArgs.parse(raw);
          const workspace = directory(context) ?? directory(factoryInput);
          if (!workspace) throw new Error("Ouvrez un dossier de projet avant d'importer.");
          const root = await realpath(workspace);
          const path = resolve(root, args.relativePath);
          const rel = relative(root, path);
          if (isAbsolute(args.relativePath) || args.relativePath.includes(":") || !rel || rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute(rel) || !path.toLowerCase().endsWith(".json")) throw new Error("Choisissez un fichier JSON dans le dossier actif, avec un chemin relatif.");
          if (!record(context) || typeof context.ask !== "function") throw new Error("Le contrôle d'accès de la session est indisponible.");
          await context.ask({ permission: "read", patterns: [rel.replaceAll("\\", "/")], always: [], metadata: { action: "Importer les données CVC", relativePath: rel } });
          const opened = await openWorkspaceFileForReading(root, path, "Fichier CVC");
          let candidate: unknown;
          try {
            const limit = 32 * 1024 * 1024;
            if (opened.info.size > limit) throw new Error("Fichier CVC trop volumineux.");
            const buffer = Buffer.alloc(opened.info.size + 1);
            let count = 0;
            while (count < buffer.length) {
              const part = await opened.handle.read(buffer, count, buffer.length - count, count);
              if (!part.bytesRead) break;
              count += part.bytesRead;
            }
            if (count > opened.info.size) throw new Error("Le fichier a changé pendant l'import ; réessayez.");
            candidate = JSON.parse(buffer.subarray(0, count).toString("utf8").replace(/^\uFEFF/, ""));
          } finally { await opened.handle.close(); }
          const validation = validateRoomStudy(candidate);
          if (!validation.ready) return output(validation);
          const saved = await (await store(context, "edit", args.projectId)).saveRevision(args.projectId, validation.input, args.parentRevisionId);
          return output({ projectId: saved.input.projectId, revisionId: saved.input.revisionId, parentRevisionId: saved.parentRevisionId, revisionHash: saved.revisionHash, ready: true });
        },
      },
      cvc_revision_save: {
        description: "Valider et enregistrer une nouvelle révision complète ; renvoie les données manquantes avant toute écriture.", args: saveArgs.shape,
        async execute(raw: unknown, context?: unknown) {
          const args = saveArgs.parse(raw); const validation = validateRoomStudy(args.input);
          if (!validation.ready) return output(validation);
          return output(await (await store(context, "edit", args.projectId)).saveRevision(args.projectId, validation.input, args.parentRevisionId));
        },
      },
      cvc_calculate: {
        description: "Calculer les déperditions d'une révision sauvegardée et conserver le calcul traçable.", args: revisionArgs.shape,
        async execute(raw: unknown, context?: unknown) { const args = revisionArgs.parse(raw); return output(await (await store(context, "edit", args.projectId)).calculate(args.projectId, args.revisionId)); },
      },
      cvc_run_read: {
        description: "Relire et vérifier un calcul sauvegardé, ses contributions, avertissements et données sources.", args: runArgs.shape,
        async execute(raw: unknown, context?: unknown) { const args = runArgs.parse(raw); return output(await (await store(context, "read", args.projectId)).readRun(args.projectId, args.runId)); },
      },
      cvc_runs_compare: {
        description: "Comparer deux calculs sauvegardés de la même pièce, avec les écarts par contribution.", args: compareArgs.shape,
        async execute(raw: unknown, context?: unknown) { const args = compareArgs.parse(raw); return output(await (await store(context, "read", args.projectId)).compareRuns(args.projectId, args.beforeRunId, args.afterRunId)); },
      },
      cvc_report_export: {
        description: "Exporter une note de calcul HTML imprimable à partir d'un calcul sauvegardé vérifié.", args: runArgs.shape,
        async execute(raw: unknown, context?: unknown) { const args = runArgs.parse(raw); return output(await (await store(context, "edit", args.projectId)).exportReport(args.projectId, args.runId)); },
      },
    },
  };
};
