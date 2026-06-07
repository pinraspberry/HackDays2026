import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, addDoc, doc, setDoc, query, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from './FirebaseContext';
import { SarvamService } from '../services/sarvamService';

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  timing: ('morning' | 'afternoon' | 'evening' | 'night')[];
  startDate: string;
  instructions: string;
}

export interface DoseLog {
  medId: string;
  medName: string;
  dosage: string;
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night';
  taken: boolean;
  takenAt?: string; // Time string
}

export interface MedDocument {
  id: string;
  name: string;
  type: 'prescription' | 'report' | 'summary';
  date: string;
  doctor: string;
  hospital: string;
  medicines: string[];
  fileUrl: string; // Base64 or local image URL to view inline!
  googleDriveId?: string;
  isSynced?: boolean;
  extractedText?: string;
  uploadedAt?: any;
  processedAt?: any;
}

interface MedicationContextType {
  medications: Medication[];
  logs: Record<string, Record<string, DoseLog>>; // date -> "medId_slot" -> DoseLog
  documents: MedDocument[];
  addMedication: (med: Omit<Medication, 'id'>) => Promise<void>;
  deleteMedication: (id: string) => Promise<void>;
  updateMedication: (med: Medication) => Promise<void>;
  toggleDose: (date: string, medId: string, slot: 'morning' | 'afternoon' | 'evening' | 'night') => Promise<void>;
  addDocument: (docData: Omit<MedDocument, 'id'>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  streak: number;
  adherenceRate: number;
  
}

const MedicationContext = createContext<MedicationContextType | undefined>(undefined);

// Initial mock data to look stunning at first load for judges!
/*const INITIAL_MEDICATIONS: Medication[] = [
  {
    id: 'med-1',
    name: 'Aspirin (150mg)',
    dosage: '1 Tablet',
    frequency: 'Once Daily',
    timing: ['morning'],
    startDate: new Date().toISOString().split('T')[0],
    instructions: 'After breakfast'
  },
  {
    id: 'med-2',
    name: 'Metformin (500mg)',
    dosage: '1 Tablet',
    frequency: 'Twice Daily',
    timing: ['morning', 'night'],
    startDate: new Date().toISOString().split('T')[0],
    instructions: 'With meals'
  },
  {
    id: 'med-3',
    name: 'Multivitamin',
    dosage: '1 Capsule',
    frequency: 'Once Daily',
    timing: ['afternoon'],
    startDate: new Date().toISOString().split('T')[0],
    instructions: 'After lunch'
  }
];*/

/*const INITIAL_DOCUMENTS: MedDocument[] = [
  {
    id: 'doc-1',
    name: 'AIIMS Cardiology Prescription',
    type: 'prescription',
    date: '2026-05-28',
    doctor: 'Dr. R. K. Sharma',
    hospital: 'AIIMS, New Delhi',
    medicines: ['Aspirin', 'Metformin', 'Atorvastatin'],
    fileUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="%23F8FAFC"/><rect x="40" y="40" width="520" height="720" fill="none" stroke="%230F172A" stroke-width="2"/><text x="80" y="100" font-family="Outfit, sans-serif" font-size="28" font-weight="bold" fill="%230F172A">AIIMS CARDIOLOGY DEPT</text><text x="80" y="130" font-family="sans-serif" font-size="16" fill="%23475569">Dr. R. K. Sharma | Cardiology Specialists</text><line x1="80" y1="160" x2="520" y2="160" stroke="%23CBD5E1" stroke-width="2"/><text x="80" y="200" font-family="Outfit, sans-serif" font-weight="bold" font-size="20">Rx</text><text x="80" y="240" font-family="sans-serif" font-size="18">1. Tab. Aspirin (150mg) - 1 Daily after Breakfast</text><text x="80" y="280" font-family="sans-serif" font-size="18">2. Tab. Metformin (500mg) - Twice Daily with meals</text><text x="80" y="320" font-family="sans-serif" font-size="18">3. Tab. Atorvastatin (10mg) - 1 Daily at Night</text><line x1="80" y1="700" x2="200" y2="700" stroke="%23475569" stroke-width="1"/><text x="80" y="720" font-family="sans-serif" font-size="12" fill="%23475569">Authorized Signature</text></svg>'
  }
];*/

export const MedicationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { db, user, isFirebaseActive } = useFirebase();
  // settings not needed here after removing JSON backup helpers
  const [medications, setMedications] = useState<Medication[]>([]);
  const [logs, setLogs] = useState<Record<string, Record<string, DoseLog>>>({});
  const [documents, setDocuments] = useState<MedDocument[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [adherenceRate, setAdherenceRate] = useState<number>(100);

  // Load Initial Data
  useEffect(() => {
    if (isFirebaseActive && db && user) {
      // Connect to Firestore collections
      const medQuery = query(collection(db, `users/${user.uid}/medications`));
      const unsubscribeMeds = onSnapshot(medQuery, (snapshot) => {
        const meds: Medication[] = [];
        snapshot.forEach((doc) => {
          meds.push({ id: doc.id, ...doc.data() } as Medication);
        });
        
        // If Firestore is empty, initialize with beautiful defaults
        if (meds.length === 0) {
          setMedications([]);
        }
      });

      const docsQuery = query(collection(db, `users/${user.uid}/documents`));
      const unsubscribeDocs = onSnapshot(docsQuery, (snapshot) => {
        const docsList: MedDocument[] = [];
        snapshot.forEach((doc) => {
          docsList.push({ id: doc.id, ...doc.data() } as MedDocument);
        });
        setDocuments(docsList);
      });

      const logsQuery = query(collection(db, `users/${user.uid}/logs`));
      const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
        const fetchedLogs: Record<string, Record<string, DoseLog>> = {};
        snapshot.forEach((doc) => {
          const date = doc.id;
          fetchedLogs[date] = doc.data() as Record<string, DoseLog>;
        });
        setLogs(fetchedLogs);
      });

      return () => {
        unsubscribeMeds();
        unsubscribeDocs();
        unsubscribeLogs();
      };
    } else {
      // Fallback local storage
      const localMeds = localStorage.getItem('pulse_medications');
      if (localMeds) {
        setMedications(JSON.parse(localMeds));
      } else {
        setMedications([]);
        localStorage.setItem('pulse_medications', JSON.stringify([]));
      }

      /*const localDocs = localStorage.getItem('pulse_documents');
      if (localDocs) {
        setDocuments(JSON.parse(localDocs));
      } else {
        setDocuments(INITIAL_DOCUMENTS);
        localStorage.setItem('pulse_documents', JSON.stringify(INITIAL_DOCUMENTS));
      }*/

      const localLogs = localStorage.getItem('pulse_logs');
      if (localLogs) {
        setLogs(JSON.parse(localLogs));
      } else {
        setLogs({})
      }
    }
  }, [isFirebaseActive, db, user]);

  // Recalculate Streak & Adherence on state changes
  useEffect(() => {
    calculateAdherenceAndStreaks();
  }, [medications, logs]);

  const calculateAdherenceAndStreaks = () => {
    if (medications.length === 0) {
      setAdherenceRate(100);
      setStreak(0);
      return;
    }

    const today = new Date();
    let computedStreak = 0;

    // 1. Calculate Streak
    // Count backward from today (or yesterday) to see how many consecutive days all scheduled doses were taken
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayLog = logs[dateStr] || {};

      // Find medications scheduled for this day
      // (For this mock calculation, we assume all meds are scheduled daily)
      let activeMedsScheduled = medications.filter(m => m.startDate <= dateStr);
      if (activeMedsScheduled.length === 0) continue;

      let totalDosesForDay = 0;
      let takenDosesForDay = 0;

      activeMedsScheduled.forEach(m => {
        m.timing.forEach(slot => {
          totalDosesForDay++;
          if (dayLog[`${m.id}_${slot}`]?.taken) {
            takenDosesForDay++;
          }
        });
      });

      if (totalDosesForDay > 0) {
        if (takenDosesForDay === totalDosesForDay) {
          computedStreak++;
        } else {
          // If today has some scheduled doses remaining, don't break streak if they are taken so far.
          // Otherwise, break streak if any previous day was missed.
          if (i > 0) {
            break;
          }
        }
      }
    }

    setStreak(computedStreak);

    // 2. Calculate Adherence Rate over past 7 days
    let totalDoses7Days = 0;
    let takenDoses7Days = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayLog = logs[dateStr] || {};

      const activeMeds = medications.filter(m => m.startDate <= dateStr);

      activeMeds.forEach(m => {
        m.timing.forEach(slot => {
          totalDoses7Days++;
          if (dayLog[`${m.id}_${slot}`]?.taken) {
            takenDoses7Days++;
          }
        });
      });
    }

    const rate = totalDoses7Days > 0 ? Math.round((takenDoses7Days / totalDoses7Days) * 100) : 100;
    setAdherenceRate(rate);
  };

  const addMedication = async (med: Omit<Medication, 'id'>) => {
    if (isFirebaseActive && db && user) {
      await addDoc(collection(db, `users/${user.uid}/medications`), med);
    } else {
      const newMed: Medication = {
        id: 'med_' + Math.random().toString(36).substr(2, 9),
        ...med
      };
      const updated = [...medications, newMed];
      setMedications(updated);
      localStorage.setItem('pulse_medications', JSON.stringify(updated));
    }
  };

  const deleteMedication = async (id: string) => {
    if (isFirebaseActive && db && user) {
      // Logic for Firebase Delete
    } else {
      const updated = medications.filter(m => m.id !== id);
      setMedications(updated);
      localStorage.setItem('pulse_medications', JSON.stringify(updated));
    }
  };

  const updateMedication = async (med: Medication) => {
    if (isFirebaseActive && db && user) {
      // Firebase update
    } else {
      const updated = medications.map(m => m.id === med.id ? med : m);
      setMedications(updated);
      localStorage.setItem('pulse_medications', JSON.stringify(updated));
    }
  };

  const toggleDose = async (date: string, medId: string, slot: 'morning' | 'afternoon' | 'evening' | 'night') => {
    const today = new Date();
    const timeStr = today.toTimeString().split(' ')[0].substr(0, 5); // HH:MM

    const med = medications.find(m => m.id === medId);
    const medName = med ? med.name : 'Unknown Medicine';
    const dosage = med ? med.dosage : '1 dose';

    if (isFirebaseActive && db && user) {
      const currentLogRef = doc(db, `users/${user.uid}/logs`, date);
      const dayLog = logs[date] || {};
      const key = `${medId}_${slot}`;
      const isCurrentlyTaken = !!dayLog[key]?.taken;

      const newLogVal: DoseLog = {
        medId,
        medName,
        dosage,
        timeSlot: slot,
        taken: !isCurrentlyTaken,
        takenAt: !isCurrentlyTaken ? timeStr : undefined
      };

      const updatedDayLog = { ...dayLog, [key]: newLogVal };
      await setDoc(currentLogRef, updatedDayLog);
    } else {
      const dayLog = logs[date] || {};
      const key = `${medId}_${slot}`;
      const isCurrentlyTaken = !!dayLog[key]?.taken;

      const newLogVal: DoseLog = {
        medId,
        medName,
        dosage,
        timeSlot: slot,
        taken: !isCurrentlyTaken,
        takenAt: !isCurrentlyTaken ? timeStr : undefined
      };

      const updatedLogs = {
        ...logs,
        [date]: {
          ...dayLog,
          [key]: newLogVal
        }
      };

      setLogs(updatedLogs);
      localStorage.setItem('pulse_logs', JSON.stringify(updatedLogs));
    }
  };
  
  const addDocument = async (docData: Omit<MedDocument, 'id'>) => {
  if (isFirebaseActive && db && user) {
    console.log('addDocument called (firebase)');
    console.log('isFirebaseActive =', isFirebaseActive);
    console.log('db =', db);
    console.log('user =', user?.uid);

    try {
      const ref = await addDoc(
        collection(db, `users/${user.uid}/documents`),
        {
          ...docData,
          uploadedAt: serverTimestamp(),
        }
      );

      console.log('Firestore doc created:', ref.id);

      await setDoc(
        doc(db, `users/${user.uid}/documents`, ref.id),
        {
          extractedText: docData.extractedText || '',
          documentType: docData.type,
          processedAt: serverTimestamp(),
        },
        { merge: true }
      );

      console.log(
        'Saved extractedText length:',
        docData.extractedText?.length || 0
      );
    } catch (err) {
      console.error('Error saving document to Firestore:', err);
    }

  } else {
    console.log('addDocument called (local)');

    const newDoc: MedDocument = {
      id: 'doc_' + Math.random().toString(36).substr(2, 9),
      ...docData,
      extractedText: docData.extractedText || '',
      uploadedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };

    const updated = [newDoc, ...documents];
    setDocuments(updated);
    localStorage.setItem(
      'pulse_documents',
      JSON.stringify(updated)
    );
  }
};

  const deleteDocument = async (id: string) => {
    if (isFirebaseActive && db && user) {
      try {
        const { deleteDoc, doc } = await import('firebase/firestore');

        await deleteDoc(
          doc(db, `users/${user.uid}/documents/${id}`)
      );

      console.log("DOCUMENT DELETED:", id);
    } catch (err) {
      console.error("DELETE FAILED:", err);
    }
  } else {
    const updated = documents.filter(d => d.id !== id);

    setDocuments(updated);

    localStorage.setItem(
      'pulse_documents',
      JSON.stringify(updated)
    );
  }
};
  

  return (
    <MedicationContext.Provider value={{
      medications,
      logs,
      documents,
      addMedication,
      deleteMedication,
      updateMedication,
      toggleDose,
      addDocument,
      deleteDocument,
      streak,
      adherenceRate,
      
    }}>
      {children}
    </MedicationContext.Provider>
  );
};

export const useMedication = () => {
  const context = useContext(MedicationContext);
  if (!context) throw new Error('useMedication must be used within MedicationProvider');
  return context;
};
