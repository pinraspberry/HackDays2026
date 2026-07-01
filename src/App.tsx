// PULSE — modified
import React, { useState } from 'react';
import { SettingsProvider } from './context/SettingsContext';
import { FirebaseProvider, useFirebase } from './context/FirebaseContext';
import { MedicationProvider } from './context/MedicationContext';
import { RoleProvider } from './context/RoleContext';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { SOSProvider } from './context/SOSContext';

import { Layout } from './components/Layout';
import { RoleGuard } from './components/RoleGuard';
import { Home } from './pages/Home';
import { Medicines } from './pages/Medicines';
import { Documents } from './pages/Documents';
import { AdherenceReport } from './pages/AdherenceReport';
import { Assistant } from './pages/Assistant';
import { CaregiverLink } from './pages/CaregiverLink';
import { NearbyCare } from './pages/NearbyCare';
import { Appointments } from './pages/Appointments';
import { Profile } from './pages/Profile';
import Login from './pages/Login';

import './App.css';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');

  const { user, loading } = useFirebase();

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'home':
        return (
          <Home
            onOpenReport={() => setActiveTab('reports')}
            onOpenNearby={() => setActiveTab('nearby')}
          />
        );
      case 'medicines':
        return <Medicines />;
      case 'documents':
        return <Documents />;
      case 'reports':
        return <AdherenceReport />;
      case 'assistant':
      case 'caregiver':
        return <Assistant />;
      case 'caregiver-link':
        return <CaregiverLink />;
      case 'appointments':
        return <Appointments />;
      case 'nearby':
        return <NearbyCare />;
      case 'profile':
        return <Profile />;
      default:
        return (
          <Home
            onOpenReport={() => setActiveTab('reports')}
            onOpenNearby={() => setActiveTab('nearby')}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-950 text-navy-50">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
          <span className="text-base font-medium">Loading PULSE…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <RoleProvider>
      {/* MedicationProvider lives inside RoleProvider so useActivePatient
          (defined in RoleContext) is available to it. SOSProvider needs
          the authenticated user from FirebaseContext only, so it can sit
          here next to MedicationProvider — its single Firestore listener
          is keyed off auth state and tears down on logout automatically. */}
      <MedicationProvider>
        <SOSProvider>
          <RoleGuard activeTab={activeTab} setActiveTab={setActiveTab}>
            <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
              {renderActiveTab()}
            </Layout>
          </RoleGuard>
        </SOSProvider>
      </MedicationProvider>
    </RoleProvider>
  );
};

function App() {
  return (
    <AccessibilityProvider>
      <SettingsProvider>
        <FirebaseProvider>
          <AppContent />
        </FirebaseProvider>
      </SettingsProvider>
    </AccessibilityProvider>
  );
}

export default App;
