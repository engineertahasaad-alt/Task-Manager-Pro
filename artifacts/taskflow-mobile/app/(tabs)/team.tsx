import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  RefreshControl, Platform, TouchableOpacity, TextInput,
  Modal, ScrollView, Alert, Clipboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListUsers, useCreateUser, useUpdateUser, useDisableUser, useResetUserPassword, getListUsersQueryKey } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { GroupBadge } from '@/components/GroupBadge';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  owner: { bg: '#8B5CF620', text: '#8B5CF6' },
  deputy: { bg: '#4F6EF720', text: '#4F6EF7' },
  member: { bg: '#64748B20', text: '#64748B' },
};

function useTeamInfo() {
  return useQuery({
    queryKey: ['team-info'],
    queryFn: () => customFetch<{ id: number; name: string; inviteCode: string }>('/api/team/info'),
  });
}

function useJoinRequests(enabled: boolean) {
  return useQuery({
    queryKey: ['join-requests'],
    queryFn: () => customFetch<User[]>('/api/team/join-requests'),
    enabled,
    refetchInterval: 30_000,
  });
}

export default function TeamScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: users, isLoading, refetch } = useListUsers();
  const isManager = currentUser?.role === 'owner' || currentUser?.role === 'deputy';
  const { data: teamInfo, refetch: refetchTeamInfo } = useTeamInfo();
  const { data: joinRequests, refetch: refetchJoinRequests } = useJoinRequests(isManager);

  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const disableUserMutation = useDisableUser();
  const resetPasswordMutation = useResetUserPassword();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const [form, setForm] = useState({ fullName: '', mobile: '', role: 'member' as 'owner' | 'deputy' | 'member', newPassword: '', confirmPassword: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

  function handleCopyCode() {
    if (teamInfo?.inviteCode) {
      Clipboard.setString(teamInfo.inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }

  async function handleApproveRequest(id: number) {
    try {
      await customFetch(`/api/team/join-requests/${id}/approve`, { method: 'POST' });
      refetchJoinRequests();
      refetch();
    } catch {
      Alert.alert('Error', 'Could not approve request');
    }
  }

  async function handleRejectRequest(id: number) {
    Alert.alert('Reject Request', 'Are you sure you want to reject this join request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject', style: 'destructive',
        onPress: async () => {
          try {
            await customFetch(`/api/team/join-requests/${id}/reject`, { method: 'POST' });
            refetchJoinRequests();
          } catch {
            Alert.alert('Error', 'Could not reject request');
          }
        }
      }
    ]);
  }

  async function handleRegenerateCode() {
    Alert.alert('Regenerate Code', 'This will invalidate the old invite code. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate', style: 'destructive',
        onPress: async () => {
          try {
            await customFetch('/api/team/regenerate-invite', { method: 'POST' });
            refetchTeamInfo();
          } catch {
            Alert.alert('Error', 'Could not regenerate code');
          }
        }
      }
    ]);
  }

  function openAdd() {
    setForm({ fullName: '', mobile: '', role: 'member', newPassword: '', confirmPassword: '' });
    setFormError('');
    setEditingUser(null);
    setShowAddModal(true);
  }

  function openEdit(u: User) {
    setForm({ fullName: u.fullName, mobile: u.mobile, role: u.role as any, newPassword: '', confirmPassword: '' });
    setFormError('');
    setEditingUser(u);
    setShowAddModal(true);
  }

  function openReset(u: User) {
    setForm({ fullName: u.fullName, mobile: u.mobile, role: u.role as any, newPassword: '', confirmPassword: '' });
    setFormError('');
    setResetUser(u);
  }

  async function handleSubmitUserForm() {
    if (!form.fullName.trim() || !form.mobile.trim()) {
      setFormError('Name and mobile are required'); return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      if (editingUser) {
        await new Promise<void>((resolve, reject) => {
          updateUserMutation.mutate({ id: editingUser.id, data: { fullName: form.fullName, mobile: form.mobile, role: form.role } }, {
            onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); setShowAddModal(false); resolve(); },
            onError: (e: any) => { setFormError(e?.data?.error ?? 'Could not update user'); reject(); }
          });
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          createUserMutation.mutate({ data: { fullName: form.fullName, mobile: form.mobile, role: form.role } }, {
            onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); setShowAddModal(false); resolve(); },
            onError: (e: any) => { setFormError(e?.data?.error ?? 'Could not create user'); reject(); }
          });
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword() {
    if (!form.newPassword || form.newPassword.length < 6) {
      setFormError('Password must be at least 6 characters'); return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setFormError('Passwords do not match'); return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      await new Promise<void>((resolve, reject) => {
        resetPasswordMutation.mutate({ id: resetUser!.id, data: { newPassword: form.newPassword } }, {
          onSuccess: () => { setResetUser(null); resolve(); },
          onError: (e: any) => { setFormError(e?.data?.error ?? 'Could not reset password'); reject(); }
        });
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleToggleStatus(u: User) {
    const action = u.isActive ? 'disable' : 'enable';
    Alert.alert(`${action.charAt(0).toUpperCase() + action.slice(1)} User`, `${action === 'disable' ? 'Disable' : 'Enable'} ${u.fullName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action.charAt(0).toUpperCase() + action.slice(1),
        style: action === 'disable' ? 'destructive' : 'default',
        onPress: () => {
          disableUserMutation.mutate({ id: u.id }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }),
          });
        }
      }
    ]);
  }

  const pendingCount = joinRequests?.length ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Team</Text>
          <GroupBadge />
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.countBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.mutedForeground }]}>
              {users?.filter(u => !(u as any).pendingApproval).length ?? 0} members
            </Text>
          </View>
          {isManager && (
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
              <Feather name="user-plus" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { refetch(); refetchJoinRequests(); refetchTeamInfo(); }} tintColor={colors.primary} />}
      >
        {/* Invite Code Card */}
        {teamInfo && (
          <View style={[styles.inviteCard, { backgroundColor: '#4F6EF708', borderColor: colors.primary + '30' }]}>
            <View style={styles.inviteHeader}>
              <Feather name="link" size={16} color={colors.primary} />
              <Text style={[styles.inviteTitle, { color: colors.foreground }]}>Team Invite Code</Text>
            </View>
            <Text style={[styles.inviteSubtitle, { color: colors.mutedForeground }]}>
              Share this code so others can request to join your team.
            </Text>
            <View style={styles.codeRow}>
              <View style={[styles.codeBox, { backgroundColor: colors.card, borderColor: colors.primary + '40' }]}>
                <Text style={[styles.codeText, { color: colors.primary }]}>{teamInfo.inviteCode}</Text>
              </View>
              <TouchableOpacity style={[styles.copyBtn, { backgroundColor: codeCopied ? '#22C55E' : colors.primary }]} onPress={handleCopyCode}>
                <Feather name={codeCopied ? 'check' : 'copy'} size={16} color="#fff" />
                <Text style={styles.copyBtnText}>{codeCopied ? 'Copied' : 'Copy'}</Text>
              </TouchableOpacity>
            </View>
            {currentUser?.role === 'owner' && (
              <TouchableOpacity onPress={handleRegenerateCode} style={styles.regenerateBtn}>
                <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
                <Text style={[styles.regenerateText, { color: colors.mutedForeground }]}>Regenerate code</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Join Requests */}
        {isManager && pendingCount > 0 && (
          <View style={[styles.requestsCard, { backgroundColor: '#F59E0B08', borderColor: '#F59E0B40' }]}>
            <View style={styles.requestsHeader}>
              <Feather name="user-check" size={16} color="#F59E0B" />
              <Text style={[styles.requestsTitle, { color: colors.foreground }]}>Join Requests</Text>
              <View style={styles.requestsBadge}>
                <Text style={styles.requestsBadgeText}>{pendingCount}</Text>
              </View>
            </View>
            {joinRequests?.map((u) => (
              <View key={u.id} style={[styles.requestItem, { borderColor: colors.border }]}>
                <View style={[styles.requestAvatar, { backgroundColor: '#F59E0B20' }]}>
                  <Text style={styles.requestAvatarText}>{u.fullName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.requestInfo}>
                  <Text style={[styles.requestName, { color: colors.foreground }]}>{u.fullName}</Text>
                  <Text style={[styles.requestMobile, { color: colors.mutedForeground }]}>{u.mobile}</Text>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveRequest(u.id)}>
                    <Feather name="check" size={14} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectRequest(u.id)}>
                    <Feather name="x" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Members List */}
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (users?.filter(u => !(u as any).pendingApproval) ?? []).length === 0 ? (
          <View style={styles.empty}>
            <Feather name="users" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No team members</Text>
          </View>
        ) : (
          (users?.filter(u => !(u as any).pendingApproval) ?? []).map((item) => {
            const roleStyle = ROLE_COLORS[item.role] ?? ROLE_COLORS.member;
            const isYou = item.id === currentUser?.id;
            const canManage = isManager && !isYou && !(currentUser?.role !== 'owner' && item.role === 'owner');
            return (
              <View key={item.id} style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {item.fullName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: colors.foreground }]}>{item.fullName}</Text>
                    {isYou ? (
                      <View style={[styles.youBadge, { backgroundColor: colors.accent }]}>
                        <Text style={[styles.youText, { color: colors.mutedForeground }]}>You</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.mobile, { color: colors.mutedForeground }]}>{item.mobile}</Text>
                </View>
                <View style={styles.right}>
                  <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg }]}>
                    <Text style={[styles.roleText, { color: roleStyle.text }]}>{item.role}</Text>
                  </View>
                  {!item.isActive ? (
                    <View><Feather name="slash" size={14} color="#EF4444" /></View>
                  ) : null}
                  {canManage && (
                    <View style={styles.memberActions}>
                      <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionIconBtn}>
                        <Feather name="edit-2" size={13} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => openReset(item)} style={styles.actionIconBtn}>
                        <Feather name="key" size={13} color="#F59E0B" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleToggleStatus(item)} style={styles.actionIconBtn}>
                        <Feather name={item.isActive ? 'user-x' : 'user-check'} size={13} color={item.isActive ? '#EF4444' : '#22C55E'} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add / Edit Member Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingUser ? 'Edit Member' : 'Add Member'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Full Name *</Text>
                <View style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="Full name"
                    placeholderTextColor={colors.mutedForeground}
                    value={form.fullName}
                    onChangeText={v => setForm(f => ({ ...f, fullName: v }))}
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Mobile Number *</Text>
                <View style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="Mobile number"
                    placeholderTextColor={colors.mutedForeground}
                    value={form.mobile}
                    onChangeText={v => setForm(f => ({ ...f, mobile: v }))}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Role</Text>
                <View style={styles.roleSelector}>
                  {(['member', 'deputy', 'owner'] as const)
                    .filter(r => !(r === 'owner' && currentUser?.role !== 'owner'))
                    .filter(r => !(r === 'deputy' && currentUser?.role !== 'owner' && !editingUser))
                    .map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.roleOption,
                          { borderColor: form.role === r ? colors.primary : colors.border },
                          form.role === r && { backgroundColor: colors.primary + '15' },
                        ]}
                        onPress={() => setForm(f => ({ ...f, role: r }))}
                      >
                        <Text style={[styles.roleOptionText, { color: form.role === r ? colors.primary : colors.foreground }]}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </View>
              {!editingUser && (
                <Text style={[styles.passwordHint, { color: colors.mutedForeground }]}>
                  Default password will be "123" — user must change it on first login.
                </Text>
              )}
              {formError ? (
                <Text style={styles.formError}>{formError}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }, isSubmitting && { opacity: 0.7 }]}
                onPress={handleSubmitUserForm}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitBtnText}>{editingUser ? 'Save Changes' : 'Create Member'}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={!!resetUser} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Reset Password — {resetUser?.fullName}
              </Text>
              <TouchableOpacity onPress={() => setResetUser(null)}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.resetHint, { color: colors.mutedForeground }]}>
              Set a temporary password. The user must change it on next login.
            </Text>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>New Password *</Text>
              <View style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="Min 6 characters"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.newPassword}
                  onChangeText={v => setForm(f => ({ ...f, newPassword: v }))}
                  secureTextEntry
                />
              </View>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Confirm Password *</Text>
              <View style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.mutedForeground}
                  value={form.confirmPassword}
                  onChangeText={v => setForm(f => ({ ...f, confirmPassword: v }))}
                  secureTextEntry
                />
              </View>
            </View>
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: '#F59E0B' }, isSubmitting && { opacity: 0.7 }]}
              onPress={handleResetPassword}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitBtnText}>Reset Password</Text>
              }
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  addBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, gap: 12 },
  loadingCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  inviteCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  inviteTitle: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  inviteSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeBox: { flex: 1, borderWidth: 2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  codeText: { fontSize: 20, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  copyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  regenerateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  regenerateText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  requestsCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  requestsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  requestsTitle: { flex: 1, fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  requestsBadge: { backgroundColor: '#F59E0B', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  requestsBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  requestItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1 },
  requestAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  requestAvatarText: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', color: '#F59E0B' },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  requestMobile: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  requestActions: { flexDirection: 'row', gap: 8 },
  approveBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  youBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  youText: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  mobile: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  roleText: { fontSize: 11, fontWeight: '500' as const, fontFamily: 'Inter_500Medium', textTransform: 'capitalize' },
  memberActions: { flexDirection: 'row', gap: 6, marginTop: 2 },
  actionIconBtn: { padding: 4 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  resetHint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 16 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '500' as const, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 46 },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', height: '100%' },
  roleSelector: { flexDirection: 'row', gap: 8 },
  roleOption: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  roleOptionText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  passwordHint: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 14, fontStyle: 'italic' },
  formError: { color: '#EF4444', fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 12 },
  submitBtn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});
