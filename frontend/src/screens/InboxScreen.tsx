import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ProfileDropdown from '../components/ProfileDropdown';

interface InboxItem {
  id: string;
  type: 'like' | 'follow' | 'comment' | 'mention';
  message: string;
  timestamp: string;
}

const InboxScreen = () => {
  // Placeholder data - can be replaced with actual inbox data later
  const inboxItems: InboxItem[] = [];

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="mail-open-outline" size={80} color="#ddd" />
      <Text style={styles.emptyTitle}>No Messages Yet</Text>
      <Text style={styles.emptyText}>
        When you get notifications, they'll appear here.
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: InboxItem }) => (
    <View style={styles.inboxItem}>
      <View style={styles.iconContainer}>
        <Ionicons 
          name={
            item.type === 'like' ? 'heart' :
            item.type === 'follow' ? 'person-add' :
            item.type === 'comment' ? 'chatbubble' : 'at'
          } 
          size={20} 
          color="#000" 
        />
      </View>
      <View style={styles.messageContainer}>
        <Text style={styles.messageText}>{item.message}</Text>
        <Text style={styles.timestamp}>{item.timestamp}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inbox</Text>
        <ProfileDropdown />
      </View>
      
      <FlatList
        data={inboxItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={inboxItems.length === 0 ? styles.emptyContent : styles.listContent}
        ListEmptyComponent={renderEmpty}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 20,
    color: '#333',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  inboxItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  messageContainer: {
    flex: 1,
  },
  messageText: {
    fontSize: 15,
    color: '#333',
  },
  timestamp: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
});

export default InboxScreen;
