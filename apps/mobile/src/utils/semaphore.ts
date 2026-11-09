import { PlotStatus, Reading } from '../types/database';

export interface SemaphoreResult {
  status: PlotStatus;
  color: string;
  label: string;
  description: string;
  iconName: 'alert-triangle' | 'check-circle' | 'droplet' | 'clock';
}

/**
 * Calcula el estado del lote según las reglas de negocio de la sección §08 del PRD.
 */
export function calculatePlotStatus(
  lastReading?: Reading | null,
  thresholdMin: number = 25.0,
  thresholdMax: number = 45.0
): SemaphoreResult {
  if (!lastReading || !lastReading.measured_at) {
    return {
      status: 'stale',
      color: '#94A3B8', // Gris
      label: 'Sin datos',
      description: 'No hay mediciones registradas',
      iconName: 'clock',
    };
  }

  const measuredTime = new Date(lastReading.measured_at).getTime();
  const now = Date.now();
  const ageSeconds = Math.max(0, Math.floor((now - measuredTime) / 1000));

  // 1. Condición Stale: mayor a 15 minutos (900 seg)
  if (ageSeconds > 15 * 60) {
    return {
      status: 'stale',
      color: '#94A3B8', // Gris
      label: 'Sensor desactualizado (Stale)',
      description: `Última lectura hace ${formatRelativeTime(ageSeconds)}`,
      iconName: 'clock',
    };
  }

  const moisture = lastReading.moisture_pct;

  // 2. Condición Dry: moisture_pct < threshold_min
  if (moisture < thresholdMin) {
    return {
      status: 'dry',
      color: '#EF4444', // Rojo
      label: 'Seco (Bajo Umbral)',
      description: `Humedad (${moisture.toFixed(1)}%) inferior al mínimo (${thresholdMin}%)`,
      iconName: 'alert-triangle',
    };
  }

  // 3. Condición Optimal: threshold_min <= moisture_pct <= threshold_max
  if (moisture >= thresholdMin && moisture <= thresholdMax) {
    return {
      status: 'optimal',
      color: '#10B981', // Verde
      label: 'Óptimo',
      description: `Humedad (${moisture.toFixed(1)}%) en rango adecuado`,
      iconName: 'check-circle',
    };
  }

  // 4. Condición Wet: moisture_pct > threshold_max
  return {
    status: 'wet',
    color: '#3B82F6', // Azul
    label: 'Húmedo / Saturado',
    description: `Humedad (${moisture.toFixed(1)}%) superior al máximo (${thresholdMax}%)`,
    iconName: 'droplet',
  };
}

export function formatRelativeTime(seconds: number): string {
  if (seconds < 60) return `hace ${seconds} s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
