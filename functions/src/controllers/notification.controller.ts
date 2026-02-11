/**
 * Notification Controller
 * Handles Firestore triggers for automatic notifications
 *
 */

import {onDocumentCreated, onDocumentUpdated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {NotificationService} from "../services/notification.service";

const notificationService = new NotificationService();

/**
 * Firestore trigger: When a new emergency case is created,
 * automatically notify the assigned clinician.
 */
export const onEmergencyCaseCreated = onDocumentCreated(
  "emergencyCases/{caseId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      functions.logger.warn("No data in onEmergencyCaseCreated event");
      return;
    }

    const caseData = snapshot.data();
    const caseId = event.params.caseId;

    functions.logger.info("New emergency case created", {
      caseId,
      emergencyType: caseData?.emergencyType,
      assignedClinicId: caseData?.assignedClinicId,
    });

    // Only notify if a clinician was assigned
    const clinicianId = caseData?.assignedClinicId;
    if (!clinicianId) {
      functions.logger.warn("No clinician assigned to case, skipping notification", {caseId});
      return;
    }

    try {
      const result = await notificationService.notifyClinicianOfNewCase({
        clinicianId,
        caseId,
        emergencyType: caseData?.emergencyType || "Unknown",
        urgencyLevel: caseData?.urgencyLevel || "medium",
        patientId: caseData?.patientId,
        vhtName: caseData?.vhtName || "Unknown VHT",
      });

      functions.logger.info("Clinician notification result", {
        caseId,
        clinicianId,
        pushSent: result.pushSent,
        inAppCreated: result.inAppCreated,
      });
    } catch (error: any) {
      functions.logger.error("Failed to notify clinician for new case", {
        caseId,
        clinicianId,
        error: error.message,
      });
    }
  }
);

/**
 * Firestore trigger: When an emergency case status is updated,
 * notify relevant parties (VHT, driver, clinician) via both
 * push notification and in-app notification.
 */
export const onEmergencyCaseUpdated = onDocumentUpdated(
  "emergencyCases/{caseId}",
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;

    if (!beforeSnap || !afterSnap) {
      functions.logger.warn("No data in onEmergencyCaseUpdated event");
      return;
    }

    const before = beforeSnap.data();
    const after = afterSnap.data();
    const caseId = event.params.caseId;

    // Only handle status changes
    if (before.status === after.status) {
      return;
    }

    functions.logger.info("Emergency case status changed", {
      caseId,
      oldStatus: before.status,
      newStatus: after.status,
    });

    const db = admin.firestore();
    const newStatus = after.status;
    const updatedBy = after.updatedBy || "";
    const vhtId = after.vhtId;
    const assignedClinicId = after.assignedClinicId;
    const assignedAmbulanceId = after.assignedAmbulanceId;
    const emergencyType = after.emergencyType || "Emergency";
    const patientFirst = after.patientFirstName || "";
    const patientLast = after.patientLastName || "";
    const pName =
      `${patientFirst} ${patientLast}`.trim() || "Patient";

    // Helper: send push + in-app notification to a user
    // Skips if recipient is the person who performed the action
    const notifyUser = async (
      userId: string,
      title: string,
      body: string,
      type: string
    ) => {
      if (!userId) return;
      // Don't notify the user who performed the action
      if (userId === updatedBy) {
        functions.logger.info("Skipping self-notification", {
          userId, caseId, newStatus,
        });
        return;
      }
      try {
        await notificationService.createInAppNotification({
          recipientId: userId,
          type,
          title,
          body,
          caseId,
          data: {oldStatus: before.status, newStatus, emergencyType},
        });

        const userDoc = await db
          .collection("users").doc(userId).get();
        const userData = userDoc.data();
        if (userData?.fcmToken) {
          await notificationService.sendPushNotification({
            fcmToken: userData.fcmToken,
            title,
            body,
            data: {type, caseId, newStatus},
          });
        }
      } catch (error: any) {
        functions.logger.error(
          `Failed to notify user ${userId}`,
          {caseId, error: error.message}
        );
      }
    };

    // === VHT notifications (only meaningful ones) ===
    // advised:    Doctor responded with advice - act on it
    // dispatched: Ambulance is assigned and coming
    // arrived:    Ambulance is at your location
    // completed:  Case closed
    // cancelled:  Case cancelled
    const vhtStatuses = [
      "advised", "dispatched", "arrived",
      "completed", "cancelled",
    ];
    if (vhtId && vhtStatuses.includes(newStatus)) {
      let title = "Case Update";
      let body = "";

      switch (newStatus) {
      case "advised":
        title = "Clinician Advice Received";
        body = "The clinician reviewed your " +
          emergencyType + " case for " + pName +
          " and provided advice.";
        break;
      case "dispatched":
        title = "Ambulance Dispatched";
        body = "An ambulance has been dispatched for " +
          pName + ". Stay with the patient.";
        break;
      case "arrived":
        title = "Ambulance Arrived";
        body = "The ambulance has arrived. Prepare " +
          pName + " for handover.";
        break;
      case "completed":
        title = "Case Completed";
        body = "Your " + emergencyType + " case for " +
          pName + " has been completed.";
        break;
      case "cancelled":
        title = "Case Cancelled";
        body = "Your " + emergencyType + " case for " +
          pName + " has been cancelled.";
        break;
      }

      await notifyUser(
        vhtId, title, body, "case_status_update"
      );
    }

    // === Ambulance driver: only dispatched ===
    if (
      assignedAmbulanceId &&
      newStatus === "dispatched" &&
      before.status !== "dispatched"
    ) {
      await notifyUser(
        assignedAmbulanceId,
        "New Dispatch Assignment",
        "You have been dispatched for a " +
        emergencyType + " emergency. Patient: " +
        pName + ". Accept to start your ride.",
        "dispatch"
      );
    }

    // === Clinician: inTransit and delivered only ===
    // inTransit: Patient coming, prepare
    // delivered: Patient at your door, attend now
    if (
      assignedClinicId &&
      ["inTransit", "delivered"].includes(newStatus)
    ) {
      let title = "Case Update";
      let body = "";

      switch (newStatus) {
      case "inTransit":
        title = "Patient In Transit";
        body = pName + " is being transported to " +
          "your clinic. Prepare for arrival.";
        break;
      case "delivered":
        title = "Patient Arrived at Clinic";
        body = pName + " has been delivered to " +
          "your clinic. Please attend to the patient.";
        break;
      }

      await notifyUser(
        assignedClinicId, title, body,
        "case_status_update"
      );
    }
  }
);
