-- ==============================================================================
-- AGROPULSE - ESQUEMA DE BASE DE DATOS Y RLS (Supabase / PostgreSQL)
-- Cumplimiento de RF-01 a RF-24 y RNF-01 a RNF-10
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA: organizations
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABLA: memberships (Roles: producer, operator, advisor)
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('producer', 'operator', 'advisor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, organization_id)
);

-- 4. TABLA: plots (Lotes)
CREATE TABLE IF NOT EXISTS public.plots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    crop TEXT,
    coordinates JSONB NOT NULL, -- Polígono en formato GeoJSON / Array de {latitude, longitude}
    threshold_min NUMERIC NOT NULL DEFAULT 25.0,
    threshold_max NUMERIC NOT NULL DEFAULT 45.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TABLA: stations (Estaciones meteorológicas / sensores de lote)
CREATE TABLE IF NOT EXISTS public.stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. TABLA: readings (Lecturas de sensores y manuales)
CREATE TABLE IF NOT EXISTS public.readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    moisture_pct NUMERIC NOT NULL,
    temp_c NUMERIC,
    rain_mm NUMERIC DEFAULT 0.0,
    source TEXT NOT NULL DEFAULT 'sensor' CHECK (source IN ('sensor', 'manual')),
    client_request_id UUID UNIQUE, -- Para idempotencia en lecturas manuales offline
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice optimizado para lecturas históricas y última lectura (§9)
CREATE INDEX IF NOT EXISTS idx_readings_station_measured 
ON public.readings (station_id, measured_at DESC);

-- 7. TABLA: valves (Actuadores / válvulas de riego)
CREATE TABLE IF NOT EXISTS public.valves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. TABLA: irrigation_commands (Comandos de irrigación)
CREATE TABLE IF NOT EXISTS public.irrigation_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valve_id UUID NOT NULL REFERENCES public.valves(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('open', 'closed')),
    duration_min INTEGER DEFAULT 30 CHECK (duration_min BETWEEN 1 AND 120),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed', 'cancelled')),
    client_request_id UUID NOT NULL UNIQUE, -- Idempotencia garantizada
    error_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_irrigation_valve_status 
ON public.irrigation_commands (valve_id, status);

-- 9. TABLA: alerts
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('dry', 'stale', 'custom')),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
);

-- ==============================================================================
-- REGLAS DE NEGOCIO: TRIGGERS Y FUNCIONES
-- ==============================================================================

-- RF-16: No se permite un segundo comando pending sobre la misma válvula
CREATE OR REPLACE FUNCTION public.check_single_pending_command()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'pending' THEN
        IF EXISTS (
            SELECT 1 
            FROM public.irrigation_commands
            WHERE valve_id = NEW.valve_id 
              AND status = 'pending'
              AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN
            RAISE EXCEPTION 'Ya existe un comando pendiente para esta válvula (RF-16). Debe esperar a que finalice o sea cancelado.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_single_pending_command ON public.irrigation_commands;
CREATE TRIGGER trg_check_single_pending_command
BEFORE INSERT OR UPDATE ON public.irrigation_commands
FOR EACH ROW
EXECUTE FUNCTION public.check_single_pending_command();

-- ==============================================================================
-- VISTA DE ESTADO DEL LOTE (§8 Semáforo y Reglas de Negocio)
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_plot_status AS
WITH latest_readings AS (
    SELECT DISTINCT ON (s.plot_id)
        s.plot_id,
        s.id AS station_id,
        r.id AS reading_id,
        r.measured_at,
        r.moisture_pct,
        r.temp_c,
        r.rain_mm,
        r.source,
        EXTRACT(EPOCH FROM (now() - r.measured_at)) AS age_seconds
    FROM public.stations s
    LEFT JOIN public.readings r ON s.id = r.station_id
    ORDER BY s.plot_id, r.measured_at DESC NULLS LAST
)
SELECT 
    p.id AS plot_id,
    p.organization_id,
    p.name AS plot_name,
    p.crop,
    p.coordinates,
    p.threshold_min,
    p.threshold_max,
    lr.station_id,
    lr.reading_id,
    lr.measured_at AS last_measured_at,
    lr.age_seconds,
    lr.moisture_pct AS current_moisture,
    lr.temp_c AS current_temp,
    lr.rain_mm AS current_rain,
    CASE 
        -- 1. stale: sin lectura o now - measured_at > 15 min (900 seg)
        WHEN lr.measured_at IS NULL OR lr.age_seconds > 900 THEN 'stale'
        -- 2. dry: moisture_pct < threshold_min
        WHEN lr.moisture_pct < p.threshold_min THEN 'dry'
        -- 3. optimal: threshold_min <= moisture_pct <= threshold_max
        WHEN lr.moisture_pct >= p.threshold_min AND lr.moisture_pct <= p.threshold_max THEN 'optimal'
        -- 4. wet: moisture_pct > threshold_max
        WHEN lr.moisture_pct > p.threshold_max THEN 'wet'
        ELSE 'stale'
    END AS status,
    CASE 
        WHEN lr.measured_at IS NULL OR lr.age_seconds > 900 THEN '#9E9E9E' -- Gris
        WHEN lr.moisture_pct < p.threshold_min THEN '#E53935'              -- Rojo
        WHEN lr.moisture_pct >= p.threshold_min AND lr.moisture_pct <= p.threshold_max THEN '#43A047' -- Verde
        WHEN lr.moisture_pct > p.threshold_max THEN '#1E88E5'              -- Azul
        ELSE '#9E9E9E'
    END AS status_color
FROM public.plots p
LEFT JOIN latest_readings lr ON p.id = lr.plot_id;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) - SECCIÓN §05 y §09
-- ==============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irrigation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Helper: verificar si el usuario logueado pertenece a la organización
CREATE OR REPLACE FUNCTION public.is_member_of(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = auth.uid() 
          AND organization_id = org_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: obtener el rol del usuario en la organización
CREATE OR REPLACE FUNCTION public.get_member_role(org_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role 
    FROM public.memberships 
    WHERE user_id = auth.uid() 
      AND organization_id = org_id;
    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Organizations: SELECT si el usuario es miembro
CREATE POLICY "Users can view organizations they belong to"
ON public.organizations FOR SELECT
USING (public.is_member_of(id));

-- 2. Memberships: SELECT si el usuario pertenece a la misma organización
CREATE POLICY "Users can view members of their organization"
ON public.memberships FOR SELECT
USING (public.is_member_of(organization_id));

-- 3. Plots: SELECT para miembros; UPDATE (umbrales) solo producer y operator
CREATE POLICY "Members can view plots"
ON public.plots FOR SELECT
USING (public.is_member_of(organization_id));

CREATE POLICY "Producer and Operator can update plot thresholds"
ON public.plots FOR UPDATE
USING (
    public.is_member_of(organization_id) AND 
    public.get_member_role(organization_id) IN ('producer', 'operator')
);

-- 4. Stations: SELECT para miembros
CREATE POLICY "Members can view stations"
ON public.stations FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.plots p 
        WHERE p.id = stations.plot_id AND public.is_member_of(p.organization_id)
    )
);

