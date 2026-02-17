// User data model
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: UserRole;
  createdAt: string;
  updatedAt?: string;
  pinHash?: string;
  specialty?: string;
  workplace?: string;
  email?: string; // For admin users
}

// User roles enum
export enum UserRole {
  VHT = "VHT",
  AMBULANCE_DRIVER = "Ambulance Driver",
  CLINIC_STAFF = "Clinic Staff",
  ADMIN = "Admin",
}

// Data for creating a new user
export interface CreateUserData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: string;
  pinHash: string;
  specialty?: string;
  workplace?: string; // For clinicians
  email?: string; // For admin users
}

// Data for updating user profile
export interface UpdateUserData {
  userId: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
}

