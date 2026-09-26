export interface ActivityEvent {
  id: string;
  recipient_id: string;
  activity: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  metadata: {
    source: string;
    synthetic?: boolean;
    phase?: "baseline" | "episode" | "current" | "recovery";
    episode_id?: string;
    location?: string;
    sensor_type?: string;
    count?: number;
    summary?: string;
  };
}
export interface Baseline {
  id: string;
  recipient_id: string;
  activity: string;
  mean_duration: number;
  std_duration: number | null;
  mean_frequency: number;
  window_days: number;
  window_start: string;
  window_end: string;
  sample_count: number;
  metadata: Record<string, unknown>;
}
export interface Recipient {
  id: string;
  name: string;
  timezone: string;
  is_demo: boolean;
  metadata: Record<string, unknown>;
}
export interface Dataset { recipients: Recipient[]; events: ActivityEvent[]; baselines: Baseline[] }
export interface Intent {
  task?: "activity" | "overview" | "explanation" | "calculation";
  activities: string[];
  start: string;
  end: string;
  behavioral: boolean;
  comparison: boolean;
  pattern: boolean;
  coverage: boolean;
}
export const MINUTE = 60_000;
export const DAY = 86_400_000;
