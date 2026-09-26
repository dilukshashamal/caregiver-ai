# Safety and grounding

The application describes observations, not emotions, diagnoses, medical causes or treatments. It does not label the sample as a validated crisis predictor. All synthetic records and profiles identify their source.

Input safety preserves conservative medical deflections and rejects common prompt overrides, private-data exfiltration and harmful instructions. Regex detection is a convenience boundary, not the security model: only authorized recipient-scoped records can be retrieved. Social-only replies use no records and do not bypass emergency checks.

The LLM now writes natural paragraphs grounded in computed facts, with supporting fact IDs. The server maps accepted paragraphs to evidence IDs, checks quantities/units/timestamps and selected unsafe assertions, and rejects malformed or truncated responses before emitting generated prose. Baselines and aggregates remain explicitly labeled. Failures use deterministic facts. These checks reduce errors but cannot guarantee semantic faithfulness or absence of every unsafe claim; they are not clinical validation. See [response design](RESPONSE_DESIGN.md).

Public mode is only for the fixed sample recipients. Private mode fails closed until application authentication is implemented. Direct database access from anonymous/authenticated browser roles is revoked, including RPC execution. Never store real personal records under the public sample IDs.

No raw footage/audio is transmitted. Three bounded recent exchanges travel in a signed, unencrypted client-held token and are sent to the configured model with compact facts. This is not durable transcript storage. API failures omit stack traces, SQL and provider response bodies. Credentials belong only in ignored local files or Vercel environment variables.

Activity labels do not establish continuous sensor coverage. The app reports annotation counts and actual intervals without fabricating coverage percentages. No record means no recorded evidence, not proof that an activity did not occur.
