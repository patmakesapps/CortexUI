"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatThread } from "@/hooks/use-chat";
import { BrainLoader } from "@/components/ui/brain-loader";

type ChatSidebarProps = {
  threads: ChatThread[];
  activeThreadId: string | null;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onCreateThread: () => Promise<void>;
  onSelectThread: (threadId: string) => Promise<void>;
  onRenameThread: (threadId: string, title: string) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
  onPromoteThread: (threadId: string) => Promise<void>;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

function labelForThread(thread: ChatThread, index: number): string {
  const title = thread.title?.trim();
  if (title) return title;
  return `Chat ${index + 1}`;
}

function initials(text: string): string {
  const parts = text.split(" ").filter(Boolean);
  if (parts.length === 0) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function ChatSidebar({
  threads,
  activeThreadId,
  isCollapsed,
  onToggleCollapsed,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
  onPromoteThread
}: ChatSidebarProps) {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [originalTitle, setOriginalTitle] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [openActionsThreadId, setOpenActionsThreadId] = useState<string | null>(null);
  const [promotingThreadId, setPromotingThreadId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(
    null
  );
  const [pendingPromote, setPendingPromote] = useState<{ id: string; label: string } | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (!openActionsThreadId) return;

    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-actions-menu-root='true']")) return;
      setOpenActionsThreadId(null);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [openActionsThreadId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const startRename = (thread: ChatThread, index: number) => {
    const label = labelForThread(thread, index);
    setOpenActionsThreadId(null);
    setEditingThreadId(thread.id);
    setOriginalTitle(label);
    setDraftTitle(label);
  };

  const cancelRename = () => {
    setEditingThreadId(null);
    setOriginalTitle("");
    setDraftTitle("");
  };

  const submitRename = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!editingThreadId || isRenaming) return;
    const nextTitle = draftTitle.trim();
    if (!nextTitle || nextTitle === originalTitle.trim()) {
      cancelRename();
      return;
    }

    try {
      setIsRenaming(true);
      await onRenameThread(editingThreadId, nextTitle);
      cancelRename();
    } catch {
      // Global error modal handles rename failures.
    } finally {
      setIsRenaming(false);
    }
  };

  const confirmPromote = async () => {
    if (!pendingPromote || promotingThreadId) return;
    setPromoteError(null);
    setPromotingThreadId(pendingPromote.id);
    try {
      await onPromoteThread(pendingPromote.id);
      setPendingPromote(null);
      setToast({ kind: "success", message: "Promoted to Core Memory" });
    } catch (err) {
      setPromoteError(
        err instanceof Error ? err.message : "Could not promote to core memory."
      );
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not promote to core memory."
      });
    } finally {
      setPromotingThreadId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteThread(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete thread right now.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex h-full flex-col border-r border-slate-700/60 bg-slate-900/95">
        <div className={`border-b border-slate-700/60 p-2 ${isCollapsed ? "flex justify-center" : ""}`}>
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => void onCreateThread()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-600/80 bg-slate-800/80 px-3 text-sm font-medium text-slate-100 transition hover:bg-slate-700/80"
            >
              <span className="text-base leading-none">🧠</span>
              New chat
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onCreateThread()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800/80 text-base font-semibold text-slate-100 transition hover:bg-slate-700/80"
              aria-label="New chat"
              title="New chat"
            >
              +
            </button>
          )}
        </div>

        <div className="chat-scroll flex-1 overflow-y-auto p-2">
          {!isCollapsed ? (
            <p className="mb-2 px-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">Chats</p>
          ) : null}
          <ul className="space-y-1">
            {threads.map((thread, index) => {
              const label = labelForThread(thread, index);
              const isActive = activeThreadId === thread.id;
              const isEditing = editingThreadId === thread.id && !isCollapsed;
              const isPromoting = promotingThreadId === thread.id;

              return (
                <li key={thread.id}>
                  {isEditing ? (
                    <form onSubmit={submitRename} className="rounded-lg border border-slate-600/80 bg-slate-800/80 p-1.5">
                      <input
                        autoFocus
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onBlur={() => void submitRename()}
                        className="w-full rounded-md border border-slate-500/80 bg-slate-900/90 px-2.5 py-1.5 text-sm text-slate-100 outline-none ring-slate-300/30 focus:ring-1"
                        maxLength={120}
                        disabled={isRenaming}
                      />
                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={cancelRename}
                          disabled={isRenaming}
                          className="mr-1 inline-flex h-7 items-center justify-center rounded-md border border-slate-600/80 bg-slate-800/85 px-2.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700/85 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isRenaming}
                          className="inline-flex h-7 items-center justify-center rounded-md border border-slate-500/80 bg-slate-700/90 px-2.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isRenaming ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void onSelectThread(thread.id)}
                        className={`flex min-w-0 flex-1 items-center rounded-lg px-2 py-2 text-left text-sm transition ${
                          isActive
                            ? "bg-slate-700/80 text-slate-100"
                            : "text-slate-200 hover:bg-slate-800/85"
                        } ${isCollapsed ? "justify-center px-1" : ""}`}
                        title={label}
                      >
                        {isCollapsed ? (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-500/80 bg-slate-900/90 text-xs font-semibold">
                            {initials(label)}
                          </span>
                        ) : (
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{label}</span>
                            {thread.isCoreMemory ? (
                              <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
                                Core
                              </span>
                            ) : null}
                          </span>
                        )}
                      </button>

                      {!isCollapsed ? (
                        <>
                          <div className="relative" data-actions-menu-root="true">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenActionsThreadId((prev) =>
                                  prev === thread.id ? null : thread.id
                                )
                              }
                              className="invisible inline-flex h-8 w-8 items-center justify-center rounded-md text-xs text-slate-300 transition hover:bg-slate-700/80 group-hover:visible"
                              aria-label={`Thread actions for ${label}`}
                              title="Actions"
                            >
                              🧬
                            </button>
                            {openActionsThreadId === thread.id ? (
                              <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-slate-600/80 bg-slate-800/95 p-1 shadow-xl">
                                <button
                                  type="button"
                                  onClick={() => startRename(thread, index)}
                                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-slate-100 transition hover:bg-slate-700/85"
                                >
                                  Rename thread
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionsThreadId(null);
                                    setPromoteError(null);
                                    setPendingPromote({ id: thread.id, label });
                                  }}
                                  disabled={
                                    isPromoting ||
                                    thread.id.startsWith("local-") ||
                                    thread.id.startsWith("draft-") ||
                                    Boolean(thread.isCoreMemory)
                                  }
                                  className="mt-0.5 flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-slate-100 transition hover:bg-slate-700/85 disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                  {isPromoting
                                    ? "Syncing to Cortex..."
                                    : thread.isCoreMemory
                                      ? "Already in Core Memory"
                                      : "Promote to Core Memory"}
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setPendingDelete({ id: thread.id, label });
                            }}
                            className="invisible inline-flex h-8 w-8 items-center justify-center rounded-md text-xs text-rose-300 transition hover:bg-rose-900/35 group-hover:visible"
                            aria-label={`Delete ${label}`}
                            title="Delete"
                          >
                            ❌
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-slate-700/60 p-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`inline-flex h-9 items-center justify-center rounded-md border border-slate-600/80 bg-slate-800/75 text-sm text-slate-100 transition hover:bg-slate-700/80 ${
              isCollapsed ? "w-9" : "w-full gap-2"
            }`}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="font-semibold">{isCollapsed ? "⟳" : "⟲"}</span>
            {!isCollapsed ? <span>Collapse</span> : null}
          </button>
        </div>
      </div>

      {isMounted && toast
        ? createPortal(
            <div className="fixed bottom-4 right-4 z-[80]">
              <div
                className={`rounded-md border px-3 py-2 text-sm shadow-xl ${
                  toast.kind === "success"
                    ? "border-emerald-500/50 bg-emerald-900/80 text-emerald-100"
                    : "border-rose-500/50 bg-rose-900/80 text-rose-100"
                }`}
              >
                {toast.message}
              </div>
            </div>,
            document.body
          )
        : null}

      {isMounted && pendingDelete
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-xl border border-slate-600/70 bg-slate-900/95 p-4 shadow-2xl">
                <h3 className="text-base font-semibold text-slate-100">Delete chat?</h3>
                <p className="mt-2 text-sm text-slate-300">
                  This will permanently delete{" "}
                  <span className="font-medium text-slate-100">
                    &quot;{pendingDelete.label}&quot;
                  </span>{" "}
                  and its messages.
                </p>
                {deleteError ? (
                  <p className="mt-2 text-xs text-rose-300">{deleteError}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(null);
                    }}
                    disabled={isDeleting}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-600/70 bg-slate-800/75 px-3 text-sm text-slate-100 transition hover:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDelete()}
                    disabled={isDeleting}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-rose-700/70 bg-rose-900/45 px-3 text-sm font-medium text-rose-100 transition hover:bg-rose-800/55 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? "Deleting..." : "Delete chat"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {isMounted && pendingPromote
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-xl border border-slate-600/70 bg-slate-900/95 p-4 shadow-2xl">
                <h3 className="text-base font-semibold text-slate-100">
                  Promote to Core Memory?
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  Confirm promoting{" "}
                  <span className="font-medium text-slate-100">
                    &quot;{pendingPromote.label}&quot;
                  </span>{" "}
                  to Core Memory.
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  This helps Cortex prioritize this conversation for long-term context and may
                  take a few seconds to complete.
                </p>
                {promotingThreadId === pendingPromote.id ? (
                  <div className="mt-3 rounded-md border border-slate-700/70 bg-slate-800/70 p-2.5">
                    <div className="flex items-center gap-2">
                      <BrainLoader subtle className="scale-75 origin-left" />
                      <p className="text-xs text-slate-300">
                        Promoting to Core Memory...
                      </p>
                    </div>
                  </div>
                ) : null}
                {promoteError ? (
                  <p className="mt-2 text-xs text-rose-300">{promoteError}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPromoteError(null);
                      setPendingPromote(null);
                    }}
                    disabled={Boolean(promotingThreadId)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-600/70 bg-slate-800/75 px-3 text-sm text-slate-100 transition hover:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmPromote()}
                    disabled={Boolean(promotingThreadId)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-emerald-700/70 bg-emerald-900/45 px-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-800/55 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {promotingThreadId ? "Promoting..." : "Confirm promotion"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
