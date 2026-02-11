import * as functions from "firebase-functions";
import {UserService} from "../services/user.service";
import {UpdateUserData} from "../models/user.model";

const userService = new UserService();

/**
 * User Controller
 * Handles user profile and user management operations
 */

/**
 * Get user by ID
 */
export const getUserById = functions.https.onCall(async (request) => {
  try {
    const {userId} = request.data;

    if (!userId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "User ID is required"
      );
    }

    const user = await userService.getUserById(userId);

    if (!user) {
      throw new functions.https.HttpsError("not-found", "User not found");
    }

    return {
      success: true,
      user,
    };
  } catch (error: any) {
    functions.logger.error("Error getting user", error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Update user profile
 */
export const updateUserProfile = functions.https.onCall(async (request) => {
  try {
    const {userId, firstName, lastName, phoneNumber} = request.data;

    if (!userId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "User ID is required"
      );
    }

    // Check if user exists
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new functions.https.HttpsError("not-found", "User not found");
    }

    const updateData: UpdateUserData = {userId};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;

    await userService.updateUser(updateData);

    functions.logger.info("User profile updated", {userId});

    return {
      success: true,
      message: "Profile updated successfully",
    };
  } catch (error: any) {
    functions.logger.error("Error updating user profile", error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Get users by role
 */
export const getUsersByRole = functions.https.onCall(async (request) => {
  try {
    const {role} = request.data;

    if (!role) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Role is required"
      );
    }

    const users = await userService.getUsersByRole(role);

    return {
      success: true,
      users,
      count: users.length,
    };
  } catch (error: any) {
    functions.logger.error("Error getting users by role", error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Get all users (Admin only)
 */
export const getAllUsers = functions.https.onCall(async (request) => {
  try {
    // TODO: Add admin authentication check
    // For now, allow all requests. will ask the product owner about this later 

    const users = await userService.getAllUsers();

    return {
      success: true,
      users,
      count: users.length,
    };
  } catch (error: any) {
    functions.logger.error("Error getting all users", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Delete user
 */
export const deleteUser = functions.https.onCall(async (request) => {
  try {
    const {userId} = request.data;

    if (!userId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "User ID is required"
      );
    }

    // Check if user exists
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new functions.https.HttpsError("not-found", "User not found");
    }

    await userService.deleteUser(userId);

    functions.logger.info("User deleted", {userId});

    return {
      success: true,
      message: "User deleted successfully",
    };
  } catch (error: any) {
    functions.logger.error("Error deleting user", error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

