-- ==============================================================================
-- AGROPULSE - SEMILLA DE DATOS DIDÁCTICOS (Estancia Concordia / Entre Ríos)
-- Coordenadas ficticias en la zona de Concordia, Entre Ríos (§14, RNF-10)
-- ==============================================================================

-- 1. ORGANIZACIÓN DIDÁCTICA
INSERT INTO public.organizations (id, name, region)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Estancia Didáctica Concordia',
    'Concordia, Entre Ríos'
) ON CONFLICT (id) DO NOTHING;

-- 2. LOTES (§14)
-- Coordenadas en formato array [{latitude, longitude}, ...] alrededor de Concordia (-31.39, -58.02)
INSERT INTO public.plots (id, organization_id, name, crop, coordinates, threshold_min, threshold_max)
VALUES 
(
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Costa 1',
    'Citrus (Naranja Valencia)',
    '[
        {"latitude": -31.3850, "longitude": -58.0250},
        {"latitude": -31.3850, "longitude": -58.0180},
        {"latitude": -31.3910, "longitude": -58.0180},
        {"latitude": -31.3910, "longitude": -58.0250}
    ]'::jsonb,
    25.0,
    45.0
),
(
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Costa 2',
    'Citrus (Mandarina Clemenules)',
    '[
        {"latitude": -31.3920, "longitude": -58.0250},
        {"latitude": -31.3920, "longitude": -58.0180},
        {"latitude": -31.3980, "longitude": -58.0180},
        {"latitude": -31.3980, "longitude": -58.0250}
    ]'::jsonb,
    25.0,
    45.0
),
(
    'b0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Monte A',
    'Soja de primera',
    '[
        {"latitude": -31.3850, "longitude": -58.0340},
        {"latitude": -31.3850, "longitude": -58.0270},
        {"latitude": -31.3950, "longitude": -58.0270},
        {"latitude": -31.3950, "longitude": -58.0340}
    ]'::jsonb,
    25.0,
    45.0
) ON CONFLICT (id) DO NOTHING;

-- 3. ESTACIONES METEOROLÓGICAS / SENSORES
INSERT INTO public.stations (id, plot_id, name, lat, lng)
VALUES 
(
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Estación Costa 1 - Sonda Suelo',
    -31.3880,
    -58.0215
),
(
    'c0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'Estación Costa 2 - Sonda Suelo',
    -31.3950,
    -58.0215
),
(
    'c0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000003',
    'Estación Monte A - Sonda Suelo',
    -31.3900,
    -58.0305
) ON CONFLICT (id) DO NOTHING;

-- 4. VÁLVULAS DE RIEGO
INSERT INTO public.valves (id, plot_id, name, status)
VALUES 
(
    'd0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Válvula Goteo Costa 1 (Sector A)',
    'closed'
),
(
    'd0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'Válvula Principal Costa 2',
    'closed'
),
(
    'd0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000003',
    'Válvula Aspersión Monte A',
    'closed'
) ON CONFLICT (id) DO NOTHING;

-- 5. LECTURAS HISTÓRICAS (Últimas 12 horas con intervalos de 30 min para graficar ≥ 12 puntos)
-- Costa 1: Óptimo (~32% - 38%)
INSERT INTO public.readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
SELECT 
    'c0000000-0000-0000-0000-000000000001'::uuid,
    now() - (interval '30 minutes' * s.i),
    34.0 + (sin(s.i) * 3.5),
    22.5 + (cos(s.i) * 2.0),
    0.0,
    'sensor'
FROM generate_series(0, 16) AS s(i);

-- Costa 2: Seco (~16% - 19%) para activar caso de uso H1 (abrir riego)
INSERT INTO public.readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
SELECT 
    'c0000000-0000-0000-0000-000000000002'::uuid,
    now() - (interval '30 minutes' * s.i),
    17.5 + (sin(s.i) * 1.5),
    24.0 + (cos(s.i) * 1.5),
    0.0,
    'sensor'
FROM generate_series(0, 16) AS s(i);

-- Monte A: Lecturas de hace más de 20 minutos para simular estación apagada (STALE - Gris para H4)
INSERT INTO public.readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
SELECT 
    'c0000000-0000-0000-0000-000000000003'::uuid,
    now() - (interval '1 hour' * s.i) - interval '25 minutes',
    28.0 + (sin(s.i) * 2.0),
    21.0,
    0.0,
    'sensor'
FROM generate_series(0, 12) AS s(i);

-- 6. ASOCIADOR DE USUARIOS POR DEFECTO A LA ORGANIZACIÓN
-- Este script asocia automáticamente a los usuarios creados en Supabase Auth con su rol respectivo:
CREATE OR REPLACE FUNCTION public.assign_seed_users()
RETURNS VOID AS $$
BEGIN
    -- Productor
    INSERT INTO public.memberships (user_id, organization_id, role)
    SELECT id, 'a0000000-0000-0000-0000-000000000001'::uuid, 'producer'
    FROM auth.users WHERE email = 'productor@agropulse.test'
    ON CONFLICT (user_id, organization_id) DO NOTHING;

    -- Operador
    INSERT INTO public.memberships (user_id, organization_id, role)
    SELECT id, 'a0000000-0000-0000-0000-000000000001'::uuid, 'operator'
    FROM auth.users WHERE email = 'operador@agropulse.test'
    ON CONFLICT (user_id, organization_id) DO NOTHING;

    -- Asesor
    INSERT INTO public.memberships (user_id, organization_id, role)
    SELECT id, 'a0000000-0000-0000-0000-000000000001'::uuid, 'advisor'
    FROM auth.users WHERE email = 'asesor@agropulse.test'
    ON CONFLICT (user_id, organization_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
