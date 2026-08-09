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

    // Coordenadas fijas para pruebas en PC (Alto Hospicio / Iquique)
    const lat = -20.2642;
    const long = -70.1185;
    const radiusMeters = 50000; // 50 km

    console.log("Buscando usuarios cercanos para el Feed...");

    const { data, error } = await supabase.rpc('get_nearby_users', {
      lat: lat,
      long: long,
      radius_meters: radiusMeters,
    });

    if (error) {
      console.error('Error al obtener usuarios:', error.message);
      setErrorMessage(error.message);
    } else {
      console.log('Usuarios recibidos:', data);
      setUsers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNearbyUsers();
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

      {loading ? (
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
              <Image 
                source={{ 
                  uri: item.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100' 
                }} 
                style={styles.avatar} 
              />
              
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
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12, backgroundColor: '#e1e4e8' },
  userInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: '600', color: '#222' },
  distance: { fontSize: 14, color: '#007AFF', marginTop: 4, fontWeight: '500' },
  empty: { textAlign: 'center', marginTop: 30, color: '#888', fontSize: 16 },
  errorText: { color: 'red', marginVertical: 10, textAlign: 'center', fontWeight: 'bold' },
});