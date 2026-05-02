// Doctor profile (full profile from /doctor/profile)
export interface DoctorProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  registration_no: string;
  profile_photo?: string | null;
  gender?: string | null;
  about?: string | null;
  specialization?: string | null;
  experience_years?: number | null;
  qualifications?: string[];
  languages?: string[];
  clinic_name?: string | null;
  city?: string | null;
  clinic_address?: string | null;
  clinic_phone?: string | null;
  available_modes?: ("online" | "walk_in")[];
  online_fee?: number | null;
  walkin_fee?: number | null;
  signature_url?: string | null;
  verification_status: "pending" | "approved" | "rejected";
  is_admin: boolean;
  is_suspended: boolean;
  profile_complete: boolean;
  totp_enabled?: boolean;
  role?: string;
}

export interface DoctorProfileUpdate {
  full_name?: string;
  phone?: string;
  gender?: string;
  about?: string;
  specialization?: string;
  experience_years?: number;
  qualifications?: string[];
  languages?: string[];
  available_modes?: ("online" | "walk_in")[];
  online_fee?: number;
  walkin_fee?: number;
}

// Doctor stats from /doctor/stats
export interface DoctorStats {
  today_appointments: number;
  upcoming_7d_confirmed: number;
  total_appointments: number;
  status_counts_30d: {
    confirmed: number;
    completed: number;
    cancelled: number;
    no_show: number;
    pending_payment: number;
  };
  paid_revenue_30d: number;
  generated_at: string;
}

// Doctor appointment (from /doctor/appointments?day=...)
export interface DoctorAppointment {
  appointment_id: string;
  scheduled_at: string;
  duration_min: number;
  mode: "online" | "walk_in";
  fee: number;
  status: "pending_payment" | "confirmed" | "completed" | "cancelled" | "no_show";
  prescription_status?: "none" | "draft" | "final";
  appointment_type: "new" | "follow_up";
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  is_follow_up_eligible: boolean;
  follow_up_eligible_until?: string | null;
  payment_choice: "pay_now" | "pay_at_clinic";
  payment_status: "unpaid" | "pending" | "paid" | "transferred" | "refunded" | "failed";
  refund_status: "none" | "pending" | "processed" | "failed";
  video_enabled: boolean;
  call_status: "idle" | "waiting" | "connected" | "disconnected" | "ended";
  call_participant_count?: number;
  call_participants?: { role: string; identity: string }[];
  patient: {
    id: string;
    full_name: string;
    age?: number | null;
    sex?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  created_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
}

// Availability
export interface TimeRange {
  start: string; // "HH:MM"
  end: string;
}

export interface WeeklySchedule {
  mon: TimeRange[];
  tue: TimeRange[];
  wed: TimeRange[];
  thu: TimeRange[];
  fri: TimeRange[];
  sat: TimeRange[];
  sun: TimeRange[];
}

export interface DoctorAvailability {
  _id?: string;
  doctor_id?: string;
  slot_duration_min: 10 | 20 | 30;
  timezone: string;
  weekly: WeeklySchedule;
}

// Availability exception
export interface AvailabilityException {
  id: string;
  date: string;
  status: "blocked" | "available";
  time_slots?: TimeRange[];
  reason?: string | null;
  apply_status: "processing" | "completed" | "failed";
  impacted: number | null;
  rescheduled: number | null;
  cancelled: number | null;
}

// Prescription
export interface RxItem {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface PrescriptionPayload {
  chief_complaints?: string;
  diagnosis?: string;
  advice?: string;
  items: RxItem[];
}

export interface Prescription {
  rx_id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  status: "draft" | "final";
  is_draft: boolean;
  version: number;
  pdf_url?: string | null;
  chief_complaints?: string;
  diagnosis?: string;
  advice?: string;
  items: RxItem[];
  patient_info: {
    name: string;
    age?: number;
    sex?: string;
    phone?: string;
    email?: string;
  };
  doctor_info: {
    full_name: string;
    clinic_name?: string;
    registration_no?: string;
    qualifications?: string[];
    signature_url?: string;
  };
  created_at: string;
  updated_at?: string;
}

export interface PrescriptionTemplate {
  id: string;
  name: string;
  doctor_id?: string;
  payload: PrescriptionPayload;
  created_at?: string;
  updated_at?: string;
}

export interface DoctorAppointmentDetail extends DoctorAppointment {
  doctor_id: string;
  updated_at?: string | null;
  confirmed_at?: string | null;
  no_show_at?: string | null;
  rescheduled_at?: string | null;
  rescheduled_from?: string | null;
  cancelled_by_id?: string | null;
  video_room?: string | null;
  patient: DoctorAppointment["patient"] & {
    notes?: string | null;
  };
  review?: {
    rating: number;
    comment?: string;
    created_at: string;
  } | null;
  doctor: {
    id?: string | null;
    full_name?: string | null;
    specialization?: string | null;
    clinic_name?: string | null;
    city?: string | null;
  };
}

// Patient (doctor's patient list)
export interface DoctorPatient {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  sex?: string | null;
  created_at?: string;
}

// Video call token
export interface VideoTokenResponse {
  provider: string;
  server_url: string;
  room: string;
  token: string;
}

// Call status type (shared across all appointment types)
export type CallStatus = "idle" | "waiting" | "connected" | "disconnected" | "ended";

// Waiting patient (from heartbeat presence or call_status="waiting")
export interface WaitingPatient {
  appointment_id: string;
  patient_name: string;
  patient_id?: string;
  scheduled_at: string;
  waiting_since?: string;
  call_status?: CallStatus;
}

// Dashboard response from GET /doctor/calls/dashboard
export interface CallsDashboardItem {
  appointment_id: string;
  patient_name: string;
  scheduled_at: string | null;
  duration_min: number | null;
  call_status: CallStatus;
  call_participant_count: number;
  call_participants: { role: string; identity: string }[];
  call_connected_at: string | null;
  call_disconnected_at?: string | null;
  waiting_since?: string | null;
  status: string;
  payment_status: string | null;
}

export interface CallsDashboardResponse {
  doctor_id: string;
  day: string;
  waiting: CallsDashboardItem[];
  active: CallsDashboardItem[];
  disconnected: CallsDashboardItem[];
  scheduled: CallsDashboardItem[];
  counts: {
    waiting: number;
    active: number;
    disconnected: number;
    scheduled: number;
  };
}

export interface DoctorNotification {
  id: string;
  type: "booked" | "cancelled" | "rescheduled";
  appointment_id: string;
  patient_name: string;
  scheduled_at?: string | null;
  event_at: string;
  title: string;
  message: string;
}
