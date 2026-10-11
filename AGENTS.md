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
- AI calls go through Lovable AI Gateway from server functions/server routes only, never Supabase Edge Functions — keys stay server-side on the fixed stack.
