import * as functions from 'firebase-functions';
import { UserService } from '../services/user.service';
import { CreateUserData } from '../models/user.model';

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
    const { firstName, lastName, phoneNumber, role } = request.data;

    // Validate input
    if (!firstName || !lastName || !phoneNumber || !role) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: firstName, lastName, phoneNumber, role'
      );
    }

    // Validate role
    const validRoles = ['VHT', 'Ambulance Driver', 'Clinic Staff', 'Admin'];
    if (!validRoles.includes(role)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid role. Must be one of: ' + validRoles.join(', ')
      );
    }

    const userData: CreateUserData = {
      firstName,
      lastName,
      phoneNumber,
      role,
    };

    const user = await userService.createUser(userData);

    functions.logger.info('User registered successfully', { userId: user.id });

    return {
      success: true,
      message: 'User registered successfully',
      user,
    };
  } catch (error: any) {
    functions.logger.error('Error registering user', error);

    if (error.message.includes('already exists')) {
      throw new functions.https.HttpsError('already-exists', error.message);
    }

    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Login user by phone number
 */
export const loginUser = functions.https.onCall(async (request) => {
  try {
    const { phoneNumber } = request.data;

    // Validate input
    if (!phoneNumber) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Phone number is required'
      );
    }

    // Find user
    const user = await userService.getUserByPhoneNumber(phoneNumber);

    if (!user) {
      throw new functions.https.HttpsError(
        'not-found',
        'User not found. Please register first.'
      );
    }

    functions.logger.info('User logged in successfully', { userId: user.id });

    return {
      success: true,
      message: 'Login successful',
      user,
    };
  } catch (error: any) {
    functions.logger.error('Error logging in user', error);

    if (error.code) {
      throw error; // Re-throw HttpsError
    }

    throw new functions.https.HttpsError('internal', error.message);
  }
});

