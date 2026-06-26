import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useListTasks } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useOffline } from '@/context/OfflineContext';
import { TaskCard } from '@/components/TaskCard';

type Status = 'open' | 'completed' | 'approved' | 'reopened';
type FilterValue = Status | null | 'delegated';

const FILTERS: { label: string; value: FilterValue; icon?: string }[] = [
  { label: 'All', value: null },
  { label: 'Open', value: 'open' },
  { label: 'Completed', value: 'completed' },
  { label: 'Approved', value: 'approved' },
  { label: 'Reopened', value: 'reopened' },
];

const MANAGER_FILTERS: { label: string; value: FilterValue; icon?: string }[] = [
  ...FILTERS,
  { label: 'Delegated', value: 'delegated', icon: 'share-2' },
];

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isOnline, cachedTasks, saveCachedTasks } = useOffline();
  const params = useLocalSearchParams<{ initialFilter?: string }>();
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>(null);
  const isManager = user?.role === 'owner' || user?.role === 'deputy';

  useEffect(() => {
    if (params.initialFilter) {
      const f = params.initialFilter as FilterValue;
      if (['open', 'completed', 'approved', 'reopened', 'delegated'].includes(f as string)) {
        setSelectedFilter(f);
      }
    }
  }, [params.initialFilter]);

  const isDelegatedFilter = selectedFilter === 'delegated';

  const { data: tasks, isLoading, refetch, isError } = useListTasks(
    isDelegatedFilter
      ? ({ delegated: true } as any)
      : (selectedFilter && selectedFilter !== 'delegated' ? { status: selectedFilter as Status } : {}),
    { query: { enabled: isOnline } }
  );

  const pendingReassignments = isManager && isOnline
    ? (tasks?.filter((t: any) => t.reassignStatus === 'pending') ?? [])
    : [];

  useEffect(() => {
    if (tasks && tasks.length > 0 && !selectedFilter) {
      saveCachedTasks(tasks as any[]);
    }
  }, [tasks, selectedFilter]);

  const displayTasks = isOnline ? tasks : (cachedTasks ?? []);
  const showingCached = !isOnline && !!cachedTasks;

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

  const filtersToShow = isManager ? MANAGER_FILTERS : FILTERS;

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
          data={filtersToShow}
          keyExtractor={item => String(item.value ?? 'all')}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                { borderColor: colors.border, backgroundColor: colors.card },
                selectedFilter === item.value && { backgroundColor: item.value === 'delegated' ? '#8B5CF6' : colors.primary, borderColor: item.value === 'delegated' ? '#8B5CF6' : colors.primary },
              ]}
              onPress={() => setSelectedFilter(item.value)}
            >
              {item.icon && (
                <Feather
                  name={item.icon as any}
                  size={11}
                  color={selectedFilter === item.value ? '#fff' : colors.mutedForeground}
                  style={{ marginRight: 4 }}
                />
              )}
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

      {isDelegatedFilter && isOnline && (
        <View style={[styles.delegatedBanner, { backgroundColor: '#8B5CF610', borderColor: '#8B5CF6' }]}>
          <Feather name="share-2" size={13} color="#8B5CF6" />
          <Text style={[styles.delegatedBannerText, { color: '#6D28D9' }]}>
            Tasks you have delegated to other groups
          </Text>
        </View>
      )}

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
            <View>
              <TaskCard task={item} onPress={() => router.push(`/task/${item.id}` as any)} />
              {isDelegatedFilter && item.delegatedTasks && item.delegatedTasks.length > 0 && (
                <View style={[styles.delegatedPreview, { borderColor: colors.border }]}>
                  {item.delegatedTasks.slice(0, 2).map((dt: any) => (
                    <TouchableOpacity
                      key={dt.id}
                      style={[styles.delegatedPreviewRow, { borderTopColor: colors.border }]}
                      onPress={() => router.push(`/task/${dt.id}` as any)}
                    >
                      <Feather name="corner-down-right" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.delegatedPreviewText, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {dt.title}
                      </Text>
                      <View style={[styles.delegatedPreviewBadge, { backgroundColor: '#8B5CF620' }]}>
                        <Text style={{ fontSize: 9, color: '#8B5CF6', fontWeight: '600' as const }}>{dt.status}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {item.delegatedTasks.length > 2 && (
                    <Text style={[styles.delegatedMoreText, { color: colors.mutedForeground }]}>
                      +{item.delegatedTasks.length - 2} more delegated
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather
                name={isOnline ? (isDelegatedFilter ? 'share-2' : 'inbox') : 'wifi-off'}
                size={36}
                color={colors.mutedForeground}
              />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {isOnline ? (isDelegatedFilter ? 'No delegated tasks' : 'No tasks') : 'Offline'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {isOnline
                  ? isDelegatedFilter
                    ? "You haven't delegated any tasks to other groups yet."
                    : (selectedFilter ? `No ${selectedFilter} tasks found` : 'No tasks assigned yet')
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
    flexDirection: 'row', alignItems: 'center',
  },
  filterText: { fontSize: 13, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  delegatedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 2,
    borderRadius: 10, borderWidth: 1, padding: 10,
  },
  delegatedBannerText: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 0 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 20 },
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
  delegatedPreview: {
    marginHorizontal: 4, marginTop: -4, marginBottom: 12,
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  delegatedPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1,
  },
  delegatedPreviewText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular' },
  delegatedPreviewBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20,
  },
  delegatedMoreText: {
    fontSize: 10, fontFamily: 'Inter_400Regular',
    paddingHorizontal: 12, paddingVertical: 6,
  },
});
