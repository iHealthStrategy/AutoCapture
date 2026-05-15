export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorInfo {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
}

export type RecorderState = "idle" | "recording";

export interface RecorderStatus {
  state: RecorderState;
  captured_count: number;
  meeting_name: string | null;
  started_at: string | null;
  region: Region | null;
  output_dir: string | null;
}

export interface Session {
  meeting_name: string;
  date: string;
  region: Region;
  started_at: string;
  captured_count: number;
  next_seq: number;
}

export interface ScreenshotInfo {
  seq: number;
  filename: string;
  path: string;
}

export interface VirtualDesktopBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecordingEntry {
  date: string;
  meeting_name: string;
  dir: string;
  count: number;
  status: "in_progress" | "completed";
  created_at: string | null;
}

export interface Thumbnail {
  width: number;
  height: number;
  gray: number[];
}

export interface OutputRootInfo {
  effective: string;
  default: string;
  is_custom: boolean;
}
