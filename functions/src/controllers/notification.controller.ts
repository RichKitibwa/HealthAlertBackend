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
const db = admin.firestore();

/**
 * Firestore trigger: whenever a new document is added to the 'notifications'
 * collection (by the Flutter app or other backend code), send an FCM push
 * notification to the recipient's device so they see it even when the app is
 * closed/killed.
 *
 * Skips documents where fcmPushed === true, meaning the backend trigger that
 * created the document already sent FCM directly (avoids double push).
 */
export const onNotificationDocCreated = onDocumentCreated(
  "notifications/{notifId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const notifId = event.params.notifId;

    // Skip if the creating trigger already sent FCM directly
    if (data?.fcmPushed === true) {
      functions.logger.info("onNotificationDocCreated: fcmPushed=true, skipping", {notifId});
      return;
    }

    // Accept either field name the Flutter app may use
    const userId: string | undefined =
      (data?.userId as string) || (data?.recipientId as string);

    if (!userId) {
      functions.logger.warn("onNotificationDocCreated: no userId/recipientId", {notifId});
      return;
    }

    const title: string = (data?.title as string) || "Emergency Alert";
    const body: string = (data?.message as string) || (data?.body as string) || "";
    const caseId: string | undefined = data?.caseId as string | undefined;
    const type: string | undefined = data?.type as string | undefined;

    try {
      await notificationService.sendPushToUser({
        userId,
        title,
        body,
        caseId,
        type,
        notifDocId: notifId,
      });
    } catch (error: any) {
      functions.logger.error("onNotificationDocCreated: failed to send push", {
        notifId,
        userId,
        error: error.message,
      });
    }
  }
);

/**
 * Firestore trigger: When a new emergency case is created, log the event.
 * The Flutter frontend (vht_add_media_screen.dart) calls notifyOnCaseCreated
 * directly, which creates properly localised in-app notifications for the
 * clinician and VHT. We do NOT create a duplicate notification here.
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

    functions.logger.info("New emergency case created (notifications handled by Flutter frontend)", {
      caseId,
      emergencyType: caseData?.emergencyType,
      assignedClinicId: caseData?.assignedClinicId,
    });

    // Intentionally not sending notifications here.
    // The Flutter frontend's notifyOnCaseCreated handles:
    //   - Clinician: "New Emergency Case" (localised)
    //   - VHT: "Case Submitted Successfully" (localised)
    // Adding a notification here would create a duplicate for the clinician.
  }
);

/**
 * Firestore trigger: When an emergency case status is updated,
 * notify relevant parties for status changes that the Flutter frontend
 * does NOT already handle directly.
 *
 * Frontend handles (do NOT duplicate here):
 *   - "advised"     → notifyVhtOfClinicianAdvice (VHT)
 *   - "dispatched"  → notifyOnAmbulanceDispatched (VHT, clinician, driver)
 *   - "delivered"   → notifyOnPatientDelivered (VHT, clinician, admins)
 *   - "completed" via advice path → notifyOnCaseClosed (VHT)
 *
 * Backend handles (only these):
 *   - "arrived"    → VHT: ambulance is at your location
 *   - "inTransit"  → Clinician: patient is on the way
 *   - "cancelled"  → VHT: case cancelled
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

    const newStatus = after.status;
    const updatedBy = after.updatedBy || "";
    const vhtId = after.vhtId;
    const assignedClinicId = after.assignedClinicId;
    const emergencyType = after.emergencyType || "Emergency";
    const patientFirst = after.patientFirstName || "";
    const patientLast = after.patientLastName || "";
    const pName =
      `${patientFirst} ${patientLast}`.trim() || "Patient";

    /**
     * Create an in-app notification doc AND send FCM push directly to the user.
     * Adding fcmPushed: true to the doc prevents onNotificationDocCreated from
     * sending a duplicate FCM push for the same notification.
     * Skips if recipient is the person who performed the action.
     */
    const notifyUser = async (
      userId: string,
      title: string,
      body: string,
      type: string
    ) => {
      if (!userId) return;
      // Don't notify the user who performed the action
      if (userId === updatedBy) {
        functions.logger.info("Skipping self-notification", {userId, caseId, newStatus});
        return;
      }
      try {
        // Create in-app notification doc with fcmPushed flag to avoid double push
        await db.collection("notifications").add({
          userId,
          recipientId: userId,
          type,
          title,
          message: body,
          body,
          caseId,
          read: false,
          fcmPushed: true,
          data: {oldStatus: before.status, newStatus, emergencyType},
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Send FCM push directly (belt-and-suspenders, same as develop branch)
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        if (userData?.fcmToken) {
          await notificationService.sendPushNotification({
            fcmToken: userData.fcmToken as string,
            title,
            body,
            recipientRole: userData.role as string | undefined,
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

    // ─── Statuses NOT handled by the Flutter frontend ───────────────────────

    // "arrived": Ambulance has arrived at VHT's location.
    // (Frontend comment: "No notifications for arrived" — backend handles it.)
    if (vhtId && newStatus === "arrived") {
      await notifyUser(
        vhtId,
        "Ambulance Arrived",
        `The ambulance has arrived at your location. Prepare ${pName} for handover.`,
        "case_status_update"
      );
    }

    // "inTransit": Patient is being transported — notify the clinician to prepare.
    // (Frontend only notifies on "delivered", not on "inTransit".)
    if (assignedClinicId && newStatus === "inTransit") {
      await notifyUser(
        assignedClinicId,
        "Patient In Transit",
        `${pName} is being transported to your clinic. Prepare for arrival.`,
        "case_status_update"
      );
    }

    // "cancelled": Case was cancelled — notify VHT.
    if (vhtId && newStatus === "cancelled") {
      await notifyUser(
        vhtId,
        "Case Cancelled",
        `Your ${emergencyType} case for ${pName} has been cancelled.`,
        "case_status_update"
      );
    }

    // NOTE: The following statuses are intentionally excluded because the
    // Flutter frontend already sends properly localised notifications for them:
    //   "advised"    → clinic_case_detail_screen → notifyVhtOfClinicianAdvice
    //   "dispatched" → admin_case_timeline → notifyOnAmbulanceDispatched (VHT + driver + clinician)
    //   "delivered"  → ambulance_en_route_screen → notifyOnPatientDelivered (VHT + clinician + admins)
    //   "completed"  → clinic_case_detail_screen → notifyOnCaseClosed / notifyOnPatientDischarged
  }
);
