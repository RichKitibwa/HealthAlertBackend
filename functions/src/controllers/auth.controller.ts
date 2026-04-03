import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {UserService} from "../services/user.service";
import {CreateUserData} from "../models/user.model";
import * as crypto from "crypto";

const userService = new UserService();

/**
 * Authentication Controller
 * Handles registration and login logic
 */

/**
 * Register a new user
 */
export const registerUser = functions.https.onCall(async (request) => {
  try {
    const {firstName, lastName, phoneNumber, role, pinHash, specialty, workplace, email} = request.data;

    // Validate input
    if (!firstName || !lastName || !phoneNumber || !role || !pinHash) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: firstName, lastName, phoneNumber, role, pinHash"
      );
    }

    // Validate role
    const validRoles = ["VHT", "Ambulance Driver", "Clinic Staff", "Admin"];
    if (!validRoles.includes(role)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid role. Must be one of: " + validRoles.join(", ")
      );
    }

    if (role === "Clinic Staff" && !workplace) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Workplace is required for Clinic Staff"
      );
    }

    const userData: CreateUserData = {
      firstName,
      lastName,
      phoneNumber,
      role,
      pinHash,
      specialty,
      workplace,
      email,
    };

    const user = await userService.createUser(userData);

    functions.logger.info("User registered successfully", {userId: user.id});

    return {
      success: true,
      message: "User registered successfully",
      user,
    };
  } catch (error: any) {
    functions.logger.error("Error registering user", error);

    if (error.message.includes("already exists")) {
      throw new functions.https.HttpsError("already-exists", error.message);
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Login user by phone number and PIN
 */
export const loginUser = functions.https.onCall(async (request) => {
  try {
    const {phoneNumber} = request.data;

    // Validate input
    if (!phoneNumber) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Phone number is required"
      );
    }

    // Find user
    const user = await userService.getUserByPhoneNumber(phoneNumber);

    if (!user) {
      throw new functions.https.HttpsError(
        "not-found",
        "User not found. Please register first."
      );
    }

    const {pinHash, ...userWithoutPin} = user;

    functions.logger.info("User login initiated", {userId: user.id});

    return {
      success: true,
      message: "User found",
      user: userWithoutPin,
    };
  } catch (error: any) {
    functions.logger.error("Error logging in user", error);

    if (error.code) {
      throw error; // Re-throw HttpsError
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Login user by phone number + PIN and return a Firebase Auth custom token.
 *
 * This enables Firebase Security Rules (request.auth) to enforce
 * confidentiality/role-based access.
 */
export const loginUserWithPin = functions.https.onCall(async (request) => {
  try {
    const {phoneNumber, pin} = request.data;

    if (!phoneNumber) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Phone number is required"
      );
    }

    if (!pin) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "PIN is required"
      );
    }

    const user = await userService.getUserByPhoneNumber(phoneNumber);

    if (!user) {
      throw new functions.https.HttpsError(
        "not-found",
        "User not found. Please register first."
      );
    }

    if (!user.pinHash) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User PIN hash missing. Please re-register."
      );
    }

    const providedHash = crypto
      .createHash("sha256")
      .update(String(pin))
      .digest("hex");

    if (providedHash !== user.pinHash) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Invalid PIN"
      );
    }

    const uid = user.id;
    if (!uid) {
      throw new functions.https.HttpsError(
        "internal",
        "User record missing uid"
      );
    }
    const {pinHash, ...userWithoutPin} = user;

    // Custom token claims used by Firestore rules.
    const customToken = await admin.auth().createCustomToken(uid, {
      role: user.role,
      workplace: user.workplace ?? "",
      specialty: user.specialty ?? "",
    });

    functions.logger.info("User login with pin successful", {userId: user.id});

    return {
      success: true,
      message: "Login successful",
      customToken,
      user: userWithoutPin,
    };
  } catch (error: any) {
    functions.logger.error("Error logging in user with pin", error);
    if (error.code) throw error;
    throw new functions.https.HttpsError("internal", error.message);
  }
});
