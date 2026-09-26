import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import path from "node:path";

import {
  buildEnvironment,
  commandForPlatform,
  commands,
  cvcEnvironment,
  launch,
  parseArgs,
  repoRoot,
} from "./cvc.mjs";

function loadEffectiveBuilderConfig() {
  const requireFromDesktop = createRequire(
    path.resolve(repoRoot, "apps", "desktop", "package.json"),
  );
  let electronBuilderPackagePath;
  try {
    electronBuilderPackagePath = requireFromDesktop.resolve("electron-builder/package.json");
  } catch {
    return null;
  }

  const loaderPath = path.resolve(
    path.dirname(electronBuilderPackagePath),
    "..",
    "app-builder-lib",
    "out",
    "util",
    "config",
    "config.js",
  );
  const { getConfig } = requireFromDesktop(loaderPath);
  return getConfig(
    path.resolve(repoRoot, "apps", "desktop"),
    "electron-builder.cvc.yml",
    null,
  );
}

function dryRun(mode) {
  const output = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    output.push(String(chunk));
    return true;
  };
  try {
    assert.equal(launch({ mode, dryRun: true }), 0);
  } finally {
    process.stdout.write = originalWrite;
  }
  return JSON.parse(output.join(""));
}

test("CVC argument parsing allows only a mode and --dry-run", () => {
  assert.deepEqual(parseArgs(["dev"]), { mode: "dev", dryRun: false });
  assert.deepEqual(parseArgs(["package", "--dry-run"]), { mode: "package", dryRun: true });
  assert.throws(() => parseArgs(["dev", "--", "--publish"]), /Usage:/);
  assert.throws(() => parseArgs(["unknown"]), /Usage:/);
});

test("CVC package routing uses the dedicated builder config and never publishes", () => {
  const packageArgs = commands.package.flat();
  assert.deepEqual(commands.package[0], ["--filter", "@openwork/desktop", "build:electron"]);
  assert.equal(packageArgs.includes("electron-builder.cvc.yml"), true);
  assert.deepEqual(packageArgs.slice(-2), ["--publish", "never"]);
});

test("CVC effective Electron Builder config clears inherited publishing", async (t) => {
  const configPromise = loadEffectiveBuilderConfig();
  if (configPromise === null) {
    t.skip("electron-builder is not installed in this checkout");
    return;
  }
  const config = await configPromise;
  assert.equal(config.publish, null);
  assert.equal(config.appId, "local.cvc.studio");
  assert.equal(config.productName, "CVC Studio");
  assert.equal(config.files.some((item) => item.filter?.includes("electron/**/*")), true);
  assert.equal(config.win.target[0], "nsis");
});

test("dry-run environment isolates development data and leaves UI builds out of dev mode", () => {
  const dev = dryRun("dev");
  assert.equal(dev.environment.OPENWORK_DEV_MODE, "1");
  assert.match(dev.environment.OPENWORK_DATA_DIR, /cvc-studio-server-dev/);
  assert.equal(dev.environment.VITE_CVC_STUDIO, "1");

  const ui = dryRun("build-ui");
  assert.equal(ui.environment.VITE_CVC_STUDIO, "1");
  assert.equal(ui.environment.OPENWORK_DEV_MODE, undefined);
  assert.equal(ui.environment.OPENWORK_DATA_DIR, undefined);
});

test("dry-run output excludes unrelated inherited environment values", () => {
  const key = "VITE_CVC_TEST_SECRET";
  const previous = process.env[key];
  process.env[key] = "must-not-be-printed";
  try {
    assert.equal(dryRun("package").environment[key], undefined);
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("CVC environment disables hosted telemetry defaults", () => {
  assert.equal(cvcEnvironment.VITE_OPENWORK_POSTHOG_KEY, "");
  assert.equal(cvcEnvironment.VITE_OPENWORK_SENTRY_DSN, "");
  assert.equal(cvcEnvironment.OPENWORK_DESKTOP_SENTRY_DISABLED, "1");
});

test("production CVC launches scrub inherited development switches", () => {
  const production = buildEnvironment("package", {
    OPENWORK_DEV_MODE: "1",
    OPENWORK_DEV_PROFILE: "unsafe-profile",
    OPENWORK_ELECTRON_REMOTE_DEBUG_PORT: "9222",
    OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN: "1",
    OPENWORK_DATA_DIR: "C:\\temporary\\dev-data",
    OPENWORK_EVAL_FATAL_DESKTOP_BOOTSTRAP_FAILURE: "should-not-leak",
    PORT: "5173",
    KEEP_THIS_ENV: "preserved",
  });
  assert.equal(production.OPENWORK_DEV_MODE, undefined);
  assert.equal(production.OPENWORK_DEV_PROFILE, undefined);
  assert.equal(production.OPENWORK_ELECTRON_REMOTE_DEBUG_PORT, undefined);
  assert.equal(production.OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN, undefined);
  assert.equal(production.OPENWORK_DATA_DIR, undefined);
  assert.equal(production.OPENWORK_EVAL_FATAL_DESKTOP_BOOTSTRAP_FAILURE, undefined);
  assert.equal(production.PORT, undefined);
  assert.equal(production.KEEP_THIS_ENV, "preserved");
  assert.equal(production.OPENWORK_DESKTOP_DISTRIBUTION, "cvc");
});

test("Windows command routing invokes pnpm.cmd through cmd.exe without a shell string", () => {
  const windowsInvocation = commandForPlatform(
    ["--filter", "@openwork/desktop", "dev"],
    "win32",
    "C:\\Windows\\System32\\cmd.exe",
  );
  assert.equal(windowsInvocation.command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(windowsInvocation.args, [
    "/d",
    "/s",
    "/c",
    "pnpm.cmd",
    "--filter",
    "@openwork/desktop",
    "dev",
  ]);

  const posixInvocation = commandForPlatform(
    ["--filter", "@openwork/desktop", "dev"],
    "linux",
  );
  assert.equal(posixInvocation.command, "pnpm");
  assert.deepEqual(posixInvocation.args, ["--filter", "@openwork/desktop", "dev"]);
});
