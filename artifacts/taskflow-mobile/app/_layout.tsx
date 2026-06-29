import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppState, Platform } from "react-native";
import { setBaseUrl, setAuthTokenGetter, useListNotifications } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth, getCurrentToken } from "@/context/AuthContext";
import { OfflineProvider } from "@/context/OfflineContext";
import { OfflineBanner } from "@/components/OfflineBanner";
import { API_BASE_URL, API_DOMAIN } from "@/lib/config";

setBaseUrl(API_BASE_URL);
setAuthTokenGetter(() => getCurrentToken());

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === "(auth)";
    if (!isAuthenticated && !inAuth) {
      router.replace("/(auth)/welcome");
    } else if (isAuthenticated && inAuth) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="task/[id]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="task/create" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="change-password" options={{ headerShown: false, presentation: "modal" }} />
    </Stack>
  );
}

function AppBadgeSync() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { data: notifications } = useListNotifications({
    query: { enabled: isAuthenticated && Platform.OS !== "web", refetchInterval: 60_000 },
  });

  // Sync unread count to the OS app icon badge
  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    const unread = notifications?.filter((n) => !n.isRead).length ?? 0;
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        await Notifications.setBadgeCountAsync(unread);
      } catch {}
    })();
  }, [notifications, isAuthenticated]);

  // Refresh notification count whenever the app comes back to foreground
  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        queryClient.invalidateQueries({ queryKey: ["listNotifications"] });
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, queryClient]);

  return null;
}

function PushSetup() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === "web") return;
    setupPushNotifications();
  }, [isAuthenticated]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let responseSubscription: { remove: () => void } | null = null;

    (async () => {
      const Notifications = await import("expo-notifications");

      // Handle tap on a notification while the app is running or in background
      responseSubscription = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const taskId = response.notification.request.content.data?.taskId;
          if (taskId) {
            router.push(`/task/${taskId}` as any);
          }
        }
      );

      // Handle tap that cold-launched the app
      const initialResponse = await Notifications.getLastNotificationResponseAsync();
      if (initialResponse) {
        const taskId = initialResponse.notification.request.content.data?.taskId;
        if (taskId) {
          setTimeout(() => {
            router.push(`/task/${taskId}` as any);
          }, 500);
        }
      }
    })();

    return () => {
      responseSubscription?.remove();
    };
  }, []);

  async function setupPushNotifications() {
    try {
      const Notifications = await import("expo-notifications");
      await Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") return;

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;
      const domain = API_DOMAIN;
      const authToken = getCurrentToken();
      if (!token || !authToken) return;

      await fetch(`https://${domain}/api/push/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token, platform: "expo" }),
      }).catch(() => {});
    } catch {}
  }

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <OfflineProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AuthProvider>
                  <AppBadgeSync />
                  <PushSetup />
                  <OfflineBanner />
                  <RootLayoutNav />
                </AuthProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </OfflineProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
