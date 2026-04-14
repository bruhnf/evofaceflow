import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useUserStore } from '../store/useUserStore';
import ProfileDropdown from '../components/ProfileDropdown';

const SettingsScreen = () => {
  const navigation = useNavigation();
  const { logout, username } = useUserStore();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [darkMode, setDarkMode] = React.useState(false);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // Navigation happens automatically via conditional rendering in App.tsx
          },
        },
      ]
    );
  };

  const SettingItem = ({ 
    icon, 
    title, 
    subtitle,
    onPress, 
    rightComponent,
    danger = false 
  }: { 
    icon: string; 
    title: string; 
    subtitle?: string;
    onPress?: () => void;
    rightComponent?: React.ReactNode;
    danger?: boolean;
  }) => (
    <TouchableOpacity 
      style={styles.settingItem} 
      onPress={onPress}
      disabled={!onPress && !rightComponent}
    >
      <View style={styles.settingLeft}>
        <Ionicons 
          name={icon as any} 
          size={22} 
          color={danger ? '#FF3B30' : '#000'} 
        />
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, danger && { color: '#FF3B30' }]}>
            {title}
          </Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightComponent || (onPress && <Ionicons name="chevron-forward" size={20} color="#ccc" />)}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <ProfileDropdown />
      </View>
      
      <ScrollView style={styles.scrollView}>
        {/* Account Section */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.section}>
          <SettingItem 
            icon="person-outline" 
            title="Edit Profile"
            onPress={() => navigation.navigate('EditProfile' as never)}
          />
          <SettingItem 
            icon="lock-closed-outline" 
            title="Change Password"
            onPress={() => Alert.alert('Coming Soon', 'Password change will be available soon.')}
          />
          <SettingItem 
            icon="mail-outline" 
            title="Email"
            subtitle="Update your email address"
            onPress={() => Alert.alert('Coming Soon', 'Email change will be available soon.')}
          />
        </View>

        {/* Preferences Section */}
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.section}>
          <SettingItem 
            icon="notifications-outline" 
            title="Push Notifications"
            rightComponent={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#ddd', true: '#000' }}
                thumbColor="#fff"
              />
            }
          />
          <SettingItem 
            icon="moon-outline" 
            title="Dark Mode"
            rightComponent={
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: '#ddd', true: '#000' }}
                thumbColor="#fff"
              />
            }
          />
        </View>

        {/* Privacy Section */}
        <Text style={styles.sectionTitle}>Privacy</Text>
        <View style={styles.section}>
          <SettingItem 
            icon="eye-off-outline" 
            title="Private Account"
            subtitle="Only followers can see your videos"
            onPress={() => Alert.alert('Coming Soon', 'Private account settings coming soon.')}
          />
          <SettingItem 
            icon="people-outline" 
            title="Blocked Users"
            onPress={() => Alert.alert('Coming Soon', 'Block list coming soon.')}
          />
        </View>

        {/* Support Section */}
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.section}>
          <SettingItem 
            icon="help-circle-outline" 
            title="Help Center"
            onPress={() => Alert.alert('Help', 'For support, email support@evofaceflow.com')}
          />
          <SettingItem 
            icon="document-text-outline" 
            title="Terms of Service"
            onPress={() => Alert.alert('Terms', 'Terms of Service - Coming Soon')}
          />
          <SettingItem 
            icon="shield-outline" 
            title="Privacy Policy"
            onPress={() => Alert.alert('Privacy', 'Privacy Policy - Coming Soon')}
          />
        </View>

        {/* Danger Zone */}
        <Text style={styles.sectionTitle}>Account Actions</Text>
        <View style={styles.section}>
          <SettingItem 
            icon="log-out-outline" 
            title="Logout"
            onPress={handleLogout}
            danger
          />
        </View>

        <Text style={styles.versionText}>EvoFaceFlow v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  title: { fontSize: 28, fontWeight: 'bold', paddingVertical: 15 },
  scrollView: { flex: 1 },
  
  sectionTitle: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#666', 
    marginTop: 25, 
    marginBottom: 8, 
    marginLeft: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 15,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: '#000',
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  
  versionText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 13,
    marginTop: 30,
    marginBottom: 40,
  },
});

export default SettingsScreen;
