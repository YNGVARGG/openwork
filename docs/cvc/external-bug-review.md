# External LLM goal: audit and propose fixes for CVC Studio

## Goal

Find reproducible defects in the CVC Studio foundation, fix confirmed defects with focused regression coverage, and submit reviewable commits on a separate branch. Success means a documented, testable patch that the primary Codex agent can inspect before integration. Do not merge your own changes.

Repository: https://github.com/YNGVARGG/openwork

Base branch: `codex/cvc-foundation`.

The foundation currently has branding, launcher and distribution isolation. HVAC tools and calculation persistence do not exist yet. Read `docs/cvc/first-milestone.md` for the proposed product direction; do not implement that milestone as part of this bug audit.

## Branch and review boundary

1. Use your own clone or a separate Git worktree. Do not modify another agent's active checkout.
2. Fetch `origin`; record the exact `origin/codex/cvc-foundation` SHA you review. Create `codex/cvc-bug-audit-YYYYMMDD` from that SHA (append a suffix if needed). Do not reset or reuse someone else's branch.
3. Read `AGENTS.md`, `DESIGN.md` for UI changes, and all `docs/cvc/` reviews. Preserve licenses and attribution.
4. Commit each coherent fix to your audit branch. Never commit or push directly to `codex/cvc-foundation`, `dev` or another integration branch. Never force-push.
5. Push only the audit branch. Open a **draft PR in YNGVARGG/openwork**, with base `codex/cvc-foundation` and head your audit branch; do not target `different-ai/openwork`. Title it `CVC foundation: bug audit fixes`. Do not merge or enable auto-merge. If GitHub access is unavailable, keep local commits and report their SHAs plus the checkout path.
6. Return the branch, base SHA, commit SHAs, draft PR URL and verification results to the user for the primary Codex agent to review. Integration requires that review and an explicit decision to accept the patch; passing tests alone is not approval.

## Audit priorities

- CVC identity at startup, persisted shell settings, local profile/data paths, protocol registration and branding overrides.
- Runtime and packaging isolation from OpenWork: updater/recovery, telemetry, uninstall hooks, factory reset, shared container cleanup and Linux integration. Inspect packaged behavior separately from development behavior; do not assume the development profile proves production isolation.
- Windows launcher correctness, argument/environment handling, native-module compatibility probe and rebuild fallback. Prevent dry-run output from revealing inherited credentials.
- Packaging config inheritance, native staging and distribution selection. Detect accidental upstream publish/update destinations.
- CVC welcome behavior and preservation of upstream variants. Verify actual behavior rather than merely searching for old product names.
- Report unexpected shared data, keys or hosted-service dependencies precisely. Do not claim the whole app is local-only based on hidden sign-in UI.

## Working method

For each finding, document a concrete trigger, expected/actual behavior, affected files, severity, reproduction and impact. Distinguish confirmed defects from hypotheses and future enhancements. Reproduce first, then add a regression test that fails before the fix and passes afterward when practical. Inspect narrow dependency paths rather than rewriting entire modules.

Use synthetic fixtures, throwaway profiles and temporary directories. Never execute destructive reset/uninstall tests against the user's real profile, project files or OpenWork installation. Stub system mutation boundaries or use a disposable test environment. Do not print secrets or include personal/customer data in commits, reports or screenshots.

Avoid broad refactors, speculative folder deletion, dependency upgrades and new product scope. If a fix requires a major architectural decision, record the evidence and proposed options for review instead of silently making it.

## Verification and deliverables

Use pnpm and the repository's pinned tooling. Run relevant regression tests and, for affected areas:

```text
pnpm test:cvc
pnpm --filter @openwork/app exec bun test --isolate tests/cvc-identity.test.tsx
pnpm --filter @openwork/app typecheck
pnpm build:cvc:ui
```

For desktop behavior, perform a Windows development smoke test where available. For packaging changes, inspect the effective builder config; distinguish that from a built installer test. Capture UI screenshots when changing UI and cite applicable DESIGN.md rule IDs. Do not claim an unrun check passed. Document existing skips, failures and unavailable platform/toolchain checks.

Add `docs/cvc/reviews/bug-audit-YYYYMMDD.md` with findings, fixes, commands/results, remaining risks and limitations. The PR description should lead with concrete corrected behavior, then reproduction and verification. If no bugs are confirmed, submit only the evidence-backed report; do not invent code changes to fill the task.

## Primary reviewer acceptance checklist

The primary Codex agent reviews every diff, validates reproductions, checks scope and isolation, reruns relevant tests, and reports accepted/rejected changes and residual risks. Keep the PR unmerged until this review occurs. Repository branch protection is not configured by this document; this is an explicit workflow requirement for the external agent.
