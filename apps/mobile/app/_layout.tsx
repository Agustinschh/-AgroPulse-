import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#0F172A' },
            headerTintColor: '#F8FAFC',
            headerTitleStyle: { fontWeight: 'bold' },
            contentStyle: { backgroundColor: '#0B0F19' },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: 'Iniciar Sesión', headerShown: false }} />
          <Stack.Screen name="plot/[id]" options={{ title: 'Detalle de Lote' }} />
          <Stack.Screen name="diagnostics" options={{ title: 'Diagnóstico del Sistema (RF-23)' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
