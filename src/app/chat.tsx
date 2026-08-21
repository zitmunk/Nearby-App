import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
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

export default function ChatScreen() {
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

  // ============================================================
  // AUDIO
  // ============================================================

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [isRecording, setIsRecording] = useState(false);

  // Player actualmente reproduciendo una nota de voz
  const audioPlayerRef = useRef<any>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // ============================================================
  // IMÁGENES / MODAL
  // ============================================================

  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // ============================================================
  // CHAT
  // ============================================================

  const [isTyping, setIsTyping] = useState(false);
  const [isDisappearing, setIsDisappearing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);

  // Evita que el INSERT realtime agregue dos veces el mismo mensaje
  const messageIdsRef = useRef<Set<string>>(new Set());

  // Evita reproducir sonido por cada mensaje al cargar el historial
  const initialMessagesLoadedRef = useRef(false);

  // ============================================================
  // AUTO SCROLL
  // ============================================================

  const flatListRef = useRef<FlatList>(null);

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  };

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

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, []);

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
      Alert.alert(
        'No compatible',
        'La grabación de notas de voz no está soportada directamente en la versión web.'
      );
      return;
    }

    try {
      const permission =
        await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permiso denegado',
          'Se necesita permiso para utilizar el micrófono.'
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      setIsRecording(true);
    } catch (error: any) {
      console.error('Error al iniciar grabación:', error);

      setIsRecording(false);

      Alert.alert(
        'Error',
        'No se pudo iniciar la grabación de audio.'
      );
    }
  };

  const stopAndSendRecording = async () => {
    if (!isRecording) return;

    try {
      setIsRecording(false);

      await audioRecorder.stop();

      const uri = audioRecorder.uri;

      if (!uri) {
        Alert.alert(
          'Error',
          'No se encontró el archivo de audio grabado.'
        );
        return;
      }

      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

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

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName);

      await sendMessage(
        null,
        `🎤 [Nota de voz]\n${publicUrl}`
      );
    } catch (error: any) {
      console.error('Error enviando audio:', error);

      Alert.alert(
        'Error',
        'No se pudo enviar el audio: ' +
          (error?.message || 'Error desconocido')
      );
    } finally {
      setUploading(false);
      setIsRecording(false);
    }
  };

  // ============================================================
  // DETECTAR NOTA DE VOZ
  // ============================================================

  const getAudioUrlFromMessage = (item: any): string | null => {
    if (!item?.content) return null;

    if (
      typeof item.content === 'string' &&
      item.content.startsWith('🎤 [Nota de voz]')
    ) {
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

  // ============================================================
  // REPRODUCIR NOTA DE VOZ
  // ============================================================

  const playVoiceMessage = async (item: any) => {
    const audioUrl = getAudioUrlFromMessage(item);

    if (!audioUrl) {
      Alert.alert(
        'Audio',
        'No se encontró la dirección del archivo de audio.'
      );
      return;
    }

    try {
      // Si tocamos el mismo audio que está reproduciéndose,
      // lo detenemos.
      if (
        playingAudioId === item.id &&
        audioPlayerRef.current
      ) {
        audioPlayerRef.current.pause();

        audioPlayerRef.current.remove();
        audioPlayerRef.current = null;

        setPlayingAudioId(null);

        return;
      }

      // Liberar reproductor anterior
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

      // Escuchar cambios de reproducción para saber cuándo terminó
      const subscription = player.addListener(
        'playbackStatusUpdate',
        (status: any) => {
          if (status?.didJustFinish) {
            try {
              subscription.remove();
            } catch {}

            try {
              player.remove();
            } catch {}

            if (audioPlayerRef.current === player) {
              audioPlayerRef.current = null;
            }

            setPlayingAudioId(null);
          }
        }
      );

      player.play();
    } catch (error: any) {
      console.error('Error reproduciendo audio:', error);

      setPlayingAudioId(null);

      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.remove();
        } catch {}

        audioPlayerRef.current = null;
      }

      Alert.alert(
        'Error',
        'No se pudo reproducir la nota de voz.'
      );
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
        try {
          player.remove();
        } catch {}
      }, 3000);
    } catch (error) {
      // El sonido es opcional.
      // Si no existe notification.mp3 no rompemos el chat.
      console.log('Sonido de notificación no disponible.');
    }
  }

  // ============================================================
  // SONIDO CUANDO LLEGA UN MENSAJE NUEVO
  // ============================================================

  useEffect(() => {
    scrollToBottom();

    if (!initialMessagesLoadedRef.current) {
      return;
    }

    if (!messages || messages.length === 0) {
      return;
    }

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
        const isAvailable =
          await ScreenCapture.isAvailableAsync();

        if (isAvailable) {
          await ScreenCapture.preventScreenCaptureAsync();
        }
      } catch (error) {
        console.log(
          'Error activando protección de pantalla:',
          error
        );
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
  // BLOQUEAR USUARIO
  // ============================================================

  const handleBlockUser = async () => {
    if (!currentUserId || !receiverIdString) return;

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
                blocker_id: currentUserId,
                blocked_id: receiverIdString,
              });

            if (error) {
              // Si ya existe el bloqueo
              if (error.code === '23505') {
                setIsBlocked(true);
                return;
              }

              Alert.alert(
                'Error',
                'No se pudo bloquear al usuario.'
              );
            } else {
              Alert.alert(
                'Bloqueado',
                'Usuario bloqueado correctamente.'
              );

              setIsBlocked(true);
            }
          },
        },
      ]
    );
  };

  // ============================================================
  // DESBLOQUEAR
  // ============================================================

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
              Alert.alert(
                'Error',
                'No se pudo desbloquear al usuario.'
              );
            } else {
              Alert.alert(
                'Desbloqueado',
                'Has desbloqueado a este usuario.'
              );

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

  // ============================================================
  // COMPROBAR BLOQUEO
  // ============================================================

  const checkBlockStatus = async (userId: string) => {
    if (!receiverIdString) return;

    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .or(
        `and(blocker_id.eq.${userId},blocked_id.eq.${receiverIdString}),and(blocker_id.eq.${receiverIdString},blocked_id.eq.${userId})`
      );

    if (error) {
      console.log(
        'Error comprobando bloqueo:',
        error.message
      );

      setIsBlocked(false);
      return;
    }

    setIsBlocked(Boolean(data && data.length > 0));
  };

  // ============================================================
  // MARCAR MENSAJES COMO LEÍDOS
  // ============================================================

  const markMessagesAsRead = async (userId: string) => {
    if (!receiverIdString) return;

    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('sender_id', receiverIdString)
      .eq('receiver_id', userId)
      .eq('is_read', false);
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
      .order('created_at', {
        ascending: true,
      });

    if (error) {
      console.error(
        'Error cargando mensajes:',
        error.message
      );
      return;
    }

    if (data) {
      setMessages(data);

      messageIdsRef.current.clear();

      data.forEach((message) => {
        if (message.id) {
          messageIdsRef.current.add(message.id);
        }
      });

      // Muy importante:
      // El historial ya está cargado.
      // A partir de aquí sí debemos avisar de mensajes nuevos.
      initialMessagesLoadedRef.current = true;
    }
  };

  // ============================================================
  // CONFIGURACIÓN REALTIME
  // ============================================================

  useEffect(() => {
    let isMounted = true;

    const setupChat = async () => {
      if (!receiverIdString) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted) return;

      const userId = user.id;

      setCurrentUserId(userId);

      await checkBlockStatus(userId);
      await fetchMessages(userId);
      await markMessagesAsRead(userId);

      if (!isMounted) return;

      const sortedIds = [userId, receiverIdString].sort();

      /*
       * NO usamos Date.now() aquí.
       *
       * Ambos dispositivos necesitan poder entrar
       * al mismo canal para typing/broadcast.
       */
      const roomName = `room_${sortedIds[0]}_${sortedIds[1]}`;

      // Si existía un canal anterior, eliminarlo
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

      // ========================================================
      // INSERT DE MENSAJES
      // ========================================================

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
            (newMsg.sender_id === userId &&
              newMsg.receiver_id === receiverIdString) ||
            (newMsg.sender_id === receiverIdString &&
              newMsg.receiver_id === userId);

          if (!belongsToConversation) return;

          /*
           * Evitar duplicados.
           */
          if (messageIdsRef.current.has(newMsg.id)) {
            return;
          }

          messageIdsRef.current.add(newMsg.id);

          setMessages((prev) => [...prev, newMsg]);

          // Si recibimos mensaje del otro usuario,
          // marcarlo inmediatamente como leído.
          if (newMsg.sender_id === receiverIdString) {
            markMessagesAsRead(userId);
          }
        }
      );

      // ========================================================
      // UPDATE DE MENSAJES
      // ========================================================

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
            (updatedMsg.sender_id === userId &&
              updatedMsg.receiver_id === receiverIdString) ||
            (updatedMsg.sender_id === receiverIdString &&
              updatedMsg.receiver_id === userId);

          if (!belongsToConversation) return;

          messageIdsRef.current.add(updatedMsg.id);

          setMessages((prev) =>
            prev.map((message) =>
              message.id === updatedMsg.id
                ? updatedMsg
                : message
            )
          );
        }
      );

      // ========================================================
      // TYPING
      // ========================================================

      channel.on(
        'broadcast',
        {
          event: 'typing',
        },
        (payload: any) => {
          if (!isMounted) return;

          if (
            payload?.payload?.userId === receiverIdString
          ) {
            setIsTyping(
              Boolean(payload?.payload?.isTyping)
            );
          }
        }
      );

      // ========================================================
      // SUSCRIBIR
      // ========================================================

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log(
            'Chat realtime conectado:',
            roomName
          );
        }

        if (status === 'CHANNEL_ERROR') {
          console.log(
            'Error en canal realtime del chat.'
          );
        }
      });

      channelRef.current = channel;
    };

    setupChat();

    return () => {
      isMounted = false;

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

    if (text.trim().length === 0) {
      return;
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (
        channelRef.current &&
        currentUserId
      ) {
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
    const textToSend =
      customContent !== null
        ? customContent
        : inputText.trim();

    if (
      (!textToSend && !imageUrl) ||
      !currentUserId ||
      !receiverIdString
    ) {
      return;
    }

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
      if (isDisappearing) {
        content = '🔥 [Foto Temporal]';
      } else if (imageUrl.includes('/audio_')) {
        content = `🎤 [Nota de voz]\n${imageUrl}`;
      } else {
        content = '📷 [Imagen]';
      }
    }

    const disappearing = isDisappearing;

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
      Alert.alert(
        'Error',
        error.message
      );
      return;
    }

    /*
     * Si Supabase Realtime tarda o no está disponible,
     * mostramos inmediatamente nuestro propio mensaje.
     *
     * El Set evita que posteriormente realtime
     * lo agregue de nuevo.
     */
    if (data?.id) {
      messageIdsRef.current.add(data.id);

      setMessages((prev) => {
        const alreadyExists = prev.some(
          (message) => message.id === data.id
        );

        if (alreadyExists) {
          return prev;
        }

        return [...prev, data];
      });
    }

    setIsDisappearing(false);
  };

  // ============================================================
  // ENVIAR UBICACIÓN
  // ============================================================

  const handleSendLocation = async () => {
    try {
      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permiso denegado',
          'Se requieren permisos de ubicación para enviar tu posición.'
        );
        return;
      }

      const location =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

      const {
        latitude,
        longitude,
      } = location.coords;

      const mapsLink =
        `https://www.google.com/maps?q=${latitude},${longitude}`;

      const locationMessage =
        `📍 [Ubicación compartida]\n${mapsLink}`;

      await sendMessage(
        null,
        locationMessage
      );
    } catch (error) {
      console.error(
        'Error GPS:',
        error
      );

      Alert.alert(
        'Error',
        'No se pudo obtener la ubicación actual.'
      );
    }
  };

  // ============================================================
  // SELECCIONAR Y ENVIAR IMAGEN
  // ============================================================

  const pickAndSendImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.status !== 'granted') {
        Alert.alert(
          'Permiso denegado',
          'Se necesita acceso a la galería.'
        );
        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.7,
        });

      if (result.canceled) return;

      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert(
          'Error',
          'No se encontró el usuario actual.'
        );
        return;
      }

      const imageUri =
        result.assets[0].uri;

      const extensionMatch =
        imageUri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);

      const fileExt =
        extensionMatch?.[1]?.toLowerCase() || 'jpg';

      const mimeType =
        fileExt === 'png'
          ? 'image/png'
          : fileExt === 'webp'
          ? 'image/webp'
          : 'image/jpeg';

      const fileName =
        `chat_${user.id}_${Date.now()}.${fileExt}`;

      const response =
        await fetch(imageUri);

      const blob =
        await response.blob();

      const {
        error: uploadError,
      } = await supabase.storage
        .from('chat-images')
        .upload(
          fileName,
          blob,
          {
            contentType: mimeType,
            upsert: false,
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName);

      await sendMessage(publicUrl);
    } catch (error: any) {
      console.error(
        'Error enviando imagen:',
        error
      );

      Alert.alert(
        'Error',
        'No se pudo enviar la imagen: ' +
          (error?.message || 'Error desconocido')
      );
    } finally {
      setUploading(false);
    }
  };

  // ============================================================
  // ABRIR IMAGEN
  // ============================================================

  const handleOpenImage = (item: any) => {
    setSelectedImage(item);
    setModalVisible(true);
  };

  // ============================================================
  // DESTRUIR FOTO TEMPORAL
  // ============================================================

  const destroyImageViewed = async () => {
    if (!selectedImage) return;

    const item = selectedImage;

    setModalVisible(false);

    if (
      item.is_disappearing &&
      item.sender_id !== currentUserId &&
      !item.viewed
    ) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === item.id
            ? {
                ...message,
                viewed: true,
                image_url: null,
                content:
                  '🔥 [Foto vista y expirada]',
              }
            : message
        )
      );

      const { error } =
        await supabase
          .from('messages')
          .update({
            viewed: true,
            image_url: null,
            content:
              '🔥 [Foto vista y expirada]',
          })
          .eq('id', item.id);

      if (error) {
        console.log(
          'Error actualizando foto temporal:',
          error.message
        );
      }

      if (item.image_url) {
        try {
          const urlWithoutQuery =
            item.image_url.split('?')[0];

          const pathParts =
            urlWithoutQuery.split('/');

          const fileName =
            pathParts[pathParts.length - 1];

          if (fileName) {
            await supabase.storage
              .from('chat-images')
              .remove([fileName]);
          }
        } catch (error) {
          console.log(
            'Error eliminando foto temporal:',
            error
          );
        }
      }
    }

    setSelectedImage(null);
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <KeyboardAvoidingView
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : 'height'
      }
      style={styles.container}
      keyboardVerticalOffset={
        Platform.OS === 'ios'
          ? 0
          : 0
      }
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

      <LinearGradient
        colors={[
          Colors.surface,
          Colors.background,
        ]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={handleGoBack}
            activeOpacity={0.8}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>
              ←
            </Text>
          </TouchableOpacity>

          <View style={styles.headerTextWrapper}>
            <Text style={styles.logo}>
              N·O·W
            </Text>

            <Text
              style={styles.headerTitle}
              numberOfLines={1}
            >
              Chat con{' '}
              {receiverNameString ||
                'Usuario'}
            </Text>

            {isTyping &&
              !isBlocked && (
                <Text
                  style={
                    styles.typingIndicator
                  }
                >
                  Escribiendo...
                </Text>
              )}
          </View>

          <TouchableOpacity
            onPress={
              isBlocked
                ? handleUnblockUser
                : handleBlockUser
            }
            style={[
              styles.blockBtn,
              isBlocked &&
                styles.unblockBtnActive,
            ]}
            activeOpacity={0.8}
          >
            <Text
              style={
                styles.blockBtnText
              }
            >
              {isBlocked
                ? '✅'
                : '⛔'}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ======================================================
          LISTA DE MENSAJES
      ====================================================== */}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) =>
          item.id?.toString() ||
          `message-${index}`
        }
        renderItem={({ item }) => {
          const isMe =
            item.sender_id ===
            currentUserId;

          const isExpiredPhoto =
            item.is_disappearing &&
            (item.viewed ||
              !item.image_url);

          const audioMessage =
            isAudioMessage(item);

          const audioPlaying =
            playingAudioId === item.id;

          const locationMessage =
            typeof item.content ===
              'string' &&
            item.content.startsWith(
              '📍 [Ubicación compartida]'
            );

          return (
            <View
              style={[
                styles.messageBubble,
                isMe
                  ? styles.myMessage
                  : styles.otherMessage,
              ]}
            >
              {/* IMAGEN */}
              {item.image_url &&
              !isExpiredPhoto ? (
                <TouchableOpacity
                  onPress={() =>
                    handleOpenImage(item)
                  }
                  activeOpacity={0.9}
                >
                  <Image
                    source={{
                      uri: item.image_url,
                    }}
                    style={
                      styles.chatImage
                    }
                    resizeMode="cover"
                  />

                  {item.is_disappearing && (
                    <Text
                      style={
                        styles.disappearingBadge
                      }
                    >
                      🔥 Toca para ver
                      {' '}
                      (Temporal)
                    </Text>
                  )}
                </TouchableOpacity>
              ) : audioMessage ? (
                /* NOTA DE VOZ */
                <TouchableOpacity
                  onPress={() =>
                    playVoiceMessage(item)
                  }
                  style={[
                    styles.audioMessageButton,
                    isMe
                      ? styles.audioMessageButtonMe
                      : styles.audioMessageButtonOther,
                  ]}
                  activeOpacity={0.8}
                >
                  <View
                    style={
                      styles.audioIconCircle
                    }
                  >
                    <Ionicons
                      name={
                        audioPlaying
                          ? 'pause'
                          : 'play'
                      }
                      size={18}
                      color="#000000"
                    />
                  </View>

                  <View
                    style={
                      styles.audioTextContainer
                    }
                  >
                    <Text
                      style={[
                        styles.audioTitle,
                        isMe
                          ? styles.myMessageText
                          : styles.otherMessageText,
                      ]}
                    >
                      Nota de voz
                    </Text>

                    <Text
                      style={[
                        styles.audioSubtitle,
                        isMe
                          ? styles.myMessageText
                          : styles.otherMessageText,
                      ]}
                    >
                      {audioPlaying
                        ? 'Reproduciendo...'
                        : 'Toca para escuchar'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : locationMessage ? (
                /* UBICACIÓN */
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    const parts =
                      item.content.split('\n');

                    const url =
                      parts[1];

                    if (url) {
                      Alert.alert(
                        'Ubicación compartida',
                        'Abre Google Maps para ver la ubicación.',
                        [
                          {
                            text: 'Cerrar',
                            style: 'cancel',
                          },
                          {
                            text: 'Abrir',
                            onPress: () => {
                              // React Native abrirá el enlace
                              // mediante Linking.
                              import('react-native')
                                .then(
                                  ({
                                    Linking,
                                  }) => {
                                    Linking.openURL(
                                      url
                                    );
                                  }
                                );
                            },
                          },
                        ]
                      );
                    }
                  }}
                  style={
                    styles.locationMessage
                  }
                >
                  <Text
                    style={
                      styles.locationIcon
                    }
                  >
                    📍
                  </Text>

                  <View>
                    <Text
                      style={[
                        styles.locationTitle,
                        isMe
                          ? styles.myMessageText
                          : styles.otherMessageText,
                      ]}
                    >
                      Ubicación compartida
                    </Text>

                    <Text
                      style={[
                        styles.locationSubtitle,
                        isMe
                          ? styles.myMessageText
                          : styles.otherMessageText,
                      ]}
                    >
                      Toca para abrir
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : (
                /* TEXTO */
                <Text
                  style={[
                    styles.messageText,
                    isMe
                      ? styles.myMessageText
                      : styles.otherMessageText,
                  ]}
                >
                  {item.content}
                </Text>
              )}
            </View>
          );
        }}
        contentContainerStyle={
          styles.messageList
        }
        onContentSizeChange={
          scrollToBottom
        }
        onLayout={
          scrollToBottom
        }
        keyboardShouldPersistTaps="handled"
      />

      {/* ======================================================
          MODAL DE IMAGEN
      ====================================================== */}

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={
          destroyImageViewed
        }
      >
        <View
          style={
            styles.imageModalOverlay
          }
        >
          {selectedImage && (
            <View
              style={
                styles.imageModalContainer
              }
            >
              <Image
                source={{
                  uri: selectedImage.image_url,
                }}
                style={
                  styles.fullScreenImage
                }
                resizeMode="contain"
              />

              {selectedImage.is_disappearing &&
                selectedImage.sender_id !==
                  currentUserId &&
                !selectedImage.viewed && (
                  <Text
                    style={
                      styles.modalWarningText
                    }
                  >
                    🔥 Esta foto se
                    destruirá al cerrar
                  </Text>
                )}

              <TouchableOpacity
                style={
                  styles.closeModalButton
                }
                onPress={
                  destroyImageViewed
                }
                activeOpacity={0.8}
              >
                <Text
                  style={
                    styles.closeModalButtonText
                  }
                >
                  Cerrar y Destruir
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* ======================================================
          SUBIENDO
      ====================================================== */}

      {uploading && (
        <View
          style={
            styles.uploadingContainer
          }
        >
          <ActivityIndicator
            size="small"
            color={Colors.primary}
          />

          <Text
            style={
              styles.uploadingText
            }
          >
            Enviando contenido...
          </Text>
        </View>
      )}

      {/* ======================================================
          INPUT / BLOQUEO
      ====================================================== */}

      {isBlocked ? (
        <View
          style={
            styles.blockedNoticeContainer
          }
        >
          <Text
            style={
              styles.blockedNoticeText
            }
          >
            Has bloqueado o te han
            bloqueado en esta
            conversación.
          </Text>

          <TouchableOpacity
            style={
              styles.unblockActionBtn
            }
            onPress={
              handleUnblockUser
            }
            activeOpacity={0.8}
          >
            <Text
              style={
                styles.unblockActionText
              }
            >
              Desbloquear usuario
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={
            styles.inputContainer
          }
        >
          <View
            style={
              styles.topInputRow
            }
          >
            <TextInput
              style={styles.input}
              placeholder={
                isRecording
                  ? 'Grabando nota de voz...'
                  : isDisappearing
                  ? 'Foto temporal...'
                  : 'Envía un mensaje apasionante...'
              }
              placeholderTextColor={
                Colors.textMuted
              }
              value={inputText}
              onChangeText={
                handleTextChange
              }
              multiline
              editable={!isRecording}
            />

            <TouchableOpacity
              style={[
                styles.sendButton,
                isRecording && {
                  backgroundColor:
                    '#ef4444',
                },
              ]}
              onPress={() => {
                if (
                  inputText.trim()
                    .length > 0
                ) {
                  sendMessage(
                    null,
                    null
                  );
                } else if (
                  isRecording
                ) {
                  stopAndSendRecording();
                } else {
                  startRecording();
                }
              }}
              disabled={uploading}
              activeOpacity={0.8}
            >
              {inputText.trim()
                .length > 0 ? (
                <Ionicons
                  name="flash"
                  size={22}
                  color="#000000"
                />
              ) : (
                <Ionicons
                  name={
                    isRecording
                      ? 'stop'
                      : 'mic'
                  }
                  size={22}
                  color="#000000"
                />
              )}
            </TouchableOpacity>
          </View>

          <View
            style={
              styles.bottomButtonsRow
            }
          >
            {/* IMAGEN */}
            <TouchableOpacity
              style={
                styles.mediaButton
              }
              onPress={
                pickAndSendImage
              }
              disabled={
                uploading ||
                isRecording
              }
              activeOpacity={0.8}
            >
              <Text
                style={
                  styles.mediaButtonIcon
                }
              >
                📷 Cámara
              </Text>
            </TouchableOpacity>

            {/* UBICACIÓN */}
            <TouchableOpacity
              style={
                styles.mediaButton
              }
              onPress={
                handleSendLocation
              }
              disabled={
                uploading ||
                isRecording
              }
              activeOpacity={0.8}
            >
              <Text
                style={
                  styles.mediaButtonIcon
                }
              >
                📍 Ubicación
              </Text>
            </TouchableOpacity>

            {/* TEMPORAL */}
            <TouchableOpacity
              style={[
                styles.fireButton,
                isDisappearing &&
                  styles.fireButtonActive,
              ]}
              onPress={() =>
                setIsDisappearing(
                  !isDisappearing
                )
              }
              disabled={
                isRecording
              }
              activeOpacity={0.8}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                }}
              >
                🔥 Temporal
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ============================================================
// ESTILOS
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor:
      Colors.background,
  },

  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderBottomWidth: 2,
    borderBottomColor:
      Colors.borderPrimary,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },

  headerContent: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
  },

  backButton: {
    marginRight: 12,
    padding: 4,
  },

  backButtonText: {
    color: Colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
  },

  headerTextWrapper: {
    flex: 1,
  },

  logo: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 3,
    marginBottom: 2,
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },

  typingIndicator: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: 'bold',
    marginTop: 2,
  },

  blockBtn: {
    padding: 8,
    backgroundColor:
      Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor:
      Colors.borderPrimary,
  },

  unblockBtnActive: {
    backgroundColor:
      'rgba(34, 197, 94, 0.3)',
  },

  blockBtnText: {
    fontSize: 16,
  },

  messageList: {
    padding: 16,
    paddingBottom: 10,
  },

  messageBubble: {
    padding: 12,
    borderRadius: 16,
    marginVertical: 6,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },

  myMessage: {
    backgroundColor:
      Colors.accentRed,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },

  otherMessage: {
    backgroundColor:
      Colors.card,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor:
      Colors.borderSecondary,
  },

  messageText: {
    fontSize: 15,
  },

  myMessageText: {
    color: Colors.textPrimary,
    fontWeight: '500',
  },

  otherMessageText: {
    color: Colors.textSecondary,
  },

  chatImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor:
      Colors.surface,
  },

  disappearingBadge: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: 'bold',
    marginTop: 2,
    textAlign: 'center',
  },

  // ==========================================================
  // AUDIO
  // ==========================================================

  audioMessageButton: {
    minWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },

  audioMessageButtonMe: {
    backgroundColor:
      'rgba(0, 0, 0, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 4,
  },

  audioMessageButtonOther: {
    backgroundColor:
      'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    paddingHorizontal: 4,
  },

  audioIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor:
      Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  audioTextContainer: {
    marginLeft: 10,
    flex: 1,
  },

  audioTitle: {
    fontSize: 14,
    fontWeight: '700',
  },

  audioSubtitle: {
    fontSize: 11,
    opacity: 0.75,
    marginTop: 2,
  },

  // ==========================================================
  // UBICACIÓN
  // ==========================================================

  locationMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 180,
    paddingVertical: 4,
  },

  locationIcon: {
    fontSize: 28,
    marginRight: 10,
  },

  locationTitle: {
    fontSize: 14,
    fontWeight: '700',
  },

  locationSubtitle: {
    fontSize: 11,
    opacity: 0.75,
    marginTop: 2,
  },

  // ==========================================================
  // UPLOAD
  // ==========================================================

  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    backgroundColor:
      Colors.surface,
  },

  uploadingText: {
    marginLeft: 8,
    color: Colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // ==========================================================
  // INPUT
  // ==========================================================

  inputContainer: {
    flexDirection: 'column',
    padding: 12,
    backgroundColor:
      Colors.surface,
    borderTopWidth: 2,
    borderTopColor:
      Colors.borderSecondary,
  },

  topInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  bottomButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginTop: 4,
  },

  mediaButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 10,
    marginHorizontal: 4,
    backgroundColor:
      Colors.card,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent:
      'center',
    borderWidth: 1,
    borderColor:
      Colors.borderPrimary,
  },

  mediaButtonIcon: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  fireButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 10,
    marginHorizontal: 4,
    backgroundColor:
      Colors.card,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent:
      'center',
    opacity: 0.6,
    borderWidth: 1,
    borderColor:
      Colors.borderSecondary,
  },

  fireButtonActive: {
    opacity: 1,
    backgroundColor:
      '#7f1d1d',
    transform: [
      {
        scale: 1.02,
      },
    ],
  },

  input: {
    flex: 1,
    backgroundColor:
      Colors.background,
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textPrimary,
    maxHeight: 100,
  },

  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor:
      Colors.primary,
    borderRadius: 22,
    width: 44,
    height: 44,
    shadowColor:
      Colors.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },

  // ==========================================================
  // BLOQUEO
  // ==========================================================

  blockedNoticeContainer: {
    padding: 16,
    backgroundColor:
      Colors.surface,
    borderTopWidth: 2,
    borderTopColor:
      Colors.borderPrimary,
    alignItems: 'center',
  },

  blockedNoticeText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: 'bold',
  },

  unblockActionBtn: {
    backgroundColor:
      Colors.borderPrimary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },

  unblockActionText: {
    color: Colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 14,
  },

  // ==========================================================
  // MODAL IMAGEN
  // ==========================================================

  imageModalOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(5, 5, 5, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  imageModalContainer: {
    width: '100%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  fullScreenImage: {
    width: '100%',
    height: '80%',
    borderRadius: 12,
    borderWidth: 2,
    borderColor:
      Colors.borderSecondary,
  },

  modalWarningText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
    marginVertical: 12,
  },

  closeModalButton: {
    backgroundColor:
      Colors.borderPrimary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginTop: 10,
  },

  closeModalButtonText: {
    color: Colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 16,
  },
});