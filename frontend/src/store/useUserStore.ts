import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

interface UserState {
  userId: string | null;
  username: string | null;
  subscriptionLevel: 'basic' | 'pro' | 'premium';
  verified: boolean;
  bio?: string;
  avatarUrl?: string;
  followingCount: number;
  followersCount: number;
  likesCount: number;

  setUser: (user: Partial<Omit<UserState, 'setUser' | 'logout' | 'loadUserFromStorage' | 'refreshProfile'>>) => void;
  logout: () => Promise<void>;
  loadUserFromStorage: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  userId: null,
  username: null,
  subscriptionLevel: 'basic',
  verified: false,
  bio: '',
  avatarUrl: undefined,
  followingCount: 1631,
  followersCount: 1572,
  likesCount: 10,

  setUser: (userData) => set((state) => ({ ...state, ...userData })),

  logout: async () => {
    await AsyncStorage.removeItem('token');
    set({ 
      userId: null, 
      username: null, 
      subscriptionLevel: 'basic',
      verified: false,
      bio: '',
      avatarUrl: undefined,
      followingCount: 1631,
      followersCount: 1572,
      likesCount: 10,
    });
  },

  loadUserFromStorage: async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        // Fetch current user profile from backend
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        
        if (response.ok) {
          const user = await response.json();
          set({
            userId: user.userId,
            username: user.username,
            subscriptionLevel: user.subscriptionLevel,
            verified: user.verified,
            bio: user.bio || '',
            avatarUrl: user.avatarUrl || '',
            followingCount: user.followingCount,
            followersCount: user.followersCount,
            likesCount: user.likesCount,
          });
        } else {
          // Token invalid, clear it
          await AsyncStorage.removeItem('token');
        }
      }
    } catch (error) {
      console.error('Failed to load user from storage', error);
    }
  },

  refreshProfile: async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const user = await response.json();
        set({
          followingCount: user.followingCount,
          followersCount: user.followersCount,
          likesCount: user.likesCount,
          bio: user.bio || '',
          avatarUrl: user.avatarUrl || '',
        });
      }
    } catch (error) {
      console.error('Failed to refresh profile', error);
    }
  },
}));