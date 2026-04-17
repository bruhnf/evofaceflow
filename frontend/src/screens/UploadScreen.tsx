import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, ActivityIndicator, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from '../store/useUserStore';
import { API_BASE_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UploadScreen = () => {
  const { subscriptionLevel, userId } = useUserStore();
  
  const maxImages = subscriptionLevel === 'premium' ? 6 : 
                   subscriptionLevel === 'pro' ? 4 : 2;

  const [imageSlots, setImageSlots] = useState<(string | null)[]>(Array(maxImages).fill(null));
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Resize image to max 720px on longest side while keeping aspect ratio
  const resizeImage = async (uri: string): Promise<string> => {
    // Get image dimensions
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }));
    });

    const maxDimension = 720;
    
    // Only resize if needed
    if (width <= maxDimension && height <= maxDimension) {
      // Still compress for smaller file size
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      return result.uri;
    }

    // Calculate new dimensions keeping aspect ratio
    let newWidth: number;
    let newHeight: number;
    
    if (width > height) {
      newWidth = maxDimension;
      newHeight = Math.round((height / width) * maxDimension);
    } else {
      newHeight = maxDimension;
      newWidth = Math.round((width / height) * maxDimension);
    }

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: newWidth, height: newHeight } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
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
  
  if (filledUris.length < 2) {
    Alert.alert('Not enough photos', 'You need at least 2 photos to create your video.');
    return;
  }

  if (!prompt.trim()) {
    Alert.alert('Prompt required', 'Please describe how you want your video to look.');
    return;
  }

  setIsUploading(true);

  try {
    const token = await AsyncStorage.getItem('token');

    const formData = new FormData();
    formData.append('prompt', prompt.trim());
    
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
        'Authorization': `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (result.success) {
      Alert.alert(
        'Video Generation Started!', 
        result.message + '\n\nYou can track progress in your Profile under "My Life Journey Videos".',
        [{ text: 'OK' }]
      );
      // Clear the image slots and prompt after successful upload
      setImageSlots(Array(maxImages).fill(null));
      setPrompt('');
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
        <Text style={styles.title}>Create Your Life Journey</Text>
        
        <Text style={styles.subtitle}>
          Upload photos from different ages to create{"\n"}
          a stunning morphing video of your life!
        </Text>

        <Text style={styles.subscriptionInfo}>
          <Text style={styles.bold}>{subscriptionLevel.toUpperCase()}</Text> plan • {maxImages} photos = {maxImages <= 2 ? '10' : maxImages <= 4 ? '20' : '30'}s video
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

        <View style={styles.promptContainer}>
          <Text style={styles.promptLabel}>Describe your video</Text>
          <TextInput
            style={styles.promptInput}
            placeholder="E.g., Create a smooth cinematic video showing my life journey with gentle transitions..."
            placeholderTextColor="#999"
            value={prompt}
            onChangeText={setPrompt}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!isUploading}
          />
        </View>

        {imageSlots.filter(slot => slot !== null).length >= 2 && (
          <TouchableOpacity 
            style={[styles.createButton, isUploading && styles.disabledButton]} 
            onPress={uploadToS3}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.createButtonText}>
                Create My Video
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
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginBottom: 25 },
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
  promptContainer: {
    width: '100%',
    marginBottom: 30,
  },
  promptLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  promptInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 15,
    fontSize: 15,
    minHeight: 100,
    backgroundColor: '#fafafa',
    color: '#333',
  },
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