import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  Image, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  RefreshControl,
  Modal 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useUserStore } from '../store/useUserStore';
import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import ProfileDropdown from '../components/ProfileDropdown';

interface VideoItem {
  videoId: string;
  durationSeconds: number;
  status: 'processing' | 'completed' | 'failed';
  thumbnailUrl?: string;
  finalVideoUrl?: string;
}

const ProfileScreen = () => {
  const navigation = useNavigation();
  const { 
    username, 
    subscriptionLevel, 
    userId, 
    bio, 
    avatarUrl,
    followingCount, 
    followersCount, 
    likesCount, 
    refreshProfile 
  } = useUserStore();

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);

  const navigateToFriends = (tab: 'following' | 'followers') => {
    // Navigate to Friends tab - the tab will show the appropriate section
    navigation.navigate('Friends' as never);
  };

  const fetchVideos = async () => {
    if (!userId) return;

    try {
      const token = await AsyncStorage.getItem('token');

      const response = await fetch(`${API_BASE_URL}/api/videos`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setVideos(data);
      }
    } catch (error) {
      console.error('Failed to fetch videos', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchVideos(), refreshProfile()]);
    setRefreshing(false);
  }, [userId]);

  // Refresh profile data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [])
  );

  useEffect(() => {
    if (userId) fetchVideos();
  }, [userId]);

  // Auto-poll for processing videos every 10 seconds
  useEffect(() => {
    const hasProcessingVideos = videos.some(v => v.status === 'processing');
    
    if (hasProcessingVideos) {
      const pollInterval = setInterval(() => {
        fetchVideos();
      }, 10000); // 10 seconds
      
      return () => clearInterval(pollInterval);
    }
  }, [videos]);

  const displayName = username || 'New User Name';
  const displayHandle = username ? `@${username}` : '@user03978539';
  const displayBio = bio || 'Add your bio here. Tell people about yourself and what you love!';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={['#000']}
            tintColor="#000"
          />
        }
      >
        {/* Header Icons */}
        <View style={styles.headerIcons}>
          <ProfileDropdown showShareButton={true} />
        </View>

        {/* Avatar + + Button */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatarWrapper}>
            <Image 
              key={avatarUrl || 'placeholder'}
              source={{ uri: avatarUrl || 'https://via.placeholder.com/150/000000/FFFFFF?text=You' }} 
              style={styles.avatar} 
            />
            <TouchableOpacity 
              style={styles.plusButton} 
              onPress={() => navigation.navigate('ProfilePhotoUpload' as never)}
            >
              <Ionicons name="add" size={32} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Username & Edit */}
        <View style={styles.userInfo}>
          <Text style={styles.username}>{displayName}</Text>
          <TouchableOpacity 
            style={styles.editButton}
            onPress={() => navigation.navigate('EditProfile' as never)}
          >
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.handle}>{displayHandle}</Text>

        {/* Stats - Clickable */}
        <View style={styles.statsContainer}>
          <TouchableOpacity style={styles.stat} onPress={() => navigateToFriends('following')}>
            <Text style={styles.statNumber}>{followingCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stat} onPress={() => navigateToFriends('followers')}>
            <Text style={styles.statNumber}>{followersCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{likesCount}</Text>
            <Text style={styles.statLabel}>Likes</Text>
          </View>
        </View>

        {/* Bio */}
        <Text style={styles.bio}>{displayBio}</Text>

        <TouchableOpacity style={styles.addCollegeButton}>
          <Text style={styles.addCollegeText}>+ Add college</Text>
        </TouchableOpacity>

        {/* My Videos Section with Player */}
        <View style={styles.videosSection}>
          <Text style={styles.sectionTitle}>My Life Journey Videos</Text>
          
          {videos.length === 0 ? (
            <Text style={styles.noVideosText}>No videos yet. Create your first one!</Text>
          ) : (
            <View style={styles.videoGrid}>
              {videos.map((video) => (
                <TouchableOpacity 
                  key={video.videoId} 
                  style={styles.videoThumbnail}
                  onPress={() => video.status === 'completed' && setSelectedVideo(video)}
                >
                  <View style={styles.thumbnailContainer}>
                    <Image 
                      source={{ uri: video.thumbnailUrl || 'https://via.placeholder.com/150/000000/FFFFFF?text=Video' }} 
                      style={styles.thumbnail} 
                    />
                    
                    {video.status === 'processing' && (
                      <View style={styles.processingBadge}>
                        <Text style={styles.statusText}>Processing...</Text>
                      </View>
                    )}
                    {video.status === 'completed' && (
                      <View style={styles.completedBadge}>
                        <Text style={styles.statusText}>▶ Ready</Text>
                      </View>
                    )}
                    {video.status === 'failed' && (
                      <View style={styles.failedBadge}>
                        <Text style={styles.statusText}>Failed</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.videoDuration}>{video.durationSeconds}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Video Player Modal */}
      <Modal
        visible={!!selectedVideo}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedVideo(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setSelectedVideo(null)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            {selectedVideo?.finalVideoUrl && (
              <ExpoVideo
                source={{ uri: selectedVideo.finalVideoUrl }}
                style={styles.fullVideo}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
              />
            )}

            <Text style={styles.modalTitle}>
              {selectedVideo?.durationSeconds}s Life Journey Video
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { alignItems: 'center', paddingBottom: 100 },
  headerIcons: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', padding: 15, gap: 20 },
  avatarContainer: { marginTop: 20 },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#ddd' },
  plusButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#000',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 15, gap: 12 },
  username: { fontSize: 22, fontWeight: '700' },
  editButton: { backgroundColor: '#f0f0f0', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  editText: { fontSize: 14, color: '#000' },
  handle: { color: '#666', marginTop: 4, fontSize: 15 },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', width: '90%', marginTop: 30 },
  stat: { alignItems: 'center' },
  statNumber: { fontSize: 21, fontWeight: '700' },
  statLabel: { color: '#666', fontSize: 13, marginTop: 2 },
  bio: { textAlign: 'center', marginTop: 25, paddingHorizontal: 40, fontSize: 15.5, color: '#333', lineHeight: 22 },
  addCollegeButton: { backgroundColor: '#f0f0f0', paddingHorizontal: 22, paddingVertical: 9, borderRadius: 20, marginTop: 18 },
  addCollegeText: { fontSize: 15 },

  videosSection: { marginTop: 50, width: '100%', paddingHorizontal: 20 },
  sectionTitle: { fontSize: 20, fontWeight: '600', marginBottom: 15, alignSelf: 'flex-start' },
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  videoThumbnail: { width: 110, alignItems: 'center' },
  thumbnailContainer: { position: 'relative', width: 100, height: 100 },
  thumbnail: { width: 100, height: 100, borderRadius: 12, backgroundColor: '#eee' },
  processingBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: '#FF9800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  completedBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: '#4CAF50', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  failedBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: '#F44336', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText: { color: 'white', fontSize: 10, fontWeight: '600' },
  videoDuration: { marginTop: 6, fontSize: 13, color: '#666' },
  noVideosText: { fontSize: 19, color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },

  /* Video Player Modal */
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  modalContent: { flex: 1, justifyContent: 'center', padding: 20 },
  closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  fullVideo: { width: '100%', height: 500, backgroundColor: '#000' },
  modalTitle: { color: '#fff', textAlign: 'center', fontSize: 18, marginTop: 20 },
});

export default ProfileScreen;