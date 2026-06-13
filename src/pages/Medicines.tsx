import React, { useState } from 'react';
import { useMedication } from '../context/MedicationContext';
import { useSettings } from '../context/SettingsContext';
import { useActivePatient } from '../context/RoleContext';
import { OcrService } from '../services/ocrService';
import { useDisplayMedications } from '../hooks/useDisplayMedications';
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
  Languages,
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

  const inferTimingFromFrequency = (
    frequency: string,
    timing: Slot[] | undefined
  ): Slot[] => {
    if (timing && timing.length > 0) return timing;
    const lc = (frequency || '').toLowerCase();
    if (lc.includes('twice')) return ['morning', 'night'];
    if (lc.includes('three') || lc.includes('thrice') || lc.includes('tid') || lc.includes('tds')) {
      return ['morning', 'afternoon', 'night'];
    }
    if (lc.includes('four') || lc.includes('qid') || lc.includes('qds')) {
      return ['morning', 'afternoon', 'evening', 'night'];
    }
    return ['morning'];
  };

  const handleSaveOcrMeds = async () => {
    if (!scanResult) return;
    for (const med of scanResult.medicines) {
      if (!med?.name) continue;
      const timing = inferTimingFromFrequency(med.frequency, med.timing);
      const frequencyLabel =
        med.frequency ||
        (timing.length === 1
          ? 'Once Daily'
          : timing.length === 2
          ? 'Twice Daily'
          : timing.length === 3
          ? 'Three Times Daily'
          : 'Multiple Daily');
      await addMedication({
        name: med.name,
        dosage: med.dosage || '1 Tablet',
        frequency: frequencyLabel,
        timing,
        startDate: scanResult.date || new Date().toISOString().split('T')[0],
        instructions: med.instructions || '',
      });
    }
    closeModal();
  };

  const filteredMeds = medications.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Render-time translation: canonical English stays in Firestore;
  // the user sees medicines in their selected language.
  const { displayMedications, isTranslating } = useDisplayMedications(filteredMeds, language);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-medium text-navy-50 tracking-tight">
            {language === 'hi' ? 'दवाइयाँ' : t.medicinesTab}
          </h2>
          <p className="text-base text-navy-700 mt-1.5">
            {language === 'hi'
              ? 'अपनी सक्रिय दवाइयाँ और आज की खुराक प्रबंधित करें'
              : 'Manage your active medicines and today’s doses'}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="relative hidden sm:block">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-700" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'hi' ? 'दवाई खोजें…' : 'Search medicines…'}
              aria-label="Search medicines"
              className="bg-navy-900 border border-navy-800 rounded-card pl-11 pr-4 text-sm text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all w-64"
              style={{ minHeight: 48 }}
            />
          </div>

          {canMutate && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent-dark text-white font-medium px-5 rounded-card shadow-soft text-sm tactile-btn"
              style={{ minHeight: 48 }}
            >
              <Plus size={20} strokeWidth={2.5} />
              <span>{language === 'hi' ? 'नई दवाई जोड़ें' : t.addMedTitle}</span>
            </button>
          )}
        </div>
      </div>

      {isCaregiverViewing && (
        <div className="card-navy bg-success-light border-success/30 flex items-start gap-3 py-4">
          <span className="text-xs font-medium uppercase tracking-wider text-success-dark mt-0.5 shrink-0">
            Read-only
          </span>
          <span className="text-sm text-navy-50 leading-relaxed">
            {language === 'hi'
              ? 'आप एक मरीज़ का डैशबोर्ड देख रहे हैं। बदलाव केवल मरीज़ ही कर सकता है।'
              : "You are viewing a linked patient's data. Only the patient can add or delete medicines."}
          </span>
        </div>
      )}

      {/* Mobile search bar */}
      <div className="relative sm:hidden">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-700" aria-hidden="true" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={language === 'hi' ? 'दवाई खोजें…' : 'Search medicines…'}
          aria-label="Search medicines"
          className="w-full bg-navy-900 border border-navy-800 rounded-card pl-11 pr-4 text-sm text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
          style={{ minHeight: 48 }}
        />
      </div>

      {/* ===== Card grid ===== */}
      {filteredMeds.length === 0 ? (
        <div className="card-navy text-center py-16">
          <Pill size={56} className="mx-auto mb-4 text-navy-750" />
          <p className="text-lg font-medium text-navy-50">
            {medications.length === 0
              ? language === 'hi'
                ? 'अभी तक कोई दवाई नहीं जोड़ी गई'
                : 'No medications added yet'
              : language === 'hi'
              ? 'कोई परिणाम नहीं'
              : 'No results found'}
          </p>
          <p className="text-sm text-navy-700 mt-3 max-w-md mx-auto leading-relaxed">
            {language === 'hi'
              ? 'दाहिनी ओर "नई दवाई जोड़ें" पर क्लिक करें या वॉइस बटन से बोलकर जोड़ें।'
              : 'Click “Add Medication” at the top right or use the voice button to dictate.'}
          </p>
        </div>
      ) : (
        <>
          {isTranslating && language !== 'en' && (
            <div className="flex items-center gap-2 text-sm text-navy-700 font-medium">
              <Languages size={16} className="text-accent animate-pulse" />
              <span>
                {language === 'hi' ? 'अनुवाद हो रहा है…' : 'Translating medicines…'}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayMedications.map(med => {
              const medId = med.id as string;
              return (
                <div
                  key={medId}
                  className="card-navy flex flex-col gap-5 hover:border-accent transition-colors"
                  style={{ minHeight: 220 }}
                >
                  {/* Header — medicine name + dosage are the most important
                      information on the screen so they're scaled up the most. */}
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-card bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                      <Pill size={30} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-medium text-navy-50 leading-tight">
                        {med.name_display}
                      </h3>
                      <div className="text-base font-medium text-navy-100 mt-1.5 leading-snug">
                        {med.dosage_display} <span className="text-navy-700">•</span> {med.frequency_display}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setInfoMedName(med.name)}
                        className="text-accent hover:text-white bg-navy-950 hover:bg-accent border border-navy-800 hover:border-accent rounded-card tactile-btn flex items-center justify-center min-tap"
                        aria-label={language === 'hi' ? 'दवा की जानकारी' : language === 'ta' ? 'மருந்து தகவல்' : 'Medicine info'}
                        title={language === 'hi' ? 'दवा की जानकारी' : language === 'ta' ? 'மருந்து தகவல்' : 'Medicine info'}
                      >
                        <Info size={18} />
                      </button>
                      {canMutate && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${med.name_display}?`)) deleteMedication(medId);
                          }}
                          className="text-navy-700 hover:text-danger bg-navy-950 hover:bg-danger-light border border-navy-800 hover:border-danger rounded-card tactile-btn flex items-center justify-center min-tap"
                          aria-label="Delete medication"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tags row */}
                  <div className="flex flex-wrap gap-2">
                    {(med.timing || []).map(slot => (
                      <span
                        key={slot}
                        className="text-xs font-medium uppercase px-3 py-1.5 rounded-pill bg-accent/8 border border-accent/30 text-accent-dark tracking-wider"
                      >
                        {slotLabel(slot)}
                      </span>
                    ))}
                    {med.instructions_display && (
                      <span className="text-xs font-medium uppercase px-3 py-1.5 rounded-pill bg-warning-light border border-warning/30 text-warning-dark tracking-wider">
                        {med.instructions_display}
                      </span>
                    )}
                  </div>

                  {/* Inline M/A/E/N checkboxes */}
                  <div className="grid grid-cols-4 gap-2 pt-4 border-t border-navy-800">
                    {SLOTS.map(slot => {
                      const scheduled = (med.timing || []).includes(slot);
                      const key = `${medId}_${slot}`;
                      const isTaken = !!todayLog[key]?.taken;
                      return (
                        <button
                          key={slot}
                          disabled={!scheduled || !canMutate}
                          onClick={() => canMutate && toggleDose(todayStr, medId, slot)}
                          aria-pressed={isTaken}
                          aria-label={`${slot} ${isTaken ? 'taken' : 'pending'}`}
                          className={`flex flex-col items-center gap-1.5 p-2 rounded-card border text-xs font-medium uppercase tracking-wider transition-colors tactile-btn ${
                            !scheduled
                              ? 'border-navy-800 bg-navy-950 text-navy-750 cursor-not-allowed opacity-50'
                              : !canMutate
                              ? 'border-navy-800 bg-navy-950 text-navy-100 cursor-not-allowed'
                              : isTaken
                              ? 'border-success/40 bg-success-light text-success-dark'
                              : 'border-navy-800 bg-navy-950 text-navy-100 hover:border-accent hover:text-accent-dark'
                          }`}
                          style={{ minHeight: 56 }}
                        >
                          <span
                            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                              isTaken && scheduled
                                ? 'bg-success border-success'
                                : 'border-current opacity-70'
                            }`}
                          >
                            {isTaken && scheduled && (
                              <Check size={14} strokeWidth={3} className="text-white" />
                            )}
                          </span>
                          <span className="text-xs leading-none">
                            {slot.slice(0, 3)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ===== Modal — Add medication ===== */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-navy-50/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-navy-900 border border-navy-800 rounded-card w-full max-w-2xl shadow-lifted flex flex-col max-h-[90vh] animate-slide-up"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-navy-800">
              <h3 className="text-xl font-medium text-navy-50">
                {language === 'hi' ? 'नई दवाई जोड़ें' : t.addMedTitle}
              </h3>
              <button
                onClick={closeModal}
                className="text-navy-50 hover:text-accent bg-navy-850 hover:bg-accent/10 rounded-card border border-navy-800 hover:border-accent tactile-btn flex items-center justify-center min-tap"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-5 pb-0">
              <button
                onClick={() => setModalTab('manual')}
                aria-pressed={modalTab === 'manual'}
                className={`flex-1 py-2 font-medium text-center rounded-card text-sm border tactile-btn ${
                  modalTab === 'manual'
                    ? 'bg-accent border-accent text-white shadow-soft'
                    : 'bg-navy-850 border-navy-800 text-navy-50 hover:border-accent'
                }`}
                style={{ minHeight: 48 }}
              >
                {t.addMedManual}
              </button>
              <button
                onClick={() => setModalTab('scan')}
                aria-pressed={modalTab === 'scan'}
                className={`flex-1 py-2 font-medium text-center rounded-card text-sm border tactile-btn ${
                  modalTab === 'scan'
                    ? 'bg-accent border-accent text-white shadow-soft'
                    : 'bg-navy-850 border-navy-800 text-navy-50 hover:border-accent'
                }`}
                style={{ minHeight: 48 }}
              >
                {t.addMedScan}
              </button>
            </div>

            <div className="overflow-y-auto thin-scroll p-5">
              {modalTab === 'manual' && (
                <form onSubmit={handleManualAdd} className="space-y-5 text-left">
                  <div>
                    <label htmlFor="med-name" className="block text-sm font-medium text-navy-50 mb-2">
                      {t.medName}
                    </label>
                    <input
                      id="med-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Paracetamol"
                      className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                      style={{ minHeight: 48 }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="med-dosage" className="block text-sm font-medium text-navy-50 mb-2">
                        {t.dosage}
                      </label>
                      <input
                        id="med-dosage"
                        type="text"
                        value={dosage}
                        onChange={(e) => setDosage(e.target.value)}
                        placeholder="e.g. 1 Tablet"
                        className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                        style={{ minHeight: 48 }}
                      />
                    </div>
                    <div>
                      <label htmlFor="med-instructions" className="block text-sm font-medium text-navy-50 mb-2">
                        {language === 'hi' ? 'खाने के साथ निर्देश' : 'Meal Instruction'}
                      </label>
                      <input
                        id="med-instructions"
                        type="text"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="e.g. After food"
                        className="w-full bg-navy-950 border border-navy-800 rounded-card px-4 text-base text-navy-50 placeholder:text-navy-700 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-all"
                        style={{ minHeight: 48 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-navy-50 mb-3">
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
                            className={`py-3 px-2 rounded-card font-medium border text-xs uppercase tracking-wider tactile-btn ${
                              active
                                ? 'bg-accent border-accent text-white shadow-soft'
                                : 'bg-navy-950 border-navy-800 text-navy-50 hover:border-accent hover:text-accent'
                            }`}
                            aria-pressed={active}
                          >
                            {slotLabel(slot)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-success hover:bg-success-dark text-white font-medium rounded-card text-base shadow-soft tactile-btn"
                    style={{ minHeight: 52 }}
                  >
                    {t.saveMed}
                  </button>
                </form>
              )}

              {modalTab === 'scan' && (
                <div className="flex flex-col items-center space-y-4">
                  <label className="w-full flex flex-col items-center justify-center border-2 border-dashed border-navy-800 rounded-card py-12 bg-navy-950 cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors tactile-btn">
                    <Camera size={44} className="text-accent mb-4" />
                    <span className="text-base font-medium text-navy-50 mb-1">
                      Take Photo / Upload
                    </span>
                    <span className="text-sm text-navy-700">Supports PDF, JPG, PNG files</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleOcrFile}
                      className="hidden"
                      aria-label="Upload prescription file"
                    />
                  </label>

                  <button
                    onClick={handleMockScan}
                    className="w-full bg-navy-850 hover:bg-accent/10 hover:text-accent border border-navy-800 hover:border-accent rounded-card font-medium text-navy-50 text-sm flex items-center justify-center gap-2 tactile-btn"
                    style={{ minHeight: 48 }}
                  >
                    <RefreshCw size={18} />
                    <span>Launch Mock Prescription Scan (Demo)</span>
                  </button>

                  {isScanning && (
                    <div className="w-full bg-navy-950 border border-navy-800 rounded-card p-6 flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                      <span className="text-base font-medium text-navy-50">
                        {language === 'hi' ? 'पर्चा पढ़ा जा रहा है…' : 'Reading your prescription…'}
                      </span>
                      <span className="text-sm text-navy-700 text-center leading-relaxed">
                        {language === 'hi'
                          ? 'AI दवाइयाँ, खुराक और निर्देश पहचान रहा है।'
                          : 'AI is identifying medicines, dosages and instructions. Handwriting can take a few extra seconds.'}
                      </span>
                    </div>
                  )}

                  {scanResult && (
                    <div className="w-full space-y-3 text-left animate-fade-in">
                      <div className="bg-success-light border border-success/30 rounded-card p-4 flex items-start gap-3">
                        <CheckCircle size={22} className="text-success-dark mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-navy-50 text-base">
                            {scanResult.medicines && scanResult.medicines.length > 0
                              ? language === 'hi'
                                ? `${scanResult.medicines.length} दवाइयाँ मिलीं`
                                : `Found ${scanResult.medicines.length} medicine${scanResult.medicines.length === 1 ? '' : 's'}`
                              : language === 'hi'
                              ? 'पर्चा पढ़ा गया'
                              : 'Prescription read'}
                          </h4>
                          <p className="text-sm text-navy-100 leading-relaxed mt-1">
                            {scanResult.medicines && scanResult.medicines.length > 0
                              ? language === 'hi'
                                ? 'नीचे विवरण देखें और अपनी सूची में जोड़ें।'
                                : 'Review the details below, then import to your schedule.'
                              : language === 'hi'
                              ? 'कोई दवा नहीं पहचानी गई। आप मैन्युअली जोड़ सकते हैं।'
                              : 'No medicines were detected automatically. You can add them manually.'}
                          </p>
                          {(scanResult.ocrSource || scanResult.usedHandwritingFallback) && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {scanResult.ocrSource && (
                                <span className="text-xs font-medium uppercase tracking-wider px-2.5 py-1 rounded-pill bg-navy-900 border border-navy-800 text-navy-100">
                                  {String(scanResult.ocrSource).replace(/-/g, ' ')}
                                </span>
                              )}
                              {scanResult.usedHandwritingFallback && (
                                <span className="text-xs font-medium uppercase tracking-wider px-2.5 py-1 rounded-pill bg-accent/8 border border-accent/30 text-accent-dark">
                                  {language === 'hi' ? 'हस्तलेख मोड' : 'Handwriting mode'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-navy-950 rounded-card p-4 grid grid-cols-3 gap-3 text-xs border border-navy-800">
                        <div>
                          <span className="text-navy-700 font-medium uppercase block tracking-wider">Doctor</span>
                          <span className="text-navy-50 font-medium truncate block mt-1 text-sm">
                            {scanResult.doctor || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-navy-700 font-medium uppercase block tracking-wider">Hospital</span>
                          <span className="text-navy-50 font-medium truncate block mt-1 text-sm">
                            {scanResult.hospital || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-navy-700 font-medium uppercase block tracking-wider">Date</span>
                          <span className="text-navy-50 font-medium block mt-1 text-sm">{scanResult.date}</span>
                        </div>
                      </div>

                      {scanResult.medicines && scanResult.medicines.length > 0 && (
                        <div className="space-y-2">
                          {scanResult.medicines.map((med: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-navy-950 border border-navy-800 rounded-card p-4"
                            >
                              <div className="text-navy-50 font-medium text-base">{med.name}</div>
                              <div className="text-sm text-navy-100 mt-1">
                                {[med.dosage, med.frequency].filter(Boolean).join(' • ')}
                                {med.timing && med.timing.length > 0 && (
                                  <>
                                    {' '}
                                    •{' '}
                                    <span className="text-accent font-medium">{med.timing.join(', ')}</span>
                                  </>
                                )}
                              </div>
                              {med.instructions && (
                                <div className="text-sm text-navy-700 mt-1.5 italic">
                                  {med.instructions}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {scanResult.warnings && scanResult.warnings.length > 0 && (
                        <div className="bg-warning-light border border-warning/40 rounded-card p-4 text-sm text-warning-dark leading-relaxed space-y-1">
                          {scanResult.warnings.map((w: string, i: number) => (
                            <div key={i}>{w}</div>
                          ))}
                        </div>
                      )}

                      {scanResult.medicines && scanResult.medicines.length > 0 && (
                        <button
                          onClick={handleSaveOcrMeds}
                          className="w-full bg-success hover:bg-success-dark text-white font-medium rounded-card shadow-soft tactile-btn"
                          style={{ minHeight: 52 }}
                        >
                          {language === 'hi'
                            ? 'सभी दवाइयाँ जोड़ें'
                            : 'Import All Into Medicines'}
                        </button>
                      )}
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
