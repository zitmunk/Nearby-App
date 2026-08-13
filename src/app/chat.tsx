import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router'; // Añadido useRouter
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function ChatScreen() {
  const { receiverId, receiverName } = useLocalSearchParams();
  const router = useRouter(); // Instanciado
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // --- NUEVA FUNCIÓN: BLOQUEAR USUARIO ---
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
          router.back();
        }
      }}
    ]);
  };

  // --- NUEVA FUNCIÓN: VALIDAR BLOQUEO AL ENTRAR ---
  const checkBlockStatus = async (userId: string) => {
    const { data } = await supabase
      .from('blocks')
      .select('*')
      .or(`and(blocker_id.eq.${userId},blocked_id.eq.${receiverId}),and(blocker_id.eq.${receiverId},blocked_id.eq.${userId})`);
      
    if (data && data.length > 0) {
      Alert.alert('Acceso denegado', 'No puedes chatear con este usuario.');
      router.back();
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
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserId(data.user.id);
        checkBlockStatus(data.user.id); // Validamos bloqueo al cargar
        fetchMessages(data.user.id);
        markMessagesAsRead(data.user.id);
      }
    });

    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new;
        if (
          (newMsg.sender_id === currentUserId && newMsg.receiver_id === receiverId) ||
          (newMsg.sender_id === receiverId && newMsg.receiver_id === currentUserId)
        ) {
          setMessages((prev) => [...prev, newMsg]);
          if (newMsg.sender_id === receiverId) {
            markMessagesAsRead(currentUserId!);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [receiverId, currentUserId]);

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

    const contentText = inputText.trim();
    setInputText('');

    const { error } = await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: receiverId,
      content: imageUrl ? '📷 [Imagen]' : contentText,
      image_url: imageUrl,
      is_read: false,
    });

    if (error) {
      Alert.alert('Error', error.message);
    }
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

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
      keyboardVerticalOffset={90}
    >
      {/* Encabezado con Botón de Bloquear */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat con {receiverName || 'Usuario'}</Text>
        <TouchableOpacity onPress={handleBlockUser} style={styles.blockBtn}>
          <Text style={styles.blockBtnText}>⛔</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMe = item.sender_id === currentUserId;
          return (
            <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.otherMessage]}>
              {item.image_url && (
                <Image source={{ uri: item.image_url }} style={styles.chatImage} resizeMode="cover" />
              )}
              {item.content && !item.content.startsWith('📷') && (
                <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
                  {item.content}
                </Text>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.messageList}
      />

      {uploading && (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.uploadingText}>Enviando imagen...</Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.imageButton} onPress={pickAndSendImage} disabled={uploading}>
          <Text style={styles.imageButtonText}>📷</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje..."
          placeholderTextColor="#9ca3af"
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage(null)} disabled={uploading}>
          <Text style={styles.sendButtonText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 15, paddingVertical: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  blockBtn: { padding: 5 },
  blockBtnText: { fontSize: 20 },
  messageList: { padding: 16 },
  messageBubble: { padding: 10, borderRadius: 12, marginVertical: 4, maxWidth: '80%' },
  myMessage: { backgroundColor: '#007AFF', alignSelf: 'flex-end' },
  otherMessage: { backgroundColor: '#e5e7eb', alignSelf: 'flex-start' },
  messageText: { fontSize: 16 },
  myMessageText: { color: '#ffffff' },
  otherMessageText: { color: '#1f2937' },
  chatImage: { width: 200, height: 200, borderRadius: 8, marginBottom: 6 },
  uploadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 6, backgroundColor: '#ffffff' },
  uploadingText: { marginLeft: 8, color: '#4b5563', fontSize: 12 },
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e5e7eb', alignItems: 'center' },
  imageButton: { paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  imageButtonText: { fontSize: 22 },
  input: { flex: 1, backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, fontSize: 16, color: '#1f2937' },
  sendButton: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginLeft: 8, backgroundColor: '#007AFF', borderRadius: 20, height: 40 },
  sendButtonText: { color: '#ffffff', fontWeight: '600' },
});