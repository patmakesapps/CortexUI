"use client";

import { FormEvent, useRef, useState } from "react";

type ComposerProps = {
  isDisabled?: boolean;
  isStreaming?: boolean;
  onSend: (text: string) => Promise<void>;
  inline?: boolean;
};

export function Composer({
  isDisabled,
  isStreaming,
  onSend,
  inline
}: ComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || isDisabled || isStreaming) return;
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSend(value);
  };

  return (
    <form
      onSubmit={submit}
      className={
        inline
          ? "w-full px-2 py-2 md:px-3"
          : "shrink-0 bg-transparent px-2 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 md:px-4"
      }
    >
      <div
        className={`mx-auto flex w-full items-end gap-2 border border-border/70 bg-[rgb(var(--panel)/0.95)] shadow-[0_0_0_1px_rgb(255_255_255/0.02),0_18px_35px_rgb(0_0_0/0.26)] ${
          inline
            ? "max-w-4xl rounded-3xl p-3 md:p-3.5"
            : "max-w-4xl rounded-3xl p-3"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const el = event.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder="Message Cortex..."
          className={`flex-1 resize-none overflow-hidden border-0 bg-transparent text-slate-100 outline-none ring-[rgb(var(--accent)/0.45)] placeholder:text-slate-400 focus:ring-0 ${
            inline
              ? "min-h-14 rounded-2xl px-4 py-3 text-base"
              : "min-h-12 rounded-2xl px-4 py-3 text-base"
          }`}
          disabled={isDisabled || isStreaming}
        />
        {text.trim().length > 0 ? (
          <button
            type="submit"
            disabled={isDisabled || isStreaming}
            className={`bg-slate-100/12 font-semibold text-slate-100 transition hover:bg-slate-100/20 disabled:cursor-not-allowed disabled:opacity-50 ${
              inline
                ? "h-14 rounded-2xl px-5 text-base"
                : "h-12 rounded-2xl px-5 text-base"
            }`}
          >
            Send
          </button>
        ) : null}
      </div>
    </form>
  );
}
