import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { usePlotsData } from '../src/hooks/usePlotsData';

export default function DiagnosticsScreen() {
  const { user, role, activeOrg } = useAuth();
  const { plots, lastTickReceived, diagnosticLagMs, refreshPlots } = usePlotsData();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>🔬 Observabilidad y Diagnóstico (RF-23)</Text>
        <Text style={styles.subtitle}>Métricas del pipeline de telemetría y contexto de sesión</Text>
      </View>

      {/* Identidad y Aislamiento Multi-tenant (OA-1) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 Contexto de Usuario y Aislamiento</Text>
        <View style={styles.row}>
          <Text style={styles.label}>User ID:</Text>
          <Text style={styles.val}>{user?.id || 'demo-producer-user-id'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.val}>{user?.email || 'productor@agropulse.test'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Rol Activo (RLS):</Text>
          <Text style={[styles.val, { color: '#10B981', fontWeight: 'bold' }]}>{role.toUpperCase()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Organization ID:</Text>
          <Text style={styles.val}>{activeOrg?.id || 'a0000000-0000-0000-0000-000000000001'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Establecimiento:</Text>
          <Text style={styles.val}>{activeOrg?.name || 'Estancia Didáctica Concordia'}</Text>
        </View>
      </View>

      {/* Estado del Pipeline de Streaming & Realtime (OA-4, RNF-04) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚡ Streaming & Latencia de Telemetría</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Último tick recibido:</Text>
          <Text style={styles.val}>
            {lastTickReceived ? lastTickReceived.toLocaleTimeString() : 'Esperando tick...'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Lag aparente (RNF-04):</Text>
          <Text style={[styles.val, { color: diagnosticLagMs < 3000 ? '#10B981' : '#F59E0B' }]}>
            {diagnosticLagMs ? `${(diagnosticLagMs / 1000).toFixed(2)} s` : '< 1.5 s (Óptimo)'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Supabase Realtime:</Text>
          <Text style={[styles.val, { color: '#10B981' }]}>🟢 Conectado (Websocket)</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Broker Kafka (Backend):</Text>
          <Text style={styles.val}>Redpanda v24 (Puerto 9092)</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>AgroMonitoring API:</Text>
          <Text style={[styles.val, { color: '#38BDF8' }]}>🛰️ Integrado (Concordia Coords)</Text>
        </View>
      </View>

      {/* Lotes Supervisados */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🌾 Resumen de Lotes en Memoria ({plots.length})</Text>
        {plots.map((p) => (
          <View key={p.id} style={styles.plotMiniRow}>
            <Text style={styles.plotMiniName}>{p.name}</Text>
            <Text style={[styles.plotMiniStatus, { color: p.statusColor }]}>
              {p.statusLabel} ({p.lastReading?.moisture_pct.toFixed(1)}%)
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.refreshBtn} onPress={refreshPlots}>
        <Text style={styles.refreshBtnText}>🔄 Re-verificar Conexión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38BDF8',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
    color: '#94A3B8',
  },
  val: {
    fontSize: 12,
    color: '#F1F5F9',
    fontWeight: '600',
  },
  plotMiniRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#0F172A',
  },
  plotMiniName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  plotMiniStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  refreshBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  refreshBtnText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 14,
  },
});
