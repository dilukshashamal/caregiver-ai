"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Heart, MessageCircle, Plus, Sparkles } from "lucide-react";
import { fetchRecipients, sendChatMessage } from "@/lib/api";
import { ChatMessage, EvidenceReference } from "@/lib/types";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatStream } from "@/components/ChatStream";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { RecipientSelector } from "@/components/RecipientSelector";
import { SuggestedQuestions } from "@/components/SuggestedQuestions";

export default function Home() {
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftVersion, setDraftVersion] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [inspectedEvidence, setInspectedEvidence] = useState<EvidenceReference[]>([]);
  const [inspectedClaimText, setInspectedClaimText] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const streamingId = useRef<string>("");
  const { data: recipients = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["recipients"], queryFn: fetchRecipients,
  });
  const activeRecipient = recipients.find(r => r.id === selectedRecipientId) || recipients[0];
  const chatMutation = useMutation({
    mutationFn: (text: string) => sendChatMessage({
      care_recipient_id: activeRecipient!.id, message: text,
      session_id: sessionId, conversation_id: conversationId,
    }, delta => {
      const id = streamingId.current;
      setMessages(prev => prev.some(m => m.id === id)
        ? prev.map(m => m.id === id ? { ...m, content: m.content + delta } : m)
        : [...prev, { id, role: "assistant", content: delta, timestamp: new Date().toISOString() }]);
    }),
    onSuccess: answer => {
      if (answer.session_id) setSessionId(answer.session_id);
      if (answer.conversation_id) setConversationId(answer.conversation_id);
      setMessages(prev => [...prev.filter(m => m.id !== streamingId.current), {
        id: answer.message_id || `answer_${Date.now()}`, role: "assistant",
        content: answer.answer, timestamp: new Date().toISOString(), groundedAnswer: answer,
      }]);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    onError: () => {
      setMessages(prev => [...prev.filter(m => m.id !== streamingId.current), {
        id: `error_${Date.now()}`, role: "assistant", isError: true,
        content: "We couldn’t get an answer just now. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      }]);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
  });
  const unavailable = !activeRecipient || isError || isLoading;
  const handleSendMessage = (text: string) => {
    if (unavailable || chatMutation.isPending || !text.trim()) return;
    streamingId.current = `stream_${crypto.randomUUID()}`;
    setMessages(prev => [...prev, {
      id: `question_${Date.now()}`, role: "caregiver", content: text.trim(), timestamp: new Date().toISOString(),
    }]);
    chatMutation.mutate(text.trim());
  };
  const resetConversation = () => {
    setMessages([]); setSessionId(undefined); setConversationId(undefined);
    setDraftVersion(version => version + 1);
    setIsDrawerOpen(false); setInspectedEvidence([]); setInspectedClaimText(null);
    chatMutation.reset();
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#care-conversation">Skip to conversation</a>
      <header className="brand-header">
        <a href="https://www.gennaai.com/" target="_blank" rel="noreferrer" aria-label="GENNAAI website (opens in a new tab)">
          <Image src="/brand/gennaai.png" alt="GENNAAI" width={158} height={40} className="brand-wordmark" priority />
        </a>
        <span className="header-divider" />
        <span className="header-product">NurseAssist<span>AI</span></span>
        <span className="header-context"><Heart size={15} aria-hidden="true" /> Your caregiving space</span>
      </header>
      <div className="workspace-layout">
        <aside className="care-sidebar" aria-label="Your care space">
          <div className="sidebar-intro"><span className="eyebrow">A LITTLE HELP, EVERY DAY</span><h1>Your care space<span>.</span></h1><p>Everyday understanding.<br />A little more peace of mind.</p></div>
          <RecipientSelector recipients={recipients} selectedRecipientId={activeRecipient?.id || null}
            isLoading={isLoading} isError={isError} isRetrying={isFetching} disabled={chatMutation.isPending}
            onRetry={() => { void refetch(); }} onSelectRecipient={id => { resetConversation(); setSelectedRecipientId(id); }} />
          <div className="sidebar-section">
            <span className="eyebrow">YOUR CONVERSATION</span>
            <div className="current-section"><MessageCircle size={18} aria-hidden="true" /><span>Ask NurseAssist</span><span className="active-dot" /></div>
            <button className="new-conversation" onClick={resetConversation} disabled={!messages.length || chatMutation.isPending}><Plus size={17} aria-hidden="true" /> Start a new conversation</button>
          </div>
          <div className="sidebar-note"><div className="note-icon"><Heart size={20} aria-hidden="true" /></div><h2>You know them best.</h2><p>We help you understand their day, so you can focus on being there.</p><a href="https://www.gennaai.com/" target="_blank" rel="noreferrer">Our approach to care <ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></div>
          <div className="sidebar-footer"><span className="brand-spark">✳</span><span>Built around people.<br /><strong>Always.</strong></span></div>
        </aside>
        <main id="care-conversation" className="conversation-workspace" tabIndex={-1}>
          <div className="conversation-header"><div><span className="section-icon"><MessageCircle size={18} aria-hidden="true" /></span><h2>Ask NurseAssist</h2></div><span className="conversation-purpose"><Sparkles size={14} aria-hidden="true" /> Everyday care, made clearer</span></div>
          <ChatStream messages={messages} isPending={chatMutation.isPending}
            onRetry={() => { const last = messages.filter(m => m.role === "caregiver").at(-1); if (last) handleSendMessage(last.content); }}
            onInspectEvidence={(evidence, claim) => { setInspectedEvidence(evidence); setInspectedClaimText(claim || null); setIsDrawerOpen(true); }}
            welcomeQuestions={<SuggestedQuestions onSelectQuestion={handleSendMessage} disabled={unavailable || chatMutation.isPending} />} />
          {messages.length > 0 && <SuggestedQuestions compact onSelectQuestion={handleSendMessage} disabled={unavailable || chatMutation.isPending} />}
          <ChatComposer key={`${activeRecipient?.id || "no-recipient"}-${draftVersion}`} inputRef={composerRef} onSendMessage={handleSendMessage} isPending={chatMutation.isPending} disabled={unavailable} />
        </main>
      </div>
      <EvidenceDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} evidence={inspectedEvidence} claimText={inspectedClaimText} timezone={activeRecipient?.timezone || "UTC"} />
    </div>
  );
}
