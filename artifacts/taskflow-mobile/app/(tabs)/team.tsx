import React from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  RefreshControl, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListUsers } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  owner: { bg: '#8B5CF620', text: '#8B5CF6' },
  deputy: { bg: '#4F6EF720', text: '#4F6EF7' },
  member: { bg: '#64748B20', text: '#64748B' },
};

export default function TeamScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const { data: users, isLoading, refetch } = useListUsers();

  const topPadding = Platform.OS === 'web' ? 67 : insets.top + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Team</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.countText, { color: colors.mutedForeground }]}>
            {users?.length ?? 0} members
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={users ?? []}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 },
          ]}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const roleStyle = ROLE_COLORS[item.role] ?? ROLE_COLORS.member;
            const isYou = item.id === currentUser?.id;
            return (
              <View style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {item.fullName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: colors.foreground }]}>
                      {item.fullName}
                    </Text>
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
                    <View style={styles.inactiveDot}>
                      <Feather name="slash" size={14} color="#EF4444" />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No team members</Text>
            </View>
          }
          scrollEnabled={!!(users && users.length > 0)}
        />
      )}
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
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  youBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  youText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  mobile: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  roleText: { fontSize: 12, fontWeight: '500' as const, fontFamily: 'Inter_500Medium', textTransform: 'capitalize' },
  inactiveDot: {},
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
});
