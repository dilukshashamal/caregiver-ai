# Source audit and migration map

Reference: `dilukshashamal/pilot-caregiver`, commit `bef6b79573fbe542ac0589d906de86cea9e3fc61`.
The destination repository was empty except for its Git configuration. The reference was fetched into the ignored `.source-reference/` directory, then its frontend and immutable data files were copied. The Python server was inspected, not retained as a runtime dependency.

| Inspected source | Finding / TypeScript implementation |
| --- | --- |
| `frontend/src/lib/types.ts` | UI expects `full_name`, `care_recipient_id`, `GroundedAnswer`, claim IDs, and timestamped evidence. Preserved; added optional aggregate source IDs. |
| `frontend/src/lib/api.ts` | Used `NEXT_PUBLIC_BACKEND_URL`, `/api/v1/*`, and one complete JSON response. Replaced by same-origin routes and incremental SSE parsing. Both recipient ID spellings are accepted server-side. |
| `page.tsx`, `ChatComposer`, `ChatStream`, `EvidenceDrawer`, `RecipientSelector` | Existing UI has no token-stream callback. Only page message state is updated; JSX/layout remains identical. Other named components and styles are copied unchanged. |
| Domain `models.py`, `enums.py`, repository `models.py` | Recipient UUIDs, activity enums, seconds-based duration, sensor references, immutable baselines, conversations. Target uses text recipient IDs, UUID record IDs, database minutes, UI seconds; additive multimodal activities. |
| `baseline_calculator.py` | Inclusive calendar-day counts with zeros, sample standard deviation (`n-1`, null for fewer than two samples), duration averages. Ported into pure TypeScript. |
| `comparison_engine.py` | Deterministic delta/percentage/z-score, undefined growth from zero, 25% or 2-sigma significance. Ported with unit tests. |
| `pattern_detector.py` | Consecutive-day shifts. Port resets streaks on missing calendar days and avoids labeling a zero baseline with zero counts as a change. Full calendar days only are used for the query pattern statistic. Circular mean timing routines are not exposed by this MVP's query adapter. |
| `retrieval_tools.py` | Authorized recipient scope, deterministic summaries, baseline comparisons, evidence, coverage. Moved to repository/evidence modules; bounded pagination rejects overflow instead of presenting truncated counts. |
| `chat_orchestrator.py` | Safety → verified memory → intent/planning → scoped retrieval → evidence → generation → validation → memory update. Explicit questions use local parsing; ambiguous questions can use a restricted model plan. Signed bounded recent exchanges replace Redis; there is no durable conversation database. |
| `prompt_templates.py` | Behavioral facts only, no medical/causal inference, no LLM arithmetic, explicit missing-data limits. Adapted into constrained streaming sentence selection. |
| `safety_filter.py`, `grounding_validator.py` | Medical and adversarial deflection plus evidence/numeric validation. Exact precomputed sentence selection makes numeric/date/wording invention impossible at the provider boundary. No unsafe raw token reaches the browser. |
| `scripts/ingest_ordonez.py` and ingestion parser | Timestamp normalization, canonical labels, deterministic IDs, invalid row reports. TypeScript seed preserves inputs and provides a dry run. |
| `scripts/compute_baselines.py` | First 65% of each recording span forms the baseline. Retained for Ordonez; explicit 14-day training window for synthetic profiles. |
| `data/raw/OrdonezA_ADLs.txt`, `OrdonezB_ADLs.txt` | 245 and 493 accepted annotations respectively; 3 reversed A intervals rejected. Original data is not multimodal camera/audio evidence. |

The source's Python/Redis-specific repository guidance conflicts with the requested Next.js/Supabase architecture; the explicit migration request governs. Vector search is added for narrative ranking only; relational queries still determine counts and durations.

The UCI attribution/restrictions are retained in `data/raw/README.txt`. No actual camera/audio files or people are represented by the synthetic home-sensing sample.
