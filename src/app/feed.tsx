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
      // 1. Obtener la ubicación real del celular actual
      let { status } = await Location.requestForegroundPermissionsAsync();
      let lat = -20.2642; // Coordenada por defecto (Alto Hospicio/Iquique)
      let long = -70.1185;

      if (status === 'granted') {
        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = location.coords.latitude;
        long = location.coords.longitude;
      }

      const radiusMeters = 50000; // 50 km

      // 2. Obtener el usuario actual para excluirlo del listado
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;

      // 3. Consultar la función RPC de usuarios cercanos
      const { data, error } = await supabase.rpc('get_nearby_users', {
        lat: lat,
        long: long,
        radius_meters: radiusMeters,
      });

      if (error) {
        console.error('Error al obtener usuarios:', error.message);
        setErrorMessage(error.message);
      } else {
        // Filtrar para excluir al usuario logueado actual
        const filteredUsers = (data || []).filter((item: any) => item.id !== currentUserId);

        // 4. Verificar si cada usuario tiene mensajes no leídos dirigidos a mí
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
      console.error('Error inesperado al buscar ubicación/usuarios:', err);
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNearbyUsers();

    // Suscripción en tiempo real: Se actualiza solo si hay cambios en la tabla profiles
    const channel = supabase
      .channel('public:profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          console.log('¡Cambio detectado en perfiles! Actualizando lista...');
          fetchNearbyUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Usuarios Cercanos</Text>

      <TouchableOpacity style={styles.button} onPress={fetchNearbyUsers}>
        <Text style={styles.buttonText}>Actualizar Lista</Text>
      </TouchableOpacity>

      {errorMessage && (
        <Text style={styles.errorText}>Error Supabase: {errorMessage}</Text>
      )}

      {loading && users.length === 0 ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.empty}>No hay usuarios conectados cerca de ti en este momento.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.card}
              onPress={() => router.push({
                pathname: '/chat',
                params: { receiverId: item.id, receiverName: item.full_name || item.username }
              })}
            >
              {/* Contenedor del avatar con el punto rojo condicional */}
              <View style={styles.avatarContainer}>
                <Image 
                  source={{ 
                    uri: item.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100' 
                  }} 
                  style={styles.avatar} 
                />
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
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  button: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#fff', borderRadius: 8, marginVertical: 6, borderWidth: 1, borderColor: '#ddd' },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#e1e4e8' },
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