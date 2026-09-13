// app/index.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Screen } from '../components/Screen';
import { supabase } from '../supabase';
import { registerForPushNotificationsAsync } from '../utils/notifications';

const Theme = {
  background: '#050507',
  surface: '#121217',
  cardBg: 'rgba(22, 22, 30, 0.85)',
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#52525b',
  primary: '#ef4444',
  primaryDark: '#b91c1c',
  accentYellow: '#f59e0b',
  border: '#27272a',
};

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // ============================================================
  // VERIFICAR SESIÓN AL CARGAR LA PANTALLA
  // ============================================================
  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log('🔐 [Index] Verificando sesión...');
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          console.log('✅ [Index] Sesión activa:', session.user.id);
          router.replace('/feed');
          return;
        }
        console.log('❌ [Index] No hay sesión activa');
      } catch (error) {
        console.log('❌ [Index] Error verificando sesión:', error);
      } finally {
        setIsChecking(false);
      }
    };
    checkSession();
  }, []);

  // ============================================================
  // FUNCIONES EXISTENTES (sin cambios)
  // ============================================================
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

  async function clearPushTokenFromOtherUsers(token: string, currentUserId: string) {
    if (!token) return;
    try {
      await supabase
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('expo_push_token', token)
        .neq('id', currentUserId);
    } catch (error) {
      console.log('Error limpiando token push de otros usuarios:', error);
    }
  }

   async function getCurrentLocation(): Promise<{ lat: number; long: number } | null> {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
          });
        });
        return { lat: position.coords.latitude, long: position.coords.longitude };
      } catch {
        return null;
      }
    }

    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        lat: location.coords.latitude,
        long: location.coords.longitude,
      };
    } catch (error) {
      console.log('Error obteniendo GPS:', error);
      return null;
    }
  }

  async function handleSignIn() {
    if (!email.trim() || !password) {
      Alert.alert('Atención', 'Por favor ingresa correo y contraseña.');
      return;
    }

    setLoading(true);
    try {
      await supabase.auth.signOut();

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
        let pointWKT = null;
        if (coords) {
          pointWKT = `SRID=4326;POINT(${coords.long} ${coords.lat})`;
        }

        let pushToken = null;
        if (Platform.OS !== 'web') {
          try {
            pushToken = await registerForPushNotificationsAsync();
          } catch (e) {
            console.log('No se pudo obtener push token:', e);
          }
        }

        if (pushToken) {
          await clearPushTokenFromOtherUsers(pushToken, data.user.id);
        }

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
        const pointWKT = coords
          ? `SRID=4326;POINT(${coords.long} ${coords.lat})`
          : null;

        let pushToken = null;
        if (Platform.OS !== 'web') {
          try {
            pushToken = await registerForPushNotificationsAsync();
          } catch (e) {
            console.log('No se pudo obtener push token:', e);
          }
        }

        if (pushToken) {
          await clearPushTokenFromOtherUsers(pushToken, userId);
        }

       await supabase.from('profiles').upsert({
          id: userId,
          username: username,
          full_name: username,
          ...(pointWKT && { location: pointWKT }),
          avatar_url: '',
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

  // ============================================================
  // MOSTRAR LOADER MIENTRAS VERIFICA SESIÓN
  // ============================================================
  if (isChecking) {
    return (
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Theme.primary} />
        </View>
      </View>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <Screen 
      scroll={true}
      backgroundColor={Theme.background}
      paddingHorizontal={20}
      paddingTop={40}
      paddingBottom={40}
    >
      {/* EFECTOS DE LUZ / GLOW EN EL FONDO */}
      <View style={styles.glowTopLeft} />
      <View style={styles.glowBottomRight} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.innerContainer}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER CON BRANDING POTENTE */}
          <View style={styles.logoContainer}>
            <View style={styles.logoWrapper}>
              <Image
                source={require('../../assets/images/logo/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.badgeTag}>
              <Ionicons name="flash" size={12} color={Theme.accentYellow} style={{ marginRight: 4 }} />
              <Text style={styles.badgeText}>CITAS EN TIEMPO REAL</Text>
            </View>
          </View>

          {/* TARJETA MODERNA SIN BORDES RECARGADOS */}
          <View style={styles.card}>
            <Text style={styles.title}>Conéctate Ahora</Text>
            <Text style={styles.cardSubtitle}>Encuentra gente cerca disponible en este momento</Text>

            {/* INPUT EMAIL */}
            <View style={styles.inputWrapper}>
              <Ionicons name="mail" size={18} color={Theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Correo electrónico"
                placeholderTextColor={Theme.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            {/* INPUT CONTRASEÑA */}
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={18} color={Theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Contraseña"
                placeholderTextColor={Theme.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? "eye-off" : "eye"} size={18} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleForgotPassword}
              disabled={loading}
              style={styles.forgotContainer}
            >
              <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            {/* BOTÓN PRINCIPAL CON DEGRADADO */}
            <TouchableOpacity
              style={[styles.buttonPrimaryWrapper, loading && styles.buttonDisabled]}
              onPress={handleSignIn}
              activeOpacity={0.88}
              disabled={loading || googleLoading}
            >
              <LinearGradient
                colors={['#f43f5e', '#ef4444', '#b91c1c']}
                style={styles.buttonPrimary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {loading ? (
                  <ActivityIndicator color={Theme.textPrimary} />
                ) : (
                  <View style={styles.buttonRow}>
                    <Text style={styles.buttonText}>Iniciar Sesión</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* BOTÓN REGISTRO */}
            <TouchableOpacity
              style={[styles.buttonSecondary, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              activeOpacity={0.8}
              disabled={loading || googleLoading}
            >
              <Text style={styles.buttonSecondaryText}>¿No tienes cuenta? <Text style={styles.highlightText}>Regístrate</Text></Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ============================================================
// ESTILOS
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
    position: 'relative'
  },
  glowTopLeft: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  glowBottomRight: {
    position: 'absolute',
    bottom: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  innerContainer: { flex: 1 },
  scrollContent: { 
    flexGrow: 1, 
    justifyContent: 'center',
  },
  logoContainer: { alignItems: 'center', marginBottom: 28 },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 250,
    height: 140,
    resizeMode: 'contain',
  },
  badgeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 8,
  },
  badgeText: {
    fontSize: 10,
    color: Theme.accentYellow,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: Theme.cardBg,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  title: { fontSize: 24, fontWeight: '800', color: Theme.textPrimary, letterSpacing: -0.3 },
  cardSubtitle: { fontSize: 13, color: Theme.textSecondary, marginBottom: 22, marginTop: 4 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surface,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 15,
    color: Theme.textPrimary,
    fontSize: 15,
  },
  eyeIcon: {
    padding: 4,
  },
  forgotContainer: { alignItems: 'flex-end', marginBottom: 20, marginTop: -2 },
  forgotText: { color: Theme.textMuted, fontSize: 12, fontWeight: '500' },
  buttonPrimaryWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  buttonPrimary: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: { color: Theme.textPrimary, fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  googleButton: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 14,
  },
  buttonSecondary: {
    padding: 12,
    alignItems: 'center',
  },
  buttonSecondaryText: { color: Theme.textSecondary, fontWeight: '500', fontSize: 14 },
  highlightText: { color: Theme.primary, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dividerText: {
    color: Theme.textMuted,
    paddingHorizontal: 12,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});