import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePlotsData } from '../../src/hooks/usePlotsData';

export default function PlotsListScreen() {
  const router = useRouter();
  const { plots, loading, refreshPlots } = usePlotsData();

  return (
    <View style={styles.container}>
      <FlatList
        data={plots}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshPlots} tintColor="#10B981" />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>🌾 Lotes del Establecimiento</Text>
            <Text style={styles.headerSubtitle}>
              Selecciona una parcela para supervisar telemetría y controlar actuadores
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { borderLeftColor: item.statusColor }]}
            onPress={() => router.push(`/plot/${item.id}`)}
          >
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.plotName}>{item.name}</Text>
                <Text style={styles.cropName}>🌱 {item.crop}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: item.statusColor + '20' }]}>
                <Text style={[styles.statusText, { color: item.statusColor }]}>
                  {item.statusLabel}
                </Text>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Humedad Actual</Text>
                <Text style={[styles.metricValue, { color: item.statusColor }]}>
                  {item.lastReading ? `${item.lastReading.moisture_pct.toFixed(1)}%` : '--'}
                </Text>
              </View>

              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Umbral Mín.</Text>
                <Text style={styles.metricValue}>{item.threshold_min}%</Text>
              </View>

              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Válvula</Text>
                <Text style={styles.metricValue}>
                  {item.valves[0]?.status === 'open' ? '💧 Abierta' : '🔒 Cerrada'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  listContent: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    borderLeftWidth: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  plotName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  cropName: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F1F5F9',
  },
});
