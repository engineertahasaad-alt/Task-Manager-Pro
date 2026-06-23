import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  Alert, ScrollView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    user, logout, biometricAvailable, biometricEnabled,
    enableBiometric, disableBiometric,
  } = useAuth();

  const [biometricLoading, setBiometricLoading] = useState(false);

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

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
          <View style={[styles.rolePill, { backgroundColor: roleColors[user?.role ?? 'member'] + '20' }]}>
            <Text style={[styles.roleText, { color: roleColors[user?.role ?? 'member'] }]}>
              {user?.role}
            </Text>
          </View>
        </View>

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

        <Text style={[styles.version, { color: colors.mutedForeground }]}>TaskFlow Mobile v1.0.0</Text>
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
});
