import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Función para Iniciar Sesión
  async function handleSignUp() {
    if (!email.trim() || !password) {
      Alert.alert('Atención', 'Por favor ingresa correo y contraseña para registrarte.');
      return;
    }

    setLoading(true);

    try {
      console.log('Intentando registrar usuario con:', email.trim());
      const { data, error } = await supabase.auth.signUp({ 
        email: email.trim(), 
        password 
      });

      console.log('Respuesta de Supabase - Data:', data);
      console.log('Respuesta de Supabase - Error:', error);

      if (error) {
        Alert.alert('Error de registro', error.message);
      } else {
        Alert.alert('¡Éxito!', 'Cuenta creada correctamente.');
        if (data?.user) {
          setTimeout(() => {
            router.replace('/feed');
          }, 100);
        }
      }
    } catch (err: any) {
      console.log('Excepción capturada:', err);
      Alert.alert('Error inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }
  // Función para Registrarse (Crear Usuario)
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
      } else {
        Alert.alert('¡Éxito!', 'Cuenta creada correctamente.');
        if (data?.user) {
          setTimeout(() => {
            router.replace('/feed');
          }, 100);
        }
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
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {/* Botón de Iniciar Sesión */}
      <TouchableOpacity 
        style={[styles.buttonPrimary, loading && styles.buttonDisabled]} 
        onPress={handleSignIn} 
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Cargando...' : 'Iniciar Sesión'}</Text>
      </TouchableOpacity>

      {/* Botón de Registrarse */}
      <TouchableOpacity 
        style={[styles.buttonSecondary, loading && styles.buttonDisabled]} 
        onPress={handleSignUp} 
        disabled={loading}
      >
        <Text style={styles.buttonSecondaryText}>Crear una cuenta nueva</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 16 },
  buttonPrimary: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonSecondary: { backgroundColor: '#e1e1e6', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { backgroundColor: '#a0c8ff' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  buttonSecondaryText: { color: '#333', fontWeight: 'bold', fontSize: 16 },
});