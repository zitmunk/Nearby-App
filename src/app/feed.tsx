import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { FeedItem } from '../components/FeedItem';
import { Screen } from '../components/Screen';
import { Colors } from '../constants/Colors';
import { supabase } from '../supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AGE_RANGES = [
  { label: '18-25', min: 18, max: 25 },
  { label: '26-35', min: 26, max: 35 },
  { label: '36-45', min: 36, max: 45 },
  { label: '46-55', min: 46, max: 55 },
  { label: '56+', min: 56, max: 70 },
];

const GENDER_OPTIONS = ['Todos', 'Hombre', 'Mujer', 'Hombre trans', 'Mujer trans', 'Prefiero no decirlo'];
const FILTERS_STORAGE_KEY = '@app_filters';
const TOOLTIP_SHOWN_KEY = '@tooltip_shown';
const PAGE_SIZE = 15;

export default function FeedScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const flatListRef = useRef<FlatList>(null);
  const isMountedRef = useRef(true);

  const [activeTab, setActiveTab] = useState<'users' | 'chats'>('users');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [filterOnlyWithPhoto, setFilterOnlyWithPhoto] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterRecentlyActive, setFilterRecentlyActive] = useState(false);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(70);
  const [selectedGender, setSelectedGender] = useState('Todos');
  const [sortByDistance, setSortByDistance] = useState<'asc' | 'desc' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [page, setPage] = useState(0);
  const [showAgeFilterModal, setShowAgeFilterModal] = useState(false);
  const [tempMinAge, setTempMinAge] = useState(18);
  const [tempMaxAge, setTempMaxAge] = useState(70);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [selectedUserForProfile, setSelectedUserForProfile] = useState<any>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [albumPhotos, setAlbumPhotos] = useState<string[]>([]);
  const [loadingAlbumPhotos, setLoadingAlbumPhotos] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const isUserOnline = (lastSeen: string) => {
    if (!lastSeen) return false;
    const diffMinutes = (new Date().getTime() - new Date(lastSeen).getTime()) / 60000;
    return diffMinutes < 5;
  };

  const calculateUnreadCount = (chatsList: any[]) => {
    return chatsList.filter(chat => chat.hasUnread).length;
  };

  const getFilteredUsers = useCallback((users: any[]) => {
    let filtered = [...users];

    filtered = filtered.filter((item: any) => {
      const age = parseInt(item.age, 10);
      if (isNaN(age)) return true;
      return age >= minAge && age <= maxAge;
    });

    if (selectedGender !== 'Todos') {
      const genderLower = selectedGender.toLowerCase().trim();
      filtered = filtered.filter((item: any) => {
        if (!item.gender) return false;
        return item.gender.toLowerCase().trim() === genderLower;
      });
    }

    if (filterOnlyWithPhoto) {
      filtered = filtered.filter((item: any) => {
        const avatar = item.avatar_url ? item.avatar_url.trim() : '';
        return avatar !== '' && avatar !== 'EMPTY' && avatar.startsWith('http');
      });
    }

    if (filterRecentlyActive) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      filtered = filtered.filter((item: any) => {
        const lastActive = item.last_seen;
        return lastActive ? new Date(lastActive) >= oneHourAgo : false;
      });
    }

    if (filterUnread) {
      filtered = filtered.filter((u: any) => u.hasUnread);
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((user: any) =>
        user.full_name?.toLowerCase().includes(query) ||
        user.username?.toLowerCase().includes(query)
      );
    }

    if (sortByDistance === 'asc') {
      filtered.sort((a, b) => (a.dist_meters || Infinity) - (b.dist_meters || Infinity));
    } else if (sortByDistance === 'desc') {
      filtered.sort((a, b) => (b.dist_meters || Infinity) - (a.dist_meters || Infinity));
    }

    return filtered;
  }, [minAge, maxAge, selectedGender, filterOnlyWithPhoto, filterRecentlyActive, filterUnread, searchQuery, sortByDistance]);

  const filteredUsers = useMemo(() => getFilteredUsers(allUsers), [allUsers, getFilteredUsers]);

  const visibleUsers = useMemo(() => {
    const start = 0;
    const end = (page + 1) * PAGE_SIZE;
    return filteredUsers.slice(start, end);
  }, [filteredUsers, page]);

  const hasMore = useMemo(() => {
    return (page + 1) * PAGE_SIZE < filteredUsers.length;
  }, [filteredUsers, page]);

  const fetchBlockedIds = async (userId: string): Promise<Set<string>> => {
    if (!userId) return new Set<string>();
    try {
      const { data, error } = await supabase
        .from('blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

      if (error) throw error;

      const ids = new Set<string>();
      data.forEach((block: any) => {
        if (block.blocker_id === userId) ids.add(block.blocked_id);
        if (block.blocked_id === userId) ids.add(block.blocker_id);
      });
      return ids;
    } catch (error) {
      console.error('Error obteniendo bloqueos:', error);
      return new Set<string>();
    }
  };

  const fetchAllUsers = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage(null);

    try {
          let { status } = await Location.requestForegroundPermissionsAsync();
      let lat: number | null = null;
      let long: number | null = null;

      if (status === 'granted') {
        try {
          let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = location.coords.latitude;
          long = location.coords.longitude;
        } catch (err) {
          console.log('GPS falló en feed, usando ubicación del perfil');
        }
      }

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;

      // 🔥 SYNC: si el GPS dio coordenadas reales, guardarlas en el perfil
      if (currentUserId && lat !== null && long !== null && status === 'granted') {
        const pointWKT = `SRID=4326;POINT(${long} ${lat})`;
        await supabase
          .from('profiles')
          .update({
            last_seen: new Date().toISOString(),
            location: pointWKT,
          })
          .eq('id', currentUserId);
      } else if (currentUserId) {
        // Sin GPS, solo actualizar last_seen
        await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', currentUserId);
      }

      // Si no hay GPS, usar la ubicación guardada en el perfil
      if (lat === null || long === null) {
        if (currentUserId) {
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('location')
            .eq('id', currentUserId)
            .single();

          if (myProfile?.location) {
            const match = myProfile.location.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
            if (match) {
              long = parseFloat(match[1]);
              lat = parseFloat(match[2]);
            }
          }
        }
      }

      // Si aún no hay coordenadas, no podemos buscar
      if (lat === null || long === null) {
        setErrorMessage('No se pudo obtener tu ubicación. Activa el GPS e inténtalo de nuevo.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { data, error } = await supabase.rpc('get_nearby_users', {
        lat: lat,
        long: long,
        radius_meters: 2000000, 
      });

      if (error) throw new Error(error.message);

      const userIds = data.map((u: any) => u.id);
      const { data: profilesData, error: profileError } = await supabase
        .from('profiles')
        .select('id, gender, is_online')
        .in('id', userIds);

      let userList = data;
      if (!profileError && profilesData) {
        const profileMap = Object.fromEntries(profilesData.map(p => [p.id, { gender: p.gender, is_online: p.is_online }]));
        userList = data.map((u: any) => ({
          ...u,
          gender: profileMap[u.id]?.gender || null,
          is_online: profileMap[u.id]?.is_online || false,
        }));
      } else {
        console.warn('No se pudo obtener gender/is_online:', profileError);
      }

      let blockedSet: Set<string> = new Set();
      if (currentUserId) {
        blockedSet = await fetchBlockedIds(currentUserId);
        setBlockedIds(blockedSet);
      }

      let list = (userList || []).filter((item: any) => 
        item.id !== currentUserId && !blockedSet.has(item.id)
      );

      list = list.filter((user: any) => user.is_online === true);

      list = list.map((user: any) => {
        if (user.birth_date) {
          const age = calculateAge(user.birth_date);
          user.age = age !== null ? String(age) : null;
        }
        return user;
      });

      const usersWithUnread = await Promise.all(
        list.map(async (user: any) => {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', user.id)
            .eq('receiver_id', currentUserId)
            .eq('is_read', false);
          return { ...user, hasUnread: (count || 0) > 0 };
        })
      );

      setAllUsers(usersWithUnread);
      setPage(0);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al cargar usuarios');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const blocksChannel = supabase.channel('blocks-feed-updates');

    blocksChannel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks' },
        async () => {
          if (!isMountedRef.current) return;
          const { data: authData } = await supabase.auth.getUser();
          const currentUserId = authData?.user?.id;
          if (currentUserId) {
            const newBlockedIds = await fetchBlockedIds(currentUserId);
            setBlockedIds(newBlockedIds);
            await fetchAllUsers();
          }
        }
      )
      .subscribe();

    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(blocksChannel);
    };
  }, []);

  const fetchUserChats = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;
      if (!currentUserId) return;

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      const companionIds = new Set();
      const uniqueChats: any[] = [];

      for (const msg of data) {
        const companionId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
        if (!companionIds.has(companionId)) {
          companionIds.add(companionId);

          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', companionId)
            .single();

          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', companionId)
            .eq('receiver_id', currentUserId)
            .eq('is_read', false);

          uniqueChats.push({
            companionId,
            profile: profileData || {},
            lastMessage: msg.content,
            time: msg.created_at,
            hasUnread: (count || 0) > 0,
          });
        }
      }
      setChats(uniqueChats);
      setUnreadCount(calculateUnreadCount(uniqueChats));
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al cargar chats');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyProfileAvatar = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id;
      if (!currentUserId) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', currentUserId)
        .single();

      if (data && !error && data.avatar_url) {
        setMyAvatarUrl(data.avatar_url.trim());
      }
    } catch (err) {
      console.error('Error fetching my avatar:', err);
    }
  };

  const handleRefresh = () => {
    if (activeTab === 'users') {
      fetchAllUsers(true);
    } else {
      fetchUserChats();
    }
  };

  const loadMoreUsers = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setPage((prev) => prev + 1);
    setTimeout(() => setLoadingMore(false), 300);
  };

  const handleLongPress = async (user: any) => {
    setSelectedUserForProfile(user);
    setShowProfileModal(true);
    setAlbumPhotos([]);
    setCurrentPhotoIndex(0);
    setLoadingAlbumPhotos(true);

    try {
      const { data, error } = await supabase
        .from('user_shared_albums')
        .select('image_url')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const urls = data.map((item: any) => item.image_url);
        setAlbumPhotos(urls);
      }
    } catch (error) {
      console.log('Error obteniendo álbum público:', error);
    } finally {
      setLoadingAlbumPhotos(false);
    }
  };

  const handlePhotoPress = (photo: string) => {
    setSelectedPhoto(photo);
    setShowFullPhoto(true);
  };

  const toggleSortByDistance = () => {
    if (sortByDistance === null) {
      setSortByDistance('asc');
    } else if (sortByDistance === 'asc') {
      setSortByDistance('desc');
    } else {
      setSortByDistance(null);
    }
  };

  const applyAgeFilter = () => {
    let validMin = tempMinAge;
    let validMax = tempMaxAge;
    if (validMin > validMax) {
      [validMin, validMax] = [validMax, validMin];
      setTempMinAge(validMin);
      setTempMaxAge(validMax);
    }
    setMinAge(validMin);
    setMaxAge(validMax);
    setShowAgeFilterModal(false);
  };

  const clearAgeFilter = () => {
    setTempMinAge(18);
    setTempMaxAge(70);
    setMinAge(18);
    setMaxAge(70);
    setShowAgeFilterModal(false);
  };

  const selectRange = (min: number, max: number) => {
    setTempMinAge(min);
    setTempMaxAge(max);
  };

  const saveAllFilters = async () => {
    try {
      await AsyncStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
        minAge,
        maxAge,
        filterOnlyWithPhoto,
        filterUnread,
        filterRecentlyActive,
        selectedGender,
        sortByDistance,
        searchQuery,
      }));
    } catch (error) {
      console.log('Error guardando filtros:', error);
    }
  };

  const loadAllFilters = async () => {
    try {
      const stored = await AsyncStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const filters = JSON.parse(stored);
        setMinAge(filters.minAge ?? 18);
        setMaxAge(filters.maxAge ?? 70);
        setTempMinAge(filters.minAge ?? 18);
        setTempMaxAge(filters.maxAge ?? 70);
        setFilterOnlyWithPhoto(filters.filterOnlyWithPhoto ?? false);
        setFilterUnread(filters.filterUnread ?? false);
        setFilterRecentlyActive(filters.filterRecentlyActive ?? false);
        setSelectedGender(filters.selectedGender ?? 'Todos');
        setSortByDistance(filters.sortByDistance ?? null);
        setSearchQuery(filters.searchQuery ?? '');
      }
    } catch (error) {
      console.log('Error cargando filtros:', error);
    }
  };

  const checkTooltipShown = async () => {
    try {
      const shown = await AsyncStorage.getItem(TOOLTIP_SHOWN_KEY);
      if (!shown) {
        setShowTooltip(true);
        await AsyncStorage.setItem(TOOLTIP_SHOWN_KEY, 'true');
        setTimeout(() => setShowTooltip(false), 5000);
      }
    } catch (error) {
      console.log('Error con tooltip:', error);
    }
  };

  useEffect(() => {
    loadAllFilters();
    checkTooltipShown();
    fetchMyProfileAvatar();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'users') {
        fetchAllUsers();
      } else {
        fetchUserChats();
      }
    }, [activeTab])
  );

  useEffect(() => {
    const messagesChannel = supabase.channel(`messages-feed-${Date.now()}`);

    messagesChannel
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMessage = payload.new;
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          if (newMessage.receiver_id === user.id) {
            setAllUsers(prev =>
              prev.map(u =>
                u.id === newMessage.sender_id
                  ? { ...u, hasUnread: true }
                  : u
              )
            );
            setUnreadCount(prev => prev + 1);
          }

          if (activeTab === 'chats') {
            fetchUserChats();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [activeTab]);

  useEffect(() => {
    saveAllFilters();
  }, [minAge, maxAge, filterOnlyWithPhoto, filterUnread, filterRecentlyActive, selectedGender, sortByDistance, searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [minAge, maxAge, filterOnlyWithPhoto, filterUnread, filterRecentlyActive, selectedGender, sortByDistance, searchQuery]);

  const renderUserItem = useCallback(({ item, index }: { item: any; index: number }) => {
    return <FeedItem item={item} index={index} />;
  }, []);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <Screen 
      scroll={false}
      backgroundColor={Colors.background}
      paddingHorizontal={0}
      paddingTop={0}
      paddingBottom={0}
    >
      <View style={styles.container}>
        <View style={styles.fixedHeader}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.logo}>💬 NOW Chat</Text>
              <View style={styles.titleRow}>
                <Text style={styles.title}>En el Radar</Text>
                <Text style={styles.titleEmoji}>📡</Text>
                <Ionicons name="location-sharp" size={18} color={Colors.primary} style={styles.locationIcon} />
              </View>
              <Text style={styles.subtitle}>✨ Gente cool, conexiones al instante</Text>
            </View>

            {activeTab === 'users' && (
              <TouchableOpacity
                style={styles.sortButton}
                onPress={toggleSortByDistance}
                activeOpacity={0.8}
              >
                <Ionicons name="swap-vertical-outline" size={22} color={sortByDistance ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.sortButtonText, sortByDistance && styles.sortButtonTextActive]}>
                  {sortByDistance === 'asc' ? 'Cerca' : sortByDistance === 'desc' ? 'Lejos' : 'Distancia'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {activeTab === 'users' && (
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          )}

          {activeTab === 'users' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContainer}>
              <TouchableOpacity
                style={[styles.filterChip, (minAge > 18 || maxAge < 70) && styles.filterChipActive]}
                onPress={() => {
                  setTempMinAge(minAge);
                  setTempMaxAge(maxAge);
                  setShowAgeFilterModal(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={18} color={(minAge > 18 || maxAge < 70) ? '#000' : Colors.textPrimary} style={{ marginRight: 4 }} />
                <Text style={[styles.filterChipText, (minAge > 18 || maxAge < 70) && styles.filterChipTextActive]}>
                  {minAge === 18 && maxAge === 70 ? 'Edad' : `${minAge}-${maxAge}`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, selectedGender !== 'Todos' && styles.filterChipActive]}
                onPress={() => setShowGenderModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="people-outline" size={18} color={selectedGender !== 'Todos' ? '#000' : Colors.textPrimary} style={{ marginRight: 4 }} />
                <Text style={[styles.filterChipText, selectedGender !== 'Todos' && styles.filterChipTextActive]}>
                  {selectedGender !== 'Todos' ? selectedGender : 'Género'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, filterOnlyWithPhoto && styles.filterChipActive]}
                onPress={() => setFilterOnlyWithPhoto(!filterOnlyWithPhoto)}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={18} color={filterOnlyWithPhoto ? '#000' : Colors.textPrimary} style={{ marginRight: 4 }} />
                <Text style={[styles.filterChipText, filterOnlyWithPhoto && styles.filterChipTextActive]}>Con foto</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, filterUnread && styles.filterChipActive]}
                onPress={() => setFilterUnread(!filterUnread)}
                activeOpacity={0.8}
              >
                <Ionicons name="mail-unread-outline" size={18} color={filterUnread ? '#000' : Colors.textPrimary} style={{ marginRight: 4 }} />
                <Text style={[styles.filterChipText, filterUnread && styles.filterChipTextActive]}>Sin leer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, filterRecentlyActive && styles.filterChipActive]}
                onPress={() => setFilterRecentlyActive(!filterRecentlyActive)}
                activeOpacity={0.8}
              >
                <Ionicons name="time-outline" size={18} color={filterRecentlyActive ? '#000' : Colors.textPrimary} style={{ marginRight: 4 }} />
                <Text style={[styles.filterChipText, filterRecentlyActive && styles.filterChipTextActive]}>Recientes</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>

        {errorMessage && <Text style={styles.errorText}>Error: {errorMessage}</Text>}

        <View style={{ flex: 1, paddingBottom: 70 }}>
          {loading && (visibleUsers.length === 0 && chats.length === 0) ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
          ) : activeTab === 'users' ? (
            <FlatList
              ref={flatListRef}
              key="grid-3"
              data={visibleUsers}
              keyExtractor={(item) => item.id}
              numColumns={3}
              columnWrapperStyle={styles.columnWrapper}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={Colors.primary}
                />
              }
              ListEmptyComponent={<Text style={styles.empty}>No hay usuarios conectados en este momento.</Text>}
              onEndReached={loadMoreUsers}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.loadingMoreContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingMoreText}>Cargando más personas...</Text>
                  </View>
                ) : null
              }
              renderItem={renderUserItem}
            />
          ) : (
            <FlatList
              data={chats}
              keyExtractor={(item) => item.companionId}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={Colors.primary}
                />
              }
              ListEmptyComponent={<Text style={styles.empty}>Aún no tienes chats activos.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.chatCard}
                  activeOpacity={0.9}
                  onPress={() => router.push({ pathname: '/chat', params: { receiverId: item.companionId, receiverName: item.profile?.full_name || item.profile?.username || 'Chat' } })}
                >
                  <Image source={{ uri: (item.profile?.avatar_url || '').trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }} style={styles.chatAvatar} />
                  <View style={styles.chatInfo}>
                    <View style={styles.chatHeaderRow}>
                      <Text style={styles.chatName}>{item.profile?.full_name || item.profile?.username || 'Usuario'}</Text>
                      {item.hasUnread && <Ionicons name="mail" size={16} color="#ef4444" />}
                    </View>
                    <Text style={styles.chatLastMessage} numberOfLines={1}>{item.lastMessage}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>

        {showTooltip && (
          <Animated.View style={[styles.tooltipContainer, { opacity: fadeAnim }]}>
            <Text style={styles.tooltipText}>
              👋 ¡Bienvenido a NOW Chat! Explora gente cool cerca de ti. Usa los filtros para encontrar tu tribu.
            </Text>
            <TouchableOpacity onPress={() => setShowTooltip(false)} style={styles.tooltipClose}>
              <Ionicons name="close" size={16} color="#000" />
            </TouchableOpacity>
          </Animated.View>
        )}

        <Modal
          visible={showAgeFilterModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowAgeFilterModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Filtrar por edad</Text>
              <View style={styles.quickRangesContainer}>
                {AGE_RANGES.map((range) => (
                  <TouchableOpacity
                    key={range.label}
                    style={[styles.quickRangeButton, tempMinAge === range.min && tempMaxAge === range.max && styles.quickRangeButtonActive]}
                    onPress={() => selectRange(range.min, range.max)}
                  >
                    <Text style={[styles.quickRangeText, tempMinAge === range.min && tempMaxAge === range.max && styles.quickRangeTextActive]}>
                      {range.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sliderContainer}>
                <Text style={styles.sliderLabel}>Edad mínima: {tempMinAge}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={18}
                  maximumValue={70}
                  step={1}
                  value={tempMinAge}
                  onValueChange={(value) => {
                    if (value <= tempMaxAge) {
                      setTempMinAge(value);
                    } else {
                      setTempMinAge(value);
                      setTempMaxAge(value);
                    }
                  }}
                  minimumTrackTintColor={Colors.primary}
                  maximumTrackTintColor="#333"
                  thumbTintColor={Colors.primary}
                />
              </View>
              <View style={styles.sliderContainer}>
                <Text style={styles.sliderLabel}>Edad máxima: {tempMaxAge}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={18}
                  maximumValue={70}
                  step={1}
                  value={tempMaxAge}
                  onValueChange={(value) => {
                    if (value >= tempMinAge) {
                      setTempMaxAge(value);
                    } else {
                      setTempMaxAge(value);
                      setTempMinAge(value);
                    }
                  }}
                  minimumTrackTintColor={Colors.primary}
                  maximumTrackTintColor="#333"
                  thumbTintColor={Colors.primary}
                />
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalButton} onPress={clearAgeFilter}>
                  <Text style={styles.modalButtonText}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={applyAgeFilter}>
                  <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Aplicar</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowAgeFilterModal(false)}>
                <Text style={styles.modalCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showGenderModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowGenderModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { paddingBottom: 12 }]}>
              <Text style={styles.modalTitle}>Filtrar por género</Text>
              <View style={styles.genderOptionsContainer}>
                {GENDER_OPTIONS.map((gender) => (
                  <TouchableOpacity
                    key={gender}
                    style={[styles.genderOption, selectedGender === gender && styles.genderOptionActive]}
                    onPress={() => {
                      setSelectedGender(gender);
                      setShowGenderModal(false);
                    }}
                  >
                    <Text style={[styles.genderOptionText, selectedGender === gender && styles.genderOptionTextActive]}>
                      {gender}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowGenderModal(false)}>
                <Text style={styles.modalCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showProfileModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowProfileModal(false)}
        >
          <View style={styles.profileModalOverlay}>
            <View style={styles.profileModalContainer}>
              <TouchableOpacity style={styles.profileModalClose} onPress={() => setShowProfileModal(false)}>
                <Ionicons name="close-circle" size={32} color="#fff" />
              </TouchableOpacity>
              {selectedUserForProfile && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profileModalContent}>
                  <Image
                    source={{ uri: selectedUserForProfile.avatar_url?.trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }}
                    style={styles.profileModalAvatar}
                  />
                  <Text style={styles.profileModalName}>
                    {selectedUserForProfile.full_name || selectedUserForProfile.username}
                  </Text>
                  <View style={styles.profileModalStats}>
                    <View style={styles.profileModalStat}>
                      <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
                      <Text style={styles.profileModalStatText}>
                        {selectedUserForProfile.age ? `${selectedUserForProfile.age} años` : 'Edad no especificada'}
                      </Text>
                    </View>
                    <View style={styles.profileModalStat}>
                      <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
                      <Text style={styles.profileModalStatText}>
                        {selectedUserForProfile.dist_meters != null
                          ? selectedUserForProfile.dist_meters < 100
                            ? 'Muy cerca'
                            : selectedUserForProfile.dist_meters < 1000
                              ? `${Math.round(selectedUserForProfile.dist_meters)} m`
                              : `${(selectedUserForProfile.dist_meters / 1000).toFixed(1)} km`
                          : 'Distancia desconocida'}
                      </Text>
                    </View>
                    <View style={styles.profileModalStat}>
                      <Ionicons name="people-outline" size={16} color={Colors.textSecondary} />
                      <Text style={styles.profileModalStatText}>
                        {selectedUserForProfile.gender || 'No especificado'}
                      </Text>
                    </View>
                  </View>
                  {loadingAlbumPhotos ? (
                    <View style={styles.carouselLoading}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                    </View>
                  ) : albumPhotos.length > 0 ? (
                    <View style={styles.carouselContainer}>
                      <FlatList
                        data={albumPhotos}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(item, index) => `album_photo_${index}`}
                        onMomentumScrollEnd={(event) => {
                          const index = Math.round(event.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 48));
                          setCurrentPhotoIndex(index);
                        }}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            style={[styles.carouselItem, { width: SCREEN_WIDTH - 48 }]}
                            onPress={() => handlePhotoPress(item)}
                            activeOpacity={0.9}
                          >
                            <Image source={{ uri: item }} style={styles.carouselImage} resizeMode="cover" />
                          </TouchableOpacity>
                        )}
                      />
                      <View style={styles.paginationContainer}>
                        {albumPhotos.map((_, index) => (
                          <View
                            key={index}
                            style={[styles.paginationDot, index === currentPhotoIndex && styles.paginationDotActive]}
                          />
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.noPhotosContainer}>
                      <Ionicons name="images-outline" size={32} color="#555" />
                      <Text style={styles.noPhotosText}>Sin fotos en su álbum público</Text>
                    </View>
                  )}
                  {selectedUserForProfile.bio && (
                    <View style={styles.profileModalBio}>
                      <Text style={styles.profileModalBioLabel}>✨ Sobre mí</Text>
                      <Text style={styles.profileModalBioText}>{selectedUserForProfile.bio}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.profileModalChatButton}
                    onPress={() => {
                      setShowProfileModal(false);
                      router.push({
                        pathname: '/chat',
                        params: {
                          receiverId: selectedUserForProfile.id,
                          receiverName: selectedUserForProfile.full_name || selectedUserForProfile.username,
                        },
                      });
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={20} color="#000" />
                    <Text style={styles.profileModalChatText}>Chatear ahora</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        <Modal
          visible={showFullPhoto}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowFullPhoto(false)}
        >
          <View style={styles.fullPhotoOverlay}>
            <TouchableOpacity style={styles.fullPhotoClose} onPress={() => setShowFullPhoto(false)}>
              <Ionicons name="close-circle" size={44} color="#fff" />
            </TouchableOpacity>
            {selectedPhoto && (
              <Image source={{ uri: selectedPhoto }} style={styles.fullPhotoImage} resizeMode="contain" />
            )}
          </View>
        </Modal>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={[styles.navButton, activeTab === 'users' && styles.navButtonActive]} onPress={() => setActiveTab('users')} activeOpacity={0.8}>
            <Ionicons name="people" size={24} color={activeTab === 'users' ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.navText, activeTab === 'users' && styles.navTextActive]}>Conectados</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButton, activeTab === 'chats' && styles.navButtonActive]}
            onPress={() => setActiveTab('chats')}
            activeOpacity={0.8}
          >
            <View style={styles.navIconContainer}>
              <Ionicons
                name="chatbubbles"
                size={24}
                color={activeTab === 'chats' ? Colors.primary : Colors.textSecondary}
              />
              {unreadCount > 0 && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.navText, activeTab === 'chats' && styles.navTextActive]}>
              Mis Chats
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navButton} onPress={() => router.push('/profile')} activeOpacity={0.8}>
            {myAvatarUrl ? (
              <Image source={{ uri: myAvatarUrl }} style={styles.navAvatar} />
            ) : (
              <Ionicons name="person-circle" size={28} color={Colors.primary} />
            )}
            <Text style={styles.navText}>Perfil</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8, backgroundColor: Colors.background },
  fixedHeader: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 4,
    paddingVertical: 10,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  logo: {
    fontSize: 14,
    letterSpacing: 2,
    color: Colors.primary,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  titleEmoji: {
    fontSize: 24,
    marginLeft: 2,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.3,
    opacity: 0.8,
  },
  locationIcon: {
    marginLeft: 4,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginTop: 4,
  },
  sortButtonText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginLeft: 4,
  },
  sortButtonTextActive: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: Colors.textPrimary,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#333',
    fontSize: 14,
  },
  filtersContainer: { paddingTop: 8, paddingBottom: 2, gap: 8, flexDirection: 'row' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  filterChipTextActive: { color: '#000', fontWeight: '700' },

  columnWrapper: { justifyContent: 'flex-start' },

  cardWrapper: {
    flex: 1,
    margin: 3,
    maxWidth: '31.3%',
  },

  card: {
    flex: 1,
    margin: 0,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: '#262626',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    position: 'relative',
  },
  cardUnreadNeon: {
    borderColor: '#22c55e',
    borderWidth: 2.5,
    elevation: 8,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },

  imageContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333',
  },
  onlineBorder: { borderColor: '#22c55e' },
  avatar: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },

  ageBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 24,
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#000',
  },
  ageBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },

  indicatorsContainer: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#555', borderWidth: 1.5, borderColor: Colors.background },
  onlineDotActive: { backgroundColor: '#22c55e' },
  mailIcon: { textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },

  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6, backgroundColor: 'rgba(5, 5, 5, 0.85)' },
  name: { fontSize: 11, fontWeight: 'bold', color: Colors.textPrimary },
  distanceContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  distance: { fontSize: 9, color: '#22c55e', fontWeight: '600', marginLeft: 2 },

  chatCard: { flexDirection: 'row', backgroundColor: Colors.surface, padding: 12, borderRadius: 16, marginVertical: 4, alignItems: 'center', borderWidth: 1, borderColor: '#262626' },
  chatAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  chatInfo: { flex: 1 },
  chatHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  chatLastMessage: { fontSize: 13, color: Colors.textSecondary },
  empty: { textAlign: 'center', marginTop: 40, color: Colors.textSecondary, fontSize: 15 },
  errorText: { color: '#ef4444', marginVertical: 10, textAlign: 'center', fontWeight: 'bold' },

  loadingMoreContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMoreText: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 8,
  },

  tooltipContainer: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    backgroundColor: Colors.primary,
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  tooltipText: { flex: 1, color: '#000', fontSize: 13, fontWeight: '600', marginRight: 10 },
  tooltipClose: { padding: 4 },

  navIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.surface,
  },
  badgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 65,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#262626',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 5,
    elevation: 10,
  },
  navButton: { alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' },
  navButtonActive: { borderTopWidth: 3, borderTopColor: Colors.primary },
  navAvatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary },
  navText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500', marginTop: 2 },
  navTextActive: { color: Colors.primary, fontWeight: 'bold' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  quickRangesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  quickRangeButton: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 55,
    alignItems: 'center',
  },
  quickRangeButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  quickRangeText: {
    color: Colors.textPrimary,
    fontWeight: '500',
    fontSize: 13,
  },
  quickRangeTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  sliderContainer: { marginBottom: 16 },
  sliderLabel: { color: Colors.textPrimary, fontSize: 14, marginBottom: 6 },
  slider: { width: '100%', height: 40 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#333',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonPrimary: { backgroundColor: Colors.primary },
  modalButtonText: { color: Colors.textPrimary, fontWeight: '600' },
  modalButtonTextPrimary: { color: '#000' },
  modalClose: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  modalCloseText: { color: Colors.textSecondary, fontSize: 14 },

  genderOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 16,
  },
  genderOption: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  genderOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  genderOptionText: {
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  genderOptionTextActive: {
    color: '#000',
    fontWeight: '700',
  },

  profileModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileModalContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    width: '92%',
    maxHeight: '80%',
    padding: 20,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#333',
  },
  profileModalClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  profileModalContent: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  profileModalAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  profileModalName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  profileModalStats: {
    width: '100%',
    marginVertical: 8,
    gap: 4,
  },
  profileModalStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileModalStatText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  profileModalBio: {
    width: '100%',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 10,
  },
  profileModalBioLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  profileModalBioText: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
    textAlign: 'center',
  },
  profileModalChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginTop: 12,
    gap: 8,
    width: '100%',
  },
  profileModalChatText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000',
  },

  carouselContainer: {
    width: '100%',
    marginVertical: 8,
  },
  carouselItem: {
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  carouselImage: {
    width: '100%',
    height: '100%',
  },
  carouselLoading: {
    width: '100%',
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginVertical: 8,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    gap: 6,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#555',
  },
  paginationDotActive: {
    backgroundColor: Colors.primary,
    width: 16,
    height: 8,
    borderRadius: 4,
  },
  noPhotosContainer: {
    width: '100%',
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginVertical: 8,
  },
  noPhotosText: {
    color: '#666',
    fontSize: 13,
    marginTop: 8,
  },

  fullPhotoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullPhotoClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
  },
  fullPhotoImage: {
    width: '100%',
    height: '80%',
  },
});