-- 5. Readings: SELECT para miembros; INSERT manual para producer y operator
CREATE POLICY "Members can view readings"
ON public.readings FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.stations s
        JOIN public.plots p ON p.id = s.plot_id
        WHERE s.id = readings.station_id AND public.is_member_of(p.organization_id)
    )
);

CREATE POLICY "Producer and Operator can insert manual readings"
ON public.readings FOR INSERT
WITH CHECK (
    source = 'manual' AND
    EXISTS (
        SELECT 1 FROM public.stations s
        JOIN public.plots p ON p.id = s.plot_id
        WHERE s.id = readings.station_id 
          AND public.is_member_of(p.organization_id)
          AND public.get_member_role(p.organization_id) IN ('producer', 'operator')
    )
);

-- 6. Valves: SELECT para miembros; UPDATE para producer y operator
CREATE POLICY "Members can view valves"
ON public.valves FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.plots p 
        WHERE p.id = valves.plot_id AND public.is_member_of(p.organization_id)
    )
);

-- 7. Irrigation Commands: SELECT para miembros; INSERT/UPDATE solo producer y operator
CREATE POLICY "Members can view irrigation commands"
ON public.irrigation_commands FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.valves v
        JOIN public.plots p ON p.id = v.plot_id
        WHERE v.id = irrigation_commands.valve_id AND public.is_member_of(p.organization_id)
    )
);

CREATE POLICY "Producer and Operator can issue irrigation commands"
ON public.irrigation_commands FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.valves v
        JOIN public.plots p ON p.id = v.plot_id
        WHERE v.id = irrigation_commands.valve_id 
          AND public.is_member_of(p.organization_id)
          AND public.get_member_role(p.organization_id) IN ('producer', 'operator')
    )
);

CREATE POLICY "Producer and Operator can cancel pending commands"
ON public.irrigation_commands FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.valves v
        JOIN public.plots p ON p.id = v.plot_id
        WHERE v.id = irrigation_commands.valve_id 
          AND public.is_member_of(p.organization_id)
          AND public.get_member_role(p.organization_id) IN ('producer', 'operator')
    )
);

-- 8. Alerts: SELECT para miembros
CREATE POLICY "Members can view alerts"
ON public.alerts FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.plots p 
        WHERE p.id = alerts.plot_id AND public.is_member_of(p.organization_id)
    )
);

-- ==============================================================================
-- REALTIME SUBSCRIPTIONS (§09)
-- ==============================================================================
-- Habilitar publicación para tablas en tiempo real
DO $$
BEGIN
    BEGIN
        CREATE PUBLICATION supabase_realtime;
    EXCEPTION
        WHEN duplicate_object THEN
            NULL;
    END;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.readings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.valves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.irrigation_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
