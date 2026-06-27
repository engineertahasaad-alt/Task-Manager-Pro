import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export function GroupBadge() {
  const { groups, activeGroupId } = useAuth();
  const colors = useColors();

  if (groups.length <= 1) return null;

  const activeGroup = groups.find(g => g.id === activeGroupId);
  if (!activeGroup) return null;

  return (
    <View style={[styles.badge, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
      <Feather name="layers" size={11} color={colors.primary} />
      <Text style={[styles.text, { color: colors.primary }]} numberOfLines={1}>
        {activeGroup.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 6,
    maxWidth: 200,
  },
  text: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
});
