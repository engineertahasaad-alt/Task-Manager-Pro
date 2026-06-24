import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export default function PendingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.content, {
        paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 40),
        paddingBottom: insets.bottom + 40,
      }]}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={[styles.iconWrap, { backgroundColor: '#F59E0B18' }]}>
          <Feather name="clock" size={40} color="#F59E0B" />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>Request Submitted!</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Your request to join the team has been sent.{'\n'}
          Please wait for an admin to approve your account.
        </Text>

        <View style={[styles.infoCard, { backgroundColor: '#4F6EF708', borderColor: colors.primary + '30' }]}>
          <Feather name="info" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            You will be able to sign in once your account is approved by the team owner or deputy.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.btnText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1, paddingHorizontal: 28,
    alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  logo: { width: 70, height: 70, marginBottom: 8 },
  iconWrap: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  btn: {
    width: '100%', height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});
