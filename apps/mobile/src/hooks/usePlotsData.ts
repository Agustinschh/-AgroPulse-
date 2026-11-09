import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { PlotWithTelemetry, Reading, Valve } from '../types/database';
import { calculatePlotStatus } from '../utils/semaphore';
import { useAuth } from '../context/AuthContext';

// Datos estáticos de respaldo idénticos a seed.sql para modo offline/demo inmediata
const SEED_PLOTS_FALLBACK: PlotWithTelemetry[] = [
  {
    id: 'b0000000-0000-0000-0000-000000000001',
    organization_id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Costa 1',
    crop: 'Citrus (Naranja Valencia)',
    coordinates: [
      { latitude: -31.3850, longitude: -58.0250 },
      { latitude: -31.3850, longitude: -58.0180 },
      { latitude: -31.3910, longitude: -58.0180 },
      { latitude: -31.3910, longitude: -58.0250 },
    ],
    threshold_min: 25.0,
    threshold_max: 45.0,
    status: 'optimal',
    statusColor: '#10B981',
    statusLabel: 'Óptimo',
    lastReading: {
      id: 'r1',
      station_id: 'c0000000-0000-0000-0000-000000000001',
      measured_at: new Date().toISOString(),
      moisture_pct: 34.5,
      temp_c: 22.8,
      rain_mm: 0.0,
      source: 'sensor',
    },
    stations: [{ id: 'c0000000-0000-0000-0000-000000000001', plot_id: 'b0000000-0000-0000-0000-000000000001', name: 'Estación Costa 1', lat: -31.3880, lng: -58.0215 }],
    valves: [{ id: 'd0000000-0000-0000-0000-000000000001', plot_id: 'b0000000-0000-0000-0000-000000000001', name: 'Válvula Goteo Sector A', status: 'closed' }],
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    organization_id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Costa 2',
    crop: 'Citrus (Mandarina Clemenules)',
    coordinates: [
      { latitude: -31.3920, longitude: -58.0250 },
      { latitude: -31.3920, longitude: -58.0180 },
      { latitude: -31.3980, longitude: -58.0180 },
      { latitude: -31.3980, longitude: -58.0250 },
    ],
    threshold_min: 25.0,
    threshold_max: 45.0,
    status: 'dry',
    statusColor: '#EF4444',
    statusLabel: 'Seco (Bajo Umbral)',
    lastReading: {
      id: 'r2',
      station_id: 'c0000000-0000-0000-0000-000000000002',
      measured_at: new Date().toISOString(),
      moisture_pct: 17.8,
      temp_c: 24.5,
      rain_mm: 0.0,
      source: 'sensor',
    },
    stations: [{ id: 'c0000000-0000-0000-0000-000000000002', plot_id: 'b0000000-0000-0000-0000-000000000002', name: 'Estación Costa 2', lat: -31.3950, lng: -58.0215 }],
    valves: [{ id: 'd0000000-0000-0000-0000-000000000002', plot_id: 'b0000000-0000-0000-0000-000000000002', name: 'Válvula Principal Costa 2', status: 'closed' }],
  },
  {
    id: 'b0000000-0000-0000-0000-000000000003',
    organization_id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Monte A',
    crop: 'Soja de primera',
    coordinates: [
      { latitude: -31.3850, longitude: -58.0340 },
      { latitude: -31.3850, longitude: -58.0270 },
      { latitude: -31.3950, longitude: -58.0270 },
      { latitude: -31.3950, longitude: -58.0340 },
    ],
    threshold_min: 25.0,
    threshold_max: 45.0,
    status: 'stale',
    statusColor: '#94A3B8',
    statusLabel: 'Sensor desactualizado (Stale)',
    lastReading: {
      id: 'r3',
      station_id: 'c0000000-0000-0000-0000-000000000003',
      measured_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      moisture_pct: 28.0,
      temp_c: 21.0,
      rain_mm: 0.0,
      source: 'sensor',
    },
    stations: [{ id: 'c0000000-0000-0000-0000-000000000003', plot_id: 'b0000000-0000-0000-0000-000000000003', name: 'Estación Monte A', lat: -31.3900, lng: -58.0305 }],
    valves: [{ id: 'd0000000-0000-0000-0000-000000000003', plot_id: 'b0000000-0000-0000-0000-000000000003', name: 'Válvula Aspersión Monte A', status: 'closed' }],
  },
];

// Estado compartido en memoria entre todas las pantallas (Mapa, Lista de Lotes, Detalle, Alertas, Diagnóstico)
let sharedPlots: PlotWithTelemetry[] = SEED_PLOTS_FALLBACK;
let sharedLastTickReceived: Date | null = new Date();
let sharedDiagnosticLagMs = 0;
let realtimeSubscribed = false;
let initialFetchDone = false;

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function setSharedPlots(updater: PlotWithTelemetry[] | ((prev: PlotWithTelemetry[]) => PlotWithTelemetry[])) {
  sharedPlots = typeof updater === 'function' ? updater(sharedPlots) : updater;
  notifyListeners();
}

