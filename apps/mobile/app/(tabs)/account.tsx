import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { UserRole } from '../../src/types/database';

export default function AccountScreen() {
  const router = useRouter();
  const { user, role, activeOrg, organizations, setActiveOrg, signOut, loginAsDemoUser } = useAuth();

  const getRoleBadgeStyle = (r: UserRole) => {
    switch (r) {
      case 'producer':
        return { bg: 'rgba(16, 185, 129, 0.15)', border: '#10B981', text: '#10B981', label: '👑 Productor (Control Total)' };
      case 'operator':
        return { bg: 'rgba(59, 130, 246, 0.15)', border: '#3B82F6', text: '#3B82F6', label: '🔧 Operador de Riego' };
      case 'advisor':
        return { bg: 'rgba(245, 158, 11, 0.15)', border: '#F59E0B', text: '#F59E0B', label: '📊 Asesor Agrónomo (Solo Lectura)' };
    }
  };

  const badge = getRoleBadgeStyle(role);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Tarjeta de Perfil */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>👤</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.userEmail}>{user?.email || 'productor@agropulse.test'}</Text>
          <View style={[styles.roleBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <Text style={[styles.roleText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
      </View>

      {/* Selector de Establecimiento (§04, RF-03) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏛️ Establecimiento Activo (RF-03)</Text>
        {organizations.map((org) => (
          <TouchableOpacity
            key={org.id}
            style={[
              styles.orgOption,
              activeOrg?.id === org.id && styles.orgOptionActive,
            ]}
            onPress={() => setActiveOrg(org)}
          >
            <View>
              <Text style={styles.orgName}>{org.name}</Text>
              <Text style={styles.orgRegion}>{org.region}</Text>
            </View>
            {activeOrg?.id === org.id && <Text style={styles.activeCheck}>✓ Activo</Text>}
          </TouchableOpacity>
        ))}
      </View>

      {/* Cambiar rol para la demo (H1 vs H2) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎭 Conmutar Rol para Demostración Oral</Text>
        <Text style={styles.sectionSubtitle}>Permite validar permisos RLS y UI en vivo</Text>
        
        <View style={styles.roleBtnGroup}>
          <TouchableOpacity
            style={[styles.roleToggleBtn, role === 'producer' && styles.roleToggleBtnActive]}
            onPress={() => loginAsDemoUser('producer')}
          >
            <Text style={styles.roleToggleText}>👑 Productor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleToggleBtn, role === 'operator' && styles.roleToggleBtnActive]}
            onPress={() => loginAsDemoUser('operator')}
          >
            <Text style={styles.roleToggleText}>🔧 Operador</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleToggleBtn, role === 'advisor' && styles.roleToggleBtnActive]}
            onPress={() => loginAsDemoUser('advisor')}
          >
            <Text style={styles.roleToggleText}>📊 Asesor (H2)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Acceso a Diagnóstico Académico (RF-23) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🛠️ Observabilidad & Diagnóstico</Text>
        <TouchableOpacity
          style={styles.diagButton}
          onPress={() => router.push('/diagnostics')}
        >
          <Text style={styles.diagButtonText}>🔬 Abrir Pantalla de Diagnóstico (RF-23)</Text>
          <Text style={styles.diagButtonSub}>Muestra latencia, estado de Realtime, IDs y logs</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
      >
        <Text style={styles.logoutText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarEmoji: {
    fontSize: 26,
  },
  profileInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  roleBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  orgOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 14,
  },
  orgOptionActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  orgName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  orgRegion: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  activeCheck: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
  },
  roleBtnGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roleToggleBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  roleToggleBtnActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  roleToggleText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  diagButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    padding: 14,
  },
  diagButtonText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
  },
  diagButtonSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
  },
});
