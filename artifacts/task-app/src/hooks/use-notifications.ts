import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AC();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(880, t);
    osc2.frequency.setValueAtTime(1100, t + 0.13);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc1.start(t); osc1.stop(t + 0.15);
    osc2.start(t + 0.13); osc2.stop(t + 0.6);
  } catch {}
}

export function useNotifications(enabled = true) {
  const queryClient = useQueryClient();

  // 30s fallback polling — SSE handles instant updates
  const { data: notifications } = useListNotifications({
    query: { refetchInterval: enabled ? 30_000 : false, enabled },
  });

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;
  const initializedRef = useRef(false);
  const prevIdsRef = useRef<Set<number>>(new Set());

  // SSE connection for instant in-browser notifications
  useEffect(() => {
    if (!enabled) return;
    const token = localStorage.getItem("taskaya_token");
    if (!token) return;

    const url = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    };

    // EventSource auto-reconnects on error — no manual handling needed

    return () => es.close();
  }, [enabled, queryClient]);

  useEffect(() => {
    if (!enabled) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || notifications === undefined) return;

    const currentUnread = notifications.filter((n) => !n.isRead);
    const currentIds = new Set(currentUnread.map((n) => n.id));

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevIdsRef.current = currentIds;
      return;
    }

    const newOnes = currentUnread.filter((n) => !prevIdsRef.current.has(n.id));

    if (newOnes.length > 0) {
      playNotificationSound();
      if ("Notification" in window && Notification.permission === "granted") {
        newOnes.forEach((n) => {
          try {
            const browserNotif = new Notification("Taskaya", {
              body: n.message,
              icon: "/logo.png",
              tag: `taskaya-notif-${n.id}`,
            });
            if (n.taskId) {
              browserNotif.onclick = () => {
                window.focus();
                window.location.href = `/tasks/${n.taskId}`;
              };
            }
          } catch {}
        });
      }
    }

    prevIdsRef.current = currentIds;
  }, [enabled, notifications]);

  return { unreadCount, notifications: notifications ?? [] };
}
