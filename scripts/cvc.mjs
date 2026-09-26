import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cvcEnvironment = Object.freeze({
  OPENWORK_DESKTOP_DISTRIBUTION: "cvc",
  OPENWORK_ELECTRON_APP_NAME: "CVC Studio",
  OPENWORK_ELECTRON_APP_IDENTIFIER: "local.cvc.studio",
  OPENWORK_ELECTRON_PROTOCOL_SCHEME: "cvc-studio",
  VITE_CVC_STUDIO: "1",
  VITE_OPENWORK_POSTHOG_KEY: "",
  VITE_OPENWORK_SENTRY_DSN: "",
  OPENWORK_DESKTOP_SENTRY_DISABLED: "1",
});

const commands = Object.freeze({
  dev: [["--filter", "@openwork/desktop", "dev"]],
  "build-ui": [["--filter", "@openwork/app", "build"]],
  preview: [["--filter", "@openwork/app", "preview"]],
  package: [
    ["--filter", "@openwork/desktop", "build:electron"],
    [
      "--filter",
      "@openwork/desktop",
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.cvc.yml",
      "--publish",
      "never",
    ],
  ],
});

// These values are useful for an unpackaged development session, but must not
// leak into a renderer build or a packaged application when the launcher is
// invoked from a developer shell that already has them set.
const developmentEnvironmentKeys = Object.freeze([
  "OPENWORK_DEV_MODE",
  "OPENWORK_DEV_PROFILE",
  "OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN",
  "OPENWORK_ELECTRON_REMOTE_DEBUG_PORT",
  "OPENWORK_ELECTRON_START_URL",
  "ELECTRON_START_URL",
  "ELECTRON_EXTRA_LAUNCH_ARGS",
  "OPENWORK_ELECTRON_USERDATA",
  "OPENWORK_ELECTRON_DISABLE_PROTOCOL_REGISTRATION",
  "OPENWORK_ELECTRON_SKIP_SHARED_PREPARE",
  "OPENWORK_ELECTRON_SKIP_WORKSPACE_BUILD",
  "OPENWORK_ELECTRON_SKIP_NATIVE_REBUILD",
  "OPENWORK_DATA_DIR",
  "PORT",
]);

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const dryRun = rest.includes("--dry-run");
  const unknown = rest.filter((argument) => argument !== "--dry-run");

  // Own properties only: "constructor", "toString" and "__proto__" are truthy
  // on the prototype chain and would otherwise pass as valid modes.
  if (!Object.hasOwn(commands, mode) || unknown.length > 0) {
    throw new Error(
      "Usage: node scripts/cvc.mjs <dev|build-ui|preview|package> [--dry-run]",
    );
  }

  return { mode, dryRun };
}

function commandForPlatform(args, platform = process.platform, comSpec = process.env.ComSpec) {
  if (platform !== "win32") {
    return { command: "pnpm", args };
  }

  // .cmd files cannot be spawned directly with shell:false on Windows. Invoke
  // cmd.exe explicitly while keeping each fixed argument as a child-process
  // argument; this launcher never interpolates a user-provided shell string.
  return {
    command: comSpec || "cmd.exe",
    args: ["/d", "/s", "/c", "pnpm.cmd", ...args],
  };
}

function buildEnvironment(mode, baseEnvironment = process.env) {
  const environment = { ...baseEnvironment };
  if (mode !== "dev") {
    for (const key of developmentEnvironmentKeys) delete environment[key];
    for (const key of Object.keys(environment)) {
      if (key.startsWith("OPENWORK_EVAL_")) delete environment[key];
    }
  }

  const developmentEnvironment = mode === "dev"
    ? {
        OPENWORK_DEV_MODE: "1",
        OPENWORK_DEV_PROFILE: baseEnvironment.OPENWORK_DEV_PROFILE || "cvc-studio",
        OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN:
          baseEnvironment.OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN || "1",
        OPENWORK_ELECTRON_REMOTE_DEBUG_PORT:
          baseEnvironment.OPENWORK_ELECTRON_REMOTE_DEBUG_PORT || "0",
        PORT: baseEnvironment.PORT || "0",
        OPENWORK_DATA_DIR:
          baseEnvironment.OPENWORK_DATA_DIR ||
          path.join(os.homedir(), ".openwork", "cvc-studio-server-dev"),
      }
    : {};

  return {
    ...environment,
    ...cvcEnvironment,
    ...developmentEnvironment,
  };
}

function launch({ mode, dryRun }) {
  const invocations = commands[mode].map((args) => {
    const { command, args: childArgs } = commandForPlatform(args);
    return { command, args: childArgs };
  });
  const env = buildEnvironment(mode);

  if (dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode,
          cwd: repoRoot,
          invocations,
          environment: Object.fromEntries(
            [...Object.keys(cvcEnvironment), ...developmentEnvironmentKeys]
              .filter((key) => Object.hasOwn(env, key))
              .map((key) => [key, env[key]]),
          ),
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  for (const { command, args } of invocations) {
    const result = spawnSync(command, args, {
      cwd: repoRoot,
      env,
      shell: false,
      stdio: "inherit",
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }
  return 0;
}

export {
  buildEnvironment,
  commands,
  cvcEnvironment,
  commandForPlatform,
  developmentEnvironmentKeys,
  launch,
  parseArgs,
  repoRoot,
};

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = launch(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
