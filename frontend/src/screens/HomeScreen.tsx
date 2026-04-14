import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Image, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FeedItem {
  imageId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  createdAt: string;
}

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 2;
const IMAGE_SIZE = (width - 48) / COLUMN_COUNT; // 48 = padding (16*2) + gap (16)

const HomeScreen = () => {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/feed/random?limit=30`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setFeedItems(data);
      }
    } catch (error) {
      console.error('Failed to fetch feed:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Refresh feed when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchFeed();
    }, [fetchFeed])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed();
  }, [fetchFeed]);

  const renderItem = ({ item }: { item: FeedItem }) => (
    <View style={styles.feedItem}>
      <Image 
        source={{ uri: item.imageUrl }} 
        style={styles.feedImage}
        resizeMode="cover"
      />
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
      </View>
      
      <FlatList
        data={feedItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.imageId}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={feedItems.length === 0 ? styles.emptyContent : styles.listContent}
        columnWrapperStyle={feedItems.length > 0 ? styles.row : undefined}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={['#000']}
            tintColor="#000"
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingVertical: 15,
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
});

export default HomeScreen;
