import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  useGetTask, useCompleteTask, useApproveTask, useReopenTask,
  useListMessages, useSendMessage,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#3B82F6', bg: '#3B82F620' },
  completed: { label: 'Completed', color: '#22C55E', bg: '#22C55E20' },
  approved: { label: 'Approved', color: '#8B5CF6', bg: '#8B5CF620' },
  reopened: { label: 'Reopened', color: '#F59E0B', bg: '#F59E0B20' },
};

export default function TaskDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  const taskId = Number(id);
  const { data: task, isLoading, refetch } = useGetTask({ id: taskId });
  const { data: messages, refetch: refetchMessages } = useListMessages({ id: taskId });
  const { mutateAsync: complete } = useCompleteTask();
  const { mutateAsync: approve } = useApproveTask();
  const { mutateAsync: reopen } = useReopenTask();
  const { mutate: sendMsg } = useSendMessage();

  const isManager = user?.role === 'owner' || user?.role === 'deputy';
  const isAssignee = task?.assigneeId === user?.id;
  const status = task?.status;

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
        <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>

      <KeyboardAwareScrollViewCompat style={{ flex: 1 }} bottomOffset={80}>
        <View style={styles.content}>
          <Text style={[styles.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>{task.description}</Text>

          <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {task.assignee ? (
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
          </View>

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
          </View>

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
  actions: { flexDirection: 'row', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
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
});
