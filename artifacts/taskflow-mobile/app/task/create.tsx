import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useListUsers, useCreateTask } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';

export default function CreateTaskScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: users } = useListUsers();
  const { mutateAsync: createTask } = useCreateTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 10;

  function toggleAssignee(userId: number) {
    setAssigneeIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!deadline.trim()) { setError('Deadline is required'); return; }
    if (assigneeIds.length === 0) { setError('Please select at least one assignee'); return; }

    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) { setError('Invalid date format. Use YYYY-MM-DD'); return; }

    setError('');
    setIsLoading(true);
    try {
      await createTask({
        data: {
          title: title.trim(),
          description: description.trim(),
          deadline: deadlineDate.toISOString(),
          assigneeIds,
        } as any
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['listTasks'] });
      router.back();
    } catch (e: any) {
      setError(e.message || 'Failed to create task');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>New Task</Text>
        <TouchableOpacity onPress={handleCreate} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={[styles.saveBtn, { color: colors.primary }]}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}>
            <Feather name="alert-circle" size={14} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Title *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
            placeholder="Task title"
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Description</Text>
          <TextInput
            style={[styles.textarea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
            placeholder="Task description (optional)"
            placeholderTextColor={colors.mutedForeground}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Deadline *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            value={deadline}
            onChangeText={setDeadline}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            Assignees *{' '}
            {assigneeIds.length > 0 && (
              <Text style={{ color: colors.primary, fontSize: 13 }}>
                ({assigneeIds.length} selected)
              </Text>
            )}
          </Text>
          <View style={[styles.assigneeList, { borderColor: colors.border }]}>
            {(users ?? []).map(u => {
              const isSelected = assigneeIds.includes(u.id);
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[
                    styles.assigneeRow,
                    { borderBottomColor: colors.border },
                    isSelected && { backgroundColor: colors.primary + '12' },
                  ]}
                  onPress={() => toggleAssignee(u.id)}
                >
                  <View style={[
                    styles.avatar,
                    { backgroundColor: isSelected ? colors.primary : colors.primary + '20' },
                  ]}>
                    {isSelected ? (
                      <Feather name="check" size={13} color="#fff" />
                    ) : (
                      <Text style={[styles.avatarText, { color: colors.primary }]}>
                        {u.fullName.charAt(0)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assigneeName, { color: colors.foreground }]}>{u.fullName}</Text>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textTransform: 'capitalize' }}>
                      {u.role}
                    </Text>
                  </View>
                  {isSelected && (
                    <Text style={{ fontSize: 12, color: colors.primary, fontFamily: 'Inter_500Medium' }}>
                      Selected
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  content: { padding: 20, gap: 20 },
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
