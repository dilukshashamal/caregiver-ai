import { ActivityEvent } from "./domain";
import { stableId } from "./sample";

export function parseADL(raw: string, recipient: string) {
  const events: ActivityEvent[] = [], rejected: { line: number; reason: string }[] = [];
  const labels = ["Sleeping", "Toileting", "Showering", "Grooming", "Breakfast", "Lunch", "Dinner", "Snack", "Leaving", "Spare_Time_TV"];
  raw.split(/\r?\n/).forEach((line, index) => {
    line = line.trim();
    if (!line || line.startsWith("Start") || line.startsWith("---")) return;
    const match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/);
    if (!match) { rejected.push({ line: index + 1, reason: "Malformed row" }); return; }
    const iso = (value: string) => {
      const candidate = value.replace(/\s+/, "T") + ".000Z";
      const date = new Date(candidate);
      if (!Number.isFinite(date.getTime()) || date.toISOString() !== candidate) throw new Error("Invalid timestamp");
      return date.toISOString();
    };
    try {
      const start_time = iso(match[1]), end_time = iso(match[2]);
      if (end_time <= start_time) throw new Error("End must follow start");
      const normalized = match[3].replace(/[\s/]+/g, "_").toLowerCase();
      const activity = labels.find(l => l.toLowerCase() === normalized) || (normalized === "tv" ? "Spare_Time_TV" : "Unknown");
      events.push({ id: stableId(`${recipient}/${activity}/${start_time}/${end_time}`), recipient_id: recipient, activity, start_time, end_time,
        duration_minutes: (Date.parse(end_time) - Date.parse(start_time)) / 60000,
        metadata: { source: `UCI_${recipient.toUpperCase()}`, summary: `UCI ${recipient} activity annotation (line ${index + 1}); no camera or audio evidence is supplied by this annotation.` } });
    } catch (error) { rejected.push({ line: index + 1, reason: error instanceof Error ? error.message : "Invalid row" }); }
  });
  return { events: [...new Map(events.map(e => [e.id, e])).values()], rejected };
}
export function narrativeGroups(events: ActivityEvent[]) {
  const groups = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    // One narrative per activity, plus a small number of multimodal episode summaries.
    const key = `${event.recipient_id}/${event.metadata.episode_id || event.activity}`;
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return [...groups].map(([key, rows]) => {
    const content = `${rows[0].metadata.synthetic ? "Synthetic demonstration. " : "Historical UCI annotations. "}${rows[0].recipient_id}: ${rows.length} records of ${[...new Set(rows.map(e => e.activity))].join(", ")}, ${rows.map(e => e.start_time).sort()[0]} to ${rows.map(e => e.end_time).sort().at(-1)}. Total annotated duration ${(rows.reduce((sum, e) => sum + e.duration_minutes, 0)).toFixed(1)} minutes; this is not sensor coverage.`;
    return { id: stableId(`narrative-v1/${key}`), recipient_id: rows[0].recipient_id, content, metadata: { event_ids: rows.map(e => e.id), synthetic: !!rows[0].metadata.synthetic } };
  });
}
