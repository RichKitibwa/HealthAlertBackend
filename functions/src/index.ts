/**
 * Firebase Cloud Functions
 * 
 * Modular structure:
 * - models/: Data models and interfaces
 * - services/: Database operations and business logic
 * - controllers/: HTTP function handlers
 * - utils/: Helper functions and utilities
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Initialize Firebase Admin
admin.initializeApp();

// Export authentication functions
export {
  registerUser,
  loginUser,
} from './controllers/auth.controller';

// Export user management functions
export {
  getUserById,
  updateUserProfile,
  getUsersByRole,
  getAllUsers,
  deleteUser,
} from './controllers/user.controller';

// Test function to verify deployment
export const helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info('Hello logs!', { structuredData: true });
  response.json({
    message: 'Emergency Health System API - Firebase Functions Active!',
    version: '1.0.0',
    endpoints: {
      auth: ['registerUser', 'loginUser'],
      users: ['getUserById', 'updateUserProfile', 'getUsersByRole', 'getAllUsers', 'deleteUser'],
    },
  });
});
