import React, { useState } from 'react';
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
  const [selectedFilter, setSelectedFilter] = useState<Status | null>(null);
  const isManager = user?.role === 'owner' || user?.role === 'deputy';

  const { data: tasks, isLoading, refetch } = useListTasks(
    selectedFilter ? { status: selectedFilter } : {}
  );

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Tasks</Text>
        {isManager ? (
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/task/create' as any)}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
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

      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={tasks ?? []}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 },
          ]}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <TaskCard task={item as any} onPress={() => router.push(`/task/${item.id}` as any)} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="inbox" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No tasks</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {selectedFilter ? `No ${selectedFilter} tasks found` : 'No tasks assigned yet'}
              </Text>
            </View>
          }
          scrollEnabled={!!(tasks && tasks.length > 0)}
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
});
