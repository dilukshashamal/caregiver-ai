import { ActivityEvent, Baseline, DAY } from "./domain";

export const round = (n: number, digits = 2) => Number(n.toFixed(digits));
export const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
export function std(values: number[]) {
  return values.length < 2 ? null : Math.sqrt(values.reduce((sum, n) => sum + (n - mean(values)) ** 2, 0) / (values.length - 1));
}
export function dailyCounts(events: ActivityEvent[], start: string, end: string) {
  const counts: Record<string, number> = {};
  for (let t = Date.parse(start.slice(0, 10)); t <= Date.parse(end.slice(0, 10)); t += DAY) counts[new Date(t).toISOString().slice(0, 10)] = 0;
  for (const e of events) if (e.start_time.slice(0, 10) in counts) counts[e.start_time.slice(0, 10)]++;
  return counts;
}
export function baselineFor(events: ActivityEvent[], recipient: string, activity: string, start: string, end: string, id: string): Baseline {
  const selected = events.filter(e => e.recipient_id === recipient && e.activity === activity && e.start_time >= start && e.start_time <= end);
  const durations = selected.map(e => e.duration_minutes);
  const counts = Object.values(dailyCounts(selected, start, end));
  const deviation = std(durations);
  return { id, recipient_id: recipient, activity, mean_duration: round(mean(durations)), std_duration: deviation === null ? null : round(deviation), mean_frequency: round(mean(counts)), window_days: counts.length, window_start: start, window_end: end, sample_count: selected.length, metadata: { duration_unit: "minutes", frequency_unit: "events/day", observed_event_ids: selected.map(e => e.id), coverage: "Activity annotations do not establish continuous sensor coverage." } };
}
export function compare(current: number, baseline: number, deviation: number | null = null) {
  const delta = round(current - baseline);
  const percent = baseline > 0 ? round(delta / baseline * 100, 1) : current === 0 ? 0 : null;
  const z = deviation && deviation > 0 ? round(delta / deviation) : null;
  return { current, baseline, delta, percent, ratio: baseline > 0 ? round(current / baseline, 1) : null, z,
    direction: delta > 0.01 ? "increased" : delta < -0.01 ? "decreased" : "stable",
    significant: (percent !== null && Math.abs(percent) >= 25) || (z !== null && Math.abs(z) >= 2) || (baseline === 0 && current > 0) };
}
export function consecutiveShift(counts: Record<string, number>, baseline: number) {
  let increased = 0, decreased = 0, maxIncrease = 0, maxDecrease = 0, last = 0;
  for (const [date, count] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
    const time = Date.parse(date);
    if (time - last !== DAY) { increased = 0; decreased = 0; }
    increased = count > baseline && count >= baseline * 1.25 ? increased + 1 : 0;
    decreased = count < baseline && count <= baseline * 0.75 ? decreased + 1 : 0;
    maxIncrease = Math.max(maxIncrease, increased); maxDecrease = Math.max(maxDecrease, decreased); last = time;
  }
  return { increased: maxIncrease, decreased: maxDecrease, detected: Math.max(maxIncrease, maxDecrease) >= 3 };
}
