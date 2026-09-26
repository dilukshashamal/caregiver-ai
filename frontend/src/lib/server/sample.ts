import { createHash } from "node:crypto";
import { baselineFor, mean } from "./analytics";
import { ActivityEvent, Dataset, MINUTE } from "./domain";

export function stableId(key: string) {
  const hash = createHash("sha256").update(key).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
// Fixed dates make seeded evidence reproducible. Relative questions anchor to latest recording.
export function sampleDataset(): Dataset {
  const recipients = [
    { id: "dad-demo", name: "Dad · synthetic demo", timezone: "UTC", is_demo: true, metadata: { synthetic: true } },
    { id: "mum-demo", name: "Mum · synthetic demo", timezone: "UTC", is_demo: true, metadata: { synthetic: true } },
  ];
  const events: ActivityEvent[] = [];
  const add = (recipient: string, day: number, clock: string, activity: string, minutes: number, metadata: Partial<ActivityEvent["metadata"]> = {}) => {
    const start_time = `2026-09-${String(day).padStart(2, "0")}T${clock}:00.000Z`;
    events.push({ id: stableId(`${recipient}/${start_time}/${activity}`), recipient_id: recipient, activity, start_time, end_time: new Date(Date.parse(start_time) + minutes * MINUTE).toISOString(), duration_minutes: minutes,
      metadata: { source: "GENNAAI_SYNTHETIC_V1", synthetic: true, phase: day <= 14 ? "baseline" : "current", ...metadata } });
  };
  for (const recipient of recipients) {
    const dad = recipient.id === "dad-demo";
    for (let day = 1; day <= 21; day++) {
      add(recipient.id, day, "00:00", "Sleeping", 420 + (day % 3) * 15, { location: "Bedroom", sensor_type: "camera" });
      add(recipient.id, day, "08:00", "Breakfast", 20);
      add(recipient.id, day, "12:30", "Lunch", 25);
      add(recipient.id, day, "17:30", "Dinner", 30);
      for (const clock of ["07:40", "11:00", "16:00"]) add(recipient.id, day, clock, "Toileting", 4);
      const episode = dad && [16, 19].includes(day);
      const current = day === 21;
      const phase = day <= 14 ? "baseline" : episode ? "episode" : "current";
      const metadata: Partial<ActivityEvent["metadata"]> = { phase, episode_id: episode ? `episode-${day}` : undefined };
      const pacing = dad && current ? 12.4 : episode ? 11.6 : 4;
      add(recipient.id, day, "18:00", "Pacing", pacing, { ...metadata, sensor_type: "camera", location: "Living room" });
      add(recipient.id, day, "18:00", "Room_transitions", 22, { ...metadata, sensor_type: "camera", location: "Bedroom ↔ living room", count: dad && current ? 9 : episode ? 8 : 3 });
      add(recipient.id, day, "18:02", "Vocal_activity", dad && current ? 6 : episode ? 5.5 : 2, { ...metadata, sensor_type: "audio", location: "Living room" });
      add(recipient.id, day, "18:00", "Environmental_observation", 22, { ...metadata, sensor_type: "environment", location: "Living room", summary: "Synthetic environment observation: room temperature 23°C; light level 180 lux. No clinical interpretation." });
      if (episode) add(recipient.id, day, "18:30", "Seated_activity", 30, { phase: "recovery", episode_id: `episode-${day}`, sensor_type: "camera", location: "Living room" });
    }
  }
  const baselines = recipients.flatMap(r => [...new Set(events.map(e => e.activity))].filter(a => a !== "Seated_activity").map(activity => {
    const b = baselineFor(events, r.id, activity, "2026-09-01T00:00:00.000Z", "2026-09-14T23:59:59.999Z", stableId(`${r.id}/${activity}/baseline-v1`));
    if (["Pacing", "Room_transitions", "Vocal_activity"].includes(activity)) b.metadata = { ...b.metadata, comparison_window: "18:00–18:22 UTC", window_minutes: 22,
      mean_count: activity === "Room_transitions" ? mean(events.filter(e => e.recipient_id === r.id && e.activity === activity && e.metadata.phase === "baseline").map(e => e.metadata.count || 0)) : undefined };
    return b;
  }));
  return { recipients, events, baselines };
}
