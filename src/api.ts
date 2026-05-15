import { invoke } from "@tauri-apps/api/core";
import type {
  MonitorInfo,
  OutputRootInfo,
  RecorderStatus,
  RecordingEntry,
  Region,
  ScreenshotInfo,
  Session,
  Thumbnail,
  VirtualDesktopBounds,
} from "./types";

export const api = {
  listMonitors: () => invoke<MonitorInfo[]>("list_monitors"),
  virtualDesktopBounds: () =>
    invoke<VirtualDesktopBounds>("virtual_desktop_bounds"),
  validateMeetingName: (name: string) =>
    invoke<void>("validate_meeting_name", { name }),
  startRecording: (meetingName: string, region: Region) =>
    invoke<RecorderStatus>("start_recording", { meetingName, region }),
  captureOne: () => invoke<RecorderStatus>("capture_one"),
  captureThumbnail: (region: Region, maxDim: number) =>
    invoke<Thumbnail>("capture_thumbnail", { region, maxDim }),
  setDockIcon: (state: "close" | "half" | "open") =>
    invoke<void>("set_dock_icon", { state }),
  stopRecording: () => invoke<RecorderStatus>("stop_recording"),
  finalizeRecording: () => invoke<void>("finalize_recording"),
  recorderStatus: () => invoke<RecorderStatus>("recorder_status"),
  checkResumable: () => invoke<Session | null>("check_resumable"),
  resumeSession: () => invoke<RecorderStatus>("resume_session"),
  endSession: () => invoke<RecorderStatus>("end_session"),
  discardSession: () => invoke<void>("discard_session"),
  listScreenshots: (dir: string) =>
    invoke<ScreenshotInfo[]>("list_screenshots", { dir }),
  deleteScreenshots: (paths: string[]) =>
    invoke<number>("delete_screenshots", { paths }),
  openOutputDir: (dir: string) => invoke<void>("open_output_dir", { dir }),
  listRecordings: () => invoke<RecordingEntry[]>("list_recordings"),
  deleteRecording: (dir: string) => invoke<void>("delete_recording", { dir }),
  getOutputRoot: () => invoke<OutputRootInfo>("get_output_root"),
  setOutputRoot: (path: string | null) =>
    invoke<OutputRootInfo>("set_output_root", { path }),
  exportPdf: (imagePaths: string[], outputPath: string) =>
    invoke<void>("export_pdf", { imagePaths, outputPath }),
  exportPptx: (imagePaths: string[], outputPath: string, title: string) =>
    invoke<void>("export_pptx", { imagePaths, outputPath, title }),
  checkScreenRecordingPermission: () =>
    invoke<boolean>("check_screen_recording_permission"),
  requestScreenRecordingPermission: () =>
    invoke<boolean>("request_screen_recording_permission"),
  openScreenRecordingSettings: () =>
    invoke<void>("open_screen_recording_settings"),
  resetScreenRecordingPermission: () =>
    invoke<void>("reset_screen_recording_permission"),
  relaunchApp: () => invoke<void>("relaunch_app"),
};
