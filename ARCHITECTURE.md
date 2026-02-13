# Architecture

## Boundaries

- `src/lib/memory/`
  - `types.ts`: thread, event, context contracts
  - `memory-provider.ts`: backend-agnostic memory interface
  - `cortex-http-provider.ts`: CortexLTM API implementation (UI does not write SQL)
- `src/lib/llm/`
  - `llm-provider.ts`: model streaming interface
  - `default-llm-provider.ts`: OpenAI/Groq streaming provider used for demo/local mode, with soul-contract system injection
- `src/lib/server/`
  - `providers.ts`: provider selection + singleton lifecycle
  - `db.ts`: postgres pool initialization
  - `user-id.ts`: stable user ID resolver shim
  - `http.ts`: shared API error payload helper
- `src/app/api/chat/`
  - `threads/route.ts`: list/create thread endpoints
  - `[threadId]/route.ts`: rename/delete thread endpoints
  - `[threadId]/messages/route.ts`: message read + ordered write/stream endpoint
  - `[threadId]/promote/route.ts`: promote thread to core-memory endpoint
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
- Model provider: backend-owned in CortexLTM when `CHAT_DEMO_MODE=false`.
- Agent orchestration: set `CORTEX_AGENT_ENABLED=true` to route chat via CortexAgent while keeping the same UI route contracts.
- UI composition: keep message contracts stable (`UIMessage`) and replace components independently.

## Request Lifecycle (`POST /api/chat/[threadId]/messages`)

1. Validate payload.
2. If `CHAT_DEMO_MODE=true`, stream local demo output.
3. Otherwise proxy to CortexLTM `/v1/threads/{threadId}/chat` or CortexAgent `/v1/agent/threads/{threadId}/chat` when enabled.
4. CortexLTM performs ordered writes/context/model call:
   - persist user event (`source: chatui`)
   - build context (summary cues + semantic cues + short-term events)
   - generate assistant response
   - persist assistant event (`source: chatui_llm`)

## Error Propagation

- CortexUI now preserves upstream CortexLTM HTTP status/error details for thread/message routes.
- This avoids masking backend failures as generic `503` responses, making operational debugging faster.

## Cue Policy (v1 parity)

- Summary cues: recap, summarize, catch me up, where were we, continue
- Semantic cues: remember, what did i say, what was the plan, who am i, my name
- Memory blocks are prepended as `system` messages before short-term turns.
