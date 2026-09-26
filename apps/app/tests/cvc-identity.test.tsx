/** @jsxImportSource react */
import { afterAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

process.env.VITE_CVC_STUDIO = "1";

const registeredDom = typeof globalThis.window === "undefined" || typeof globalThis.document === "undefined";
if (registeredDom) GlobalRegistrator.register({ url: "http://localhost/" });
afterAll(async () => {
  if (registeredDom) await GlobalRegistrator.unregister();
});

test("CVC welcome keeps local identity and does not expose hosted sign-in", async () => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
  const [{ BootStateProvider }, { ShellConfigProvider }, { WelcomePage }] = await Promise.all([
    import("../src/react-app/shell/boot-state"),
    import("../src/react-app/shell/shell-config"),
    import("../src/react-app/domains/onboarding/welcome-page"),
  ]);

  window.localStorage.setItem(
    "openwork.shell-config",
    JSON.stringify({ appName: "OpenWork", cloudSignin: true, docsButton: true, feedbackButton: true }),
  );
  document.body.innerHTML = "<div id=\"root\"></div>";
  const root = createRoot(document.getElementById("root")!);

  await act(async () => {
    root.render(
      createElement(BootStateProvider, null,
        createElement(ShellConfigProvider, null,
          createElement(WelcomePage, {
            onGetStarted: () => undefined,
            onJoinOrganization: () => undefined,
            onTeamSignIn: () => undefined,
          }),
        ),
      ),
    );
  });

  expect(document.title).toBe("CVC Studio");
  expect(document.body.textContent).toContain("CVC Studio");
  expect(document.body.textContent).toContain("Open project");
  expect(document.body.textContent).not.toContain("Sign in to OpenWork Cloud");
  expect(document.querySelector('[data-testid="welcome-team-signin"]')).toBeNull();

  await act(async () => root.unmount());
});
