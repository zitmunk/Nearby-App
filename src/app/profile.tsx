import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function ProfileScreen() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [birthDate, setBirthDate] = useState(''); // Formato YYYY-MM-DD
  const [loading, setLoading] = useState(false);

  // Obtener y guardar la ubicación GPS actual en Supabase
  async function updateLocation() {
    setLoading(true);

    // 1. Solicitar permisos de ubicación al celular
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se requiere acceso a la ubicación para calcular distancias.');
      setLoading(false);
      return;
    }

    // 2. Obtener las coordenadas GPS actuales
    const location = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = location.coords;

    // 3. Obtener el usuario autenticado actualmente
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Error', 'No hay sesión activa.');
      setLoading(false);
      return;
    }

    // 4. Actualizar la ubicación Point y los datos en la tabla profiles
    const pointLocation = `POINT(${longitude} ${latitude})`;

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName,
        username: username,
        birth_date: birthDate,
        location: pointLocation,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      Alert.alert('Error al guardar', error.message);
    } else {
      Alert.alert('¡Perfil actualizado!', 'Tus datos y ubicación GPS se guardaron correctamente.');
    }

    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mi Perfil</Text>

      <Text style={styles.label}>Nombre Completo:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Juan Pérez"
        value={fullName}
        onChangeText={setFullName}
      />

      <Text style={styles.label}>Nombre de Usuario:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: juanp"
        value={username}
        onChangeText={setUsername}
      />

      <Text style={styles.label}>Fecha de Nacimiento (AAAA-MM-DD):</Text>
      <TextInput
        style={styles.input}
        placeholder="1995-05-20"
        value={birthDate}
        onChangeText={setBirthDate}
      />

      <TouchableOpacity style={styles.button} onPress={updateLocation} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Guardar y Actualizar GPS</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 14, color: '#333', marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 16 },
  button: { backgroundColor: '#28a745', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});