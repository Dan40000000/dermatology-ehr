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

interface Bill {
  id: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  dueDate: string;
  status: string;
  description: string;
}

export default function BillsScreen() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBills();
  }, []);

  const loadBills = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/patient-portal/bills');
      setBills(response.data);
    } catch (error) {
      console.error('Failed to load bills:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderBill = ({ item }: { item: Bill }) => (
    <TouchableOpacity style={styles.billCard}>
      <View style={styles.billHeader}>
        <Text style={styles.description}>{item.description}</Text>
        <Text style={styles.amount}>${item.amountDue.toFixed(2)}</Text>
      </View>
      <View style={styles.billDetails}>
        <Text style={styles.detailText}>
          Due: {format(new Date(item.dueDate), 'MMM d, yyyy')}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      {item.status === 'unpaid' && (
        <TouchableOpacity style={styles.payButton}>
          <Text style={styles.payButtonText}>Pay Now</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return '#4caf50';
      case 'unpaid':
        return '#f44336';
      case 'partial':
        return '#ff9800';
      default:
        return '#999';
    }
  };

  const totalDue = bills.reduce((sum, bill) => sum + bill.amountDue, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bills & Payments</Text>
      </View>

      {totalDue > 0 && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Amount Due</Text>
          <Text style={styles.summaryAmount}>${totalDue.toFixed(2)}</Text>
          <TouchableOpacity style={styles.payAllButton}>
            <Text style={styles.payAllButtonText}>Pay All</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={bills}
        renderItem={renderBill}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadBills} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No bills</Text>
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
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  summaryCard: {
    backgroundColor: '#0066cc',
    margin: 20,
    padding: 24,
    borderRadius: 16,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  summaryAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
    marginBottom: 16,
  },
  payAllButton: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  payAllButtonText: {
    color: '#0066cc',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: 20,
    paddingTop: 0,
  },
  billCard: {
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
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  description: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f44336',
  },
  billDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  payButton: {
    backgroundColor: '#0066cc',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
