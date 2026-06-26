import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, TextInput, ScrollView, Modal,
} from 'react-native';
import { DatePickerButton } from '@/components/DatePickerButton';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

const ACTION_LABELS: Record<string, string> = {
  user_created: 'User Created',
  user_login: 'Login',
  user_password_changed: 'Password Changed',
  user_deactivated: 'User Deactivated',
  group_created: 'Group Created',
  member_joined: 'Member Joined',
  member_approved: 'Member Approved',
  member_removed: 'Member Removed',
  role_changed: 'Role Changed',
  task_created: 'Task Created',
  task_assigned: 'Task Assigned',
  task_delegated: 'Task Delegated',
  task_completed: 'Task Completed',
  task_approved: 'Task Approved',
  task_reopened: 'Task Reopened',
  task_reassign_requested: 'Reassign Requested',
  task_reassign_rejected: 'Reassign Rejected',
};

const ACTION_COLORS: Record<string, string> = {
  user_created: '#22C55E',
  user_login: '#4F6EF7',
  user_password_changed: '#F59E0B',
  user_deactivated: '#EF4444',
  group_created: '#8B5CF6',
  member_joined: '#22C55E',
  member_approved: '#22C55E',
  member_removed: '#EF4444',
  role_changed: '#F97316',
  task_created: '#6366F1',
  task_assigned: '#4F6EF7',
  task_delegated: '#8B5CF6',
  task_completed: '#22C55E',
  task_approved: '#22C55E',
  task_reopened: '#F59E0B',
  task_reassign_requested: '#F97316',
  task_reassign_rejected: '#EF4444',
};

function describeEntry(entry: any): string {
  const actor = entry.actorName
    ? `${entry.actorName} (#${entry.actorId})`
    : entry.actorId
    ? `User #${entry.actorId}`
    : 'System';
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case 'user_created': return `${actor} created user "${meta.fullName ?? ''}" (${meta.role ?? ''})`;
    case 'user_login': return `${actor} logged in`;
    case 'user_password_changed': return `${actor} changed password${meta.method === 'forgot_password' ? ' (forgot)' : ''}`;
    case 'user_deactivated': return `${actor} ${meta.isActive ? 'activated' : 'deactivated'} User #${entry.targetId}`;
    case 'group_created': return `${actor} created group "${meta.groupName ?? ''}" (#${entry.targetId})`;
    case 'member_joined': return `${actor} joined "${meta.groupName ?? ''}"${meta.pendingApproval ? ' (pending)' : ''}`;
    case 'member_approved': return `${actor} approved User #${entry.targetId}`;
    case 'member_removed': return `${actor} removed User #${entry.targetId}`;
    case 'role_changed': return `${actor} set User #${entry.targetId} role to "${meta.newRole ?? ''}"`;
    case 'task_created': return `${actor} created "${meta.title ?? `Task #${entry.targetId}`}"`;
    case 'task_assigned': return `${actor} assigned Task #${entry.targetId}${meta.assigneeId ? ` to User #${meta.assigneeId}` : ''}`;
    case 'task_delegated': return `${actor} delegated "${meta.title ?? `Task #${entry.targetId}`}" to Group #${meta.targetGroupId}`;
    case 'task_completed': return `${actor} completed "${meta.title ?? `Task #${entry.targetId}`}"`;
    case 'task_approved': return `${actor} approved "${meta.title ?? `Task #${entry.targetId}`}"`;
    case 'task_reopened': return `${actor} reopened "${meta.title ?? `Task #${entry.targetId}`}"`;
    case 'task_deleted': return `${actor} deleted Task #${entry.targetId}`;
    default: return `${actor} — ${entry.action}`;
  }
}

const ALL_ACTION_KEYS = Object.keys(ACTION_LABELS);

type Filters = {
  startDate: string;
  endDate: string;
  action: string;
  actorId: string;
};

const EMPTY: Filters = { startDate: '', endDate: '', action: '', actorId: '' };

