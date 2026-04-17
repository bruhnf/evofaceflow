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
  const { setUser } = useUserStore();
  const navigation = useNavigation();

  const pickAndUploadProfilePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);
      setIsUploading(true);

      try {
        const token = await AsyncStorage.getItem('token');
        
        // Upload photo to S3 via backend
        const formData = new FormData();
        formData.append('photo', { uri, name: 'profile.jpg', type: 'image/jpeg' } as any);

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
          setUser({ avatarUrl: data.avatarUrl });
          Alert.alert('Profile Photo Updated', 'Your profile photo has been updated.');
          navigation.goBack();
        } else {
          Alert.alert('Upload Failed', data.message || 'Failed to upload profile photo');
        }
      } catch (error) {
        console.error('Failed to upload avatar:', error);
        Alert.alert('Error', 'Failed to upload profile photo. Please try again.');
      } finally {
        setIsUploading(false);
      }
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
        {selectedImage && (
          <Image source={{ uri: selectedImage }} style={styles.preview} />
        )}

        <TouchableOpacity 
          style={[styles.button, isUploading && styles.buttonDisabled]} 
          onPress={pickAndUploadProfilePhoto}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Choose New Photo</Text>
          )}
        </TouchableOpacity>
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
  preview: { width: 180, height: 180, borderRadius: 90, marginBottom: 40 },
  button: { backgroundColor: '#000', padding: 16, borderRadius: 30, width: '80%', alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});

export default ProfilePhotoUploadScreen;