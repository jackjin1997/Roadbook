import express from "express";
import multer from "multer";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

export function setupSSE(res: express.Response): (data: object) => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  return (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
}
