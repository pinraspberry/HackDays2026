import React, { useState } from 'react';
import { SettingsProvider } from './context/SettingsContext';
import { FirebaseProvider, useFirebase } from './context/FirebaseContext';
import { MedicationProvider } from './context/MedicationContext';

import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Medicines } from './pages/Medicines';
import { Documents } from './pages/Documents';
import { AdherenceReport } from './pages/AdherenceReport';
import { Caregiver } from './pages/Caregiver';
import Login from './pages/Login';

import './App.css';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');

  const { user, loading } = useFirebase();

  console.log("USER =", user);
  console.log("LOADING =", loading);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'home':
        return <Home />;
      case 'medicines':
        return <Medicines />;
      case 'documents':
        return <Documents />;
      case 'reports':
        return <AdherenceReport />;
      case 'caregiver':
        return <Caregiver />;
      default:
        return <Home />;
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'home' && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setActiveTab('reports')}
            className="flex items-center space-x-1 text-xs font-bold text-accent bg-accent/10 border border-accent/15 py-1.5 px-3 rounded-xl hover:bg-accent/15 tactile-btn"
          >
            <span>View Full Report</span>
            <span>→</span>
          </button>
        </div>
      )}

      {renderActiveTab()}
    </Layout>
  );
};

function App() {
  return (
    <SettingsProvider>
      <FirebaseProvider>
        <MedicationProvider>
          <AppContent />
        </MedicationProvider>
      </FirebaseProvider>
    </SettingsProvider>
  );
}

export default App;