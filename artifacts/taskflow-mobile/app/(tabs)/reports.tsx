import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Modal, FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGetDailyReport, useGetEmployeeReport, useListUsers } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const today = new Date();
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open:      { bg: '#3B82F618', text: '#3B82F6' },
  completed: { bg: '#F59E0B18', text: '#F59E0B' },
  approved:  { bg: '#22C55E18', text: '#22C55E' },
  reopened:  { bg: '#F9731618', text: '#F97316' },
};

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <View style={miniBarStyles.track}>
      <View style={[miniBarStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const miniBarStyles = StyleSheet.create({
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isManager = user?.role === 'owner' || user?.role === 'deputy';

  const [tab, setTab] = useState<'daily' | 'employee'>('daily');
  const [dailyDate, setDailyDate] = useState(formatDate(today));
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(formatDate(addDays(today, -7)));
  const [endDate, setEndDate] = useState(formatDate(today));
  const [showUserPicker, setShowUserPicker] = useState(false);

  const { data: users } = useListUsers();
  const members = users?.filter(u => u.role === 'member') ?? [];
  const selectedMember = members.find(u => u.id === employeeId);

  const { data: dailyReport, isLoading: dailyLoading } = useGetDailyReport(
    { date: dailyDate },
    { query: { enabled: tab === 'daily' && !!dailyDate } }
  );
  const { data: employeeReport, isLoading: empLoading } = useGetEmployeeReport(
    { employeeId: employeeId!, startDate, endDate },
    { query: { enabled: tab === 'employee' && !!employeeId && !!startDate && !!endDate } }
  );

  const report = tab === 'daily' ? dailyReport : employeeReport;
  const isLoading = tab === 'daily' ? dailyLoading : empLoading;

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;
  const statMax = report ? Math.max(report.total, 1) : 1;

  if (!isManager) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPadding, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Reports</Text>
        </View>
        <View style={styles.empty}>
          <Feather name="lock" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Managers only</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Only owners and deputies can view reports.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Reports</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Tab Toggle */}
        <View style={[styles.tabRow, { backgroundColor: colors.muted, borderRadius: 12 }]}>
          {(['daily', 'employee'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && { backgroundColor: colors.card }]}
              onPress={() => setTab(t)}
            >
              <Feather
                name={t === 'daily' ? 'calendar' : 'user'}
                size={14}
                color={tab === t ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.tabBtnText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
                {t === 'daily' ? 'Daily' : 'Employee'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filters */}
        <View style={[styles.filterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {tab === 'daily' ? (
            <View>
              <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Date</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity
                  style={[styles.dateArrow, { backgroundColor: colors.muted }]}
                  onPress={() => setDailyDate(formatDate(addDays(new Date(dailyDate), -1)))}
                >
                  <Feather name="chevron-left" size={18} color={colors.foreground} />
                </TouchableOpacity>
                <View style={[styles.dateDisplay, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.dateText, { color: colors.foreground }]}>{dailyDate}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.dateArrow, { backgroundColor: colors.muted }]}
                  onPress={() => setDailyDate(formatDate(addDays(new Date(dailyDate), 1)))}
                  disabled={dailyDate >= formatDate(today)}
                >
                  <Feather name="chevron-right" size={18} color={dailyDate >= formatDate(today) ? colors.border : colors.foreground} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.empFilters}>
              <View>
                <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Employee</Text>
                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => setShowUserPicker(true)}
                >
                  <Text style={[styles.pickerBtnText, { color: selectedMember ? colors.foreground : colors.mutedForeground }]}>
                    {selectedMember ? selectedMember.fullName : 'Select member…'}
                  </Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <View style={styles.dateRangeRow}>
                <View style={styles.dateRangeField}>
                  <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>From</Text>
                  <View style={[styles.dateDisplay, { backgroundColor: colors.background, borderColor: colors.border, flex: 1 }]}>
                    <Text style={[styles.dateText, { color: colors.foreground }]}>{startDate}</Text>
                  </View>
                </View>
                <Feather name="arrow-right" size={14} color={colors.mutedForeground} style={{ marginTop: 20 }} />
                <View style={styles.dateRangeField}>
                  <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>To</Text>
                  <View style={[styles.dateDisplay, { backgroundColor: colors.background, borderColor: colors.border, flex: 1 }]}>
                    <Text style={[styles.dateText, { color: colors.foreground }]}>{endDate}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.presetRow}>
                {[
                  { label: '7d', days: 7 }, { label: '14d', days: 14 },
                  { label: '30d', days: 30 }, { label: '90d', days: 90 },
                ].map(p => (
                  <TouchableOpacity
                    key={p.label}
                    style={[styles.preset, { backgroundColor: colors.muted, borderColor: colors.border }]}
                    onPress={() => {
                      setEndDate(formatDate(today));
                      setStartDate(formatDate(addDays(today, -p.days)));
                    }}
                  >
                    <Text style={[styles.presetText, { color: colors.mutedForeground }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Report Results */}
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : !report ? (
          <View style={styles.empty}>
            <Feather name="file-text" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No data</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {tab === 'employee' && !employeeId ? 'Select an employee to view their report.' : 'No tasks found for this period.'}
            </Text>
          </View>
        ) : (
          <View>
            {/* Summary Cards */}
            <View style={styles.statsRow}>
              {[
                { label: 'Total', value: report.total, color: '#4F6EF7' },
                { label: 'Completed', value: (report.completed ?? 0) + (report.approved ?? 0), color: '#22C55E' },
                { label: 'Approved', value: report.approved ?? 0, color: '#3B82F6' },
                { label: 'Overdue', value: report.overdue ?? 0, color: '#EF4444' },
              ].map(s => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
                  <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Bar Chart */}
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.chartTitle, { color: colors.foreground }]}>Summary</Text>
              <View style={styles.barChart}>
                {[
                  { label: 'Total', value: report.total, color: '#4F6EF7' },
                  { label: 'Done', value: (report.completed ?? 0) + (report.approved ?? 0), color: '#22C55E' },
                  { label: 'Approved', value: report.approved ?? 0, color: '#3B82F6' },
                  { label: 'Overdue', value: report.overdue ?? 0, color: '#EF4444' },
                ].map(b => (
                  <View key={b.label} style={styles.barRow}>
                    <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>{b.label}</Text>
                    <MiniBar value={b.value} max={statMax} color={b.color} />
                    <Text style={[styles.barVal, { color: colors.foreground }]}>{b.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Task List */}
            {report.tasks && report.tasks.length > 0 && (
              <View style={[styles.taskListCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.chartTitle, { color: colors.foreground }]}>
                  Tasks ({report.tasks.length})
                </Text>
                {report.tasks.map((task: any) => {
                  const s = STATUS_COLORS[task.status] ?? STATUS_COLORS.open;
                  return (
                    <View key={task.id} style={[styles.taskItem, { borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={1}>{task.title}</Text>
                        {task.assigneeName && (
                          <Text style={[styles.taskAssignee, { color: colors.mutedForeground }]}>
                            {task.assigneeName}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                        <Text style={[styles.statusText, { color: s.text }]}>{task.status}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Employee Picker Modal */}
      <Modal visible={showUserPicker} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerContent, { backgroundColor: colors.background }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Select Employee</Text>
              <TouchableOpacity onPress={() => setShowUserPicker(false)}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={members}
              keyExtractor={u => String(u.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border },
                    item.id === employeeId && { backgroundColor: colors.primary + '10' }
                  ]}
                  onPress={() => { setEmployeeId(item.id); setShowUserPicker(false); }}
                >
                  <View style={[styles.pickerAvatar, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.pickerAvatarText, { color: colors.primary }]}>
                      {item.fullName.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerName, { color: colors.foreground }]}>{item.fullName}</Text>
                    <Text style={[styles.pickerMobile, { color: colors.mutedForeground }]}>{item.mobile}</Text>
                  </View>
                  {item.id === employeeId && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
    flexDirection: 'row', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  content: { padding: 16, gap: 14 },
  tabRow: { flexDirection: 'row', padding: 4 },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 10,
  },
  tabBtnText: { fontSize: 13, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  filterCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  filterLabel: { fontSize: 11, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 6, letterSpacing: 0.3 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateArrow: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dateDisplay: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  dateText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  empFilters: { gap: 12 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  pickerBtnText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  dateRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateRangeField: { flex: 1 },
  presetRow: { flexDirection: 'row', gap: 8 },
  preset: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  presetText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  loadingCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  statLbl: { fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  chartCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  chartTitle: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 12 },
  barChart: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 52, fontSize: 12, fontFamily: 'Inter_400Regular' },
  barVal: { width: 24, fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'right' },
  taskListCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  taskItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1 },
  taskTitle: { fontSize: 13, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  taskAssignee: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '500' as const, fontFamily: 'Inter_500Medium', textTransform: 'capitalize' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  pickerTitle: { fontSize: 17, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1 },
  pickerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pickerAvatarText: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  pickerName: { fontSize: 14, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  pickerMobile: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
