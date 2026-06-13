import { extractTextFromPdf } from '../services/pdfExtractor';
import {
  extractPrescription,
  type PrescriptionExtractionResult,
} from '../services/prescriptionPipeline';
import React, { useState, useMemo } from 'react';
import { useMedication } from '../context/MedicationContext';
import type { MedDocument } from '../context/MedicationContext';
import { useSettings } from '../context/SettingsContext';
import { useActivePatient } from '../context/RoleContext';
import { useDisplayMedications } from '../hooks/useDisplayMedications';
import {
  FileText,
  Calendar,
  User,
  Building,
  Eye,
  Trash2,
  X,
  Search,
  UploadCloud,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Plus,
  Languages,
} from 'lucide-react';

type DocType = 'prescription' | 'report' | 'summary' | 'all';

export const Documents: React.FC = () => {
  const { documents, addDocument, deleteDocument, addMedication } = useMedication();
  const { t, language } = useSettings();
  const { isOwnData, isCaregiverViewing } = useActivePatient();
  const canMutate = isOwnData;

  const [isUploading, setIsUploading] = useState(false);
  const [docName, setDocName] = useState('');
  const [doctor, setDoctor] = useState('');
  const [hospital, setHospital] = useState('');
  const [type, setType] = useState<'prescription' | 'report' | 'summary'>('prescription');

  const [previewDoc, setPreviewDoc] = useState<MedDocument | null>(null);

  // Inline banner after a successful prescription extraction. Lets the
  // user import the detected medicines into their schedule without
  // navigating to the Medicines tab.
  const [extractionResult, setExtractionResult] =
    useState<PrescriptionExtractionResult | null>(null);
  const [extractionFileName, setExtractionFileName] = useState<string>('');
  const [importingMeds, setImportingMeds] = useState(false);

  // Filter / search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocType>('all');

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

  const isImageFile = (file: File): boolean =>
    (file.type?.toLowerCase() || '').startsWith('image/') ||
    /\.(png|jpe?g|webp|bmp)$/i.test(file.name || '');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setExtractionResult(null);
    setExtractionFileName('');

    try {
      const base64 = await readFileAsDataUrl(file);
      let extractedText = '';
      let detectedDoctor = '';
      let detectedHospital = '';
      let detectedDate = '';
      let detectedMedicines: string[] = [];
      let pipelineResult: PrescriptionExtractionResult | null = null;

      const shouldRunPipeline = type === 'prescription' || isImageFile(file);

      if (shouldRunPipeline) {
        try {
          pipelineResult = await extractPrescription(file);
          extractedText = pipelineResult.rawText || '';
          detectedDoctor = pipelineResult.doctor || '';
          detectedHospital = pipelineResult.hospital || '';
          detectedDate = pipelineResult.date || '';
          detectedMedicines = pipelineResult.medicines.map((m) => m.name);
        } catch (err) {
          console.error('PRESCRIPTION PIPELINE FAILED:', err);
        }
      } else if (file.type === 'application/pdf') {
        try {
          extractedText = await extractTextFromPdf(file);
        } catch (err) {
          console.error('PDF EXTRACTION FAILED:', err);
        }
      }

      const today = new Date().toISOString().split('T')[0];

      await addDocument({
        name: docName || file.name.split('.')[0] || 'Medical Document',
        type,
        date: detectedDate || today,
        doctor: doctor || detectedDoctor || '',
        hospital: hospital || detectedHospital || '',
        medicines: detectedMedicines,
        fileUrl: base64,
        extractedText,
      });

      setDocName('');
      setDoctor('');
      setHospital('');

      if (pipelineResult && (pipelineResult.medicines.length > 0 || pipelineResult.warnings.length > 0)) {
        setExtractionResult(pipelineResult);
        setExtractionFileName(file.name);
      }
    } catch (err) {
      console.error('UPLOAD ERROR:', err);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const slotForFrequency = (
    frequency: string,
    timing: ('morning' | 'afternoon' | 'evening' | 'night')[]
  ): ('morning' | 'afternoon' | 'evening' | 'night')[] => {
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

  const importMedicines = async () => {
    if (!extractionResult || !canMutate) return;
    setImportingMeds(true);
    try {
      for (const med of extractionResult.medicines) {
        if (!med.name) continue;
        const timing = slotForFrequency(med.frequency, med.timing);
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
          startDate: extractionResult.date || new Date().toISOString().split('T')[0],
          instructions: med.instructions || '',
        });
      }
    } catch (err) {
      console.error('IMPORT MEDICINES FAILED:', err);
    } finally {
      setImportingMeds(false);
      setExtractionResult(null);
      setExtractionFileName('');
    }
  };

  const dismissExtractionBanner = () => {
    setExtractionResult(null);
    setExtractionFileName('');
  };

  // Render-time translation of the extracted medicines for the banner.
  // The canonical English copy (extractionResult.medicines) is what gets
  // written to Firestore when the user clicks "Import to my schedule".
  const extractedMedsForDisplay = useMemo(
    () => extractionResult?.medicines ?? [],
    [extractionResult]
  );
  const {
    displayMedications: displayExtractedMeds,
    isTranslating: isTranslatingExtracted,
  } = useDisplayMedications(extractedMedsForDisplay, language);

  const filteredDocs = useMemo(() => {
    return documents.filter(d => {
      if (typeFilter !== 'all' && d.type !== typeFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.doctor.toLowerCase().includes(q) ||
        d.hospital.toLowerCase().includes(q) ||
        d.medicines.some(m => m.toLowerCase().includes(q))
      );
    });
  }, [documents, searchQuery, typeFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-medium text-navy-50 tracking-tight">
            {language === 'hi' ? 'पर्चे और रिपोर्ट्स' : t.docTitle}
          </h2>
          <p className="text-base text-navy-700 mt-1.5">
            {language === 'hi'
              ? 'प्रिस्क्रिप्शन और लैब रिपोर्ट्स अपलोड और प्रबंधित करें'
              : 'Upload and manage prescriptions, lab reports, and discharge summaries'}
          </p>
        </div>
      </div>

      {isCaregiverViewing && (
        <div className="card-navy bg-success-light border-success/30 flex items-start gap-3 py-4">
          <span className="text-xs font-medium uppercase tracking-wider text-success-dark mt-0.5 shrink-0">
            Read-only
          </span>
          <span className="text-sm text-navy-50 leading-relaxed">
            {language === 'hi'
              ? 'आप मरीज़ के दस्तावेज़ देख रहे हैं। केवल मरीज़ ही अपलोड कर सकता है।'
              : "You are viewing a linked patient's documents. Only the patient can upload new files."}
          </span>
        </div>
      )}

      {/* Two-column responsive layout */}
      <div className={`grid grid-cols-1 ${canMutate ? 'lg:grid-cols-5' : ''} gap-5`}>
        {/* ===== LEFT — Upload form (only when the user owns the data) ===== */}
        {canMutate && (
        <div className="lg:col-span-2">
          <div className="card-navy space-y-4 sticky top-20">
            <div>
              <h3 className="text-sm font-medium text-navy-50">
                {language === 'hi' ? 'नया दस्तावेज़ अपलोड करें' : t.uploadDoc}
              </h3>
              <p className="text-xs text-navy-700 mt-0.5">
                {language === 'hi'
                  ? 'दस्तावेज़ का विवरण भरें और फ़ाइल चुनें'
                  : 'Fill the details below and pick a file to upload'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                {language === 'hi' ? 'दस्तावेज़ शीर्षक' : 'Document Label'}
              </label>
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g. AIIMS Cardiology Prescription"
                className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                {language === 'hi' ? 'प्रकार' : 'Type'}
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent cursor-pointer"
              >
                <option value="prescription">Prescription पर्चा</option>
                <option value="report">Lab Report लैब रिपोर्ट</option>
                <option value="summary">Discharge Summary डिस्चार्ज</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                  {language === 'hi' ? 'डॉक्टर का नाम' : 'Doctor Name'}
                </label>
                <input
                  type="text"
                  value={doctor}
                  onChange={(e) => setDoctor(e.target.value)}
                  placeholder="Dr. Amit Sharma"
                  className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-navy-100 mb-1.5 uppercase tracking-widest">
                  {language === 'hi' ? 'अस्पताल / लैब' : 'Hospital / Lab'}
                </label>
                <input
                  type="text"
                  value={hospital}
                  onChange={(e) => setHospital(e.target.value)}
                  placeholder="City Health Clinic"
                  className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* File drop zone */}
            <label className="w-full flex flex-col items-center justify-center border-2 border-dashed border-navy-800 bg-navy-950 py-7 rounded-card cursor-pointer hover:border-accent/50 hover:bg-navy-900 transition-all text-sm text-navy-100 tactile-btn">
              {isUploading ? (
                <>
                  <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2"></div>
                  <span className="font-medium text-navy-50">Uploading…</span>
                </>
              ) : (
                <>
                  <UploadCloud size={28} className="text-accent mb-2" />
                  <span className="font-medium text-navy-50">
                    {language === 'hi' ? 'फ़ाइल चुनें या ड्रैग करें' : 'Click or drop file here'}
                  </span>
                  <span className="text-xs text-navy-700 mt-1">PDF, JPG, PNG</span>
                </>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleUpload}
                className="hidden"
              />
            </label>

            <div className="bg-accent/5 border border-accent/15 rounded-card p-3 flex items-start gap-2">
              <FileText size={14} className="text-accent mt-0.5 shrink-0" />
              <p className="text-xs text-navy-100 leading-relaxed">
                {language === 'hi'
                  ? 'अपलोड किए गए दस्तावेज़ को आप AI सहायक से किसी भी समय पूछ सकते हैं।'
                  : 'You can ask the AI Assistant about any uploaded document at any time.'}
              </p>
            </div>

            {extractionResult && (
              <div className="space-y-3 animate-fade-in">
                <div className="card-navy bg-success/[0.05] border-success/30 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <Sparkles size={16} className="text-success mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-navy-50">
                        {language === 'hi'
                          ? `${extractionResult.medicines.length} दवाइयाँ मिलीं`
                          : `Found ${extractionResult.medicines.length} medicine${extractionResult.medicines.length === 1 ? '' : 's'}`}
                      </h4>
                      <p className="text-xs text-navy-100 mt-0.5 truncate">
                        {extractionFileName}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="text-xs font-medium uppercase tracking-widest px-1.5 py-0.5 rounded bg-navy-950 border border-navy-800 text-navy-100">
                          {extractionResult.ocrSource.replace(/-/g, ' ')}
                        </span>
                        {extractionResult.usedHandwritingFallback && (
                          <span className="text-xs font-medium uppercase tracking-widest px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent">
                            {language === 'hi' ? 'हस्तलेख मोड' : 'Handwriting mode'}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={dismissExtractionBanner}
                      className="p-1.5 text-navy-700 hover:text-navy-50 rounded-card border border-navy-800 hover:border-navy-700 tactile-btn shrink-0"
                      title="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {displayExtractedMeds.length > 0 && (
                    <>
                      {isTranslatingExtracted && language !== 'en' && (
                        <div className="flex items-center gap-1.5 text-xs text-navy-700 font-medium -mb-1">
                          <Languages size={11} className="text-accent animate-pulse" />
                          <span>
                            {language === 'hi' ? 'अनुवाद हो रहा है…' : 'Translating…'}
                          </span>
                        </div>
                      )}
                      <ul className="space-y-1.5">
                        {displayExtractedMeds.map((m, i) => (
                          <li
                            key={i}
                            className="bg-navy-950 border border-navy-800 rounded-card px-2.5 py-1.5"
                          >
                            <div className="text-xs font-medium text-navy-50 truncate">{m.name_display}</div>
                            <div className="text-xs text-navy-100 mt-0.5">
                              {[m.dosage_display, m.frequency_display].filter(Boolean).join(' • ')}
                              {m.timing.length > 0 && (
                                <span className="text-accent"> • {m.timing.join(', ')}</span>
                              )}
                            </div>
                            {m.instructions_display && (
                              <div className="text-xs text-navy-700 mt-0.5 italic">
                                {m.instructions_display}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {extractionResult.medicines.length > 0 && (
                    <button
                      onClick={importMedicines}
                      disabled={importingMeds}
                      className="w-full inline-flex items-center justify-center gap-2 bg-success hover:bg-success-dark text-white font-medium rounded-card shadow-soft tactile-btn disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ minHeight: 48 }}
                    >
                      {importingMeds ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm">
                            {language === 'hi' ? 'जोड़ा जा रहा है…' : 'Adding to schedule…'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Plus size={18} strokeWidth={2.5} />
                          <span className="text-sm">
                            {language === 'hi'
                              ? 'मेरी दवाइयों में जोड़ें'
                              : 'Import to my schedule'}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {extractionResult.warnings.length > 0 && (
                  <div className="bg-warning-light border border-warning/40 rounded-card p-4 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-warning-dark mt-0.5 shrink-0" />
                    <div className="text-xs text-navy-100 leading-relaxed space-y-0.5">
                      {extractionResult.warnings.map((w, i) => (
                        <div key={i}>{w}</div>
                      ))}
                    </div>
                  </div>
                )}

                {extractionResult.medicines.length === 0 && extractionResult.rawText && (
                  <div className="bg-navy-950 border border-navy-800 rounded-card p-2.5 text-xs text-navy-100 leading-relaxed flex items-start gap-2">
                    <CheckCircle size={13} className="text-accent mt-0.5 shrink-0" />
                    <span>
                      {language === 'hi'
                        ? 'दस्तावेज़ पढ़ा गया पर कोई दवा पहचानी नहीं गई। आप दवाइयाँ खुद जोड़ सकते हैं।'
                        : 'Document read successfully, but no medicines were recognised. You can add them manually from the Medicines tab.'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ===== RIGHT — Filter + list ===== */}
        <div className={`${canMutate ? 'lg:col-span-3' : ''} space-y-4`}>
          {/* Filter bar */}
          <div className="card-navy flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-700" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  language === 'hi'
                    ? 'नाम, डॉक्टर, अस्पताल खोजें…'
                    : 'Search by name, doctor, hospital…'
                }
                className="w-full bg-navy-950 border border-navy-800 rounded-card py-2.5 pl-9 pr-3 text-sm text-navy-50 outline-none focus:border-accent"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as DocType)}
              className="bg-navy-950 border border-navy-800 rounded-card py-2.5 px-3 text-sm text-navy-50 outline-none focus:border-accent cursor-pointer min-w-[140px]"
            >
              <option value="all">{language === 'hi' ? 'सभी' : 'All Types'}</option>
              <option value="prescription">{language === 'hi' ? 'प्रिस्क्रिप्शन' : 'Prescription'}</option>
              <option value="report">{language === 'hi' ? 'लैब रिपोर्ट' : 'Lab Report'}</option>
              <option value="summary">{language === 'hi' ? 'डिस्चार्ज' : 'Discharge'}</option>
            </select>
          </div>

          {/* Documents list */}
          {filteredDocs.length === 0 ? (
            <div className="card-navy text-center py-16">
              <FileText size={48} className="mx-auto mb-3 text-navy-750 opacity-40" />
              <p className="text-base font-medium text-navy-100">
                {documents.length === 0
                  ? language === 'hi'
                    ? 'कोई दस्तावेज़ नहीं'
                    : 'No documents stored'
                  : language === 'hi'
                  ? 'कोई परिणाम नहीं'
                  : 'No documents match your filters'}
              </p>
              <p className="text-xs text-navy-700 mt-2 leading-relaxed max-w-md mx-auto">
                {language === 'hi'
                  ? 'अपने पर्चे और रिपोर्ट यहाँ अपलोड करें — वे सुरक्षित रूप से संग्रहीत होते हैं।'
                  : 'Upload your prescriptions and reports here — they are securely stored.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDocs.map(doc => (
                <div
                  key={doc.id}
                  className="card-navy hover:border-navy-750 transition-all flex flex-col gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-card bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="bg-navy-950 border border-navy-800 px-1.5 py-0.5 rounded text-xs font-medium text-navy-100 uppercase tracking-widest">
                        {doc.type}
                      </span>
                      <h3 className="text-sm font-medium text-navy-50 mt-1 leading-tight truncate">
                        {doc.name}
                      </h3>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="text-accent hover:text-white bg-navy-950 hover:bg-accent rounded-card border border-navy-800 hover:border-accent tactile-btn flex items-center justify-center min-tap"
                        title={t.viewInline}
                        aria-label={`Preview ${doc.name}`}
                      >
                        <Eye size={18} />
                      </button>
                      {canMutate && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${doc.name}?`)) deleteDocument(doc.id);
                          }}
                          className="text-navy-700 hover:text-danger bg-navy-950 hover:bg-danger-light border border-navy-800 hover:border-danger rounded-card tactile-btn flex items-center justify-center min-tap"
                          aria-label={`Delete ${doc.name}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-medium text-navy-100">
                    <div className="flex items-center gap-1.5">
                      <User size={12} className="text-navy-700" />
                      <span className="truncate">{doc.doctor}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-navy-700" />
                      <span>{doc.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Building size={12} className="text-navy-700" />
                      <span className="truncate">{doc.hospital}</span>
                    </div>
                  </div>

                  {doc.medicines && doc.medicines.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-navy-800">
                      {doc.medicines.map((m, i) => (
                        <span
                          key={i}
                          className="bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-md text-xs font-medium text-accent"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 bg-navy-50/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-navy-900 border border-navy-800 rounded-card w-full max-w-3xl h-[90vh] flex flex-col shadow-lifted animate-slide-up"
            role="dialog"
            aria-label={previewDoc.name}
          >
            <div className="p-5 border-b border-navy-800 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-medium text-navy-50 truncate text-lg">{previewDoc.name}</h3>
                <p className="text-sm text-navy-700 mt-1">
                  {previewDoc.doctor} • {previewDoc.hospital} • {previewDoc.date}
                </p>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="text-navy-50 hover:text-accent bg-navy-850 hover:bg-accent/10 border border-navy-800 hover:border-accent rounded-card tactile-btn shrink-0 flex items-center justify-center min-tap"
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 flex items-center justify-center bg-navy-950">
              {previewDoc.fileUrl.startsWith('data:image/') || previewDoc.fileUrl.startsWith('http') ? (
                <img
                  src={previewDoc.fileUrl}
                  alt={previewDoc.name}
                  className="max-w-full max-h-full object-contain rounded-card shadow-lg"
                />
              ) : previewDoc.fileUrl.startsWith('data:application/pdf') ? (
                <iframe
                  src={previewDoc.fileUrl}
                  title={previewDoc.name}
                  className="w-full h-full rounded-card border border-navy-800 bg-white"
                />
              ) : (
                <div className="text-center p-6 text-navy-700">
                  <FileText size={48} className="mx-auto mb-2 opacity-40" />
                  <p className="font-medium">PDF / Complex Format Document</p>
                  <p className="text-xs text-navy-700/70 mt-1">
                    Natively stored base64 structures are active.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
