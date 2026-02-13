"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatThread } from "@/hooks/use-chat";

type ChatSidebarProps = {
  threads: ChatThread[];
  activeThreadId: string | null;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onCreateThread: () => Promise<void>;
  onSelectThread: (threadId: string) => Promise<void>;
  onRenameThread: (threadId: string, title: string) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
};

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
  onDeleteThread
}: ChatSidebarProps) {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const startRename = (thread: ChatThread, index: number) => {
    setEditingThreadId(thread.id);
    setDraftTitle(labelForThread(thread, index));
  };

  const submitRename = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!editingThreadId || isRenaming) return;
    const nextTitle = draftTitle.trim();
    if (!nextTitle) return;
    try {
      setIsRenaming(true);
      await onRenameThread(editingThreadId, nextTitle);
      setEditingThreadId(null);
    } catch {
      // Global error modal handles rename failures.
    } finally {
      setIsRenaming(false);
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
            <p className="mb-2 px-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">
              Chats
            </p>
          ) : null}
          <ul className="space-y-1">
            {threads.map((thread, index) => {
              const label = labelForThread(thread, index);
              const isActive = activeThreadId === thread.id;
              const isEditing = editingThreadId === thread.id && !isCollapsed;

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
                          <span className="truncate">{label}</span>
                        )}
                      </button>
                      {!isCollapsed ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startRename(thread, index)}
                            className="invisible inline-flex h-8 w-8 items-center justify-center rounded-md text-xs text-slate-300 transition hover:bg-slate-700/80 group-hover:visible"
                            aria-label={`Rename ${label}`}
                            title="Rename"
                          >
                            ...
                          </button>
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
                            x
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
    </>
  );
}
