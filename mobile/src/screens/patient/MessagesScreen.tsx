import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import apiClient from '../../api/client';

interface Message {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  read: boolean;
  fromProvider: boolean;
}

export default function MessagesScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/patient-portal/messages');
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <TouchableOpacity style={[styles.messageCard, !item.read && styles.unread]}>
      <View style={styles.messageIcon}>
        <MaterialCommunityIcons
          name={item.read ? 'email-open' : 'email'}
          size={24}
          color={item.read ? '#999' : '#0066cc'}
        />
      </View>
      <View style={styles.messageContent}>
        <View style={styles.messageHeader}>
          <Text style={[styles.subject, !item.read && styles.subjectUnread]}>
            {item.subject}
          </Text>
          <Text style={styles.date}>{format(new Date(item.createdAt), 'MMM d')}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.from}>{item.fromProvider ? 'From Provider' : 'You'}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity style={styles.composeButton}>
          <MaterialCommunityIcons name="pencil" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMessages} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="message-text-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No messages</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  composeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 20,
  },
  messageCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  unread: {
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
  },
  messageIcon: {
    marginRight: 12,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  subject: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  subjectUnread: {
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  preview: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  from: {
    fontSize: 12,
    color: '#999',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0066cc',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
});
