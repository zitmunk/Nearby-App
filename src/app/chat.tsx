import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { supabase } from '../supabase';

const isLoadingMore = useRef(false);
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 🔥 Duración de fotos efímeras (en segundos)
const EPHEMERAL_DURATION = 10;

export default function ChatScreen() {

  const [photoTimer, setPhotoTimer] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const { receiverId, receiverName } = useLocalSearchParams();
  const router = useRouter();

  const receiverIdString = Array.isArray(receiverId)
    ? receiverId[0]
    : receiverId;

  const receiverNameString = Array.isArray(receiverName)
    ? receiverName[0]
    : receiverName;

  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // PERFIL DEL RECEPTOR
  const [receiverAvatar, setReceiverAvatar] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [receiverProfileData, setReceiverProfileData] = useState<any>(null);
  const [receiverPhotos, setReceiverPhotos] = useState<string[]>([]);
  const [receiverStatus, setReceiverStatus] = useState<string>('');

  // DISTANCIA
  const [userDistance, setUserDistance] = useState<string | null>(null);

  // AUDIO
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTimer, setRecordingTimer] = useState<ReturnType<typeof setInterval> | null>(null);
  const MAX_RECORDING_DURATION = 60;
  const dotOpacity = useRef(new Animated.Value(1)).current;

  const audioPlayerRef = useRef<any>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // IMÁGENES
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // CHAT
  const [isTyping, setIsTyping] = useState(false);
  const [isDisappearing, setIsDisappearing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const initialMessagesLoadedRef = useRef(false);

  // AUTO SCROLL
  const flatListRef = useRef<FlatList>(null);
  const scrollOffsetRef = useRef(0);

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);
    }
  };

  // AVATAR DEL USUARIO ACTUAL
  const [myAvatar, setMyAvatar] = useState<string | null>(null);

  // LIVE LOCATION
  const [isLiveLocationActive, setIsLiveLocationActive] = useState(false);
  const liveLocationWatcher = useRef<Location.LocationSubscription | null>(null);
  const liveLocationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ACCIONES DE UBICACIÓN
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [showLocationActions, setShowLocationActions] = useState(false);

  // ============================================================
  // NAVEGACIÓN
  // ============================================================
  const handleGoBack = () => {
    router.replace('/feed');
  };

  useEffect(() => {
    const backAction = () => {
      handleGoBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  // ============================================================
  // PERFIL Y DISTANCIA
  // ============================================================
  useEffect(() => {
    const fetchReceiverProfileAndDistance = async () => {
      if (!receiverIdString) return;
      try {
        const { data: receiverProfile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', receiverIdString)
          .single();

        if (!error && receiverProfile) {
          setReceiverProfileData(receiverProfile);
          if (
            receiverProfile.avatar_url &&
            receiverProfile.avatar_url !== 'EMPTY' &&
            receiverProfile.avatar_url.startsWith('http')
          ) {
            setReceiverAvatar(receiverProfile.avatar_url);
          } else {
            setReceiverAvatar(null);
          }
          if (receiverProfile.photos && Array.isArray(receiverProfile.photos)) {
            setReceiverPhotos(receiverProfile.photos);
          } else if (receiverProfile.avatar_url) {
            setReceiverPhotos([receiverProfile.avatar_url]);
          }
          if (receiverProfile.last_seen) {
            const lastSeenDate = new Date(receiverProfile.last_seen);
            const diffMinutes = Math.floor((new Date().getTime() - lastSeenDate.getTime()) / 60000);
            if (diffMinutes < 5) {
              setReceiverStatus('En línea ahora');
            } else if (diffMinutes < 60) {
              setReceiverStatus(`Activo hace ${diffMinutes} min`);
            } else {
              setReceiverStatus('Activo recientemente');
            }
          } else {
            setReceiverStatus('Activo recientemente');
          }
        }

        let { status } = await Location.requestForegroundPermissionsAsync();
        let lat = -20.2642;
        let long = -70.1185;
        if (status === 'granted') {
          let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = location.coords.latitude;
          long = location.coords.longitude;
        }

        const { data: meters, error: rpcError } = await supabase.rpc('get_chat_user_distance', {
          target_user_id: receiverIdString,
          lat: lat,
          long: long,
        });

        if (!rpcError && meters != null) {
          const formattedDistance =
            meters < 100
              ? 'Muy cerca'
              : meters < 1000
                ? `${Math.round(meters)} m`
                : `${(meters / 1000).toFixed(1)} km`;
          setUserDistance(formattedDistance);
        } else {
          setUserDistance('Distancia no disponible');
        }
      } catch (e) {
        console.log('Error al obtener perfil o distancia de chat:', e);
      }
    };

    fetchReceiverProfileAndDistance();
  }, [receiverIdString]);

  // ============================================================
  // CONFIGURACIÓN DE AUDIO
  // ============================================================
  useEffect(() => {
    const configureAudio = async () => {
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      } catch (error) {
        console.log('Error configurando audio:', error);
      }
    };
    configureAudio();
    return () => {
      try {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.remove();
          audioPlayerRef.current = null;
        }
      } catch (error) {
        console.log('Error liberando reproductor:', error);
      }
    };
  }, []);

  // ============================================================
  // GRABACIÓN DE NOTA DE VOZ
  // ============================================================
  const startRecording = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('No compatible', 'La grabación de notas de voz no está soportada directamente en la versión web.');
      return;
    }

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permiso denegado', 'Se necesita permiso para utilizar el micrófono.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      setIsRecording(true);
      setRecordingDuration(0);

      const timer = setInterval(() => {
        setRecordingDuration((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_DURATION) {
            clearInterval(timer);
            setRecordingTimer(null);
            stopAndSendRecording();
            return MAX_RECORDING_DURATION;
          }
          return next;
        });
      }, 1000);
      setRecordingTimer(timer);

    } catch (error: any) {
      console.error('Error al iniciar grabación:', error);
      setIsRecording(false);
      Alert.alert('Error', 'No se pudo iniciar la grabación de audio.');
    }
  };

  const stopAndSendRecording = async () => {
    if (!isRecording) return;

    if (recordingTimer) {
      clearInterval(recordingTimer);
      setRecordingTimer(null);
    }

    try {
      setIsRecording(false);
      await audioRecorder.stop();

      const uri = audioRecorder.uri;
      if (!uri) {
        Alert.alert('Error', 'No se encontró el archivo de audio grabado.');
        return;
      }

      setUploading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'No se encontró el usuario actual.');
        return;
      }

      const fileName = `audio_${user.id}_${Date.now()}.m4a`;

      const response = await fetch(uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(fileName, blob, {
          contentType: 'audio/m4a',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName);

      await sendMessage(null, `🎤 [Nota de voz]\n${publicUrl}`);

      setRecordingDuration(0);
    } catch (error: any) {
      console.error('Error enviando audio:', error);
      Alert.alert('Error', 'No se pudo enviar el audio: ' + (error?.message || 'Error desconocido'));
    } finally {
      setUploading(false);
      setIsRecording(false);
    }
  };

  const cancelRecording = async () => {
    if (recordingTimer) {
      clearInterval(recordingTimer);
      setRecordingTimer(null);
    }
    setIsRecording(false);
    setRecordingDuration(0);
    try {
      await audioRecorder.stop();
    } catch (error) {
      console.log('Error al detener grabación cancelada:', error);
    }
  };

  // ============================================================
  // DETECTAR NOTA DE VOZ Y UBICACIÓN
  // ============================================================
  const getAudioUrlFromMessage = (item: any): string | null => {
    if (!item?.content) return null;
    if (typeof item.content === 'string' && item.content.startsWith('🎤 [Nota de voz]')) {
      const parts = item.content.split('\n');
      if (parts.length > 1 && parts[1]) {
        return parts[1].trim();
      }
    }
    return null;
  };

  const isAudioMessage = (item: any): boolean => {
    return getAudioUrlFromMessage(item) !== null;
  };

  const isLocationMessage = (item: any): boolean => {
    if (!item?.content) return false;
    return typeof item.content === 'string' && (item.content.startsWith('📍') || item.content.includes('[Ubicación compartida]'));
  };

  const getLocationData = (item: any) => {
    try {
      const lines = item.content.split('\n');
      if (lines.length > 1) {
        const data = JSON.parse(lines[1]);
        if (data.lat && data.lng) return data;
      }
      const urlMatch = item.content.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (urlMatch) {
        return { lat: parseFloat(urlMatch[1]), lng: parseFloat(urlMatch[2]) };
      }
      return null;
    } catch {
      return null;
    }
  };

  const isLiveLocation = (item: any): boolean => {
    const data = getLocationData(item);
    return data && data.isLive === true;
  };

  // ============================================================
  // REPRODUCIR NOTA DE VOZ
  // ============================================================
  const playVoiceMessage = async (item: any) => {
    const audioUrl = getAudioUrlFromMessage(item);
    if (!audioUrl) {
      Alert.alert('Audio', 'No se encontró la dirección del archivo de audio.');
      return;
    }
    try {
      if (playingAudioId === item.id && audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.remove();
        audioPlayerRef.current = null;
        setPlayingAudioId(null);
        return;
      }
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.remove();
        } catch (error) {
          console.log('Error liberando audio anterior:', error);
        }
        audioPlayerRef.current = null;
      }
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      const player = createAudioPlayer(audioUrl);
      audioPlayerRef.current = player;
      setPlayingAudioId(item.id);
      const subscription = player.addListener('playbackStatusUpdate', (status: any) => {
        if (status?.didJustFinish) {
          try { subscription.remove(); } catch {}
          try { player.remove(); } catch {}
          if (audioPlayerRef.current === player) {
            audioPlayerRef.current = null;
          }
          setPlayingAudioId(null);
        }
      });
      player.play();
    } catch (error: any) {
      console.error('Error reproduciendo audio:', error);
      setPlayingAudioId(null);
      if (audioPlayerRef.current) {
        try { audioPlayerRef.current.remove(); } catch {}
        audioPlayerRef.current = null;
      }
      Alert.alert('Error', 'No se pudo reproducir la nota de voz.');
    }
  };

  // ============================================================
  // SONIDO DE NOTIFICACIÓN
  // ============================================================
  async function playNotificationSound() {
    try {
      if (Platform.OS === 'web') return;
      const soundModule = require('../assets/notification.mp3');
      if (!soundModule) return;
      const player = createAudioPlayer(soundModule);
      player.play();
      setTimeout(() => {
        try { player.remove(); } catch {}
      }, 3000);
    } catch (error) {
      console.log('Sonido de notificación no disponible.');
    }
  }

  useEffect(() => {
    scrollToBottom();
    if (!initialMessagesLoadedRef.current) return;
    if (!messages || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    if (
      lastMessage.receiver_id === currentUserId &&
      lastMessage.sender_id !== currentUserId
    ) {
      playNotificationSound();
    }
  }, [messages]);

  // ============================================================
  // PROTECCIÓN DE CAPTURAS
  // ============================================================
  useEffect(() => {
    const setupScreenProtection = async () => {
      if (Platform.OS === 'web') return;
      try {
        const isAvailable = await ScreenCapture.isAvailableAsync();
        if (isAvailable) {
          await ScreenCapture.preventScreenCaptureAsync();
        }
      } catch (error) {
        console.log('Error activando protección de pantalla:', error);
      }
    };
    setupScreenProtection();
    return () => {
      if (Platform.OS !== 'web') {
        ScreenCapture.allowScreenCaptureAsync();
      }
    };
  }, [receiverIdString]);

  // ============================================================
  // BLOQUEO / DESBLOQUEO
  // ============================================================
  const handleBlockUser = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const activeUserId = authData?.user?.id || currentUserId;
    if (!activeUserId || !receiverIdString) return;
    Alert.alert(
      'Bloquear usuario',
      '¿Estás seguro de que quieres bloquear a este usuario?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('blocks')
              .insert({
                blocker_id: activeUserId,
                blocked_id: receiverIdString,
              });
            if (error) {
              if (error.code === '23505') {
                setIsBlocked(true);
                return;
              }
              Alert.alert('Error', 'No se pudo bloquear al usuario: ' + error.message);
            } else {
              Alert.alert('Bloqueado', 'Usuario bloqueado correctamente.');
              setIsBlocked(true);
            }
          },
        },
      ]
    );
  };

  const handleUnblockUser = async () => {
    if (!currentUserId || !receiverIdString) return;
    Alert.alert(
      'Desbloquear usuario',
      '¿Quieres desbloquear a este usuario?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Desbloquear',
          onPress: async () => {
            const { error } = await supabase
              .from('blocks')
              .delete()
              .or(
                `and(blocker_id.eq.${currentUserId},blocked_id.eq.${receiverIdString}),and(blocker_id.eq.${receiverIdString},blocked_id.eq.${currentUserId})`
              );
            if (error) {
              Alert.alert('Error', 'No se pudo desbloquear al usuario.');
            } else {
              Alert.alert('Desbloqueado', 'Has desbloqueado a este usuario.');
              setIsBlocked(false);
              if (currentUserId) {
                await fetchMessages(currentUserId);
              }
            }
          },
        },
      ]
    );
  };

  const checkBlockStatus = async (userId: string) => {
    if (!receiverIdString) return;
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .or(
        `and(blocker_id.eq.${userId},blocked_id.eq.${receiverIdString}),and(blocker_id.eq.${receiverIdString},blocked_id.eq.${userId})`
      );
    if (error) {
      console.log('Error comprobando bloqueo:', error.message);
      setIsBlocked(false);
      return;
    }
    setIsBlocked(Boolean(data && data.length > 0));
  };

  const markMessagesAsRead = async (userId: string) => {
    if (!receiverIdString || !userId) return;
    try {
      const { data: unreadMessages, error: fetchError } = await supabase
        .from('messages')
        .select('id')
        .eq('sender_id', receiverIdString)
        .eq('receiver_id', userId)
        .eq('is_read', false);
      if (fetchError || !unreadMessages || unreadMessages.length === 0) return;
      const messageIds = unreadMessages.map((m) => m.id);
      const { error: updateError } = await supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', messageIds);
      if (updateError) {
        console.log('Error al actualizar mensajes a leídos:', updateError.message);
      }
    } catch (err) {
      console.log('Excepción en markMessagesAsRead:', err);
    }
  };

  // ============================================================
  // CARGAR MENSAJES
  // ============================================================
  const fetchMessages = async (userId: string) => {
    if (!receiverIdString) return;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${receiverIdString}),and(sender_id.eq.${receiverIdString},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) {
      console.error('Error cargando mensajes:', error.message);
      return;
    }

    if (data) {
      const now = new Date().getTime();
      const processedMessages = data.map((msg) => {
        if (msg.is_disappearing && msg.image_url) {
          const createdAtTime = new Date(msg.created_at).getTime();
          const hasExpiredTime = now - createdAtTime > 24 * 60 * 60 * 1000;
          if (msg.viewed || hasExpiredTime) {
            return {
              ...msg,
              viewed: true,
              image_url: null,
              content: hasExpiredTime && !msg.viewed
                ? '🔥 [Foto expirada por inactividad]'
                : '🔥 [Foto vista y expirada]',
            };
          }
        }
        return msg;
      });

      setMessages(processedMessages);
      messageIdsRef.current.clear();
      processedMessages.forEach((message) => {
        if (message.id) {
          messageIdsRef.current.add(message.id);
        }
      });
      initialMessagesLoadedRef.current = true;
    }
  };

  const loadMoreMessages = async (userId: string) => {
    if (!receiverIdString || messages.length === 0) return;
    if (isLoadingMore.current) return;
    isLoadingMore.current = true;

    const currentOffset = scrollOffsetRef.current;

    try {
      const oldestMessage = messages[messages.length - 1];
      const oldestDate = oldestMessage?.created_at;
      if (!oldestDate) {
        isLoadingMore.current = false;
        return;
      }

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${receiverIdString}),and(sender_id.eq.${receiverIdString},receiver_id.eq.${userId})`
        )
        .lt('created_at', oldestDate)
        .order('created_at', { ascending: false })
        .limit(15);

      if (error) {
        console.error('Error cargando más mensajes:', error.message);
        isLoadingMore.current = false;
        return;
      }

      if (data && data.length > 0) {
        const now = new Date().getTime();
        const processedOlderMessages = data.map((msg) => {
          if (msg.is_disappearing && msg.image_url) {
            const createdAtTime = new Date(msg.created_at).getTime();
            const hasExpiredTime = now - createdAtTime > 24 * 60 * 60 * 1000;
            if (msg.viewed || hasExpiredTime) {
              return {
                ...msg,
                viewed: true,
                image_url: null,
                content: hasExpiredTime && !msg.viewed
                  ? '🔥 [Foto expirada por inactividad]'
                  : '🔥 [Foto vista y expirada]',
              };
            }
          }
          return msg;
        });

        setMessages((prevMessages) => {
          const existingIds = new Set(prevMessages.map((m) => m.id));
          const uniqueNewMessages = processedOlderMessages.filter((m) => !existingIds.has(m.id));
          return [...prevMessages, ...uniqueNewMessages];
        });

        processedOlderMessages.forEach((message) => {
          if (message.id) {
            messageIdsRef.current.add(message.id);
          }
        });

        setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current?.scrollToOffset({ offset: currentOffset, animated: false });
          }
        }, 50);
      }
    } catch (err) {
      console.error('Error inesperado en loadMoreMessages:', err);
    } finally {
      isLoadingMore.current = false;
    }
  };

  // ============================================================
  // CONFIGURACIÓN REALTIME
  // ============================================================
  useEffect(() => {
    let isMounted = true;

    const setupChat = async () => {
      if (!receiverIdString) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      const userId = user.id;
      setCurrentUserId(userId);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .single();
      if (profileData?.avatar_url) {
        setMyAvatar(profileData.avatar_url.trim());
      }

      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', userId);

      await checkBlockStatus(userId);
      await fetchMessages(userId);
      await markMessagesAsRead(userId);

      if (!isMounted) return;

      const sortedIds = [userId, receiverIdString].sort();
      const roomName = `room_${sortedIds[0]}_${sortedIds[1]}`;

      if (channelRef.current) {
        try {
          await supabase.removeChannel(channelRef.current);
        } catch {}
        channelRef.current = null;
      }

      const channel = supabase.channel(roomName, {
        config: {
          broadcast: {
            self: false,
          },
        },
      });

      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload: any) => {
          if (!isMounted) return;
          const newMsg = payload.new;
          if (!newMsg?.id) return;

          const belongsToConversation =
            (newMsg.sender_id === userId && newMsg.receiver_id === receiverIdString) ||
            (newMsg.sender_id === receiverIdString && newMsg.receiver_id === userId);
          if (!belongsToConversation) return;
          if (messageIdsRef.current.has(newMsg.id)) return;

          messageIdsRef.current.add(newMsg.id);
          setMessages((prev) => [newMsg, ...prev]);

          if (newMsg.sender_id === receiverIdString) {
            markMessagesAsRead(userId);
          }
        }
      );

      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload: any) => {
          if (!isMounted) return;
          const updatedMsg = payload.new;
          if (!updatedMsg?.id) return;

          const belongsToConversation =
            (updatedMsg.sender_id === userId && updatedMsg.receiver_id === receiverIdString) ||
            (updatedMsg.sender_id === receiverIdString && updatedMsg.receiver_id === userId);
          if (!belongsToConversation) return;

          messageIdsRef.current.add(updatedMsg.id);
          setMessages((prev) =>
            prev.map((message) =>
              message.id === updatedMsg.id ? updatedMsg : message
            )
          );
        }
      );

      channel.on(
        'broadcast',
        {
          event: 'typing',
        },
        (payload: any) => {
          if (!isMounted) return;
          if (payload?.payload?.userId === receiverIdString) {
            setIsTyping(Boolean(payload?.payload?.isTyping));
          }
        }
      );

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('Chat realtime conectado:', roomName);
        }
      });

      channelRef.current = channel;
    };

    setupChat();

    return () => {
      isMounted = false;
      stopLiveLocation();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      setIsTyping(false);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      messageIdsRef.current.clear();
      initialMessagesLoadedRef.current = false;
    };
  }, [receiverIdString]);

  // ============================================================
  // TYPING
  // ============================================================
  const handleTextChange = (text: string) => {
    setInputText(text);
    if (!channelRef.current || !currentUserId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId: currentUserId,
        isTyping: text.trim().length > 0,
      },
    });
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (text.trim().length === 0) return;
    typingTimeoutRef.current = setTimeout(() => {
      if (channelRef.current && currentUserId) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            userId: currentUserId,
            isTyping: false,
          },
        });
      }
    }, 2000);
  };

  // ============================================================
  // ENVIAR MENSAJE
  // ============================================================
  const sendMessage = async (
    imageUrl: string | null = null,
    customContent: string | null = null
  ) => {
    const textToSend = customContent !== null ? customContent : inputText.trim();
    if ((!textToSend && !imageUrl) || !currentUserId || !receiverIdString) return;

    await supabase
      .from('profiles')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', currentUserId);

    if (channelRef.current && currentUserId) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: currentUserId,
          isTyping: false,
        },
      });
    }

    if (customContent === null) {
      setInputText('');
    }

    let content = textToSend;
    if (imageUrl) {
      content = '📸 [Foto Temporal]';
    }
    const disappearing = imageUrl ? true : false;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: currentUserId,
        receiver_id: receiverIdString,
        content,
        image_url: imageUrl,
        is_read: false,
        is_disappearing: disappearing,
        viewed: false,
      })
      .select()
      .single();

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    if (data?.id) {
      messageIdsRef.current.add(data.id);
      setMessages((prev) => {
        const alreadyExists = prev.some((message) => message.id === data.id);
        if (alreadyExists) return prev;
        return [data, ...prev];
      });
    }
    setIsDisappearing(false);
  };

  // ============================================================
  // ENVIAR UBICACIÓN
  // ============================================================
  const handleSendLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se requieren permisos de ubicación para enviar tu posición.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;

      let formattedAddress = '';
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        const addressParts = [];
        if (address?.street) addressParts.push(address.street);
        if (address?.streetNumber) addressParts.push(address.streetNumber);
        if (address?.city) addressParts.push(address.city);
        if (address?.country) addressParts.push(address.country);
        formattedAddress = addressParts.length > 0
          ? addressParts.join(', ')
          : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      } catch (e) {
        formattedAddress = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      }

      const locationData = {
        lat: latitude,
        lng: longitude,
        address: formattedAddress,
        isLive: false,
      };

      const locationMessage = `📍 ${formattedAddress}\n${JSON.stringify(locationData)}`;

      await sendMessage(null, locationMessage);
    } catch (error) {
      console.error('Error GPS:', error);
      Alert.alert('Error', 'No se pudo obtener la ubicación actual.');
    }
  };

  // ============================================================
  // LIVE LOCATION
  // ============================================================
  const startLiveLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesitan permisos de ubicación.');
        return;
      }

      setIsLiveLocationActive(true);

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await sendLiveLocationMessage(location.coords.latitude, location.coords.longitude);

      liveLocationWatcher.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 10,
        },
        async (newLocation) => {
          await sendLiveLocationMessage(newLocation.coords.latitude, newLocation.coords.longitude);
        }
      );

      liveLocationInterval.current = setInterval(async () => {
        if (!isLiveLocationActive) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await sendLiveLocationMessage(loc.coords.latitude, loc.coords.longitude);
      }, 10000);

      Alert.alert('Ubicación en vivo', 'Ahora estás compartiendo tu ubicación en tiempo real.');
    } catch (error) {
      console.error('Error iniciando live location:', error);
      Alert.alert('Error', 'No se pudo iniciar la ubicación en vivo.');
      setIsLiveLocationActive(false);
    }
  };

  const sendLiveLocationMessage = async (lat: number, lng: number) => {
    try {
      let formattedAddress = '';
      try {
        const [address] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const addressParts = [];
        if (address?.street) addressParts.push(address.street);
        if (address?.streetNumber) addressParts.push(address.streetNumber);
        if (address?.city) addressParts.push(address.city);
        if (address?.country) addressParts.push(address.country);
        formattedAddress = addressParts.length > 0
          ? addressParts.join(', ')
          : `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } catch (e) {
        formattedAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }

      const locationData = {
        lat,
        lng,
        address: formattedAddress,
        isLive: true,
        timestamp: Date.now(),
      };

      const content = `📍 [Ubicación en vivo]\n${JSON.stringify(locationData)}`;
      await sendMessage(null, content);
    } catch (error) {
      console.error('Error enviando live location:', error);
    }
  };

  const stopLiveLocation = async () => {
    setIsLiveLocationActive(false);
    if (liveLocationWatcher.current) {
      liveLocationWatcher.current.remove();
      liveLocationWatcher.current = null;
    }
    if (liveLocationInterval.current) {
      clearInterval(liveLocationInterval.current);
      liveLocationInterval.current = null;
    }
    Alert.alert('Ubicación en vivo', 'Has dejado de compartir tu ubicación.');
  };

  // ============================================================
  // ACCIONES DE UBICACIÓN
  // ============================================================
  const openLocationActions = (locationData: any) => {
    setSelectedLocation(locationData);
    setShowLocationActions(true);
  };

  const handleLocationAction = async (action: string) => {
    if (!selectedLocation) return;
    setShowLocationActions(false);

    switch (action) {
      case 'estoy_aqui':
        await handleSendLocation();
        break;
      case 'como_llegar':
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const url = `https://www.google.com/maps/dir/?api=1&origin=${loc.coords.latitude},${loc.coords.longitude}&destination=${selectedLocation.lat},${selectedLocation.lng}`;
            Linking.openURL(url);
          } else {
            const url = `https://www.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}`;
            Linking.openURL(url);
          }
        } catch (error) {
          const url = `https://www.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}`;
          Linking.openURL(url);
        }
        break;
      case 'compartir_mi_ubicacion':
        await handleSendLocation();
        break;
      default:
        break;
    }
  };

  // ============================================================
  // SELECCIONAR Y ENVIAR IMAGEN
  // ============================================================
  const pickAndSendImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita acceso a la galería.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled) return;
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'No se encontró el usuario actual.');
        return;
      }
      const imageUri = result.assets[0].uri;
      const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1000 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      const finalUri = manipResult.uri;
      const fileName = `chat_${user.id}_${Date.now()}.jpg`;
      const response = await fetch(finalUri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (uploadError) {
        throw uploadError;
      }
      const { data: { publicUrl } } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName);
      await sendMessage(publicUrl);
    } catch (error: any) {
      console.error('Error enviando imagen:', error);
      Alert.alert('Error', 'No se pudo enviar la imagen: ' + (error?.message || 'Error desconocido'));
    } finally {
      setUploading(false);
    }
  };

  // ============================================================
  // ABRIR IMAGEN (CON CONTADOR Y ANIMACIÓN)
  // ============================================================
  const handleOpenImage = (item: any) => {
    setSelectedImage(item);
    setModalVisible(true);

    fadeAnim.setValue(1);

    if (item.is_disappearing && item.sender_id !== currentUserId && !item.viewed) {
      setPhotoTimer(EPHEMERAL_DURATION);

      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);

      intervalRef.current = setInterval(() => {
        setPhotoTimer((prev) => {
          if (prev === null || prev <= 0) return 0;
          const newValue = prev - 1;
          if (newValue === 0) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (timerRef.current) clearTimeout(timerRef.current);
            executeDestruction(item);
            return 0;
          }
          return newValue;
        });
      }, 1000);

      timerRef.current = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        executeDestruction(item);
      }, EPHEMERAL_DURATION * 1000);
    }
  };

  // ============================================================
  // EJECUTAR DESTRUCCIÓN (CON ANIMACIÓN)
  // ============================================================
  const executeDestruction = async (itemToDestroy: any) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhotoTimer(null);

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);

      setMessages((prev) =>
        prev.map((message) =>
          message.id === itemToDestroy.id
            ? {
                ...message,
                viewed: true,
                image_url: null,
                content: '🔥 [Foto vista y expirada]',
              }
            : message
        )
      );

      try {
        supabase
          .from('messages')
          .update({
            viewed: true,
            image_url: null,
            content: '🔥 [Foto vista y expirada]',
          })
          .eq('id', itemToDestroy.id)
          .then(() => {
            if (itemToDestroy.image_url) {
              const urlWithoutQuery = itemToDestroy.image_url.split('?')[0];
              const pathParts = urlWithoutQuery.split('/');
              const fileName = pathParts[pathParts.length - 1];
              if (fileName) {
                supabase.storage.from('chat-images').remove([fileName]);
              }
            }
          });
      } catch (error) {
        console.log('Error destruyendo foto temporal:', error);
      }

      setSelectedImage(null);
      fadeAnim.setValue(1);
    });
  };

  // ============================================================
  // DESTRUIR AL CERRAR MANUALMENTE
  // ============================================================
  const destroyImageViewed = () => {
    if (selectedImage) {
      executeDestruction(selectedImage);
    } else {
      setModalVisible(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={0}
    >
      {/* HEADER */}
      <LinearGradient colors={[Colors.surface, Colors.background]} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={handleGoBack} activeOpacity={0.8} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerProfileTouch} onPress={() => setProfileModalVisible(true)} activeOpacity={0.8}>
            {receiverAvatar ? (
              <Image source={{ uri: receiverAvatar }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Ionicons name="person" size={18} color="#000" />
              </View>
            )}
            <View style={styles.headerTextWrapper}>
              <Text style={styles.logo}>N·O·W</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {receiverNameString || 'Chat Privado'}
              </Text>
              <View style={styles.statusDistanceRow}>
                {isTyping ? (
                  <Text style={styles.typingIndicatorText}>Escribiendo...</Text>
                ) : (
                  <>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>{receiverStatus || 'Activo recientemente'}</Text>
                  </>
                )}
                {userDistance && (
                  <>
                    <View style={styles.statusSeparator} />
                    <Ionicons name="location-outline" size={12} color={Colors.primary} />
                    <Text style={styles.distanceText}>{userDistance || 'Calculando...'}</Text>
                  </>
                )}
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            {isBlocked ? (
              <TouchableOpacity onPress={handleUnblockUser} style={styles.blockHeaderBtn}>
                <Ionicons name="lock-open-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleBlockUser} style={styles.blockHeaderBtn}>
                <Ionicons name="ban-outline" size={20} color="#ff4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* LISTA DE MENSAJES */}
      <FlatList
        ref={flatListRef}
        data={messages}
        inverted={true}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        contentContainerStyle={styles.messageList}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        onEndReached={() => {
          if (currentUserId) {
            loadMoreMessages(currentUserId);
          }
        }}
        onEndReachedThreshold={0.3}
        renderItem={({ item }) => {
          const isMe = item.sender_id === currentUserId;
          const isAudio = isAudioMessage(item);
          const isLocation = isLocationMessage(item);
          const locationData = isLocation ? getLocationData(item) : null;
          const isLive = isLocation && locationData?.isLive === true;
          const avatar = isMe ? myAvatar : receiverAvatar;

          // Determinar si es una foto efímera NO vista aún
          const isEphemeralPhoto = item.is_disappearing && item.image_url && !item.viewed && !isMe;


          return (
            <View style={[styles.messageRow, isMe ? styles.myMessageRow : styles.otherMessageRow]}>
              {isMe ? (
                // Mensaje propio: burbuja primero, avatar después
                <>
                  <View style={[styles.messageBubble, styles.myBubble]}>
                    {isEphemeralPhoto ? (
                      <TouchableOpacity onPress={() => handleOpenImage(item)} style={styles.ephemeralContainer}>
                        <Ionicons name="eye-off" size={30} color="#000" />
                        <Text style={styles.ephemeralText}>📸 Foto temporal</Text>
                        <Text style={styles.ephemeralSubText}>Toca para ver</Text>
                      </TouchableOpacity>
                    ) : item.image_url ? (
                      <TouchableOpacity onPress={() => handleOpenImage(item)}>
                        <Image source={{ uri: item.image_url }} style={styles.messageImage} />
                        <Text style={[styles.messageText, styles.bubbleTextCommon, styles.imageIndicatorText]}>
                          {item.content}
                        </Text>
                      </TouchableOpacity>
                    ) : isLocation && locationData ? (
                      <TouchableOpacity
                        onPress={() => openLocationActions(locationData)}
                        activeOpacity={0.7}
                        style={styles.locationBubble}
                      >
                        <Ionicons name={isLive ? 'radio' : 'location'} size={24} color="#000" />
                        <View style={styles.locationInfo}>
                          <Text style={[styles.messageText, styles.bubbleTextCommon]}>
                            {isLive ? '🔴 Ubicación en vivo' : '📍 ' + (locationData.address || 'Ubicación')}
                          </Text>
                          {isLive && <Text style={styles.locationTapText}>🔄 Actualizando...</Text>}
                          <Text style={styles.locationTapText}>Toca para acciones</Text>
                        </View>
                      </TouchableOpacity>
                    ) : isAudio ? (
                      <View style={styles.audioContainer}>
                        <TouchableOpacity onPress={() => playVoiceMessage(item)} style={styles.audioPlayButton}>
                          <Ionicons name={playingAudioId === item.id ? 'pause' : 'play'} size={22} color="#050505" />
                        </TouchableOpacity>
                        <View style={styles.audioInfo}>
                          <Text style={[styles.messageText, styles.bubbleTextCommon]}>🎤 Nota de voz</Text>
                          <Text style={styles.audioSubText}>
                            {playingAudioId === item.id ? 'Reproduciendo...' : 'Toca para escuchar'}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={[styles.messageText, styles.bubbleTextCommon]}>{item.content}</Text>
                    )}

                    <View style={styles.messageFooter}>
                      <Text style={styles.messageTime}>
                        {item.created_at
                          ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </Text>
                      {isMe && (
                        <Text style={[styles.readStatus, item.is_read && styles.readBlue]}>
                          {item.is_read ? '✓✓' : '✓'}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={[styles.avatarContainer, { marginLeft: 6 }]}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Ionicons name="person" size={20} color="#666" />
                      </View>
                    )}
                  </View>
                </>
              ) : (
                // Mensaje de otro: avatar primero, burbuja después
                <>
                  <View style={[styles.avatarContainer, { marginRight: 6 }]}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Ionicons name="person" size={20} color="#666" />
                      </View>
                    )}
                  </View>

                  <View style={[styles.messageBubble, styles.otherBubble]}>
                    {isEphemeralPhoto ? (
                      <TouchableOpacity onPress={() => handleOpenImage(item)} style={styles.ephemeralContainer}>
                        <Ionicons name="eye-off" size={30} color="#000" />
                        <Text style={styles.ephemeralText}>📸 Foto temporal</Text>
                        <Text style={styles.ephemeralSubText}>Toca para ver</Text>
                      </TouchableOpacity>
                    ) : item.image_url ? (
                      <TouchableOpacity onPress={() => handleOpenImage(item)}>
                        <Image source={{ uri: item.image_url }} style={styles.messageImage} />
                        <Text style={[styles.messageText, styles.bubbleTextCommon, styles.imageIndicatorText]}>
                          {item.content}
                        </Text>
                      </TouchableOpacity>
                    ) : isLocation && locationData ? (
                      <TouchableOpacity
                        onPress={() => openLocationActions(locationData)}
                        activeOpacity={0.7}
                        style={styles.locationBubble}
                      >
                        <Ionicons name={isLive ? 'radio' : 'location'} size={24} color="#000" />
                        <View style={styles.locationInfo}>
                          <Text style={[styles.messageText, styles.bubbleTextCommon]}>
                            {isLive ? '🔴 Ubicación en vivo' : '📍 ' + (locationData.address || 'Ubicación')}
                          </Text>
                          {isLive && <Text style={styles.locationTapText}>🔄 Actualizando...</Text>}
                          <Text style={styles.locationTapText}>Toca para acciones</Text>
                        </View>
                      </TouchableOpacity>
                    ) : isAudio ? (
                      <View style={styles.audioContainer}>
                        <TouchableOpacity onPress={() => playVoiceMessage(item)} style={styles.audioPlayButton}>
                          <Ionicons name={playingAudioId === item.id ? 'pause' : 'play'} size={22} color="#050505" />
                        </TouchableOpacity>
                        <View style={styles.audioInfo}>
                          <Text style={[styles.messageText, styles.bubbleTextCommon]}>🎤 Nota de voz</Text>
                          <Text style={styles.audioSubText}>
                            {playingAudioId === item.id ? 'Reproduciendo...' : 'Toca para escuchar'}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={[styles.messageText, styles.bubbleTextCommon]}>{item.content}</Text>
                    )}

                    <View style={styles.messageFooter}>
                      <Text style={styles.messageTime}>
                        {item.created_at
                          ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </Text>
                      {isMe && (
                        <Text style={[styles.readStatus, item.is_read && styles.readBlue]}>
                          {item.is_read ? '✓✓' : '✓'}
                        </Text>
                      )}
                    </View>
                  </View>
                </>
              )}
            </View>
          );
        }}
      />

      {/* INPUT */}
      {isBlocked ? (
        <View style={styles.blockedNoticeContainer}>
          <Text style={styles.blockedNoticeText}>Este usuario está bloqueado o la conversación no está disponible.</Text>
        </View>
      ) : uploading ? (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.uploadImageText}>Procesando archivo...</Text>
        </View>
      ) : isRecording ? (
        <View style={styles.recordingContainer}>
          <View style={styles.recordingLeft}>
            <TouchableOpacity onPress={cancelRecording} style={styles.cancelRecordingButton}>
              <Ionicons name="close" size={24} color="#ff4444" />
            </TouchableOpacity>
            <View style={styles.recordingIndicator}>
              <Animated.View style={[styles.recordingDot, { opacity: dotOpacity }]} />
              <Text style={styles.recordingText}>
                Grabando {`${String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:${String(recordingDuration % 60).padStart(2, '0')}`} / {MAX_RECORDING_DURATION}s
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={stopAndSendRecording} style={styles.sendAudioButton}>
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inputContainer}>
          <View style={styles.attachmentButtons}>
            <TouchableOpacity onPress={pickAndSendImage} style={styles.iconButton}>
              <Ionicons name="image-outline" size={22} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSendLocation} style={styles.iconButton}>
              <Ionicons name="location-outline" size={22} color={Colors.textMuted} />
            </TouchableOpacity>

            {isLiveLocationActive ? (
              <TouchableOpacity onPress={stopLiveLocation} style={[styles.iconButton, styles.liveActiveButton]}>
                <Ionicons name="radio" size={22} color="#ff4444" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={startLiveLocation} style={styles.iconButton}>
                <Ionicons name="radio-button-on" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            )}

            <TouchableOpacity onPressIn={startRecording} onPressOut={stopAndSendRecording} style={styles.iconButton}>
              <Ionicons name="mic-outline" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.textInput}
            placeholder="Escribe un mensaje..."
            placeholderTextColor={Colors.textMuted}
            value={inputText}
            onChangeText={handleTextChange}
            multiline
          />

          <TouchableOpacity
            onPress={() => sendMessage()}
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* MODAL DE ACCIONES DE UBICACIÓN */}
      <Modal visible={showLocationActions} transparent animationType="slide" onRequestClose={() => setShowLocationActions(false)}>
        <View style={styles.actionModalOverlay}>
          <View style={styles.actionModalContainer}>
            <Text style={styles.actionModalTitle}>📍 Acciones de ubicación</Text>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleLocationAction('estoy_aqui')}>
              <Ionicons name="location" size={24} color="#000" />
              <Text style={styles.actionButtonText}>Estoy aquí</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleLocationAction('como_llegar')}>
              <Ionicons name="navigate" size={24} color="#000" />
              <Text style={styles.actionButtonText}>¿Cómo llego?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleLocationAction('compartir_mi_ubicacion')}>
              <Ionicons name="share-social" size={24} color="#000" />
              <Text style={styles.actionButtonText}>Compartir mi ubicación también</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCancel} onPress={() => setShowLocationActions(false)}>
              <Text style={styles.actionCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL DE PERFIL DETALLADO */}
      <Modal
        visible={profileModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.profileModalOverlay}>
          <View style={styles.profileModalContainer}>
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Perfil del Usuario</Text>
              <TouchableOpacity onPress={() => setProfileModalVisible(false)} style={styles.closeIconBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ key: 'content' }]}
              keyExtractor={(item) => item.key}
              renderItem={() => (
                <View style={styles.profileScrollContent}>
                  <FlatList
                    data={receiverPhotos}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item, idx) => idx.toString()}
                    renderItem={({ item }) => (
                      <Image source={{ uri: item }} style={styles.carouselImage} />
                    )}
                    ListEmptyComponent={
                      <Image
                        source={{ uri: receiverAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }}
                        style={styles.carouselImage}
                      />
                    }
                  />
                  <View style={styles.profileInfoSection}>
                    <Text style={styles.modalUserName}>
                      {receiverProfileData?.full_name || receiverNameString || 'Usuario'}
                    </Text>
                    <Text style={styles.modalUserStatus}>
                      🟢 {receiverStatus || 'Activo recientemente'} {userDistance ? `• A ${userDistance}` : ''}
                    </Text>
                    {receiverProfileData?.bio && (
                      <View style={styles.bioContainer}>
                        <Text style={styles.bioTitle}>Acerca de mí</Text>
                        <Text style={styles.bioText}>{receiverProfileData.bio}</Text>
                      </View>
                    )}
                    {receiverProfileData?.interests && (
                      <View style={styles.interestsContainer}>
                        <Text style={styles.bioTitle}>Intereses</Text>
                        <View style={styles.tagsRow}>
                          {(Array.isArray(receiverProfileData.interests)
                            ? receiverProfileData.interests
                            : typeof receiverProfileData.interests === 'string'
                              ? receiverProfileData.interests.split(',').map((i: string) => i.trim())
                              : []
                          ).map((interest: string, index: number) => (
                            <View key={index} style={styles.tagBadge}>
                              <Text style={styles.tagText}>{interest}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    <View style={styles.moderationSection}>
                      <Text style={styles.bioTitle}>Opciones de Privacidad</Text>
                      <TouchableOpacity style={styles.modButton} onPress={() => { setProfileModalVisible(false); handleBlockUser(); }}>
                        <Ionicons name="ban-outline" size={18} color="#ff4444" />
                        <Text style={[styles.modButtonText, { color: '#ff4444' }]}>Bloquear Usuario</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.modButton} onPress={() => { setProfileModalVisible(false); Alert.alert("Reportar", "Gracias por reportar. Nuestro equipo revisará este perfil."); }}>
                        <Ionicons name="flag-outline" size={18} color={Colors.textSecondary} />
                        <Text style={styles.modButtonText}>Reportar Perfil</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* MODAL DE FOTO TEMPORAL */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={destroyImageViewed}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalOverlay}
          onPress={destroyImageViewed}
        >
          <View style={styles.modalContent}>
            {selectedImage?.is_disappearing && selectedImage?.sender_id !== currentUserId && photoTimer !== null && photoTimer > 0 && (
              <View style={styles.timerContainer}>
                <Ionicons name="flame" size={18} color="#ff4444" />
                <Text style={styles.timerText}>Autodestrucción en {photoTimer}s</Text>
                <View style={styles.progressBarBackground}>
                  <View style={[styles.progressBarFill, { width: `${(photoTimer / EPHEMERAL_DURATION) * 100}%` }]} />
                </View>
              </View>
            )}

            {selectedImage?.image_url && (
              <Animated.Image
                source={{ uri: selectedImage.image_url }}
                style={[styles.modalImage, { opacity: fadeAnim }]}
                resizeMode="contain"
              />
            )}

            <TouchableOpacity
              style={styles.closeModalX}
              onPress={destroyImageViewed}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle" size={36} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={destroyImageViewed} style={styles.closeModalButton}>
              <Text style={styles.closeModalText}>Cerrar y destruir ahora</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// ESTILOS
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: { padding: 4, marginRight: 4 },
  backButtonText: { fontSize: 22, color: '#FFFFFF' },
  headerProfileTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  headerAvatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTextWrapper: { flex: 1, marginRight: 4 },
  logo: { fontSize: 10, letterSpacing: 2, color: Colors.primary, fontWeight: 'bold' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  statusDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  statusSeparator: {
    width: 1,
    height: 12,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
  },
  statusText: { fontSize: 11, color: Colors.primary, fontWeight: '500' },
  distanceText: { fontSize: 11, color: Colors.primary, fontWeight: '500', marginLeft: 4 },
  typingIndicatorText: { fontSize: 11, color: Colors.primary, fontStyle: 'italic' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  blockHeaderBtn: { padding: 6 },

  // Lista de mensajes
  messageList: { paddingHorizontal: 16, paddingVertical: 12 },
  messageRow: {
    marginVertical: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  myMessageRow: { justifyContent: 'flex-end' },
  otherMessageRow: { justifyContent: 'flex-start' },

  // Avatares
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 4,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 16 },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },

  messageBubble: {
    maxWidth: '70%',
    padding: 10,
    borderRadius: 12,
  },
  myBubble: {
    backgroundColor: '#ff3b30',
    borderBottomRightRadius: 2,
  },
  otherBubble: {
    backgroundColor: '#ffcc00',
    borderBottomLeftRadius: 2,
  },
  messageText: { fontSize: 14 },
  bubbleTextCommon: { color: '#000000', fontWeight: '600' },
  messageImage: { width: 200, height: 150, borderRadius: 8, marginBottom: 4 },
  imageIndicatorText: { fontSize: 12, fontStyle: 'italic' },

  // Estilos para fotos efímeras
  ephemeralContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    minWidth: 120,
  },
  ephemeralText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 4,
  },
  ephemeralSubText: {
    fontSize: 11,
    color: '#444',
    marginTop: 2,
  },

  // Ubicación
  locationBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
    minWidth: 180,
  },
  locationInfo: { flex: 1 },
  locationTapText: {
    fontSize: 10,
    color: '#444',
    marginTop: 2,
    fontWeight: '500',
  },

  // Audio
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 180,
  },
  audioPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  audioInfo: { flex: 1 },
  audioSubText: { fontSize: 10, color: '#222222', marginTop: 2, fontWeight: '500' },

  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTime: { fontSize: 9, color: '#222222', marginRight: 4, fontWeight: '600' },
  readStatus: { fontSize: 10, color: '#003366' },
  readBlue: { color: '#0000ff' },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  attachmentButtons: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { padding: 8 },
  liveActiveButton: { backgroundColor: 'rgba(255,68,68,0.2)', borderRadius: 20 },

  textInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#FFFFFF',
    maxHeight: 100,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 4,
  },
  sendButtonDisabled: { opacity: 0.5 },

  // Grabación
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  recordingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cancelRecordingButton: { padding: 8, marginRight: 8 },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center' },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff4444',
    marginRight: 8,
  },
  recordingText: { fontSize: 13, color: '#FFFFFF', fontWeight: '500' },
  sendAudioButton: { backgroundColor: Colors.primary, padding: 8, borderRadius: 20 },

  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  uploadImageText: { marginLeft: 8, fontSize: 13, color: Colors.textMuted },

  blockedNoticeContainer: {
    padding: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  blockedNoticeText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  // Modal acciones de ubicación
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  actionModalContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
  },
  actionModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 12,
    fontWeight: '500',
  },
  actionCancel: { marginTop: 8, padding: 14, alignItems: 'center' },
  actionCancelText: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600' },

  // Modal foto temporal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  modalImage: {
    width: '100%',
    height: '80%',
    borderRadius: 8,
  },
  closeModalX: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 4,
  },
  closeModalButton: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  closeModalText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  timerContainer: {
    width: '100%',
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  timerText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold', marginVertical: 4 },
  progressBarBackground: {
    width: '100%',
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: '#ff4444' },

  profileModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  profileModalContainer: {
    height: '85%',
    backgroundColor: Colors.surface || '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  profileModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  closeIconBtn: { padding: 4 },
  profileScrollContent: { paddingBottom: 40 },
  carouselImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.9,
    resizeMode: 'cover',
    backgroundColor: '#111',
  },
  profileInfoSection: { padding: 20 },
  modalUserName: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  modalUserStatus: { fontSize: 13, color: Colors.primary, marginTop: 4, marginBottom: 16 },
  bioContainer: { marginTop: 12 },
  bioTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.textSecondary || '#aaa',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bioText: { fontSize: 15, color: '#FFFFFF', lineHeight: 22 },
  interestsContainer: { marginTop: 20 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: { color: '#FFFFFF', fontSize: 13 },
  moderationSection: { marginTop: 30, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 20 },
  modButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modButtonText: { marginLeft: 12, fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});