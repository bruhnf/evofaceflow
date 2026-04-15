import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Image, TouchableOpacity, Dimensions, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProfileDropdown from '../components/ProfileDropdown';

interface FeedItem {
  imageId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  createdAt: string;
}

const { width, height } = Dimensions.get('window');
const COLUMN_COUNT = 2;
const IMAGE_SIZE = (width - 48) / COLUMN_COUNT; // 48 = padding (16*2) + gap (16)
const BATCH_SIZE = 30;
const PREFETCH_THRESHOLD = 0.5; // Start fetching when 50% from bottom

const HomeScreen = () => {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedImage, setSelectedImage] = useState<FeedItem | null>(null);
  
  // Track seen image IDs to avoid duplicates
  const seenImageIds = useRef<Set<string>>(new Set());
  const isFetchingMore = useRef(false);

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
        
        // Prefetch images in background for smoother scrolling
        data.forEach(item => {
          Image.prefetch(item.imageUrl).catch(() => {});
          if (item.avatarUrl) Image.prefetch(item.avatarUrl).catch(() => {});
        });
        
        if (append) {
          // Filter out duplicates before appending
          const newItems = data.filter(item => !seenImageIds.current.has(item.imageId));
          newItems.forEach(item => seenImageIds.current.add(item.imageId));
          setFeedItems(prev => [...prev, ...newItems]);
        } else {
          // Fresh fetch - reset seen IDs
          seenImageIds.current = new Set(data.map(item => item.imageId));
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

  // Only refresh on first focus, not every focus (to preserve scroll position)
  const hasFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocused.current) {
        hasFocused.current = true;
        return;
      }
      // Optional: uncomment below to refresh on every focus
      // fetchFeed();
    }, [fetchFeed])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed(false); // Fresh fetch, not append
  }, [fetchFeed]);

  // Pre-fetch more images when user scrolls near the bottom
  const onEndReached = useCallback(() => {
    if (!loadingMore && !refreshing) {
      fetchFeed(true); // Append mode
    }
  }, [fetchFeed, loadingMore, refreshing]);

  // Footer loading indicator
  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#666" />
      </View>
    );
  };

  const renderItem = ({ item }: { item: FeedItem }) => (
    <View style={styles.feedItem}>
      <TouchableOpacity onPress={() => setSelectedImage(item)} activeOpacity={0.9}>
        <Image 
          source={{ uri: item.imageUrl }} 
          style={styles.feedImage}
          resizeMode="cover"
        />
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
      <Ionicons name="images-outline" size={80} color="#ddd" />
      <Text style={styles.emptyTitle}>No Photos Yet</Text>
      <Text style={styles.emptyText}>
        Be the first to upload photos!
      </Text>
      <Text style={styles.emptySubtext}>
        Go to the Upload tab to share your moments.
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
        keyExtractor={(item) => item.imageId}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={feedItems.length === 0 ? styles.emptyContent : styles.listContent}
        columnWrapperStyle={feedItems.length > 0 ? styles.row : undefined}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={PREFETCH_THRESHOLD}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={['#000']}
            tintColor="#000"
          />
        }
      />

      {/* Full Screen Image Modal */}
      <Modal
        visible={selectedImage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => setSelectedImage(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          
          {selectedImage && (
            <>
              <Image 
                source={{ uri: selectedImage.imageUrl }} 
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
              <View style={styles.modalUserInfo}>
                <Text style={styles.modalUsername}>@{selectedImage.username}</Text>
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
    width: IMAGE_SIZE,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    overflow: 'hidden',
  },
  feedImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    backgroundColor: '#eee',
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
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: width,
    height: height * 0.8,
  },
  modalUserInfo: {
    position: 'absolute',
    bottom: 50,
    left: 20,
  },
  modalUsername: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HomeScreen;
