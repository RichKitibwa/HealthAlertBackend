/**
 * Emergency Case Controller
 * Handles HTTP requests for emergency case operations
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {EmergencyCaseService} from "../services/emergency-case.service";
import {CreateEmergencyCaseData, UpdateEmergencyCaseData} from "../models/emergency-case.model";

const emergencyCaseService = new EmergencyCaseService();
const db = admin.firestore();

async function markDispatchNotificationsRead(
  caseId: string,
  userId: string
): Promise<void> {
  const snapshot = await db.collection("notifications")
    .where("caseId", "==", caseId)
    .get();

  if (snapshot.empty) return;

  const batch = db.batch();
  let updates = 0;
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const type = data.type as string | undefined;
    if (
      data.userId !== userId ||
      data.read === true ||
      !["dispatch_assigned", "ambulance_request_standby"].includes(type || "")
    ) {
      return;
    }
    batch.update(doc.ref, {
      read: true,
      supersededAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    updates++;
  });
  if (updates === 0) return;
  await batch.commit();
}

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
 * Ambulance driver accepts an assigned dispatch.
 *
 * This transition is intentionally backend-owned and transactional so stale
 * notification taps cannot move delivered/completed cases back to enRoute.
 */
export const acceptAmbulanceDispatch = functions.https.onCall(async (request) => {
  try {
    const auth = request.auth;
    const {caseId} = request.data as { caseId?: string };

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }
    if (!caseId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Case ID is required"
      );
    }

    const uid = auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const role = ((userDoc.data()?.role as string | undefined) || "")
      .toLowerCase();
    if (!role.includes("ambulance")) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only ambulance drivers can accept dispatches"
      );
    }

    const result = await db.runTransaction(async (transaction) => {
      const caseRef = db.collection("emergencyCases").doc(caseId);
      const caseSnap = await transaction.get(caseRef);
      if (!caseSnap.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Emergency case not found"
        );
      }

      const data = caseSnap.data() || {};
      const status = (data.status as string | undefined) || "";
      const assignedAmbulanceId =
        (data.assignedAmbulanceId as string | undefined) || "";

      if (assignedAmbulanceId !== uid) {
        return {
          success: false,
          code: "not_assigned",
          status,
          message: "This dispatch has not been assigned to you.",
        };
      }

      if (status !== "dispatched") {
        return {
          success: false,
          code: "not_dispatchable",
          status,
          message: `Dispatch cannot be accepted from status ${status}.`,
        };
      }

      const firstName = (userDoc.data()?.firstName as string | undefined) || "";
      const lastName = (userDoc.data()?.lastName as string | undefined) || "";
      const driverName = `${firstName} ${lastName}`.trim();

      transaction.update(caseRef, {
        status: "enRoute",
        updatedBy: uid,
        assignedAmbulanceId: uid,
        ...(driverName ? {assignedDriverName: driverName} : {}),
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: "enRoute",
          updatedBy: uid,
          updatedAt: admin.firestore.Timestamp.now(),
        }),
      });

      return {
        success: true,
        code: "accepted",
        status: "enRoute",
        message: "Dispatch accepted.",
      };
    });

    if (result.success) {
      await markDispatchNotificationsRead(caseId, uid);
    }

    return result;
  } catch (error: any) {
    functions.logger.error("Error accepting ambulance dispatch", error);

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
