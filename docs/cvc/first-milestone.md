# First milestone: one room, one traceable winter study

Status: selected by the user on 2026-09-26; not yet an implemented feature or a validated calculation method.

First coding deliverable: [`@cvc/room-study`](../../packages/cvc-room-study/README.md) now defines input/result contracts, validation and synthetic fixtures. The [reference case](room-heat-loss-reference.md) checks baseline 770 W and revised 910.5 W arithmetic. This does not yet implement the production calculation adapter or any of the persistence/UI workflow below.

## User outcome

A BTS FED user opens a project and asks, in French: « Aide-moi à établir les déperditions hivernales de cette pièce et une note de calcul vérifiable. » The assistant gathers missing data, runs a deterministic calculation, explains each contribution and exports a calculation note. The saved study remains usable after restarting the app or opening another conversation.

Start with one room and explicitly declared boundary conditions. This is a preliminary heat-loss study, not a regulatory compliance assessment or an automatic radiator/heat-pump selection. Keep the conversational workspace; show inputs and results in a focused study panel rather than building a second application.

## First implementation order

1. Define a versioned room-study input/result contract and one synthetic, independently calculated reference case. Review the method and its applicability before connecting a physics module. This is the first coding task.
2. Implement project storage, validated revisions and immutable runs. A study is a domain record, never reconstructed from chat text.
3. Add a deterministic calculation adapter and regression cases. Inspect the old engine module by module; reuse only code that fits the contract and passes independent reference checks.
4. Expose project read/patch, calculate, run read and report export through the retained agent tool runtime.
5. Deliver the complete French-language workflow, an inspectable result panel and an HTML calculation note suitable for printing. A later PDF exporter can use the same saved run.

## Minimum scope

- Named room; explicit geometry, areas and units; envelope elements and adjacent conditions; declared design temperatures; declared thermal properties and air-exchange inputs required by the selected method.
- Every engineering input records whether it was supplied, sourced or explicitly assumed. Missing required inputs block calculation and become specific questions. Do not silently invent construction properties, climate values or standard defaults.
- Resolve gross versus net surface areas and prevent double counting openings. Explicitly document the treatment or exclusion of thermal bridges, air exchange and unheated boundaries. Unsupported conditions must be rejected or identified as outside scope, not silently approximated.
- Saved result contains contributions, total in W, intermediate values, units, warnings, method/version, input revision and run ID. Keep full calculation precision; round only for display/export.
- A report is generated from a saved run and identifies its assumptions, exclusions and provenance. No claim of standards compliance without a separately reviewed implementation and source basis.

## Acceptance demonstration

1. Create a synthetic one-room project through the app. With one required value missing, the assistant asks for it and does not produce a numerical result.
2. Supply that value; validate and save the input revision. Calculate using the deterministic tool, with no model in the numerical path.
3. Compare the result and individual contributions with the independent reference case using justified tolerances defined before implementation. Test invalid values, unit errors, duplicate openings and unsupported conditions.
4. Inspect the inputs, assumptions and contributions in the app. Export a calculation note that matches the saved run.
5. Change one input and calculate again. Show the difference, while the previous revision, run and report remain unchanged.
6. Restart the app and read both runs from a new conversation. Attempts to read/write another project through a mismatched ID or escaping path fail.

## Deferred

Whole-building sizing, summer cooling, duct networks, equipment catalogs, automatic plan/PDF extraction, BIM, regulatory certification and multi-user collaboration. A later milestone can add these after the end-to-end project/run boundary is reliable.
