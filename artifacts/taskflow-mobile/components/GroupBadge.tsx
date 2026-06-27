import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export function GroupBadge() {
  const { groups, activeGroupId, switchGroup } = useAuth();
  const colors = useColors();
  const queryClient = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<number | null>(null);

  if (groups.length <= 1) return null;

  const activeGroup = groups.find(g => g.id === activeGroupId);
  if (!activeGroup) return null;

  async function handleSwitch(groupId: number) {
    if (groupId === activeGroupId || switchingId !== null) return;
    setSwitchingId(groupId);
    try {
      await switchGroup(groupId);
      queryClient.clear();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSheetOpen(false);
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.badge, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
        onPress={() => setSheetOpen(true)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="layers" size={11} color={colors.primary} />
        <Text style={[styles.text, { color: colors.primary }]} numberOfLines={1}>
          {activeGroup.name}
        </Text>
        <Feather name="chevron-down" size={10} color={colors.primary} />
      </TouchableOpacity>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => switchingId === null && setSheetOpen(false)}
        >
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
              Platform.OS === 'web' && styles.sheetWeb,
            ]}
          >
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Switch Group</Text>
              <TouchableOpacity
                onPress={() => setSheetOpen(false)}
                disabled={switchingId !== null}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Group list */}
            {groups.map((g, i) => {
              const isPending = !!g.pendingApproval;
              const isActive = g.id === activeGroupId;
              const isSwitching = switchingId === g.id;

              if (isPending) {
                return (
                  <View
                    key={g.id}
                    style={[
                      styles.groupRow,
                      i < groups.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      { opacity: 0.5 },
                    ]}
                  >
                    <View style={[styles.groupIcon, { backgroundColor: '#F59E0B20' }]}>
                      <Feather name="clock" size={18} color="#F59E0B" />
                    </View>
                    <View style={styles.groupLabel}>
                      <Text style={[styles.groupName, { color: colors.foreground }]}>{g.name}</Text>
                      <Text style={[styles.groupRole, { color: colors.mutedForeground }]}>{g.role}</Text>
                    </View>
                    <View style={styles.pendingPill}>
                      <Text style={styles.pendingText}>Pending</Text>
                    </View>
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={g.id}
                  style={[
                    styles.groupRow,
                    i < groups.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    isActive && { backgroundColor: colors.primary + '08' },
                    switchingId !== null && !isSwitching && { opacity: 0.5 },
                  ]}
                  onPress={() => handleSwitch(g.id)}
                  disabled={isActive || switchingId !== null}
                  activeOpacity={0.7}
                >
                  <View style={[styles.groupIcon, { backgroundColor: isActive ? colors.primary + '20' : colors.background }]}>
                    <Feather name="layers" size={18} color={isActive ? colors.primary : colors.mutedForeground} />
                  </View>
                  <View style={styles.groupLabel}>
                    <Text style={[styles.groupName, { color: colors.foreground, fontWeight: isActive ? '600' : '400' }]}>
                      {g.name}
                    </Text>
                    <Text style={[styles.groupRole, { color: colors.mutedForeground }]}>{g.role}</Text>
                  </View>
                  {isSwitching ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : isActive ? (
                    <Feather name="check-circle" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
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
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: 34,
    overflow: 'hidden',
  },
  sheetWeb: {
    maxWidth: 480,
    alignSelf: 'center' as any,
    width: '100%',
    borderRadius: 20,
    marginBottom: 40,
    borderBottomWidth: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupLabel: {
    flex: 1,
  },
  groupName: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#000',
  },
  groupRole: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
    textTransform: 'capitalize',
  },
  pendingPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#F59E0B50',
  },
  pendingText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '600' as const,
  },
});
