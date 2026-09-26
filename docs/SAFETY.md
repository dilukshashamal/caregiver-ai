# Safety and grounding

The application describes observations, not emotions, diagnoses, medical causes or treatments. It does not label the sample as a validated crisis predictor. All synthetic records and profiles identify their source.

Input safety preserves the reference's conservative medical deflections and rejects common prompt overrides, private-data exfiltration and harmful instructions. Regex detection is a convenience boundary, not the security model: only scoped database records can be retrieved, and only exact server-authored claims can be emitted by the model-selection path.

Every emitted claim has evidence IDs found in the returned evidence package. Baselines appear as explicitly labeled baseline records. Larger collections appear as explicitly labeled deterministic aggregates carrying source event IDs. The model never writes unrestricted caregiver-facing factual text. Unknown, duplicate or malformed selections are rejected/deduplicated; unsent verified sentences complete the fallback answer. Numbers, dates and medical wording therefore cannot be invented by the LLM during streaming.

Public mode is only for the fixed sample recipients. Private API mode requires verified Supabase authentication and membership; it does not trust a client-supplied profile ID. Direct database access from anonymous/authenticated browser roles is revoked, including RPC execution. Never store real personal records under the public sample IDs.

No raw footage/audio is transmitted. No chat transcript is persisted by this MVP. API failures omit stack traces, SQL and provider response bodies. Credentials belong only in ignored local files or Vercel environment variables.

Activity labels do not establish continuous sensor coverage. The app reports annotation counts and actual intervals without fabricating coverage percentages. No record means no recorded evidence, not proof that an activity did not occur.
