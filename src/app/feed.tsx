import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function FeedScreen() {
  const [activeTab, setActiveTab] = useState<'users' | 'chats'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (activeTab === 'users') {
      fetchNearbyUsers();
    } else {
      fetchUserChats();
    }

    const channel = supabase
      .channel('public:profiles_and_messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        if (activeTab === 'users') fetchNearbyUsers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        if (activeTab === 'chats') fetchUserChats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab]);

  const fetchNearbyUsers = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      let lat = -20.2642; 
      let long = -70.1185;

      if (status === 'granted') {
        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = location.coords.latitude;
        long = location.coords.longitude;
      }

      const radiusMeters = 50000; 

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;

      const { data, error } = await supabase.rpc('get_nearby_users', {
        lat: lat,
        long: long,
        radius_meters: radiusMeters,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        const filteredUsers = (data || []).filter((item: any) => item.id !== currentUserId);

        const usersWithUnreadStatus = await Promise.all(
          filteredUsers.map(async (user: any) => {
            const { count } = await supabase
              .from('messages')
              .select('*', { count: 'exact', head: true })
              .eq('sender_id', user.id)
              .eq('receiver_id', currentUserId)
              .eq('is_read', false);

            return {
              ...user,
              hasUnread: (count || 0) > 0,
            };
          })
        );

        setUsers(usersWithUnreadStatus);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserChats = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;
      if (!currentUserId) return;

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      if (error) {
        setErrorMessage(error.message);
      } else if (data) {
        const companionIds = new Set();
        const uniqueChats: any[] = [];
        
        for (const msg of data) {
          const companionId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
          if (!companionIds.has(companionId)) {
            companionIds.add(companionId);

            // Obtener información del perfil del compañero de chat
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', companionId)
              .single();

            // Verificar si hay mensajes no leídos de este usuario
            const { count } = await supabase
              .from('messages')
              .select('*', { count: 'exact', head: true })
              .eq('sender_id', companionId)
              .eq('receiver_id', currentUserId)
              .eq('is_read', false);

            uniqueChats.push({
              companionId,
              profile: profileData || {},
              lastMessage: msg.content,
              time: msg.created_at,
              hasUnread: (count || 0) > 0,
            });
          }
        }
        setChats(uniqueChats);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* CABECERA */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>{activeTab === 'users' ? 'Usuarios Cerca' : 'Mis Chats'}</Text>
        <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/profile')} activeOpacity={0.8}>
          <Text style={styles.profileButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {errorMessage && <Text style={styles.errorText}>Error: {errorMessage}</Text>}

      {/* CONTENIDO PRINCIPAL */}
      <View style={{ flex: 1, paddingBottom: 70 }}>
        {loading && (users.length === 0 && chats.length === 0) ? (
          <ActivityIndicator size="large" color="#38bdf8" style={{ marginTop: 20 }} />
        ) : activeTab === 'users' ? (
          <FlatList
            key="grid-3"
            data={users}
            keyExtractor={(item) => item.id}
            numColumns={3}
            columnWrapperStyle={styles.columnWrapper}
            ListEmptyComponent={<Text style={styles.empty}>No hay nadie cerca por ahora.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => router.push({
                  pathname: '/chat',
                  params: { receiverId: item.id, receiverName: item.full_name || item.username }
                })}
              >
                <Image 
                  source={{ uri: item.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }} 
                  style={styles.avatar} 
                />

                <View style={styles.indicatorsContainer}>
                  <View style={styles.onlineDot} />
                  {item.hasUnread && <View style={styles.redDot} />}
                </View>

                <View style={styles.overlay}>
                  <Text style={styles.name} numberOfLines={1}>{item.full_name || item.username}</Text>
                  <Text style={styles.distance}>{(item.dist_meters / 1000).toFixed(1)} km</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(item) => item.companionId}
            ListEmptyComponent={<Text style={styles.empty}>Aún no tienes chats activos.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.chatCard}
                activeOpacity={0.9}
                onPress={() => router.push({
                  pathname: '/chat',
                  params: { receiverId: item.companionId, receiverName: item.profile?.full_name || item.profile?.username || 'Chat' }
                })}
              >
                <Image 
                  source={{ uri: item.profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }} 
                  style={styles.chatAvatar} 
                />
                <View style={styles.chatInfo}>
                  <View style={styles.chatHeaderRow}>
                    <Text style={styles.chatName}>{item.profile?.full_name || item.profile?.username || 'Usuario'}</Text>
                    {item.hasUnread && <View style={styles.redDotLarge} />}
                  </View>
                  <Text style={styles.chatLastMessage} numberOfLines={1}>{item.lastMessage}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* MENÚ INFERIOR FIJO */}
      <View style={styles.bottomNav}>
        <TouchableOpacity 
          style={[styles.navButton, activeTab === 'users' && styles.navButtonActive]} 
          onPress={() => setActiveTab('users')}
          activeOpacity={0.8}
        >
          <Text style={styles.navIcon}>🟢</Text>
          <Text style={[styles.navText, activeTab === 'users' && styles.navTextActive]}>Conectados</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navButton, activeTab === 'chats' && styles.navButtonActive]} 
          onPress={() => setActiveTab('chats')}
          activeOpacity={0.8}
        >
          <Text style={styles.navIcon}>💬</Text>
          <Text style={[styles.navText, activeTab === 'chats' && styles.navTextActive]}>Mis Chats</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8, backgroundColor: '#090d16', paddingTop: 50 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#f9fafb' },
  profileButton: { backgroundColor: '#111827', padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#1f2937' },
  profileButtonText: { color: '#f8fafc', fontWeight: 'bold', fontSize: 14 },
  
  columnWrapper: { justifyContent: 'flex-start' },
  card: {
    flex: 1,
    margin: 3,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111827',
    aspectRatio: 1,
    maxWidth: '31.3%',
    borderWidth: 1,
    borderColor: '#1f2937',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    position: 'relative',
  },
  avatar: { width: '100%', height: '100%', resizeMode: 'cover' },
  indicatorsContainer: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#22c55e', borderWidth: 1.5, borderColor: '#090d16' },
  redDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#ef4444', borderWidth: 1.5, borderColor: '#090d16' },
  redDotLarge: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6, backgroundColor: 'rgba(9, 13, 22, 0.8)' },
  name: { fontSize: 11, fontWeight: 'bold', color: '#f9fafb' },
  distance: { fontSize: 9, color: '#94a3b8', marginTop: 1, fontWeight: '600' },

  // Estilos para la lista de chats
  chatCard: { flexDirection: 'row', backgroundColor: '#111827', padding: 12, borderRadius: 16, marginVertical: 4, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  chatAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  chatInfo: { flex: 1 },
  chatHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: { fontSize: 15, fontWeight: 'bold', color: '#f9fafb' },
  chatLastMessage: { fontSize: 13, color: '#94a3b8' },

  empty: { textAlign: 'center', marginTop: 40, color: '#94a3b8', fontSize: 15 },
  errorText: { color: '#f87171', marginVertical: 10, textAlign: 'center', fontWeight: 'bold' },

  // Menú inferior fijo
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 65, backgroundColor: '#111827', flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1f2937', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 5, elevation: 10 },
  navButton: { alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' },
  navButtonActive: { borderTopWidth: 3, borderTopColor: '#38bdf8' },
  navIcon: { fontSize: 18 },
  navText: { fontSize: 11, color: '#94a3b8', fontWeight: '500', marginTop: 2 },
  navTextActive: { color: '#38bdf8', fontWeight: 'bold' },
});