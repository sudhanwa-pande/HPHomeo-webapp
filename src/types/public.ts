export interface PublicAppointment {
  appointment_id: string;
  doctor_id: string;
  doctor_name?: string | null;
  patient_name?: string | null;
  scheduled_at: string;
  duration_min: number;
  mode: "walk_in" | "online";
  status: "pending_payment" | "confirmed" | "completed" | "cancelled" | "no_show";
  payment_choice: "pay_now" | "pay_at_clinic";
  consultation_fee?: number | null;
  video_enabled: boolean;
  call_status: "idle" | "waiting" | "connected" | "disconnected" | "ended";
  appointment_type: "new" | "follow_up";
  follow_up_of_appointment_id?: string | null;
  can_cancel: boolean;
  can_reschedule: boolean;
  cancel_window_hours: number;
}

export interface PublicAvailableSlot {
  date: string;
  start: string;
  end: string;
  duration_minutes: number;
}

export interface PublicAvailableSlotsResponse {
  doctor_id: string;
  from: string;
  to: string;
  count: number;
  slots: PublicAvailableSlot[];
}
