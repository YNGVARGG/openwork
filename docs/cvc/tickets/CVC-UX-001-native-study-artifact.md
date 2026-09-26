# CVC-UX-001 — Native study artifact and quieter conversation

Status: backlog, requested by user on 2026-09-27. Priority: next user-facing milestone. This ticket records the design; it does not implement it.

## Observed problem

The first successful live test imported revision-1, calculated 770 W and exported a note. The conversation exposed internal tool names, schema names, IDs, provenance enums and a long filesystem export path. Opening the source displayed a JSON code editor and internal workspace files. The user wants a native artifact that feels like part of CVC Studio, not a programming workflow.

The user-reported transcript establishes the baseline chat success; revision comparison and full application restart acceptance remain unverified.

## Research and product decision

The official [Éduscol BTS FED reference](https://sti.eduscol.education.fr/formations/bts/bts-fluides-energies-domotique-fed), consulted 2026-09-27, describes technical studies and lists thermal balances (A2-3), checking/adapting system performance (C8), processing information (C12) and preparing communication material (C14).

Product inference: the core object should support reviewing inputs and sources, understanding contributions, comparing revisions and sharing a readable calculation note. The reference does not prescribe an artifact UI or a specific export format. PDF is a proposed office handoff, to validate with the user's real office template; XLSX remains optional follow-up. No standards-compliance claim follows from this UX research.

## Desired experience

Chat responds briefly in French: “Déperditions : 770 W. Étude enregistrée. Données de démonstration.” Then shows an artifact entry “Étude thermique — Pièce de référence”, with an “Ouvrir l’étude” action. Avoid automatic pane opening or focus theft.

The artifact opens inside the existing side panel, with human-readable room/project names and revision labels. Views: Résultats, Données, Historique, Note de calcul. Results show total and transmission/bridges/air subtotals; named contributions expand into formula, units, values and source. Data is readable as fields/tables, never JSON by default. Editing creates a draft; saved runs remain immutable. Show when inputs changed and recalculation is required. Historical results never silently become current.

Group technical tool activity under collapsed “Détails de l’activité”, using French outcome labels. Hide tool identifiers, raw arguments, Thought rows, UUIDs, method codes and paths from the default success response. Keep diagnostic access available. Pending permissions, missing inputs, failures and engineering limitations remain visible and actionable. Do not hide uncertainty or provenance: show “Données supposées — à vérifier” and provide per-input sources in the study. Keep synthetic-test labeling obvious.

System-managed .cvc/.opencode content should not dominate the normal project-files view; provide an explicit technical-files option. Preserve access to legitimate source documents. A known study attachment opens a readable input preview, with “Voir le fichier source” secondary.

The note is a native readable view of the selected saved run. Export is optional: “Exporter en PDF” and print, with a human-readable default filename. HTML may remain an internal renderer/compatibility export but must not be the user's primary result. No raw path copying required. A renamed HTML link alone does not satisfy this ticket.

## Implementation starting points

- Reuse apps/app/src/react-app/domains/session/artifacts/artifact-panel.tsx and preview.tsx; existing HTML/PDF viewers prove a side-panel surface exists.
- Extend open-target.ts with a typed study target as needed; existing targets primarily describe files/URLs, not domain studies.
- Reuse components/chat/file-chip.tsx interaction conventions and existing accessible primitives (DESIGN P5).
- Resolve project/revision/run identity through a trusted workspace-scoped service. Display verified stored results, not model prose or HTML scraping. UI and chat call the same calculator/store boundary.
- Preserve checksums, input snapshots, permissions and numerical verification. JSON remains persistence, not the default presentation.
- Follow DESIGN P3/P6/P7/P10, S5 and C3/C4. Attach screenshots of success, missing-input, failure, changed-input and historical views at actual desktop size.

## Acceptance

1. Import the synthetic room and open a native study artifact with 770 W; no JSON editor or raw internal path is required.
2. Change exterior temperature through a small typed edit to -10 degrees C; calculate 910.5 W and compare +140.5 W. Keep baseline accessible.
3. Close/restart app and reopen the same artifact and both saved revisions without chat reconstruction.
4. Display sources, assumptions, net opening deduction and contributions on demand; important scope limitations stay visible.
5. Generate a readable PDF matching the selected saved run, with traceability details in the document and printable pagination verified.
6. Default chat is concise and French; diagnostics are collapsed. Permission blocks/errors remain visible.
7. Paths/IDs never act as the only way to open a result. User requests to inspect source still work.

## Deferred

Full-building studies, equipment selection, regulatory certification, spreadsheet export, office-specific templates and BIM integration. Keep the current calculation method and its explicit limitations.
