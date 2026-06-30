<p align="center">
  <span style="font-size:48px">⚡</span>
</p>

<h1 align="center">PULSE — Multilingual Medication Tracker</h1>

<p align="center">
  <em>Your companion, every dose of the way.</em><br/>
  A family-first, AI-powered medication management platform designed for India's elderly — in <strong>9 Indian languages</strong>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black" alt="Firebase" />
  <img src="https://img.shields.io/badge/Sarvam%20AI-STT%20%7C%20TTS%20%7C%20LLM-6C63FF" alt="Sarvam AI" />
  <img src="https://img.shields.io/badge/Gemini-Vision-4285F4?logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/PWA-Installable-5A0FC8?logo=pwa&logoColor=white" alt="PWA" />
</p>

---

## 🩺 What is PULSE?

**PULSE** (Patient Utility for Logged & Scheduled Events) is a Progressive Web App built for India's elderly population and their caregivers. It brings medicines, prescriptions, health reports, and emergency alerts into a single secure, multilingual dashboard — designed for the whole family.

### The Problem

> 70% of elderly Indians manage 3+ chronic medications daily, often in languages their apps don't support. Missed doses lead to hospitalisations. Caregivers — often remote — have no real-time visibility.

### Our Solution

PULSE combines **Sarvam AI** for Indic-language intelligence, **Firebase** for real-time sync, and **Gemini Vision** for handwritten prescription reading — all wrapped in an accessibility-first interface with elder-friendly defaults (large fonts, high-contrast modes, voice-first interactions).

---

## ✨ Key Features

### 💊 Smart Medication Tracking
- **4-slot daily schedule** — Morning, Afternoon, Evening, Night
- **One-tap dose logging** with real-time progress ring
- **Adherence streaks** and 7-day bar charts
- **Next-dose countdown** timer with live clock
- **Multilingual medicine names** — stored in English, translated at render-time via Sarvam Translate

### 📄 Prescription & Document Intelligence
- **Multi-engine OCR pipeline**: Sarvam Document Intelligence → Gemini Vision (handwriting fallback) → Tesseract.js (offline fallback)
- **AI-powered structured extraction** via Sarvam-30b: doctor, hospital, date, and medicines with dosage/frequency/timing
- **PDF and image support** — upload prescriptions, lab reports, and discharge summaries
- **One-click import** — detected medicines auto-populate into the daily schedule

### 🤖 AI Health Assistant (Pulse Assistant)
- **General mode**: Ask about medicines, side effects, drug interactions — powered by Sarvam Chat (saaras model)
- **Document mode**: Select any uploaded report and ask questions about it (RAG-style document Q&A)
- **Voice input/output**: Speak questions via mic → STT → AI response → TTS playback
- **Suggestion chips**: Localised prompt suggestions in Hindi, Tamil, and English

### 🚨 SOS Emergency Pipeline
- **One-tap SOS button** with voice recording for patients
- **Full AI pipeline**: STT → Translation → LLM Triage (urgency scoring: HIGH/MED/LOW) → Firestore write → TTS summary
- **Real-time caregiver alerts**: Banner notifications with audio playback and acknowledge/resolve workflow
- **SOS History Feed**: Chronological timeline for caregivers with urgency badges
- **Audio storage**: Supports base64 (zero-config) and Cloudinary CDN strategies

### 👥 Patient ↔ Caregiver Link System
- **Role-based access**: Patient and Caregiver roles with distinct dashboards
- **Invite code linking**: Patients generate codes, caregivers enter them to link
- **Patient switcher**: Caregivers can view any linked patient's medicines, documents, and adherence
- **Read-only mode**: Caregivers see data but only patients can mutate

### 🗺️ Nearby Care (Map)
- **Leaflet + OpenStreetMap** interactive map showing hospitals, clinics, and pharmacies within 5 km
- **Overpass API** integration for real-time POI data
- **Filter chips**: Filter by hospital, clinic, or pharmacy
- **Click-to-navigate**: Direct Google Maps directions and one-tap calling

### 📅 Appointments Manager
- **Schedule doctor appointments** with date, time, doctor name, hospital, and notes
- **24-hour TTS reminders** — spoken alerts in the patient's language
- **Browser push notifications** for upcoming appointments

