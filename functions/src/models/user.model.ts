// User data model
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: UserRole;
  createdAt: string;
  updatedAt?: string;
}

// User roles enum
export enum UserRole {
  VHT = 'VHT',
  AMBULANCE_DRIVER = 'Ambulance Driver',
  CLINIC_STAFF = 'Clinic Staff',
  ADMIN = 'Admin',
}

// Data for creating a new user
export interface CreateUserData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: string;
}

// Data for updating user profile
export interface UpdateUserData {
  userId: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

