import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { usePlotsData } from '../../src/hooks/usePlotsData';
import { useRouter } from 'expo-router';

export default function AlertsScreen() {
  const router = useRouter();
  const { plots } = usePlotsData();

  // Generar alertas dinámicas basadas en el estado real de los lotes (RF-19, RF-20, RF-22)
  const alerts = [];

  for (const p of plots) {
    if (p.status === 'dry') {
      alerts.push({
        id: `dry-${p.id}`,
        plotId: p.id,
        plotName: p.name,
        type: 'dry',
        title: `🚨 Alerta de Humedad Baja: ${p.name}`,
        message: `Humedad actual en ${p.lastReading?.moisture_pct.toFixed(1)}%, por debajo del umbral mínimo de ${p.threshold_min}%.`,
        suggestion: '💡 Sugerencia agronómica: Humedad bajo umbral, considerar riego.',
        time: 'En curso',
        color: '#EF4444',
      });
    } else if (p.status === 'stale') {
      alerts.push({
        id: `stale-${p.id}`,
        plotId: p.id,
        plotName: p.name,
        type: 'stale',
        title: `⚠️ Sensor Desactualizado (Stale): ${p.name}`,
        message: `La estación meteorológica no reporta ticks hace más de 15 minutos. Verificar conexión o batería de la sonda.`,
        suggestion: null,
        time: 'Detectado hace 10 min',
        color: '#94A3B8',
      });
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>🔔 Centro de Notificaciones y Alertas</Text>
            <Text style={styles.headerSubtitle}>
              Monitoreo continuo de anomalías hídricas y fallos de telemetría IoT
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>Todo en orden</Text>
            <Text style={styles.emptySubtitle}>No hay alertas activas de sequía ni sensores caídos.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.alertCard, { borderLeftColor: item.color }]}
            onPress={() => router.push(`/plot/${item.plotId}`)}
          >
            <View style={styles.alertHeader}>
              <Text style={styles.alertTitle}>{item.title}</Text>
              <Text style={styles.alertTime}>{item.time}</Text>
            </View>
            <Text style={styles.alertMessage}>{item.message}</Text>
            {item.suggestion && (
              <View style={styles.suggestionBox}>
                <Text style={styles.suggestionText}>{item.suggestion}</Text>
              </View>
            )}
            <Text style={styles.actionPrompt}>Toca para ir al lote y activar riego →</Text>
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  alertCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    borderLeftWidth: 6,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
    marginRight: 8,
  },
  alertTime: {
    fontSize: 11,
    color: '#94A3B8',
  },
  alertMessage: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 18,
  },
  suggestionBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  suggestionText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '600',
  },
  actionPrompt: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'right',
  },
});
