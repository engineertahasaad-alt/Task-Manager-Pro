/**
 * useSSE — Custom Server-Sent Events hook backed by XMLHttpRequest.
 *
 * Why XHR instead of native EventSource?
 * - React Native does not ship EventSource; XHR works in both RN and web.
 * - Gives us full control over reconnect logic and Authorization headers.
 *
 * Reconnect strategy: exponential back-off starting at `initialRetryMs`,
 * doubling on each failure, capped at `maxRetryMs`. A successful data
 * message resets the retry counter so long-lived stable connections never
 * penalise a brief blip.
 */

import { useEffect, useRef } from "react";

export interface SSEOptions {
  url: string;
  token: string | null;
  onMessage: (data: string, event: string) => void;
  onError?: (err: Error) => void;
  enabled?: boolean;
  initialRetryMs?: number;
  maxRetryMs?: number;
}

export function useSSE({
  url,
  token,
  onMessage,
  onError,
  enabled = true,
  initialRetryMs = 1_000,
  maxRetryMs = 30_000,
}: SSEOptions): void {
  // Bundle all mutable connection state into one ref so inner functions
  // always see the latest values without being listed as effect deps.
  const s = useRef({
    xhr: null as XMLHttpRequest | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    retries: 0,
    active: false,
    lastIndex: 0,
  });

  // Keep callbacks fresh without re-triggering the connection effect.
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  useEffect(() => { onMessageRef.current = onMessage; });
  useEffect(() => { onErrorRef.current = onError; });

  useEffect(() => {
    if (!enabled || !token) return;

    const st = s.current;
    st.active = true;
    st.retries = 0;

    function parseChunk(chunk: string): void {
      // SSE grammar: event lines separated by blank lines.
      let eventType = "message";
      let dataLines: string[] = [];

      for (const raw of chunk.split("\n")) {
        const line = raw.trimEnd();

        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        } else if (line.startsWith(":")) {
          // Comment / heartbeat — ignore
        } else if (line === "") {
          // Blank line → dispatch accumulated event
          if (dataLines.length > 0) {
            onMessageRef.current(dataLines.join("\n"), eventType);
            st.retries = 0; // reset backoff on a real message
          }
          eventType = "message";
          dataLines = [];
        }
      }
    }

    function connect(): void {
      if (!st.active) return;

      // Abort any lingering connection before opening a new one.
      if (st.xhr) {
        st.xhr.abort();
        st.xhr = null;
      }
      st.lastIndex = 0;

      const xhr = new XMLHttpRequest();
      st.xhr = xhr;

      // Append token as query param (EventSource cannot send headers,
      // so the server already accepts ?token= for SSE clients).
      const fullUrl = `${url}?token=${encodeURIComponent(token!)}`;
      xhr.open("GET", fullUrl, true);
      xhr.setRequestHeader("Accept", "text/event-stream");
      xhr.setRequestHeader("Cache-Control", "no-cache");
      // Disable response buffering in React Native's XHR polyfill.
      if (typeof xhr.setRequestHeader === "function") {
        xhr.setRequestHeader("X-Accel-Buffering", "no");
      }

      xhr.onreadystatechange = (): void => {
        // readyState 3 = LOADING (streaming chunks arrive here)
        // readyState 4 = DONE   (connection closed)
        if (xhr.readyState < 3) return;

        // Slice only the new bytes since last callback.
        const chunk = xhr.responseText.slice(st.lastIndex);
        st.lastIndex = xhr.responseText.length;

        if (chunk) parseChunk(chunk);

        if (xhr.readyState === 4) {
          // Server closed the connection — schedule a reconnect.
          reconnect();
        }
      };

      xhr.onerror = (): void => {
        onErrorRef.current?.(new Error("SSE connection error"));
        reconnect();
      };

      xhr.send();
    }

    function reconnect(): void {
      if (!st.active) return;
      // Exponential back-off: 1 s → 2 s → 4 s → … capped at maxRetryMs.
      const delay = Math.min(initialRetryMs * 2 ** st.retries, maxRetryMs);
      // Cap the exponent counter to avoid numeric overflow on very long runs.
      st.retries = Math.min(st.retries + 1, 20);
      st.timer = setTimeout(connect, delay);
    }

    connect();

    return (): void => {
      // Cleanup: kill the XHR and cancel any pending reconnect timer.
      st.active = false;
      if (st.timer) {
        clearTimeout(st.timer);
        st.timer = null;
      }
      if (st.xhr) {
        st.xhr.abort();
        st.xhr = null;
      }
    };
  }, [enabled, token, url, initialRetryMs, maxRetryMs]);
}