function ensureRealtimeSubscription() {
  if (realtimeSubscribed) return;
  realtimeSubscribed = true;

  try {
    supabase
      .channel('realtime_telemetry_shared')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'readings' },
        (payload) => {
          const newReading = payload.new as Reading;
          const now = new Date();
          sharedLastTickReceived = now;
          if (newReading.measured_at) {
            sharedDiagnosticLagMs = now.getTime() - new Date(newReading.measured_at).getTime();
          }

          setSharedPlots((prev) =>
            prev.map((plot) => {
              const station = plot.stations.find((s) => s.id === newReading.station_id);
              if (!station) return plot;

              const sem = calculatePlotStatus(newReading, plot.threshold_min, plot.threshold_max);
              return {
                ...plot,
                lastReading: newReading,
                status: sem.status,
                statusColor: sem.color,
                statusLabel: sem.label,
              };
            })
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'valves' },
        (payload) => {
          const updatedValve = payload.new as Valve;
          setSharedPlots((prev) =>
            prev.map((plot) => ({
              ...plot,
              valves: plot.valves.map((v) => (v.id === updatedValve.id ? updatedValve : v)),
            }))
          );
        }
      )
      .subscribe();
  } catch (e) {
    console.warn('No se pudo iniciar canal realtime:', e);
  }
}

export function usePlotsData() {
  const { activeOrg } = useAuth();
  const [, forceRender] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onChange = () => forceRender((n) => n + 1);
    listeners.add(onChange);
    ensureRealtimeSubscription();
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const updateValveStatus = useCallback((valveId: string, status: 'open' | 'closed') => {
    setSharedPlots((prev) =>
      prev.map((plot) => ({
        ...plot,
        valves: plot.valves.map((v) => (v.id === valveId ? { ...v, status } : v)),
      }))
    );
  }, []);

  const updatePlotThreshold = useCallback((plotId: string, thresholdMin: number) => {
    setSharedPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) return plot;
        const sem = calculatePlotStatus(plot.lastReading, thresholdMin, plot.threshold_max);
        return {
          ...plot,
          threshold_min: thresholdMin,
          status: sem.status,
          statusColor: sem.color,
          statusLabel: sem.label,
        };
      })
    );
  }, []);

  const fetchPlots = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Obtener Lotes
      const { data: dbPlots, error: plotErr } = await supabase
        .from('plots')
        .select('*')
        .eq('organization_id', activeOrg?.id || 'a0000000-0000-0000-0000-000000000001');

      if (plotErr || !dbPlots || dbPlots.length === 0) {
        notifyListeners();
        return;
      }

      // 2. Obtener Estaciones y Válvulas
      const plotIds = dbPlots.map((p) => p.id);
      const [{ data: dbStations }, { data: dbValves }] = await Promise.all([
        supabase.from('stations').select('*').in('plot_id', plotIds),
        supabase.from('valves').select('*').in('plot_id', plotIds),
      ]);

      const stationIds = (dbStations || []).map((s) => s.id);
      let latestReadingsMap: Record<string, Reading> = {};

      if (stationIds.length > 0) {
        const { data: readings } = await supabase
          .from('readings')
          .select('*')
          .in('station_id', stationIds)
          .order('measured_at', { ascending: false });

        if (readings) {
          for (const r of readings) {
            if (!latestReadingsMap[r.station_id]) {
              latestReadingsMap[r.station_id] = r;
            }
          }
        }
      }

      const formatted: PlotWithTelemetry[] = dbPlots.map((p) => {
        const plotStations = (dbStations || []).filter((s) => s.plot_id === p.id);
        const plotValves = (dbValves || []).filter((v) => v.plot_id === p.id);
        const mainStation = plotStations[0];
        const lastReading = mainStation ? latestReadingsMap[mainStation.id] : undefined;
        const sem = calculatePlotStatus(lastReading, p.threshold_min, p.threshold_max);

        return {
          ...p,
          coordinates: typeof p.coordinates === 'string' ? JSON.parse(p.coordinates) : p.coordinates,
          status: sem.status,
          statusColor: sem.color,
          statusLabel: sem.label,
          lastReading,
          stations: plotStations,
          valves: plotValves,
        };
      });

      setSharedPlots(formatted);
    } catch (e) {
      console.warn('Usando fallback seed data en usePlotsData:', e);
      notifyListeners();
    } finally {
      setLoading(false);
    }
  }, [activeOrg]);

  useEffect(() => {
    if (!initialFetchDone) {
      initialFetchDone = true;
      fetchPlots();
    }
  }, [fetchPlots]);

  return {
    plots: sharedPlots,
    loading,
    refreshPlots: fetchPlots,
    updateValveStatus,
    updatePlotThreshold,
    lastTickReceived: sharedLastTickReceived,
    diagnosticLagMs: sharedDiagnosticLagMs,
  };
}
