import express from "express";
import multer from "multer";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

export interface SSEHandle {
  /** Send a `data:` SSE frame. Silently no-op after the client disconnects. */
  send: (data: object) => void;
  /** AbortSignal that fires when the client disconnects. Pass into long-running ops. */
  signal: AbortSignal;
  /** True once the client has disconnected or the handler returned. */
  closed: () => boolean;
}

export function setupSSE(req: express.Request, res: express.Response): SSEHandle {
  void req; // kept for signature symmetry / future per-request hooks
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const controller = new AbortController();
  let closed = false;

  // Only treat "close" as client-disconnect when the response hasn't been
  // fully sent. After res.end() the connection close is the normal lifecycle
  // and must NOT flip `closed` or abort the controller — otherwise harmless
  // late writes get swallowed and tests see an empty body.
  // Use res.on('close') rather than req.on('close'): req's 'close' can fire
  // after the request body stream ends (before the handler even runs), which
  // would falsely abort the workflow. res's 'close' only fires when the
  // response stream is torn down — either by res.end() or by the client
  // dropping the connection. We gate on res.writableEnded to distinguish.
  const onClientDisconnect = () => {
    if (closed || res.writableEnded) return;
    closed = true;
    controller.abort();
  };
  res.on("close", onClientDisconnect);

  return {
    send: (data) => {
      if (closed) return;
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        closed = true;
        controller.abort();
      }
    },
    signal: controller.signal,
    closed: () => closed,
  };
}
