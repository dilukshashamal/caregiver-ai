export interface CareRecipient {
  id: string;
  full_name: string;
  timezone: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceReference {
  evidence_id: string;
  event_type: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  summary: string;
  source_event_ids?: string[];
  sensor_observations?: Array<{
    id: string;
    sensor_id: string;
    sensor_type: string;
    location: string;
    state: string;
    observed_at: string;
    source?: string;
  }>;
}

export interface GroundedClaim {
  claim_text: string;
  evidence_ids: string[];
}

export interface GroundedAnswer {
  answer: string;
  claims: GroundedClaim[];
  evidence: EvidenceReference[];
  limitations: string[];
  data_coverage_summary: string;
  abstained: boolean;
  safety_flags: string[];
  conversation_id?: string;
  message_id?: string;
  session_id?: string;
}

export interface ChatRequestPayload {
  message: string;
  care_recipient_id: string;
  session_id?: string;
  conversation_id?: string;
  reference_time?: string;
}

export interface ChatMessage {
  id: string;
  role: "caregiver" | "assistant";
  content: string;
  timestamp: string;
  groundedAnswer?: GroundedAnswer;
  isError?: boolean;
}
