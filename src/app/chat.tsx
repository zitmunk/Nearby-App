import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function ChatScreen() {
  const { receiverId, receiverName } = useLocalSearchParams();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Función para marcar como leídos los mensajes que te envió este usuario
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
        fetchMessages(data.user.id);
        markMessagesAsRead(data.user.id); // <-- Se marca como leído al abrir el chat
      }
    });

    // Suscripción en tiempo real para los mensajes nuevos
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new;
        if (
          (newMsg.sender_id === currentUserId && newMsg.receiver_id === receiverId) ||
          (newMsg.sender_id === receiverId && newMsg.receiver_id === currentUserId)
        ) {
          setMessages((prev) => [...prev, newMsg]);
          
          // Si el mensaje nuevo viene del otro usuario, lo marcamos como leído inmediatamente
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

  const sendMessage = async () => {
    if (!inputText.trim() || !currentUserId || !receiverId) return;

    const { error } = await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: receiverId,
      content: inputText.trim(),
      is_read: false,
    });

    if (!error) {
      setInputText('');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
      keyboardVerticalOffset={90}
    >
      <Text style={styles.headerTitle}>Chat con {receiverName || 'Usuario'}</Text>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMe = item.sender_id === currentUserId;
          return (
            <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.otherMessage]}>
              <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
                {item.content}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={styles.messageList}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje..."
          placeholderTextColor="#9ca3af"
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', padding: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', color: '#1f2937' },
  messageList: { padding: 16 },
  messageBubble: { padding: 12, borderRadius: 12, marginVertical: 4, maxWidth: '80%' },
  myMessage: { backgroundColor: '#007AFF', alignSelf: 'flex-end' },
  otherMessage: { backgroundColor: '#e5e7eb', alignSelf: 'flex-start' },
  messageText: { fontSize: 16 },
  myMessageText: { color: '#ffffff' },
  otherMessageText: { color: '#1f2937' },
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  input: { flex: 1, backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, fontSize: 16, color: '#1f2937' },
  sendButton: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginLeft: 8, backgroundColor: '#007AFF', borderRadius: 20 },
  sendButtonText: { color: '#ffffff', fontWeight: '600' },
});