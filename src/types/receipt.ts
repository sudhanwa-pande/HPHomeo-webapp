// Receipt (from /patient/appointments/{id}/receipt or /doctor/appointments/{id}/receipt)
export interface Receipt {
  receipt_id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string | null;
  patient_user_id: string | null;
  patient_name: string;
  patient_email?: string | null;
  patient_phone: string;
  doctor_name: string;
  doctor_registration_no?: string | null;
  consultation_fee: number;
  payment_method: string;
  payment_id?: string | null;
  pdf_url?: string | null;
  receipt_date: string;
  created_at: string;
}

// Response from GET /patient/receipts
export interface PatientReceiptsResponse {
  items: Receipt[];
}
