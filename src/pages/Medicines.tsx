import React, { useState } from 'react';
import { useMedication } from '../context/MedicationContext';
import { useSettings } from '../context/SettingsContext';
import { useActivePatient } from '../context/RoleContext';
import { OcrService } from '../services/ocrService';
import {
  Pill,
  Plus,
  Trash2,
  Camera,
  CheckCircle,
  RefreshCw,
  X,
  Check,
  Search,
  Info,
} from 'lucide-react';
import { MedicineInfoPanel } from '../components/MedicineInfoPanel';

type Slot = 'morning' | 'afternoon' | 'evening' | 'night';
const SLOTS: Slot[] = ['morning', 'afternoon', 'evening', 'night'];

export const Medicines: React.FC = () => {
  const { medications, addMedication, deleteMedication, logs, toggleDose } = useMedication();
  const { t, language } = useSettings();
  const { isOwnData, isCaregiverViewing } = useActivePatient();
  // Caregivers viewing another patient cannot add or delete; they get a
  // read-only experience. Their own dashboard (isOwnData=true) still allows
  // mutations so they can experiment / set up their own profile.
  const canMutate = isOwnData;

  // Modal open state — replaces the inline addMode flow
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'manual' | 'scan'>('manual');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual form state
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [instructions, setInstructions] = useState('');
  const [timing, setTiming] = useState<Slot[]>(['morning']);

  // OCR state
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);

  // Medicine info slide-up panel — null when closed
  const [infoMedName, setInfoMedName] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayLog = logs[todayStr] || {};

  const resetForm = () => {
    setName('');
    setDosage('');
    setInstructions('');
    setTiming(['morning']);
    setScanResult(null);
    setModalTab('manual');
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await addMedication({
      name,
      dosage: dosage || '1 Tablet',
      frequency:
        timing.length === 1 ? 'Once Daily' : timing.length === 2 ? 'Twice Daily' : 'Multiple Daily',
      timing,
      startDate: new Date().toISOString().split('T')[0],
      instructions,
    });

    closeModal();
  };

  const toggleTiming = (slot: Slot) => {
    if (timing.includes(slot)) {
      if (timing.length > 1) setTiming(timing.filter(t => t !== slot));
    } else {
      setTiming([...timing, slot]);
    }
  };

  const handleOcrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    setScanResult(null);

    try {
      const result = await OcrService.scanPrescription(file);
      setScanResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleMockScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    await new Promise(r => setTimeout(r, 1500));
    const result = OcrService.generateMockPrescription();
    setScanResult(result);
    setIsScanning(false);
  };

  const handleSaveOcrMeds = async () => {
    if (!scanResult) return;
    for (const med of scanResult.medicines) {
      await addMedication({
        name: med.name,
        dosage: med.dosage,
        frequency: med.frequency,
        timing: med.timing,
        startDate: scanResult.date,
        instructions: med.instructions,
      });
    }
    closeModal();
  };

  const filteredMeds = medications.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const slotLabel = (slot: Slot) => {
    const map: Record<Slot, Record<string, string>> = {
      morning:   { hi: 'सुबह',  en: 'Morning'   },
      afternoon: { hi: 'दोपहर', en: 'Afternoon' },
      evening:   { hi: 'शाम',   en: 'Evening'   },
      night:     { hi: 'रात',   en: 'Night'     },
    };
    return map[slot]?.[language as 'hi' | 'en'] || slot;
  };

  return (
    <div className="space-y-6">
      {/* ===== Header — fixed top-right add button ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            {language === 'hi' ? 'दवाइयाँ' : t.medicinesTab}
          </h2>
          <p className="text-sm text-navy-700 mt-0.5">
            {language === 'hi'
              ? 'अपनी सक्रिय दवाइयाँ और आज की खुराक प्रबंधित करें'
              : 'Manage your active medicines and today’s doses'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative hidden sm:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-700" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'hi' ? 'दवाई खोजें…' : 'Search medicines…'}
              className="bg-navy-900 border border-navy-800 rounded-card py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-accent w-56"
            />
          </div>

          {canMutate && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white font-bold py-2.5 px-4 rounded-card shadow-lg shadow-accent/20 border border-accent text-sm tactile-btn"
              style={{ minHeight: 48 }}
            >
              <Plus size={16} strokeWidth={3} />
              <span>{language === 'hi' ? 'नई दवाई जोड़ें' : t.addMedTitle}</span>
            </button>
          )}
        </div>
      </div>

      {isCaregiverViewing && (
        <div className="card-navy bg-success/[0.04] border-success/25 flex items-start gap-2 py-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-success mt-0.5">
            Read-only
          </span>
          <span className="text-xs text-navy-100">
            {language === 'hi'
              ? 'आप एक मरीज़ का डैशबोर्ड देख रहे हैं। बदलाव केवल मरीज़ ही कर सकता है।'
              : "You are viewing a linked patient's data. Only the patient can add or delete medicines."}
          </span>
        </div>
      )}

      {/* Mobile search bar */}
      <div className="relative sm:hidden">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-700" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={language === 'hi' ? 'दवाई खोजें…' : 'Search medicines…'}
          className="w-full bg-navy-900 border border-navy-800 rounded-card py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-accent"
        />
      </div>

      {/* ===== Card grid ===== */}
      {filteredMeds.length === 0 ? (
        <div className="card-navy text-center py-16">
          <Pill size={48} className="mx-auto mb-3 text-navy-750 opacity-40" />
          <p className="text-base font-bold text-navy-100">
            {medications.length === 0
              ? language === 'hi'
                ? 'अभी तक कोई दवाई नहीं जोड़ी गई'
                : 'No medications added yet'
              : language === 'hi'
              ? 'कोई परिणाम नहीं'
              : 'No results found'}
          </p>
          <p className="text-xs text-navy-700 mt-2 max-w-md mx-auto leading-relaxed">
            {language === 'hi'
              ? 'दाहिनी ओर "नई दवाई जोड़ें" पर क्लिक करें या वॉइस बटन से बोलकर जोड़ें।'
              : 'Click “Add Medication” at the top right or use the voice button to dictate.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMeds.map(med => (
            <div
              key={med.id}
              className="card-navy flex flex-col gap-4 hover:border-navy-750 transition-all"
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-card bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                  <Pill size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-extrabold text-white leading-tight truncate">
                    {med.name}
                  </h3>
                  <div className="text-xs font-semibold text-navy-100 mt-0.5">
                    {med.dosage} <span className="text-navy-700">•</span> {med.frequency}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setInfoMedName(med.name)}
                    className="p-2 text-accent hover:text-white bg-navy-950 hover:bg-accent/15 border border-navy-800 hover:border-accent/40 rounded-card tactile-btn"
                    aria-label={language === 'hi' ? 'दवा की जानकारी' : language === 'ta' ? 'மருந்து தகவல்' : 'Medicine info'}
                    title={language === 'hi' ? 'दवा की जानकारी' : language === 'ta' ? 'மருந்து தகவல்' : 'Medicine info'}
                  >
                    <Info size={15} />
                  </button>
                  {canMutate && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${med.name}?`)) deleteMedication(med.id);
                      }}
                      className="p-2 text-navy-700 hover:text-rose-400 bg-navy-950 hover:bg-rose-500/10 border border-navy-800 hover:border-rose-500/30 rounded-card tactile-btn"
                      aria-label="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Tags row */}
              <div className="flex flex-wrap gap-1.5">
                {(med.timing || []).map(slot => (
                  <span
                    key={slot}
                    className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-accent/10 border border-accent/20 text-accent tracking-wider"
                  >
                    {slotLabel(slot)}
                  </span>
                ))}
                {med.instructions && (
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400 tracking-wider">
                    {med.instructions}
                  </span>
                )}
              </div>

              {/* Inline M/A/E/N checkboxes */}
              <div className="grid grid-cols-4 gap-1.5 pt-3 border-t border-navy-800">
                {SLOTS.map(slot => {
                  const scheduled = (med.timing || []).includes(slot);
                  const key = `${med.id}_${slot}`;
                  const isTaken = !!todayLog[key]?.taken;
                  return (
                    <button
                      key={slot}
                      disabled={!scheduled || !canMutate}
                      onClick={() => canMutate && toggleDose(todayStr, med.id, slot)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-card border text-[10px] font-bold uppercase tracking-wide transition-all tactile-btn ${
                        !scheduled
                          ? 'border-navy-800 bg-navy-950 text-navy-750 cursor-not-allowed opacity-40'
                          : !canMutate
                          ? 'border-navy-800 bg-navy-950 text-navy-100 cursor-not-allowed'
                          : isTaken
                          ? 'border-success/40 bg-success/10 text-success'
                          : 'border-navy-800 bg-navy-950 text-navy-100 hover:border-accent/30 hover:text-accent'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                          isTaken && scheduled
                            ? 'bg-success border-success'
                            : 'border-current opacity-70'
                        }`}
                      >
                        {isTaken && scheduled && (
                          <Check size={11} strokeWidth={3} className="text-navy-950" />
                        )}
                      </span>
                      <span className="text-[9px] leading-none">
                        {slot.slice(0, 3)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Modal — Add medication ===== */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-navy-900 border border-navy-800 rounded-card w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-slide-up"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-navy-800">
              <h3 className="text-lg font-bold text-white">
                {language === 'hi' ? 'नई दवाई जोड़ें' : t.addMedTitle}
              </h3>
              <button
                onClick={closeModal}
                className="p-2 text-navy-100 bg-navy-850 rounded-card border border-navy-800 tactile-btn"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-5 pb-0">
              <button
                onClick={() => setModalTab('manual')}
                className={`flex-1 py-2 font-bold text-center rounded-card text-sm border tactile-btn ${
                  modalTab === 'manual'
                    ? 'bg-accent border-accent text-white shadow-md shadow-accent/20'
                    : 'bg-navy-850 border-navy-800 text-navy-100 hover:border-navy-750'
                }`}
              >
                {t.addMedManual}
              </button>
              <button
                onClick={() => setModalTab('scan')}
                className={`flex-1 py-2 font-bold text-center rounded-card text-sm border tactile-btn ${
                  modalTab === 'scan'
                    ? 'bg-accent border-accent text-white shadow-md shadow-accent/20'
                    : 'bg-navy-850 border-navy-800 text-navy-100 hover:border-navy-750'
                }`}
              >
                {t.addMedScan}
              </button>
            </div>

            <div className="overflow-y-auto thin-scroll p-5">
              {modalTab === 'manual' && (
                <form onSubmit={handleManualAdd} className="space-y-4 text-left">
                  <div>
                    <label className="block text-xs font-bold text-navy-100 mb-2 uppercase tracking-wider">
                      {t.medName}
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Paracetamol"
                      className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-4 text-white outline-none focus:border-accent"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-navy-100 mb-2 uppercase tracking-wider">
                        {t.dosage}
                      </label>
                      <input
                        type="text"
                        value={dosage}
                        onChange={(e) => setDosage(e.target.value)}
                        placeholder="e.g. 1 Tablet"
                        className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-4 text-white outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-navy-100 mb-2 uppercase tracking-wider">
                        {language === 'hi' ? 'खाने के साथ निर्देश' : 'Meal Instruction'}
                      </label>
                      <input
                        type="text"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="e.g. After food"
                        className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-4 text-white outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy-100 mb-2 uppercase tracking-wider">
                      {t.timing}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {SLOTS.map(slot => {
                        const active = timing.includes(slot);
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => toggleTiming(slot)}
                            className={`py-2.5 px-2 rounded-card font-bold border text-xs uppercase tracking-wide tactile-btn ${
                              active
                                ? 'bg-accent border-accent text-white shadow-md shadow-accent/20'
                                : 'bg-navy-950 border-navy-800 text-navy-700 hover:border-navy-750'
                            }`}
                          >
                            {slotLabel(slot)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-success text-navy-950 font-extrabold py-3 rounded-card text-base shadow-xl border border-success tactile-btn"
                  >
                    {t.saveMed}
                  </button>
                </form>
              )}

              {modalTab === 'scan' && (
                <div className="flex flex-col items-center space-y-4">
                  <label className="w-full flex flex-col items-center justify-center border-2 border-dashed border-navy-800 rounded-card py-10 bg-navy-950 cursor-pointer hover:border-accent/40 transition-all tactile-btn">
                    <Camera size={40} className="text-navy-700 mb-3" />
                    <span className="text-base font-bold text-white mb-1">
                      Take Photo / Upload
                    </span>
                    <span className="text-xs text-navy-700">Supports PDF, JPG, PNG files</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleOcrFile}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={handleMockScan}
                    className="w-full py-3 bg-navy-850 hover:bg-navy-800 border border-navy-800 rounded-card font-bold text-navy-50 text-sm flex items-center justify-center gap-2 tactile-btn"
                  >
                    <RefreshCw size={14} />
                    <span>Launch Mock Prescription Scan (Demo)</span>
                  </button>

                  {isScanning && (
                    <div className="w-full bg-navy-950 border border-navy-800 rounded-card p-5 flex flex-col items-center gap-3">
                      <div className="w-9 h-9 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm font-bold text-white">OCR Parsing Document…</span>
                      <span className="text-[11px] text-navy-700 text-center leading-relaxed">
                        Tesseract.js compiling characters locally. Please wait.
                      </span>
                    </div>
                  )}

                  {scanResult && (
                    <div className="w-full space-y-3 text-left animate-fade-in">
                      <div className="bg-success/5 border border-success/20 rounded-card p-3 flex items-start gap-3">
                        <CheckCircle size={18} className="text-success mt-0.5 shrink-0" />
                        <div>
                          <h4 className="font-bold text-white text-sm">Successfully Parsed!</h4>
                          <p className="text-[11px] text-navy-700 leading-normal">
                            OCR mapped medications schedule instantly from the prescription.
                          </p>
                        </div>
                      </div>

                      <div className="bg-navy-950 rounded-card p-3 grid grid-cols-3 gap-2 text-[10px] border border-navy-800">
                        <div>
                          <span className="text-navy-700 font-bold uppercase block">Doctor</span>
                          <span className="text-white font-semibold">{scanResult.doctor}</span>
                        </div>
                        <div>
                          <span className="text-navy-700 font-bold uppercase block">Hospital</span>
                          <span className="text-white font-semibold">{scanResult.hospital}</span>
                        </div>
                        <div>
                          <span className="text-navy-700 font-bold uppercase block">Date</span>
                          <span className="text-white font-semibold">{scanResult.date}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {scanResult.medicines.map((med: any, idx: number) => (
                          <div
                            key={idx}
                            className="bg-navy-950 border border-navy-800 rounded-card p-3"
                          >
                            <div className="text-white font-extrabold text-sm">{med.name}</div>
                            <div className="text-[11px] text-navy-100 mt-0.5">
                              {med.dosage} • {med.frequency} •{' '}
                              <span className="text-accent">{med.timing.join(', ')}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={handleSaveOcrMeds}
                        className="w-full bg-success text-navy-950 font-extrabold py-3 rounded-card shadow-xl border border-success tactile-btn"
                      >
                        Import All Into Medicines
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Slide-up Medicine Info panel ===== */}
      <MedicineInfoPanel
        medicineName={infoMedName}
        onClose={() => setInfoMedName(null)}
      />
    </div>
  );
};
