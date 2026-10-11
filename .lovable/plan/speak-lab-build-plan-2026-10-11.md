# Speak Lab: Build Plan

A personal, mobile-first PWA for practicing spoken English every day. The UI is in Brazilian Portuguese and the study content is in English.

## Changes to your proposed stack (please confirm)

This project runs on a fixed platform stack, so a few parts of your proposal shift:

| You proposed | What we'll use instead | Why |
|---|---|---|
| React + Vite SPA | TanStack Start (React 19 + Vite 7 + Tailwind v4 + shadcn) | This is the project's built-in framework. Routing is file-based. |
| Supabase | Lovable Cloud (Postgres, Auth, Storage) | It's the same capabilities and needs no external account. |
| Supabase Edge Functions | Server functions (`createServerFn`) plus server routes under `src/routes/api/` | Edge Functions aren't used in this stack. The keys still stay on the server. |
| Your own OpenAI keys | Lovable AI Gateway (`LOVABLE_API_KEY`, server-only) | You don't need to manage any keys. It covers chat, speech-to-text, text-to-speech, and live voice. |
| "converse" as record → transcribe → reply → speak | GPT Live realtime voice for step 4 | It gives a natural back-and-forth with interruptions. The other steps use separate speech-to-text and text-to-speech calls. |

AI usage is billed per request. There's a small free monthly allowance, and after that you need credits.

## Routes

```text
src/routes/
  __root.tsx                 shell, PWA meta, Toaster, auth listener
  login.tsx                  /login (public)
  _authenticated/
    route.tsx                auth gate (managed)
    index.tsx                /          Hoje (Today)
    sessao.$sessionId.tsx    /sessao/:id  full-screen session (6 steps)
    relatorio.$sessionId.tsx /relatorio/:id  Report
    revisao.tsx              /revisao   Review (cards due)
    biblioteca.tsx           /biblioteca  Library (missions + materials)
    biblioteca.$materialId.tsx  material detail
    progresso.tsx            /progresso  Progress
  api/
    transcribe.ts            POST audio -> text (STT, streaming SSE)
    tts.ts                   POST text -> audio (model + listening audio)
    live.ts                  GPT Live relay (step 4)
```

## Folder structure

```text
src/
  routes/                    (see above)
  components/
    ui/                      shadcn
    layout/  BottomNav, AppHeader, FullscreenShell
    session/ StepProgress, StepShell,
             ListeningDrill, ShadowingModel, GuidedPractice,
             LiveMission, FluencyRound432, SessionReport
    audio/   Recorder, AudioPlayer, Waveform, CountdownRing
    review/  ReviewCard, ReviewQueue
    progress/ StreakCalendar, MetricsChart
    library/ MissionCard, MaterialCard, IngestForm
  hooks/     use-recorder, use-live-voice, use-session-state, use-tts
  lib/
    *.functions.ts           server functions (missions, sessions, report, ingest, cards, progress)
    *.server.ts              AI gateway helpers, prompts, SRS logic
    i18n/pt-BR.ts            UI strings
    srs.ts                   spaced-repetition scheduling (SM-2 lite)
  assets/
public/ manifest.webmanifest, icons, service worker
```

## Data model (Cloud tables, RLS = owner only)

- **missions**: title, situation, level, key_phrases[], model_dialogue, listening_script
- **sessions**: user_id, mission_id, date, current_step, status, started_at, finished_at
- **utterances**: session_id, step, text, audio_path, duration_ms, wpm
- **errors**: session_id, utterance_id, original, correction, explanation, type
- **cards**: user_id, error_id, front, back, ease, interval, due_at, reps
- **checkpoints**: user_id, date, metrics jsonb (wpm, pauses, error counts)
- **materials / material_items**: your ingested texts or links, split into items
- **br_errors**: catalog of typical Brazilian learner mistakes, used to tag errors
- **api_usage**: user_id, kind, units, cost_estimate, created_at

Storage bucket: `recordings` (private, files stored under the user id).

## Mapping your four functions

- **transcribe** becomes the server route `api/transcribe` (speech-to-text, streaming).
- **converse** becomes the Live voice relay for step 4. It also has a text fallback.
- **report** becomes the server function `generateReport`. It returns structured output (the 3 errors, metrics, and feedback) and creates the review cards.
- **ingest** becomes the server function `ingestMaterial`. It turns a pasted text or link into material items and mission drafts.

## Build order (one small step at a time)

1. **Design system and app shell**: tokens, fonts, Portuguese strings, bottom navigation, empty pages for every route.
2. **PWA basics**: manifest, icons, install prompt, offline shell.
3. **Enable Cloud and login**: email or Google sign-in, auth gate, `/login`.
4. **Schema migration**: all tables, RLS, recordings bucket, and 5 seed missions.
5. **Hoje (Today)**: picks today's mission, starts or resumes a session, shows the streak.
6. **Session shell**: full screen, the 6-step progress bar, resume from `current_step`.
7. **Audio core**: recorder hook, upload to storage, player.
8. **TTS route**, then **Step 1 Listening drill** (hear it, answer comprehension questions).
9. **Step 2 Model and shadowing**: play a line, repeat it, then compare.
10. **Transcribe route**, then **Step 3 Guided practice** (say each key phrase, get a match check).
11. **Step 4 Live mission**: GPT Live relay, role-play prompt, transcript saved to utterances.
12. **Step 5 4/3/2 round**: three timed recordings (90/75/60 s) with words-per-minute and pauses per round.
13. **Report function and Step 6 / Report page**: 3 errors linked to br_errors, cards created.
14. **Review**: due-card queue, spoken answers, SRS updates.
15. **Library**: mission list, materials, ingest form.
16. **Progress**: streak calendar, words-per-minute trend, error types, checkpoints.
17. **api_usage logging and a simple usage view**, plus polish and error states (credits, mic permission).

## Technical notes

- Every AI call goes through the server and uses streaming. When you hit a 402 (out of credits) or a 403, the app shows a clear message in Portuguese.
- Session state lives in the database so you can close the app mid-session and pick up where you left off.
- The 4/3/2 timer runs on the client. The metrics are computed on the server from the transcripts.
