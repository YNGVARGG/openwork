import assert from "node:assert/strict";
import test from "node:test";
import { registerUpdaterIpc } from "./updater.mjs";
import { initOpenworkSentry } from "./sentry.mjs";
import { CVC_DESKTOP_DISTRIBUTION } from "./desktop-distribution.mjs";
import {
  extractConnectExchange,
  extractConnectLinkToken,
  verifyConnectLinkUrl,
} from "./connect-link.mjs";

test("a distribution without updates cannot fetch, load, install or recover upstream releases", async () => {
  const handlers = new Map();
  const unexpected = () => { throw new Error("Disabled updates performed a side effect"); };
  const { ensureAutoUpdater } = registerUpdaterIpc({
    app: { isPackaged: true, getPath: unexpected, getVersion: unexpected },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    updatesEnabled: CVC_DESKTOP_DISTRIBUTION.updatesEnabled,
    loadAutoUpdater: unexpected,
    electronNet: { fetch: unexpected },
    shell: { openPath: unexpected, openExternal: unexpected },
    writeDefaults: unexpected,
  });
  assert.equal(await ensureAutoUpdater(), null);
  for (const name of [
    "recovery:recordHealthy", "recovery:list", "recovery:use",
    "recovery:restorePrevious", "recovery:evalSnapshot", "updater:getChannel",
    "updater:setChannel", "updater:check", "updater:download", "updater:installAndRestart",
  ]) {
    const handler = handlers.get(`openwork:${name}`);
    assert.equal(typeof handler, "function", name);
    const result = await handler({}, "alpha", "999.0.0");
    assert.equal(result.ok, false, name);
    assert.equal(result.available, false, name);
    assert.equal(result.supported, false, name);
    assert.deepEqual(result.releases, [], name);
  }
});

test("a distribution without telemetry never reads a Sentry build config or loads its SDK", async () => {
  const app = { get isPackaged() { throw new Error("Unexpected build config access"); } };
  assert.equal(await initOpenworkSentry({
    app, distribution: CVC_DESKTOP_DISTRIBUTION, packageMetadata: {},
  }), false);
});


// The CVC installer registers cvc-studio:// and main.mjs forwards that URL to
// these parsers. Accepting only the upstream openwork: schemes made every link
// the operating system handed over fail as "Not a connect deep link".
const CVC_SCHEMES = [`${CVC_DESKTOP_DISTRIBUTION.protocolScheme}:`];

test("CVC deep-link parsers accept the protocol scheme its installer registers", () => {
  const signed = `${CVC_DESKTOP_DISTRIBUTION.protocolScheme}://connect?token=a.b.c`;
  assert.equal(extractConnectLinkToken(signed, { schemes: CVC_SCHEMES }), "a.b.c");

  const exchange = `${CVC_DESKTOP_DISTRIBUTION.protocolScheme}://connect`
    + "?code=abcdefghijklmnopqrstuvwx&apiBaseUrl=https%3A%2F%2Fden.example.com";
  assert.equal(
    extractConnectExchange(exchange, { schemes: CVC_SCHEMES })?.apiBaseUrl,
    "https://den.example.com",
  );

  // Reaching signature verification proves the scheme was accepted; the
  // message below is the refusal that predates the fix.
  const refused = verifyConnectLinkUrl(signed, { schemes: CVC_SCHEMES, publicKeys: {} });
  assert.equal(refused.ok, false);
  assert.notEqual(refused.message, "Not a connect deep link.");
});

test("CVC deep-link parsers still refuse schemes the distribution does not register", () => {
  const foreign = "other-app://connect?token=a.b.c";
  assert.equal(extractConnectLinkToken(foreign, { schemes: CVC_SCHEMES }), null);
  assert.equal(extractConnectExchange(foreign, { schemes: CVC_SCHEMES }), null);
  assert.equal(
    verifyConnectLinkUrl(foreign, { schemes: CVC_SCHEMES, publicKeys: {} }).message,
    "Not a connect deep link.",
  );
  // Callers that pass no scheme set keep upstream behaviour.
  assert.equal(extractConnectLinkToken(foreign), null);
  assert.equal(extractConnectLinkToken("openwork://connect?token=a.b.c"), "a.b.c");
});

test("CVC cannot repair or remove upstream Linux integration", async () => {
  const { createLinuxDesktopIntegration } = await import("./linux-desktop-integration.mjs");
  const integration = createLinuxDesktopIntegration({
    app: { isPackaged: true }, dialog: {}, appName: "CVC Studio", distribution: "cvc",
    platform: "linux", env: { APPIMAGE: "/tmp/cvc.AppImage" },
    runCommand: () => { throw new Error("Unexpected system mutation"); },
  });
  assert.equal((await integration.getStatus()).supported, false);
  assert.equal((await integration.install()).ok, false);
  assert.equal((await integration.remove()).ok, false);
});
