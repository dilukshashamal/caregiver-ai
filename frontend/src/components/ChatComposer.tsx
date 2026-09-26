"use client";

import { useState, useEffect, RefObject } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

export function ChatComposer({ onSendMessage, isPending, disabled, inputRef }: {
  onSendMessage: (message: string) => void; isPending: boolean; disabled?: boolean; inputRef: RefObject<HTMLTextAreaElement>;
}) {
  const [input, setInput] = useState("");
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isPending || disabled) return;
    onSendMessage(input.trim()); setInput("");
  };
  useEffect(() => {
    if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 140)}px`; }
  }, [input, inputRef]);
  return <div className="composer-area">
    <form onSubmit={submit} className="composer-form">
      <label className="sr-only" htmlFor="care-question">Your question for NAAI</label>
      <textarea id="care-question" ref={inputRef} rows={1} value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
        placeholder={disabled ? "Choose a care profile to begin…" : "Ask about their day…"}
        disabled={disabled} readOnly={isPending} aria-describedby="composer-help" />
      <button type="submit" className="send-button" disabled={!input.trim() || isPending || disabled} aria-label="Send question">{isPending ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={21} aria-hidden="true" />}</button>
    </form>
    <div className="composer-meta" id="composer-help"><span>Ask in your own words.</span><span>Enter to send <span aria-hidden="true">↵</span><span className="sr-only">. Shift + Enter for a new line.</span></span></div>
    <p className="care-disclaimer">Based on recorded activities. For everyday understanding, not medical advice.</p>
  </div>;
}
