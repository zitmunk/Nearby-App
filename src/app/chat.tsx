import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function ChatScreen() {
  const { receiverId, receiverName } = useLocalSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // --- ESTADOS Y REFERENCIAS PARA "ESCRIBIENDO...", "AUTODESTRUCCIÓN" Y "BLOQUEO" ---
  const [isTyping, setIsTyping] = useState(false);
  const [isDisappearing, setIsDisappearing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);

  // --- REFERENCIA PARA EL AUTO-SCROLL ---
  const flatListRef = useRef<FlatList>(null);

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- FUNCIÓN: BLOQUEAR USUARIO ---
  const handleBlockUser = async () => {
    Alert.alert("Bloquear usuario", "¿Estás seguro de que quieres bloquear a este usuario?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Bloquear", style: "destructive", onPress: async () => {
        const { error } = await supabase
          .from('blocks')
          .insert({ blocker_id: currentUserId, blocked_id: receiverId });

        if (error) {
          Alert.alert('Error', 'No se pudo bloquear al usuario.');
        } else {
          Alert.alert('Bloqueado', 'Usuario bloqueado correctamente.');
          setIsBlocked(true);
        }
      }}
    ]);
  };

  // --- FUNCIÓN: DESBLOQUEAR USUARIO ---
  const handleUnblockUser = async () => {
    Alert.alert("Desbloquear usuario", "¿Quieres desbloquear a este usuario?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Desbloquear", onPress: async () => {
        const { error } = await supabase
          .from('blocks')
          .delete()
          .or(`and(blocker_id.eq.${currentUserId},blocked_id.eq.${receiverId}),and(blocker_id.eq.${receiverId},blocked_id.eq.${currentUserId})`);

        if (error) {
          Alert.alert('Error', 'No se pudo desbloquear al usuario.');
        } else {
          Alert.alert('Desbloqueado', 'Has desbloqueado a este usuario.');
          setIsBlocked(false);
          if (currentUserId) fetchMessages(currentUserId);
        }
      }}
    ]);
  };

  // --- FUNCIÓN: VALIDAR BLOQUEO AL ENTRAR ---
  const checkBlockStatus = async (userId: string) => {
    const { data } = await supabase
      .from('blocks')
      .select('*')
      .or(`and(blocker_id.eq.${userId},blocked_id.eq.${receiverId}),and(blocker_id.eq.${receiverId},blocked_id.eq.${userId})`);
      
    if (data && data.length > 0) {
      setIsBlocked(true);
    }
  };

  const markMessagesAsRead = async (userId: string) => {
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('sender_id', receiverId)
      .eq('receiver_id', userId)
      .eq('is_read', false);
  };

  useEffect(() => {
    let channel: any = null;

    const setupChat = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;

      const userId = data.user.id;
      setCurrentUserId(userId);
      await checkBlockStatus(userId);
      fetchMessages(userId);
      markMessagesAsRead(userId);

      // Creamos un ID de sala único y compartido ordenando los IDs alfabéticamente
      const sortedIds = [userId, receiverId].sort();
      const roomName = `room_${sortedIds[0]}_${sortedIds[1]}`;

      // Canal unificado con Broadcast y Postgres Changes
      channel = supabase.channel(roomName, {
        config: {
          broadcast: { self: false },
        },
      });

      channelRef.current = channel;

      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: any) => {
          const newMsg = payload.new;
          if (
            (newMsg.sender_id === userId && newMsg.receiver_id === receiverId) ||
            (newMsg.sender_id === receiverId && newMsg.receiver_id === userId)
          ) {
            setMessages((prev) => [...prev, newMsg]);
            if (newMsg.sender_id === receiverId) {
              markMessagesAsRead(userId);
            }
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload: any) => {
          const updatedMsg = payload.new;
          setMessages((prev) => prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)));
        })
        .on('broadcast', { event: 'typing' }, (payload: any) => {
          if (payload.payload.userId === receiverId) {
            setIsTyping(payload.payload.isTyping);
          }
        })
        .subscribe();
    };

    setupChat();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [receiverId]);

  // --- MANEJO DE EVENTO CUANDO ESCRIBES ---
  const handleTextChange = (text: string) => {
    setInputText(text);

    if (!channelRef.current || !currentUserId) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId, isTyping: true },
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      if (channelRef.current && currentUserId) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: currentUserId, isTyping: false },
        });
      }
    }, 2000);
  };

  const fetchMessages = async (userId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${userId})`)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const sendMessage = async (imageUrl: string | null = null) => {
    if ((!inputText.trim() && !imageUrl) || !currentUserId || !receiverId) return;

    if (channelRef.current && currentUserId) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, isTyping: false },
      });
    }

    const contentText = inputText.trim();
    setInputText('');

    const { error } = await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: receiverId,
      content: imageUrl ? (isDisappearing ? '🔥 [Foto Temporal]' : '📷 [Imagen]') : contentText,
      image_url: imageUrl,
      is_read: false,
      is_disappearing: isDisappearing,
      viewed: false,
    });

    if (error) {
      Alert.alert('Error', error.message);
    }
    setIsDisappearing(false);
  };

  const pickAndSendImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita acceso a la galería.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (result.canceled) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const imageUri = result.assets[0].uri;
      const fileExt = imageUri.substring(imageUri.lastIndexOf('.') + 1);
      const fileName = `chat_${user.id}_${Date.now()}.${fileExt}`;

      const response = await fetch(imageUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(fileName, blob, { contentType: `image/${fileExt}` });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName);

      await sendMessage(publicUrl);
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo enviar la imagen: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleOpenImage = async (item: any) => {
    if (item.is_disappearing && !item.viewed && item.sender_id !== currentUserId) {
      Alert.alert(
        "Foto Temporal",
        "Esta foto desaparecerá para siempre al abrirse.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Ver foto",
            onPress: async () => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === item.id
                    ? { ...m, viewed: true, image_url: null, content: '🔥 [Foto vista y expirada]' }
                    : m
                )
              );

              await supabase
                .from('messages')
                .update({ viewed: true, image_url: null, content: '🔥 [Foto vista y expirada]' })
                .eq('id', item.id);

              if (item.image_url) {
                const pathParts = item.image_url.split('/');
                const fileName = pathParts[pathParts.length - 1];
                await supabase.storage.from('chat-images').remove([fileName]);
              }
            }
          }
        ]
      );
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* HEADER OSCURO CON DEGRADADO EN CIAN */}
      <LinearGradient colors={['#0284c7', '#090d16']} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerTextWrapper}>
            <Text style={styles.logo}>N·O·W</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>Chat con {receiverName || 'Usuario'}</Text>
            {isTyping && !isBlocked && <Text style={styles.typingIndicator}>Escribiendo...</Text>}
          </View>
          <TouchableOpacity 
            onPress={isBlocked ? handleUnblockUser : handleBlockUser} 
            style={[styles.blockBtn, isBlocked && styles.unblockBtnActive]}
            activeOpacity={0.8}
          >
            <Text style={styles.blockBtnText}>{isBlocked ? '✅' : '⛔'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMe = item.sender_id === currentUserId;
          const isExpiredPhoto = item.is_disappearing && (item.viewed || !item.image_url);

          return (
            <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.otherMessage]}>
              {item.image_url && !isExpiredPhoto ? (
                <TouchableOpacity onPress={() => handleOpenImage(item)} activeOpacity={0.9}>
                  <Image source={{ uri: item.image_url }} style={styles.chatImage} resizeMode="cover" />
                  {item.is_disappearing && (
                    <Text style={styles.disappearingBadge}>🔥 Toca para ver (Temporal)</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
                  {item.content}
                </Text>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
      />

      {uploading && (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="small" color="#38bdf8" />
          <Text style={styles.uploadingText}>Enviando imagen...</Text>
        </View>
      )}

      {/* INPUT MODERNO O AVISO DE BLOQUEO */}
      {isBlocked ? (
        <View style={styles.blockedNoticeContainer}>
          <Text style={styles.blockedNoticeText}>Has bloqueado o te han bloqueado en esta conversación.</Text>
          <TouchableOpacity style={styles.unblockActionBtn} onPress={handleUnblockUser} activeOpacity={0.8}>
            <Text style={styles.unblockActionText}>Desbloquear usuario</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.mediaButton} onPress={pickAndSendImage} disabled={uploading} activeOpacity={0.8}>
            <Text style={styles.mediaButtonIcon}>📷</Text>
          </TouchableOpacity>

          {/* BOTÓN DE AUTODESTRUCCIÓN DE FOTOS */}
          <TouchableOpacity 
            style={[styles.fireButton, isDisappearing && styles.fireButtonActive]} 
            onPress={() => setIsDisappearing(!isDisappearing)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 18 }}>🔥</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={isDisappearing ? "Foto temporal..." : "¡Escribe algo increíble..."}
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={handleTextChange}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage(null)} disabled={uploading} activeOpacity={0.8}>
            <Text style={styles.sendButtonText}>Enviar</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  
  header: { 
    paddingTop: 50, 
    paddingHorizontal: 20, 
    paddingBottom: 16, 
    borderBottomLeftRadius: 28, 
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6
  },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: { marginRight: 12, padding: 4 },
  backButtonText: { color: '#ffffff', fontSize: 24, fontWeight: 'bold' },
  headerTextWrapper: { flex: 1 },
  logo: { fontSize: 14, fontWeight: '900', color: '#bae6fd', letterSpacing: 3, marginBottom: 2 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#f9fafb' },
  typingIndicator: { fontSize: 11, color: '#38bdf8', fontWeight: 'bold', marginTop: 2 },
  
  blockBtn: { padding: 8, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 20 },
  unblockBtnActive: { backgroundColor: 'rgba(34, 197, 94, 0.3)' },
  blockBtnText: { fontSize: 16 },

  messageList: { padding: 16, paddingBottom: 10 },
  
  messageBubble: { 
    padding: 12, 
    borderRadius: 16, 
    marginVertical: 6, 
    maxWidth: '80%', 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2
  },
  myMessage: { backgroundColor: '#0284c7', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  otherMessage: { backgroundColor: '#1f2937', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  
  messageText: { fontSize: 15 },
  myMessageText: { color: '#ffffff' },
  otherMessageText: { color: '#f9fafb' },
  
  chatImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 6, backgroundColor: '#111827' },
  disappearingBadge: { fontSize: 11, color: '#38bdf8', fontWeight: 'bold', marginTop: 2, textAlign: 'center' },
  
  uploadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8, backgroundColor: '#111827' },
  uploadingText: { marginLeft: 8, color: '#94a3b8', fontSize: 12, fontWeight: '500' },
  
  inputContainer: { 
    flexDirection: 'row', 
    padding: 12, 
    backgroundColor: '#111827', 
    borderTopWidth: 1, 
    borderTopColor: '#1f2937', 
    alignItems: 'center' 
  },
  mediaButton: { 
    padding: 8, 
    marginRight: 4, 
    backgroundColor: '#1f2937', 
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mediaButtonIcon: { fontSize: 16 },
  
  fireButton: { 
    padding: 8, 
    marginRight: 8, 
    backgroundColor: '#1f2937', 
    borderRadius: 20, 
    alignItems: 'center', 
    justifyContent: 'center',
    opacity: 0.4 
  },
  fireButtonActive: { opacity: 1, backgroundColor: '#0c4a6e', transform: [{ scale: 1.05 }] },
  
  input: { 
    flex: 1, 
    backgroundColor: '#090d16', 
    borderWidth: 1, 
    borderColor: '#1f2937', 
    borderRadius: 20, 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    fontSize: 15, 
    color: '#f9fafb',
    maxHeight: 100
  },
  
  sendButton: { 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingVertical: 10,
    paddingHorizontal: 16, 
    marginLeft: 8, 
    backgroundColor: '#0284c7', 
    borderRadius: 20,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3
  },
  sendButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  
  blockedNoticeContainer: { 
    padding: 16, 
    backgroundColor: '#1e1b18', 
    borderTopWidth: 1, 
    borderTopColor: '#7f1d1d', 
    alignItems: 'center' 
  },
  blockedNoticeText: { color: '#f87171', fontSize: 13, textAlign: 'center', marginBottom: 8, fontWeight: '500' },
  unblockActionBtn: { backgroundColor: '#7f1d1d', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  unblockActionText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 }
});