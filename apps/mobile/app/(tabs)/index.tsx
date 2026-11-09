import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Polygon as MapPolygon, Marker } from 'react-native-maps';
import { Svg, Polygon as SvgPolygon, Circle, Line, Text as SvgText, Rect, G } from 'react-native-svg';
import { usePlotsData } from '../../src/hooks/usePlotsData';
import { isPointInPolygon } from '../../src/utils/geo';
import { useAuth } from '../../src/context/AuthContext';
import { PlotWithTelemetry } from '../../src/types/database';

const { width } = Dimensions.get('window');
const MAP_SVG_WIDTH = width - 32;
const MAP_SVG_HEIGHT = 250;

// Límites geográficos del predio en Concordia, Entre Ríos para proyectar los polígonos reales
const BOUNDS = {
  minLat: -31.4000,
  maxLat: -31.3830,
  minLng: -58.0365,
  maxLng: -58.0155,
};

function projectToSvg(lat: number, lng: number) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * MAP_SVG_WIDTH;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * MAP_SVG_HEIGHT;
  return { x, y };
}

export default function MapScreen() {
  const router = useRouter();
  const { activeOrg } = useAuth();
  const { plots, loading, refreshPlots } = usePlotsData();
  const [mapMode, setMapMode] = useState<'cadastre' | 'gmaps'>('cadastre');
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [userLocationBanner, setUserLocationBanner] = useState<string | null>(null);

  // RF-06: "Estoy en el lote" con verificación GPS segura
  const checkCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setUserLocationBanner('⚠️ Permiso de ubicación denegado (Ubicación no disponible)');
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const currentPoint = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserCoords(currentPoint);

      // Comprobar si cae dentro de alguno de los lotes
      let foundPlotName: string | null = null;
      for (const plot of plots) {
        if (isPointInPolygon(currentPoint, plot.coordinates)) {
          foundPlotName = plot.name;
          break;
        }
      }

      if (foundPlotName) {
        setUserLocationBanner(`📍 Te encuentras dentro del lote: ${foundPlotName}`);
      } else {
        setUserLocationBanner(
          `📍 Ubicación actual: (${currentPoint.latitude.toFixed(4)}, ${currentPoint.longitude.toFixed(4)}) - Fuera de los lotes del predio.`
        );
      }
    } catch (error) {
      setUserLocationBanner('⚠️ Ubicación no disponible actualmente.');
    }
  };

  // Simular ubicación GPS dentro de un lote para demostración rápida en emulador
  const simulateGpsInPlot = (plot: PlotWithTelemetry) => {
    const station = plot.stations[0];
    const point = station
      ? { latitude: station.lat, longitude: station.lng }
      : {
          latitude: (plot.coordinates[0].latitude + plot.coordinates[2].latitude) / 2,
          longitude: (plot.coordinates[0].longitude + plot.coordinates[2].longitude) / 2,
        };
    setUserCoords(point);
    setUserLocationBanner(
      `📍 [GPS Simulado] Dentro del lote: ${plot.name} (${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)})`
    );
  };

  const renderCadastreMap = () => {
    const gridLines = [0.2, 0.4, 0.6, 0.8];
    const userProjected = userCoords ? projectToSvg(userCoords.latitude, userCoords.longitude) : null;

    return (
      <View style={styles.mapContainerCard}>
        <View style={styles.mapToolbar}>
          <Text style={styles.coordsHeaderText}>🌎 Concordia, E.R. (-31.39°S, -58.02°W)</Text>
          <View style={styles.modeSwitchRow}>
            <TouchableOpacity
              style={[styles.modeBtn, mapMode === 'cadastre' && styles.modeBtnActive]}
              onPress={() => setMapMode('cadastre')}
            >
              <Text style={styles.modeBtnText}>📐 Plano Lotes</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={[styles.modeBtn, mapMode === 'gmaps' && styles.modeBtnActive]}
                onPress={() => setMapMode('gmaps')}
              >
                <Text style={styles.modeBtnText}>🛰️ Mapa GPS</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Svg width={MAP_SVG_WIDTH} height={MAP_SVG_HEIGHT} style={styles.svgCanvas}>
          {/* Fondo del terreno */}
          <Rect x="0" y="0" width={MAP_SVG_WIDTH} height={MAP_SVG_HEIGHT} fill="#0F172A" rx="12" />

          {/* Grilla catastral de coordenadas */}
          {gridLines.map((g, i) => (
            <React.Fragment key={i}>
              <Line
                x1={MAP_SVG_WIDTH * g}
                y1={0}
                x2={MAP_SVG_WIDTH * g}
                y2={MAP_SVG_HEIGHT}
                stroke="#1E293B"
                strokeDasharray="4, 4"
                strokeWidth="1"
              />
              <Line
                x1={0}
                y1={MAP_SVG_HEIGHT * g}
                x2={MAP_SVG_WIDTH}
                y2={MAP_SVG_HEIGHT * g}
                stroke="#1E293B"
                strokeDasharray="4, 4"
                strokeWidth="1"
              />
            </React.Fragment>
          ))}

          {/* Indicador Norte */}
          <G>
            <Circle cx={MAP_SVG_WIDTH - 24} cy={24} r={14} fill="#1E293B" stroke="#334155" strokeWidth="1" />
            <SvgText
              x={MAP_SVG_WIDTH - 24}
              y={28}
              fill="#38BDF8"
              fontSize="11"
              fontWeight="bold"
              textAnchor="middle"
            >
              N▲
            </SvgText>
          </G>

          {/* Polígonos georreferenciados de cada lote */}
          {plots.map((plot) => {
            const svgPoints = plot.coordinates
              .map((c) => {
                const { x, y } = projectToSvg(c.latitude, c.longitude);
                return `${x},${y}`;
              })
              .join(' ');

            // Calcular centroide del lote para etiquetas
            const avgLat =
              plot.coordinates.reduce((acc, c) => acc + c.latitude, 0) / plot.coordinates.length;
            const avgLng =
              plot.coordinates.reduce((acc, c) => acc + c.longitude, 0) / plot.coordinates.length;
            const center = projectToSvg(avgLat, avgLng);
            const isOpen = plot.valves.some((v) => v.status === 'open');

            return (
              <G key={plot.id} onPress={() => router.push(`/plot/${plot.id}`)}>
                <SvgPolygon
                  points={svgPoints}
                  fill={plot.statusColor + '35'}
                  stroke={plot.statusColor}
                  strokeWidth="2.5"
                />
                {/* Punto de estación IoT */}
                <Circle
                  cx={center.x}
                  cy={center.y - 16}
                  r="4"
                  fill={plot.statusColor}
                  stroke="#0F172A"
                  strokeWidth="1.5"
                />
                {/* Nombre del lote */}
                <SvgText
                  x={center.x}
                  y={center.y}
                  fill="#F8FAFC"
                  fontSize="13"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {plot.name}
                </SvgText>
                {/* Humedad actual */}
                <SvgText
                  x={center.x}
                  y={center.y + 15}
                  fill={plot.statusColor}
                  fontSize="12"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {plot.lastReading ? `${plot.lastReading.moisture_pct.toFixed(1)}%` : '--'}
                </SvgText>
                {/* Estado de válvula */}
                <SvgText
                  x={center.x}
                  y={center.y + 30}
                  fill={isOpen ? '#38BDF8' : '#94A3B8'}
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {isOpen ? '💧 Riego ON' : '🔒 Cerrada'}
                </SvgText>
              </G>
            );
          })}

          {/* Pin de ubicación del usuario si cae en el mapa */}
          {userProjected &&
            userProjected.x >= 0 &&
            userProjected.x <= MAP_SVG_WIDTH &&
            userProjected.y >= 0 &&
            userProjected.y <= MAP_SVG_HEIGHT && (
              <G>
                <Circle
                  cx={userProjected.x}
                  cy={userProjected.y}
                  r="9"
                  fill="rgba(56, 189, 248, 0.35)"
                />
                <Circle
                  cx={userProjected.x}
                  cy={userProjected.y}
                  r="5"
                  fill="#38BDF8"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
              </G>
            )}
        </Svg>

        {/* Botones rápidos para simular posición GPS dentro de un lote */}
        <View style={styles.simGpsBar}>
          <Text style={styles.simGpsLabel}>Simular GPS en:</Text>
          {plots.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.simGpsChip}
              onPress={() => simulateGpsInPlot(p)}
            >
              <Text style={styles.simGpsChipText}>📍 {p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderGoogleMap = () => (
    <View style={styles.mapContainerCard}>
      <View style={styles.mapToolbar}>
        <Text style={styles.coordsHeaderText}>🌎 Vista Satelital / Mapa GPS</Text>
        <View style={styles.modeSwitchRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mapMode === 'cadastre' && styles.modeBtnActive]}
            onPress={() => setMapMode('cadastre')}
          >
            <Text style={styles.modeBtnText}>📐 Plano Lotes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mapMode === 'gmaps' && styles.modeBtnActive]}
            onPress={() => setMapMode('gmaps')}
          >
            <Text style={styles.modeBtnText}>🛰️ Mapa GPS</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.gmapsWrapper}>
        <MapView
          style={styles.gmapsView}
          initialRegion={{
            latitude: -31.3915,
            longitude: -58.0260,
            latitudeDelta: 0.018,
            longitudeDelta: 0.022,
          }}
        >
          {plots.map((plot) => {
            const station = plot.stations[0];
            return (
              <React.Fragment key={plot.id}>
                <MapPolygon
                  coordinates={plot.coordinates}
                  fillColor={plot.statusColor + '55'}
                  strokeColor={plot.statusColor}
                  strokeWidth={3}
                  tappable
                  onPress={() => router.push(`/plot/${plot.id}`)}
                />
                {station && (
                  <Marker
                    coordinate={{ latitude: station.lat, longitude: station.lng }}
                    title={`${plot.name} (${plot.statusLabel})`}
                    description={`Humedad: ${plot.lastReading?.moisture_pct.toFixed(1) ?? '--'}% | Toca para abrir`}
                    pinColor={plot.statusColor}
                    onCalloutPress={() => router.push(`/plot/${plot.id}`)}
                  />
                )}
              </React.Fragment>
            );
          })}
        </MapView>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Banner de Establecimiento Activo */}
      <View style={styles.orgHeader}>
        <Text style={styles.orgTitle}>🏛️ {activeOrg?.name || 'Estancia Didáctica Concordia'}</Text>
        <Text style={styles.orgRegion}>{activeOrg?.region || 'Concordia, Entre Ríos'}</Text>
      </View>

      {/* Notificación de Geolocalización GPS */}
      {userLocationBanner && (
        <View style={styles.gpsBanner}>
          <Text style={styles.gpsBannerText}>{userLocationBanner}</Text>
          <TouchableOpacity onPress={() => setUserLocationBanner(null)}>
            <Text style={styles.gpsBannerClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Visualizador Geoespacial de Lotes / Grid interactivo */}
      <ScrollView contentContainerStyle={styles.mapCanvas} showsVerticalScrollIndicator={false}>
        <View style={styles.canvasHeader}>
          <Text style={styles.canvasTitle}>🛰️ Mapa de Parcelas y Estado Semáforo</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={refreshPlots}>
            <Text style={styles.refreshBtnText}>🔄 Actualizar</Text>
          </TouchableOpacity>
        </View>

        {/* Mapa Georreferenciado Interactivo (Plano Catastral SVG + Mapa GPS) */}
        {mapMode === 'cadastre' ? renderCadastreMap() : renderGoogleMap()}

        {/* Polígonos / Tarjetas Geoespaciales de Lotes */}
        {plots.map((plot) => (
          <TouchableOpacity
            key={plot.id}
            style={[
              styles.plotPolygonCard,
              { borderLeftColor: plot.statusColor, borderColor: plot.statusColor + '40' },
            ]}
            onPress={() => router.push(`/plot/${plot.id}`)}
          >
            <View style={styles.polygonHeader}>
              <View style={styles.polygonTitleRow}>
                <View style={[styles.statusDot, { backgroundColor: plot.statusColor }]} />
                <Text style={styles.plotName}>{plot.name}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: plot.statusColor + '20' }]}>
                <Text style={[styles.statusBadgeText, { color: plot.statusColor }]}>
                  {plot.statusLabel}
                </Text>
              </View>
            </View>

            <Text style={styles.plotCrop}>🌱 Cultivo: {plot.crop || 'Sin especificar'}</Text>

            <View style={styles.telemetryGrid}>
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Humedad Suelo</Text>
                <Text style={[styles.telemetryValue, { color: plot.statusColor }]}>
                  {plot.lastReading ? `${plot.lastReading.moisture_pct.toFixed(1)}%` : '--'}
                </Text>
              </View>

              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Temperatura</Text>
                <Text style={styles.telemetryValue}>
                  {plot.lastReading?.temp_c ? `${plot.lastReading.temp_c.toFixed(1)}°C` : '--'}
                </Text>
              </View>

              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Válvulas</Text>
                <Text style={styles.telemetryValue}>
                  {plot.valves.some((v) => v.status === 'open') ? '💧 Abierta' : '🔒 Cerrada'}
                </Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.openDetailsText}>Toca para ver detalle y válvulas →</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Leyenda de Accesibilidad (§10, RNF-09) */}
        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>🎨 Leyenda del Semáforo de Riego</Text>
          <View style={styles.legendGrid}>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.legendText}>🔴 Seco (&lt; 25%)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { backgroundColor: '#10B981' }]} />
              <Text style={styles.legendText}>🟢 Óptimo (25% - 45%)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { backgroundColor: '#3B82F6' }]} />
              <Text style={styles.legendText}>🔵 Húmedo (&gt; 45%)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendIndicator, { backgroundColor: '#94A3B8' }]} />
              <Text style={styles.legendText}>⚪ Stale (&gt; 15 min sin datos)</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* FAB: "¿Estoy en el lote?" (GPS RF-06) */}
      <TouchableOpacity style={styles.fabGps} onPress={checkCurrentLocation}>
        <Text style={styles.fabIcon}>📍</Text>
        <Text style={styles.fabText}>¿Estoy en el lote?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  orgHeader: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  orgTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  orgRegion: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E3A8A',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
  },
  gpsBannerText: {
    color: '#DBEAFE',
    fontSize: 13,
    flex: 1,
  },
  gpsBannerClose: {
    color: '#93C5FD',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  mapCanvas: {
    padding: 16,
    paddingBottom: 90,
  },
  canvasHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  canvasTitle: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '700',
  },
  refreshBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  refreshBtnText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  mapContainerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  mapToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  coordsHeaderText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  modeSwitchRow: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 2,
  },
  modeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modeBtnActive: {
    backgroundColor: '#10B981',
  },
  modeBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  svgCanvas: {
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
  },
  simGpsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  simGpsLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginRight: 6,
  },
  simGpsChip: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  simGpsChipText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  gmapsWrapper: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gmapsView: {
    width: '100%',
    height: '100%',
  },
  plotPolygonCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderLeftWidth: 6,
  },
  polygonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  polygonTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  plotName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  plotCrop: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 12,
  },
  telemetryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
  },
  telemetryItem: {
    alignItems: 'center',
    flex: 1,
  },
  telemetryLabel: {
    color: '#64748B',
    fontSize: 11,
    marginBottom: 4,
  },
  telemetryValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  cardFooter: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  openDetailsText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  legendCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  legendTitle: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 6,
  },
  legendIndicator: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginRight: 6,
  },
  legendText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  fabGps: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  fabIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
