"use client";

import { useEffect, useRef } from "react";
import { Clock, List, X } from "lucide-react";
import { EvidenceReference } from "@/lib/types";

const activityNames: Record<string, string> = { sleeping: "Sleep", toileting: "Bathroom visit", showering: "Shower", grooming: "Personal care", leaving: "Time away from home", breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack", spare_time: "Free time", tv: "Watching TV" };

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return [hours ? `${hours} hr` : "", minutes ? `${minutes} min` : "", remainder || !total ? `${remainder} sec` : ""].filter(Boolean).join(" ");
}

export function EvidenceDrawer({ isOpen, onClose, evidence, claimText, timezone }: {
  isOpen: boolean; onClose: () => void; evidence: EvidenceReference[]; claimText?: string | null; timezone: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && !dialog?.open) dialog?.showModal();
    if (!isOpen && dialog?.open) dialog.close();
  }, [isOpen]);
  const formatTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    try { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(date); }
    catch { return date.toLocaleString(); }
  };
  return <dialog ref={dialogRef} className="activity-drawer" aria-labelledby="activity-title" aria-describedby="activity-description"
    onKeyDown={e => {
      if (e.key !== "Tab") return;
      const controls = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}
    onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}>
    <div className="drawer-content"><header className="drawer-header"><div><span className="eyebrow">A CLOSER LOOK</span><h2 id="activity-title">Related activities</h2><p id="activity-description">{evidence.length} {evidence.length === 1 ? "activity behind this answer" : "activities behind this answer"}</p></div><button className="icon-button" onClick={onClose} aria-label="Close activity details" autoFocus><X size={22} aria-hidden="true" /></button></header>
      {claimText && <blockquote className="drawer-claim">{claimText}</blockquote>}
      <div className="activity-list">{evidence.length === 0 ? <div className="empty-activities"><List size={30} aria-hidden="true" /><h3>No individual activities to show</h3><p>This answer may be based on an overall summary.</p></div> : evidence.map((item, index) => <article className="activity-record" key={`${item.evidence_id}-${index}`}><div className="activity-record-heading"><h3>{activityNames[item.event_type.toLowerCase()] || item.event_type.replace(/_/g, " ")}</h3><span><Clock size={14} aria-hidden="true" />{formatDuration(item.duration_seconds)}</span></div><p>{item.summary}</p><dl><div><dt>Started</dt><dd>{formatTime(item.started_at)}</dd></div><div><dt>Finished</dt><dd>{formatTime(item.ended_at)}</dd></div></dl></article>)}</div>
      <footer className="drawer-footer"><p>Times shown in {timezone}.</p><p>Recorded activities offer part of the picture. Your understanding of your loved one matters, too.</p></footer>
    </div>
  </dialog>;
}
