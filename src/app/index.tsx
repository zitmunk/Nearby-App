import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Función para verificar si el usuario ya completó el onboarding
  async function checkOnboardingAndRedirect(userId: string) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', userId)
        .single();

      if (error || !profile || !profile.onboarding_completed) {
        router.replace('/onboarding');
      } else {
        router.replace('/feed');
      }
    } catch (err) {
      router.replace('/feed');
    }
  }

  // Función para obtener la ubicación real del celular
  async function getCurrentLocation(): Promise<{ lat: number; long: number } | null> {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return { lat: -20.2642, long: -70.1185 }; 
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

  // Función para Iniciar Sesión con validación estricta de errores
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
        let errorMessage = 'El correo electrónico no existe o la contraseña es incorrecta.';
        
        if (!error.message.includes('Invalid login credentials') && !error.message.includes('Invalid grant')) {
          errorMessage = error.message;
        }

        Alert.alert('Acceso denegado', errorMessage);
      } else if (data?.user) {
        const coords = await getCurrentLocation();
        if (coords) {
          const pointWKT = `SRID=4326;POINT(${coords.long} ${coords.lat})`;
          await supabase
            .from('profiles')
            .update({ location: pointWKT })
            .eq('id', data.user.id);
        }
        
        await checkOnboardingAndRedirect(data.user.id);
      }
    } catch (err: any) {
      Alert.alert('Error inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Función para Registrarse
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

        const coords = await getCurrentLocation();
        const lat = coords ? coords.lat : -20.2642;
        const long = coords ? coords.long : -70.1185;
        const pointWKT = `SRID=4326;POINT(${long} ${lat})`;

        const { error: profileError } = await supabase.from('profiles').upsert({
          id: userId,
          username: username,
          full_name: username,
          location: pointWKT,
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
          onboarding_completed: false,
        });

        if (profileError) {
          console.log('Error creando perfil:', profileError.message);
        }

        Alert.alert('¡Éxito!', 'Cuenta creada correctamente.');
        router.replace('/onboarding');
      }
    } catch (err: any) {
      Alert.alert('Error inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Función para Restablecer Contraseña
  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('Atención', 'Por favor ingresa tu correo electrónico primero para restablecer tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'now://reset-password',
      });

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Correo enviado', 'Revisa tu bandeja de entrada para restablecer tu contraseña.');
      }
    } catch (err: any) {
      Alert.alert('Error inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#090d16', '#1e293b']} style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.innerContainer}
      >
        {/* LOGO Y MARCA MODERNA */}
        <View style={styles.logoContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logo}>N·O·W</Text>
          </View>
          <Text style={styles.subtitle}>Conéctate al instante ⚡</Text>
        </View>

        {/* TARJETA DE FORMULARIO */}
        <View style={styles.card}>
          <Text style={styles.title}>Bienvenido</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Correo electrónico"
            placeholderTextColor="#94a3b8"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor="#94a3b8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* Botón de Iniciar Sesión */}
          <TouchableOpacity 
            style={[styles.buttonPrimary, loading && styles.buttonDisabled]} 
            onPress={handleSignIn} 
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Iniciar Sesión</Text>
            )}
          </TouchableOpacity>

          {/* Botón de Registrarse */}
          <TouchableOpacity 
            style={[styles.buttonSecondary, loading && styles.buttonDisabled]} 
            onPress={handleSignUp} 
            activeOpacity={0.8}
            disabled={loading}
          >
            <Text style={styles.buttonSecondaryText}>Crear una cuenta nueva</Text>
          </TouchableOpacity>

          {/* Botón de ¿Olvidaste tu contraseña? */}
          <TouchableOpacity 
            onPress={handleForgotPassword} 
            disabled={loading}
            style={styles.forgotContainer}
          >
            <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  innerContainer: { flex: 1, justifyContent: 'center', padding: 20 },
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  logoBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logo: { 
    fontSize: 44, 
    fontWeight: '900', 
    color: '#38bdf8', 
    letterSpacing: 8,
    textShadowColor: 'rgba(56, 189, 248, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: { fontSize: 15, color: '#94a3b8', marginTop: 10, fontWeight: '500', letterSpacing: 0.5 },
  card: { 
    backgroundColor: '#111827', 
    borderRadius: 24, 
    padding: 24, 
    borderWidth: 1,
    borderColor: '#1f2937',
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.4, 
    shadowRadius: 15, 
    elevation: 8 
  },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#f9fafb' },
  input: { 
    backgroundColor: '#1f2937', 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderRadius: 14, 
    marginBottom: 16, 
    color: '#f9fafb', 
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151'
  },
  buttonPrimary: { 
    backgroundColor: '#0284c7', 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginBottom: 12,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4
  },
  buttonSecondary: { 
    backgroundColor: '#1e293b', 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151'
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  buttonSecondaryText: { color: '#38bdf8', fontWeight: 'bold', fontSize: 16 },
  forgotContainer: { marginTop: 16, alignItems: 'center' },
  forgotText: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },
});