import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_DOMAIN } from '@/lib/config';

const TASKS_CACHE_KEY = 'taskaya_tasks_cache';
export const PING_INTERVAL_MS = 15_000;

interface OfflineContextValue {
  isOnline: boolean;
  cachedTasks: any[] | null;
  saveCachedTasks: (tasks: any[]) => Promise<void>;
  mergeCachedTasks: (tasks: any[]) => Promise<void>;
  loadCachedTasks: () => Promise<any[] | null>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  cachedTasks: null,
  saveCachedTasks: async () => {},
  mergeCachedTasks: async () => {},
  loadCachedTasks: async () => null,
});

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [cachedTasks, setCachedTasks] = useState<any[] | null>(null);
  const cachedTasksRef = useRef<any[] | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const domain = API_DOMAIN;

  const ping = useCallback(async () => {
    if (!domain) return;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://${domain}/api/healthz`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      setIsOnline(res.ok);
    } catch {
      setIsOnline(false);
    }
  }, [domain]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      setIsOnline(navigator.onLine);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    ping();
    pingRef.current = setInterval(ping, PING_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') ping();
    });

    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      sub.remove();
    };
  }, [ping]);

  const saveCachedTasks = useCallback(async (tasks: any[]) => {
    try {
      await AsyncStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks));
      cachedTasksRef.current = tasks;
      setCachedTasks(tasks);
    } catch {}
  }, []);

  const mergeCachedTasks = useCallback(async (incoming: any[]) => {
    try {
      const existing = cachedTasksRef.current ?? [];
      const map = new Map<string | number, any>();
      for (const task of existing) {
        map.set(task.id, task);
      }
      for (const task of incoming) {
        map.set(task.id, task);
      }
      const merged = Array.from(map.values());
      await AsyncStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(merged));
      cachedTasksRef.current = merged;
      setCachedTasks(merged);
    } catch {}
  }, []);

  const loadCachedTasks = useCallback(async (): Promise<any[] | null> => {
    try {
      const raw = await AsyncStorage.getItem(TASKS_CACHE_KEY);
      if (!raw) return null;
      const tasks = JSON.parse(raw);
      cachedTasksRef.current = tasks;
      setCachedTasks(tasks);
      return tasks;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    loadCachedTasks();
  }, [loadCachedTasks]);

  return (
    <OfflineContext.Provider value={{ isOnline, cachedTasks, saveCachedTasks, mergeCachedTasks, loadCachedTasks }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
