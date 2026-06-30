import type { Response } from "express";

const connections = new Map<number, Set<Response>>();

export function addSseConnection(userId: number, res: Response): void {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId)!.add(res);
}

export function removeSseConnection(userId: number, res: Response): void {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) connections.delete(userId);
}

export function pushNotificationToUser(userId: number): void {
  const set = connections.get(userId);
  if (!set || set.size === 0) return;
  const payload = 'data: {"type":"notification"}\n\n';
  const dead: Response[] = [];
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      dead.push(res);
    }
  }
  for (const res of dead) set.delete(res);
}
