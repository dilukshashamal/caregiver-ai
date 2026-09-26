"use client";

import { ReactNode, useEffect, useRef } from "react";
import Image from "next/image";
import { ArrowUpRight, Check, Info, RefreshCw } from "lucide-react";
import { ChatMessage, EvidenceReference } from "@/lib/types";

export function ChatStream({ messages, isPending, onInspectEvidence, welcomeQuestions, onRetry }: {
  messages: ChatMessage[]; isPending: boolean;
  onInspectEvidence: (evidence: EvidenceReference[], claimText?: string | null) => void;
  welcomeQuestions: ReactNode; onRetry: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const region = scrollRef.current;
    if (region) region.scrollTo({ top: messages.length ? region.scrollHeight : 0, behavior: !messages.length || matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [messages, isPending]);
  return <div className="chat-scroll" ref={scrollRef}>
    {messages.length === 0 && <div className="welcome-view">
      <div className="mascot-halo"><Image src="/brand/nurse-assist.png" alt="NurseAssist nurse mascot" width={88} height={88} priority /></div>
      <span className="welcome-eyebrow">A HELPING HAND FOR YOUR EVERYDAY</span>
      <h2>A little clarity.<br /><span>A little closer.</span></h2>
      <p className="welcome-description">Let’s make sense of your loved one’s day.<br className="desktop-break" /> Ask about sleep, meals, or the little changes in their routine.</p>
      {welcomeQuestions}
      <p className="welcome-footnote"><Check size={14} aria-hidden="true" /> Answers you can explore, with the activities behind them.</p>
    </div>}
    <div className="message-list" role="log" aria-label="Conversation with NAAI" aria-live="polite" aria-relevant="additions" aria-busy={isPending}>
      {messages.map((msg, index) => {
        const caregiver = msg.role === "caregiver";
        const answer = msg.groundedAnswer;
        return <article key={msg.id} className={`message ${caregiver ? "message-caregiver" : "message-assistant"}`}>
          {!caregiver && <Image className="message-avatar" src="/brand/nurse-assist.png" alt="" width={34} height={34} />}
          <div className="message-body"><span className="message-author">{caregiver ? "You" : "NAAI"}</span>
            <div className={`message-content ${msg.isError ? "message-error" : ""}`}>
              {answer && <div className="answer-status">{answer.abstained ? <><Info size={14} aria-hidden="true" /><span>{answer.safety_flags.includes("UNSUPPORTED_MEDICAL_REDIRECT") ? "A healthcare professional can help with this" : "There isn’t enough information to answer this fully"}</span></> : <><Check size={14} aria-hidden="true" /><span>{answer.safety_flags.some(flag => ["CONVERSATIONAL_RESPONSE", "GREETING_RESPONSE"].includes(flag)) ? "Here to help" : "Based on recorded activities"}</span></>}</div>}
              <p className="answer-text">{msg.content}</p>
              {msg.isError && index === messages.length - 1 && <button className="text-button" onClick={onRetry} disabled={isPending}><RefreshCw size={14} aria-hidden="true" /> Try again</button>}
              {answer && answer.evidence?.length > 0 && <button className="activity-button" onClick={() => onInspectEvidence(answer.evidence)}><span>View related activities <span className="activity-count">{answer.evidence.length}</span></span><ArrowUpRight size={16} aria-hidden="true" /></button>}
              {answer && (answer.claims?.length > 0 || answer.limitations?.length > 0 || (answer.data_coverage_summary && answer.data_coverage_summary !== "N/A")) && <details className="answer-details"><summary>More about this answer</summary>
                {answer.claims?.map((claim, i) => { const evidence = answer.evidence?.filter(ev => claim.evidence_ids.includes(ev.evidence_id)) || []; return <div className="claim-row" key={i}><p>{claim.claim_text}</p>{evidence.length > 0 && <button className="text-button" onClick={() => onInspectEvidence(evidence, claim.claim_text)}>View activities<span className="sr-only"> for: {claim.claim_text}</span><ArrowUpRight size={13} aria-hidden="true" /></button>}</div>; })}
                {answer.data_coverage_summary && answer.data_coverage_summary !== "N/A" && <p className="coverage-note"><strong>Available information: </strong>{answer.data_coverage_summary}</p>}
                {answer.limitations?.length > 0 && <div className="coverage-note"><strong>What to keep in mind</strong><ul>{answer.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul></div>}
              </details>}
            </div>
          </div>
        </article>;
      })}
    </div>
    {isPending && <div className="thinking-state" role="status"><span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>Looking through their activities…</div>}
  </div>;
}
