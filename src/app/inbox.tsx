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
            onPress={() => router.push({ pathname: '/chat', params: { receiverId: item.sender_id, receiverName: 'Usuario' } })}
          >
            <Image source={{ uri: 'https://via.placeholder.com/50' }} style={styles.avatar} />
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
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 50, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#e5e7eb' },
  chatInfo: { marginLeft: 15, flex: 1 },
  userName: { fontSize: 16, fontWeight: '600' },
  lastMessage: { color: '#6b7280', marginTop: 2 }
});