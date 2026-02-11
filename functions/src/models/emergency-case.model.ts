/**
 * Emergency Case Model
 * Defines the structure of an emergency case
 */

export interface EmergencyCase {
  id?: string;
  caseType: "medical" | "trauma" | "maternal" | "pediatric" | "other" | "birth" | "infection";
  emergencyType?: string; 
  urgencyLevel: "critical" | "high" | "medium" | "low";
  status: "pending" | "dispatched" | "enRoute" | "arrived" | "inTransit" | "delivered" | "completed" | "cancelled";
  patientId?: string; 
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  patientDateOfBirth?: string;
  description?: string;
  symptoms?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  vhtId?: string;
  vhtName?: string;
  vhtPhoneNumber?: string;
  vhtLatitude?: number;
  vhtLongitude?: number;
  assignedAmbulanceId?: string;
  assignedClinicId?: string; 
  assignedClinicName?: string; 
  assignedClinicianName?: string;
  clinicianPhoneNumber?: string;
  clinicianNotes?: string; 
  attachmentUrls?: string[];
  notes?: string;
  createdAt?: Date | FirebaseFirestore.Timestamp;
  updatedAt?: Date | FirebaseFirestore.Timestamp;
  completedAt?: Date | FirebaseFirestore.Timestamp;
}

export type CaseType = EmergencyCase["caseType"];
export type UrgencyLevel = EmergencyCase["urgencyLevel"];

export interface CreateEmergencyCaseData {
  caseType: CaseType;
  urgencyLevel: UrgencyLevel;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  description?: string;
  symptoms?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  notes?: string;
  attachmentUrls?: string[];
}

export interface UpdateEmergencyCaseData {
  status?: string;
  assignedAmbulanceId?: string;
  assignedClinicId?: string;
  assignedClinicName?: string;
  assignedClinicianName?: string;
  clinicianNotes?: string;
  attachmentUrls?: string[];
  notes?: string;
}
