import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Platform, Modal, FlatList,
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
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#3B82F6', bg: '#3B82F620' },
  completed: { label: 'Completed', color: '#22C55E', bg: '#22C55E20' },
  approved: { label: 'Approved', color: '#8B5CF6', bg: '#8B5CF620' },
  reopened: { label: 'Reopened', color: '#F59E0B', bg: '#F59E0B20' },
};

function DelegatedTaskRow({ dt, colors }: { dt: any; colors: any }) {
  const sc = STATUS_CONFIG[dt.status] ?? STATUS_CONFIG.open;
  return (
    <TouchableOpacity
      style={[styles.delegatedRow, { borderColor: colors.border, backgroundColor: colors.card }]}
      onPress={() => router.push(`/task/${dt.id}` as any)}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.delegatedTitle, { color: colors.foreground }]} numberOfLines={1}>
          {dt.title}
        </Text>
        {dt.assignees && dt.assignees.length > 0 && (
          <Text style={[styles.delegatedAssignees, { color: colors.mutedForeground }]} numberOfLines={1}>
            {dt.assignees.map((a: any) => a.fullName).join(', ')}
          </Text>
        )}
      </View>
      <View style={[styles.delegatedStatusPill, { backgroundColor: sc.bg }]}>
        <Text style={[styles.delegatedStatusText, { color: sc.color }]}>{sc.label}</Text>
      </View>
      <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function EditTaskModal({
  task,
  visible,
  onClose,
  colors,
}: {
  task: any;
  visible: boolean;
  onClose: () => void;
  colors: any;
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
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Task</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            {error ? (
              <View style={[editStyles.errorBanner, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}>
                <Feather name="alert-circle" size={13} color="#EF4444" />
                <Text style={editStyles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={editStyles.field}>
              <Text style={[editStyles.label, { color: colors.foreground }]}>Title *</Text>
              <TextInput
                style={[editStyles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                placeholder="Task title"
                placeholderTextColor={colors.mutedForeground}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View style={editStyles.field}>
              <Text style={[editStyles.label, { color: colors.foreground }]}>Description</Text>
              <TextInput
                style={[editStyles.textarea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                placeholder="Task description"
                placeholderTextColor={colors.mutedForeground}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={editStyles.field}>
              <Text style={[editStyles.label, { color: colors.foreground }]}>Deadline * <Text style={{ color: colors.mutedForeground, fontWeight: '400' as const }}>(YYYY-MM-DD)</Text></Text>
              <TextInput
                style={[editStyles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                value={deadline}
                onChangeText={setDeadline}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={editStyles.field}>
              <Text style={[editStyles.label, { color: colors.foreground }]}>
                Assignees *{assigneeIds.length > 0 ? ` (${assigneeIds.length} selected)` : ''}
              </Text>
              <View style={[editStyles.assigneeList, { borderColor: colors.border }]}>
                {activeUsers.length === 0 ? (
                  <Text style={[{ padding: 14, fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>No active members</Text>
                ) : activeUsers.map((u: any) => {
                  const isSelected = assigneeIds.includes(u.id);
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[editStyles.assigneeRow, { borderBottomColor: colors.border }, isSelected && { backgroundColor: colors.primary + '12' }]}
                      onPress={() => toggleAssignee(u.id)}
                    >
                      <View style={[editStyles.avatar, { backgroundColor: isSelected ? colors.primary : colors.primary + '20' }]}>
                        {isSelected
                          ? <Feather name="check" size={13} color="#fff" />
                          : <Text style={[editStyles.avatarText, { color: colors.primary }]}>{u.fullName?.charAt(0)?.toUpperCase()}</Text>
                        }
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[editStyles.assigneeName, { color: colors.foreground }]}>{u.fullName}</Text>
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
            <TouchableOpacity
              style={[styles.delegateBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Feather name="save" size={16} color="#fff" />
                    <Text style={styles.delegateBtnText}>Save Changes</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const editStyles = StyleSheet.create({
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

function DelegateModal({
  taskId,
  visible,
  onClose,
  colors,
}: {
  taskId: number;
  visible: boolean;
  onClose: () => void;
  colors: any;
}) {
  const { groups } = useAuth();
  const { user, activeGroupId } = useAuth();
  const domain = API_DOMAIN;
  const delegateMutation = useDelegateTask();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<'group' | 'assignees'>('group');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [delegating, setDelegating] = useState(false);

  const managerGroups = groups.filter(
    g => (g.role === 'owner' || g.role === 'deputy') && g.id !== activeGroupId
  );

  async function loadGroupMembers(groupId: number) {
    setLoadingMembers(true);
    setSelectedAssignees([]);
    try {
      const token = getCurrentToken();
      const res = await fetch(`https://${domain}/api/users?groupId=${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGroupMembers(data.filter((u: any) => u.isActive));
      }
    } catch {
      setGroupMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }

  function handleSelectGroup(gid: number) {
    setSelectedGroupId(gid);
    loadGroupMembers(gid);
    setStep('assignees');
  }

  function toggleAssignee(uid: number) {
    setSelectedAssignees(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  }

  async function handleDelegate() {
    if (!selectedGroupId || selectedAssignees.length === 0) return;
    setDelegating(true);
    try {
      await delegateMutation.mutateAsync({
        id: taskId,
        data: { targetGroupId: selectedGroupId, assigneeIds: selectedAssignees },
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['getTask'] });
      onClose();
      Alert.alert('Success', 'Task delegated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to delegate task');
    } finally {
      setDelegating(false);
    }
  }

  function handleClose() {
    setStep('group');
    setSelectedGroupId(null);
    setGroupMembers([]);
    setSelectedAssignees([]);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {step === 'assignees' && (
                <TouchableOpacity onPress={() => setStep('group')}>
                  <Feather name="arrow-left" size={18} color={colors.foreground} />
                </TouchableOpacity>
              )}
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {step === 'group' ? 'Select Target Group' : 'Select Assignees'}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
            {step === 'group'
              ? 'Choose a group you manage to delegate this task to.'
              : 'Pick one or more members to assign the delegated task.'}
          </Text>

          {step === 'group' ? (
            <FlatList
              data={managerGroups}
              keyExtractor={item => String(item.id)}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={
                <Text style={[styles.noMessages, { color: colors.mutedForeground }]}>
                  You are not a manager in any other group.
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.userRow, { borderBottomColor: colors.border }]}
                  onPress={() => handleSelectGroup(item.id)}
                >
                  <View style={[styles.userAvatar, { backgroundColor: '#8B5CF620' }]}>
                    <Feather name="users" size={16} color="#8B5CF6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userName, { color: colors.foreground }]}>{item.name}</Text>
                    <Text style={[styles.userRole, { color: colors.mutedForeground }]}>{item.role}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            />
          ) : loadingMembers ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 30 }} />
          ) : (
            <FlatList
              data={groupMembers}
              keyExtractor={item => String(item.id)}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={
                <Text style={[styles.noMessages, { color: colors.mutedForeground }]}>
                  No active members in this group.
                </Text>
              }
              renderItem={({ item }) => {
                const selected = selectedAssignees.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.userRow, { borderBottomColor: colors.border }]}
                    onPress={() => toggleAssignee(item.id)}
                  >
                    <View style={[styles.userAvatar, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.userAvatarText, { color: colors.primary }]}>
                        {item.fullName?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: colors.foreground }]}>{item.fullName}</Text>
                      <Text style={[styles.userRole, { color: colors.mutedForeground }]}>{item.role}</Text>
                    </View>
                    {selected ? (
                      <Feather name="check-circle" size={18} color={colors.primary} />
                    ) : (
                      <Feather name="circle" size={18} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {step === 'assignees' && selectedAssignees.length > 0 && (
            <View style={{ padding: 16, paddingTop: 8 }}>
              <TouchableOpacity
                style={[styles.delegateBtn, { backgroundColor: '#8B5CF6' }, delegating && { opacity: 0.6 }]}
                onPress={handleDelegate}
                disabled={delegating}
              >
                {delegating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="share-2" size={16} color="#fff" />
                    <Text style={styles.delegateBtnText}>
                      Delegate to {selectedAssignees.length} member{selectedAssignees.length > 1 ? 's' : ''}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

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
  const { data: messages, refetch: refetchMessages } = useListMessages(taskId);
  const { data: users } = useListUsers();
  const { mutateAsync: complete } = useCompleteTask();
  const { mutateAsync: approve } = useApproveTask();
  const { mutateAsync: reopen } = useReopenTask();
  const { mutate: sendMsg } = useSendMessage();

  const domain = API_DOMAIN;

  const isManager = user?.role === 'owner' || user?.role === 'deputy';
  const taskAssignees = (task as any)?.assignees as Array<{ id: number; fullName: string }> | undefined;
  const isAssignee = task?.assigneeId === user?.id ||
    (taskAssignees && taskAssignees.some((a: any) => a.id === user?.id));
  const status = task?.status;
  const reassignStatus = (task as any)?.reassignStatus;
  const reassignTo = (task as any)?.reassignTo;
  const parentTaskId = (task as any)?.parentTaskId as number | null | undefined;
  const delegatedTasks = (task as any)?.delegatedTasks as any[] | undefined;
  const isChildTask = !!parentTaskId;
  const canDelegate = isManager && !isChildTask;

  const canRequestReassign =
    isAssignee &&
    (status === 'open' || status === 'reopened') &&
    reassignStatus !== 'pending';

  const otherUsers = (users ?? []).filter(
    (u: any) => u.id !== task?.assigneeId && u.id !== user?.id
  );

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

  async function handleSendMessage() {
    if (!message.trim()) return;
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
  }

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Task not found</Text>
      </View>
    );
  }

  const sc = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.open;

  const delegatedDone = delegatedTasks
    ? delegatedTasks.filter((d: any) => d.status === 'approved' || d.status === 'completed').length
    : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, {
        paddingTop: Platform.OS === 'web' ? 67 : insets.top + 10,
        backgroundColor: colors.background,
        borderBottomColor: colors.border,
      }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {isChildTask && (
            <View style={[styles.statusPill, { backgroundColor: '#8B5CF620' }]}>
              <Text style={[styles.statusText, { color: '#8B5CF6' }]}>Delegated</Text>
            </View>
          )}
          <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
          </View>
          {isManager && (
            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => setShowEditModal(true)}
            >
              <Feather name="edit-2" size={18} color={colors.foreground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAwareScrollViewCompat style={{ flex: 1 }} bottomOffset={80}>
        <View style={styles.content}>
          <Text style={[styles.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>{task.description}</Text>

          <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {taskAssignees && taskAssignees.length > 0 ? (
              <View style={styles.metaRow}>
                <Feather name="users" size={14} color={colors.mutedForeground} />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>
                  {taskAssignees.length > 1 ? 'Assignees' : 'Assignee'}
                </Text>
                <View style={{ flex: 1, gap: 4 }}>
                  {taskAssignees.map((a: any) => (
                    <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700' as const, color: colors.primary }}>
                          {a.fullName?.charAt(0)?.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.metaValue, { color: colors.foreground }]}>{a.fullName}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : task.assignee ? (
              <View style={styles.metaRow}>
                <Feather name="user" size={14} color={colors.mutedForeground} />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Assignee</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>{task.assignee.fullName}</Text>
              </View>
            ) : null}

            {task.creator ? (
              <View style={styles.metaRow}>
                <Feather name="user-check" size={14} color={colors.mutedForeground} />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Created by</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>{task.creator.fullName}</Text>
              </View>
            ) : null}

            <View style={styles.metaRow}>
              <Feather name="calendar" size={14} color={colors.mutedForeground} />
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Deadline</Text>
              <Text style={[styles.metaValue, { color: colors.foreground }]}>
                {new Date(task.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>

            {isChildTask && (
              <View style={styles.metaRow}>
                <Feather name="arrow-up-right" size={14} color="#8B5CF6" />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Parent</Text>
                <TouchableOpacity onPress={() => router.push(`/task/${parentTaskId}` as any)}>
                  <Text style={[styles.metaValue, { color: '#8B5CF6' }]}>View parent task →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {reassignStatus === 'pending' && reassignTo ? (
            <View style={[styles.reassignBanner, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }]}>
              <Feather name="refresh-cw" size={14} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.reassignBannerTitle, { color: '#F59E0B' }]}>Reassignment Requested</Text>
                <Text style={[styles.reassignBannerSub, { color: colors.mutedForeground }]}>
                  Pending approval → {reassignTo.fullName}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            {(isAssignee || isManager) && status === 'open' ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                onPress={() => handleAction('complete')}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Mark Complete</Text>
              </TouchableOpacity>
            ) : null}
            {isManager && status === 'completed' ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleAction('approve')}
              >
                <Feather name="check-circle" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Approve</Text>
              </TouchableOpacity>
            ) : null}
            {isManager && (status === 'completed' || status === 'approved') ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#F59E0B' }]}
                onPress={() => handleAction('reopen')}
              >
                <Feather name="refresh-cw" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Reopen</Text>
              </TouchableOpacity>
            ) : null}

            {canRequestReassign ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#6366F1' }]}
                onPress={() => setShowReassignModal(true)}
              >
                <Feather name="user-x" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Request Reassign</Text>
              </TouchableOpacity>
            ) : null}

            {isManager && reassignStatus === 'pending' && reassignTo ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                  onPress={() => handleReassignAction('approve')}
                >
                  <Feather name="user-check" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Approve Reassign</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                  onPress={() => handleReassignAction('reject')}
                >
                  <Feather name="x" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Reject Reassign</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {canDelegate ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]}
                onPress={() => setShowDelegateModal(true)}
              >
                <Feather name="share-2" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Delegate</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {delegatedTasks && delegatedTasks.length > 0 && (
            <View style={[styles.delegatedSection, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.delegatedHeader}>
                <Feather name="share-2" size={14} color="#8B5CF6" />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Delegated Tasks ({delegatedTasks.length})
                </Text>
              </View>
              {delegatedTasks.map((dt: any) => (
                <DelegatedTaskRow key={dt.id} dt={dt} colors={colors} />
              ))}
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${(delegatedDone / delegatedTasks.length) * 100}%` as any },
                    ]}
                  />
                </View>
                <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
                  {delegatedDone}/{delegatedTasks.length} complete
                </Text>
              </View>
            </View>
          )}

          <View style={styles.messagesSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Messages {messages?.length ? `(${messages.length})` : ''}
            </Text>
            {(messages ?? []).map(msg => (
              <View key={msg.id} style={[styles.messageBubble, {
                backgroundColor: msg.senderId === user?.id ? colors.primary + '15' : colors.card,
                borderColor: colors.border,
                alignSelf: msg.senderId === user?.id ? 'flex-end' : 'flex-start',
              }]}>
                {msg.senderId !== user?.id && msg.sender ? (
                  <Text style={[styles.senderName, { color: colors.primary }]}>{msg.sender.fullName}</Text>
                ) : null}
                <Text style={[styles.messageText, { color: colors.foreground }]}>{msg.content}</Text>
                <Text style={[styles.messageTime, { color: colors.mutedForeground }]}>
                  {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))}
            {(!messages || messages.length === 0) ? (
              <Text style={[styles.noMessages, { color: colors.mutedForeground }]}>No messages yet</Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TextInput
            style={[styles.messageInput, { color: colors.foreground }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.mutedForeground}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary }, (!message.trim() || sendingMsg) && { opacity: 0.5 }]}
            onPress={handleSendMessage}
            disabled={!message.trim() || sendingMsg}
          >
            <Feather name="send" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollViewCompat>

      <Modal visible={showReassignModal} transparent animationType="slide" onRequestClose={() => setShowReassignModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Request Reassignment</Text>
              <TouchableOpacity onPress={() => setShowReassignModal(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
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
                  <TouchableOpacity
                    style={[styles.userRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleRequestReassign(item.id)}
                  >
                    <View style={[styles.userAvatar, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.userAvatarText, { color: colors.primary }]}>
                        {item.fullName?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: colors.foreground }]}>{item.fullName}</Text>
                      <Text style={[styles.userRole, { color: colors.mutedForeground }]}>{item.role}</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={[styles.noMessages, { color: colors.mutedForeground }]}>No other team members</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      <EditTaskModal
        task={task}
        visible={showEditModal}
        onClose={() => { setShowEditModal(false); refetch(); }}
        colors={colors}
      />
      <DelegateModal
        taskId={taskId}
        visible={showDelegateModal}
        onClose={() => setShowDelegateModal(false)}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  statusPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  content: { padding: 20, paddingBottom: 100 },
  taskTitle: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', lineHeight: 28, marginBottom: 10 },
  description: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22, marginBottom: 16 },
  metaCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10, marginBottom: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', width: 80 },
  metaValue: { fontSize: 13, fontWeight: '500' as const, fontFamily: 'Inter_500Medium', flex: 1 },
  reassignBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16,
  },
  reassignBannerTitle: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  reassignBannerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  delegatedSection: {
    borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 20, gap: 8,
  },
  delegatedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  delegatedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 8, borderWidth: 1, padding: 10,
  },
  delegatedTitle: { fontSize: 13, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  delegatedAssignees: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  delegatedStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  delegatedStatusText: { fontSize: 10, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  progressContainer: { marginTop: 8, gap: 6 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#22C55E', borderRadius: 3 },
  progressText: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right' },
  messagesSection: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  messageBubble: {
    maxWidth: '80%', borderRadius: 12, borderWidth: 1,
    padding: 12, marginBottom: 6,
  },
  senderName: { fontSize: 11, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  messageText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  messageTime: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4, alignSelf: 'flex-end' },
  noMessages: { textAlign: 'center', fontSize: 13, fontFamily: 'Inter_400Regular', paddingVertical: 20 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 12, borderTopWidth: 1,
  },
  messageInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', maxHeight: 100, minHeight: 40 },
  sendBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderBottomWidth: 0,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  modalSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', paddingHorizontal: 20, paddingVertical: 12, lineHeight: 20 },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  userAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  userName: { fontSize: 15, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  userRole: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2, textTransform: 'capitalize' },
  delegateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12,
  },
  delegateBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});
