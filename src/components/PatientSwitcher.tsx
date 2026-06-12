import React from 'react';
import { Users, X, Pill, RefreshCw, UserCheck, ArrowRight } from 'lucide-react';
import { useRole } from '../context/RoleContext';

const adherenceTone = (p: number) => {
  if (p >= 80) return { bar: 'bg-success', text: 'text-success', bg: 'bg-success/10', border: 'border-success/30' };
  if (p >= 50) return { bar: 'bg-warning', text: 'text-warning-dark', bg: 'bg-warning-light', border: 'border-warning/30' };
  return { bar: 'bg-danger', text: 'text-danger-dark', bg: 'bg-danger-light', border: 'border-danger/30' };
};

interface PatientSwitcherProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Caregiver-only slide-in drawer (from the LEFT) listing every linked
 * patient. Tapping a row switches the entire app over to that patient's
 * Firestore subtree via useActivePatient.
 */
export const PatientSwitcher: React.FC<PatientSwitcherProps> = ({ open, onClose }) => {
  const {
    role,
    linkedPatients,
    linkedPatientsLoading,
    activePatientId,
    setActivePatientId,
    refreshLinkedPatients,
  } = useRole();

  if (role !== 'caregiver') return null;

  const handleSelect = (id: string) => {
    setActivePatientId(id);
    onClose();
  };

  const handleViewSelf = () => {
    setActivePatientId(null);
    onClose();
  };

  return (
    <>
      {/* Scrim */}
      {open && (
        <div
          className="fixed inset-0 bg-navy-50/40 backdrop-blur-sm z-40 animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-navy-900 border-r border-navy-800 z-50 flex flex-col shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0 animate-slide-left' : '-translate-x-full'
        }`}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-navy-800 bg-navy-900">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-card bg-success/10 border border-success/30 flex items-center justify-center text-success">
              <Users size={16} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-navy-50">Linked Patients</div>
              <div className="text-xs text-navy-700 font-medium uppercase tracking-widest">
                Caregiver Mode
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-navy-100 bg-navy-850 border border-navy-800 rounded-card tactile-btn"
            aria-label="Close patient list"
            style={{ minHeight: 40, minWidth: 40 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Action row */}
        <div className="p-3 border-b border-navy-800 flex items-center gap-2">
          <button
            onClick={handleViewSelf}
            className={`flex-1 flex items-center justify-center gap-2 rounded-card border text-xs font-medium tactile-btn px-3 ${
              activePatientId === null
                ? 'bg-accent/10 border-accent/40 text-accent'
                : 'bg-navy-950 border-navy-800 text-navy-100 hover:border-navy-750'
            }`}
            style={{ minHeight: 48 }}
          >
            <UserCheck size={14} />
            <span>My Dashboard</span>
          </button>
          <button
            onClick={refreshLinkedPatients}
            className="flex items-center justify-center text-navy-100 hover:text-navy-50 bg-navy-950 border border-navy-800 hover:border-navy-750 rounded-card tactile-btn px-3"
            aria-label="Refresh"
            style={{ minHeight: 48, minWidth: 48 }}
          >
            <RefreshCw size={14} className={linkedPatientsLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto thin-scroll p-3 space-y-2">
          {linkedPatientsLoading && linkedPatients.length === 0 && (
            <div className="text-center py-12 text-navy-700">
              <RefreshCw size={28} className="mx-auto mb-2 opacity-40 animate-spin" />
              <p className="text-xs font-medium">Loading linked patients…</p>
            </div>
          )}

          {!linkedPatientsLoading && linkedPatients.length === 0 && (
            <div className="text-center py-10 px-2">
              <div className="w-12 h-12 rounded-card bg-navy-850 border border-navy-800 mx-auto flex items-center justify-center mb-3">
                <Users size={20} className="text-navy-700" />
              </div>
              <p className="text-sm font-medium text-navy-100">No patients linked yet</p>
              <p className="text-xs text-navy-700 mt-2 leading-relaxed">
                Ask the patient to share an invite code from their PULSE app.
                Enter it on your dashboard to start viewing their care plan.
              </p>
            </div>
          )}

          {linkedPatients.map((p) => {
            const tone = adherenceTone(p.adherencePercent);
            const isActive = p.userId === activePatientId;
            return (
              <button
                key={p.userId}
                onClick={() => handleSelect(p.userId)}
                className={`w-full text-left rounded-card border transition-all p-3 tactile-btn flex items-center gap-3 ${
                  isActive
                    ? 'bg-accent/10 border-accent/40'
                    : 'bg-navy-950 border-navy-800 hover:border-navy-750'
                }`}
                style={{ minHeight: 72 }}
              >
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-accent to-accent-dark text-navy-50 font-medium text-sm flex items-center justify-center shrink-0">
                  {(p.name || 'P').charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-navy-50 truncate">{p.name}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`inline-flex items-center text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-md ${tone.bg} ${tone.border} border ${tone.text}`}
                    >
                      {p.adherencePercent}%
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-navy-700">
                      <Pill size={10} />
                      {p.medicineCount} {p.medicineCount === 1 ? 'med' : 'meds'}
                    </span>
                  </div>
                </div>

                <ArrowRight
                  size={14}
                  className={isActive ? 'text-accent' : 'text-navy-700'}
                />
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
};

export default PatientSwitcher;
