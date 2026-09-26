# CVC Studio build and packaging review

Reviewed the CVC launcher and Electron packaging path in the current working
tree. The review covers `scripts/cvc.mjs`, its focused tests,
`apps/desktop/electron-builder.cvc.yml`, the shared Electron Builder base
configuration, and the desktop native dependency staging scripts.

## Findings

### Windows launcher routing

The launcher now routes every pnpm invocation through the Windows command
interpreter as `cmd.exe /d /s /c pnpm.cmd ...` with `shell: false` on the child
process. The argument list is assembled from fixed command definitions; no
user argument is interpolated into a shell string. The routing test exercises
the Windows branch on every host, so a Linux CI run still checks the Windows
argument shape.

The launcher uses `ComSpec` when it is available and falls back to `cmd.exe`.
That is appropriate for a normal Windows installation. A packaging job should
still use a standard Windows runner; this code does not emulate `cmd.exe` on
POSIX hosts.

### Development environment isolation

`dev` receives its isolated CVC profile, data directory, mock keychain switch,
remote-debug default, and port default. `build-ui`, `preview`, and `package`
remove those development switches from the inherited environment before adding
the fixed CVC branding and telemetry values. Evaluation-only `OPENWORK_EVAL_*`
variables are also removed from production modes. This prevents a shell left in
dev mode from changing a packaged CVC build or enabling a debug bootstrap path.

The scrub is intentionally limited to known development controls. General
CI/toolchain variables remain available to pnpm, Vite, and electron-builder.
The package command also passes `--publish never` explicitly as a second guard.

### Effective Electron Builder configuration

The Electron Builder 26.15.3 configuration loader was run against
`apps/desktop/electron-builder.cvc.yml`. The resolved configuration:

* inherits the shared file/resource, target, signing-hook, and native-runtime
  rules from `electron-builder.base.yml`;
* has app ID `local.cvc.studio`, product name `CVC Studio`, Linux executable
  `cvc-studio`, and the CVC protocol scheme;
* resolves `publish` to `null`, so the GitHub publisher in the base file is not
  inherited as a CVC publish target; and
* retains the Windows NSIS target and the inherited `afterPack` verification
  hook.

The focused test loads this same Electron Builder loader when the desktop
dependency closure is installed. The static YAML assertion remains useful for
review, but it is not the evidence for publish inheritance by itself.

### Native dependencies

The desktop package directly declares `better-sqlite3` and `node-pty`. The
shared builder config disables electron-builder's automatic npm rebuild and
the existing `build:electron` step stages the runtime dependency tree and runs
the existing `afterPack` package-presence verification. In the reviewed
installation, both native modules load through the Electron executable's
Node runtime on Windows x64. SQLite executes an in-memory query and node-pty exposes its spawn function.

That check does not prove every release artifact. Packaging must be performed
on the target platform/architecture (or with the repository's corresponding
cross-package setup), and the resulting unpacked app must load both native
modules. A dependency installation performed with `--ignore-scripts` is not a
substitute for that release check when a package has no usable prebuild for the
target. Keep the existing native rebuild/staging policy aligned with the
platform packaging job rather than enabling an unqualified rebuild in the CVC
launcher.

## Required release checks

1. Run `pnpm test:cvc` with the desktop dependency closure installed. The
   launcher tests must include the effective-config check rather than relying
   only on parsed YAML.
2. Run `pnpm package:cvc` on each supported target runner with the intended
   sidecars and native modules available. Keep `--publish never` in the command
   and do not provide publishing credentials to this job.
3. Inspect the unpacked artifact before creating an installer: verify the CVC
   executable identity, protocol registration, `better-sqlite3`, `node-pty`,
   server runtime dependencies, and sidecar aliases. Exercise first launch
   with `OPENWORK_DEV_MODE`, remote-debug, and eval-failure variables absent.
4. Keep an explicit CVC packaging entry point. A public, cloud, or enterprise
   builder config must not be used as a substitute because those configs carry
   different identity, updater, and publish metadata.

## Limitations of this review

No signed installer or target-platform packaged smoke test was produced in this
working tree. macOS signing/notarization, Windows signing, sidecar downloads,
cross-architecture native loading, and first-launch protocol registration still
belong to their platform release jobs. The resolved-config test verifies
Electron Builder's merge result, but only a built artifact can verify the full
file set and native binary selection.

## Windows development verification

The CVC desktop launched on Windows with the embedded server responding to workspace requests. The launcher now invokes Vite directly with an explicit environment, avoiding Unix-only shell assignments. CVC development probes native modules in Electron before falling back to a rebuild; a failed probe requires Visual Studio C++ Build Tools.

CVC has its own Windows uninstall hook. Upstream Linux AppImage repair and shared OpenWork factory-reset/container-cleanup actions are disabled until CVC-specific implementations exist. No signed installer has been produced. Some upstream icons and secondary labels remain; this is a foundation, not a finished rebrand.
