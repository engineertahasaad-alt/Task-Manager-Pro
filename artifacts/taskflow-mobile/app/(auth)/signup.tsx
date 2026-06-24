import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { router } from 'expo-router';

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [joinMode, setJoinMode] = useState<'create' | 'join'>('create');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignup() {
    if (!fullName.trim() || !mobile.trim() || !password.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    if (joinMode === 'join' && !inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const body: any = { fullName: fullName.trim(), mobile: mobile.trim(), password };
      if (joinMode === 'join') body.inviteCode = inviteCode.trim().toUpperCase();
      else if (teamName.trim()) body.teamName = teamName.trim();

      const res = await fetch(`https://${domain}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Signup failed');
      }
      const data = await res.json();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data.pendingApproval) {
        router.replace('/(auth)/pending' as any);
        return;
      }
      await login(mobile.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e.message || 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 20),
              paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20),
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.foreground }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Join your team on Taskaya</Text>

          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, joinMode === 'create' && { backgroundColor: colors.primary }]}
              onPress={() => setJoinMode('create')}
            >
              <Text style={[styles.modeBtnText, { color: joinMode === 'create' ? '#fff' : colors.mutedForeground }]}>
                Create Team
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, joinMode === 'join' && { backgroundColor: colors.primary }]}
              onPress={() => setJoinMode('join')}
            >
              <Text style={[styles.modeBtnText, { color: joinMode === 'join' ? '#fff' : colors.mutedForeground }]}>
                Join Team
              </Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}>
              <Feather name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="user" size={16} color={colors.mutedForeground} style={styles.icon} />
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Full Name *" placeholderTextColor={colors.mutedForeground} value={fullName} onChangeText={setFullName} />
            </View>
            <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="phone" size={16} color={colors.mutedForeground} style={styles.icon} />
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Mobile Number *" placeholderTextColor={colors.mutedForeground} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" autoCapitalize="none" />
            </View>
            <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="lock" size={16} color={colors.mutedForeground} style={styles.icon} />
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Password *" placeholderTextColor={colors.mutedForeground} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {joinMode === 'create' ? (
              <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="users" size={16} color={colors.mutedForeground} style={styles.icon} />
                <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Team Name (optional)" placeholderTextColor={colors.mutedForeground} value={teamName} onChangeText={setTeamName} />
              </View>
            ) : (
              <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="key" size={16} color={colors.mutedForeground} style={styles.icon} />
                <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Invite Code *" placeholderTextColor={colors.mutedForeground} value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" />
              </View>
            )}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }, isLoading && { opacity: 0.7 }]}
              onPress={handleSignup}
              disabled={isLoading}
            >
              {isLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>Create Account</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={[styles.footerLink, { color: colors.primary }]}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  kav: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  back: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  subtitle: { fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 24 },
  modeToggle: {
    flexDirection: 'row', backgroundColor: '#F1F5F9',
    borderRadius: 10, padding: 4, marginBottom: 20,
  },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeBtnText: { fontSize: 14, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  errorText: { color: '#EF4444', fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  form: { gap: 12 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48 },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  footerLink: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});
