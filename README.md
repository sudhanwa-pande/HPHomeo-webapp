# hpHomeo Frontend

**[View the Backend Architecture Repository Here](https://github.com/sudhanwa-pande/HPHomeo)**

> **Note:** This repository handles the client UI and state. Core logic, database transactions, background queues, and video token provisioning are handled in the backend repository linked above. Please review the backend README for complete system architecture.

---

## Overview

This is the Next.js frontend application for the hpHomeo telemedicine platform. It provides patient booking flows, real-time video consultations, and clinic management dashboards. The application uses token-based magic links for patient access and WebRTC for video rooms.

---

## Architecture

<p align="center">
  <img src="architectural_diagram/hpHomeo%20Frontend%20Architecture.png" alt="Frontend Architecture Diagram" width="850">
</p>

---

## Tech Stack

*   **Framework:** Next.js 16 (App Router), React 19
*   **State Management:** React Query (Server State), Zustand (Client State)
*   **UI Components:** Tailwind CSS, Shadcn UI
*   **Forms & Validation:** React Hook Form, Zod
*   **Video Integration:** LiveKit Components (`@livekit/components-react`)
*   **Payments:** Razorpay JS SDK

---

## Frontend Architecture & Decisions

*   **Rendering Strategy:** Next.js App Router is used to separate public booking pages from interactive dashboards. Public pages use Server-Side Rendering (SSR) where applicable, while dashboards rely on Client-Side Rendering (CSR).
*   **State Separation:** Zustand is strictly used for ephemeral UI and session state (e.g., patient and doctor auth tokens). It utilizes local storage persistence with filtered data to prevent sensitive data exposure. React Query handles all asynchronous server state, caching, and data mutations.
*   **Component Structure:** Built using Radix primitives via Shadcn UI for accessibility. Form inputs are validated on the client using Zod schemas to mirror the Pydantic validation layer on the backend.
*   **Video Flow:** Patient and doctor routes trigger the mounting of LiveKit React components, which connect directly to the LiveKit server for WebRTC media routing.

---

## Getting Started

```bash
git clone https://github.com/sudhanwa-pande/HPHomeo-webapp.git
cd HPHomeo-webapp

npm install

cp .env.example .env.local

npm run dev
```
