<div align="center">

# 🧠 R E M
### **Personal Memory System**

*Never forget a responsibility. Never lose a private thought. Never compromise sensitive records.*

[![React Native](https://img.shields.io/badge/React%20Native-0.74+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2051+-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20RLS-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![SQLite](https://img.shields.io/badge/Local%20DB-Expo%20SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://docs.expo.dev/versions/latest/sdk/sqlite/)
[![Platform](https://img.shields.io/badge/Platform-Android%20(Expo%20Go)-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://play.google.com/store/apps/details?id=host.exp.exponent)

<br/>

[Overview](#-overview) •
[Core Modules](#-core-modules) •
[Real-World Use Cases](#-real-world-use-cases) •
[Architecture](#-system-architecture) •
[Roadmap](#-phase-by-phase-roadmap) •
[Security Principles](#-security-principles) •
[Android Testing](#-how-to-test-on-android)

</div>

---

## 📖 Overview

**REM** (Personal Memory System) is an **offline-first**, privacy-centric personal assistant designed to be your external cognitive brain. It allows you to quickly log urgent tasks with alarms, track everyday habits, maintain confidential notes with an undo/trash safety net, and securely preserve vital identity credentials behind biometric lock.

> ⚡ **Offline-First by Design**: Built to ensure that adding a task or retrieving a note operates with instantaneous local latency. Cloud sync happens quietly in the background when connectivity is available.

---

## 🧩 Core Modules

<table>
  <tr>
    <td width="50%">
      <h3>⚡ 1. Task Management</h3>
      <p>Instantaneous capture of one-off tasks with precise date, time, and completion state. Never miss a spontaneous errand.</p>
    </td>
    <td width="50%">
      <h3>⏰ 2. Smart Local Notifications</h3>
      <p>On-device alarms and notification banners scheduled directly through Android's notification subsystem. Works completely offline.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🔁 3. Recurring Task Engine</h3>
      <p>Automated recurrence generator for habits and weekly rituals (e.g. daily gym, coding drills, Wednesday contests) with enable/disable toggles.</p>
    </td>
    <td width="50%">
      <h3>📝 4. Private Notes & Trash Safety Net</h3>
      <p>Encrypted personal notes with rich categorization, instant local full-text search, and a 30-day soft-delete trash recovery bin.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🛡️ 5. Personal Document Vault</h3>
      <p>Dynamic schemas for national IDs (Aadhaar, PAN, Driving License, Custom fields) locked behind Biometric (Fingerprint/Face) and device PIN authentication.</p>
    </td>
    <td width="50%">
      <h3>🔐 6. Supabase Cloud Sync & RLS</h3>
      <p>Multi-tenant isolated backup powered by PostgreSQL Row Level Security (RLS). Every record belongs exclusively to your authenticated identity.</p>
    </td>
  </tr>
</table>

---

## 🎯 Real-World Use Cases

<details open>
<summary><b>1. Spontaneous Errand (Frictionless Quick-Capture)</b></summary>
<br>

> **Scenario**: In the morning, your mother says: *"Buy ice cream for me in the evening."*

```text
┌─────────────────────────────────────────────────────────────┐
│  ➕ New Quick Task                                          │
│  ─────────────────────────────────────────────────────────  │
│  Title   : Buy ice cream for mom                            │
│  Date    : Today                                            │
│  Time    : 06:00 PM                                         │
│  Action  : [ Schedule Alarm ]                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        [ 06:00 PM ] 🔔 Android System Notification Fires:
        "REM: Buy ice cream for mom"
                              │
                              ▼
        [ Tap ] ➜ Mark Complete ➜ Stored in Local History
```
</details>

<details open>
<summary><b>2. Recurring Habits & Routine Responsibilities</b></summary>
<br>

* 🏋️ **Gym**: Scheduled every day
* 💻 **Solve coding problems**: Scheduled every day
* 📚 **Study session**: Scheduled every day
* 🏆 **Coding contest**: Every Wednesday at 8:00 PM
* 🚀 **Weekly project milestone**: Every weekend

*Each recurring rule automatically activates its task instance on schedule and can be paused, modified, or deleted at any time.*
</details>

<details open>
<summary><b>3. Secure Dynamic Document Vault</b></summary>
<br>

Flexible, encrypted identity records with customizable schemas:

| Document | Pre-configured Fields | Privacy & Protection |
| :--- | :--- | :--- |
| **Aadhaar** | • Aadhaar Number<br>• Full Name<br>• Date of Birth | 🔒 Hardware-backed encryption via `expo-secure-store` |
| **PAN Card** | • PAN Number<br>• Full Name | 🔒 Biometric / Device PIN challenge required to view |
| **Driving License** | • License Number<br>• Name<br>• Date of Birth<br>• Valid From & Until | 🔒 Zero unencrypted cloud transmission |
| **Custom ID** | • Custom user-defined key-value attributes | 🔒 Strictly zero CVV storage allowed |

</details>

---

## 🏗️ System Architecture

```
                                  USER INTERFACE
         ┌──────────────────────────────────────────────────────────────┐
         │     Tasks  │  Recurring  │  Notes  │  Vault  │  Settings     │
         └──────────────────────────────┬───────────────────────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             │                                                     │
             ▼ (Structured Data)                                   ▼ (Secrets & Keys)
 ┌───────────────────────────┐                         ┌───────────────────────────┐
 │     Local Database        │                         │      Secure Storage       │
 │      `expo-sqlite`        │                         │    `expo-secure-store`    │
 │ (Tasks, Notes, Vault Meta)│                         │ (Auth Token, Vault Keys)  │
 └─────────────┬─────────────┘                         └───────────────────────────┘
               │
               ▼ (Mutation Queue)
 ┌───────────────────────────┐
 │    Local Sync Worker      │ ◄────── [ NetInfo Connection Listener ]
 │   • Conflict Resolution   │
 │   • Replay Dirty Changes  │
 └─────────────┬─────────────┘
               │ (When Online)
               ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                         SUPABASE CLOUD BACKEND                          │
 │  ┌─────────────────────────┐            ┌────────────────────────────┐  │
 │  │      Supabase Auth      │            │   PostgreSQL + RLS         │  │
 │  │ (Email & Password JWT)  │            │ (auth.uid() = row.user_id) │  │
 │  └─────────────────────────┘            └────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Principles

> [!IMPORTANT]
> **Strict CVV Exclusion Policy**: Payment card CVV values are forbidden. Under no circumstance will the application collect, process, or persist card verification codes.

> [!NOTE]
> **Row Level Security (RLS)**: Every table in Supabase enforces strict isolation. An authenticated user can only access rows where `user_id = auth.uid()`. Service-role keys are strictly never bundled in the app.

> [!TIP]
> **Biometric Gate**: Opening the Document Vault triggers a biometric (Fingerprint / Face Unlock / PIN) challenge using `expo-local-authentication`.

---

## 🗺️ Phase-by-Phase Roadmap

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6 ──► Phase 7 ──► Phase 8
Foundation     Auth        Tasks     Recurrence    Notes       Vault       Sync      Hardening
```

| Phase | Module / Goal | Status | Scope |
| :---: | :--- | :---: | :--- |
| **01** | **Foundation & Setup** | 🟡 `Ready` | • Initialize Expo TypeScript project<br>• Establish design system & dark mode tokens<br>• Local SQLite setup & tab navigation shell<br>• Verify mobile boot on Android via Expo Go |
| **02** | **Authentication** | ⚪ `Planned` | • Supabase Auth client configuration<br>• Sign Up, Login, Logout, Forgot Password flows<br>• Secure token persistence via `expo-secure-store`<br>• Offline cached session fallback |
| **03** | **Offline Tasks & Alarms** | ⚪ `Planned` | • SQLite Task schema & CRUD UI<br>• Quick-add flow ("Buy ice cream for mom")<br>• Android notifications using `expo-notifications`<br>• Task history & completion tracking |
| **04** | **Recurring Task Engine** | ⚪ `Planned` | • Recurrence rules (Daily, Weekly, Custom days)<br>• Automated active instance materialization<br>• Rule management: enable, disable, edit, delete |
| **05** | **Private Notes & Trash** | ⚪ `Planned` | • Notes schema, categories & search index<br>• Rich note editor & instant search<br>• Soft-delete trash bin with 30-day restore |
| **06** | **Document Vault** | ⚪ `Planned` | • Dynamic schemas (Aadhaar, PAN, DL, custom fields)<br>• Biometric / PIN protection via `expo-local-authentication`<br>• Client-side encryption & zero CVV policy |
| **07** | **Cloud Synchronization** | ⚪ `Planned` | • Supabase database tables & RLS policies<br>• Offline mutation queue with auto-retry on reconnect<br>• Timestamp-based conflict resolution |
| **08** | **Settings & Polish** | ⚪ `Planned` | • Data export/import (JSON backup)<br>• Global app lock preference<br>• Production Android performance tuning |

---

## 📱 How to Test on Android

### Prerequisites
1. Install **Expo Go** from the [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent) on your physical Android phone.
2. Connect your phone and PC to the same local Wi-Fi network.

### Execution Steps
```bash
# 1. Install dependencies
npm install

# 2. Start the Expo development server
npx expo start

# 3. If running across different network subnets or hotspots:
npx expo start --tunnel
```

4. Open **Expo Go** on your Android phone and tap **Scan QR Code**.
5. Point the camera at the terminal QR code to launch **REM** immediately.

---

## 🛠️ Tech Stack Reference

* **Framework**: React Native + Expo (Managed Workflow)
* **Language**: TypeScript
* **Database (Local)**: `expo-sqlite`
* **Secure Storage**: `expo-secure-store`
* **Local Notifications**: `expo-notifications`
* **Biometrics**: `expo-local-authentication`
* **Backend**: Supabase (PostgreSQL + Auth + Storage)
* **Target Environment**: Android (Physical Device)

---

<div align="center">
  <sub>Built with precision for personal productivity, memory retention, and utmost security.</sub>
</div>
