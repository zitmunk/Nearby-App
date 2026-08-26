import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { supabase } from '../supabase';

export default function FeedScreen() {
  const [activeTab, setActiveTab] = useState<'users' | 'chats'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    fetchMyProfileAvatar();

    if (activeTab === 'users') {
      fetchNearbyUsers();
    } else {
      fetchUserChats();
    }

    // CORRECCIÓN: Canales con identificadores únicos y control de montaje estricto
    const profilesChannel = supabase.channel(`profiles-feed-${Date.now()}`);
    profilesChannel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          if (isMounted && activeTab === 'users') fetchNearbyUsers();
        }
      )
      .subscribe();

    const messagesChannel = supabase.channel(`messages-feed-${Date.now()}`);
    messagesChannel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          if (isMounted && activeTab === 'chats') fetchUserChats();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [activeTab]);

  const fetchMyProfileAvatar = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;
      if (!currentUserId) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url, avatar, photo_url')
        .eq('id', currentUserId)
        .single();

      if (data && !error) {
        const url = data.avatar_url || data.avatar || data.photo_url;
        if (url) {
          setMyAvatarUrl(url.trim());
        }
      }
    } catch (err) {
      console.error('Error fetching my avatar:', err);
    }
  };

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

            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', companionId)
              .single();

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
      </View>

      {errorMessage && <Text style={styles.errorText}>Error: {errorMessage}</Text>}

      {/* CONTENIDO PRINCIPAL */}
      <View style={{ flex: 1, paddingBottom: 70 }}>
        {loading && (users.length === 0 && chats.length === 0) ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
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
                style={[
                  styles.card,
                  item.hasUnread && styles.cardUnreadNeon
                ]}
                activeOpacity={0.9}
                onPress={() => router.push({
                  pathname: '/album',
                  params: { userId: item.id, userName: item.full_name || item.username }
                })}
              >
                <Image 
                  source={{ uri: (item.avatar_url || item.avatar || item.photo_url || '').trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }} 
                  style={styles.avatar} 
                />

                <View style={styles.indicatorsContainer}>
                  <View style={styles.onlineDot} />
                  {item.hasUnread && (
                    <Ionicons name="mail" size={13} color="#22c55e" style={styles.mailIcon} />
                  )}
                </View>

                <View style={styles.overlay}>
                  <Text style={styles.name} numberOfLines={1}>{item.full_name || item.username}</Text>
                  <Text style={styles.distance}>
                    {item.dist_meters != null
                      ? item.dist_meters < 1000 
                        ? `${Math.round(item.dist_meters)} m` 
                        : `${(item.dist_meters / 1000).toFixed(1)} km`
                      : 'Distancia desconocida'}
                  </Text>
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
                  source={{ uri: (item.profile?.avatar_url || item.profile?.avatar || item.profile?.photo_url || '').trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }} 
                  style={styles.chatAvatar} 
                />
                <View style={styles.chatInfo}>
                  <View style={styles.chatHeaderRow}>
                    <Text style={styles.chatName}>{item.profile?.full_name || item.profile?.username || 'Usuario'}</Text>
                    {item.hasUnread && (
                      <Ionicons name="mail" size={16} color="#ef4444" />
                    )}
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

        <TouchableOpacity 
          style={styles.navButton} 
          onPress={() => router.push('/profile')}
          activeOpacity={0.8}
        >
          <Image 
            source={{ uri: myAvatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }} 
            style={styles.navAvatar} 
          />
          <Text style={styles.navText}>Perfil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8, backgroundColor: Colors.background, paddingTop: 50 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  
  columnWrapper: { justifyContent: 'flex-start' },
  card: {
    flex: 1,
    margin: 3,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    aspectRatio: 1,
    maxWidth: '31.3%',
    borderWidth: 1,
    borderColor: '#262626',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    position: 'relative',
  },
  cardUnreadNeon: {
    borderColor: '#22c55e', 
    borderWidth: 2.5,
    elevation: 8,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  avatar: { width: '100%', height: '100%', resizeMode: 'cover' },
  indicatorsContainer: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#22c55e', borderWidth: 1.5, borderColor: Colors.background },
  mailIcon: { textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6, backgroundColor: 'rgba(5, 5, 5, 0.85)' },
  name: { fontSize: 11, fontWeight: 'bold', color: Colors.textPrimary },
  distance: { fontSize: 9, color: Colors.textSecondary, marginTop: 1, fontWeight: '600' },

  chatCard: { flexDirection: 'row', backgroundColor: Colors.surface, padding: 12, borderRadius: 16, marginVertical: 4, alignItems: 'center', borderWidth: 1, borderColor: '#262626' },
  chatAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  chatInfo: { flex: 1 },
  chatHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  chatLastMessage: { fontSize: 13, color: Colors.textSecondary },

  empty: { textAlign: 'center', marginTop: 40, color: Colors.textSecondary, fontSize: 15 },
  errorText: { color: '#ef4444', marginVertical: 10, textAlign: 'center', fontWeight: 'bold' },

  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 65, backgroundColor: Colors.surface, flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#262626', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 5, elevation: 10 },
  navButton: { alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' },
  navButtonActive: { borderTopWidth: 3, borderTopColor: Colors.primary },
  navIcon: { fontSize: 18},
  navAvatar: { width: 22, height: 22, borderRadius: 11, marginBottom: 2, borderWidth: 1, borderColor: Colors.primary },
  navText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500', marginTop: 2 },
  navTextActive: { color: Colors.primary, fontWeight: 'bold' },
});