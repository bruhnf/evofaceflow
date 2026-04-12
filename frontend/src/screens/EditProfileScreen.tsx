import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserStore } from '../store/useUserStore';
import { API_BASE_URL } from '../config/api';

const EditProfileScreen = () => {
  const { username, bio, setUser } = useUserStore();
  const [newUsername, setNewUsername] = useState(username || '');
  const [newBio, setNewBio] = useState(bio || '');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  const handleSave = async () => {
    if (!newUsername.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }

    setLoading(true);

    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          bio: newBio.trim(),
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setUser({
          username: result.user.username,
          bio: result.user.bio,
        });
        Alert.alert('Profile Updated', 'Your changes have been saved.');
        navigation.goBack();
      } else {
        Alert.alert('Error', result.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Edit Profile</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          value={newUsername}
          onChangeText={setNewUsername}
          autoCapitalize="none"
        />

        <TextInput
          style={[styles.input, styles.bioInput]}
          placeholder="Bio (optional)"
          value={newBio}
          onChangeText={setNewBio}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
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
  content: { padding: 20, flex: 1 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  input: { 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 12, 
    padding: 15, 
    marginBottom: 15, 
    fontSize: 16 
  },
  bioInput: { height: 120, textAlignVertical: 'top' },
  saveButton: { 
    backgroundColor: '#000', 
    padding: 16, 
    borderRadius: 30, 
    alignItems: 'center', 
    marginTop: 30 
  },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { marginTop: 20, alignItems: 'center' },
  cancelText: { color: '#666', fontSize: 16 },
});

export default EditProfileScreen;