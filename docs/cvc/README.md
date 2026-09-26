# CVC Studio foundation

## Product direction

A local-first agent workspace for French BTS FED and office CVC design. Keep the
conversation, project files and result previews central. The assistant can gather
inputs and operate tools; verified calculation code must produce engineering
numbers. A project must own versioned inputs, assumptions, methods, calculation
runs and deliverables independently of a conversation.

This is a fork-first effort. The older HVAC repository is a candidate source of
calculation modules and test fixtures, not a mandatory architecture. Rebuild a
boundary when its assumptions do not fit; do not preserve it merely because it
already exists.

## Provenance and status

- Upstream: https://github.com/different-ai/openwork
- Starting commit: `7d90b91523ccb6a0cf837f2a53787adbdba2c30d` (`dev`, shallow clone).
- Local branch: `codex/cvc-foundation`; source remote: `upstream`.
- Name: CVC Studio (provisional); application ID: `local.cvc.studio`.
- GitHub fork and `origin`: https://github.com/YNGVARGG/openwork
- This is a development foundation, not a released sizing product.

Upstream licenses and attribution remain intact. No enterprise directories were
deleted: first establish the actual dependency closure and review it before
removing features or packaging a release.

## Development

Use Node 24 and the root package's pinned pnpm version. Install the desktop/UI
dependency closure from the repository root:

```powershell
pnpm --filter . --filter @openwork/app... --filter @openwork/desktop... --filter openwork-server... install --frozen-lockfile
pnpm dev:cvc
```

For an isolated renderer build and preview:

```powershell
pnpm build:cvc:ui
pnpm preview:cvc
```

Use `pnpm test:cvc` for the focused fork checks. `pnpm package:cvc` targets the
independent Electron distribution. Append `--dry-run` to the CVC launcher commands
to inspect fixed invocations and product environment without launching them.
Packaging still requires platform-specific native builds and upstream sidecars.

The CVC distribution has its own desktop profile and protocol, no mandatory
OpenWork sign-in/activation, and no upstream updater/recovery installation path.
Its launcher disables upstream product analytics and error-reporting credentials.
This does not mean every inherited cloud integration has been removed or audited.

## Reviews

- [Architecture and reuse decisions](architecture-review.md) — GPT-5.6 Terra.
- [Product, branding and hosted dependencies](product-review.md) — GPT-5.6 Luna.
- [Windows build and packaging](build-review.md) — GPT-5.6 Luna.

The review reports distinguish proposed follow-up work from implemented behavior.

## Next acceptance gate

Before integrating calculation modules, define the first real office task and a
versioned input/result contract. Compare the old engine against that contract
using independent reference cases, unit consistency, missing-data behavior,
source traceability and packaging constraints. Retain modules that pass; rebuild
or replace those that do not. Do not transplant the old Studio HTTP/UI layer.

The first product demonstration should open a project folder, collect missing
measurements, invoke a deterministic room-load tool, preview its results and
sources, compare a revision, and export a study. No unimplemented operation
should be presented as a working sizing feature.

## Verified foundation (2026-09-26)

- Focused desktop and launcher suite: 83 passed, 6 existing skips.
- Renderer identity test: 1 passed (5 assertions).
- UI TypeScript check and production build: passed.
- Windows development desktop started with working embedded workspace server.
- Production welcome renderer inspected visually in the browser.

The production bundle still emits upstream large-chunk warnings. No signed installer or engineering calculation integration is included.
