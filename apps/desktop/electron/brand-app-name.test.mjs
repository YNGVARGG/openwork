import assert from "node:assert/strict";
import test from "node:test";

import { applyBrandAppName } from "./brand-app-name.mjs";
import { CVC_DESKTOP_DISTRIBUTION } from "./desktop-distribution.mjs";

test("CVC ignores organization names on every native name surface", () => {
  for (const platform of ["win32", "darwin", "linux"]) {
    const applied = [];
    const runtimeProcess = { title: "original" };
    const result = applyBrandAppName("External Organization", {
      fallbackName: CVC_DESKTOP_DISTRIBUTION.appName,
      allowCustomAppName: CVC_DESKTOP_DISTRIBUTION.allowCustomAppName,
      platform,
      updateElectronAppName: true,
      runtimeProcess,
      app: { setName: (name) => applied.push(name) },
      applicationMenu: { setAppName: (name) => applied.push(name) },
      window: { setTitle: (name) => applied.push(name) },
    });
    assert.equal(result, "CVC Studio");
    assert.deepEqual(applied, ["CVC Studio", "CVC Studio", "CVC Studio"]);
    assert.equal(runtimeProcess.title, platform === "darwin" ? "CVC Studio" : "original");
  }
});

test("updates the macOS process and Electron application name before rebuilding the native menu", () => {
  const calls = [];
  const appName = applyBrandAppName("  Acme Work  ", {
    fallbackName: "OpenWork",
    platform: "darwin",
    updateElectronAppName: true,
    runtimeProcess: {
      get title() { return ""; },
      set title(name) { calls.push(["process", name]); },
    },
    app: { setName: (name) => calls.push(["app", name]) },
    applicationMenu: { setAppName: (name) => calls.push(["menu", name]) },
    window: { setTitle: (name) => calls.push(["window", name]) },
  });

  assert.equal(appName, "Acme Work");
  assert.deepEqual(calls, [
    ["process", "Acme Work"],
    ["app", "Acme Work"],
    ["menu", "Acme Work"],
    ["window", "Acme Work"],
  ]);
});

test("preserves the existing Windows live-update behavior", () => {
  const calls = [];
  const appName = applyBrandAppName("Acme Work", {
    fallbackName: "OpenWork",
    platform: "win32",
    updateElectronAppName: false,
    runtimeProcess: {
      get title() { return ""; },
      set title(name) { calls.push(["process", name]); },
    },
    app: { setName: (name) => calls.push(["app", name]) },
    applicationMenu: { setAppName: (name) => calls.push(["menu", name]) },
    window: { setTitle: (name) => calls.push(["window", name]) },
  });

  assert.equal(appName, "Acme Work");
  assert.deepEqual(calls, [
    ["menu", "Acme Work"],
    ["window", "Acme Work"],
  ]);
});

test("keeps the startup fallback and branded-name limit on every platform", () => {
  const appliedNames = [];
  const dependencies = {
    fallbackName: "OpenWork",
    platform: "win32",
    updateElectronAppName: true,
    runtimeProcess: {
      get title() { return ""; },
      set title(name) { appliedNames.push(`process:${name}`); },
    },
    app: { setName: (name) => appliedNames.push(name) },
    applicationMenu: { setAppName: () => undefined },
  };

  assert.equal(applyBrandAppName(null, dependencies), "OpenWork");
  assert.equal(applyBrandAppName("A".repeat(80), dependencies), "A".repeat(64));
  assert.deepEqual(appliedNames, ["OpenWork", "A".repeat(64)]);
});
