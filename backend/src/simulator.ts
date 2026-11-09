import { Kafka, Partitioners } from 'kafkajs';
import { config } from './config';
import { AgroMonitoringClient } from './agromonitoring';

const kafka = new Kafka({
  clientId: 'agropulse-simulator',
  brokers: config.kafkaBrokers,
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});
const agroClient = new AgroMonitoringClient();

// Estado de simulación para cada lote
let costa1Moisture = 35.0; // Óptimo (25-45)
let costa2Moisture = 17.5; // Seco (< 25) para caso H1
let monteAMoisture = 28.0;

// Variables de clima base de AgroMonitoring (calibradas automáticamente)
let externalTempCelsius = 22.0;
let externalRainMm = 0.0;

async function syncAgroMonitoring() {
  console.log('[AgroMonitoring] Consultando telemetría satelital y climática para Concordia...');
  const [soil, weather] = await Promise.all([
    agroClient.getSoilData(),
    agroClient.getWeatherData(),
  ]);

  if (weather && weather.main) {
    externalTempCelsius = Number((weather.main.temp - 273.15).toFixed(1));
    externalRainMm = weather.rain?.['1h'] || 0.0;
    console.log(`[AgroMonitoring] Clima real Concordia: ${externalTempCelsius}°C, Lluvia: ${externalRainMm}mm`);
  }

  if (soil) {
    const soilTempCelsius = Number((soil.t10 - 273.15).toFixed(1));
    const satellitePayload = {
      station_id: config.stations.costa1,
      raw_moisture_m3_m3: soil.moisture,
      soil_temp_c: soilTempCelsius,
      source: 'AgroMonitoring Satellite',
      ts: new Date().toISOString(),
    };

    await producer.send({
      topic: config.topics.soilSatellite,
      messages: [{ value: JSON.stringify(satellitePayload) }],
    });
    console.log(`[PRODUCED] topic=${config.topics.soilSatellite} payload=${JSON.stringify(satellitePayload)}`);
  }
}

async function runSimulator() {
  console.log('🌾 Iniciando AgroPulse IoT Simulator...');
  await producer.connect();
  console.log('✅ Conectado al broker Redpanda.');

  // Primera sincronización con AgroMonitoring
  try {
    await syncAgroMonitoring();
  } catch (err) {
    console.warn('[AgroMonitoring] Sincronización inicial falló, usando valores simulados.');
  }

  // Cron cada 15 min para actualizar AgroMonitoring satelital
  setInterval(async () => {
    try {
      await syncAgroMonitoring();
    } catch (e) {
      console.error('[AgroMonitoring] Error en ciclo periódico:', e);
    }
  }, 15 * 60 * 1000);

  // Ciclo principal de ticks IoT de alta frecuencia (3-8 seg según PRD §10)
  setInterval(async () => {
    const now = new Date().toISOString();

    // 1. Variación sutil con ruido gaussiano
    costa1Moisture = Math.max(28, Math.min(42, costa1Moisture + (Math.random() - 0.5) * 0.4));
    costa2Moisture = Math.max(14, Math.min(22, costa2Moisture + (Math.random() - 0.5) * 0.3));

    // Payloads para Costa 1 (Óptimo - Verde)
    const costa1SoilPayload = {
      station_id: config.stations.costa1,
      moisture_pct: Number(costa1Moisture.toFixed(1)),
      temp_c: Number((externalTempCelsius + (Math.random() - 0.5) * 0.8).toFixed(1)),
      ts: now,
    };

    // Payloads para Costa 2 (Seco - Rojo para activar H1)
    const costa2SoilPayload = {
      station_id: config.stations.costa2,
      moisture_pct: Number(costa2Moisture.toFixed(1)),
      temp_c: Number((externalTempCelsius + 1.2 + (Math.random() - 0.5) * 0.8).toFixed(1)),
      ts: now,
    };

    const weatherPayload = {
      station_id: config.stations.costa1,
      rain_mm: externalRainMm,
      ts: now,
    };

    try {
      // Enviar soil.moisture
      await producer.send({
        topic: config.topics.soilMoisture,
        messages: [
          { key: config.stations.costa1, value: JSON.stringify(costa1SoilPayload) },
          { key: config.stations.costa2, value: JSON.stringify(costa2SoilPayload) },
        ],
      });

      // Enviar weather.tick
      await producer.send({
        topic: config.topics.weatherTick,
        messages: [
          { key: config.stations.costa1, value: JSON.stringify(weatherPayload) },
        ],
      });

      console.log(`[PRODUCED] topic=${config.topics.soilMoisture} Costa 1: ${costa1SoilPayload.moisture_pct}% | Costa 2: ${costa2SoilPayload.moisture_pct}% [${now}]`);
      
      // Monte A permanece en silencio para demostrar el estado STALE (Gris - H4)
      if (process.env.SIMULATE_MONTE_A === 'true') {
        const monteAPayload = {
          station_id: config.stations.monteA,
          moisture_pct: Number(monteAMoisture.toFixed(1)),
          temp_c: externalTempCelsius,
          ts: now,
        };
        await producer.send({
          topic: config.topics.soilMoisture,
          messages: [{ key: config.stations.monteA, value: JSON.stringify(monteAPayload) }],
        });
      }
    } catch (err) {
      console.error('[Simulator] Error enviando mensajes a Redpanda:', err);
    }
  }, config.tickIntervalMs);
}

runSimulator().catch((err) => {
  console.error('[Simulator] Fatal error:', err);
  process.exit(1);
});
