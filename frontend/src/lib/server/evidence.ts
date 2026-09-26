import { EvidenceReference, GroundedAnswer, GroundedClaim } from "../types";
import { baselineFor, compare, consecutiveShift, dailyCounts, mean, round } from "./analytics";
import { ActivityEvent, Baseline, DAY, Intent, MINUTE, Recipient } from "./domain";
import { stableId } from "./sample";

export interface AnswerPlan { intro: string; claims: GroundedClaim[]; evidence: EvidenceReference[]; limitations: string[]; coverage: string; abstained: boolean }
const label = (s: string) => s.replace(/_/g, " ").toLowerCase();
export function eventEvidence(event: ActivityEvent): EvidenceReference {
  return { evidence_id: event.id, event_type: event.activity, started_at: event.start_time, ended_at: event.end_time,
    duration_seconds: Math.round(event.duration_minutes * 60),
    summary: `${event.metadata.synthetic ? "Synthetic sample. " : ""}${event.metadata.summary || `Recorded ${label(event.activity)} for ${round(event.duration_minutes)} minutes${event.metadata.count !== undefined ? `; ${event.metadata.count} transitions` : ""}${event.metadata.location ? ` in ${event.metadata.location}` : ""}.`}`,
    sensor_observations: event.metadata.sensor_type ? [{ id: `${event.id}-sensor`, sensor_id: `${event.metadata.source}-${event.metadata.sensor_type}`, sensor_type: event.metadata.sensor_type, location: event.metadata.location || "Home", state: event.activity, observed_at: event.start_time, source: event.metadata.source }] : [] };
}
function baselineEvidence(b: Baseline): EvidenceReference {
  return { evidence_id: b.id, event_type: `${b.activity}_baseline`, started_at: b.window_start, ended_at: b.window_end,
    duration_seconds: Math.round((Date.parse(b.window_end) - Date.parse(b.window_start)) / 1000),
    summary: `Baseline over ${b.window_days} calendar days; ${b.sample_count} records. Mean duration ${b.mean_duration} minutes per event; sample standard deviation ${b.std_duration ?? "unavailable"}; mean frequency ${b.mean_frequency} events/day.${b.metadata.comparison_window ? ` Matched observation window: ${b.metadata.comparison_window}.` : ""}${b.metadata.mean_count !== undefined ? ` Mean transition count: ${b.metadata.mean_count}.` : ""}` };
}
export function buildAnswerPlan(recipient: Recipient, intent: Intent, events: ActivityEvent[], baselines: Baseline[], history: ActivityEvent[], preferredIds: string[] = []): AnswerPlan {
  // Defense in depth: callers cannot accidentally package a different person's records.
  events = events.filter(e => e.recipient_id === recipient.id && e.start_time < intent.end && e.end_time > intent.start && (!intent.activities.length || intent.activities.includes(e.activity)));
  history = history.filter(e => e.recipient_id === recipient.id && e.end_time <= intent.start);
  baselines = baselines.filter(b => b.recipient_id === recipient.id && b.window_end < intent.start);
  const evidence = new Map<string, EvidenceReference>();
  const claims: GroundedClaim[] = [];
  const limitations = ["Recorded activities are only part of the picture. Missing records do not establish that an activity did not happen.", "Behavioral changes do not establish an emotional state, diagnosis, cause, or future crisis."];
  if (recipient.metadata.synthetic) limitations.unshift("All events and sensor observations in this profile are synthetic demonstration data.");
  const coverage = `Recording-relative interval: ${intent.start} to ${intent.end} (UTC). ${events.length} activity annotations retrieved. Continuous sensor coverage is not established by activity annotations.`;
  const add = (text: string, supporting: ActivityEvent[], baseline?: Baseline) => {
    const ids: string[] = [];
    if (supporting.length <= 8) {
      for (const e of supporting) { evidence.set(e.id, eventEvidence(e)); ids.push(e.id); }
    } else {
      // An explicit deterministic aggregate, not a fabricated sensor event; retain all source IDs.
      const id = stableId(`aggregate/${recipient.id}/${supporting.map(e => e.id).sort().join("/")}`);
      evidence.set(id, { evidence_id: id, event_type: "Activity_summary", started_at: supporting.map(e => e.start_time).sort()[0], ended_at: supporting.map(e => e.end_time).sort().at(-1)!, duration_seconds: Math.round(supporting.reduce((sum, e) => sum + e.duration_minutes * 60, 0)), summary: `Deterministic aggregate of ${supporting.length} records. ${text}`, source_event_ids: supporting.map(e => e.id) });
      ids.push(id);
    }
    if (baseline) { evidence.set(baseline.id, baselineEvidence(baseline)); ids.push(baseline.id); }
    if (ids.length) claims.push({ claim_text: text, evidence_ids: ids });
  };
  if (!events.length) return { intro: "No matching activity was recorded in this interval. That does not mean the activity did not happen.", claims, evidence: [], limitations, coverage, abstained: true };
  const matchedEvening = intent.start.slice(11, 16) === "18:00" && intent.end.slice(11, 16) === "18:22" && Date.parse(intent.end) - Date.parse(intent.start) === 22 * MINUTE;
  for (const activity of [...new Set(events.map(e => e.activity))]) {
    const selected = events.filter(e => e.activity === activity);
    const baseline = baselines.find(b => b.activity === activity);
    if (intent.behavioral && activity === "Environmental_observation") continue;
    const total = round(selected.reduce((sum, e) => sum + Math.max(0, Math.min(Date.parse(e.end_time), Date.parse(intent.end)) - Math.max(Date.parse(e.start_time), Date.parse(intent.start))) / MINUTE, 0));
    if (intent.behavioral && matchedEvening && baseline?.metadata.window_minutes === 22) {
      const isCount = activity === "Room_transitions";
      const value = isCount ? selected.reduce((n, e) => n + (e.metadata.count || 0), 0) : total;
      const baselineValue = isCount ? Number(baseline.metadata.mean_count) : baseline.mean_duration;
      const comparison = compare(value, baselineValue);
      const unit = isCount ? "transitions" : "minutes";
      const change = comparison.ratio === null ? "a ratio cannot be calculated from a zero baseline" : `${comparison.ratio}× the typical evening level`;
      add(`Over the last 22 recorded minutes, ${label(activity)} ${isCount ? "totaled" : "was"} ${value} ${unit}, compared with ${baselineValue} ${unit} in the matched baseline window (${change}).`, selected, baseline);
    } else {
      const duration = total >= 60 ? `${Math.floor(total / 60)} hours${total % 60 ? ` ${round(total % 60)} minutes` : ""} (${total} minutes)` : `${total} minutes`;
      let text = `${selected.length} ${label(activity)} event${selected.length === 1 ? " was" : "s were"} recorded, totaling ${duration} within the requested interval.`;
      if (intent.comparison && baseline && !baseline.metadata.comparison_window) {
        const observedMean = round(mean(selected.map(e => e.duration_minutes)));
        text += ` Mean whole-event duration was ${observedMean} minutes versus a personal baseline of ${baseline.mean_duration} minutes per event.`;
        if (observedMean === baseline.mean_duration) text += " The recorded duration matches their usual average; this is a duration comparison, not an assessment of overall health.";
        else text += ` The mean duration is ${round(Math.abs(observedMean - baseline.mean_duration))} minutes ${observedMean < baseline.mean_duration ? "below" : "above"} the baseline; the values do not match exactly.`;
      }
      if (intent.comparison && baseline && intent.start.endsWith("T00:00:00.000Z") && intent.end.endsWith("T00:00:00.000Z")) {
        const days = (Date.parse(intent.end) - Date.parse(intent.start)) / DAY;
        const frequency = selected.filter(e => e.start_time >= intent.start).length / days;
        const result = compare(frequency, baseline.mean_frequency);
        text += ` Recorded frequency was ${round(frequency)} events/day versus ${baseline.mean_frequency} events/day at baseline${result.percent !== null ? ` (${result.percent}% change)` : " (percentage change is undefined from zero)"}.`;
      }
      if (intent.pattern && baseline) {
        const firstFullDay = Math.ceil(Date.parse(intent.start) / DAY) * DAY;
        const lastFullDay = Math.floor(Date.parse(intent.end) / DAY) * DAY - 1;
        const counts = dailyCounts(selected, new Date(firstFullDay).toISOString(), new Date(lastFullDay).toISOString());
        const pattern = consecutiveShift(counts, baseline.mean_frequency);
        text += Object.keys(counts).length < 3 ? " This interval is too short to assess a multi-day pattern." : pattern.detected ? ` Recorded frequency differed from baseline for ${Math.max(pattern.increased, pattern.decreased)} consecutive calendar days (at least 25% ${pattern.increased >= pattern.decreased ? "higher" : "lower"}).` : " No sustained frequency shift was found in the complete recorded days examined; missing annotations still limit this comparison.";
      }
      add(text, selected, intent.comparison || intent.pattern ? baseline : undefined);
    }
  }
  if (intent.behavioral && matchedEvening) {
    const episodeIds = [...new Set(history.filter(e => e.metadata.phase === "episode").map(e => e.metadata.episode_id))].filter(Boolean);
    const similar = episodeIds.map(id => history.filter(e => e.metadata.episode_id === id && e.metadata.phase === "episode")).filter(group => ["Pacing", "Vocal_activity", "Room_transitions"].every(activity => {
      const current = events.filter(e => e.activity === activity);
      const previous = group.filter(e => e.activity === activity);
      const metric = (list: ActivityEvent[]) => list.reduce((sum, e) => sum + (activity === "Room_transitions" ? e.metadata.count || 0 : e.duration_minutes), 0);
      const a = metric(current), b = metric(previous);
      return a > 0 && b > 0 && Math.abs(a - b) / a <= 0.25;
    })).sort((a, b) => Number(b.some(e => preferredIds.includes(e.id))) - Number(a.some(e => preferredIds.includes(e.id))));
    if (similar.length) add(`Similar pacing, room-transition, and vocal-activity changes occurred during ${similar.length} previous sample episodes; each metric was within 25% of the current window. Similarity does not predict a crisis.`, similar.flat());
    const environmental = events.filter(e => e.activity === "Environmental_observation");
    environmental.forEach(e => evidence.set(e.id, eventEvidence(e)));
    const recovery = history.filter(e => e.metadata.phase === "recovery" && similar.some(group => group[0]?.metadata.episode_id === e.metadata.episode_id));
    if (recovery.length) add(`The previous sample episodes were followed by recorded seated activity. These observations describe a sequence, without establishing why it occurred.`, recovery);
  }
  if (intent.comparison && !baselines.length) limitations.push("No earlier baseline is available for this interval; a comparison cannot be established.");
  return { intro: `${recipient.metadata.synthetic ? "Synthetic demonstration. " : ""}${intent.behavioral ? "I can’t determine their emotional state, but I can show you what has changed in the recorded behavior." : "Here is what the recorded activities show."}`, claims: claims.slice(0, 8), evidence: [...evidence.values()].sort((a, b) => a.started_at.localeCompare(b.started_at)), limitations, coverage, abstained: false };
}

