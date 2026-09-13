import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Colors } from '../constants/Colors'; // 👈 NUEVO: para usar Colors.primary
import { supabase } from '../supabase';

// ✅ Configurar notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const currentUserIdRef = useRef<string | null>(null);

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // ============================================================
  // 1️⃣ VERIFICAR SESIÓN AL INICIAR LA APP
  // ============================================================
  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log('🔐 Verificando sesión guardada...');

        const { data: { session } } = await supabase.auth.getSession();

        console.log('📱 Sesión:', session?.user?.id || 'No hay sesión');

        if (session?.user) {
          currentUserIdRef.current = session.user.id;

          await supabase
            .from('profiles')
            .update({
              is_online: true,
              last_active: new Date().toISOString(),
            })
            .eq('id', session.user.id);

          router.replace('/feed');
        } else {
          router.replace('/');
        }
      } catch (error) {
        console.error('❌ Error al recuperar sesión:', error);
        router.replace('/');
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  // ============================================================
  // 2️⃣ CONFIGURAR NOTIFICACIONES
  // ============================================================
  useEffect(() => {
    const setupNotifications = async () => {
      if (Platform.OS !== 'web') {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.log('❌ Permiso de notificaciones denegado');
        }
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        console.log('📱 Notificación recibida:', notification);
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('👆 Usuario tocó notificación:', response);

        const data = response.notification.request.content.data;
        if (data?.receiverId) {
          router.push({
            pathname: '/chat',
            params: {
              receiverId: data.receiverId as string,
              receiverName: (data.receiverName as string) || 'Usuario',
            },
          });
        }
      });
    };

    setupNotifications();

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  // ============================================================
  // 3️⃣ ESCUCHAR CAMBIOS DE AUTENTICACIÓN
  // ============================================================
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Cambio en autenticación:', event);

        if (event === 'SIGNED_IN' && session?.user) {
          const userId = session.user.id;
          currentUserIdRef.current = userId;

          await supabase
            .from('profiles')
            .update({
              is_online: true,
              last_active: new Date().toISOString(),
            })
            .eq('id', userId);
        }
        else if (event === 'SIGNED_OUT') {
          const userId = currentUserIdRef.current;
          if (userId) {
            await supabase
              .from('profiles')
              .update({ is_online: false })
              .eq('id', userId);
            currentUserIdRef.current = null;
          }
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // ============================================================
  // 4️⃣ ACTUALIZAR LAST_ACTIVE PERIÓDICAMENTE
  // ============================================================
  useEffect(() => {
    const updateActivity = async () => {
      let activeUserId = currentUserIdRef.current;
      if (!activeUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          activeUserId = user.id;
          currentUserIdRef.current = activeUserId;
        }
      }
      if (activeUserId) {
        await supabase
          .from('profiles')
          .update({ last_active: new Date().toISOString() })
          .eq('id', activeUserId);
      }
    };

    updateActivity();
    const interval = setInterval(updateActivity, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // ============================================================
  // 5️⃣ MOSTRAR LOADER MIENTRAS VERIFICA SESIÓN
  // ============================================================
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="feed" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="chat" />
    </Stack>
  );
}