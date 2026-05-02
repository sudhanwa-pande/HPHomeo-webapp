export interface Appointment {
  _id: string;
  doctor_id: string;
  doctor_name: string;
  patient_id?: string;
  patient_user_id?: string;
  patient_name: string;
  patient_phone: string;
  patient_email?: string;
  patient_age?: number;
  patient_sex?: string;
  scheduled_at: string;
  duration_min: number;
  mode: "online" | "walk_in";
  consultation_fee: number;
  payment_choice: "pay_now" | "pay_at_clinic";
  payment_status: "unpaid" | "paid" | "failed" | "refunded";
  refund_status: "none" | "pending" | "processing" | "processed" | "failed";
  status:
    | "pending_payment"
    | "confirmed"
    | "completed"
    | "cancelled"
    | "no_show";
  appointment_type: "new" | "follow_up";
  video_enabled: boolean;
  call_status: "idle" | "waiting" | "connected" | "disconnected" | "ended";
  cancel_reason?: string;
  is_follow_up_eligible: boolean;
  created_at: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}
