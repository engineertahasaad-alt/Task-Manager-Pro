import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGetMyTasks, useGetDashboardSummary } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { TaskCard } from '@/components/TaskCard';

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const isManager = user?.role === 'owner' || user?.role === 'deputy';

  const { data: myTasks, isLoading: myTasksLoading, refetch: refetchMyTasks } = useGetMyTasks(
    { query: { enabled: !isManager } }
  );
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useGetDashboardSummary(
    {},
    { query: { enabled: isManager } }
  );

  const isLoading = isManager ? summaryLoading : myTasksLoading;

  function handleRefresh() {
    if (isManager) refetchSummary();
    else refetchMyTasks();
  }

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            Good {getGreeting()}
          </Text>
          <Text style={[styles.userName, { color: colors.foreground }]}>
            {user?.fullName?.split(' ')[0] ?? 'There'}
          </Text>
        </View>
        <View style={[styles.roleBadge, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[styles.roleText, { color: colors.primary }]}>{user?.role}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {isManager ? (
          <ManagerDashboard summary={summary} />
        ) : (
          <MemberDashboard myTasks={myTasks} isLoading={isLoading} />
        )}
      </ScrollView>
    </View>
  );
}

function ManagerDashboard({ summary }: { summary: any }) {
  const colors = useColors();
  if (!summary) return (
    <View style={styles.loadingCenter}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Overview</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Total" value={summary.total} color="#4F6EF7" icon="list" />
        <StatCard label="Open" value={summary.open} color="#3B82F6" icon="circle" />
        <StatCard label="Completed" value={summary.completed} color="#22C55E" icon="check-circle" />
        <StatCard label="Overdue" value={summary.overdue} color="#EF4444" icon="alert-circle" />
      </View>
    </View>
  );
}

function MemberDashboard({ myTasks, isLoading }: { myTasks: any; isLoading: boolean }) {
  const colors = useColors();

  if (isLoading) return (
    <View style={styles.loadingCenter}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );

  const sections = [
    { key: 'overdue', title: 'Overdue', tasks: myTasks?.overdue ?? [], color: '#EF4444' },
    { key: 'today', title: "Today's Tasks", tasks: myTasks?.today ?? [], color: '#4F6EF7' },
    { key: 'upcoming', title: 'Upcoming', tasks: myTasks?.upcoming ?? [], color: '#22C55E' },
  ];

  return (
    <View>
      {sections.map(section => (
        section.tasks.length > 0 ? (
          <View key={section.key} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
              <View style={[styles.countBadge, { backgroundColor: section.color + '20' }]}>
                <Text style={[styles.countText, { color: section.color }]}>{section.tasks.length}</Text>
              </View>
            </View>
            {section.tasks.map((task: any) => (
              <TaskCard key={task.id} task={task} onPress={() => router.push(`/task/${task.id}` as any)} />
            ))}
          </View>
        ) : null
      ))}
      {(myTasks?.today?.length === 0 && myTasks?.overdue?.length === 0 && myTasks?.upcoming?.length === 0) ? (
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All caught up!</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No tasks assigned to you right now.</Text>
        </View>
      ) : null}
    </View>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1,
  },
  greeting: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  userName: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  roleText: { fontSize: 12, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
  content: { padding: 16 },
  loadingCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1, minWidth: '43%', borderRadius: 12, borderWidth: 1,
    padding: 16, alignItems: 'center', gap: 6,
  },
  statIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 28, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
