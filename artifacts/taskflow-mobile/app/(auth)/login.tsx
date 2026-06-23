import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { router } from 'expo-router';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, loginWithBiometric, biometricAvailable, biometricEnabled, hasSavedCredentials } = useAuth();

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSignup, setShowSignup] = useState(false);

  const canUseBiometric = biometricAvailable && biometricEnabled && hasSavedCredentials;

  useEffect(() => {
    if (canUseBiometric) {
      handleBiometricLogin();
    }
  }, [canUseBiometric]);

  async function handleBiometricLogin() {
    try {
      const success = await loginWithBiometric();
      if (success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(tabs)');
      }
    } catch {}
  }

  async function handleLogin() {
    if (!mobile.trim() || !password.trim()) {
      setError('Please enter your mobile number and password');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await login(mobile.trim(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 24),
              paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 24),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoSection}>
            <View style={[styles.logoContainer, { backgroundColor: colors.primary + '15' }]}>
              <Feather name="check-square" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.appName, { color: colors.foreground }]}>Taskaya</Text>
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
              Team task management
            </Text>
          </View>

          <View style={styles.form}>
            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Mobile Number</Text>
              <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="phone" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="Enter your mobile number"
                  placeholderTextColor={colors.mutedForeground}
                  value={mobile}
                  onChangeText={setMobile}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  editable={!isLoading}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
              <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="lock" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!isLoading}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginButton, { backgroundColor: colors.primary }, isLoading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {canUseBiometric ? (
              <TouchableOpacity
                style={[styles.biometricButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={handleBiometricLogin}
                activeOpacity={0.7}
              >
                <Feather name="shield" size={20} color={colors.primary} />
                <Text style={[styles.biometricText, { color: colors.primary }]}>
                  Use Biometric Login
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              Don't have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signup' as any)}>
              <Text style={[styles.footerLink, { color: colors.primary }]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  logoSection: { alignItems: 'center', marginBottom: 40 },
  logoContainer: {
    width: 80, height: 80,
    borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  appName: { fontSize: 28, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  tagline: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  form: { gap: 16 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  errorText: { color: '#EF4444', fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  inputGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  loginButton: {
    height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  biometricButton: {
    height: 50, borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  biometricText: { fontSize: 15, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32 },
  footerText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  footerLink: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});
