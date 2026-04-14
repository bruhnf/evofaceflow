import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import SignupScreen from './src/screens/SignupScreen';
import LoginScreen from './src/screens/LoginScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import UploadScreen from './src/screens/UploadScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import ProfilePhotoUploadScreen from './src/screens/ProfilePhotoUploadScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HomeScreen from './src/screens/HomeScreen';
import { useUserStore } from './src/store/useUserStore';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      tabBarActiveTintColor: '#000',
      tabBarInactiveTintColor: '#888',
      headerShown: false,
      tabBarStyle: { height: 70 },
    }}
  >
    <Tab.Screen 
      name="Home" 
      component={HomeScreen}
      options={{ tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> }}
    />
    <Tab.Screen 
      name="Friends" 
      component={FriendsScreen}
      options={{ tabBarIcon: ({ color }) => <Ionicons name="people" size={24} color={color} /> }}
    />
    <Tab.Screen 
      name="Create" 
      component={UploadScreen}
      options={{
        tabBarIcon: ({ color }) => (
          <View style={{
            backgroundColor: '#000',
            width: 62,
            height: 62,
            borderRadius: 31,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 25,
          }}>
            <Ionicons name="camera" size={34} color="white" />
          </View>
        ),
        tabBarLabel: () => null,
      }}
    />
    <Tab.Screen 
      name="Profile" 
      component={ProfileScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} /> }}
    />
    <Tab.Screen 
      name="Settings" 
      component={SettingsScreen}
      options={{ tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} /> }}
    />
  </Tab.Navigator>
);

const App = () => {
  const { userId, loadUserFromStorage } = useUserStore();

  // Load persisted user on app start
  useEffect(() => {
    loadUserFromStorage();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!userId ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="ProfilePhotoUpload" component={ProfilePhotoUploadScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;