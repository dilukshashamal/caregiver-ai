# Caregiver conversation design

Reviewed September 26, 2026. The assistant speaks to a family caregiver. It must answer the caregiver's actual question, distinguish recorded observations from interpretation, and avoid repeating a statistical report on every turn.

## Research informing the design

- [Alzheimer's Association: Communication](https://www.alz.org/help-support/caregiving/daily-care/communications) emphasizes listening, allowing time, and clear communication. We adapt those principles to the assistant's tone and follow-up handling. The original guidance concerns communication with people living with dementia; it is not a clinical validation of this chatbot.
- [Alzheimer's Association: Daily Care Plan](https://www.alz.org/help-support/caregiving/daily-care/daily-care-plan) describes routines tailored to the individual. The application therefore interprets “normal” as a question about the person's own recorded baseline, not a universal ideal duration.
- [Alzheimer's Association: Food and Eating](https://www.alz.org/help-support/caregiving/daily-care/food-eating) discusses multiple aspects of mealtime support. An activity duration alone cannot establish intake, appetite, enjoyment, swallowing safety, or overall wellbeing. We do not infer these from a breakfast annotation.
- [NIA: Agitation, Aggression, and Sundowning](https://www.nia.nih.gov/health/alzheimers-changes-behavior-and-communication/coping-agitation-aggression-and-sundowning) describes contextual factors around behavior changes. The app can invite relevant context but must not identify an unobserved cause from sensor annotations.

## Response behavior

| Question | Expected behavior |
| --- | --- |
| “Is his breakfast normal?” | Lead with whether the measured duration matches the personal baseline. State the specific limit of that comparison briefly. |
| “Why did you get 20 minutes?” | Explain the timestamps and elapsed interval; this is a calculation question, not a request for a medical cause. |
| “Why is he behaving like that?” | Refer to the prior observations, distinguish correlation from cause, and ask at most one useful context question. |
| “Tell me about his day” | Summarize the relevant routines and changes in plain language. Avoid dumping every event. |
| “Thanks” | Acknowledge warmly, preserve the last evidence context, and make no database or model calls. |
| An emergency or request for a diagnosis | Apply the corresponding safety response before retrieval or generation. |

The LLM composes original prose from the question, three bounded recent exchanges, and at most twelve server-computed facts. It does not merely select canned sentences. The prompt applies across activities and recipients; the breakfast example is a regression case, not a fixed response template.

Each paragraph returns supporting fact IDs. Before emission, the server validates structure, citation references, numeric values, time units, clock values, dates, and selected unsafe assertions. The evidence drawer receives only records used by the accepted paragraphs. These checks do **not** prove complete semantic entailment or clinical safety: a supported number can still be interpreted incorrectly in prose. Continued caregiver review and broader adversarial evaluation are needed before real-care deployment.

Rejected prose can receive at most one corrective generation per request, with an eight-second timeout and a separate reservation from the existing provider budget. Invalid/truncated output, provider errors, or exhausted budgets use computed factual fallback and disclose it under “More about this answer.” The model's complete short response is validated before SSE text chunks are sent; raw unvalidated model tokens are not displayed. Status heartbeats continue while generation runs. There are no artificial typing delays.

## Verification

`npm test` covers natural paraphrases and citations, the breakfast → calculation → thanks sequence, other routine/topic changes, safety, invalid prose fallback, and both provider transports. `node --conditions=react-server --import tsx scripts/check-chat.ts --breakfast` tests the synthetic sequence against configured providers and prints the actual responses and `LLM_COMPOSED` flags. It uses the existing provider budgets. Live output wording can vary.
