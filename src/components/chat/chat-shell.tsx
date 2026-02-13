"use client";

import { useState } from "react";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { BrainLoader } from "@/components/ui/brain-loader";
import { useChat } from "@/hooks/use-chat";

type Props = {
  allowLocalFallback?: boolean;
};

export function ChatShell({ allowLocalFallback = true }: Props) {
  const {
    threadId,
    threads,
    messages,
    isBootstrapping,
    isStreaming,
    error,
    clearError,
    selectThread,
    createThread,
    renameThread,
    deleteThread,
    sendMessage
  } = useChat({ allowLocalFallback });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const hasMessages = messages.length > 0;

  return (
    <main className="flex h-full max-h-full w-full overflow-hidden">
      <div
        className={`fixed inset-0 z-30 bg-slate-950/65 transition-opacity md:hidden ${
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileSidebarOpen(false)}
      />

      <aside
        className={`absolute left-0 top-0 z-40 h-full w-72 transition-transform duration-200 md:static md:z-auto md:h-auto md:translate-x-0 ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "md:w-20" : "md:w-72"}`}
      >
        <ChatSidebar
          threads={threads}
          activeThreadId={threadId}
          isCollapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
          onCreateThread={async () => {
            setMobileSidebarOpen(false);
            await createThread();
          }}
          onSelectThread={async (nextThreadId) => {
            setMobileSidebarOpen(false);
            await selectThread(nextThreadId);
          }}
          onRenameThread={renameThread}
          onDeleteThread={deleteThread}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-700/40 px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600/70 bg-slate-800/75 text-sm text-slate-100"
            aria-label="Open chats"
          >
            Menu
          </button>
          <span className="truncate text-sm text-slate-300">
            {threads.find((thread) => thread.id === threadId)?.title?.trim() || "New chat"}
          </span>
        </div>

        {isBootstrapping ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-sm text-slate-400">
            <BrainLoader />
            <p>Initializing chat thread...</p>
          </section>
        ) : !hasMessages ? (
          <section className="flex flex-1 flex-col items-center justify-center px-3 md:px-4">
            <div className="mx-auto w-full max-w-4xl">
              <div className="mb-7 text-center">
                <h2 className="text-3xl font-semibold text-slate-100 md:text-4xl">
                  Welcome back
                </h2>
                <p className="mt-3 text-sm text-slate-400 md:text-base">
                  Ask anything to get started. Your context is memory-aware.
                </p>
              </div>
              <Composer
                onSend={sendMessage}
                isDisabled={isBootstrapping}
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
              isDisabled={isBootstrapping}
              isStreaming={isStreaming}
            />
          </>
        )}

        {error ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-rose-700/45 bg-slate-900/95 p-4 shadow-2xl">
              <h3 className="text-base font-semibold text-rose-100">Something went wrong</h3>
              <p className="mt-2 text-sm text-rose-200">{error}</p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={clearError}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-600/70 bg-slate-800/75 px-3 text-sm text-slate-100 transition hover:bg-slate-700/80"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
