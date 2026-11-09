import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { UserRole } from '../src/types/database';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, loginAsDemoUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Por favor ingresa tu email y contraseña.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    const res = await signIn(email, password);
    setLoading(false);
    if (res.error) {
      setErrorMessage(res.error);
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleQuickDemo = async (role: UserRole) => {
    setLoading(true);
    setErrorMessage(null);
    const res = await loginAsDemoUser(role);
    setLoading(false);
    if (res.error) {
      setErrorMessage(res.error);
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Branding */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>🌾</Text>
          </View>
          <Text style={styles.title}>AgroPulse</Text>
          <Text style={styles.subtitle}>Agricultura de Precisión & Telemetría IoT</Text>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Acceso al Establecimiento</Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          <Text style={styles.label}>Correo Electrónico</Text>
          <TextInput
            style={styles.input}
            placeholder="productor@agropulse.test"
            placeholderTextColor="#64748B"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#64748B"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Iniciar Sesión</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Demo Fast Access (Para la Defensa Oral) */}
        <View style={styles.demoSection}>
          <Text style={styles.demoTitle}>🎯 Acceso Rápido para Defensa Oral (§14)</Text>
          
          <TouchableOpacity
            style={[styles.demoButton, { borderColor: '#10B981' }]}
            onPress={() => handleQuickDemo('producer')}
          >
            <Text style={styles.demoButtonEmoji}>👑</Text>
            <View style={styles.demoButtonTextContainer}>
              <Text style={styles.demoButtonRole}>Productor (Acceso Total)</Text>
              <Text style={styles.demoButtonEmail}>productor@agropulse.test</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.demoButton, { borderColor: '#3B82F6' }]}
            onPress={() => handleQuickDemo('operator')}
          >
            <Text style={styles.demoButtonEmoji}>🔧</Text>
            <View style={styles.demoButtonTextContainer}>
              <Text style={styles.demoButtonRole}>Operador (Válvulas y Riego)</Text>
              <Text style={styles.demoButtonEmail}>operador@agropulse.test</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.demoButton, { borderColor: '#F59E0B' }]}
            onPress={() => handleQuickDemo('advisor')}
          >
            <Text style={styles.demoButtonEmoji}>📊</Text>
            <View style={styles.demoButtonTextContainer}>
              <Text style={styles.demoButtonRole}>Asesor Agrónomo (Solo Lectura - H2)</Text>
              <Text style={styles.demoButtonEmail}>asesor@agropulse.test</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoIcon: {
    fontSize: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
  },
  demoSection: {
    marginTop: 28,
  },
  demoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  demoButtonEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  demoButtonTextContainer: {
    flex: 1,
  },
  demoButtonRole: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  demoButtonEmail: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
});
