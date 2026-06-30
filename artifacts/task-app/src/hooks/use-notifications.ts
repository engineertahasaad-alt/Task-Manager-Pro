import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useSSE } from "./use-sse";

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

  // Read token once — SSE hook re-connects whenever it changes.
  const token = typeof window !== "undefined"
    ? localStorage.getItem("taskaya_token")
    : null;

  // 30 s fallback polling keeps things in sync if SSE is interrupted.
  const { data: notifications } = useListNotifications({
    query: { refetchInterval: enabled ? 30_000 : false, enabled },
  });

  // Invalidate notification list whenever the SSE stream delivers a message.
  const handleSSEMessage = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  }, [queryClient]);

  // Custom XHR-based SSE — works in both web and React Native.
  useSSE({
    url: "/api/notifications/stream",
    token: enabled ? token : null,
    onMessage: handleSSEMessage,
    enabled,
  });

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;
  const initializedRef = useRef(false);
  const prevIdsRef = useRef<Set<number>>(new Set());

  // Request browser notification permission once on mount.
  useEffect(() => {
    if (!enabled) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled]);

  // Detect newly-arrived unread notifications and alert the user.
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
