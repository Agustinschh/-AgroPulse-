import { Coordinate } from '../types/database';

/**
 * Algoritmo Ray-casting para determinar si un punto GPS está dentro de un polígono.
 * Cumplimiento de RF-06 ("Estoy en el lote").
 */
export function isPointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const x = point.longitude;
  const y = point.latitude;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calcula el centro geométrico (centroide aproximado) de un polígono
 */
export function getPolygonCenter(polygon: Coordinate[]): Coordinate {
  if (!polygon || polygon.length === 0) {
    return { latitude: -31.39296, longitude: -58.02089 }; // Concordia fallback
  }

  const sumLat = polygon.reduce((acc, curr) => acc + curr.latitude, 0);
  const sumLng = polygon.reduce((acc, curr) => acc + curr.longitude, 0);

  return {
    latitude: sumLat / polygon.length,
    longitude: sumLng / polygon.length,
  };
}
