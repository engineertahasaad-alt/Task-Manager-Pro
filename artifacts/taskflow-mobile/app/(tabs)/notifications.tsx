import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';

const NOTIF_ICONS: Record<string, { icon: string; color: string }> = {
  task_assigned: { icon: 'user-plus', color: '#4F6EF7' },
  deadline_approaching: { icon: 'clock', color: '#F59E0B' },
  task_completed: { icon: 'check-circle', color: '#22C55E' },
  task_approved: { icon: 'award', color: '#8B5CF6' },
  task_reopened: { icon: 'refresh-cw', color: '#EF4444' },
};

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading, refetch } = useListNotifications();
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead } = useMarkAllNotificationsRead();

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;
  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

  function handleMarkRead(id: number) {
    markRead({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['listNotifications'] }),
    });
  }

  function handleMarkAllRead() {
    markAllRead(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['listNotifications'] }),
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity
            style={[styles.markAllBtn, { backgroundColor: colors.primary + '15' }]}
            onPress={handleMarkAllRead}
          >
            <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={notifications ?? []}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 },
          ]}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const config = NOTIF_ICONS[item.type] ?? { icon: 'bell', color: colors.primary };
            return (
              <TouchableOpacity
                style={[
                  styles.notifCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  !item.isRead && { borderLeftWidth: 3, borderLeftColor: colors.primary },
                ]}
                onPress={() => {
                  if (!item.isRead) handleMarkRead(item.id);
                  if (item.taskId) router.push(`/task/${item.taskId}` as any);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.notifIcon, { backgroundColor: config.color + '18' }]}>
                  <Feather name={config.icon as any} size={18} color={config.color} />
                </View>
                <View style={styles.notifContent}>
                  <Text style={[styles.notifMessage, { color: colors.foreground }, !item.isRead && { fontFamily: 'Inter_600SemiBold' }]}>
                    {item.message}
                  </Text>
                  <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
                {!item.isRead ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="bell-off" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No notifications</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>You're all caught up!</Text>
            </View>
          }
          scrollEnabled={!!(notifications && notifications.length > 0)}
        />
      )}
    </View>
  );
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  markAllText: { fontSize: 13, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8,
  },
  notifIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifContent: { flex: 1 },
  notifMessage: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 4 },
  notifTime: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
