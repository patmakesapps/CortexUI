"use client";

import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { useChat } from "@/hooks/use-chat";

type Props = {
  allowLocalFallback?: boolean;
};

export function ChatShell({ allowLocalFallback = true }: Props) {
  const { threadId, messages, isBootstrapping, isStreaming, error, sendMessage } =
    useChat({ allowLocalFallback });
  const hasMessages = messages.length > 0;

  return (
    <main className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden">
      {isBootstrapping ? (
        <section className="flex flex-1 items-center justify-center px-4 text-sm text-slate-400">
          Initializing chat thread...
        </section>
      ) : !hasMessages ? (
        <section className="flex flex-1 flex-col items-center justify-center px-3 md:px-4">
          <div className="mx-auto w-full max-w-4xl">
            <div className="mb-7 text-center">
              <h2 className="text-3xl font-semibold text-slate-100 md:text-4xl">
                Welcome back
              </h2>
              <p className="mt-3 text-sm text-slate-400 md:text-base">
                {threadId
                  ? "Ask anything to get started. Your context is memory-aware."
                  : "Finish sign-in or refresh to start a secure chat session."}
              </p>
            </div>
            <Composer
              onSend={sendMessage}
              isDisabled={isBootstrapping || !threadId}
              isStreaming={isStreaming}
              inline
            />
          </div>
        </section>
      ) : (
        <>
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 md:px-4">
            <MessageList messages={messages} isStreaming={isStreaming} />
          </section>

          <Composer
            onSend={sendMessage}
            isDisabled={isBootstrapping || !threadId}
            isStreaming={isStreaming}
          />
        </>
      )}

      {error ? (
        <div className="border-t border-rose-700/40 bg-rose-950/30 px-4 py-2 text-xs text-rose-200 md:mx-4 md:rounded-t-xl">
          <div className="mx-auto max-w-4xl">{error}</div>
        </div>
      ) : null}
    </main>
  );
}
