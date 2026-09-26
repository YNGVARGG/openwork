# Saved room-study verification

Verified on Windows on 2026-09-26.

- Room package: 59 tests passed; TypeScript check passed.
- Agent plugin: 3 tests passed, 22 assertions, including missing-input refusal, two revisions, immutable results, comparison, export, reopening, denied permissions and oversized successful responses.
- Foundation tests on this branch: 83 passed, 6 platform/feature skips.
- Production server build passed and includes the CVC plugin bundle.
- Synthetic reference: 770 W, then 910.5 W after the exterior temperature changes from -5 to -10 degrees C; difference 140.5 W.
- HTML note inspected in the in-app browser. [Screenshot](evidence/room-note.png) shows its provenance appendix. DESIGN.md P6/P7 guide the compact tables and total; P10 evidence is included.
- Visual Studio Community 2026 C++ compiler compiled and ran a minimal program. This does not prove the Electron native rebuild fallback or installer.

Run `pnpm demo:cvc:room` to reproduce the saved study and HTML export in an ignored local directory.

Remaining acceptance: live French assistant conversation, dedicated study panel, desktop restart through the actual UI, printed pagination and packaged installer. The current resumed-session test creates a new plugin instance and rereads disk records; it does not restart Electron.

The separately reviewed audit PR #2 contains protocol/identity fixes and Windows test-profile isolation. These fixes remain on its review branch until integration. The earlier workspace test runs may have touched real OpenWork profile files; no profile contents were deleted or guessed at during repair.
