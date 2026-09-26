# CVC Studio architecture

## Recommendation

Build CVC Studio as a local, agent-assisted engineering workspace on the retained OpenWork/OpenCode runtime. Keep its workspace, sessions, model routing, tool runtime, permissions, browser and terminal surfaces. Add a CVC-owned project and calculation-run boundary beneath that runtime. This is a Codex-like workspace for CVC/BTS FED work, not a calculator substituted for an agent workspace.

Reuse the existing HVAC engine selectively. `packages/kernel` is already a TypeScript, deterministic physics package: its public surface covers loads, psychrometrics, envelope, ventilation, ducts, zones, systems, solar gains, condensation and units (`packages/kernel/src/index.ts`). Its entry point states that it performs no I/O or network calls and is the producer of report numbers; `engine.ts` operates on a typed `DesignDocument` and returns a typed result. The four packages (`kernel`, `standards`, `cli`, `judgment`) contain more than 100 direct test files in source, alongside the survey and fixture corpus. They are an engine, not a collection of calculator scraps.

The decision is **reuse stable deterministic modules behind a new CVC adapter; rebuild incompatible product layers**. Do not fork the physics into a second implementation merely to make it fit the UI.

```text
OpenWork desktop workspace
  -> OpenCode sessions, model/tool orchestration and normal permissions
  -> first-party CVC tools (validated and project-scoped)
  -> CVC project service and immutable run store
  -> adapter to @hvac/kernel + curated @hvac/standards values
  -> reports, attachments and exported deliverables
```

## Ownership and traceability

Each CVC project lives in the selected local workspace and owns its building, rooms/zones, systems, evidence, assumptions, revisions, attachments and reports. Use a CVC-specific local store (for example `.cvc/project.sqlite` plus managed attachments and exports); it must not reuse an OpenCode session as the project record.

A calculation is created only from an immutable project revision. Persist the project revision ID, engine package/version, standards-data version, adapter version, canonical input snapshot or hash, assumptions, warnings, result, units, rounding and full trace. Reports cite a saved run ID, never mutable screen state. An agent may ask questions, prepare a typed patch, call a calculation, explain a saved result and draft a report. It does not supply a sizing or compliance value outside that trace.

Sessions remain conversations and tool activity. Link a session to a project and run where useful, but do not make either authoritative for the other. This preserves OpenWork's multi-session work patterns while allowing a project to be reviewed independently of any single conversation.

## Reuse boundary

| Area | Decision | Evidence and required boundary |
| --- | --- | --- |
| `@hvac/kernel` | Reuse first | Pure typed calculation layer with no I/O/network (`packages/kernel/src/index.ts`); `engine.ts` and `schema.ts` provide the residential design document and result model. Wrap it in a CVC adapter that maps a versioned project revision to a validated `DesignDocument` and maps results to a run trace. Keep kernel upgrades explicit and regression-tested against saved vectors. |
| Kernel modules | Reuse individually | Units, psychrometrics, loads, ventilation, duct friction/rules, zones, thermal bridges, solar, systems and condensation are separately exported. Adopt only methods inside the released CVC scope; a module’s existence is not a claim of regulatory or product applicability. |
| `@hvac/standards` | Curate and reuse selectively | It separates data/citations from the kernel. Its climate and citation data include explicit coverage, confidence and paywall caveats (`packages/standards/src/data.ts`). Pin a reviewed data release per run; require a licensed or verified source where the stored caveat says the data cannot be relied upon for the selected use. Rebuild the catalog/import layer needed for CVC’s supported jurisdiction and scope. |
| `@hvac/cli` | Reuse as reference/adapters, rebuild product workflow | The CLI owns survey ingestion, commands, reports and artifact output (`packages/cli/src/commands.ts`, `survey.ts`, `init.ts`). Its file-oriented command flow and report renderers can supply fixtures, migration tools and reusable render fragments, but CVC Studio needs project revisions, approvals and run IDs rather than shell commands and mutable folders as its application contract. |
| `@hvac/judgment` | Keep optional and non-authoritative | It calls TypeSafe (`packages/judgment/src/qa.ts`) and therefore is not deterministic. It can become an explicitly labelled post-calculation review or question-generation feature, with its result stored separately from the run. It must never generate the engineering result or compliance conclusion. |
| CVC project, persistence, run ledger and UI | Build | These product concepts do not exist in the engine packages. They need first-class project revisions, evidence provenance, immutable calculation runs, report revisions and a reviewable UI. |
| OpenWork/OpenCode sessions and tool runtime | Retain | OpenWork starts and manages OpenCode, passes runtime configuration through `OPENCODE_CONFIG` (`apps/server/src/cli.ts`, `openwork-runtime-config.ts`), and already loads first-party plugins. Keep this runtime rather than introducing a parallel chat, session or MCP implementation. |

## Agent tool boundary

Implement CVC as a first-party OpenCode plugin alongside `apps/server/src/opencode-plugins`. The existing spreadsheet plugin demonstrates the needed pattern: Zod argument schemas, a plugin factory, an `execute` handler and workspace-root resolution from tool context (`apps/server/src/opencode-plugins/openwork-spreadsheets.ts`). Register the CVC plugin in the OpenWork runtime configuration, as the existing plugins are registered in `apps/server/src/openwork-runtime-config.ts`. A future local MCP server may expose the same service to other clients, but it must be an adapter to this one implementation, never a second engine.

Start with these narrow tools:

1. `cvc_project_read` reads a selected project or revision.
2. `cvc_project_patch` validates a typed proposed change and creates a new revision only through the normal write/approval path.
3. `cvc_calculate` accepts a project revision and creates one immutable run.
4. `cvc_run_read` returns the saved result, warnings, provenance and trace.
5. `cvc_report_export` renders a named saved run to a revisioned deliverable.

Every tool takes a project ID; the service resolves it below the active workspace, checks that the project and run agree, and returns bounded structured data. The agent has no direct path from a prompt to kernel internals, a report overwrite or an arbitrary project outside its workspace. Browser, terminal, computer-use and automation tools remain available under OpenWork’s normal permissions, but no CVC calculation tool invokes them implicitly.

## First delivery slice

Deliver one local project through the complete chain: create/open project, capture a room/envelope and declared assumptions, create a revision, calculate a traceable heating/cooling result through the kernel adapter, inspect the saved run in chat and UI, and export a report that names that run. Add regression vectors from the existing engine fixtures at the adapter boundary. Expand to additional systems, standards, imports and collaboration only after this project/run/tool contract is stable.

Source boundary: references to `packages/kernel`, `packages/standards`, and the old CLI describe the separate original engineering repository. Those packages have not been imported into this OpenWork fork.
