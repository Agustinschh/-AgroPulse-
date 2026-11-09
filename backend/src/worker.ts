import { Kafka } from 'kafkajs';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const kafka = new Kafka({
  clientId: 'agropulse-worker',
  brokers: config.kafkaBrokers,
});

const consumer = kafka.consumer({ groupId: 'agropulse-worker-group' });

async function processSoilMoisture(messageValue: string) {
  try {
    const payload = JSON.parse(messageValue);
    const { station_id, moisture_pct, temp_c, ts } = payload;

    if (!station_id || moisture_pct === undefined) {
      console.warn('[Worker] Payload soil.moisture inválido:', messageValue);
      return;
    }

    const { error } = await supabase.from('readings').insert({
      station_id,
      moisture_pct,
      temp_c,
      measured_at: ts || new Date().toISOString(),
      source: 'sensor',
    });

    if (error) {
      console.error(`[Worker] Error insertando reading en Supabase para estación ${station_id}:`, error.message);
    } else {
      console.log(`[CONSUMED / UPSERT READING] Estación ${station_id} -> Humedad: ${moisture_pct}%, Temp: ${temp_c}°C`);
    }
  } catch (err) {
    console.error('[Worker] Error procesando mensaje soil.moisture:', err);
  }
}

async function processWeatherTick(messageValue: string) {
  try {
    const payload = JSON.parse(messageValue);
    const { station_id, rain_mm } = payload;
    if (station_id && rain_mm !== undefined) {
      console.log(`[CONSUMED / WEATHER] Estación ${station_id} -> Lluvia: ${rain_mm}mm`);
    }
  } catch (err) {
    console.error('[Worker] Error procesando weather.tick:', err);
  }
}

// Escucha y ejecución de comandos de irrigación (simulador de hardware en ≤ 5 s)
async function startCommandWorker() {
  console.log('💧 Iniciando Irrigation Command Executor...');

  setInterval(async () => {
    try {
      // Buscar comandos en estado 'pending'
      const { data: pendingCommands, error } = await supabase
        .from('irrigation_commands')
        .select('id, valve_id, action, duration_min, status, client_request_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5);

      if (error) {
        console.error('[Command Worker] Error consultando pending commands:', error.message);
        return;
      }

      if (pendingCommands && pendingCommands.length > 0) {
        for (const cmd of pendingCommands) {
          console.log(`[COMMAND DETECTED] Procesando comando ${cmd.id} para válvula ${cmd.valve_id} (Acción: ${cmd.action})...`);
          
          // Simulación de retraso de actuador de campo (1 a 3 segundos)
          await new Promise((res) => setTimeout(res, 2000));

          // Actualizar estado de la válvula en Supabase
          const targetStatus = cmd.action === 'open' ? 'open' : 'closed';
          const { error: valveError } = await supabase
            .from('valves')
            .update({ status: targetStatus, updated_at: new Date().toISOString() })
            .eq('id', cmd.valve_id);

          if (valveError) {
            console.error(`[Command Worker] Error actualizando válvula ${cmd.valve_id}:`, valveError.message);
            await supabase
              .from('irrigation_commands')
              .update({ status: 'failed', error_reason: valveError.message })
              .eq('id', cmd.id);
            continue;
          }

          // Marcar comando como 'applied'
          const { error: cmdError } = await supabase
            .from('irrigation_commands')
            .update({
              status: 'applied',
              applied_at: new Date().toISOString(),
            })
            .eq('id', cmd.id);

          if (cmdError) {
            console.error(`[Command Worker] Error actualizando comando ${cmd.id}:`, cmdError.message);
          } else {
            console.log(`[COMMAND APPLIED] Válvula ${cmd.valve_id} -> Estado: ${targetStatus}. Comando ${cmd.id} completado.`);
          }
        }
      }
    } catch (e) {
      console.error('[Command Worker] Excepción en ciclo de comandos:', e);
    }
  }, 2000);
}

// Limpieza de retención académica (§9: recortar lecturas > 48h)
async function startRetentionCleaner() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('readings')
        .delete()
        .lt('measured_at', cutoff);

      if (!error) {
        console.log(`[RETENTION] Purga de lecturas anteriores a 48h ejecutada.`);
      }
    } catch (e) {
      console.error('[RETENTION] Error en purga:', e);
    }
  }, 6 * 60 * 60 * 1000);
}

async function runWorker() {
  console.log('⚙️ Iniciando AgroPulse Telemetry Worker...');
  await consumer.connect();
  console.log('✅ Consumer conectado al broker Redpanda.');

  await consumer.subscribe({
    topics: [
      config.topics.soilMoisture,
      config.topics.weatherTick,
      config.topics.soilSatellite,
    ],
    fromBeginning: false,
  });

  startCommandWorker();
  startRetentionCleaner();

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;
      const valStr = message.value.toString();

      if (topic === config.topics.soilMoisture) {
        await processSoilMoisture(valStr);
      } else if (topic === config.topics.weatherTick) {
        await processWeatherTick(valStr);
      } else if (topic === config.topics.soilSatellite) {
        console.log(`[CONSUMED / SATELLITE] Datos satelitales AgroMonitoring recibidos: ${valStr}`);
      }
    },
  });
}

runWorker().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
