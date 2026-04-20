import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserStore } from '../store/useUserStore';
import { API_BASE_URL } from '../config/api';

const ProfilePhotoUploadScreen = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { setUser, refreshProfile } = useUserStore();
  const navigation = useNavigation();

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const uploadPhoto = async () => {
    if (!selectedImage) return;

    setIsUploading(true);

    try {
      const token = await AsyncStorage.getItem('token');
      
      // Upload photo to S3 via backend
      const formData = new FormData();
      formData.append('photo', { uri: selectedImage, name: 'profile.jpg', type: 'image/jpeg' } as any);

      const response = await fetch(`${API_BASE_URL}/api/auth/profile-photo`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.avatarUrl) {
        console.log('✅ Profile photo uploaded successfully!');
        console.log('📸 Avatar URL:', data.avatarUrl);
        
        // Update local state
        setUser({ avatarUrl: data.avatarUrl });
        
        // Refresh profile from server to ensure sync
        await refreshProfile();
        
        Alert.alert('Success', 'Your profile photo has been updated.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert('Upload Failed', data.message || 'Failed to upload profile photo');
      }
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      Alert.alert('Error', 'Failed to upload profile photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Back Arrow */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Update Profile Photo</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {selectedImage ? (
          <>
            <Image source={{ uri: selectedImage }} style={styles.preview} />
            
            <Text style={styles.instructionText}>
              Review your photo before saving
            </Text>

            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={[styles.secondaryButton, isUploading && styles.buttonDisabled]} 
                onPress={() => navigation.goBack()}
                disabled={isUploading}
              >
                <Ionicons name="arrow-back" size={20} color="#000" />
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.primaryButton, isUploading && styles.buttonDisabled]} 
                onPress={uploadPhoto}
                disabled={isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.primaryButtonText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.chooseAnotherButton} 
              onPress={pickPhoto}
              disabled={isUploading}
            >
              <Text style={styles.chooseAnotherText}>Choose Another Photo</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.placeholderContainer}>
              <Ionicons name="camera" size={80} color="#ccc" />
              <Text style={styles.placeholderText}>No photo selected</Text>
            </View>

            <TouchableOpacity 
              style={styles.primaryButton} 
              onPress={pickPhoto}
            >
              <Ionicons name="images" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Choose Photo</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  headerSpacer: { width: 34 },
  content: { padding: 20, alignItems: 'center', flex: 1, justifyContent: 'center' },
  preview: { width: 200, height: 200, borderRadius: 100, marginBottom: 20, borderWidth: 3, borderColor: '#000' },
  instructionText: { fontSize: 16, color: '#666', marginBottom: 30, textAlign: 'center' },
  buttonContainer: { flexDirection: 'row', gap: 15, marginBottom: 20, width: '100%', justifyContent: 'center' },
  primaryButton: { 
    backgroundColor: '#000', 
    paddingVertical: 16, 
    paddingHorizontal: 30, 
    borderRadius: 30, 
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 140,
    justifyContent: 'center',
  },
  primaryButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  secondaryButton: { 
    backgroundColor: '#f0f0f0', 
    paddingVertical: 16, 
    paddingHorizontal: 30, 
    borderRadius: 30, 
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 140,
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  buttonDisabled: { opacity: 0.6 },
  chooseAnotherButton: { marginTop: 10 },
  chooseAnotherText: { color: '#007AFF', fontSize: 16 },
  placeholderContainer: { alignItems: 'center', marginBottom: 40 },
  placeholderText: { fontSize: 18, color: '#999', marginTop: 15 },
});

export default ProfilePhotoUploadScreen;