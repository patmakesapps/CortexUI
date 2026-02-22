# Phase 2 TODO

1. Auth hardening and policy polish
- Add explicit UX for expired/invalid Supabase sessions across chat routes.
- Add per-route auth telemetry (unauthorized vs forbidden vs upstream auth failure).

2. Tests
- Unit test cue detection and context assembly in `cortex-http-provider`.
- Integration test message ordering contract and assistant persistence on stream completion.
- Component tests for `use-chat` streaming state transitions.
- Component tests for malformed markdown/code-fence rendering in `message-item`.

3. Resilience and retries
- Add transient retry policy for model calls and database writes where safe.
- Add client-side retry button for failed assistant generation.

4. Performance
- Virtualize long message lists.
- Add pagination for historical thread events.

5. UX refinement
- Thread list sidebar + rename/archive actions.
- Optional theme toggle and persisted UI preferences.
- Better markdown/code formatting for assistant responses.

6. Observability
- Structured request IDs and latency logging.
- Metrics for token stream timing and DB write failures.
