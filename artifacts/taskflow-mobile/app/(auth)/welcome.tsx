import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, Image, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const logoScale   = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY       = useRef(new Animated.Value(20)).current;
  const tagOpacity  = useRef(new Animated.Value(0)).current;
  const tagY        = useRef(new Animated.Value(16)).current;
  const btnOpacity  = useRef(new Animated.Value(0)).current;
  const btnY        = useRef(new Animated.Value(30)).current;
  const dot1        = useRef(new Animated.Value(0)).current;
  const dot2        = useRef(new Animated.Value(0)).current;
  const dot3        = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(titleY, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(tagOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(tagY, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true }),
      ]),
      Animated.stagger(80, [
        Animated.spring(dot1, { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }),
        Animated.spring(dot2, { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }),
        Animated.spring(dot3, { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(btnY, { toValue: 0, tension: 70, friction: 8, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: '#FAFAFA' }]}>
      <View style={[styles.inner, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}>

        <View style={styles.logoWrap}>
          <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
            <Image
              source={require('../../assets/images/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        <Animated.Text
          style={[styles.appName, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}
        >
          Taskaya
        </Animated.Text>

        <Animated.Text
          style={[styles.tagline, { opacity: tagOpacity, transform: [{ translateY: tagY }] }]}
        >
          Smart team task management
        </Animated.Text>

        <View style={styles.features}>
          {[
            { dot: dot1, color: '#00C9A7', text: 'Assign & track tasks effortlessly' },
            { dot: dot2, color: '#4F6EF7', text: 'Real‑time deadlines & reminders'  },
            { dot: dot3, color: '#A855F7', text: 'Team insights at a glance'        },
          ].map(({ dot, color, text }) => (
            <Animated.View
              key={text}
              style={[styles.featureRow, { opacity: dot, transform: [{ scale: dot }] }]}
            >
              <View style={[styles.featureDot, { backgroundColor: color }]} />
              <Text style={styles.featureText}>{text}</Text>
            </Animated.View>
          ))}
        </View>

        <View style={styles.spacer} />

        <Animated.View style={{ opacity: btnOpacity, transform: [{ translateY: btnY }], width: '100%' }}>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signInBtn}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.7}
          >
            <Text style={styles.signInText}>
              Already have an account?{' '}
              <Text style={[styles.signInLink, { color: '#4F6EF7' }]}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1, alignItems: 'center', paddingHorizontal: 28,
  },
  logoWrap: { alignItems: 'center', marginBottom: 4 },
  logo: { width: width * 0.38, height: width * 0.38 },
  appName: {
    fontSize: 38, fontWeight: '800' as const,
    fontFamily: 'Inter_700Bold',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 40,
  },
  features: { width: '100%', gap: 14 },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff',
    borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  featureDot: { width: 10, height: 10, borderRadius: 5 },
  featureText: {
    fontSize: 14, fontFamily: 'Inter_500Medium', color: '#334155',
  },
  spacer: { flex: 1 },
  btn: {
    backgroundColor: '#4F6EF7',
    borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', width: '100%',
    shadowColor: '#4F6EF7', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    marginBottom: 16,
  },
  btnText: {
    color: '#fff', fontSize: 17,
    fontWeight: '700' as const, fontFamily: 'Inter_700Bold',
  },
  signInBtn: { alignItems: 'center', paddingVertical: 8 },
  signInText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#64748B' },
  signInLink: { fontFamily: 'Inter_600SemiBold', fontWeight: '600' as const },
});
