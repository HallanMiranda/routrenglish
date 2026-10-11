# Routrenglish

I'm building Speak Lab: a personal app (PWA, mobile-first) for me to practice speaking English every day. Do not write code yet: only propose the plan.

Stack: React + TypeScript + Vite + Tailwind + shadcn/ui, Supabase (Postgres, Auth, Storage, Edge Functions). The UI is in Brazilian Portuguese; the study content is in English.

How it works: every day I get a "mission" (a real-life situation, e.g. ordering a coffee). Each session has 6 steps: 1) listening drill, 2) mission model with shadowing, 3) guided practice of the key phrases, 4) live mission talking by voice with the AI, 5) 4/3/2 fluency round (telling the same story in 90 s, 75 s and 60 s), 6) report with 3 errors that become review cards.

Screens: Today (Hoje), Session (full screen), Report, Review, Library, Progress, Login.

Tables: missions, sessions, utterances, errors, cards, checkpoints, materials, material_items, br_errors, api_usage.

Edge Functions (they keep the OpenAI keys server-side): transcribe, converse, report, ingest.

Propose: folder structure, routes, main components, and the build order in small steps. I will build one step at a time.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://routrenglish.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/212e1373-3849-4b02-a055-755ff5f8919d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
