// Doctor auth types
export interface Doctor {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  registration_no: string;
  verification_status: "pending" | "approved" | "rejected";
  is_admin: boolean;
  is_suspended?: boolean;
  profile_complete?: boolean;
  role?: string;
  profile_photo?: string | null;
  totp_enabled?: boolean;
}

export interface DoctorLoginResponse {
  message: "authenticated";
  doctor: Doctor;
}

export interface DoctorRegisterResponse {
  message: "registered";
  doctor_id: string;
  verification_status: string;
}

export interface TOTPRequiredResponse {
  step: "totp_required" | "otp_required";
  temp_token: string;
  expires_in_seconds: number;
  otp_channel?: "email";
}

// Patient auth types
export interface PatientUser {
  patient_user_id: string;
  phone: string;
  full_name?: string;
  email?: string;
  age?: number;
  sex?: string;
}

export interface PatientLoginResponse {
  message: "authenticated";
  patient: PatientUser;
}

// Admin
export interface AdminSessionResponse {
  message: "admin_session_created";
  expires_in_seconds: number;
}
