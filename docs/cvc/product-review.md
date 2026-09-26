# CVC Studio product review

Reviewed checkout: the CVC Studio fork after the renderer identity pass. This
document describes the product boundary that is actually present in the
checkout; it does not treat the inherited OpenWork workspace as a completed
CVC application.

## Product decision

Keep the OpenWork local agent workspace as the product shell. Its sessions,
conversation, project folders, terminal/browser tools, and extension paths are
useful for a BTS FED or office workflow. Add CVC projects, validated inputs,
deterministic methods, calculation runs, provenance, and reports as a separate
domain layer inside that shell.

The agent can ask for missing information, inspect project files, prepare a
typed request, and explain a saved result. A model response must not be the
source of a heating, cooling, ventilation, compliance, or equipment-sizing
number. Those values need a versioned calculation method and a persisted run
that can be inspected after the conversation changes.

## What this fork currently provides

- A separate CVC Studio desktop identity and local profile are being wired
  through the CVC distribution. The renderer welcome surface identifies the
  product and does not require OpenWork Cloud sign-in.
- The agent-centric workspace remains available. Users can open a local
  project folder, create sessions, converse with an agent, and use the
  inherited workspace capabilities subject to their existing controls.
- The desktop distribution has explicit CVC packaging, protocol, updater, and
  telemetry boundaries. Packaging and runtime checks still need to be exercised
  on each supported platform before release.
- No CVC sizing engine, project schema, calculation trace, report exporter, or
  standards evidence is claimed by this fork yet.

The welcome copy says that a project can be opened to prepare a study. That is
an entry point into the workspace, not evidence that a study has been
calculated. The UI must keep this distinction visible until the domain layer
exists.

## Identity and hosted dependencies

CVC Studio defaults to `CVC Studio`, uses a local workspace label when no
account is present, and hides hosted sign-in affordances on the CVC renderer
profile. The renderer also restores the CVC title during boot and ignores
persisted OpenWork shell settings that would re-enable cloud sign-in or change
the product name.

This is a UI and default-policy boundary. It is not a claim that every
inherited cloud module has been deleted or that a machine with a pre-existing
cloud session cannot reach cloud code. A future local-only distribution should
enforce the boundary in the desktop/runtime policy as well, with tests covering
network clients, account restoration, connect, analytics, updater, and error
reporting paths.

## Missing product work

The first useful vertical slice should be:

1. Open or create a CVC project below the selected workspace root.
2. Store a versioned building/zone/envelope input model with explicit SI units.
3. Validate missing or contradictory inputs and show the user what needs
   attention.
4. Run one deterministic, versioned method and persist an immutable
   `calculationRun` containing the input snapshot, assumptions, intermediate
   values, units, rounding, warnings, and method/source identifiers.
5. Let the agent cite that run while explaining the result.
6. Export a report from the saved run, with its revision and sources visible.

The tool boundary should be project-scoped and typed. At minimum it needs
project read/search, staged project patch, calculate, trace, and report export
operations. A request must carry a project identity; the server must resolve
that identity below the selected workspace root and reject a run whose project
or revision does not match the request.

## Risks and limitations

- The inherited workspace was designed for general agent work, not CVC
  provenance. Domain records must not be hidden in chat history or inferred
  from assistant prose.
- No current checkout evidence demonstrates a licensed, independently reviewed
  CVC calculation method. Standards-derived equations, tables, and examples
  need an appropriate source and domain review before redistribution.
- Imported spreadsheets, PDFs, and legacy scripts are translation inputs only.
  They must not silently become the calculation authority, and their units,
  assumptions, and revision must be recorded when accepted.
- Agent tool calls and file edits need the existing approval/ownership flow.
  A CVC calculation tool must not invoke browser, terminal, or computer-use
  capabilities implicitly.
- The CVC identity work does not yet constitute an offline guarantee. Platform
  packaging, runtime egress, retained sessions, and crash/error reporting need
  a separate local-only audit.
- No release readiness, engineering compliance, equipment selection, or sizing
  accuracy claim should be made until reference cases, dimensional checks,
  missing-data behavior, rounding, and reproducible traces are in place.

## Acceptance gate before calculation claims

Before presenting a result as a CVC calculation, require a versioned input and
result contract, at least one independently reviewed reference case, explicit
unit and rounding tests, a saved trace, and a report that identifies the
method, assumptions, and source material. The agent response should link to
the run and state when inputs are incomplete or results could not be verified.

Until that gate is met, CVC Studio is an honest local agent-workspace
foundation for collecting and reviewing project information. It is not yet a
validated sizing product.
