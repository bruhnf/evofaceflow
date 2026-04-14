import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import ProfileDropdown from '../components/ProfileDropdown';

interface UserItem {
  userId: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  isFollowing?: boolean;
  isFollowingBack?: boolean;
}

type TabType = 'following' | 'followers' | 'search';

const FriendsScreen = () => {
  const [activeTab, setActiveTab] = useState<TabType>('following');
  const [following, setFollowing] = useState<UserItem[]>([]);
  const [followers, setFollowers] = useState<UserItem[]>([]);
  const [searchResults, setSearchResults] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchFollowing = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/friends/following`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setFollowing(data.map((u: UserItem) => ({ ...u, isFollowing: true })));
      }
    } catch (error) {
      console.error('Failed to fetch following', error);
    }
  };

  const fetchFollowers = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/friends/followers`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setFollowers(data);
      }
    } catch (error) {
      console.error('Failed to fetch followers', error);
    }
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/friends/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      }
    } catch (error) {
      console.error('Failed to search users', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async (userId: string) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/friends/follow/${userId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        // Update local state
        setSearchResults(prev => 
          prev.map(u => u.userId === userId ? { ...u, isFollowing: true } : u)
        );
        setFollowers(prev =>
          prev.map(u => u.userId === userId ? { ...u, isFollowingBack: true } : u)
        );
        // Refresh following list
        fetchFollowing();
      } else {
        const data = await response.json();
        Alert.alert('Error', data.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not follow user');
    }
  };

  const handleUnfollow = async (userId: string, username: string) => {
    Alert.alert(
      'Unfollow',
      `Are you sure you want to unfollow @${username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              const response = await fetch(`${API_BASE_URL}/api/friends/unfollow/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              
              if (response.ok) {
                // Remove from following list
                setFollowing(prev => prev.filter(u => u.userId !== userId));
                // Update search results if applicable
                setSearchResults(prev =>
                  prev.map(u => u.userId === userId ? { ...u, isFollowing: false } : u)
                );
                setFollowers(prev =>
                  prev.map(u => u.userId === userId ? { ...u, isFollowingBack: false } : u)
                );
              } else {
                const data = await response.json();
                Alert.alert('Error', data.message);
              }
            } catch (error) {
              Alert.alert('Error', 'Could not unfollow user');
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchFollowing(), fetchFollowers()]);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchFollowing();
    fetchFollowers();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (activeTab === 'search') {
        searchUsers(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, activeTab]);

  const renderUserItem = ({ item }: { item: UserItem }) => (
    <View style={styles.userItem}>
      <Image 
        source={{ uri: item.avatarUrl || 'https://via.placeholder.com/50/cccccc/666666?text=User' }}
        style={styles.userAvatar}
      />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.username}</Text>
        <Text style={styles.userBio} numberOfLines={1}>
          {item.bio || 'No bio'}
        </Text>
      </View>
      
      {activeTab === 'following' && (
        <TouchableOpacity 
          style={styles.unfollowButton}
          onPress={() => handleUnfollow(item.userId, item.username)}
        >
          <Text style={styles.unfollowText}>Unfollow</Text>
        </TouchableOpacity>
      )}
      
      {activeTab === 'followers' && (
        item.isFollowingBack ? (
          <TouchableOpacity 
            style={styles.followingButton}
            onPress={() => handleUnfollow(item.userId, item.username)}
          >
            <Text style={styles.followingText}>Following</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.followButton}
            onPress={() => handleFollow(item.userId)}
          >
            <Text style={styles.followButtonText}>Follow Back</Text>
          </TouchableOpacity>
        )
      )}
      
      {activeTab === 'search' && (
        item.isFollowing ? (
          <TouchableOpacity 
            style={styles.followingButton}
            onPress={() => handleUnfollow(item.userId, item.username)}
          >
            <Text style={styles.followingText}>Following</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.followButton}
            onPress={() => handleFollow(item.userId)}
          >
            <Text style={styles.followButtonText}>Follow</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );

  const getCurrentData = () => {
    switch (activeTab) {
      case 'following': return following;
      case 'followers': return followers;
      case 'search': return searchResults;
    }
  };

  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'following': return "You're not following anyone yet";
      case 'followers': return "You don't have any followers yet";
      case 'search': return searchQuery ? "No users found" : "Search for users to follow";
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Friends</Text>
        <ProfileDropdown />
      </View>
      
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'following' && styles.activeTab]}
          onPress={() => setActiveTab('following')}
        >
          <Text style={[styles.tabText, activeTab === 'following' && styles.activeTabText]}>
            Following ({following.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'followers' && styles.activeTab]}
          onPress={() => setActiveTab('followers')}
        >
          <Text style={[styles.tabText, activeTab === 'followers' && styles.activeTabText]}>
            Followers ({followers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'search' && styles.activeTab]}
          onPress={() => setActiveTab('search')}
        >
          <Ionicons 
            name="search" 
            size={20} 
            color={activeTab === 'search' ? '#000' : '#666'} 
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar (only visible on search tab) */}
      {activeTab === 'search' && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Loading indicator for search */}
      {loading && activeTab === 'search' && (
        <ActivityIndicator style={styles.loader} color="#000" />
      )}

      {/* User List */}
      <FlatList
        data={getCurrentData()}
        renderItem={renderUserItem}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#000']}
            tintColor="#000"
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>{getEmptyMessage()}</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: { fontSize: 28, fontWeight: 'bold', paddingVertical: 15 },
  
  tabContainer: { 
    flexDirection: 'row', 
    borderBottomWidth: 1, 
    borderBottomColor: '#eee',
    paddingHorizontal: 10,
  },
  tab: { 
    flex: 1, 
    paddingVertical: 12, 
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: '#000' },
  tabText: { fontSize: 14, color: '#666' },
  activeTabText: { color: '#000', fontWeight: '600' },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    margin: 15,
    paddingHorizontal: 15,
    borderRadius: 25,
    height: 45,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16 },
  
  loader: { marginTop: 20 },
  
  listContent: { paddingHorizontal: 15, paddingBottom: 20 },
  
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#eee' },
  userInfo: { flex: 1, marginLeft: 12 },
  userName: { fontSize: 16, fontWeight: '600' },
  userBio: { fontSize: 13, color: '#666', marginTop: 2 },
  
  followButton: {
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  followButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  
  followingButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  followingText: { color: '#000', fontWeight: '600', fontSize: 13 },
  
  unfollowButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  unfollowText: { color: '#666', fontWeight: '600', fontSize: 13 },
  
  emptyContainer: { 
    alignItems: 'center', 
    paddingTop: 60,
  },
  emptyText: { 
    fontSize: 16, 
    color: '#999', 
    marginTop: 15,
    textAlign: 'center',
  },
});

export default FriendsScreen;
