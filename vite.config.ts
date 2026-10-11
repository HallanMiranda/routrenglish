// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA, type VitePluginPWAAPI } from "vite-plugin-pwa";

const pwa = VitePWA({
  strategies: "generateSW",
  outDir: "dist/client",
  filename: "sw.js",
  manifest: false,
  injectRegister: null,
  registerType: "autoUpdate",
  devOptions: { enabled: false },
  workbox: {
    globDirectory: "dist/client",
    globPatterns: ["**/*.{js,css,woff,woff2,png,webmanifest}", "index.html"],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    navigateFallback: null,
    // HTML is never served by the precache router; navigations use NetworkFirst.
    directoryIndex: null,
    ignoreURLParametersMatching: [],
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: ({ request, url }) => request.mode === "navigate" && url.origin === self.location.origin &&
          !/^\/(?:api|~oauth)(?:\/|$)/.test(url.pathname) && !url.pathname.startsWith("/_serverFn/"),
        handler: "NetworkFirst",
        options: {
          cacheName: "speak-lab-pages",
          networkTimeoutSeconds: 4,
          cacheableResponse: { statuses: [200] },
          expiration: { maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 },
          precacheFallback: { fallbackURL: "/index.html" },
        },
      },
      {
        urlPattern: ({ url }) => url.origin === self.location.origin && /^\/assets\/.*-[\w-]+\.(?:js|css|woff2?)$/.test(url.pathname),
        handler: "CacheFirst",
        options: { cacheName: "speak-lab-assets", expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 } },
      },
    ],
  },
});

export default defineConfig({
  vite: {
    plugins: [
      ...pwa,
      {
        name: "speak-lab-offline-shell",
        apply: "build",
        // TanStack prerenders after client compilation; regenerate the worker last.
        buildApp: {
          order: "post",
          async handler() {
            const api = pwa.find((plugin) => plugin.name === "vite-plugin-pwa")?.api as VitePluginPWAAPI | undefined;
            if (!api) throw new Error("Speak Lab PWA plugin is unavailable");
            await api.generateSW();
          },
        },
      },
    ],
  },
  tanstackStart: {
    pages: [{ path: "/" }],
    prerender: { enabled: true, autoStaticPathsDiscovery: false },
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
