import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';
import { registerForPushNotificationsAsync } from '../utils/notifications'; // <-- Importamos la función de notificaciones

const Theme = {
  background: '#0a0a0a',
  surface: '#171717',
  textPrimary: '#ffffff',
  textSecondary: '#a3a3a3',
  textMuted: '#737373',
  primary: '#ef4444',
  secondaryBg: '#1e1b1b',
  border: '#292524',
};

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
        // 1. Obtener ubicación actual
        const coords = await getCurrentLocation();
        let pointWKT = null;
        if (coords) {
          pointWKT = `SRID=4326;POINT(${coords.long} ${coords.lat})`;
        }

        // 2. Obtener el Push Token de Notificaciones
        const pushToken = await registerForPushNotificationsAsync();

        // 3. Actualizar ubicación y token en la base de datos simultáneamente
        await supabase
          .from('profiles')
          .update({ 
            ...(pointWKT && { location: pointWKT }),
            ...(pushToken && { expo_push_token: pushToken })
          })
          .eq('id', data.user.id);

        await checkOnboardingAndRedirect(data.user.id);
      }
    } catch (err: any) {
      Alert.alert('Error inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }

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
        let username = email.split('@')[0];
        if (username.length < 3) username = username + 'user';

        const coords = await getCurrentLocation();
        const lat = coords ? coords.lat : -20.2642;
        const long = coords ? coords.long : -70.1185;
        const pointWKT = `SRID=4326;POINT(${long} ${lat})`;

        // Obtener Push Token también en el registro
        const pushToken = await registerForPushNotificationsAsync();

        await supabase.from('profiles').upsert({
          id: userId,
          username: username,
          full_name: username,
          location: pointWKT,
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
          onboarding_completed: false,
          ...(pushToken && { expo_push_token: pushToken }),
        });

        Alert.alert('¡Éxito!', 'Cuenta creada correctamente.');
        router.replace('/onboarding');
      }
    } catch (err: any) {
      Alert.alert('Error inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('Atención', 'Por favor ingresa tu correo electrónico primero.');
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
        Alert.alert('Correo enviado', 'Revisa tu bandeja de entrada.');
      }
    } catch (err: any) {
      Alert.alert('Error inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[Theme.background, Theme.secondaryBg]} style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.innerContainer}
      >
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../assets/images/logo/logo.png')}
            style={styles.logoImage} 
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>Conéctate al instante ⚡</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Bienvenido</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Correo electrónico"
            placeholderTextColor={Theme.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor={Theme.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity 
            style={[styles.buttonPrimary, loading && styles.buttonDisabled]} 
            onPress={handleSignIn} 
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Theme.textPrimary} />
            ) : (
              <Text style={styles.buttonText}>Iniciar Sesión</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.buttonSecondary, loading && styles.buttonDisabled]} 
            onPress={handleSignUp} 
            activeOpacity={0.8}
            disabled={loading}
          >
            <Text style={styles.buttonSecondaryText}>Crear una cuenta nueva</Text>
          </TouchableOpacity>

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
  container: { flex: 1, backgroundColor: Theme.background },
  innerContainer: { flex: 1, justifyContent: 'center', padding: 20 },
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  logoImage: {
    width: 200,
    height: 80,
    resizeMode: 'contain',
  },
  subtitle: { fontSize: 15, color: Theme.textSecondary, marginTop: 14, fontWeight: '500', letterSpacing: 0.5 },
  card: { 
    backgroundColor: Theme.surface, 
    borderRadius: 24, 
    padding: 24, 
    borderWidth: 1,
    borderColor: Theme.border,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.4, 
    shadowRadius: 15, 
    elevation: 8 
  },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: Theme.textPrimary },
  input: { 
    backgroundColor: Theme.background, 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderRadius: 14, 
    marginBottom: 16, 
    color: Theme.textPrimary, 
    fontSize: 16,
    borderWidth: 1,
    borderColor: Theme.border
  },
  buttonPrimary: { 
    backgroundColor: Theme.primary, 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginBottom: 12,
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4
  },
  buttonSecondary: { 
    backgroundColor: Theme.secondaryBg, 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.border
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Theme.textPrimary, fontWeight: 'bold', fontSize: 16 },
  buttonSecondaryText: { color: '#ef4444', fontWeight: 'bold', fontSize: 16 },
  forgotContainer: { marginTop: 16, alignItems: 'center' },
  forgotText: { color: Theme.textSecondary, fontSize: 14, fontWeight: '500' },
});