import { config } from './config';

export interface AgroSoilData {
  dt: number;
  t10: number; // temp a 10cm Kelvin
  moisture: number; // m3/m3
  t0: number; // temp superficial
}

export interface AgroWeatherData {
  dt: number;
  weather: Array<{ main: string; description: string }>;
  main: {
    temp: number; // Kelvin
    humidity: number;
    pressure: number;
  };
  wind: { speed: number };
  clouds: { all: number };
  rain?: { '1h'?: number; '3h'?: number };
}

export class AgroMonitoringClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.agroMonitoring.apiKey;
  }

  /**
   * Obtiene datos de suelo (humedad y temperatura profunda) para latitud/longitud
   */
  async getSoilData(lat = config.agroMonitoring.defaultLat, lon = config.agroMonitoring.defaultLon): Promise<AgroSoilData | null> {
    try {
      const url = `http://api.agromonitoring.com/agro/1.0/soil?lat=${lat}&lon=${lon}&appid=${this.apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[AgroMonitoring] Error fetching soil data: ${response.status} ${response.statusText}`);
        return null;
      }
      const data = (await response.json()) as AgroSoilData;
      return data;
    } catch (error) {
      console.error('[AgroMonitoring] Error de conexión al consultar suelo:', error);
      return null;
    }
  }

  /**
   * Obtiene datos de clima actual (temperatura superficial, lluvia, etc.)
   */
  async getWeatherData(lat = config.agroMonitoring.defaultLat, lon = config.agroMonitoring.defaultLon): Promise<AgroWeatherData | null> {
    try {
      const url = `http://api.agromonitoring.com/agro/1.0/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[AgroMonitoring] Error fetching weather data: ${response.status} ${response.statusText}`);
        return null;
      }
      const data = (await response.json()) as AgroWeatherData;
      return data;
    } catch (error) {
      console.error('[AgroMonitoring] Error de conexión al consultar clima:', error);
      return null;
    }
  }
}
