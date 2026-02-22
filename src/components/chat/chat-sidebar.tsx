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
      <div className="ui-sidebar flex h-full flex-col">
        <div className={`ui-divider border-b p-2 ${isCollapsed ? "flex justify-center" : ""}`}>
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => void onCreateThread()}
              className="ui-button inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition"
            >
              <span className="text-base leading-none"></span>
              New chat
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onCreateThread()}
              className="ui-button inline-flex h-10 w-10 items-center justify-center rounded-lg text-base font-semibold transition"
              aria-label="New chat"
              title="New chat"
            >
              +
            </button>
          )}
        </div>

        <div className="chat-scroll flex-1 overflow-y-auto p-2">
          {!isCollapsed ? (
            <p className="ui-text-muted mb-2 px-2 text-[11px] uppercase tracking-[0.12em]">Chats</p>
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
                    <form onSubmit={submitRename} className="ui-panel rounded-lg p-1.5">
                      <input
                        autoFocus
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onBlur={() => void submitRename()}
                        className="ui-panel ui-panel-strong w-full rounded-md px-2.5 py-1.5 text-sm outline-none ring-[rgb(var(--accent)/0.4)] focus:ring-1"
                        maxLength={120}
                        disabled={isRenaming}
                      />
                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={cancelRename}
                          disabled={isRenaming}
                          className="ui-button mr-1 inline-flex h-7 items-center justify-center rounded-md px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isRenaming}
                          className="ui-button inline-flex h-7 items-center justify-center rounded-md px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
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
                            ? "ui-thread-item-active"
                            : "ui-thread-item"
                        } ${isCollapsed ? "justify-center px-1" : ""}`}
                        title={label}
                      >
                        {isCollapsed ? (
                          <span className="ui-avatar-badge inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold">
                            {initials(label)}
                          </span>
                        ) : (
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{label}</span>
                            {thread.isCoreMemory ? (
                              <span className="rounded border border-emerald-500/55 bg-emerald-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900">
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
                              className="ui-icon-action invisible inline-flex h-8 w-8 items-center justify-center rounded-md text-xs text-[rgb(var(--muted)/0.95)] transition group-hover:visible"
                              aria-label={`Thread actions for ${label}`}
                              title="Actions"
                            >
                              🧬
                            </button>
                            {openActionsThreadId === thread.id ? (
                              <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-[rgb(var(--border)/1)] bg-[rgb(var(--panel)/1)] p-1 shadow-xl">
                                <button
                                  type="button"
                                  onClick={() => startRename(thread, index)}
                                  className="ui-menu-item flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-[rgb(var(--foreground)/1)] transition"
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
                                    Boolean(thread.isCoreMemory)
                                  }
                                  className="ui-menu-item mt-0.5 flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-[rgb(var(--foreground)/1)] transition disabled:cursor-not-allowed disabled:opacity-55"
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
                            className="ui-icon-danger invisible inline-flex h-8 w-8 items-center justify-center rounded-md text-xs text-rose-400 transition group-hover:visible"
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

        <div className="ui-divider border-t p-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`ui-button inline-flex h-9 items-center justify-center rounded-md text-sm transition ${
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
                    ? "ui-toast-success"
                    : "ui-toast-error"
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
            <div className="ui-overlay fixed inset-0 z-[70] flex items-center justify-center px-4 backdrop-blur-sm">
              <div className="ui-panel w-full max-w-sm rounded-xl p-4 shadow-2xl">
                <h3 className="ui-text-strong text-base font-semibold">Delete chat?</h3>
                <p className="ui-text-body mt-2 text-sm">
                  This will permanently delete{" "}
                  <span className="ui-text-strong font-medium">
                    &quot;{pendingDelete.label}&quot;
                  </span>{" "}
                  and its messages.
                </p>
                {isDeleting ? (
                  <div className="ui-panel ui-panel-strong mt-3 rounded-md p-2.5">
                    <div className="flex items-center gap-2">
                      <BrainLoader subtle className="scale-75 origin-left" />
                      <p className="ui-text-body text-xs">Deleting chat...</p>
                    </div>
                  </div>
                ) : null}
                {deleteError ? (
                  <p className="mt-2 text-xs text-[rgb(var(--status-danger)/1)]">{deleteError}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(null);
                    }}
                    disabled={isDeleting}
                    className="ui-button inline-flex h-9 items-center justify-center rounded-md px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDelete()}
                    disabled={isDeleting}
                    className="ui-button-danger inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="ui-overlay fixed inset-0 z-[70] flex items-center justify-center px-4 backdrop-blur-sm">
              <div className="ui-panel w-full max-w-sm rounded-xl p-4 shadow-2xl">
                <h3 className="ui-text-strong text-base font-semibold">
                  Promote to Core Memory?
                </h3>
                <p className="ui-text-body mt-2 text-sm">
                  Confirm promoting{" "}
                  <span className="ui-text-strong font-medium">
                    &quot;{pendingPromote.label}&quot;
                  </span>{" "}
                  to Core Memory.
                </p>
                <p className="ui-text-subtle mt-2 text-xs">
                  This helps Cortex prioritize this conversation for long-term context and may
                  take a few seconds to complete.
                </p>
                {promotingThreadId === pendingPromote.id ? (
                  <div className="ui-panel ui-panel-strong mt-3 rounded-md p-2.5">
                    <div className="flex items-center gap-2">
                      <BrainLoader subtle className="scale-75 origin-left" />
                      <p className="ui-text-body text-xs">
                        Promoting to Core Memory...
                      </p>
                    </div>
                  </div>
                ) : null}
                {promoteError ? (
                  <p className="mt-2 text-xs text-[rgb(var(--status-danger)/1)]">{promoteError}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPromoteError(null);
                      setPendingPromote(null);
                    }}
                    disabled={Boolean(promotingThreadId)}
                    className="ui-button inline-flex h-9 items-center justify-center rounded-md px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmPromote()}
                    disabled={Boolean(promotingThreadId)}
                    className="ui-button-success inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
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
