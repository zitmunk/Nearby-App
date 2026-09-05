import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { supabase } from '../supabase';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBlockedUsers();
  }, []);

  // Retroceso seguro para evitar cierres o advertencias en web
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/profile');
    }
  };

  const fetchBlockedUsers = async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;
      if (!currentUserId) return;

      // 1. Obtener los registros de la tabla blocks donde tú eres el blocker
      const { data: blocksData, error: blocksError } = await supabase
        .from('blocks')
        .select('id, blocked_id')
        .eq('blocker_id', currentUserId);

      if (blocksError) throw blocksError;

      if (!blocksData || blocksData.length === 0) {
        setBlockedUsers([]);
        setLoading(false);
        return;
      }

      // 2. Extraer los IDs de los usuarios bloqueados
      const blockedIds = blocksData.map((b) => b.blocked_id);

      // 3. Obtener los perfiles de esos usuarios
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', blockedIds);

      if (profilesError) throw profilesError;

      setBlockedUsers(profilesData || []);
    } catch (error: any) {
      console.error('Error al cargar bloqueados:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const unblockUserInSupabase = async (userIdToUnblock: string) => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;
      if (!currentUserId) return;

      // Eliminar el registro de la tabla blocks
      const { error } = await supabase
        .from('blocks')
        .delete()
        .match({ blocker_id: currentUserId, blocked_id: userIdToUnblock });

      if (error) {
        if (Platform.OS === 'web') {
          window.alert('No se pudo desbloquear al usuario.');
        } else {
          Alert.alert('Error', 'No se pudo desbloquear al usuario.');
        }
      } else {
        // Actualizar la lista localmente
        setBlockedUsers((prev) => prev.filter((user) => user.id !== userIdToUnblock));
      }
    } catch (err: any) {
      console.error('Error al desbloquear:', err);
    }
  };

  const handleUnblock = (userIdToUnblock: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('¿Deseas permitir que este usuario vuelva a interactuar contigo?');
      if (confirmed) {
        unblockUserInSupabase(userIdToUnblock);
      }
    } else {
      Alert.alert(
        'Desbloquear usuario',
        '¿Deseas permitir que este usuario vuelva a interactuar contigo?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Desbloquear',
            onPress: () => unblockUserInSupabase(userIdToUnblock),
          },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary || '#FFFFFF'} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Usuarios Bloqueados</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No tienes ningún usuario bloqueado.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              <Image
                source={{
                  uri: (item.avatar_url || '').trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300',
                }}
                style={styles.avatar}
              />
              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>
                  {item.full_name || item.username || 'Usuario'}
                </Text>
                <Text style={styles.userSub}>Bloqueado</Text>
              </View>
              <TouchableOpacity
                style={styles.unblockButton}
                onPress={() => handleUnblock(item.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.unblockButtonText}>Desbloquear</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    backgroundColor: Colors.surface,
  },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
  listContainer: { padding: 16 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#262626',
  },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
  userSub: { fontSize: 12, color: '#ff4444' },
  unblockButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  unblockButtonText: { color: Colors.primary, fontSize: 12, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: Colors.textSecondary, marginTop: 40, fontSize: 14 },
});