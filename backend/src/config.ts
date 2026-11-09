import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Supabase
  supabaseUrl: process.env.SUPABASE_URL || 'http://localhost:54321',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Kafka / Redpanda
  kafkaBrokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  kafkaClientId: process.env.KAFKA_CLIENT_ID || 'agropulse-backend',

  // Topics
  topics: {
    soilMoisture: 'soil.moisture',
    weatherTick: 'weather.tick',
    soilSatellite: 'soil.satellite',
    irrigationCommands: 'irrigation.commands',
    valveStatus: 'valve.status',
  },

  // AgroMonitoring API
  agroMonitoring: {
    apiKey: process.env.AGROMONITORING_API_KEY || 'c440688126308b448a5d29f39ec5be71',
    // Concordia coords
    defaultLat: -31.39296,
    defaultLon: -58.02089,
  },

  // Seed Station IDs
  stations: {
    costa1: 'c0000000-0000-0000-0000-000000000001',
    costa2: 'c0000000-0000-0000-0000-000000000002',
    monteA: 'c0000000-0000-0000-0000-000000000003',
  },

  // Tick interval in ms (3 to 8 seconds as per PRD §10)
  tickIntervalMs: parseInt(process.env.TICK_INTERVAL_MS || '4000', 10),
};