### ♿ Accessibility First
- **Theme**: Light, Dark, and High-Contrast modes
- **Font sizes**: Small, Normal, Large (default), Extra-Large — elder-friendly baseline of 18px body text
- **Reduce motion**: Honours OS `prefers-reduced-motion` and provides manual toggle
- **Voice feedback**: Toggle TTS for all AI responses
- **48px minimum tap targets** on all interactive elements
- **Settings persistence** via `localStorage` with instant CSS variable switching

### 🌍 9 Indian Languages
Full UI translations in:

| Language | Code | Script |
|----------|------|--------|
| हिंदी (Hindi) | `hi` | Devanagari |
| தமிழ் (Tamil) | `ta` | Tamil |
| ગુજરાતી (Gujarati) | `gu` | Gujarati |
| मराठी (Marathi) | `mr` | Devanagari |
| తెలుగు (Telugu) | `te` | Telugu |
| বাংলা (Bengali) | `bn` | Bengali |
| ಕನ್ನಡ (Kannada) | `kn` | Kannada |
| മലയാളം (Malayalam) | `ml` | Malayalam |
| English | `en` | Latin |

> Language selection is available from the login screen onwards. All dose reminders, AI responses, and TTS playback respect the selected language.

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 6.0, Vite 8 |
| **Styling** | TailwindCSS 3.4 with CSS variable–driven design tokens |
| **Auth & Database** | Firebase Auth (email/password) + Cloud Firestore |
| **AI — Speech** | Sarvam AI STT (`saarika:v2.5`) & TTS (`bulbul:v2`) |
| **AI — Language** | Sarvam Translate (auto → `en-IN`) + Sarvam Chat (`sarvam-30b`) |
| **AI — Vision** | Google Gemini 2.5 Flash (handwritten prescription OCR) |
| **OCR Fallback** | Tesseract.js 7 (offline, client-side) |
| **PDF Parsing** | pdfjs-dist 6.0 |
| **Maps** | Leaflet 1.9 + OpenStreetMap + Overpass API |
| **Audio Storage** | Base64 in Firestore (default) or Cloudinary (CDN) |
| **PDF Export** | jsPDF 4 |
| **Icons** | Lucide React |
| **PWA** | Web App Manifest + mobile-optimised viewport |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A **Firebase project** with Authentication (email/password) and Firestore enabled
- A **Sarvam AI** API key (for STT, TTS, translation, chat, and document intelligence)
- *(Optional)* A **Google Gemini** API key (for handwritten prescription OCR)
- *(Optional)* A **Cloudinary** account (for CDN-based SOS audio storage)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/pulse-med-tracker.git
cd pulse-med-tracker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Firebase
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# Sarvam AI
VITE_SARVAM_API_KEY=your_sarvam_api_key

# Gemini (optional — enables handwriting OCR fallback)
VITE_GEMINI_API_KEY=your_gemini_api_key

# Audio Storage Strategy: 'base64' (default) or 'cloudinary'
VITE_AUDIO_STORAGE=base64

# Cloudinary (only needed if VITE_AUDIO_STORAGE=cloudinary)
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=your_unsigned_preset
```

### 4. Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 5. Start the Dev Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` and is accessible from your local network for mobile testing.

### 6. Build for Production

```bash
npm run build
npm run preview   # Preview the production build locally
```

---

## 🔒 Security

- **Firebase Auth** handles all authentication (email/password)
- **Firestore Security Rules** enforce:
  - Users can only write their own profile documents
  - SOS events are scoped to linked patient ↔ caregiver pairs
  - Caregiver linking is validated against the patient's `linkedCaregiverIds` array
  - SOS deletion is prohibited (`allow delete: if false`)
- **API keys** are stored in environment variables, never committed to version control
- **`.env` is gitignored** — each developer uses their own keys

---

## 🧪 Demo Mode

Set `VITE_DEMO_MODE=true` in your `.env` to enable demo mode, which:
- Skips real Sarvam AI API calls for the SOS pipeline
- Writes deterministic demo SOS events to Firestore
- Allows testing the full UI flow (banners, history feed, acknowledge) without burning API quota

---

## 📱 PWA Support

PULSE is a Progressive Web App and can be installed on mobile devices:
- **Standalone display** — runs full-screen without browser chrome
- **Portrait orientation** — optimised for one-handed phone use
- **Theme colour** syncs with light/dark mode
- **Offline-ready** — medication data is cached in `localStorage` for offline viewing

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project was built for HackDays 2026. See the repository for license details.

---

<p align="center">
  <strong>⚡ PULSE</strong> — Encrypted by Firebase • Powered by Sarvam AI • Made in India 🇮🇳
</p>
