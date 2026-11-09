# 🌾 AgroPulse — Demostración de Práctica (React Native + BaaS + Event-Driven)

Proyecto desarrollado para la materia **Desarrollo y Arquitectura en Aplicaciones Móviles (2026)**.

---

## 🚀 Puesta en Marcha Rápida (Reproducibilidad §RNF-06)

### 1. Variables de Entorno
Copia el archivo de ejemplo a la raíz y a las carpetas correspondientes:
```bash
cp .env.example .env
```

### 2. Base de Datos Supabase (BaaS)
1. Ejecuta el script DDL con RLS y Triggers:
   - Archivo: `supabase/migrations/001_initial_schema.sql`
2. Ejecuta la semilla de datos didácticos:
   - Archivo: `supabase/seed.sql`

---

### 3. Infraestructura Backend (Redpanda + Worker + Simulador + AgroMonitoring)

Levanta los contenedores en segundo plano:
```bash
cd backend/infra
docker compose up -d --build
```

Esto iniciará:
* 📡 **Redpanda (Kafka Broker):** `localhost:19092`
* 🖥️ **Redpanda Console (UI Web):** `http://localhost:8080` (para inspeccionar topics en vivo).
* ⚙️ **Worker:** Consumer que persiste telemetría en Supabase con `service_role` y aplica los comandos de irrigación.
* 🛰️ **Simulador IoT + AgroMonitoring:** Genera ticks cada 4 s e ingesta telemetría climática/satelital real de Concordia con tu API Key.

Para inspeccionar los logs del pipeline en tiempo real (RF-24):
```bash
docker compose logs -f
```

---

### 4. Aplicación Móvil (React Native + Expo)

```bash
cd apps/mobile
npm install
npm run start
```
Abre la aplicación con **Expo Go** en tu dispositivo físico o en el emulador (iOS / Android / Web).

---

## 🧪 Credenciales de Prueba para la Defensa Oral (§14)

| Rol | Correo Electrónico | Contraseña | Permisos |
| :--- | :--- | :--- | :--- |
| **Productor** | `productor@agropulse.test` | `AgroPulse2026!` | Control total, edición de umbrales y comandos (H1). |
| **Operador** | `operador@agropulse.test` | `AgroPulse2026!` | Emisión de riego y visualización. |
| **Asesor** | `asesor@agropulse.test` | `AgroPulse2026!` | Solo lectura, comandos bloqueados (H2). |

---

## 📋 Checklist de Requisitos Cumplidos (§17)

- [x] **RF-01 a RF-03:** Login persistente con Supabase Auth y aislamiento multi-tenant por establecimiento.
- [x] **RF-04 a RF-06:** Mapa de parcelas, semáforo por lote y detección GPS *"¿Estoy en el lote?"*.
- [x] **RF-08 a RF-12:** Telemetría de sensores, antigüedad de lectura (*hace 12s* / *stale* > 15m), gráfico de humedad (≥ 12 puntos) y umbrales configurables.
- [x] **RF-13 a RF-16:** Gestión de válvulas, orden de irrigación con acuse (≤ 5s), idempotencia con `client_request_id` y bloqueo de doble comando pendiente.
- [x] **RF-19 a RF-22:** Centro de alertas in-app y sugerencia agronómica de regla fija.
- [x] **RF-23 & RF-24:** Pantalla de diagnóstico técnico y logs visibles de streaming en consola compose.
- [x] **Integración AgroMonitoring API:** Integrada en el backend para telemetría satelital/clima sin acoplar el cliente móvil.
- [x] **OA-7 & RNF-02:** Desacoplamiento estricto del móvil respecto al broker Kafka y sin secrets en el binario del cliente.
