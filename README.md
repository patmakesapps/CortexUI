# Cortex UI

Production-oriented, modular chat interface for CortexLTM memory workflows.

## Release Notes (Feb 2026)

- Improved streaming "thinking" UX while waiting for agent responses:
  - shows one live step at a time (no step counters)
  - rotates tool-specific progress copy for Gmail, Calendar, Drive, and Web Search
  - avoids duplicate loader text when headline and active step match
- Improved reaction reliability for streamed assistant messages:
  - reaction calls now resolve temporary UI IDs to persisted event IDs before POSTing

- Added production-oriented Supabase auth flow with:
  - Email/password sign-in
  - Create-account flow
  - OAuth sign-in (Google, GitHub)
- Added secure session handling via HTTP-only cookies.
- Added auth API routes under `src/app/api/auth/*`.
- Added `/auth/callback` flow for OAuth session finalization.
- Updated chat API proxying to forward bearer auth to CortexLTM.
- Added `AUTH_MODE` support (`dev` and `supabase`) for easier OSS onboarding.
- Added soul-contract injection for local/demo provider calls via `CORTEX_SOUL_SPEC_PATH` or `../CortexLTM/soul/SOUL.md`.
- Improved CortexLTM error propagation so UI routes return upstream status/details instead of generic 503s.
- Added delete-confirmation loading UI using the shared brain loader.
- Hardened assistant message rendering for streamed markdown code blocks:
  - supports fenced blocks that start after list prefixes
  - tolerates trailing text on closing fences
  - preserves code rendering when a model omits a closing fence
- Improved chat thread switching UX:
  - added transition/loading states when changing threads
  - composer disables during transition to prevent cross-thread sends

## Status

This project is in early development. APIs, UI behavior, and module boundaries may change quickly.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Framer Motion
- CortexLTM HTTP memory backend integration

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env template:
   ```bash
   # macOS/Linux
   cp .env.example .env.local

   # Windows (cmd)
   copy .env.example .env.local
   ```
3. Set required values in `.env.local`:
   - `CORTEX_MEMORY_BACKEND=cortex_http`
   - `CORTEX_API_BASE_URL` (for example: `http://127.0.0.1:8000`)
   - Optional `CORTEX_API_KEY` (must match `CORTEXLTM_API_KEY` when backend auth is enabled)
   - `AUTH_MODE=dev` (or `supabase` when backend enforces bearer tokens)
   - `APP_ORIGIN` (for example: `http://localhost:3000`, used for OAuth callback URLs)
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` when using Supabase auth
   - Keep `CHAT_DEMO_MODE=false` for real backend chat (set to `true` only for isolated local UI demos)
   - Optional `CORTEX_SOUL_SPEC_PATH` (absolute or workspace-relative path to `SOUL.md`)
4. Start development server:
   ```bash
   npm run dev
   ```

Open `http://localhost:3000`.

Before starting CortexUI, run CortexLTM API:

```bash
uvicorn cortexltm.api:app --host 0.0.0.0 --port 8000
```

## API Routes

- `GET /api/auth/session` current auth state
- `POST /api/auth/sign-in` email/password sign-in
- `POST /api/auth/sign-up` email/password account creation
- `POST /api/auth/oauth/start` start OAuth login (Google/GitHub)
- `POST /api/auth/sign-out` clear local auth cookies
- `GET /api/chat/threads` list threads for resolved user
- `POST /api/chat/threads` create thread
- `GET /api/chat/[threadId]/messages` fetch recent messages
- `POST /api/chat/[threadId]/messages` proxy chat requests to CortexLTM (`/v1/threads/{threadId}/chat`)
- `POST /api/chat/[threadId]/messages/[messageId]/reaction` save/clear a reaction on assistant messages (`thumbs_up`, `heart`, `angry`, `sad`, `brain`)
- `PATCH /api/chat/[threadId]` rename thread
- `DELETE /api/chat/[threadId]` delete thread
- `POST /api/chat/[threadId]/promote` promote thread to core memory
- `GET /api/chat/[threadId]/summary` fetch active summary (optional)

## Cortex Ordering Contract

`POST /api/chat/[threadId]/messages` enforces:

1. `addUserEvent(...source:"chatui")` in CortexLTM
2. `buildMemoryContext(...)` in CortexLTM
3. model generation in CortexLTM
4. `addAssistantEvent(...source:"chatui_llm")` in CortexLTM

This preserves summary trigger timing that depends on assistant writes.

Assistant message reactions:
- Reactions are behind a compact per-message toggle and expand inline on click/tap.
- Selecting the `brain` reaction triggers an immediate upstream summary write in CortexLTM.
- Reaction updates are optimistic and do not auto-scroll the transcript.

## Notes

- In `AUTH_MODE=supabase`, users must sign in before chat routes initialize.
- CortexUI stores Supabase access/refresh tokens in HTTP-only cookies and forwards bearer auth to CortexLTM.
- CortexLTM HTTP integration is isolated in `src/lib/memory/cortex-http-provider.ts`.
- For local/demo provider mode (`CHAT_DEMO_MODE=true` or local threads), CortexUI prepends the soul contract before model calls.
- Additional design/implementation details live in `ARCHITECTURE.md` and active work items are tracked in `TODO.md`.
