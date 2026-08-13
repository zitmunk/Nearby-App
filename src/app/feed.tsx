import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function FeedScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

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

  useEffect(() => {
    fetchNearbyUsers();
    const channel = supabase
      .channel('public:profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchNearbyUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Usuarios Cercanos</Text>
        <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/profile')}>
          <Text style={styles.profileButtonText}>Mi Perfil ⚙️</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={fetchNearbyUsers}>
        <Text style={styles.buttonText}>Actualizar Lista</Text>
      </TouchableOpacity>

      {errorMessage && <Text style={styles.errorText}>Error: {errorMessage}</Text>}

      {loading && users.length === 0 ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No hay nadie cerca por ahora.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.card}
              onPress={() => router.push({
                pathname: '/chat',
                params: { receiverId: item.id, receiverName: item.full_name || item.username }
              })}
            >
              <View style={styles.avatarContainer}>
                <Image 
                  source={{ uri: item.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100' }} 
                  style={styles.avatar} 
                />
                {/* Punto Verde: Indica disponibilidad (online) */}
                <View style={styles.onlineDot} />
                {/* Punto Rojo: Indica mensajes no leídos */}
                {item.hasUnread && <View style={styles.redDot} />}
              </View>
              
              <View style={styles.userInfo}>
                <Text style={styles.name}>{item.full_name || item.username}</Text>
                <Text style={styles.distance}>
                  📍 A {(item.dist_meters / 1000).toFixed(1)} km - Toca para chatear
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5', paddingTop: 50 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1f2937' },
  profileButton: { backgroundColor: '#e5e7eb', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  profileButtonText: { color: '#374151', fontWeight: 'bold', fontSize: 14 },
  button: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#fff', borderRadius: 8, marginVertical: 6, borderWidth: 1, borderColor: '#ddd' },
  avatarContainer: { position: 'relative', marginRight: 15 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#e1e4e8' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#fff',
  },
  redDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: '#fff',
  },
  userInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: '600', color: '#222' },
  distance: { fontSize: 14, color: '#007AFF', marginTop: 4, fontWeight: '500' },
  empty: { textAlign: 'center', marginTop: 30, color: '#888', fontSize: 16 },
  errorText: { color: 'red', marginVertical: 10, textAlign: 'center', fontWeight: 'bold' },
});