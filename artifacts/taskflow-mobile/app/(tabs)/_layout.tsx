import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme, Text } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useListNotifications, useListTasks } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

function NotifBadge() {
  const { data: notifications } = useListNotifications();
  const unread = notifications?.filter(n => !n.isRead).length ?? 0;
  const colors = useColors();
  if (!unread) return null;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: colors.destructive }]}>
      <Text style={badgeStyles.badgeText}>{unread > 99 ? '99+' : String(unread)}</Text>
    </View>
  );
}

function ReassignBadge() {
  const { user } = useAuth();
  const isManager = user?.role === 'owner' || user?.role === 'deputy';
  const { data: tasks } = useListTasks({}, { query: { enabled: isManager } });
  const pendingCount = isManager
    ? (tasks?.filter(t => t.reassignStatus === 'pending').length ?? 0)
    : 0;
  if (!isManager || !pendingCount) return null;
  return (
    <View style={[badgeStyles.badge, badgeStyles.reassignBadge]}>
      <Text style={badgeStyles.badgeText}>{pendingCount > 99 ? '99+' : String(pendingCount)}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  reassignBadge: { backgroundColor: '#F59E0B' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
});

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute" as const,
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 60, paddingBottom: 8 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color }) => (
            <View>
              <Feather name="check-square" size={22} color={color} />
              <ReassignBadge />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color }) => (
            <View>
              <Feather name="bell" size={22} color={color} />
              <NotifBadge />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: "Team",
          tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Feather name="settings" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
