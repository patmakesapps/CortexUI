# Architecture

## Boundaries

- `src/lib/memory/`
  - `types.ts`: thread, event, context contracts
  - `memory-provider.ts`: backend-agnostic memory interface
  - `cortex-http-provider.ts`: CortexLTM API implementation (UI does not write SQL)
- `src/lib/llm/`
  - `llm-provider.ts`: model streaming interface
  - `default-llm-provider.ts`: OpenAI/Groq streaming implementation
- `src/lib/server/`
  - `providers.ts`: provider selection + singleton lifecycle
  - `db.ts`: postgres pool initialization
  - `user-id.ts`: stable user ID resolver shim
  - `http.ts`: shared API error payload helper
- `src/app/api/chat/`
  - `threads/route.ts`: list/create thread endpoints
  - `[threadId]/messages/route.ts`: message read + ordered write/stream endpoint
  - `[threadId]/summary/route.ts`: optional summary fetch endpoint
- `src/components/chat/`
  - `chat-shell.tsx`: page-level composition
  - `message-list.tsx`: scrolling transcript + typing indicator
  - `message-item.tsx`: bubble rendering + assistant animation
  - `composer.tsx`: input/send UX
  - `typing-indicator.tsx`: in-flight visual
- `src/hooks/use-chat.ts`
  - client state machine: thread bootstrap, optimistic add, stream consume, errors

## Swap Points

- Memory backend: implement `MemoryProvider`, then switch selection in `getMemoryProvider`.
- Model provider: implement `LlmProvider`, then switch selection in `getLlmProvider`.
- UI composition: keep message contracts stable (`UIMessage`) and replace components independently.

## Request Lifecycle (`POST /api/chat/[threadId]/messages`)

1. Validate payload.
2. Persist user event (`source: chatui`).
3. Build context:
   - cue-based summary block
   - cue-based semantic block
   - recent short-term events in chronological order
4. Stream LLM output chunk-by-chunk to client.
5. Persist one assistant event at completion (`source: chatui_llm`).

## Cue Policy (v1 parity)

- Summary cues: recap, summarize, catch me up, where were we, continue
- Semantic cues: remember, what did i say, what was the plan, who am i, my name
- Memory blocks are prepended as `system` messages before short-term turns.
