// Product vocabulary is independent of a recipient's records and provider quota.
// Definitions describe what a label means, never assert that a sensor is present
// or that a particular observation occurred for the selected person.
export const concepts: { names: string[]; explanation: string }[] = [
  { names: ["environmental observation", "environmental observations", "environmental sensor", "environmental data"], explanation: "An environmental observation is a record about the surroundings, such as room temperature or light level, rather than an action by your loved one. It can provide context alongside activity records, but it does not establish why someone behaved a certain way. A duration on this record describes the observation interval, not time spent doing an activity." },
  { names: ["room transition", "room transitions"], explanation: "A room transition is a recorded movement from one room to another. Repeated transitions can help describe a routine or a change from the person’s usual pattern; they do not, by themselves, tell us the person’s intention or emotional state." },
  { names: ["vocal activity", "vocalization", "vocalisations", "vocalizations"], explanation: "Vocal activity means recorded voice-related sound. Its frequency or duration can be compared with earlier recordings. The label alone does not tell us what was said or whether the person was upset." },
  { names: ["pacing"], explanation: "Pacing describes repeated walking back and forth or along a similar path. NAAI compares recorded pacing with the person’s usual pattern. Pacing alone does not establish agitation or its cause." },
  { names: ["baseline", "personal baseline"], explanation: "A personal baseline summarizes someone’s earlier recorded routine, such as their average activity duration or daily frequency. It provides a reference for comparing later observations. It is not a medical standard, and its usefulness depends on how much reliable history is available." },
  { names: ["deviation", "behavioral deviation", "behavioural deviation"], explanation: "A deviation is a difference between a recorded measurement and the person’s baseline. It describes a change worth understanding in context; it does not establish that something is wrong or explain the cause." },
  { names: ["evidence", "related activities"], explanation: "Evidence is the set of recorded events or baseline statistics supporting an answer. Related activities lets you inspect the records and timestamps used. These records support observations, not a diagnosis or proof of a cause." },
  { names: ["timeline"], explanation: "A timeline puts recorded events in time order so you can see what happened before, during, and after a change. Gaps in the records do not prove that no activity occurred." },
  { names: ["synthetic demonstration", "synthetic data"], explanation: "Synthetic data means example records created for demonstration and testing. They are not observations of a real person. The sample profiles illustrate how NAAI explains routines and changes." },
  { names: ["seated activity"], explanation: "Seated activity is a record indicating that the person was seated. It does not establish that they were calm, comfortable, asleep, or recovering." },
];

export function explainConcept(message: string): string | null {
  const text = message.trim().toLowerCase().replace(/[’]/g, "'").replace(/[_-]/g, " ").replace(/[?!.]+$/g, "").trim();
  const match = text.match(/^(?:please )?(?:what (?:is|are) (?:an? |the )?|what does (?:the )?|(?:can you )?(?:explain|define|describe) (?:the term |an? |the )?|(?:the )?meaning of (?:the )?)(.+?)(?: mean| means)?$/);
  if (!match) return null;
  const term = match[1].replace(/["“”]/g, "").trim();
  const concept = concepts.find(c => c.names.includes(term));
  if (concept) return concept.explanation;
  // Unknown terminology should not silently become an all-activity query.
  // Leave questions about a person, time window, or prior answer to evidence routing.
  if (/\b(?:dad|mum|mom|he|his|she|her|they|their|my|your|you|naai|gennaai|doing|happening|today|yesterday|night|current|latest|normal|usual|that|this|above|reason|cause|time|duration)\b/.test(term) || term.split(/\s+/).length > 6) return null;
  return "Which label or term would you like me to explain? You can paste the wording from the answer, such as ‘environmental observation’, ‘room transitions’, or ‘baseline’.";
}
