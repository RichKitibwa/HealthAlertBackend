/**
 * Firebase Cloud Functions
 *
 * Modular structure:
 * - models/: Data models and interfaces
 * - services/: Database operations and business logic
 * - controllers/: HTTP function handlers
 * - utils/: Helper functions and utilities
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

// Load environment variables from .env file (for local development)
// In production, Firebase automatically loads environment variables
if (process.env.NODE_ENV !== "production") {
  try {
    // Try to load dotenv if available (for local development)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config();
  } catch {
    // dotenv not installed, that's okay - use Firebase config or env vars
  }
}

// Initialize Firebase Admin
admin.initializeApp();

// Export authentication functions
export {
  registerUser,
  loginUser,
} from "./controllers/auth.controller";

// Export admin authentication functions
export {
  sendAdminOTP,
  verifyAdminOTP,
} from "./controllers/admin-auth.controller";

// Export user management functions
export {
  getUserById,
  updateUserProfile,
  getUsersByRole,
  getAllUsers,
  deleteUser,
} from "./controllers/user.controller";

// Export emergency case functions
export {
  createEmergencyCase,
  getEmergencyCaseById,
  getEmergencyCases,
  updateEmergencyCase,
  deleteEmergencyCase,
} from "./controllers/emergency-case.controller";

// Export notification triggers (Firestore-triggered functions)
export {
  onEmergencyCaseCreated,
  onEmergencyCaseUpdated,
  onNotificationDocCreated,
} from "./controllers/notification.controller";

// Test function to verify deployment
export const helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.json({
    message: "Emergency Health System API - Firebase Functions Active!",
    version: "1.0.0",
    endpoints: {
      auth: ["registerUser", "loginUser"],
      users: ["getUserById", "updateUserProfile", "getUsersByRole", "getAllUsers", "deleteUser"],
    },
  });
});