// A daily overview needs two retrieval views: routine activity and a matched recent
// behavioral window. A day-long total must never be compared to a 22-minute baseline.
export function buildConversationPlan(recipient: Recipient, intent: Intent, events: ActivityEvent[], baselines: Baseline[], history: ActivityEvent[], preferredIds: string[] = []): AnswerPlan {
  const broad = intent.task === "overview" || (intent.task === "explanation" && !intent.activities.length);
  let plan = buildAnswerPlan(recipient, intent, events, baselines, history, preferredIds);
  if (intent.task === "calculation") {
    const records = events.filter(e => e.recipient_id === recipient.id && e.start_time < intent.end && e.end_time > intent.start && (!intent.activities.length || intent.activities.includes(e.activity))).sort((a, b) => b.start_time.localeCompare(a.start_time));
    const calculations = records.slice(0, 3).map(e => {
      const start = Math.max(Date.parse(e.start_time), Date.parse(intent.start));
      const end = Math.min(Date.parse(e.end_time), Date.parse(intent.end));
      const minutes = round((end - start) / MINUTE);
      return { claim_text: `The ${label(e.activity)} record on ${new Date(start).toISOString().slice(0, 10)} runs from ${new Date(start).toISOString().slice(11, 16)} to ${new Date(end).toISOString().slice(11, 16)} UTC within the requested interval. End time minus start time gives ${minutes} minutes. This measures the recorded activity interval, not continuous engagement or the reason for its length.`, evidence_ids: [e.id] };
    });
    plan = { ...plan, intro: recipient.metadata.synthetic ? "Synthetic demonstration." : "Here is how that duration was calculated.", claims: [...calculations, ...plan.claims].slice(0, 8), evidence: [...new Map([...records.slice(0, 3).map(eventEvidence), ...plan.evidence].map(e => [e.evidence_id, e])).values()] };
  }
  if (broad && events.length) {
    const behavioralActivities = ["Pacing", "Room_transitions", "Vocal_activity", "Environmental_observation"];
    const routines = events.filter(e => !behavioralActivities.includes(e.activity));
    const routinePlan = buildAnswerPlan(recipient, { ...intent, behavioral: false }, routines, baselines, history);
    const recentIntent = { ...intent, start: new Date(Date.parse(intent.end) - 22 * MINUTE).toISOString(), behavioral: true, activities: behavioralActivities };
    const recentPlan = buildAnswerPlan(recipient, recentIntent, events, baselines, history, preferredIds);
    const claims = [...recentPlan.claims, ...routinePlan.claims].slice(0, 12);
    plan = { ...plan, intro: `${recipient.metadata.synthetic ? "Synthetic demonstration. " : ""}Here is the recorded daily routine and the recent behavioral context. “Normal” needs a personal baseline and reliable coverage; these records alone cannot establish overall wellbeing.`, claims,
      evidence: [...new Map([...recentPlan.evidence, ...routinePlan.evidence].map(e => [e.evidence_id, e])).values()],
      limitations: [...new Set([...plan.limitations, ...routinePlan.limitations, ...recentPlan.limitations])] };
  }
  if (intent.task === "explanation") {
    const topic = intent.activities.length === 1 ? label(intent.activities[0]) : "behavior and routine";
    plan.intro = `${recipient.metadata.synthetic ? "Synthetic demonstration. " : ""}You’re asking about the reason for the ${topic} observations. The recordings show what happened, but do not establish a cause. The comparisons below describe those observations; they do not prove an emotional state or diagnosis. What was happening immediately beforehand, and was there a change in routine or surroundings? That context could help investigate the pattern.`;
    plan.limitations.push("To investigate context, record what was happening around the same time and discuss persistent or concerning changes with the care team. A possible explanation should not be treated as an observed cause.");
  }
  return plan;
}
export function answerFromPlan(plan: AnswerPlan): GroundedAnswer {
  return { answer: [plan.intro, ...plan.claims.map(c => c.claim_text)].join("\n\n"), claims: plan.claims, evidence: plan.evidence, limitations: plan.limitations, data_coverage_summary: plan.coverage, abstained: plan.abstained, safety_flags: [] };
}
export function validatePlan(plan: AnswerPlan) {
  const ids = new Set(plan.evidence.map(e => e.evidence_id));
  return plan.claims.every(c => c.evidence_ids.length > 0 && c.evidence_ids.every(id => ids.has(id)));
}

// Shared by ingestion: original Python uses the first 65% of the recorded time span.
export function baselineWindow(events: ActivityEvent[]) {
  const start = events.map(e => e.start_time).sort()[0];
  const last = events.map(e => e.end_time).sort().at(-1)!;
  const end = new Date(Date.parse(start) + (Date.parse(last) - Date.parse(start)) * 0.65).toISOString();
  return [...new Set(events.map(e => e.activity))].map(activity => baselineFor(events, events[0].recipient_id, activity, start, end, stableId(`${events[0].recipient_id}/${activity}/${start}/${end}`)));
}
