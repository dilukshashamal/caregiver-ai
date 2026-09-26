"use client";

import { ChevronDown, RefreshCw, UserRound } from "lucide-react";
import { CareRecipient } from "@/lib/types";

interface RecipientSelectorProps {
  recipients: CareRecipient[];
  selectedRecipientId: string | null;
  onSelectRecipient: (id: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  isRetrying?: boolean;
  disabled?: boolean;
  onRetry: () => void;
}
function displayName(name: string) {
  return /^Ordonez\s+[AB]$/i.test(name) ? `Sample profile ${name.slice(-1).toUpperCase()}` : name;
}
export function RecipientSelector({ recipients, selectedRecipientId, onSelectRecipient, isLoading, isError, isRetrying, disabled, onRetry }: RecipientSelectorProps) {
  const current = recipients.find(r => r.id === selectedRecipientId) || recipients[0];
  return (
    <section className="recipient-section" aria-label="Person you care for">
      <label className="eyebrow" htmlFor={recipients.length > 1 ? "care-recipient" : undefined}>CARING FOR</label>
      {isLoading ? <p className="recipient-status" role="status">Loading your care profiles…</p> : isError ? <div className="recipient-status" role="status"><p>We couldn’t load your care profiles.</p><button className="text-button" onClick={onRetry} disabled={isRetrying}><RefreshCw size={14} aria-hidden="true" />{isRetrying ? "Trying again…" : "Try again"}</button></div> : !current ? <p className="recipient-status" role="status">No care profiles are available yet.</p> : <>
        <div className="recipient-profile"><span className="recipient-avatar"><UserRound size={23} aria-hidden="true" /></span><div className="recipient-info">{recipients.length > 1 ? <div className="recipient-select"><select id="care-recipient" value={selectedRecipientId || ""} disabled={disabled} onChange={e => onSelectRecipient(e.target.value)}>{recipients.map(r => <option key={r.id} value={r.id}>{displayName(r.full_name)}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></div> : <h2>{displayName(current.full_name)}</h2>}<p>{/^Ordonez\s+[AB]$/i.test(current.full_name) ? "Explore with example activities" : "Your loved one’s daily activities"}</p></div></div>
        <p className="profile-hint">Questions in this conversation are about this person.</p>
      </>}
    </section>
  );
}
