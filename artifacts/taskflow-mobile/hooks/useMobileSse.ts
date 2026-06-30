import { useEffect, useRef, useCallback } from "react";
import { Platform, AppState } from "react-native";

type Options = {
  url: string;
  token: string | null;
  enabled?: boolean;
  onMessage: (data: string) => void;
};

/**
 * Lightweight SSE client for React Native using XMLHttpRequest.
 * Native `EventSource` is not available in RN; XHR's `onprogress` event fires
 * incrementally so we can parse the stream without any native modules.
 *
 * Auto-reconnects after disconnect with exponential back-off (cap 30 s).
 */
export function useMobileSse({ url, token, enabled = true, onMessage }: Options) {
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(2000);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled || !token || Platform.OS === "web") return;

    const fullUrl = `${url}?token=${encodeURIComponent(token)}`;
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.open("GET", fullUrl, true);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");

    let cursor = 0;
    let buffer = "";

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;
      buffer += chunk;

      // SSE events are delimited by double newlines
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data) onMessage(data);
          }
          // Lines starting with ":" are comments/heartbeats — skip
        }
      }
    };

    const scheduleReconnect = () => {
      if (!mountedRef.current || !enabled) return;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 1.5, 30_000);
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current && enabled) connect();
      }, delay);
    };

    xhr.onerror = scheduleReconnect;
    xhr.onabort = () => { /* deliberate close, don't reconnect */ };

    xhr.onload = () => {
      // Connection closed by server — reconnect
      scheduleReconnect();
    };

    xhr.send();
  }, [url, token, enabled, onMessage]);

  const disconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
  }, []);

  // Connect / disconnect based on enabled + token
  useEffect(() => {
    mountedRef.current = true;
    retryDelayRef.current = 2000;

    if (enabled && token && Platform.OS !== "web") {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, token, connect, disconnect]);

  // Reconnect when app returns to foreground
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && enabled && token) {
        disconnect();
        retryDelayRef.current = 2000;
        connect();
      }
    });
    return () => sub.remove();
  }, [enabled, token, connect, disconnect]);
}
