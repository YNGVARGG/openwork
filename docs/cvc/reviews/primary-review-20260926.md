# Primary review of external bug audit

Reviewed PR #2 (`codex/cvc-bug-audit-20260926`) at `7036aecdf8fb7ce1c34beda4cb76c7138178a1a3` in an isolated checkout.

## Decision and corrections

The launcher prototype-chain fix and distribution-aware browser/deep-link parsing are useful confirmed fixes. The submitted revision was **not approved as-is**: both desktop keyless-link guards still called `extractConnectExchange` without the distribution scheme list. A `cvc-studio://connect?code=...` URL therefore fell through to signed-token verification despite the updated downstream resolver.

The correction adds one shared `resolveConnectLinkUrl` dispatcher and routes both desktop preview and accept through it. Behavioral regression tests verify that CVC keyless links fetch exactly the preview/exchange endpoint and that a foreign scheme fetches nothing. The production and development protocol sets remain separate.

The reported CVC-BRAND-1 ambiguity is resolved in favor of the established CVC identity: organization names cannot rename the desktop application. An explicit CVC distribution policy is enforced by the shared native-name function at startup and during live updates. Tests check Electron, menu, window and macOS process names; other distributions keep their existing behavior. This does not remove all organization icon/cloud features.

The corrected patch is acceptable within this reviewed scope. This is a code-review decision, not a claim of a complete security audit or a packaged release verification. Keep the PR unmerged until the correction commits are present in its reviewed head.

## Verification

- Expanded `pnpm test:cvc`: 192 passed, 6 existing skips, 0 failures. It now includes browser handoff, connect resolution and native-name regression tests.
- Isolated renderer identity/deep-link tests: 2 passed, 12 assertions.
- UI TypeScript check: passed.
- Production CVC renderer build: passed with the existing large-chunk warnings.
- Existing workspace-store tests were independently run in both the original foundation checkout and corrected audit checkout. They fail in both; those baseline bootstrap-resolution failures are not repaired or concealed by this patch.
- No signed installer, real installed protocol handoff or macOS/Linux runtime smoke test was performed.

Remaining follow-up: inspect the baseline workspace-bootstrap failures before project persistence is wired into that layer. The native rebuild fallback also needs a target-platform check when node-pty requires rebuilding; the current prebuilt probe alone does not establish that fallback works.
