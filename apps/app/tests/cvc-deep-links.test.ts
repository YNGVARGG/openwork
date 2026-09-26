import { expect, test } from "bun:test";

// The CVC Studio installer registers cvc-studio:// and the desktop main process
// forwards that URL to the renderer. The renderer must accept the same scheme,
// or a link the operating system routed to the app is dropped before the main
// process can verify it. Set before the dynamic import so the build-time
// switch is read with the CVC value.
process.env.VITE_CVC_STUDIO = "1";

const CVC_SCHEME = "cvc-studio";
const TOKEN = "a".repeat(48);

test("the CVC renderer accepts the deep-link scheme its installer registers", async () => {
  const { parseChatDeepLink, parseConnectDeepLink, parseRemoteConnectDeepLink } =
    await import("../src/app/lib/openwork-links");

  const connectUrl = `${CVC_SCHEME}://connect?token=${TOKEN}`;
  expect(parseConnectDeepLink(connectUrl)).toEqual({ rawUrl: connectUrl, key: `signed:${TOKEN}` });

  const chatUrl = `${CVC_SCHEME}://chat?prompt=Check%20the%20room`;
  expect(parseChatDeepLink(chatUrl)?.prompt).toBe("Check the room");

  const remoteUrl = `${CVC_SCHEME}://connect-remote?openworkHostUrl=`
    + `${encodeURIComponent("https://host.example.com")}&openworkToken=${TOKEN}`;
  expect(parseRemoteConnectDeepLink(remoteUrl)).not.toBeNull();

  // Upstream links keep working in the CVC build.
  expect(parseConnectDeepLink(`openwork://connect?token=${TOKEN}`)?.key).toBe(`signed:${TOKEN}`);
  expect(parseConnectDeepLink(`openwork-dev://connect?token=${TOKEN}`)?.key).toBe(`signed:${TOKEN}`);

  // Schemes this build does not register are still refused.
  expect(parseConnectDeepLink(`other-app://connect?token=${TOKEN}`)).toBeNull();
  expect(parseChatDeepLink("other-app://chat?prompt=hi")).toBeNull();
});
