import { DAY, Intent, MINUTE } from "./domain";

export const isExplanation = (text: string) => /\b(?:why|reason|resaon|cause|explain (?:that|this|the above)|what (?:led to|caused))\b/i.test(text);
export const isCalculation = (text: string) => /\b(?:calculat\w*|how (?:did|do) you (?:get|work|arrive)|where (?:did|does).*(?:number|figure)|why.*\d+\s*(?:min\w*|hours?|times|×)|how (?:is|was) (?:that|this) (?:measured|worked out))\b/i.test(text);
export const isEvaluation = (text: string) => /^(?:(?:is|was|would|does)\s+(?:it|that|this)(?:\s+(?:be|seem|look))?\s+)?(?:a\s+)?(?:good|bad|okay|ok|normal|enough|too (?:much|little|long|short))(?:\s+(?:time|duration|amount|length|of (?:sleep|rest)))?[?!. ]*$/i.test(text.trim());
export const isFollowUp = (text: string) => isEvaluation(text) || isExplanation(text) || isCalculation(text) || /\b(?:that|above|previous (?:answer|conversation|chat)|earlier|tell me more|more detail|compare|timeline|evidence|patterns?|unusual|unnecessary|unnessary|abnormal|anything different)\b/i.test(text);

export function clarificationContext(message: string, proposed: Intent, previous?: Intent): Intent {
  const hasNewTime = /\b(?:today|yesterday|last|past|week|now|currently|\d{4}-\d{2}-\d{2})\b/i.test(message);
  const scope = previous && previous.task !== "conversation" && !proposed.activities.length
    ? { ...previous, ...(hasNewTime ? { start: proposed.start, end: proposed.end } : {}) }
    : proposed;
  return { ...scope, task: "clarification" };
}

export function resolveIntent(message: string, anchor: string, previous?: Intent): Intent {
  const text = message.toLowerCase().trim();
  const summaryChoice = /^(?:(?:a|the|please|give me a|show me a)\s+)?(?:summary|summari[sz]e|overview|daily summary|summari[sz]e (?:it|that|the day))(?:\s+please)?[.!?]*$/i.test(text);
  const dayQuestion = /^(?:how (?:is|was|were)(?: the| things)?|what (?:about|happened))\s+(?:yesterday|today)[?!. ]*$/i.test(text);
  const overview = summaryChoice || dayQuestion || /\b(?:day.to.day|daily life|daily routine|overall|overview|whole day|routine summary|all (?:recorded )?activities|what (?:happened|did .+ do) (?:today|yesterday)|how was .+ day)\b/i.test(text);
  // Selecting the summary offered in a clarification changes the type of answer,
  // not the day the caregiver was already asking about.
  if (summaryChoice && previous && previous.task !== "conversation") {
    return { ...previous, task: "overview", activities: [], behavioral: false, comparison: true, pattern: false, coverage: false };
  }
  const isEnvironment = /\benvironment(?:al)?[ _-]?(?:observations?|data|sensors?)\b/i.test(text);
  const isToileting = /\b(?:toilet\w*|bathroom\w*|restroom\w*|pee\w*|poop\w*|urinat\w*)\b/i.test(text);
  const isSleeping = /\b(?:sleep\w*|slept|rest|resting|nap\w*|bedtime|waking)\b/i.test(text);
  const isMeal = /\b(?:meal\w*|eat\w*|breakfast\w*|lunch\w*|dinner\w*|snack\w*|food)\b/i.test(text);
  const isShowering = /\b(?:shower\w*|bath\b|bathing|hygiene)\b/i.test(text);
  const isGrooming = /\b(?:morning|groom\w*)\b/i.test(text);
  const isPacing = /\b(?:pacing|wander\w*|walking)\b/i.test(text);
  const isSituationOrAnomaly = /\b(?:situation|status|how (?:is|are) (?:the situation|things|everything|he|she|dad|mum|mom)|any(?:thing)? (?:special|unusual|abnormal|different|wrong|concerning|out of the ordinary)|notice(?: anything)?|special thing|is (?:it|everything|he|she|dad|mum|mom) normal)\b/i.test(text);
  const isNowOrRecent = /\b(?:now|right now|currently|at the moment|latest|recent)\b/i.test(text);
  const explicitActivity = isToileting || isSleeping || isMeal || isShowering || isGrooming || isPacing || isEnvironment;
  const explicitTime = /\b(?:today|yesterday|last night|last|past|week|now|currently|\d{4}-\d{2}-\d{2})\b/i.test(text);
  if (previous && !overview && !explicitActivity && !explicitTime && isFollowUp(text)) {
    return { ...previous, task: isCalculation(text) ? "calculation" : isExplanation(text) ? "explanation" : previous.task === "clarification" ? previous.activities.length ? "activity" : "overview" : previous.task, comparison: previous.comparison || isEvaluation(text) || /normal|usual|compar|pattern|unnecessary|unnessary/.test(text), pattern: previous.pattern || /pattern|repeat|consecutive/.test(text) };
  }

  const behavioral = !overview && ((!isToileting && !isSleeping && !isMeal && !isShowering && !isGrooming &&
    (/\b(?:agitat\w*|escalat\w*|vocal\w*|room[ _-]?transitions?|crisis|episode\w*|restless\w*|distress\w*)\b/i.test(text) ||
     (isSituationOrAnomaly && (isNowOrRecent || !/\b(?:yesterday|last night|week|month|days?)\b/i.test(text))))) ||
    (isPacing && !isToileting && !isSleeping && !isMeal) ||
    (!!previous?.behavioral && !explicitActivity && isFollowUp(text)));

  let activities: string[] = [];
  if (overview) {
    activities = [];
  } else if (isEnvironment) {
    activities = ["Environmental_observation"];
  } else if (isToileting) {
    activities = ["Toileting"];
  } else if (isSleeping) {
    activities = ["Sleeping"];
  } else if (isMeal) {
    const namedMeals = ["Breakfast", "Lunch", "Dinner", "Snack"].filter(a => text.includes(a.toLowerCase()));
    activities = namedMeals.length ? namedMeals : ["Breakfast", "Lunch", "Dinner", "Snack"];
  } else if (isShowering) {
    activities = ["Showering"];
  } else if (isGrooming) {
    activities = ["Grooming", "Breakfast", "Showering"];
  } else if (behavioral) {
    activities = ["Pacing", "Room_transitions", "Vocal_activity", "Environmental_observation"];
  } else if (isPacing) {
    activities = ["Pacing"];
  } else if (isFollowUp(text) && previous?.activities?.length) {
    activities = previous.activities;
  }
  let end = Date.parse(anchor);
  let start = end - (behavioral ? 22 * MINUTE : (isNowOrRecent && !/\b(?:yesterday|last night|week|today)\b/i.test(text)) ? 60 * MINUTE : DAY);
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
  else if (isNowOrRecent && !behavioral && !overview) start = end - 60 * MINUTE;
  else if (previous && /^(was that|what about|compare|view|show (?:the )?(?:evidence|timeline)|is that)/.test(text)) { start = Date.parse(previous.start); end = Date.parse(previous.end); }
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Invalid time interval");
  return { task: overview ? "overview" : isCalculation(text) ? "calculation" : isExplanation(text) ? "explanation" : "activity", activities, start: new Date(start).toISOString(), end: new Date(end).toISOString(), behavioral, comparison: overview || behavioral || /usual|normal|compar|different|chang|baseline/.test(text), pattern: /pattern|week|consecutive|repeat/.test(text), coverage: /coverage|gap|missing|sensor/.test(text) };
}
