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

## First live test correction

The first user chat created a project but failed to save a revision. Repeated large JSON retranscription and a rejected nullable parent parameter prevented calculation. The transcript alone does not establish which runtime schema conversion rejected null.

The tool now offers `cvc_revision_import` to read a workspace-relative JSON file directly, validate it and save its exact parsed data. Source-file read and project-write permissions are checked separately; the shared workspace file-identity helper rejects linked paths. Parent IDs are optional strings: omit the field for an initial revision. Instructions prefer import and stop repeated identical failures.

Updated plugin tests: 4 passed, 30 assertions, including exact imported data, 770 W, missing fields, path escape and permission denial. Live chat retest remains required after restart.

## Native study artifact — 2026-09-27

Implemented CVC-UX-001 for user testing: native results/data/history/note tabs, read-only friendly JSON input preview, typed outdoor-temperature edits, source provenance, native study links and collapsed activity. Important errors and permissions remain visible. Existing HTML file export remains available on explicit request.

Validation: 33 targeted UI/artifact tests passed, 6 authenticated route tests passed, 4 plugin tests passed. App/server typechecks and production builds passed (existing large-bundle warnings). Route tests verify 770 W → 910.5 W (+140.5 W), unchanged baseline, server restart rereads, read-only/auth/feature gates, invalid temperatures and corrupted results. Browser review of the actual panel component with synthetic fixture data is captured in evidence/native-study-results.png.

Printing uses the operating-system print dialog with a PDF printer option, not a dedicated PDF exporter. Actual user chat → native link → edit → desktop restart and printed pagination remain user acceptance checks; the ticket stays open. General input editing beyond exterior temperatures still uses the conversation.
