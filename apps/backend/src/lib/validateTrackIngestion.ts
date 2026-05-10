import fs from "fs";
import path from "path";

export interface TrackIngestionInput {
  audioFilePath: string | null | undefined;
  title: string | null | undefined;
  isrc: string | null | undefined;
}

/**
 * Single canonical gate for all track ingestion.
 * Called by the route handler, queue producer, and any script
 * that creates a track. If this throws, the track does not enter
 * the system at any layer.
 */
export function validateTrackIngestion(input: TrackIngestionInput): void {
  const { audioFilePath, title, isrc } = input;

  if (!audioFilePath) {
    throw new Error("Ingestion rejected: audioFilePath is null or missing");
  }
  if (!path.isAbsolute(audioFilePath)) {
    throw new Error(
      `Ingestion rejected: audioFilePath must be absolute: ${audioFilePath}`
    );
  }
  if (!fs.existsSync(audioFilePath)) {
    throw new Error(
      `Ingestion rejected: file does not exist on disk: ${audioFilePath}`
    );
  }
  if (
    audioFilePath.includes("/tmp/placeholder") ||
    audioFilePath.includes("/Downloads/") ||
    audioFilePath.includes("/Desktop/")
  ) {
    throw new Error(
      `Ingestion rejected: unstable or user-directory path: ${audioFilePath}`
    );
  }
  if (!title || title.trim().length === 0) {
    throw new Error("Ingestion rejected: title is required");
  }
  if (!isrc || isrc.trim().length === 0) {
    throw new Error("Ingestion rejected: isrc is required");
  }
}
