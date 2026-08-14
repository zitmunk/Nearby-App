import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';
import { Colors } from './constants/Colors';

export default function ChatScreen() {
  const { receiverId, receiverName } = useLocalSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // --- NUEVOS ESTADOS PARA EL VISOR DE IMÁGENES (MODAL) ---
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

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

  // --- BLOQUEO DE CAPTURAS DE PANTALLA ---
  useEffect(() => {
    const setupScreenProtection = async () => {
      try {
        const isAvailable = await ScreenCapture.isAvailableAsync();
        if (isAvailable) {
          await ScreenCapture.preventScreenCaptureAsync();
        }
      } catch (error) {
        console.log("Error activando protección de pantalla:", error);
      }
    };

    setupScreenProtection();

    // Al salir del chat, permitimos nuevamente la captura de pantalla
    return () => {
      ScreenCapture.allowScreenCaptureAsync();
    };
  }, [receiverId]);

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

      const sortedIds = [userId, receiverId].sort();
      const roomName = `room_${sortedIds[0]}_${sortedIds[1]}`;

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

  const handleOpenImage = (item: any) => {
    setSelectedImage(item);
    setModalVisible(true);
  };

  const destroyImageViewed = async () => {
    if (!selectedImage) return;

    const item = selectedImage;
    setModalVisible(false);

    if (item.is_disappearing && item.sender_id !== currentUserId && !item.viewed) {
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
    setSelectedImage(null);
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <LinearGradient colors={[Colors.primary, Colors.background]} style={styles.header}>
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

      <Modal visible={modalVisible} transparent={true} animationType="fade" onRequestClose={destroyImageViewed}>
        <View style={styles.imageModalOverlay}>
          {selectedImage && (
            <View style={styles.imageModalContainer}>
              <Image 
                source={{ uri: selectedImage.image_url }} 
                style={styles.fullScreenImage} 
                resizeMode="contain" 
              />
              {selectedImage.is_disappearing && selectedImage.sender_id !== currentUserId && !selectedImage.viewed && (
                <Text style={styles.modalWarningText}>🔥 Esta foto se destruirá al cerrar</Text>
              )}
              <TouchableOpacity 
                style={styles.closeModalButton} 
                onPress={destroyImageViewed}
                activeOpacity={0.8}
              >
                <Text style={styles.closeModalButtonText}>Cerrar y Destruir</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {uploading && (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="small" color={Colors.primaryLight} />
          <Text style={styles.uploadingText}>Enviando imagen...</Text>
        </View>
      )}

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
            placeholderTextColor={Colors.textSecondary}
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
  container: { flex: 1, backgroundColor: Colors.background },
  
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
  backButtonText: { color: Colors.textPrimary, fontSize: 24, fontWeight: 'bold' },
  headerTextWrapper: { flex: 1 },
  logo: { fontSize: 14, fontWeight: '900', color: Colors.primaryLight, letterSpacing: 3, marginBottom: 2 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  typingIndicator: { fontSize: 11, color: Colors.primaryLight, fontWeight: 'bold', marginTop: 2 },
  
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
  myMessage: { backgroundColor: Colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  otherMessage: { backgroundColor: Colors.cardBackground, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  
  messageText: { fontSize: 15 },
  myMessageText: { color: Colors.textPrimary },
  otherMessageText: { color: Colors.textPrimary },
  
  chatImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 6, backgroundColor: Colors.surface },
  disappearingBadge: { fontSize: 11, color: Colors.primaryLight, fontWeight: 'bold', marginTop: 2, textAlign: 'center' },
  
  uploadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8, backgroundColor: Colors.surface },
  uploadingText: { marginLeft: 8, color: Colors.textSecondary, fontSize: 12, fontWeight: '500' },
  
  inputContainer: { 
    flexDirection: 'row', 
    padding: 12, 
    backgroundColor: Colors.surface, 
    borderTopWidth: 1, 
    borderTopColor: Colors.border, 
    alignItems: 'center' 
  },
  mediaButton: { 
    padding: 8, 
    marginRight: 4, 
    backgroundColor: Colors.cardBackground, 
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mediaButtonIcon: { fontSize: 16 },
  
  fireButton: { 
    padding: 8, 
    marginRight: 8, 
    backgroundColor: Colors.cardBackground, 
    borderRadius: 20, 
    alignItems: 'center', 
    justifyContent: 'center',
    opacity: 0.4 
  },
  fireButtonActive: { opacity: 1, backgroundColor: Colors.primary, transform: [{ scale: 1.05 }] },
  
  input: { 
    flex: 1, 
    backgroundColor: Colors.background, 
    borderWidth: 1, 
    borderColor: Colors.border, 
    borderRadius: 20, 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    fontSize: 15, 
    color: Colors.textPrimary,
    maxHeight: 100
  },
  
  sendButton: { 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingVertical: 10,
    paddingHorizontal: 16, 
    marginLeft: 8, 
    backgroundColor: Colors.primary, 
    borderRadius: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3
  },
  sendButtonText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
  
  blockedNoticeContainer: { 
    padding: 16, 
    backgroundColor: Colors.surface, 
    borderTopWidth: 1, 
    borderTopColor: Colors.danger, 
    alignItems: 'center' 
  },
  blockedNoticeText: { color: Colors.danger, fontSize: 13, textAlign: 'center', marginBottom: 8, fontWeight: '500' },
  unblockActionBtn: { backgroundColor: Colors.danger, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  unblockActionText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },

  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
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
  },
  modalWarningText: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: 'bold',
    marginVertical: 12,
  },
  closeModalButton: {
    backgroundColor: Colors.danger,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginTop: 10,
  },
  closeModalButtonText: {
    color: Colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 16,
  }
});