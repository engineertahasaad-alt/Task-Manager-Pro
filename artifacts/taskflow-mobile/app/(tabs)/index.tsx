import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGetMyTasks, useGetDashboardSummary, useGetWorkloadByEmployee } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { TaskCard } from '@/components/TaskCard';
import { GroupBadge } from '@/components/GroupBadge';

type StatusFilter = 'open' | 'completed' | 'approved' | 'reopened' | null;

function StatCard({
  label, value, color, icon, filter,
}: { label: string; value: number; color: string; icon: string; filter: StatusFilter }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => {
        if (filter) {
          router.push({ pathname: '/(tabs)/tasks', params: { initialFilter: filter } } as any);
        } else {
          router.push('/(tabs)/tasks' as any);
        }
      }}
      activeOpacity={0.75}
    >
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SimpleBarChart({ data }: { data: { label: string; open: number; completed: number }[] }) {
  const colors = useColors();
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.open + d.completed), 1);
  return (
    <View>
      {data.map((d) => {
        const totalWidth = Math.round(((d.open + d.completed) / maxVal) * 100);
        const completedPct = d.open + d.completed > 0
          ? Math.round((d.completed / (d.open + d.completed)) * 100)
          : 0;
        return (
          <View key={d.label} style={styles.barRow}>
            <Text style={[styles.barLabel, { color: colors.foreground }]} numberOfLines={1}>
              {d.label.split(' ')[0]}
            </Text>
            <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
              <View style={[styles.barFill, { width: `${totalWidth}%` as any }]}>
                <View style={[styles.barCompleted, { width: `${completedPct}%` as any, backgroundColor: '#22C55E' }]} />
                <View style={[styles.barOpen, { width: `${100 - completedPct}%` as any, backgroundColor: '#4F6EF7' }]} />
              </View>
            </View>
            <Text style={[styles.barCount, { color: colors.mutedForeground }]}>
              {d.open + d.completed}
            </Text>
          </View>
        );
      })}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4F6EF7' }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Open</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Done</Text>
        </View>
      </View>
    </View>
  );
}

function ProgressRing({ pct, color, size = 60 }: { pct: number; color: string; size?: number }) {
  const colors = useColors();
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: size / 10,
        borderColor: color + '30',
        alignItems: 'center', justifyContent: 'center',
        position: 'absolute',
      }} />
      <View style={{
        width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35,
        backgroundColor: color + '18',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: size * 0.22, fontWeight: '700' as const, color }}>{pct}%</Text>
      </View>
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
  const { data: workload, refetch: refetchWorkload } = useGetWorkloadByEmployee(
    {},
    { query: { enabled: isManager } }
  );

  const isLoading = isManager ? summaryLoading : myTasksLoading;

  function handleRefresh() {
    if (isManager) { refetchSummary(); refetchWorkload(); }
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
          <GroupBadge />
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
          <ManagerDashboard summary={summary} workload={workload ?? []} />
        ) : (
          <MemberDashboard myTasks={myTasks} isLoading={isLoading} />
        )}
      </ScrollView>
    </View>
  );
}

function ManagerDashboard({ summary, workload }: { summary: any; workload: any[] }) {
  const colors = useColors();
  if (!summary) return (
    <View style={styles.loadingCenter}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );

  const completedPct = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;
  const openPct = summary.total > 0 ? Math.round((summary.open / summary.total) * 100) : 0;

  const barData = workload.slice(0, 6).map((w: any) => ({
    label: w.fullName,
    open: w.open,
    completed: w.completed + w.approved,
  }));

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Overview</Text>
      <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Tap a card to view filtered tasks</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Total" value={summary.total} color="#4F6EF7" icon="list" filter={null} />
        <StatCard label="Open" value={summary.open} color="#3B82F6" icon="circle" filter="open" />
        <StatCard label="Completed" value={summary.completed} color="#22C55E" icon="check-circle" filter="completed" />
        <StatCard label="Overdue" value={summary.overdue} color="#EF4444" icon="alert-circle" filter="open" />
      </View>

      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Task Progress</Text>
        <View style={styles.progressRow}>
          <ProgressRing pct={completedPct} color="#22C55E" size={72} />
          <View style={styles.progressStats}>
            <View style={styles.progressStat}>
              <View style={[styles.progressDot, { backgroundColor: '#22C55E' }]} />
              <Text style={[styles.progressStatLabel, { color: colors.mutedForeground }]}>Completed</Text>
              <Text style={[styles.progressStatVal, { color: colors.foreground }]}>{summary.completed}</Text>
            </View>
            <View style={styles.progressStat}>
              <View style={[styles.progressDot, { backgroundColor: '#4F6EF7' }]} />
              <Text style={[styles.progressStatLabel, { color: colors.mutedForeground }]}>Open</Text>
              <Text style={[styles.progressStatVal, { color: colors.foreground }]}>{summary.open}</Text>
            </View>
            <View style={styles.progressStat}>
              <View style={[styles.progressDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.progressStatLabel, { color: colors.mutedForeground }]}>Overdue</Text>
              <Text style={[styles.progressStatVal, { color: colors.foreground }]}>{summary.overdue}</Text>
            </View>
          </View>
        </View>
      </View>

      {barData.length > 0 && (
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>Team Workload</Text>
          <Text style={[styles.chartSubtitle, { color: colors.mutedForeground }]}>Tasks per member</Text>
          <SimpleBarChart data={barData} />
        </View>
      )}
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
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, minWidth: '43%', borderRadius: 12, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 6,
  },
  statIcon: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 26, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  sectionTitle: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  sectionHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 10, marginTop: 2 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  chartCard: {
    borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14,
  },
  chartTitle: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  chartSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 14 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12 },
  progressStats: { flex: 1, gap: 10 },
  progressStat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressDot: { width: 8, height: 8, borderRadius: 4 },
  progressStatLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  progressStatVal: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { width: 60, fontSize: 12, fontFamily: 'Inter_400Regular' },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', flexDirection: 'row', borderRadius: 5, overflow: 'hidden' },
  barCompleted: { height: '100%' },
  barOpen: { height: '100%' },
  barCount: { width: 24, fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'right' },
  legend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
