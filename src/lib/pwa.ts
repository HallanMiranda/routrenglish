export function shouldDisableAppWorker(url: URL, production: boolean, framed: boolean) {
  const host = url.hostname;
  const previewDomains = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
  return !production || framed || url.searchParams.get("sw") === "off" ||
    host.startsWith("id-preview--") || host.startsWith("preview--") ||
    previewDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

// The only app-shell registrar. Messaging workers, if added later, are untouched.
export async function initializeAppWorker() {
  if (!("serviceWorker" in navigator)) return;
  const url = new URL(window.location.href);
  if (shouldDisableAppWorker(url, import.meta.env.PROD, window.self !== window.top)) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter((registration) =>
      [registration.active, registration.waiting, registration.installing].some((worker) =>
        worker && new URL(worker.scriptURL).origin === url.origin && new URL(worker.scriptURL).pathname === "/sw.js",
      ),
    ).map((registration) => registration.unregister()));
    return;
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}