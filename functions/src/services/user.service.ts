import * as admin from "firebase-admin";
import {User, CreateUserData, UpdateUserData} from "../models/user.model";

const db = admin.firestore();
const USERS_COLLECTION = "users";

/**
 * User Service
 * Handles all user-related database operations
 */
export class UserService {
  /**
   * Create a new user in Firestore
   */
  async createUser(data: CreateUserData): Promise<User> {
    // Check if user already exists
    const existingUser = await this.getUserByPhoneNumber(data.phoneNumber);
    if (existingUser) {
      throw new Error("User with this phone number already exists");
    }

    // Create new user document
    const userRef = db.collection(USERS_COLLECTION).doc();
    const userId = userRef.id;

    const newUser: User = {
      id: userId,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      role: data.role as any,
      createdAt: new Date().toISOString(),
      pinHash: data.pinHash,
      specialty: data.specialty,
      workplace: data.workplace,
      email: data.email,
    };

    await userRef.set(newUser);
    return newUser;
  }

  /**
   * Get user by phone number
   */
  async getUserByPhoneNumber(phoneNumber: string): Promise<User | null> {
    const querySnapshot = await db
      .collection(USERS_COLLECTION)
      .where("phoneNumber", "==", phoneNumber)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    const data = doc.data() as User;
    return {
      ...data,
      id: data.id || doc.id,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const docSnapshot = await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .get();

    if (!docSnapshot.exists) {
      return null;
    }

    const data = docSnapshot.data() as User;
    return {
      ...data,
      id: data.id || docSnapshot.id,
    };
  }

  /**
   * Update user profile
   */
  async updateUser(data: UpdateUserData): Promise<void> {
    const updateData: Partial<User> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.phoneNumber) updateData.phoneNumber = data.phoneNumber;
    if (data.email) updateData.email = data.email;

    await db
      .collection(USERS_COLLECTION)
      .doc(data.userId)
      .update(updateData);
  }

  /**
   * Get all users by role
   */
  async getUsersByRole(role: string): Promise<User[]> {
    const querySnapshot = await db
      .collection(USERS_COLLECTION)
      .where("role", "==", role)
      .get();

    return querySnapshot.docs.map((doc) => doc.data() as User);
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    await db.collection(USERS_COLLECTION).doc(userId).delete();
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers(): Promise<User[]> {
    const querySnapshot = await db.collection(USERS_COLLECTION).get();
    return querySnapshot.docs.map((doc) => doc.data() as User);
  }
}

