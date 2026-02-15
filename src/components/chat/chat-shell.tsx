"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { BrainLoader } from "@/components/ui/brain-loader";
import { useChat } from "@/hooks/use-chat";

export function ChatShell() {
  const router = useRouter();
  const {
    threadId,
    threads,
    messages,
    isBootstrapping,
    isThreadTransitioning,
    isStreaming,
    error,
    clearError,
    selectThread,
    createThread,
    renameThread,
    deleteThread,
    promoteThread,
    sendMessage,
    reactToMessage
  } = useChat();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const hasMessages = messages.length > 0;
  const showTransitionSkeleton = isThreadTransitioning && !isBootstrapping;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsMobileViewport(media.matches);
    syncViewport();

    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  const sidebarIsCollapsed = isMobileViewport ? false : sidebarCollapsed;

  const handleToggleSidebar = () => {
    if (isMobileViewport) {
      setMobileSidebarOpen(false);
      return;
    }
    setSidebarCollapsed((prev) => !prev);
  };

  return (
    <main className="flex h-full max-h-full w-full overflow-hidden">
      <div
        className={`ui-overlay fixed inset-0 z-30 transition-opacity md:hidden ${
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileSidebarOpen(false)}
      />

      <aside
        className={`absolute left-0 top-0 z-40 h-full w-72 transition-transform duration-200 md:static md:z-auto md:h-auto md:translate-x-0 ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarIsCollapsed ? "md:w-20" : "md:w-72"}`}
      >
        <ChatSidebar
          threads={threads}
          activeThreadId={threadId}
          isCollapsed={sidebarIsCollapsed}
          onToggleCollapsed={handleToggleSidebar}
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
          onPromoteThread={promoteThread}
          onOpenIntegrations={() => router.push("/apps")}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="ui-topbar flex items-center gap-2 px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="ui-button inline-flex h-9 items-center justify-center rounded-md px-2.5 text-sm md:hidden"
            aria-label="Open chats"
          >
            Menu
          </button>
          <span className="ui-text-muted truncate text-sm">
            {threads.find((thread) => thread.id === threadId)?.title?.trim() || "New chat"}
          </span>
        </div>

        {isBootstrapping ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-sm text-[rgb(var(--foreground)/0.62)]">
            <BrainLoader />
            <p>Initializing chat thread...</p>
          </section>
        ) : showTransitionSkeleton ? (
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 md:px-4">
            <div className="chat-scroll chat-fade-scroll flex-1 overflow-y-auto px-1 pb-6 pt-4 md:px-2 md:pb-8">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                <div className="h-5 w-56 animate-pulse rounded bg-slate-700/45" />
                <div className="h-24 w-[82%] animate-pulse rounded-2xl bg-slate-800/55" />
                <div className="ml-auto h-20 w-[70%] animate-pulse rounded-2xl bg-slate-700/45" />
                <div className="h-16 w-[78%] animate-pulse rounded-2xl bg-slate-800/50" />
              </div>
            </div>
            <Composer
              onSend={sendMessage}
              isDisabled
              isStreaming={false}
            />
          </section>
        ) : !hasMessages ? (
          <section className="flex flex-1 flex-col items-center justify-center px-3 md:px-4">
            <div className="mx-auto w-full max-w-4xl">
              <div className="mb-7 text-center">
                <h2 className="text-3xl font-semibold text-[rgb(var(--foreground)/0.9)] md:text-4xl">
                  Welcome back
                </h2>
                <p className="mt-3 text-sm text-[rgb(var(--muted)/1)] md:text-base">
                  Ask anything to get started. Your context is memory-aware.
                </p>
              </div>
              <Composer
                onSend={sendMessage}
                isDisabled={isBootstrapping || isThreadTransitioning}
                isStreaming={isStreaming}
                inline
              />
              {isThreadTransitioning ? (
            <div className="ui-text-muted mt-3 text-center text-xs">
                  Preparing chat...
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <>
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 md:px-4">
              <MessageList
                messages={messages}
                isStreaming={isStreaming}
                onReactToMessage={reactToMessage}
              />
              {isThreadTransitioning ? (
                <div className="ui-text-muted px-2 py-2 text-xs">Loading messages...</div>
              ) : null}
            </section>

            <Composer
              onSend={sendMessage}
              isDisabled={isBootstrapping || isThreadTransitioning}
              isStreaming={isStreaming}
            />
          </>
        )}

        {error ? (
          <div className="ui-overlay fixed inset-0 z-[60] flex items-center justify-center px-4 backdrop-blur-sm">
            <div className="ui-panel w-full max-w-md rounded-xl p-4 shadow-2xl">
              <div className="ui-alert-error rounded-lg px-3 py-2">
                <h3 className="text-base font-semibold">Something went wrong</h3>
                <p className="mt-2 text-sm">{error}</p>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={clearError}
                  className="ui-button inline-flex h-9 items-center justify-center rounded-md px-3 text-sm transition"
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
