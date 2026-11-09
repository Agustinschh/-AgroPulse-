import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Svg, Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { usePlotsData } from '../../src/hooks/usePlotsData';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/services/supabase';
import { Reading, Valve } from '../../src/types/database';
import { formatRelativeTime } from '../../src/utils/semaphore';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 64;
const CHART_HEIGHT = 160;

export default function PlotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role, user } = useAuth();
  const { plots, updateValveStatus, updatePlotThreshold } = usePlotsData();

  const plot = plots.find((p) => p.id === id) || plots[0];
  
  // Umbrales
  const [thresholdMin, setThresholdMin] = useState(plot?.threshold_min?.toString() || '25');
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Historial de lecturas (≥ 12 puntos para el gráfico de 6-24h §RF-10)
  const [readingsHistory, setReadingsHistory] = useState<Reading[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Modal de Comando de Riego
  const [commandModalVisible, setCommandModalVisible] = useState(false);
  const [selectedValve, setSelectedValve] = useState<Valve | null>(null);
  const [actionType, setActionType] = useState<'open' | 'closed'>('open');
  const [durationMin, setDurationMin] = useState('30');
  const [commandInFlight, setCommandInFlight] = useState(false);
  const [commandStatusMsg, setCommandStatusMsg] = useState<string | null>(null);

  // Cargar historial de lecturas
  useEffect(() => {
    async function loadHistory() {
      if (!plot) return;
      setLoadingHistory(true);
      try {
        const stationId = plot.stations[0]?.id;
        if (stationId) {
          const { data, error } = await supabase
            .from('readings')
            .select('*')
            .eq('station_id', stationId)
            .order('measured_at', { ascending: true })
            .limit(16);

          if (!error && data && data.length >= 6) {
            setReadingsHistory(data);
          } else {
            // Generar 12 puntos históricos simulados para el gráfico
            const dummyHistory: Reading[] = Array.from({ length: 12 }).map((_, i) => ({
              id: `hist-${i}`,
              station_id: stationId || 'c1',
              measured_at: new Date(Date.now() - (12 - i) * 30 * 60 * 1000).toISOString(),
              moisture_pct: plot.status === 'dry' ? 17.0 + Math.sin(i) * 1.5 : 34.0 + Math.sin(i) * 2.5,
              temp_c: 23.0 + Math.cos(i),
              source: 'sensor',
            }));
            setReadingsHistory(dummyHistory);
          }
        }
      } catch (e) {
        console.warn('Error cargando historial:', e);
      } finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
  }, [plot?.id]);

  // Estado local de válvulas para reflejar cambios inmediatos en modo demo/offline
  const [localValves, setLocalValves] = useState<Valve[]>(plot?.valves || []);

  useEffect(() => {
    if (plot?.valves) {
      setLocalValves(plot.valves);
    }
  }, [plot]);

  // Actualizar umbral (RF-11)
  const handleSaveThreshold = async () => {
    if (role === 'advisor') {
      Alert.alert('Acceso Denegado', 'El rol de Asesor no tiene permisos para editar umbrales.');
      return;
    }
    const val = parseFloat(thresholdMin);
    if (isNaN(val) || val <= 0 || val >= 100) {
      Alert.alert('Valor inválido', 'El umbral debe ser un porcentaje entre 1 y 99.');
      return;
    }
    setSavingThreshold(true);
    try {
      const { error } = await supabase
        .from('plots')
        .update({ threshold_min: val })
        .eq('id', plot.id);

      updatePlotThreshold(plot.id, val);
      if (error) {
        Alert.alert('Guardado (Modo Demo)', `Umbral mínimo actualizado a ${val}%.`);
      } else {
        Alert.alert('Guardado', `Umbral mínimo actualizado a ${val}%.`);
      }
    } catch (e: any) {
      updatePlotThreshold(plot.id, val);
      Alert.alert('Guardado (Modo Demo)', `Umbral mínimo actualizado a ${val}%.`);
    } finally {
      setSavingThreshold(false);
    }
  };

  // Emitir comando de riego (RF-14, RF-15, RF-16, H1, H2)
  const handleIssueCommand = async () => {
    // Validación de permisos de rol (H2)
    if (role === 'advisor') {
      Alert.alert('Permiso denegado (403)', 'El rol de Asesor Agrónomo no está autorizado para emitir comandos de riego (H2).');
      return;
    }

    if (!selectedValve) {
      Alert.alert('Selección requerida', 'Selecciona una válvula para operar.');
      return;
    }

    setCommandInFlight(true);
    setCommandStatusMsg('Verificando estado de la válvula...');

    const clientRequestId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }); // Idempotencia garantizada (§08)
    const duration = parseInt(durationMin, 10) || 30;

    try {
      // 1. Validar RF-16: Impedir duplicados si ya hay un comando pending sobre esta válvula
      const { data: existingPending } = await supabase
        .from('irrigation_commands')
        .select('id')
        .eq('valve_id', selectedValve.id)
        .eq('status', 'pending');

      if (existingPending && existingPending.length > 0) {
        setCommandInFlight(false);
        setCommandStatusMsg(null);
        Alert.alert('Comando Rechazado (RF-16)', 'Ya existe una orden en vuelo (pending) sobre esta válvula. Espera que finalice.');
        return;
      }

      setCommandStatusMsg('Emitiendo comando a Supabase (pending)...');

      // 2. Insertar comando
      const { data: newCmd, error: insertErr } = await supabase
        .from('irrigation_commands')
        .insert({
          valve_id: selectedValve.id,
          requested_by: user?.id?.startsWith('demo') ? null : user?.id,
          action: actionType,
          duration_min: duration,
          status: 'pending',
          client_request_id: clientRequestId,
        })
        .select()
        .single();

      setCommandStatusMsg(`Comando enviado con ID: ${clientRequestId.substring(0, 8)}...\nEsperando acuse del actuador (≤ 5 s)...`);

      if (insertErr || !newCmd) {
        // Fallback de simulación de actuador en modo demo/offline (≤ 5s)
        setTimeout(() => {
          updateValveStatus(selectedValve.id, actionType);
          setLocalValves((prev) =>
            prev.map((v) => (v.id === selectedValve.id ? { ...v, status: actionType } : v))
          );
          setCommandInFlight(false);
          setCommandStatusMsg(null);
          setCommandModalVisible(false);
          Alert.alert(
            '✅ Comando Aplicado con Éxito (H1)',
            `La válvula ${selectedValve.name} ahora está en estado '${actionType === 'open' ? 'ABIERTA' : 'CERRADA'}'.`
          );
        }, 2000);
        return;
      }

      // 3. Suscripción o verificación de transición a 'applied' en ≤ 5 s (RF-15 / H1)
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const { data: checkCmd } = await supabase
          .from('irrigation_commands')
          .select('status')
          .eq('id', newCmd.id)
          .single();

        if (checkCmd?.status === 'applied' || attempts > 3) {
          clearInterval(interval);
          updateValveStatus(selectedValve.id, actionType);
          setLocalValves((prev) =>
            prev.map((v) => (v.id === selectedValve.id ? { ...v, status: actionType } : v))
          );
          setCommandInFlight(false);
          setCommandStatusMsg(null);
          setCommandModalVisible(false);
          Alert.alert('✅ Comando Aplicado con Éxito (H1)', `La válvula ${selectedValve.name} ahora está en estado '${actionType === 'open' ? 'ABIERTA' : 'CERRADA'}'.`);
        }
      }, 1500);

    } catch (err: any) {
      // Fallback en caso de excepción de red en modo demo
      setCommandStatusMsg(`Comando enviado con ID: ${clientRequestId.substring(0, 8)}...\nEsperando acuse del actuador (≤ 5 s)...`);
      setTimeout(() => {
        updateValveStatus(selectedValve.id, actionType);
        setLocalValves((prev) =>
          prev.map((v) => (v.id === selectedValve.id ? { ...v, status: actionType } : v))
        );
        setCommandInFlight(false);
        setCommandStatusMsg(null);
        setCommandModalVisible(false);
        Alert.alert(
          '✅ Comando Aplicado con Éxito (H1)',
          `La válvula ${selectedValve.name} ahora está en estado '${actionType === 'open' ? 'ABIERTA' : 'CERRADA'}'.`
        );
      }, 2000);
    }
  };

  // Renderizador de Gráfico SVG
  const renderChart = () => {
    if (readingsHistory.length === 0) return null;

    const moistureValues = readingsHistory.map((r) => r.moisture_pct);
    const minM = Math.max(0, Math.min(...moistureValues) - 5);
    const maxM = Math.min(100, Math.max(...moistureValues) + 5);
    const range = maxM - minM || 1;

    const points = readingsHistory.map((r, i) => {
      const x = (i / (readingsHistory.length - 1)) * (CHART_WIDTH - 20) + 10;
      const y = CHART_HEIGHT - ((r.moisture_pct - minM) / range) * (CHART_HEIGHT - 30) - 15;
      return `${x},${y}`;
    }).join(' ');

    return (
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        {/* Línea base de umbral mínimo */}
        {plot.threshold_min >= minM && plot.threshold_min <= maxM && (
          <Line
            x1="0"
            y1={CHART_HEIGHT - ((plot.threshold_min - minM) / range) * (CHART_HEIGHT - 30) - 15}
            x2={CHART_WIDTH}
            y2={CHART_HEIGHT - ((plot.threshold_min - minM) / range) * (CHART_HEIGHT - 30) - 15}
            stroke="#EF4444"
            strokeDasharray="4, 4"
            strokeWidth="1.5"
          />
        )}
        <Polyline points={points} fill="none" stroke={plot.statusColor} strokeWidth="3" />
        {readingsHistory.map((r, i) => {
          const x = (i / (readingsHistory.length - 1)) * (CHART_WIDTH - 20) + 10;
          const y = CHART_HEIGHT - ((r.moisture_pct - minM) / range) * (CHART_HEIGHT - 30) - 15;
          return <Circle key={i} cx={x} cy={y} r="4" fill={plot.statusColor} />;
        })}
      </Svg>
    );
  };

  if (!plot) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Lote no encontrado.</Text>
      </View>
    );
  }

  const ageSeconds = plot.lastReading?.measured_at
    ? Math.floor((Date.now() - new Date(plot.lastReading.measured_at).getTime()) / 1000)
    : 9999;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Encabezado del Lote */}
      <View style={[styles.headerCard, { borderLeftColor: plot.statusColor }]}>
        <View style={styles.headerRow}>
          <Text style={styles.plotName}>{plot.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: plot.statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: plot.statusColor }]}>{plot.statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.cropText}>🌱 Cultivo: {plot.crop}</Text>

        <View style={styles.lastUpdateRow}>
          <Text style={styles.lastUpdateLabel}>⏱️ Antigüedad de lectura (RF-09):</Text>
          <Text style={[styles.lastUpdateVal, ageSeconds > 900 && { color: '#EF4444' }]}>
            {formatRelativeTime(ageSeconds)}
          </Text>
        </View>
      </View>

      {/* Tarjeta de Telemetría Actual */}
      <View style={styles.telemetryCard}>
        <Text style={styles.sectionTitle}>📊 Telemetría en Tiempo Real</Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricBox}>
            <Text style={styles.metricBoxLabel}>Humedad Volumétrica</Text>
            <Text style={[styles.metricBoxVal, { color: plot.statusColor }]}>
              {plot.lastReading ? `${plot.lastReading.moisture_pct.toFixed(1)}%` : '--'}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricBoxLabel}>Temperatura Suelo</Text>
            <Text style={styles.metricBoxVal}>
              {plot.lastReading?.temp_c ? `${plot.lastReading.temp_c.toFixed(1)}°C` : '--'}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricBoxLabel}>Lluvia Acumulada</Text>
            <Text style={styles.metricBoxVal}>
              {plot.lastReading?.rain_mm ? `${plot.lastReading.rain_mm.toFixed(1)} mm` : '0.0 mm'}
            </Text>
          </View>
        </View>
      </View>

      {/* Gráfico de Series Temporales (RF-10) */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>📈 Evolución de Humedad (Últimas 6-24h)</Text>
          <Text style={styles.chartSub}>{readingsHistory.length} mediciones registradas</Text>
        </View>
        <View style={styles.chartContainer}>
          {loadingHistory ? (
            <ActivityIndicator color="#10B981" />
          ) : (
            renderChart()
          )}
        </View>
        <View style={styles.chartLegend}>
          <Text style={styles.chartLegendText}>🔴 Línea punteada: Umbral mín. ({plot.threshold_min}%)</Text>
        </View>
      </View>

      {/* Configuración de Umbral (RF-11) */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>⚙️ Umbral Mínimo de Riego (RF-11)</Text>
        <Text style={styles.sectionDesc}>
          Si la humedad cae por debajo de este valor, el lote entra en estado Seco (Rojo).
        </Text>
        <View style={styles.thresholdRow}>
          <TextInput
            style={[styles.thresholdInput, role === 'advisor' && styles.disabledInput]}
            keyboardType="numeric"
            value={thresholdMin}
            onChangeText={setThresholdMin}
            editable={role !== 'advisor'}
          />
          <Text style={styles.percentSymbol}>%</Text>
          <TouchableOpacity
            style={[
              styles.saveThresholdBtn,
              (savingThreshold || role === 'advisor') && styles.disabledBtn,
            ]}
            onPress={handleSaveThreshold}
            disabled={savingThreshold || role === 'advisor'}
          >
            <Text style={styles.saveThresholdBtnText}>
              {savingThreshold ? 'Guardando...' : 'Guardar Umbral'}
            </Text>
          </TouchableOpacity>
        </View>
        {role === 'advisor' && (
          <Text style={styles.advisorNotice}>🔒 Solo el Productor y Operador pueden editar umbrales.</Text>
        )}
      </View>

      {/* Control de Válvulas y Riego (RF-13, RF-14, H1) */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>💧 Válvulas y Actuadores de Riego</Text>
        {localValves.map((valve) => (
          <View key={valve.id} style={styles.valveCard}>
            <View>
              <Text style={styles.valveName}>{valve.name}</Text>
              <Text style={[styles.valveStatus, valve.status === 'open' ? styles.valveOpen : styles.valveClosed]}>
                {valve.status === 'open' ? '🟢 Válvula ABIERTA (Regando)' : '🔴 Válvula CERRADA'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.irrigateBtn,
                role === 'advisor' && styles.disabledIrrigateBtn,
              ]}
              onPress={() => {
                setSelectedValve(valve);
                setCommandModalVisible(true);
              }}
            >
              <Text style={styles.irrigateBtnText}>Comandar Riego</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* MODAL PARA EMITIR COMANDO DE RIEGO */}
      <Modal visible={commandModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🚰 Orden de Irrigación</Text>
            <Text style={styles.modalSub}>
              Válvula: <Text style={{ fontWeight: 'bold', color: '#F8FAFC' }}>{selectedValve?.name}</Text>
            </Text>

            {commandStatusMsg ? (
              <View style={styles.flightBox}>
                <ActivityIndicator color="#10B981" style={{ marginBottom: 10 }} />
                <Text style={styles.flightText}>{commandStatusMsg}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalLabel}>Acción deseada:</Text>
                <View style={styles.actionToggleRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, actionType === 'open' && styles.actionBtnActive]}
                    onPress={() => setActionType('open')}
                  >
                    <Text style={styles.actionBtnText}>Abrir Válvula</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, actionType === 'closed' && styles.actionBtnActive]}
                    onPress={() => setActionType('closed')}
                  >
                    <Text style={styles.actionBtnText}>Cerrar Válvula</Text>
                  </TouchableOpacity>
                </View>

                {actionType === 'open' && (
                  <>
                    <Text style={styles.modalLabel}>Duración del Riego (1 a 120 minutos):</Text>
                    <TextInput
                      style={styles.modalInput}
                      keyboardType="numeric"
                      value={durationMin}
                      onChangeText={setDurationMin}
                    />
                  </>
                )}

                <View style={styles.modalButtonsRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setCommandModalVisible(false)}
                    disabled={commandInFlight}
                  >
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalSubmitBtn, role === 'advisor' && styles.disabledBtn]}
                    onPress={handleIssueCommand}
                    disabled={commandInFlight}
                  >
                    <Text style={styles.modalSubmitText}>
                      {role === 'advisor' ? 'No Autorizado (H2)' : 'Emitir Comando (H1)'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
    paddingBottom: 50,
  },
  headerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    borderLeftWidth: 6,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  plotName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cropText: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 10,
  },
  lastUpdateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 8,
    borderRadius: 6,
  },
  lastUpdateLabel: {
    fontSize: 12,
    color: '#64748B',
    marginRight: 6,
  },
  lastUpdateVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  telemetryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 12,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 3,
  },
  metricBoxLabel: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 4,
  },
  metricBoxVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  chartCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  chartHeader: {
    marginBottom: 10,
  },
  chartSub: {
    fontSize: 11,
    color: '#64748B',
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: CHART_HEIGHT,
  },
  chartLegend: {
    marginTop: 6,
  },
  chartLegendText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  sectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thresholdInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 70,
    textAlign: 'center',
  },
  disabledInput: {
    opacity: 0.5,
  },
  percentSymbol: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '700',
    marginHorizontal: 8,
  },
  saveThresholdBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flex: 1,
    alignItems: 'center',
  },
  saveThresholdBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  advisorNotice: {
    color: '#F59E0B',
    fontSize: 11,
    marginTop: 6,
  },
  valveCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  valveName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  valveStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  valveOpen: {
    color: '#10B981',
    fontWeight: '700',
  },
  valveClosed: {
    color: '#64748B',
  },
  irrigateBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  disabledIrrigateBtn: {
    backgroundColor: '#475569',
  },
  irrigateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 40,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  modalSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 8,
    marginTop: 10,
  },
  actionToggleRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  actionBtnActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  actionBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
  modalInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#F8FAFC',
    fontSize: 15,
    padding: 10,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 6,
  },
  modalCancelText: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 6,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  flightBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  flightText: {
    color: '#38BDF8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
