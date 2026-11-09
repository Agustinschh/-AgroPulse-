import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0F172A' },
        headerTintColor: '#F8FAFC',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarStyle: {
          backgroundColor: '#0F172A',
          borderTopColor: '#1E293B',
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#64748B',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mapa',
          headerTitle: 'AgroPulse — Mapa de Lotes',
          tabBarLabel: 'Mapa',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🗺️</Text>,
        }}
      />
      <Tabs.Screen
        name="plots"
        options={{
          title: 'Lotes',
          headerTitle: 'Gestión de Lotes',
          tabBarLabel: 'Lotes',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🌾</Text>,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alertas',
          headerTitle: 'Centro de Alertas',
          tabBarLabel: 'Alertas',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🔔</Text>,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Cuenta',
          headerTitle: 'Mi Cuenta & Diagnóstico',
          tabBarLabel: 'Cuenta',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
