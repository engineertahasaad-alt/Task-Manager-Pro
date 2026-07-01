import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Platform, Modal, FlatList,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  useGetTask, useCompleteTask, useApproveTask, useReopenTask,
  useListMessages, useSendMessage, useListUsers, useDelegateTask,
  useUpdateTask,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { API_DOMAIN } from '@/lib/config';
import { useAuth, getCurrentToken } from '@/context/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open:      { label: 'Open',      color: '#3B82F6', bg: '#3B82F620' },
  completed: { label: 'Completed', color: '#22C55E', bg: '#22C55E20' },
  approved:  { label: 'Approved',  color: '#8B5CF6', bg: '#8B5CF620' },
  reopened:  { label: 'Reopened',  color: '#F59E0B', bg: '#F59E0B20' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:      { label: 'Low',      color: '#64748B' },
  medium:   { label: 'Medium',   color: '#D97706' },
  high:     { label: 'High',     color: '#EA580C' },
  critical: { label: 'Critical', color: '#EF4444' },
};

// ─── DelegatedTaskRow ─────────────────────────────────────────────────────────

function DelegatedTaskRow({ dt, colors }: { dt: any; colors: any }) {
  const sc = STATUS_CONFIG[dt.status] ?? STATUS_CONFIG.open;
  return (
    <TouchableOpacity
      style={[dStyles.delegatedRow, { borderColor: colors.border, backgroundColor: colors.card }]}
      onPress={() => router.push(`/task/${dt.id}` as any)}
    >
      <View style={{ flex: 1 }}>
        <Text style={[dStyles.delegatedTitle, { color: colors.foreground }]} numberOfLines={1}>
          {dt.title}
        </Text>
        {dt.assignees && dt.assignees.length > 0 && (
          <Text style={[dStyles.delegatedAssignees, { color: colors.mutedForeground }]} numberOfLines={1}>
            {dt.assignees.map((a: any) => a.fullName).join(', ')}
          </Text>
        )}
      </View>
      <View style={[dStyles.delegatedStatusPill, { backgroundColor: sc.bg }]}>
        <Text style={[dStyles.delegatedStatusText, { color: sc.color }]}>{sc.label}</Text>
      </View>
      <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── EditTaskModal ────────────────────────────────────────────────────────────

function EditTaskModal({ task, visible, onClose, colors }: {
  task: any; visible: boolean; onClose: () => void; colors: any;
}) {
  const queryClient = useQueryClient();
  const { data: users } = useListUsers();
  const { mutateAsync: updateTask } = useUpdateTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && task) {
      setTitle(task.title ?? '');
      setDescription(task.description ?? '');
      const d = task.deadline ? new Date(task.deadline) : null;
      setDeadline(d ? d.toISOString().slice(0, 10) : '');
      const ids = task.assignees?.map((a: any) => a.id) ?? (task.assigneeId ? [task.assigneeId] : []);
      setAssigneeIds(ids);
      setError('');
    }
  }, [visible, task]);

  function toggleAssignee(uid: number) {
    setAssigneeIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!deadline.trim()) { setError('Deadline is required'); return; }
    if (assigneeIds.length === 0) { setError('At least one assignee is required'); return; }
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) { setError('Invalid date. Use YYYY-MM-DD'); return; }
    setError('');
    setSaving(true);
    try {
      await updateTask({ id: task.id, data: { title: title.trim(), description: description.trim(), deadline: deadlineDate.toISOString(), assigneeIds } });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['getTask'] });
      queryClient.invalidateQueries({ queryKey: ['listTasks'] });
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to update task');
    } finally {
      setSaving(false);
    }
  }

  const activeUsers = (users ?? []).filter((u: any) => u.isActive);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mStyles.overlay}>
        <View style={[mStyles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[mStyles.header, { borderBottomColor: colors.border }]}>
            <Text style={[mStyles.title, { color: colors.foreground }]}>Edit Task</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            {error ? (
              <View style={[eStyles.errorBanner, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}>
                <Feather name="alert-circle" size={13} color="#EF4444" />
                <Text style={eStyles.errorText}>{error}</Text>
              </View>
            ) : null}
            <View style={eStyles.field}>
              <Text style={[eStyles.label, { color: colors.foreground }]}>Title *</Text>
              <TextInput style={[eStyles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} placeholder="Task title" placeholderTextColor={colors.mutedForeground} value={title} onChangeText={setTitle} />
            </View>
            <View style={eStyles.field}>
              <Text style={[eStyles.label, { color: colors.foreground }]}>Description</Text>
              <TextInput style={[eStyles.textarea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} placeholder="Task description" placeholderTextColor={colors.mutedForeground} value={description} onChangeText={setDescription} multiline numberOfLines={3} />
            </View>
            <View style={eStyles.field}>
              <Text style={[eStyles.label, { color: colors.foreground }]}>Deadline * <Text style={{ color: colors.mutedForeground, fontWeight: '400' as const }}>(YYYY-MM-DD)</Text></Text>
              <TextInput style={[eStyles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} value={deadline} onChangeText={setDeadline} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={eStyles.field}>
              <Text style={[eStyles.label, { color: colors.foreground }]}>Assignees *{assigneeIds.length > 0 ? ` (${assigneeIds.length} selected)` : ''}</Text>
              <View style={[eStyles.assigneeList, { borderColor: colors.border }]}>
                {activeUsers.length === 0
                  ? <Text style={{ padding: 14, fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>No active members</Text>
                  : activeUsers.map((u: any) => {
                      const isSelected = assigneeIds.includes(u.id);
                      return (
                        <TouchableOpacity key={u.id} style={[eStyles.assigneeRow, { borderBottomColor: colors.border }, isSelected && { backgroundColor: colors.primary + '12' }]} onPress={() => toggleAssignee(u.id)}>
                          <View style={[eStyles.avatar, { backgroundColor: isSelected ? colors.primary : colors.primary + '20' }]}>
                            {isSelected ? <Feather name="check" size={13} color="#fff" /> : <Text style={[eStyles.avatarText, { color: colors.primary }]}>{u.fullName?.charAt(0)?.toUpperCase()}</Text>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[eStyles.assigneeName, { color: colors.foreground }]}>{u.fullName}</Text>
                            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textTransform: 'capitalize' }}>{u.role}</Text>
                          </View>
                          {isSelected && <Text style={{ fontSize: 12, color: colors.primary, fontFamily: 'Inter_500Medium' }}>Selected</Text>}
                        </TouchableOpacity>
                      );
                    })}
              </View>
            </View>
          </ScrollView>

          <View style={{ padding: 16, paddingTop: 8 }}>
            <TouchableOpacity style={[mStyles.actionBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="save" size={16} color="#fff" /><Text style={mStyles.actionBtnText}>Save Changes</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── DelegateModal ────────────────────────────────────────────────────────────

function DelegateModal({ taskId, visible, onClose, colors }: {
  taskId: number; visible: boolean; onClose: () => void; colors: any;
}) {
  const { groups, user, activeGroupId } = useAuth();
  const domain = API_DOMAIN;
  const delegateMutation = useDelegateTask();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<'group' | 'assignees'>('group');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [delegating, setDelegating] = useState(false);

  const managerGroups = groups.filter(g => (g.role === 'owner' || g.role === 'deputy') && g.id !== activeGroupId);

  async function loadGroupMembers(groupId: number) {
    setLoadingMembers(true);
    setSelectedAssignees([]);
    try {
      const token = getCurrentToken();
      const res = await fetch(`https://${domain}/api/users?groupId=${groupId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setGroupMembers((await res.json()).filter((u: any) => u.isActive));
    } catch { setGroupMembers([]); }
    finally { setLoadingMembers(false); }
  }

  function handleSelectGroup(gid: number) { setSelectedGroupId(gid); loadGroupMembers(gid); setStep('assignees'); }
  function toggleAssignee(uid: number) { setSelectedAssignees(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]); }

  async function handleDelegate() {
    if (!selectedGroupId || selectedAssignees.length === 0) return;
    setDelegating(true);
    try {
      await delegateMutation.mutateAsync({ id: taskId, data: { targetGroupId: selectedGroupId, assigneeIds: selectedAssignees } });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['getTask'] });
      onClose();
      Alert.alert('Success', 'Task delegated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to delegate task');
    } finally { setDelegating(false); }
  }

  function handleClose() { setStep('group'); setSelectedGroupId(null); setGroupMembers([]); setSelectedAssignees([]); onClose(); }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={mStyles.overlay}>
        <View style={[mStyles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[mStyles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {step === 'assignees' && <TouchableOpacity onPress={() => setStep('group')}><Feather name="arrow-left" size={18} color={colors.foreground} /></TouchableOpacity>}
              <Text style={[mStyles.title, { color: colors.foreground }]}>{step === 'group' ? 'Select Target Group' : 'Select Assignees'}</Text>
            </View>
            <TouchableOpacity onPress={handleClose}><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity>
          </View>
          <Text style={[mStyles.subtitle, { color: colors.mutedForeground }]}>
            {step === 'group' ? 'Choose a group you manage to delegate this task to.' : 'Pick one or more members to assign the delegated task.'}
          </Text>

          {step === 'group' ? (
            <FlatList data={managerGroups} keyExtractor={item => String(item.id)} style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={[mStyles.empty, { color: colors.mutedForeground }]}>You are not a manager in any other group.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={[mStyles.userRow, { borderBottomColor: colors.border }]} onPress={() => handleSelectGroup(item.id)}>
                  <View style={[mStyles.userAvatar, { backgroundColor: '#8B5CF620' }]}><Feather name="users" size={16} color="#8B5CF6" /></View>
                  <View style={{ flex: 1 }}><Text style={[mStyles.userName, { color: colors.foreground }]}>{item.name}</Text><Text style={[mStyles.userRole, { color: colors.mutedForeground }]}>{item.role}</Text></View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            />
          ) : loadingMembers ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 30 }} />
          ) : (
            <FlatList data={groupMembers} keyExtractor={item => String(item.id)} style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={[mStyles.empty, { color: colors.mutedForeground }]}>No active members in this group.</Text>}
              renderItem={({ item }) => {
                const selected = selectedAssignees.includes(item.id);
                return (
                  <TouchableOpacity style={[mStyles.userRow, { borderBottomColor: colors.border }]} onPress={() => toggleAssignee(item.id)}>
                    <View style={[mStyles.userAvatar, { backgroundColor: colors.primary + '20' }]}><Text style={[mStyles.userAvatarText, { color: colors.primary }]}>{item.fullName?.charAt(0)?.toUpperCase() ?? '?'}</Text></View>
                    <View style={{ flex: 1 }}><Text style={[mStyles.userName, { color: colors.foreground }]}>{item.fullName}</Text><Text style={[mStyles.userRole, { color: colors.mutedForeground }]}>{item.role}</Text></View>
                    {selected ? <Feather name="check-circle" size={18} color={colors.primary} /> : <Feather name="circle" size={18} color={colors.mutedForeground} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {step === 'assignees' && selectedAssignees.length > 0 && (
            <View style={{ padding: 16, paddingTop: 8 }}>
              <TouchableOpacity style={[mStyles.actionBtn, { backgroundColor: '#8B5CF6' }, delegating && { opacity: 0.6 }]} onPress={handleDelegate} disabled={delegating}>
                {delegating ? <ActivityIndicator color="#fff" size="small" /> : <><Feather name="share-2" size={16} color="#fff" /><Text style={mStyles.actionBtnText}>Delegate to {selectedAssignees.length} member{selectedAssignees.length > 1 ? 's' : ''}</Text></>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine, colors }: { msg: any; isMine: boolean; colors: any }) {
  const time = new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[bubbleStyles.wrapper, isMine ? bubbleStyles.wrapperRight : bubbleStyles.wrapperLeft]}>
      {!isMine && msg.sender && (
        <Text style={[bubbleStyles.senderName, { color: colors.primary }]}>{msg.sender.fullName}</Text>
      )}
      <View style={[
        bubbleStyles.bubble,
        isMine
          ? [bubbleStyles.bubbleMine, { backgroundColor: colors.primary }]
          : [bubbleStyles.bubbleOther, { backgroundColor: colors.card, borderColor: colors.border }],
      ]}>
        <Text style={[bubbleStyles.text, { color: isMine ? '#fff' : colors.foreground }]}>
          {msg.content}
        </Text>
        <Text style={[bubbleStyles.time, { color: isMine ? 'rgba(255,255,255,0.65)' : colors.mutedForeground }]}>
          {time}
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TaskDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [message, setMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [reassignLoading, setReassignLoading] = useState(false);

  const taskId = Number(id);
  const { data: task, isLoading, refetch } = useGetTask(taskId);
  const { data: messages, refetch: refetchMessages } = useListMessages(taskId, {
    query: { refetchInterval: 3000 } as any,
  });
  const { data: users } = useListUsers();
  const { mutateAsync: complete } = useCompleteTask();
  const { mutateAsync: approve } = useApproveTask();
  const { mutateAsync: reopen } = useReopenTask();
  const { mutate: sendMsg } = useSendMessage();
  const domain = API_DOMAIN;

  const isManager = user?.role === 'owner' || user?.role === 'deputy';
  const taskAssignees = (task as any)?.assignees as Array<{ id: number; fullName: string }> | undefined;
  const isAssignee = task?.assigneeId === user?.id || (taskAssignees && taskAssignees.some((a: any) => a.id === user?.id));
  const status = task?.status;
  const reassignStatus = (task as any)?.reassignStatus;
  const reassignTo = (task as any)?.reassignTo;
  const parentTaskId = (task as any)?.parentTaskId as number | null | undefined;
  const delegatedTasks = (task as any)?.delegatedTasks as any[] | undefined;
  const isChildTask = !!parentTaskId;
  const canDelegate = isManager && !isChildTask;
  const priority = (task as any)?.priority ?? 'medium';
  const priorityCfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;

  const canRequestReassign = isAssignee && (status === 'open' || status === 'reopened') && reassignStatus !== 'pending';
  const currentAssigneeIds = new Set<number>([...(taskAssignees?.map((a: any) => a.id) ?? []), ...(task?.assigneeId ? [task.assigneeId] : [])]);
  const otherUsers = (users ?? []).filter((u: any) => !currentAssigneeIds.has(u.id) && u.id !== user?.id);

  // Reversed messages for inverted FlatList (newest at bottom = top of inverted list)
  const reversedMessages = [...(messages ?? [])].reverse();

  async function handleAction(action: 'complete' | 'approve' | 'reopen') {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (action === 'complete') await complete({ id: taskId });
      else if (action === 'approve') await approve({ id: taskId });
      else await reopen({ id: taskId });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['listTasks'] });
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'Action failed');
    }
  }

  async function handleRequestReassign(newAssigneeId: number) {
    setReassignLoading(true);
    try {
      const token = getCurrentToken();
      const res = await fetch(`https://${domain}/api/tasks/${taskId}/reassign-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestedAssigneeId: newAssigneeId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Request failed');
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowReassignModal(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['listTasks'] });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to request reassignment');
    } finally {
      setReassignLoading(false);
    }
  }

  async function handleReassignAction(action: 'approve' | 'reject') {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const token = getCurrentToken();
      const endpoint = action === 'approve' ? 'reassign-approve' : 'reassign-reject';
      const res = await fetch(`https://${domain}/api/tasks/${taskId}/${endpoint}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Action failed');
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['listTasks'] });
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'Action failed');
    }
  }

  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || sendingMsg) return;
    const content = message.trim();
    setMessage('');
    setSendingMsg(true);
    sendMsg(
      { id: taskId, data: { content } },
      {
        onSuccess: () => { refetchMessages(); setSendingMsg(false); },
        onError: () => { setSendingMsg(false); },
      }
    );
  }, [message, sendingMsg, taskId, sendMsg, refetchMessages]);

  // ── Loading / not found ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[s.fill, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (!task) {
    return (
      <View style={[s.fill, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.mutedForeground }}>Task not found</Text>
      </View>
    );
  }

  const sc = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.open;
  const delegatedDone = delegatedTasks ? delegatedTasks.filter((d: any) => d.status === 'approved' || d.status === 'completed').length : 0;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[s.fill, { backgroundColor: colors.background }]}>

      {/* ── Fixed Nav Bar ─────────────────────────────────────────────────── */}
      <View style={[s.navBar, {
        paddingTop: topPad + 10,
        backgroundColor: colors.background,
        borderBottomColor: colors.border,
      }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={s.navBack}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <View style={s.navCenter}>
          <Text style={[s.navTitle, { color: colors.foreground }]} numberOfLines={1}>{task.title}</Text>
        </View>

        <View style={s.navRight}>
          {isChildTask && (
            <View style={[s.pill, { backgroundColor: '#8B5CF620' }]}>
              <Text style={[s.pillText, { color: '#8B5CF6' }]}>Delegated</Text>
            </View>
          )}
          <View style={[s.pill, { backgroundColor: sc.bg }]}>
            <Text style={[s.pillText, { color: sc.color }]}>{sc.label}</Text>
          </View>
          {isManager && (
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setShowEditModal(true)}>
              <Feather name="edit-2" size={18} color={colors.foreground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Fixed Task Header ──────────────────────────────────────────────── */}
      {/* Internally scrollable so long content doesn't push chat off-screen */}
      <View style={[s.taskHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.taskHeaderContent}
        >
          {/* Title + description */}
          <Text style={[s.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
          {task.description ? (
            <Text style={[s.taskDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{task.description}</Text>
          ) : null}

          {/* Badges row */}
          <View style={s.badgeRow}>
            <View style={[s.pill, { backgroundColor: sc.bg }]}>
              <Text style={[s.pillText, { color: sc.color }]}>{sc.label}</Text>
            </View>
            <View style={[s.pill, { backgroundColor: priorityCfg.color + '18' }]}>
              <Text style={[s.pillText, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
            </View>
          </View>

          {/* Meta rows */}
          <View style={[s.metaGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Assignees */}
            {taskAssignees && taskAssignees.length > 0 ? (
              <View style={s.metaRow}>
                <Feather name="users" size={13} color={colors.mutedForeground} />
                <Text style={[s.metaLabel, { color: colors.mutedForeground }]}>{taskAssignees.length > 1 ? 'Assignees' : 'Assignee'}</Text>
                <Text style={[s.metaValue, { color: colors.foreground }]} numberOfLines={1}>
                  {taskAssignees.map((a: any) => a.fullName).join(', ')}
                </Text>
              </View>
            ) : task.assignee ? (
              <View style={s.metaRow}>
                <Feather name="user" size={13} color={colors.mutedForeground} />
                <Text style={[s.metaLabel, { color: colors.mutedForeground }]}>Assignee</Text>
                <Text style={[s.metaValue, { color: colors.foreground }]}>{task.assignee.fullName}</Text>
              </View>
            ) : null}

            {/* Creator */}
            {task.creator ? (
              <View style={s.metaRow}>
                <Feather name="user-check" size={13} color={colors.mutedForeground} />
                <Text style={[s.metaLabel, { color: colors.mutedForeground }]}>Created by</Text>
                <Text style={[s.metaValue, { color: colors.foreground }]}>{task.creator.fullName}</Text>
              </View>
            ) : null}

            {/* Deadline */}
            <View style={s.metaRow}>
              <Feather name="calendar" size={13} color={colors.mutedForeground} />
              <Text style={[s.metaLabel, { color: colors.mutedForeground }]}>Deadline</Text>
              <Text style={[s.metaValue, { color: colors.foreground }]}>
                {new Date(task.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>

            {/* Parent task */}
            {isChildTask && (
              <View style={s.metaRow}>
                <Feather name="arrow-up-right" size={13} color="#8B5CF6" />
                <Text style={[s.metaLabel, { color: colors.mutedForeground }]}>Parent</Text>
                <TouchableOpacity onPress={() => router.push(`/task/${parentTaskId}` as any)}>
                  <Text style={[s.metaValue, { color: '#8B5CF6' }]}>View parent →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Reassign pending banner */}
          {reassignStatus === 'pending' && reassignTo ? (
            <View style={[s.reassignBanner, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }]}>
              <Feather name="refresh-cw" size={13} color="#F59E0B" />
              <Text style={[s.reassignBannerText, { color: '#F59E0B' }]}>Reassign pending → {reassignTo.fullName}</Text>
            </View>
          ) : null}

          {/* Action buttons */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actionsRow}>
            {(isAssignee || isManager) && status === 'open' ? (
              <TouchableOpacity style={[s.actionChip, { backgroundColor: '#22C55E' }]} onPress={() => handleAction('complete')}>
                <Feather name="check" size={13} color="#fff" />
                <Text style={s.actionChipText}>Complete</Text>
              </TouchableOpacity>
            ) : null}
            {isManager && status === 'completed' ? (
              <TouchableOpacity style={[s.actionChip, { backgroundColor: colors.primary }]} onPress={() => handleAction('approve')}>
                <Feather name="check-circle" size={13} color="#fff" />
                <Text style={s.actionChipText}>Approve</Text>
              </TouchableOpacity>
            ) : null}
            {isManager && (status === 'completed' || status === 'approved') ? (
              <TouchableOpacity style={[s.actionChip, { backgroundColor: '#F59E0B' }]} onPress={() => handleAction('reopen')}>
                <Feather name="refresh-cw" size={13} color="#fff" />
                <Text style={s.actionChipText}>Reopen</Text>
              </TouchableOpacity>
            ) : null}
            {canRequestReassign ? (
              <TouchableOpacity style={[s.actionChip, { backgroundColor: '#6366F1' }]} onPress={() => setShowReassignModal(true)}>
                <Feather name="user-x" size={13} color="#fff" />
                <Text style={s.actionChipText}>Request Reassign</Text>
              </TouchableOpacity>
            ) : null}
            {isManager && reassignStatus === 'pending' && reassignTo ? (
              <>
                <TouchableOpacity style={[s.actionChip, { backgroundColor: '#22C55E' }]} onPress={() => handleReassignAction('approve')}>
                  <Feather name="user-check" size={13} color="#fff" />
                  <Text style={s.actionChipText}>Approve Reassign</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionChip, { backgroundColor: '#EF4444' }]} onPress={() => handleReassignAction('reject')}>
                  <Feather name="x" size={13} color="#fff" />
                  <Text style={s.actionChipText}>Reject Reassign</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {canDelegate ? (
              <TouchableOpacity style={[s.actionChip, { backgroundColor: '#8B5CF6' }]} onPress={() => setShowDelegateModal(true)}>
                <Feather name="share-2" size={13} color="#fff" />
                <Text style={s.actionChipText}>Delegate</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          {/* Delegated sub-tasks */}
          {delegatedTasks && delegatedTasks.length > 0 && (
            <View style={[s.delegatedSection, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Feather name="share-2" size={13} color="#8B5CF6" />
                <Text style={[s.sectionLabel, { color: colors.foreground }]}>Delegated ({delegatedDone}/{delegatedTasks.length} done)</Text>
              </View>
              {delegatedTasks.map((dt: any) => <DelegatedTaskRow key={dt.id} dt={dt} colors={colors} />)}
              <View style={{ marginTop: 8, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${(delegatedDone / delegatedTasks.length) * 100}%` as any, backgroundColor: '#22C55E', borderRadius: 3 }} />
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      {/* ── Chat Area (messages + composer) ──────────────────────────────────
           KeyboardAvoidingView lives BELOW the fixed header so the offset
           calculation is just 0 – the view naturally shrinks when the
           keyboard opens, keeping the input bar anchored to it.             */}
      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages – inverted FlatList so newest is always at bottom */}
        <FlatList
          style={s.fill}
          contentContainerStyle={s.messagesList}
          data={reversedMessages}
          inverted
          keyExtractor={(item: any) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: any }) => (
            <MessageBubble msg={item} isMine={item.senderId === user?.id} colors={colors} />
          )}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Feather name="message-circle" size={32} color={colors.mutedForeground} />
              <Text style={[s.emptyChatText, { color: colors.mutedForeground }]}>No messages yet</Text>
              <Text style={[s.emptyChatSub, { color: colors.mutedForeground }]}>Send the first message below</Text>
            </View>
          }
        />

        {/* ── Input Bar ──────────────────────────────────────────────────── */}
        <View style={[s.inputBar, {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
        }]}>
          <View style={[s.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[s.input, { color: colors.foreground }]}
              placeholder="Type a message…"
              placeholderTextColor={colors.mutedForeground}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: colors.primary }, (!message.trim() || sendingMsg) && s.sendBtnDisabled]}
            onPress={handleSendMessage}
            disabled={!message.trim() || sendingMsg}
            activeOpacity={0.8}
          >
            {sendingMsg
              ? <ActivityIndicator color="#fff" size="small" />
              : <Feather name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <Modal visible={showReassignModal} transparent animationType="slide" onRequestClose={() => setShowReassignModal(false)}>
        <View style={mStyles.overlay}>
          <View style={[mStyles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[mStyles.header, { borderBottomColor: colors.border }]}>
              <Text style={[mStyles.title, { color: colors.foreground }]}>Request Reassignment</Text>
              <TouchableOpacity onPress={() => setShowReassignModal(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[mStyles.subtitle, { color: colors.mutedForeground }]}>
              Select a team member to reassign this task to. A manager must approve the request.
            </Text>
            {reassignLoading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 30 }} />
            ) : (
              <FlatList
                data={otherUsers}
                keyExtractor={(item: any) => String(item.id)}
                style={{ maxHeight: 320 }}
                renderItem={({ item }: { item: any }) => (
                  <TouchableOpacity style={[mStyles.userRow, { borderBottomColor: colors.border }]} onPress={() => handleRequestReassign(item.id)}>
                    <View style={[mStyles.userAvatar, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[mStyles.userAvatarText, { color: colors.primary }]}>{item.fullName?.charAt(0)?.toUpperCase() ?? '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[mStyles.userName, { color: colors.foreground }]}>{item.fullName}</Text>
                      <Text style={[mStyles.userRole, { color: colors.mutedForeground }]}>{item.role}</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={[mStyles.empty, { color: colors.mutedForeground }]}>No other team members</Text>}
              />
            )}
          </View>
        </View>
      </Modal>

      <EditTaskModal task={task} visible={showEditModal} onClose={() => { setShowEditModal(false); refetch(); }} colors={colors} />
      <DelegateModal taskId={taskId} visible={showDelegateModal} onClose={() => setShowDelegateModal(false)} colors={colors} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  fill: { flex: 1 },

  // Nav bar
  navBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  navBack: { marginRight: 10, padding: 2 },
  navCenter: { flex: 1, marginRight: 8 },
  navTitle: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },

  // Badges / pills
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillText: { fontSize: 12, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },

  // Task info header – fixed, bounded by maxHeight, internally scrollable
  taskHeader: {
    maxHeight: 300,
    borderBottomWidth: 1,
  },
  taskHeaderContent: {
    padding: 14,
    gap: 10,
  },
  taskTitle: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', lineHeight: 24 },
  taskDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  // Meta grid
  metaGrid: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', width: 72 },
  metaValue: { fontSize: 12, fontWeight: '500' as const, fontFamily: 'Inter_500Medium', flex: 1 },

  // Reassign banner
  reassignBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, borderWidth: 1, padding: 10 },
  reassignBannerText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },

  // Action chips (horizontal scroll)
  actionsRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  actionChipText: { color: '#fff', fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },

  // Delegated section inside header
  delegatedSection: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 6 },
  sectionLabel: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },

  // Messages list
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  // Empty chat state (appears at bottom of inverted list = top visually)
  emptyChat: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyChatText: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  emptyChatSub: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 120,
  },
  input: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: { opacity: 0.4 },
});

