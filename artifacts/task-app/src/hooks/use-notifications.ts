import { useEffect, useRef } from "react";
import { useListNotifications } from "@workspace/api-client-react";

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
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(660, t + 0.12);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.start(t);
    osc.stop(t + 0.5);
  } catch {
  }
}

export function useNotifications(enabled = true) {
  const { data: notifications } = useListNotifications({
    query: { refetchInterval: enabled ? 30000 : false, enabled },
  });

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;
  const initializedRef = useRef(false);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled]);

  useEffect(() => {
    if (notifications === undefined) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevCountRef.current = unreadCount;
      return;
    }

    if (unreadCount > prevCountRef.current) {
      playNotificationSound();
      const diff = unreadCount - prevCountRef.current;
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("TaskFlow", {
            body: `You have ${diff} new notification${diff > 1 ? "s" : ""}`,
            icon: "/favicon.ico",
            tag: "taskflow-notification",
          });
        } catch {}
      }
    }
    prevCountRef.current = unreadCount;
  }, [notifications, unreadCount]);

  return { unreadCount, notifications };
}
