export type UserRole = 'producer' | 'operator' | 'advisor';
export type PlotStatus = 'dry' | 'optimal' | 'wet' | 'stale';
export type ValveStatus = 'open' | 'closed';
export type CommandStatus = 'pending' | 'applied' | 'failed' | 'cancelled';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface Organization {
  id: string;
  name: string;
  region: string;
}

export interface Membership {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
  organizations?: Organization;
}

export interface Plot {
  id: string;
  organization_id: string;
  name: string;
  crop?: string;
  coordinates: Coordinate[];
  threshold_min: number;
  threshold_max: number;
}

export interface Station {
  id: string;
  plot_id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Reading {
  id: string;
  station_id: string;
  measured_at: string;
  moisture_pct: number;
  temp_c?: number;
  rain_mm?: number;
  source: 'sensor' | 'manual';
  client_request_id?: string;
}

export interface Valve {
  id: string;
  plot_id: string;
  name: string;
  status: ValveStatus;
  updated_at?: string;
}

export interface IrrigationCommand {
  id: string;
  valve_id: string;
  requested_by?: string;
  action: 'open' | 'closed';
  duration_min: number;
  status: CommandStatus;
  client_request_id: string;
  error_reason?: string;
  created_at: string;
  applied_at?: string;
}

export interface Alert {
  id: string;
  plot_id: string;
  type: 'dry' | 'stale' | 'custom';
  payload?: any;
  created_at: string;
  read_at?: string;
}

export interface PlotWithTelemetry extends Plot {
  status: PlotStatus;
  statusColor: string;
  statusLabel: string;
  lastReading?: Reading;
  ageSeconds?: number;
  valves: Valve[];
  stations: Station[];
}
