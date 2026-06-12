import type { Session } from "./session.js";
import { createRoom } from "./room.js";

const QUEUE_TARGET = 8;
const QUEUE_TIMEOUT_MS = 10_000;

const queue: Session[] = [];
let queueTimer: ReturnType<typeof setTimeout> | null = null;

export function joinQueue(session: Session): void {
  if (queue.includes(session)) {
    return;
  }
  queue.push(session);
  broadcastQueueStatus();

  if (queue.length >= QUEUE_TARGET) {
    flushQueue();
  } else if (!queueTimer) {
    queueTimer = setTimeout(() => {
      if (queue.length >= 1) flushQueue();
    }, QUEUE_TIMEOUT_MS);
  }
}

export function leaveQueue(session: Session): void {
  const idx = queue.indexOf(session);
  if (idx >= 0) queue.splice(idx, 1);
  broadcastQueueStatus();
}

function flushQueue(): void {
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  const humans = queue.splice(0, QUEUE_TARGET);
  const botCount = QUEUE_TARGET - humans.length;
  broadcastQueueStatus();
  createRoom(humans, botCount);
}

function broadcastQueueStatus(): void {
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i];
    if (s && s.ws.readyState === 1 /* OPEN */) {
      s.ws.send(JSON.stringify({ v: 1, t: "QUEUE_STATUS", p: { type: "QUEUE_STATUS", position: i + 1, size: queue.length } }));
    }
  }
}
