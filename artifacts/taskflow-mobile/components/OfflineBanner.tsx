import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline } from '@/context/OfflineContext';

export function OfflineBanner() {
  const { isOnline } = useOffline();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-40)).current;

  useEffect(() => {
    if (!isOnline) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -40, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [isOnline]);

  if (isOnline) return null;

  const topPadding = Platform.OS === 'web' ? 8 : insets.top + 8;

  return (
    <Animated.View
      style={[
        styles.banner,
        { paddingTop: topPadding, opacity, transform: [{ translateY }] },
      ]}
    >
      <Feather name="wifi-off" size={14} color="#fff" />
      <Text style={styles.text}>No internet — showing cached data</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
});
