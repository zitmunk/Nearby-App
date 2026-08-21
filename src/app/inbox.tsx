import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
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

    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles!messages_sender_id_fkey(full_name, username, avatar_url)')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (data) {
      const uniqueChatsMap = new Map();
      
      for (const m of data) {
        const companionId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        
        if (!uniqueChatsMap.has(companionId)) {
          // Consultar si hay mensajes no leídos de este usuario específico
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', companionId)
            .eq('receiver_id', user.id)
            .eq('is_read', false);

          uniqueChatsMap.set(companionId, { 
            ...m, 
            companionId, 
            hasUnread: (count || 0) > 0 
          });
        }
      }

      setConversations(Array.from(uniqueChatsMap.values()));
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis Chats</Text>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Aún no tienes conversaciones.</Text> : null
        }
        renderItem={({ item }) => {
          const chatName = item.profiles?.full_name || item.profiles?.username || 'Usuario';

          return (
            <TouchableOpacity 
              style={styles.chatItem}
              activeOpacity={0.8}
              onPress={() => router.push({ 
                pathname: '/chat', 
                params: { receiverId: item.companionId, receiverName: chatName } 
              })}
            >
              <Image 
                source={{ uri: item.profiles?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }} 
                style={styles.avatar} 
              />
              <View style={styles.chatInfo}>
                <View style={styles.chatHeaderRow}>
                  <Text style={styles.userName}>{chatName}</Text>
                  {item.hasUnread && (
                    <Ionicons name="mail" size={16} color="#ef4444" />
                  )}
                </View>
                <Text style={styles.lastMessage} numberOfLines={1}>{item.content}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 50, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: Colors.textPrimary },
  chatItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 14, 
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#262626'
  },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#262626' },
  chatInfo: { marginLeft: 15, flex: 1 },
  chatHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  userName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  lastMessage: { color: Colors.textSecondary, fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 40, color: Colors.textSecondary, fontSize: 15 }
});