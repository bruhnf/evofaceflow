import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Modal,
  Alert,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useUserStore } from '../store/useUserStore';

interface ProfileDropdownProps {
  showShareButton?: boolean;
}

const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ showShareButton = false }) => {
  const navigation = useNavigation();
  const { logout, avatarUrl } = useUserStore();
  const [menuVisible, setMenuVisible] = useState(false);

  const handleLogout = async () => {
    setMenuVisible(false);
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
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' as never }],
            });
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {showShareButton && (
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="share-outline" size={24} color="#000" />
        </TouchableOpacity>
      )}
      
      <TouchableOpacity 
        style={styles.profileButton} 
        onPress={() => setMenuVisible(true)}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.profileImage} />
        ) : (
          <View style={styles.profilePlaceholder}>
            <Ionicons name="person" size={20} color="#666" />
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('Main' as never, { screen: 'Profile' } as never);
              }}
            >
              <Ionicons name="person-circle-outline" size={22} color="#000" />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('EditProfile' as never);
              }}
            >
              <Ionicons name="create-outline" size={22} color="#000" />
              <Text style={styles.menuItemText}>Edit Profile</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('Main' as never, { screen: 'Settings' } as never);
              }}
            >
              <Ionicons name="settings-outline" size={22} color="#000" />
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
            
            <View style={styles.menuDivider} />
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={22} color="#FF3B30" />
              <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  iconButton: {
    padding: 5,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  profilePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  menuOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'flex-start', 
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 15,
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: '#000',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 4,
  },
});

export default ProfileDropdown;
