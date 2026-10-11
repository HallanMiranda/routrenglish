<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- UI strings live in `src/lib/i18n/pt-BR.ts`; study content stays in English — keeps copy in one place.
- App pages use `AppShell` (header + BottomNav); the session route is full-screen without nav — consistent mobile layout.
- All OpenAI calls go through `src/ai/client.ts` (user's own key, stored on-device via `repo`, called from the browser), and every AI feature falls back to the local version when the key is missing, the switch is off, offline, or the call fails; any future shared/server AI goes through Lovable AI Gateway server functions — personal no-backend phase, user's explicit choice.
- Offline app-shell support uses vite-plugin-pwa generateSW after explicit public-root prerendering; NetworkFirst navigations exclude API/OAuth and the sole registration wrapper refuses dev, previews, iframes, and sw=off — avoids stale previews and private-data caching. Remove root prerendering before Hoje gains authenticated data.
- Theme preference is browser-local and applied after hydration with CSS system fallback — follows device settings without SSR mismatches or Cloud dependencies.
- MicButton is a controlled presentation component; demo timers belong to the session — keeps microphone visuals reusable and separate from future audio capture.
- UI reads/writes app data only through `repo` from `src/data/repo.ts` (currently localStorage-backed `localRepo`) — lets the storage be swapped for a cloud backend without touching screens.
- Speech uses browser APIs in `src/speech/`, and `src/ai/converse.ts` is a scripted mock with the final signature — free local testing before any API keys.
- Hands-free lessons (`/aula`) run one async loop in the route with refs for stop/pause/button commands; listening goes through `src/lesson/hear.ts` and judging reuses `src/ai/judge.ts` + `src/drills/check.ts` — one judging path for every screen.
