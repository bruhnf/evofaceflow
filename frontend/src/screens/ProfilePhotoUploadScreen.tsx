import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserStore } from '../store/useUserStore';
import { API_BASE_URL } from '../config/api';

const ProfilePhotoUploadScreen = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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

      // TODO: In production, upload to S3 first and use the S3 URL
      // For now, save the local URI (works for this session)
      try {
        const token = await AsyncStorage.getItem('token');
        await fetch(`${API_BASE_URL}/api/auth/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ avatarUrl: uri }),
        });
      } catch (error) {
        console.error('Failed to save avatar URL:', error);
      }

      setUser({ avatarUrl: uri });
      Alert.alert('Profile Photo Updated', 'Your profile photo has been updated.');
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Update Profile Photo</Text>

        {selectedImage && (
          <Image source={{ uri: selectedImage }} style={styles.preview} />
        )}

        <TouchableOpacity style={styles.button} onPress={pickAndUploadProfilePhoto}>
          <Text style={styles.buttonText}>Choose New Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, alignItems: 'center', flex: 1, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  preview: { width: 180, height: 180, borderRadius: 90, marginBottom: 40 },
  button: { backgroundColor: '#000', padding: 16, borderRadius: 30, width: '80%', alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { marginTop: 20 },
  cancelText: { color: '#666', fontSize: 16 },
});

export default ProfilePhotoUploadScreen;