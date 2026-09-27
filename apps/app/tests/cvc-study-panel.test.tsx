/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFile } from "node:fs/promises";
import { calculateRoomStudy } from "@cvc/room-study/calculator";
import { CvcStudyPanel, CvcInputPreview } from "../src/react-app/domains/session/artifacts/cvc-study-panel";
import { cvcStudyTarget } from "../src/react-app/domains/session/artifacts/cvc-study-target";
import type { OpenworkCvcStudy } from "../src/app/lib/openwork-server";

const raw = JSON.parse(await readFile(new URL("../../../packages/cvc-room-study/tests/fixtures/room-input.v1.json", import.meta.url), "utf8"));
const baseline = calculateRoomStudy(raw, { runId: "baseline", createdAt: "2026-09-27T10:00:00.000Z" });
const input = baseline.inputSnapshot;
const study: OpenworkCvcStudy = { project: { schemaVersion: 1, projectId: input.projectId, name: "Pièce test", createdAt: baseline.createdAt }, revisions: [{ schemaVersion: 1, createdAt: baseline.createdAt, parentRevisionId: null, input, inputHash: "test", revisionHash: "test" }], runs: [baseline] };
const client = { cvcStudy: async () => study, cvcStudyTemperature: async () => ({ run: baseline, comparison: null }), cvcStudyNote: async () => ({ html: "<p>Note</p>" }) };
function render(runId?: string) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  query.setQueryData(["cvc-study", "workspace", input.projectId], study);
  const html = renderToStaticMarkup(<QueryClientProvider client={query}><CvcStudyPanel client={client} workspaceId="workspace" projectId={input.projectId} runId={runId} onClose={() => {}} /></QueryClientProvider>);
  query.clear();
  return html;
}
test("native study recognizes only safe persisted record paths", () => {
  expect(cvcStudyTarget(".cvc/projects/test/project.json")).toEqual({ projectId: "test", runId: undefined, revisionId: undefined });
  expect(cvcStudyTarget(".cvc/projects/test/runs/run-1.json")?.runId).toBe("run-1");
  expect(cvcStudyTarget(".cvc/projects/test/revisions/rev-1.json")?.revisionId).toBe("rev-1");
  for (const path of ["../.cvc/projects/test/project.json", ".cvc/projects/../project.json", "piece.json", ".cvc/projects/test/exports/note.html"]) expect(cvcStudyTarget(path)).toBeNull();
});
test("native study shows a verified result and human contribution labels", () => {
  const html = render();
  expect(html).toContain("770");
  expect(html).toContain("Mur nord");
  expect(html).toContain("Résultats");
  expect(html).toContain("Données");
  expect(html).toContain("Historique");
  expect(html).not.toContain("<pre");
});
test("missing historical run never silently falls back to latest result", () => {
  const html = render("missing");
  expect(html).toContain("Le calcul demandé est introuvable");
  expect(html).not.toContain("770");
});
test("source room JSON has a readable preview with provenance", () => {
  const html = renderToStaticMarkup(<CvcInputPreview input={input} />);
  expect(html).toContain("Température intérieure");
  expect(html).toContain("Hypothèse à vérifier");
  expect(html).not.toContain("<pre");
});