export default function AuditLogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filterOpen, setFilterOpen] = useState(false);

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

  const params = new URLSearchParams({ page: String(page), limit: '30' });
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate + 'T23:59:59');
  if (filters.action) params.set('action', filters.action);
  if (filters.actorId) params.set('actorId', filters.actorId);

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => customFetch<any[]>('/api/users'),
    enabled: !!user && (user.role === 'owner' || user.role === 'deputy'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, filters],
    queryFn: () => customFetch<{
      data: any[];
      total: number;
      page: number;
      pages: number;
    }>(`/api/audit-logs?${params.toString()}`),
    enabled: !!user && (user.role === 'owner' || user.role === 'deputy'),
  });

  if (!user || (user.role !== 'owner' && user.role !== 'deputy')) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPadding, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Audit Log</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Feather name="lock" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Access restricted to managers</Text>
        </View>
      </View>
    );
  }

  const hasFilters = filters.startDate || filters.endDate || filters.action || filters.actorId;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Audit Log</Text>
        <TouchableOpacity
          onPress={() => { setDraft({ ...filters }); setFilterOpen(true); }}
          style={[styles.filterBtn, { borderColor: hasFilters ? colors.primary : colors.border, backgroundColor: hasFilters ? colors.primary + '15' : 'transparent' }]}
        >
          <Feather name="filter" size={15} color={hasFilters ? colors.primary : colors.mutedForeground} />
          {hasFilters && <View style={[styles.filterDot, { backgroundColor: colors.primary }]} />}
        </TouchableOpacity>
      </View>

      {/* Count bar */}
      {data && (
        <View style={[styles.countBar, { borderBottomColor: colors.border }]}>
          <Text style={[styles.countText, { color: colors.mutedForeground }]}>
            {data.total.toLocaleString()} {data.total === 1 ? 'entry' : 'entries'}{hasFilters ? ' (filtered)' : ''}
          </Text>
          {hasFilters && (
            <TouchableOpacity onPress={() => { setFilters(EMPTY); setPage(1); }}>
              <Text style={[styles.clearText, { color: colors.primary }]}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* List */}
      {isLoading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !data || data.data.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="shield" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No audit entries found</Text>
        </View>
      ) : (
        <FlatList
          data={data.data}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          renderItem={({ item }) => {
            const color = ACTION_COLORS[item.action] ?? '#64748B';
            return (
              <View style={[styles.entry, { borderBottomColor: colors.border }]}>
                {/* Badge + actor row */}
                <View style={styles.entryHeader}>
                  <View style={[styles.badge, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.badgeText, { color }]}>
                      {ACTION_LABELS[item.action] ?? item.action}
                    </Text>
                  </View>
                  {item.actorName ? (
                    <Text style={[styles.actorText, { color: colors.foreground }]}>
                      {item.actorName}{' '}
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>(#{item.actorId})</Text>
                    </Text>
                  ) : item.actorId ? (
                    <Text style={[styles.actorText, { color: colors.mutedForeground }]}>User #{item.actorId}</Text>
                  ) : null}
                </View>
                {/* Description */}
                <Text style={[styles.desc, { color: colors.foreground }]} numberOfLines={3}>
                  {describeEntry(item)}
                </Text>
                {/* Target + timestamp row */}
                <View style={styles.metaRow}>
                  {item.targetType && item.targetId && (
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                      {item.targetType} #{item.targetId}
                      {item.groupId ? ` · Group #${item.groupId}` : ''}
                      {'  '}
                    </Text>
                  )}
                  <Feather name="clock" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    {' '}{new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <View style={[styles.pagination, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity
            style={[styles.pageBtn, { borderColor: colors.border, opacity: page <= 1 ? 0.4 : 1 }]}
            onPress={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <Feather name="chevron-left" size={16} color={colors.foreground} />
            <Text style={[styles.pageBtnText, { color: colors.foreground }]}>Prev</Text>
          </TouchableOpacity>
          <Text style={[styles.pageInfo, { color: colors.mutedForeground }]}>{page} / {data.pages}</Text>
          <TouchableOpacity
            style={[styles.pageBtn, { borderColor: colors.border, opacity: page >= data.pages ? 0.4 : 1 }]}
            onPress={() => setPage(p => Math.min(data.pages, p + 1))}
            disabled={page >= data.pages}
          >
            <Text style={[styles.pageBtnText, { color: colors.foreground }]}>Next</Text>
            <Feather name="chevron-right" size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      )}

      {/* Filter modal */}
      <Modal visible={filterOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFilterOpen(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Filter Audit Log</Text>
            <TouchableOpacity onPress={() => setFilterOpen(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>FROM DATE</Text>
            <DatePickerButton
              value={draft.startDate}
              onChange={v => setDraft(d => ({ ...d, startDate: v }))}
              placeholder="All time"
              style={styles.datePickerSpacing}
            />

            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>TO DATE</Text>
            <DatePickerButton
              value={draft.endDate}
              onChange={v => setDraft(d => ({ ...d, endDate: v }))}
              placeholder="All time"
              minimumDate={draft.startDate ? new Date(draft.startDate + 'T00:00:00') : undefined}
              style={styles.datePickerSpacing}
            />

            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>ACTION TYPE</Text>
            <TouchableOpacity
              style={[styles.filterInput, { backgroundColor: colors.card, borderColor: colors.border, justifyContent: 'center' }]}
              onPress={() => setDraft(d => ({ ...d, action: '' }))}
            >
              <Text style={[styles.filterInputText, { color: draft.action ? colors.foreground : colors.mutedForeground }]}>
                {draft.action ? (ACTION_LABELS[draft.action] ?? draft.action) : 'All actions (tap to clear)'}
              </Text>
            </TouchableOpacity>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={styles.chipRow}>
                {ALL_ACTION_KEYS.map(a => (
                  <TouchableOpacity
                    key={a}
                    onPress={() => setDraft(d => ({ ...d, action: d.action === a ? '' : a }))}
                    style={[styles.chip, { backgroundColor: draft.action === a ? colors.primary : colors.card, borderColor: draft.action === a ? colors.primary : colors.border }]}
                  >
                    <Text style={[styles.chipText, { color: draft.action === a ? '#fff' : colors.foreground }]}>
                      {ACTION_LABELS[a]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>ACTOR / USER</Text>
            <TouchableOpacity
              style={[styles.filterInput, { backgroundColor: colors.card, borderColor: colors.border, justifyContent: 'center' }]}
              onPress={() => setDraft(d => ({ ...d, actorId: '' }))}
            >
              <Text style={[styles.filterInputText, { color: draft.actorId ? colors.foreground : colors.mutedForeground }]}>
                {draft.actorId
                  ? (usersData?.find(u => String(u.id) === draft.actorId)?.fullName ?? `User #${draft.actorId}`) + ' (tap to clear)'
                  : 'All users (tap to clear)'}
              </Text>
            </TouchableOpacity>
            {usersData && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                <View style={styles.chipRow}>
                  {usersData.map(u => (
                    <TouchableOpacity
                      key={u.id}
                      onPress={() => setDraft(d => ({ ...d, actorId: d.actorId === String(u.id) ? '' : String(u.id) }))}
                      style={[styles.chip, { backgroundColor: draft.actorId === String(u.id) ? colors.primary : colors.card, borderColor: draft.actorId === String(u.id) ? colors.primary : colors.border }]}
                    >
                      <Text style={[styles.chipText, { color: draft.actorId === String(u.id) ? '#fff' : colors.foreground }]}>
                        {u.fullName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </ScrollView>

          <View style={[styles.modalFooter, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
            <TouchableOpacity
              style={[styles.footerBtn, { borderColor: colors.border }]}
              onPress={() => { setDraft(EMPTY); setFilters(EMPTY); setPage(1); setFilterOpen(false); }}
            >
              <Text style={[styles.footerBtnText, { color: colors.foreground }]}>Clear all</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, styles.applyBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setFilters({ ...draft }); setPage(1); setFilterOpen(false); }}
            >
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 20, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  filterBtn: {
    padding: 8, borderRadius: 8, borderWidth: 1, position: 'relative',
  },
  filterDot: {
    position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3,
  },
  countBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1,
  },
  countText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  clearText: { fontSize: 12, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  entry: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 5 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  actorText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', fontWeight: '600' as const },
  desc: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  metaText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  pagination: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1,
  },
  pageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
  },
  pageBtnText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  pageInfo: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, paddingTop: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  modalContent: { paddingHorizontal: 20, paddingTop: 16 },
  filterLabel: { fontSize: 11, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 6 },
  filterInput: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 12, minHeight: 44,
  },
  datePickerSpacing: { marginBottom: 12 },
  filterInputText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  chipRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  modalFooter: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  footerBtnText: { fontSize: 15, fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
  applyBtn: { borderWidth: 0 },
  applyBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', fontWeight: '600' as const, color: '#fff' },
});