// ─── Message Bubble Styles ────────────────────────────────────────────────────

const bubbleStyles = StyleSheet.create({
  wrapper: { marginVertical: 3, maxWidth: '75%' },
  wrapperRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  wrapperLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  senderName: { fontSize: 11, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther: { borderWidth: 1, borderBottomLeftRadius: 4 },
  text: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  time: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3, alignSelf: 'flex-end' },
});

// ─── Modal Shared Styles ──────────────────────────────────────────────────────

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', paddingHorizontal: 20, paddingVertical: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  userAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 15, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  userName: { fontSize: 15, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  userRole: { fontSize: 12, fontFamily: 'Inter_400Regular', textTransform: 'capitalize', marginTop: 1 },
  empty: { textAlign: 'center', padding: 30, fontSize: 14, fontFamily: 'Inter_400Regular' },
});

// ─── Edit Modal Styles ────────────────────────────────────────────────────────

const eStyles = StyleSheet.create({
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorText: { color: '#EF4444', fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, fontFamily: 'Inter_400Regular' },
  textarea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 80, fontSize: 15, fontFamily: 'Inter_400Regular', textAlignVertical: 'top' },
  assigneeList: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  assigneeName: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
});

// ─── Delegated Row Styles ─────────────────────────────────────────────────────

const dStyles = StyleSheet.create({
  delegatedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, borderWidth: 1, padding: 10 },
  delegatedTitle: { fontSize: 12, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  delegatedAssignees: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  delegatedStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  delegatedStatusText: { fontSize: 10, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});
