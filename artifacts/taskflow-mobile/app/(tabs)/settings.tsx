import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  Alert, ScrollView, Platform, Clipboard, TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFetch, useGetNotificationPreferences, useUpdateNotificationPreferences } from '@workspace/api-client-react';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const {
    user, logout, biometricAvailable, biometricEnabled,
    enableBiometric, disableBiometric, groups, activeGroupId, switchGroup,
  } = useAuth();

  const [switchingGroup, setSwitchingGroup] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinSuccess, setJoinSuccess] = useState(false);

  const joinGroupMutation = useMutation({
    mutationFn: () =>
      customFetch<{ pendingApproval: boolean; team: { id: number; name: string } }>('/api/auth/join-group', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: joinCode.trim().toUpperCase() }),
      }),
    onSuccess: () => {
      setJoinSuccess(true);
      setJoinCode('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Could not join group', err?.message ?? 'Invalid invite code');
    },
  });

  const { data: teamInfo } = useQuery({
    queryKey: ['team-info'],
    queryFn: () => customFetch<{ id: number; name: string; inviteCode: string }>('/api/team/info'),
    enabled: !!user,
  });

  const isManager = user?.role === 'owner' || user?.role === 'deputy';

  const { data: joinRequests, refetch: refetchJoinRequests } = useQuery({
    queryKey: ['join-requests'],
    queryFn: () => customFetch<Array<{ id: number; fullName: string; mobile: string }>>('/api/team/join-requests'),
    enabled: !!user && isManager,
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/team/join-requests/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      refetchJoinRequests();
      queryClient.invalidateQueries({ queryKey: ['users'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/team/join-requests/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      refetchJoinRequests();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    },
  });

  const { data: notifPrefs } = useGetNotificationPreferences({ query: { enabled: !!user && Platform.OS !== 'web' } });
  const [prefs, setPrefs] = useState({ reminder24h: true, reminder1h: true, reminder10m: true, overdue: true });

  useEffect(() => {
    if (notifPrefs) setPrefs(notifPrefs);
  }, [notifPrefs]);

  const { mutate: savePrefs } = useUpdateNotificationPreferences({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['getNotificationPreferences'] }),
    },
  });

  function handlePrefToggle(key: keyof typeof prefs, value: boolean) {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    savePrefs({ data: updated });
    Haptics.selectionAsync().catch(() => {});
  }

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

  function handleCopyCode() {
    if (teamInfo?.inviteCode) {
      Clipboard.setString(teamInfo.inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }

  async function handleBiometricToggle(value: boolean) {
    setBiometricLoading(true);
    try {
      if (value) {
        const success = await enableBiometric();
        if (success) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        await disableBiometric();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } finally {
      setBiometricLoading(false);
    }
  }

  function handleLogout() {
    if (Platform.OS === 'web') {
      logout();
      router.replace('/(auth)/login');
      return;
    }
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out', style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  }

  const roleColors: Record<string, string> = {
    owner: '#8B5CF6',
    deputy: '#4F6EF7',
    member: '#64748B',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.profileAvatar, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.profileAvatarText, { color: colors.primary }]}>
              {user?.fullName?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{user?.fullName}</Text>
            <Text style={[styles.profileMobile, { color: colors.mutedForeground }]}>{user?.mobile}</Text>
          </View>
          <View style={[styles.rolePill, { backgroundColor: (roleColors[user?.role ?? 'member'] ?? '#64748B') + '20' }]}>
            <Text style={[styles.roleText, { color: roleColors[user?.role ?? 'member'] ?? '#64748B' }]}>
              {user?.role}
            </Text>
          </View>
        </View>

        {/* Pending Join Requests — shown only to managers */}
        {isManager && joinRequests && joinRequests.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PENDING REQUESTS</Text>
            <View style={[styles.settingsCard, { backgroundColor: '#FEF3C708', borderColor: '#F59E0B40', borderWidth: 1, borderRadius: 12, overflow: 'hidden' }]}>
              <View style={[styles.settingRow, { paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F59E0B30' }]}>
                <View style={[styles.settingIcon, { backgroundColor: '#F59E0B20' }]}>
                  <Feather name="user-check" size={18} color="#F59E0B" />
                </View>
                <View style={styles.settingLabel}>
                  <Text style={[styles.settingName, { color: '#92400E' }]}>Waiting for approval</Text>
                  <Text style={[styles.settingDesc, { color: '#B45309' }]}>
                    {joinRequests.length} {joinRequests.length === 1 ? 'person' : 'people'} requesting to join
                  </Text>
                </View>
                <View style={{ backgroundColor: '#F59E0B', borderRadius: 10, minWidth: 20, alignItems: 'center', paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' as const }}>{joinRequests.length}</Text>
                </View>
              </View>
              {joinRequests.map((req, i) => (
                <View
                  key={req.id}
                  style={[
                    styles.settingRow,
                    { alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 },
                    i < joinRequests.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#F59E0B20' },
                  ]}
                >
                  <View style={[styles.settingIcon, { backgroundColor: '#F59E0B20', marginTop: 2 }]}>
                    <Text style={{ fontSize: 16, fontWeight: '700' as const, color: '#F59E0B' }}>
                      {req.fullName?.charAt(0)?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={[styles.settingLabel]}>
                    <Text style={[styles.settingName, { color: colors.foreground }]}>{req.fullName}</Text>
                    <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>{req.mobile}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        style={{ backgroundColor: '#22C55E', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: approveMutation.isPending ? 0.6 : 1 }}
                        onPress={() => approveMutation.mutate(req.id)}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                        activeOpacity={0.7}
                      >
                        <Feather name="check" size={13} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' as const }}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: '#EF444440', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: rejectMutation.isPending ? 0.6 : 1 }}
                        onPress={() => rejectMutation.mutate(req.id)}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                        activeOpacity={0.7}
                      >
                        <Feather name="x" size={13} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' as const }}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Group Switcher — shown only when user belongs to multiple groups */}
        {groups.length > 1 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>GROUPS</Text>
            <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {groups.map((g, i) => (
                <TouchableOpacity
                  key={g.id}
                  style={[
                    styles.settingRow,
                    i < groups.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    switchingGroup && { opacity: 0.6 },
                  ]}
                  onPress={async () => {
                    if (g.id === activeGroupId || switchingGroup) return;
                    setSwitchingGroup(true);
                    try {
                      await switchGroup(g.id);
                      queryClient.clear();
                      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch {
                      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    } finally {
                      setSwitchingGroup(false);
                    }
                  }}
                  disabled={switchingGroup}
                  activeOpacity={0.7}
                >
                  <View style={[styles.settingIcon, { backgroundColor: colors.primary + '20' }]}>
                    <Feather name="layers" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.settingLabel}>
                    <Text style={[styles.settingName, { color: colors.foreground }]}>{g.name}</Text>
                    <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>{g.role}</Text>
                  </View>
                  {g.id === activeGroupId && (
                    <Feather name="check-circle" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Join a Group */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>JOIN A GROUP</Text>
          <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {joinSuccess ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                <View style={{ width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E20' }}>
                  <Feather name="check-circle" size={18} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingName, { color: colors.foreground }]}>Request sent!</Text>
                  <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>Waiting for the owner to approve you.</Text>
                </View>
              </View>
            ) : (
              <View style={{ padding: 14, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[styles.settingIcon, { backgroundColor: colors.primary + '20' }]}>
                    <Feather name="user-plus" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingName, { color: colors.foreground }]}>Enter invite code</Text>
                    <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>Request access to another group</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={[
                      styles.joinInput,
                      { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, flex: 1 },
                    ]}
                    placeholder="e.g. A1B2C3D4"
                    placeholderTextColor={colors.mutedForeground}
                    value={joinCode}
                    onChangeText={(t) => setJoinCode(t.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[
                      styles.joinBtn,
                      { backgroundColor: colors.primary, opacity: (!joinCode.trim() || joinGroupMutation.isPending) ? 0.5 : 1 },
                    ]}
                    onPress={() => joinGroupMutation.mutate()}
                    disabled={!joinCode.trim() || joinGroupMutation.isPending}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.joinBtnText}>
                      {joinGroupMutation.isPending ? 'Sending…' : 'Send Request'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Team Invite Code */}
        {teamInfo && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>TEAM</Text>
            <View style={[styles.inviteCard, { backgroundColor: '#4F6EF708', borderColor: colors.primary + '30' }]}>
              <Text style={[styles.inviteTeamName, { color: colors.foreground }]}>{teamInfo.name}</Text>
              <Text style={[styles.inviteLabel, { color: colors.mutedForeground }]}>Invite Code</Text>
              <View style={styles.codeRow}>
                <View style={[styles.codeBox, { backgroundColor: colors.card, borderColor: colors.primary + '40' }]}>
                  <Text style={[styles.codeText, { color: colors.primary }]}>{teamInfo.inviteCode}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.copyBtn, { backgroundColor: codeCopied ? '#22C55E' : colors.primary }]}
                  onPress={handleCopyCode}
                >
                  <Feather name={codeCopied ? 'check' : 'copy'} size={15} color="#fff" />
                  <Text style={styles.copyBtnText}>{codeCopied ? 'Copied!' : 'Copy'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.inviteHint, { color: colors.mutedForeground }]}>
                Share this code so others can join your team
              </Text>
            </View>
          </View>
        )}

        {/* Biometric */}
        {(Platform.OS !== 'web' && biometricAvailable) ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SECURITY</Text>
            <View style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.settingIcon, { backgroundColor: '#22C55E20' }]}>
                <Feather name="shield" size={18} color="#22C55E" />
              </View>
              <View style={styles.settingLabel}>
                <Text style={[styles.settingName, { color: colors.foreground }]}>Biometric Login</Text>
                <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>
                  Use Face ID or fingerprint
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleBiometricToggle}
                disabled={biometricLoading}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
                ios_backgroundColor={colors.border}
              />
            </View>
          </View>
        ) : null}

        {/* Notification Preferences (native only) */}
        {Platform.OS !== 'web' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>NOTIFICATIONS</Text>
            <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {([
                { key: 'reminder24h' as const, label: '24-hour reminder', desc: 'Alert 24 hours before deadline', icon: 'clock', color: '#4F6EF7' },
                { key: 'reminder1h' as const, label: '1-hour reminder', desc: 'Alert 1 hour before deadline', icon: 'clock', color: '#F59E0B' },
                { key: 'reminder10m' as const, label: '10-minute reminder', desc: 'Alert 10 minutes before deadline', icon: 'clock', color: '#EF4444' },
                { key: 'overdue' as const, label: 'Overdue alerts', desc: 'Alert when a task passes its deadline', icon: 'alert-circle', color: '#EF4444' },
              ]).map((item, i, arr) => (
                <View
                  key={item.key}
                  style={[
                    styles.settingRow,
                    i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.settingIcon, { backgroundColor: item.color + '20' }]}>
                    <Feather name={item.icon as any} size={18} color={item.color} />
                  </View>
                  <View style={styles.settingLabel}>
                    <Text style={[styles.settingName, { color: colors.foreground }]}>{item.label}</Text>
                    <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
                  </View>
                  <Switch
                    value={prefs[item.key]}
                    onValueChange={(v) => handlePrefToggle(item.key, v)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor={colors.border}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Administration — managers only */}
        {(user?.role === 'owner' || user?.role === 'deputy') && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ADMINISTRATION</Text>
            <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => router.push('/audit-log' as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.settingIcon, { backgroundColor: '#6366F120' }]}>
                  <Feather name="shield" size={18} color="#6366F1" />
                </View>
                <View style={styles.settingLabel}>
                  <Text style={[styles.settingName, { color: colors.foreground }]}>Audit Log</Text>
                  <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>View all group activity</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Account */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ACCOUNT</Text>
          <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/change-password' as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.settingIcon, { backgroundColor: '#F59E0B20' }]}>
                <Feather name="key" size={18} color="#F59E0B" />
              </View>
              <Text style={[styles.settingName, { color: colors.foreground }]}>Change Password</Text>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: colors.destructive + '40', backgroundColor: colors.destructive + '10' }]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Feather name="log-out" size={18} color={colors.destructive} />
            <Text style={[styles.logoutText, { color: colors.destructive }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>Taskaya v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  content: { padding: 16, gap: 8 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 8,
  },
  profileAvatar: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  profileMobile: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  rolePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  roleText: { fontSize: 12, fontWeight: '500' as const, fontFamily: 'Inter_500Medium', textTransform: 'capitalize' },
  section: { gap: 6 },
  sectionTitle: { fontSize: 11, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, paddingHorizontal: 4, marginBottom: 2 },
  inviteCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  inviteTeamName: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  inviteLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  codeBox: { flex: 1, borderWidth: 1.5, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  codeText: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  copyBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  inviteHint: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  settingsCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14,
  },
  settingIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { flex: 1 },
  settingName: { fontSize: 15, fontFamily: 'Inter_400Regular', fontWeight: '500' as const },
  settingDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingVertical: 14, marginTop: 8,
  },
  logoutText: { fontSize: 16, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  version: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 16 },
  joinInput: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 15, fontFamily: 'Inter_400Regular', letterSpacing: 1,
  },
  joinBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
  },
  joinBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});
