import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function InboxScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Obtenemos los mensajes únicos donde el usuario ha participado
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles!messages_sender_id_fkey(full_name, avatar_url)') // Ajusta según el nombre real de tu relación
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (data) {
      // Lógica simple para agrupar por el otro usuario
      const uniqueChats = Array.from(
        new Map(
          data.map((m) => [
            m.sender_id === user.id ? m.receiver_id : m.sender_id, 
            m
          ])
        ).values()
      );
      setConversations(uniqueChats);
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis Chats</Text>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.chatItem}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/chat', params: { receiverId: item.sender_id, receiverName: 'Usuario' } })}
          >
            <Image 
              source={{ uri: item.profiles?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }} 
              style={styles.avatar} 
            />
            <View style={styles.chatInfo}>
              <Text style={styles.userName}>Chat con {item.sender_id}</Text>
              <Text style={styles.lastMessage} numberOfLines={1}>{item.content}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16', paddingTop: 50, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#f9fafb' },
  chatItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 14, 
    paddingHorizontal: 14,
    backgroundColor: '#111827',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f2937'
  },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#1f2937' },
  chatInfo: { marginLeft: 15, flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', color: '#f9fafb' },
  lastMessage: { color: '#94a3b8', marginTop: 2, fontSize: 13 }
});