import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from '../store/useUserStore';
import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UploadScreen = () => {
  const { subscriptionLevel, userId } = useUserStore();
  
  const maxImages = subscriptionLevel === 'advanced' ? 9 : 
                   subscriptionLevel === 'intermediate' ? 6 : 3;

  const [imageSlots, setImageSlots] = useState<(string | null)[]>(Array(maxImages).fill(null));
  const [isUploading, setIsUploading] = useState(false);

  // Resize image to target resolution for morph effect (576x1024 portrait or 1024x576 landscape)
  const resizeImage = async (uri: string): Promise<string> => {
    // Get image dimensions to determine orientation
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }));
    });

    const isPortrait = height > width;
    const targetWidth = isPortrait ? 576 : 1024;
    const targetHeight = isPortrait ? 1024 : 576;

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: targetWidth, height: targetHeight } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    return result.uri;
  };

  const pickImageForSlot = async (slotIndex: number) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.85,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newUri = result.assets[0].uri;
      const updatedSlots = [...imageSlots];
      updatedSlots[slotIndex] = newUri;
      setImageSlots(updatedSlots);
    }
  };

const uploadToS3 = async () => {
  const filledUris = imageSlots.filter((uri): uri is string => uri !== null);
  
  if (filledUris.length < 3) {
    Alert.alert('Not enough photos', 'You need at least 3 photos to create a video.');
    return;
  }

  setIsUploading(true);

  try {
    const token = await AsyncStorage.getItem('token');

    const formData = new FormData();
    for (let i = 0; i < filledUris.length; i++) {
      // Resize image before upload for faster transfers
      const resizedUri = await resizeImage(filledUris[i]);
      const filename = `photo_${i + 1}.jpg`;
      formData.append('images', { uri: resizedUri, name: filename, type: 'image/jpeg' } as any);
    }

    const response = await fetch(`${API_BASE_URL}/api/upload/images`, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,   // ← JWT protection
      },
    });

    const result = await response.json();

    if (result.success) {
      Alert.alert(
        'Upload Successful!', 
        `Video job created!\n\nVideo ID: ${result.videoId}\nExpected duration: ${result.durationSeconds}s`
      );
    } else {
      Alert.alert('Upload Failed', result.message);
    }
  } catch (error) {
    Alert.alert('Connection Error', 'Could not reach backend.');
  } finally {
    setIsUploading(false);
  }
};

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Create Your Life Journey Video</Text>
        
        <Text style={styles.subtitle}>
          Tap each box to add one photo.{'\n'}
          Order matters — photos are processed left-to-right for seamless morphs.
        </Text>

        <Text style={styles.subscriptionInfo}>
          Current plan: <Text style={styles.bold}>{subscriptionLevel.toUpperCase()}</Text> • Max {maxImages} images
        </Text>

        <View style={styles.imageGrid}>
          {imageSlots.map((uri, index) => (
            <TouchableOpacity 
              key={index} 
              style={styles.slotContainer}
              onPress={() => pickImageForSlot(index)}
              disabled={isUploading}
            >
              {uri ? (
                <View style={styles.filledSlot}>
                  <Image source={{ uri }} style={styles.imagePreview} />
                  <Text style={styles.photoLabel}>Photo {index + 1}</Text>
                </View>
              ) : (
                <View style={styles.emptySlot}>
                  <Ionicons name="add-circle-outline" size={48} color="#ddd" />
                  <Text style={styles.addText}>Add</Text>
                  <Text style={styles.slotLabel}>Photo {index + 1}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {imageSlots.filter(slot => slot !== null).length >= 3 && (
          <TouchableOpacity 
            style={[styles.createButton, isUploading && styles.disabledButton]} 
            onPress={uploadToS3}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.createButtonText}>
                Upload to S3 & Generate Video
              </Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 10, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  subtitle: { textAlign: 'center', color: '#444', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  subscriptionInfo: { fontSize: 15, color: '#666', marginBottom: 30 },
  bold: { fontWeight: '700', color: '#000' },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginBottom: 40 },
  slotContainer: { width: 110, alignItems: 'center' },
  filledSlot: { alignItems: 'center' },
  imagePreview: { width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderColor: '#000' },
  photoLabel: { marginTop: 8, fontSize: 13, color: '#666', fontWeight: '500' },
  emptySlot: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  addText: { marginTop: 8, fontSize: 16, color: '#999', fontWeight: '600' },
  slotLabel: { marginTop: 4, fontSize: 12, color: '#bbb' },
  createButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    paddingHorizontal: 50,
    borderRadius: 30,
  },
  disabledButton: { opacity: 0.6 },
  createButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});

export default UploadScreen;