/**
 * Emergency Case Controller
 * Handles HTTP requests for emergency case operations
 */

import * as functions from "firebase-functions";
import {EmergencyCaseService} from "../services/emergency-case.service";
import {CreateEmergencyCaseData, UpdateEmergencyCaseData} from "../models/emergency-case.model";

const emergencyCaseService = new EmergencyCaseService();

/**
 * Create new emergency case
 */
export const createEmergencyCase = functions.https.onCall(async (request) => {
  try {
    const data = request.data as CreateEmergencyCaseData;
    const auth = request.auth;

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    // Validate required fields
    if (!data.caseType || !data.urgencyLevel) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Case type and urgency level are required"
      );
    }

    // Get VHT info from auth context
    const vhtId = auth.uid;
    const vhtName = auth.token.name || "Unknown VHT";

    const caseModel = await emergencyCaseService.createCase(data, vhtId, vhtName);

    functions.logger.info("Emergency case created", {caseId: caseModel.id, vhtId});

    return {
      success: true,
      case: caseModel,
    };
  } catch (error: any) {
    functions.logger.error("Error creating emergency case", error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Get case by ID
 */
export const getEmergencyCaseById = functions.https.onCall(async (request) => {
  try {
    const {caseId} = request.data;

    if (!caseId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Case ID is required"
      );
    }

    const caseModel = await emergencyCaseService.getCaseById(caseId);

    if (!caseModel) {
      throw new functions.https.HttpsError("not-found", "Emergency case not found");
    }

    return {
      success: true,
      case: caseModel,
    };
  } catch (error: any) {
    functions.logger.error("Error getting emergency case", error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Get cases with filters
 */
export const getEmergencyCases = functions.https.onCall(async (request) => {
  try {
    const filters = request.data || {};

    const cases = await emergencyCaseService.getCases(filters);

    return {
      success: true,
      cases,
      count: cases.length,
    };
  } catch (error: any) {
    functions.logger.error("Error getting emergency cases", error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Update emergency case
 */
export const updateEmergencyCase = functions.https.onCall(async (request) => {
  try {
    const {caseId, ...updateData} = request.data as UpdateEmergencyCaseData & { caseId: string };

    if (!caseId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Case ID is required"
      );
    }

    // Check if case exists
    const existingCase = await emergencyCaseService.getCaseById(caseId);
    if (!existingCase) {
      throw new functions.https.HttpsError("not-found", "Emergency case not found");
    }

    await emergencyCaseService.updateCase(caseId, updateData);

    functions.logger.info("Emergency case updated", {caseId});

    return {
      success: true,
      message: "Case updated successfully",
    };
  } catch (error: any) {
    functions.logger.error("Error updating emergency case", error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Delete emergency case
 */
export const deleteEmergencyCase = functions.https.onCall(async (request) => {
  try {
    const {caseId} = request.data;

    if (!caseId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Case ID is required"
      );
    }

    // Check if case exists
    const existingCase = await emergencyCaseService.getCaseById(caseId);
    if (!existingCase) {
      throw new functions.https.HttpsError("not-found", "Emergency case not found");
    }

    await emergencyCaseService.deleteCase(caseId);

    functions.logger.info("Emergency case deleted", {caseId});

    return {
      success: true,
      message: "Case deleted successfully",
    };
  } catch (error: any) {
    functions.logger.error("Error deleting emergency case", error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});
