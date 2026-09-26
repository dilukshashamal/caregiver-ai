import { DAY, Intent, MINUTE } from "./domain";

export function resolveIntent(message: string, anchor: string, previous?: Intent): Intent {
  const text = message.toLowerCase();
  const behavioral = /agitat|pacing|escalat|vocal|room|episode|crisis/.test(text) || (!!previous?.behavioral && /that|previous|timeline|evidence|compare/.test(text));
  const activities = behavioral ? ["Pacing", "Room_transitions", "Vocal_activity", "Environmental_observation"] :
    /sleep|rest/.test(text) ? ["Sleeping"] : /meal|eat|breakfast|lunch|dinner/.test(text) ? ["Breakfast", "Lunch", "Dinner", "Snack"] :
      /toilet|bathroom/.test(text) ? ["Toileting"] : /shower/.test(text) ? ["Showering"] : /morning|groom/.test(text) ? ["Grooming", "Breakfast", "Showering"] : /that|usual|normal|pattern|compare|timeline|evidence/.test(text) ? previous?.activities || [] : [];
  let end = Date.parse(anchor), start = end - (behavioral ? 22 * MINUTE : DAY);
  const midnight = Date.parse(new Date(end).toISOString().slice(0, 10));
  const explicit = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const lastMinutes = text.match(/(?:last|past)\s+(\d+)\s+minutes?/);
  const lastDays = text.match(/(?:last|past)\s+(\d+)\s+days?/);
  if (explicit) {
    start = Date.parse(explicit[1]); end = start + DAY;
    if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== explicit[1]) throw new Error("Invalid calendar date");
  }
  else if (/last night/.test(text)) { start = midnight - 2 * 60 * MINUTE; end = midnight + 7 * 60 * MINUTE; }
  else if (/yesterday/.test(text)) { end = midnight; start = end - DAY; }
  else if (lastMinutes) start = end - Math.min(1440, Math.max(1, Number(lastMinutes[1]))) * MINUTE;
  else if (lastDays || /week/.test(text)) start = end - Math.min(31, Math.max(1, Number(lastDays?.[1] || 7))) * DAY;
  else if (/today/.test(text)) start = midnight;
  else if (previous && /^(was that|what about|compare|view|show (?:the )?(?:evidence|timeline)|is that)/.test(text)) { start = Date.parse(previous.start); end = Date.parse(previous.end); }
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Invalid time interval");
  return { activities, start: new Date(start).toISOString(), end: new Date(end).toISOString(), behavioral, comparison: behavioral || /usual|normal|compar|different|chang|baseline/.test(text), pattern: /pattern|week|consecutive|repeat/.test(text), coverage: /coverage|gap|missing|sensor/.test(text) };
}
