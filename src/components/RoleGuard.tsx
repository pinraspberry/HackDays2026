import React, { useEffect } from 'react';
import { useRole } from '../context/RoleContext';
import type { UserRole } from '../context/RoleContext';
import Onboarding from '../pages/Onboarding';

/**
 * Tabs that are restricted to a specific role. Anything not listed here
 * is accessible to both patients and caregivers.
 */
export const PATIENT_ONLY_TABS = new Set<string>([
  'caregiver-link', // generate invite codes
]);

export const CAREGIVER_ONLY_TABS = new Set<string>([
  // Reserved for future caregiver-only screens.
]);

interface RoleGuardProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
}

/**
 * RoleGuard wraps the routed page content. It:
 *   1. Renders the Onboarding screen until the user has chosen a role.
 *   2. Redirects users away from tabs that aren't allowed for their role.
 */
export const RoleGuard: React.FC<RoleGuardProps> = ({ activeTab, setActiveTab, children }) => {
  const { role, profileLoading } = useRole();

  // While we're still resolving the user profile, show a soft loader so
  // the protected content doesn't render against null state.
  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-950 text-navy-100">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-base font-medium">Loading your profile…</span>
        </div>
      </div>
    );
  }

  if (role === null) {
    return <Onboarding onComplete={() => setActiveTab('home')} />;
  }

  // Tab-level role gating
  return (
    <RouteRedirector role={role} activeTab={activeTab} setActiveTab={setActiveTab}>
      {children}
    </RouteRedirector>
  );
};

const RouteRedirector: React.FC<{
  role: UserRole;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
}> = ({ role, activeTab, setActiveTab, children }) => {
  useEffect(() => {
    if (role === 'caregiver' && PATIENT_ONLY_TABS.has(activeTab)) {
      setActiveTab('home');
    } else if (role === 'patient' && CAREGIVER_ONLY_TABS.has(activeTab)) {
      setActiveTab('home');
    }
  }, [role, activeTab, setActiveTab]);

  return <>{children}</>;
};

export default RoleGuard;
