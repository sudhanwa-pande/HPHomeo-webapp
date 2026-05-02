// Patient appointment (from /patient/appointments)
export interface PatientAppointment {
  appointment_id: string;
  doctor_id: string;
  doctor_name: string;
  scheduled_at: string;
  duration_min: number;
  mode: "online" | "walk_in";
  status:
    | "pending_payment"
    | "confirmed"
    | "completed"
    | "cancelled"
    | "no_show";
  payment_choice: "pay_now" | "pay_at_clinic";
  payment_status:
    | "unpaid"
    | "pending"
    | "paid"
    | "transferred"
    | "refunded"
    | "failed";
  refund_status: "none" | "pending" | "processing" | "processed" | "failed";
  consultation_fee: number;
  video_enabled: boolean;
  call_status: "idle" | "waiting" | "connected" | "disconnected" | "ended";
  cancel_reason?: string | null;
  cancelled_at?: string | null;
  patient_phone: string;
  patient_name: string;
  patient_email?: string | null;
  appointment_type: "new" | "follow_up";
  follow_up_of_appointment_id?: string | null;
  is_follow_up_eligible: boolean;
  follow_up_eligible_until?: string | null;
  follow_up_used: boolean;
  created_at: string;
  confirmed_at?: string | null;
  completed_at?: string | null;
  no_show_at?: string | null;
  notes?: string | null;
  review?: {
    rating: number;
    comment?: string;
    created_at: string;
  } | null;
  reminder_preferences?: {
    email: boolean;
    whatsapp: boolean;
    timing: string[];
  } | null;
}

export interface PatientAppointmentsResponse {
  items: PatientAppointment[];
  skip: number;
  limit: number;
  count: number;
  upcoming: boolean;
}

// Patient prescription
export interface PatientPrescriptionItem {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface PatientPrescription {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  rx_id: string;
  status: "draft" | "final";
  version: number;
  pdf_url?: string | null;
  created_at: string;
  updated_at?: string | null;
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
    signature_url?: string | null;
  };
  chief_complaints?: string;
  diagnosis?: string;
  advice?: string;
  items: PatientPrescriptionItem[];
}

// Public doctor listing
export interface PublicDoctor {
  doctor_id: string;
  full_name: string;
  profile_photo?: string | null;
  gender?: string | null;
  about?: string | null;
  registration_no?: string | null;
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
  slot_duration_min?: number;
  verification_status: string;
}

// OTP response
export interface OtpRequestResponse {
  message: string;
  retry_after_seconds: number;
  resend_count: number;
}

// Booking response
export interface BookingResponse {
  message: string;
  appointment_id: string;
  status: string;
  payment_choice: string;
  appointment_type: string;
  consultation_fee: number;
}

// Profile update
export interface PatientProfileUpdate {
  full_name?: string;
  email?: string;
  age?: number;
  sex?: string;
}
