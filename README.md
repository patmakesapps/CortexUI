# Cortex UI

Production-oriented, modular chat interface for CortexLTM memory workflows.

## Status

This project is in early development. APIs, UI behavior, and module boundaries may change quickly.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Framer Motion
- PostgreSQL adapter (`pg`) for Cortex memory tables

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
   - `SUPABASE_DB_URL`
   - `CORTEX_MEMORY_BACKEND=cortex`
   - At least one model key:
     - `OPENAI_API_KEY`, or
     - `GROQ_API_KEY`
   - Keep `CHAT_DEMO_MODE=true` for temporary hardcoded streaming responses (set to `false` to use real model APIs)
4. Start development server:
   ```bash
   npm run dev
   ```

Open `http://localhost:3000`.

## API Routes

- `GET /api/chat/threads` list threads for resolved user
- `POST /api/chat/threads` create thread
- `GET /api/chat/[threadId]/messages` fetch recent messages
- `POST /api/chat/[threadId]/messages` persist user event, stream assistant output, persist assistant event
- `GET /api/chat/[threadId]/summary` fetch active summary (optional)

## Cortex Ordering Contract

`POST /api/chat/[threadId]/messages` enforces:

1. `addUserEvent(...source:"chatui")`
2. `buildMemoryContext(...)`
3. stream model output to client
4. `addAssistantEvent(...source:"chatui_llm")` once stream ends

This preserves summary trigger timing that depends on assistant writes.

## Notes

- User resolution currently uses request headers/cookies (`x-user-id`, `x-auth-sub`, `cortex_user_id`) with deterministic UUID fallback.
- Cortex-specific table/query behavior is isolated in `src/lib/memory/cortex-provider.ts`.
