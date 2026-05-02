export interface AdminDoctor {
  doctor_id: string;
  full_name: string;
  email: string;
  phone: string;
  registration_no: string;
  verification_status: "pending" | "approved" | "rejected";
  is_suspended: boolean;
  is_admin: boolean;
  rejection_reason?: string | null;
  verified_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdminDoctorListResponse {
  count: number;
  doctors: AdminDoctor[];
}
