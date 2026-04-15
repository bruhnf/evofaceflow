import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Image, TouchableOpacity, Dimensions, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProfileDropdown from '../components/ProfileDropdown';

interface FeedItem {
  videoId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  userId: string;
  username: string;
  avatarUrl?: string;
  createdAt: string;
}

const { width, height } = Dimensions.get('window');
const COLUMN_COUNT = 2;
const ITEM_WIDTH = (width - 48) / COLUMN_COUNT; // 48 = padding (16*2) + gap (16)
const ITEM_HEIGHT = ITEM_WIDTH * 1.5; // 3:2 aspect ratio for portrait videos
const BATCH_SIZE = 20;
const PREFETCH_THRESHOLD = 0.5;

const HomeScreen = () => {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<FeedItem | null>(null);
  
  // Track seen video IDs to avoid duplicates
  const seenVideoIds = useRef<Set<string>>(new Set());
  const isFetchingMore = useRef(false);
  const videoRef = useRef<ExpoVideo>(null);

  const fetchFeed = useCallback(async (append: boolean = false) => {
    // Prevent concurrent fetches
    if (append && isFetchingMore.current) return;
    if (append) {
      isFetchingMore.current = true;
      setLoadingMore(true);
    }

    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/feed/random?limit=${BATCH_SIZE}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data: FeedItem[] = await response.json();
        
        // Prefetch thumbnails in background
        data.forEach(item => {
          if (item.thumbnailUrl) Image.prefetch(item.thumbnailUrl).catch(() => {});
          if (item.avatarUrl) Image.prefetch(item.avatarUrl).catch(() => {});
        });
        
        if (append) {
          // Filter out duplicates before appending
          const newItems = data.filter(item => !seenVideoIds.current.has(item.videoId));
          newItems.forEach(item => seenVideoIds.current.add(item.videoId));
          setFeedItems(prev => [...prev, ...newItems]);
        } else {
          // Fresh fetch - reset seen IDs
          seenVideoIds.current = new Set(data.map(item => item.videoId));
          setFeedItems(data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch feed:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      isFetchingMore.current = false;
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Only refresh on first focus
  const hasFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocused.current) {
        hasFocused.current = true;
        return;
      }
    }, [fetchFeed])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed(false);
  }, [fetchFeed]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && !refreshing) {
      fetchFeed(true);
    }
  }, [fetchFeed, loadingMore, refreshing]);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#666" />
      </View>
    );
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderItem = ({ item }: { item: FeedItem }) => (
    <View style={styles.feedItem}>
      <TouchableOpacity onPress={() => setSelectedVideo(item)} activeOpacity={0.9}>
        <View style={styles.thumbnailContainer}>
          {item.thumbnailUrl ? (
            <Image 
              source={{ uri: item.thumbnailUrl }} 
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Ionicons name="play-circle" size={40} color="#fff" />
            </View>
          )}
          {/* Play overlay */}
          <View style={styles.playOverlay}>
            <Ionicons name="play" size={24} color="#fff" />
          </View>
          {/* Duration badge */}
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
          </View>
        </View>
      </TouchableOpacity>
      <View style={styles.userInfo}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.profilePhoto} />
        ) : (
          <View style={styles.profilePlaceholder}>
            <Ionicons name="person" size={12} color="#999" />
          </View>
        )}
        <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="videocam-outline" size={80} color="#ddd" />
      <Text style={styles.emptyTitle}>No Videos Yet</Text>
      <Text style={styles.emptyText}>
        Be the first to create your life journey video!
      </Text>
      <Text style={styles.emptySubtext}>
        Go to the Upload tab to get started.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>EvoFaceFlow</Text>
          <ProfileDropdown />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>EvoFaceFlow</Text>
        <ProfileDropdown />
      </View>
      
      <FlatList
        data={feedItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.videoId}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={feedItems.length === 0 ? styles.emptyContent : styles.listContent}
        columnWrapperStyle={feedItems.length > 0 ? styles.row : undefined}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={PREFETCH_THRESHOLD}
        removeClippedSubviews={true}
        maxToRenderPerBatch={8}
        windowSize={5}
        initialNumToRender={8}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={['#000']}
            tintColor="#000"
          />
        }
      />

      {/* Full Screen Video Modal */}
      <Modal
        visible={selectedVideo !== null}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setSelectedVideo(null)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => {
              videoRef.current?.stopAsync();
              setSelectedVideo(null);
            }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          
          {selectedVideo && (
            <>
              <ExpoVideo
                ref={videoRef}
                source={{ uri: selectedVideo.videoUrl }}
                style={styles.fullScreenVideo}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={true}
                isLooping={true}
                useNativeControls={true}
              />
              <View style={styles.modalUserInfo}>
                <View style={styles.modalUserRow}>
                  {selectedVideo.avatarUrl ? (
                    <Image source={{ uri: selectedVideo.avatarUrl }} style={styles.modalAvatar} />
                  ) : (
                    <View style={styles.modalAvatarPlaceholder}>
                      <Ionicons name="person" size={16} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.modalUsername}>@{selectedVideo.username}</Text>
                </View>
                <Text style={styles.modalDuration}>
                  {formatDuration(selectedVideo.durationSeconds)} • Life Journey
                </Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  feedItem: {
    width: ITEM_WIDTH,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    backgroundColor: '#000',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  profilePhoto: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ddd',
  },
  profilePlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    marginLeft: 6,
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 20,
    color: '#333',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenVideo: {
    width: width,
    height: height * 0.7,
  },
  modalUserInfo: {
    position: 'absolute',
    bottom: 80,
    left: 20,
  },
  modalUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  modalAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modalUsername: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalDuration: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
  },
});

export default HomeScreen;
