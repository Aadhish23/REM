# REM (Personal Memory System)

> **REM** stands for Personal Memory System — a secure, offline-first mobile application built with React Native and Expo to help remember responsibilities, manage recurring tasks, capture private notes, and securely store critical personal documents.

---

## 1. Vision & Core Requirements

REM is designed primarily as a personal memory companion that operates reliably with or without internet connectivity.

### Major Modules
1. **Task Management**: Frictionless task creation, time-based reminders, and completion tracking.
2. **Reminders & Local Notifications**: On-device alarms/notifications triggered at the exact requested time (e.g., "Buy ice cream for mom today at 6:00 PM").
3. **Recurring Tasks**: Automatic schedule-based task activation (Daily gym, daily coding, weekly contest every Wednesday, etc.) with enable/disable/edit capabilities.
4. **Private Notes**: Categorized, searchable private notes with a dedicated Trash/Recovery mechanism to safeguard against accidental deletion.
5. **Secure Personal Document Vault**: Dynamic document schemas (Aadhaar, PAN, Driving License, custom fields) protected by biometric authentication / device PIN. **Strict policy: Payment card CVVs are NEVER stored.**
6. **Authentication**: Supabase-powered email/password authentication (Sign up, Login, Logout, Forgot password, Reset password) with isolated user data.
7. **Offline-First Functionality**: All critical operations write immediately to local storage (`expo-sqlite`). The user experience is never blocked by network latency or network failure.
8. **Cloud Synchronization**: Bidirectional synchronization with Supabase PostgreSQL using conflict resolution and offline mutation queues.
9. **Strong Security**: Supabase Row Level Security (RLS) enforcement (`auth.uid() = user_id`), encrypted local storage for secrets (`expo-secure-store`), and zero service-role keys exposed in client apps.
10. **Settings & Account Management**: Profile preferences, data backup/export, and security lock settings.

---

## 2. Technology Stack

* **Mobile Framework**: React Native with [Expo](https://expo.dev/) (Managed workflow, TypeScript)
* **Target OS**: Android (Testable directly via Expo Go or Android APK/development builds)
* **Local Database**: `expo-sqlite` (High performance, ACID compliant local SQL database)
* **Secure Storage**: `expo-secure-store` (Hardware-backed encrypted storage for tokens and vault keys)
* **Notifications**: `expo-notifications` (Android local scheduled notifications)
* **Biometrics**: `expo-local-authentication` (Fingerprint, Face Unlock, Device PIN)
* **Backend & Cloud Database**: [Supabase](https://supabase.com/) (PostgreSQL with Row Level Security)
* **Authentication**: Supabase Auth (Email + Password)

---

## 3. Architecture & Design Principles

```
  ┌───────────────────────────────────────────────────────────────┐
  │                           REM UI                              │
  │     (Tasks / Reminders / Notes / Vault / Auth / Settings)     │
  └──────────────────────────────┬────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌────────────────────┐          ┌────────────────────┐
       │   Local Storage    │          │   Secure Storage   │
       │   (`expo-sqlite`)  │          │(`expo-secure-store`)│
       │  Tasks/Notes/Vault │          │ Tokens/Vault Keys  │
       └─────────┬──────────┘          └────────────────────┘
                 │ (Offline First)
                 ▼
       ┌────────────────────┐
       │   Sync Engine      │ ◄─────── Network State Listener
       │ (Queue & Conflict) │
       └─────────┬──────────┘
                 │ (When Online)
                 ▼
       ┌────────────────────┐
       │   Supabase Cloud   │
       │ (PostgreSQL + RLS) │
       └────────────────────┘
```

### Key Architectural Guidelines
1. **Offline-First by Default**: The local database is the single source of truth for UI rendering. Network calls happen asynchronously in the background.
2. **Strict RLS Isolation**: Every table in Supabase must have RLS enabled with policies matching `user_id = auth.uid()`.
3. **No CVV Storage**: Payment card CVV values are forbidden from entering any form, schema, state, or database.
4. **Biometric Vault Gate**: The Document Vault requires re-authentication (biometrics or PIN) before decrypting/viewing records.
5. **Trash & Recovery**: Notes and documents support soft deletion (`deleted_at` timestamp) with a 30-day recovery window before permanent purge.

---

## 4. Phase-by-Phase Development Roadmap

Development follows a strict phased approach. Each phase is fully tested before proceeding to the next.

| Phase | Milestone | Scope |
| :--- | :--- | :--- |
| **Phase 1** | **Project Foundation & Baseline Setup** | • Initialize Expo React Native TypeScript project<br>• Configure styling & design system tokens (Dark/Light mode)<br>• Set up local database abstraction layer (`expo-sqlite`)<br>• Verify build and boot on physical Android phone |
| **Phase 2** | **Authentication & Session Management** | • Supabase client initialization (anonymized config)<br>• Email & Password Sign Up, Login, Logout, Password Reset flows<br>• Secure token persistence with `expo-secure-store`<br>• Offline cached session fallback |
| **Phase 3** | **Offline Task Management & Reminders** | • Task database schema (CRUD, dates, times, priorities)<br>• Quick-entry UI (e.g. "Buy ice cream for mom today at 6:00 PM")<br>• Android scheduled push notifications using `expo-notifications`<br>• Completion toggle and history |
| **Phase 4** | **Recurring Tasks Engine** | • Recurrence rules schema (Daily, Weekly by day, Monthly)<br>• Recurring task evaluator (materializes active instances)<br>• Rule management: enable, disable, edit, delete |
| **Phase 5** | **Private Notes with Trash & Recovery** | • Notes schema with tags and categories<br>• Markdown/rich note editor and fast local search<br>• Soft-delete trash bin with restore and permanent delete |
| **Phase 6** | **Personal Document Vault & Biometrics** | • Dynamic document schemas (Aadhaar, PAN, Driving License, Custom)<br>• Client-side encryption & `expo-local-authentication` gate<br>• Secure document viewer/editor |
| **Phase 7** | **Cloud Synchronization & Supabase RLS** | • Supabase SQL schemas with Row Level Security<br>• Bidirectional sync worker with offline change-log queue<br>• Conflict resolution based on timestamps |
| **Phase 8** | **Settings, Data Export & Hardening** | • Data backup and JSON export/import<br>• App-wide biometric lock option<br>• Production release optimizations for Android |

---

## 5. Development Principles for Every Phase

1. **Inspect First**: Check existing code and dependencies before introducing changes.
2. **Explain**: Clearly summarize what is being added or modified.
3. **Phase-Bound**: Make only the changes required for the current phase.
4. **Preserve Working Code**: Avoid unnecessary rewrites.
5. **Maintain Clean Architecture**: Modular components, typed interfaces, and separation of concerns.
6. **Verify & Test**: Validate each phase through automated checks and local runs.
7. **Android Verification**: Provide step-by-step instructions to run and test on a physical Android device.
8. **Zero Feature Creep**: Do not silently introduce unrequested functionality.

---

## 6. How to Test on an Android Phone

### Prerequisites
* Install the **Expo Go** app from the Google Play Store on your Android phone.
* Ensure your phone and computer are connected to the same Wi-Fi network (or use Tunnel mode).

### Running the App
1. Install project dependencies:
   ```bash
   npm install
   ```
2. Start the Expo development server:
   ```bash
   npx expo start
   ```
3. Scan the QR code displayed in the terminal using the **Expo Go** app on your Android phone.
4. If testing across different subnets or behind a firewall, run with tunnel mode:
   ```bash
   npx expo start --tunnel
   ```
