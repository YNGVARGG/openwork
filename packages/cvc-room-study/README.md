# @cvc/room-study

Versioned contracts, a deterministic calculator and synthetic reference fixtures for a one-room preliminary winter heat-loss study. Persistence, agent tools and UI are not implemented yet.

## Contract boundary

`roomStudyInputSchema` accepts a complete revision with explicit unit literals and provenance on every engineering quantity. No coercion, climate tables, construction defaults or inferred air properties are applied. `validateRoomStudy(unknown)` returns either a parsed ready input or field-level issues/questions; incomplete drafts may be retained by a future project service but cannot be sent to calculation. Field paths are machine-readable; a future French UI should map them to friendly labels.

Conditions are named shared records. Surfaces reference a condition; nested openings inherit it; each explicit bridge inherits its parent surface's condition. Air exchange must reference an outdoor condition. A single outdoor-condition edit therefore changes all linked contributions. Adjacent-room temperatures are prescribed inputs, not calculated buffer or ground temperatures. Ground boundaries, warmer boundaries, heat recovery and unsupported methods are rejected in version 1.

Areas are explicitly supplied. Parent areas are gross, nested openings are deducted exactly once, and IDs are unique across surfaces, openings and bridges. This validates identity and area sums, not geometric completeness or two differently named records that describe the same physical opening. `envelopeDescription` and `scopeDescription` record the declared modelling scope for review. The first version does not derive geometry or infer omitted surfaces.

Air flow is the combined declared outdoor-air flow in m3/h, including any infiltration already considered by the author. No separate automatic infiltration term is added. Zero flow is allowed only as an explicitly recorded value with provenance. Thermal bridges must be included explicitly or excluded with a reason. U-values must exclude separately modelled bridge contributions; the author must establish this from the input sources.

`roomStudyRunSchema` defines the transport shape for saved results: run identity, UTC timestamp, full input snapshot, method/implementation versions, reference IDs, per-element trace and warnings. Trace values use units in their field names (`coefficientWK`, `deltaTK`, `heatLossW`, `netAreaM2`, `flowM3s`). It checks that each input element has exactly one contribution with the correct kind. **It does not verify numerical results or authenticate their producer.** Only the future deterministic calculation service may create authoritative runs; it must enforce arithmetic, provenance binding, immutability and project-scoped storage. Schema parsing alone is not acceptance of an LLM-authored result.

## Reference and checks

The [reference note](../../docs/cvc/room-heat-loss-reference.md) states method sources, exclusions, hand arithmetic and test tolerances. JSON fixtures are synthetic, not defaults. The baseline is **770 W**. Changing shared outdoor temperature from -5 to -10 degC gives **910.5 W**, an increase of **140.5 W**.

Contract tests independently evaluate fixture arithmetic with a test-only helper. Calculator tests additionally execute the production implementation against every frozen expected contribution and exercise changes, exclusions, invalid inputs, detached snapshots and arithmetic overflow.

Import `calculateRoomStudy` from `@cvc/room-study/calculator`. Pass untrusted input and an explicit `{ runId, createdAt }` identity; the caller owns identity creation. The function validates inputs and output, performs no I/O and uses no model, clock or random state. It returns a detached input snapshot, trace, full-precision totals and warnings. This is not a persistence or immutability guarantee; a future run service must supply those.

The calculator implements the narrow reviewed equations directly. Importing the old residential load orchestration would bring incompatible single-temperature, cooling and airflow conventions; no legacy code or dependency has been copied. U-value calculation from construction layers remains a candidate for later reuse.

```text
pnpm test:cvc:room
pnpm typecheck:cvc:room
```

Next implementation: project revision/run storage, numerical verification on load, run comparison and report export, followed by agent-tool and UI integration.
