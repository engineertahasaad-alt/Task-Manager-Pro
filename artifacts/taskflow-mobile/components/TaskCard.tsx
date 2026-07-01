import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface AssigneeUser {
  id: number;
  fullName: string;
}

interface Task {
  id: number;
  title: string;
  description: string;
  status: 'open' | 'completed' | 'approved' | 'reopened';
  deadline: string;
  priority?: string;
  assignee?: AssigneeUser | null;
  assignees?: AssigneeUser[] | null;
  creator?: { id: number; fullName: string } | null;
  messageCount?: number;
}

interface TaskCardProps {
  task: Task;
  onPress: () => void;
}

const STATUS_CONFIG = {
  open:      { label: 'Open',      icon: 'circle' as const,      color: '#3B82F6' },
  completed: { label: 'Completed', icon: 'check-circle' as const, color: '#22C55E' },
  approved:  { label: 'Approved',  icon: 'check-circle' as const, color: '#8B5CF6' },
  reopened:  { label: 'Reopened',  icon: 'refresh-cw' as const,   color: '#F59E0B' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:      { label: 'Low',      color: '#64748B' },
  medium:   { label: 'Medium',   color: '#D97706' },
  high:     { label: 'High',     color: '#EA580C' },
  critical: { label: 'Critical', color: '#EF4444' },
};

function formatDeadline(deadline: string) {
  const date = new Date(deadline);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, overdue: true };
  if (diffDays === 0) return { text: 'Due today', overdue: false };
  if (diffDays === 1) return { text: 'Due tomorrow', overdue: false };
  return {
    text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overdue: false,
  };
}

function AssigneeAvatarStack({ assignees, assignee, colors }: {
  assignees?: AssigneeUser[] | null;
  assignee?: AssigneeUser | null;
  colors: any;
}) {
  const list = (assignees && assignees.length > 0) ? assignees : (assignee ? [assignee] : []);
  if (list.length === 0) return null;

  const shown = list.slice(0, 3);
  const extra = list.length - shown.length;

  return (
    <View style={styles.assigneeStack}>
      <View style={styles.avatarRow}>
        {shown.map((u, i) => (
          <View
            key={u.id}
            style={[
              styles.avatar,
              { backgroundColor: colors.primary + '20', marginLeft: i > 0 ? -6 : 0, zIndex: shown.length - i },
            ]}
          >
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {u.fullName.charAt(0).toUpperCase()}
            </Text>
          </View>
        ))}
        {extra > 0 && (
          <View style={[styles.avatar, { backgroundColor: '#64748B20', marginLeft: -6, zIndex: 0 }]}>
            <Text style={[styles.avatarText, { color: '#64748B' }]}>+{extra}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.assigneeName, { color: colors.mutedForeground }]} numberOfLines={1}>
        {shown.map(u => u.fullName.split(' ')[0]).join(', ')}{extra > 0 ? ` +${extra}` : ''}
      </Text>
    </View>
  );
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = useColors();
  const statusConfig = STATUS_CONFIG[task.status];
  const deadline = formatDeadline(task.deadline);
  const priorityCfg = PRIORITY_CONFIG[task.priority ?? 'medium'] ?? PRIORITY_CONFIG.medium;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '18' }]}>
          <Feather name={statusConfig.icon} size={11} color={statusConfig.color} />
          <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
        </View>

        <View style={[styles.priorityBadge, { backgroundColor: priorityCfg.color + '18' }]}>
          <Text style={[styles.priorityText, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
        </View>

        <View style={[styles.deadlineBadge, {
          backgroundColor: deadline.overdue ? '#EF4444' + '18' : colors.muted,
        }]}>
          <Feather
            name="clock"
            size={11}
            color={deadline.overdue ? '#EF4444' : colors.mutedForeground}
          />
          <Text style={[styles.deadlineText, {
            color: deadline.overdue ? '#EF4444' : colors.mutedForeground,
          }]}>
            {deadline.text}
          </Text>
        </View>
      </View>

      <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
        {task.title}
      </Text>

      {task.description ? (
        <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
          {task.description}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <AssigneeAvatarStack assignees={task.assignees} assignee={task.assignee} colors={colors} />

        {task.messageCount != null && task.messageCount > 0 ? (
          <View style={styles.messageCount}>
            <Feather name="message-square" size={13} color={colors.mutedForeground} />
            <Text style={[styles.messageCountText, { color: colors.mutedForeground }]}>
              {task.messageCount}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  deadlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  deadlineText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  title: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 20,
    marginBottom: 5,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
    marginBottom: 10,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  assigneeStack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
  },
  avatarText: {
    fontSize: 9,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  assigneeName: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  messageCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  messageCountText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
