import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useListTasks } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useOffline } from '@/context/OfflineContext';
import { TaskCard } from '@/components/TaskCard';

type Status = 'open' | 'completed' | 'approved' | 'reopened';

const FILTERS: { label: string; value: Status | null }[] = [
  { label: 'All', value: null },
  { label: 'Open', value: 'open' },
  { label: 'Completed', value: 'completed' },
  { label: 'Approved', value: 'approved' },
  { label: 'Reopened', value: 'reopened' },
];

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isOnline, cachedTasks, saveCachedTasks } = useOffline();
  const [selectedFilter, setSelectedFilter] = useState<Status | null>(null);
  const isManager = user?.role === 'owner' || user?.role === 'deputy';

  const { data: tasks, isLoading, refetch, isError } = useListTasks(
    selectedFilter ? { status: selectedFilter } : {},
    { query: { enabled: isOnline } }
  );

  const pendingReassignments = isManager && isOnline
    ? (tasks?.filter(t => t.reassignStatus === 'pending') ?? [])
    : [];

  useEffect(() => {
    if (tasks && tasks.length > 0 && !selectedFilter) {
      saveCachedTasks(tasks as any[]);
    }
  }, [tasks, selectedFilter]);

  const displayTasks = isOnline ? tasks : (cachedTasks ?? []);
  const showingCached = !isOnline && !!cachedTasks;

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Tasks</Text>
        <View style={styles.headerRight}>
          {showingCached ? (
            <View style={[styles.cachedBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="clock" size={11} color={colors.mutedForeground} />
              <Text style={[styles.cachedText, { color: colors.mutedForeground }]}>Cached</Text>
            </View>
          ) : null}
          {isManager ? (
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: isOnline ? colors.primary : colors.border }]}
              onPress={() => isOnline && router.push('/task/create' as any)}
              disabled={!isOnline}
            >
              <Feather name="plus" size={18} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={[styles.filterBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={item => item.label}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                { borderColor: colors.border, backgroundColor: colors.card },
                selectedFilter === item.value && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setSelectedFilter(item.value)}
            >
              <Text style={[
                styles.filterText,
                { color: colors.mutedForeground },
                selectedFilter === item.value && { color: '#fff' },
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {pendingReassignments.length > 0 ? (
        <TouchableOpacity
          style={[styles.reassignBanner, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B' }]}
          onPress={() => router.push(`/task/${pendingReassignments[0].id}` as any)}
          activeOpacity={0.8}
        >
          <View style={styles.reassignBannerIcon}>
            <Feather name="shuffle" size={16} color="#F59E0B" />
          </View>
          <View style={styles.reassignBannerContent}>
            <Text style={styles.reassignBannerTitle}>
              {pendingReassignments.length === 1
                ? '1 reassignment request pending'
                : `${pendingReassignments.length} reassignment requests pending`}
            </Text>
            <Text style={styles.reassignBannerSub}>Tap to review</Text>
          </View>
          <Feather name="chevron-right" size={16} color="#F59E0B" />
        </TouchableOpacity>
      ) : null}

      {isLoading && isOnline ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={(displayTasks ?? []) as any[]}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 },
          ]}
          refreshControl={
            isOnline
              ? <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
              : undefined
          }
          renderItem={({ item }) => (
            <TaskCard task={item} onPress={() => router.push(`/task/${item.id}` as any)} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name={isOnline ? "inbox" : "wifi-off"} size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {isOnline ? 'No tasks' : 'Offline'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {isOnline
                  ? (selectedFilter ? `No ${selectedFilter} tasks found` : 'No tasks assigned yet')
                  : 'No cached tasks available'}
              </Text>
            </View>
          }
          scrollEnabled={!!(displayTasks && displayTasks.length > 0)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cachedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  cachedText: { fontSize: 11, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  createBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  filterBar: { paddingVertical: 10, borderBottomWidth: 1 },
  filterList: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  filterText: { fontSize: 13, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  reassignBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 2,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  reassignBannerIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#F59E0B22',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  reassignBannerContent: { flex: 1 },
  reassignBannerTitle: {
    fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', color: '#92400E',
  },
  reassignBannerSub: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: '#B45309', marginTop: 1,
  },
});
