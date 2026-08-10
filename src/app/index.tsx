import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Función para obtener la ubicación real del celular
  async function getCurrentLocation(): Promise<{ lat: number; long: number } | null> {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return { lat: -20.2642, long: -70.1185 }; // Valor por defecto si deniega el permiso
      }

      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        lat: location.coords.latitude,
        long: location.coords.longitude,
      };
    } catch (error) {
      console.log('Error obteniendo GPS:', error);
      return { lat: -20.2642, long: -70.1185 };
    }
  }

  // Función para Iniciar Sesión
  async function handleSignIn() {
    if (!email.trim() || !password) {
      Alert.alert('Atención', 'Por favor ingresa correo y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email: email.trim(), 
        password 
      });

      if (error) {
        Alert.alert('Error de acceso', error.message);
      } else if (data?.user) {
        // Actualizar ubicación al iniciar sesión
        const coords = await getCurrentLocation();
        if (coords) {
          const pointWKT = `SRID=4326;POINT(${coords.long} ${coords.lat})`;
          await supabase
            .from('profiles')
            .update({ location: pointWKT })
            .eq('id', data.user.id);
        }
        router.replace('/feed');
      }
    } catch (err: any) {
      Alert.alert('Error inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Función para Registrarse (Crea usuario y llena su perfil con ubicación real)
  async function handleSignUp() {
    if (!email.trim() || !password) {
      Alert.alert('Atención', 'Por favor ingresa correo y contraseña para registrarte.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({ 
        email: email.trim(), 
        password 
      });

      if (error) {
        Alert.alert('Error de registro', error.message);
      } else if (data?.user) {
        const userId = data.user.id;
        const username = email.split('@')[0];

        // Obtener coordenadas reales del dispositivo
        const coords = await getCurrentLocation();
        const lat = coords ? coords.lat : -20.2642;
        const long = coords ? coords.long : -70.1185;
        const pointWKT = `SRID=4326;POINT(${long} ${lat})`;

        // Insertar perfil completo en la tabla profiles
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: userId,
          username: username,
          full_name: username,
          location: pointWKT,
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'
        });

        if (profileError) {
          console.log('Error creando perfil:', profileError.message);
        }

        Alert.alert('¡Éxito!', 'Cuenta y perfil creados correctamente.');
        router.replace('/feed');
      }
    } catch (err: any) {
      Alert.alert('Error inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bienvenido</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        placeholderTextColor="#9ca3af"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor="#9ca3af"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {/* Botón de Iniciar Sesión */}
      <TouchableOpacity 
        style={[styles.buttonPrimary, loading && styles.buttonDisabled]} 
        onPress={handleSignIn} 
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>{loading ? 'Cargando...' : 'Iniciar Sesión'}</Text>
      </TouchableOpacity>

      {/* Botón de Registrarse */}
      <TouchableOpacity 
        style={[styles.buttonSecondary, loading && styles.buttonDisabled]} 
        onPress={handleSignUp} 
        activeOpacity={0.7}
      >
        <Text style={styles.buttonSecondaryText}>{loading ? 'Cargando...' : 'Crear una cuenta nueva'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center', color: '#1f2937' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 16, color: '#1f2937', backgroundColor: '#fff' },
  buttonPrimary: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonSecondary: { backgroundColor: '#e1e1e6', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  buttonSecondaryText: { color: '#333', fontWeight: 'bold', fontSize: 16 },
});