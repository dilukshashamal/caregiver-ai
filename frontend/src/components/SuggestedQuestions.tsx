"use client";

import { ArrowUpRight, Coffee, Moon, Sunrise, Waves } from "lucide-react";

const QUESTIONS = [
  { text: "How long did they sleep last night?", icon: Moon, category: "Sleep & rest" },
  { text: "When did they have their meals yesterday?", icon: Coffee, category: "Meals & mealtimes" },
  { text: "Has their morning routine changed this week?", icon: Sunrise, category: "Daily routines" },
  { text: "Were bathroom visits different from usual yesterday?", icon: Waves, category: "Bathroom visits" },
];
export function SuggestedQuestions({ onSelectQuestion, disabled, compact = false }: { onSelectQuestion: (question: string) => void; disabled?: boolean; compact?: boolean }) {
  return <section className={compact ? "suggestions-compact" : "suggestions"} aria-label="Suggested questions">
    {!compact && <p className="suggestions-label">A place to start <span>Choose a question, or ask your own</span></p>}
    <div className="question-grid">{QUESTIONS.map(q => <button key={q.category} onClick={() => onSelectQuestion(q.text)} disabled={disabled} className="question-button" title={compact ? q.text : undefined}>
      <q.icon size={19} aria-hidden="true" /><span>{compact ? q.category : <><strong>{q.category}</strong><span>{q.text}</span></>}</span>{!compact && <ArrowUpRight size={16} className="question-arrow" aria-hidden="true" />}
    </button>)}</div>
  </section>;
}
