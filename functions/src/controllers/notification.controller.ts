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

type CaseData = FirebaseFirestore.DocumentData;

function patientName(caseData: CaseData): string {
  const first = (caseData.patientFirstName as string | undefined) || "";
  const last = (caseData.patientLastName as string | undefined) || "";
  return `${first} ${last}`.trim() ||
    (caseData.patientName as string | undefined) ||
    "Patient";
}

function distanceKm(
  lat1?: number,
  lon1?: number,
  lat2?: number,
  lon2?: number
): number {
  if (
    lat1 === undefined || lon1 === undefined ||
    lat2 === undefined || lon2 === undefined
  ) {
    return Number.MAX_SAFE_INTEGER;
  }
  const toRad = (value: number) => value * Math.PI / 180;
  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function userIdsByRole(role: string): Promise<string[]> {
  const snapshot = await db.collection("users")
    .where("role", "==", role)
    .get();
  return snapshot.docs.map((doc) => doc.id).filter(Boolean);
}

async function nearestAdminIds(caseData: CaseData): Promise<string[]> {
  const admins = await db.collection("users")
    .where("role", "==", "Admin")
    .get();
  if (admins.empty) return [];

  const pickupLat =
    (caseData.vhtLatitude as number | undefined) ??
    (caseData.latitude as number | undefined);
  const pickupLon =
    (caseData.vhtLongitude as number | undefined) ??
    (caseData.longitude as number | undefined);

  if (pickupLat === undefined || pickupLon === undefined) {
    return admins.docs.map((doc) => doc.id);
  }

  const sorted = admins.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        distance: distanceKm(
          pickupLat,
          pickupLon,
          (data.latitude as number | undefined),
          (data.longitude as number | undefined)
        ),
      };
    })
    .sort((a, b) => a.distance - b.distance);

  return sorted.length ? [sorted[0].id] : [];
}

async function createCaseNotificationOnce(params: {
  caseId: string;
  userId: string;
  role: string;
  type: string;
  title: string;
  body: string;
  status: string;
  emergencyType: string;
}): Promise<void> {
  if (!params.userId) return;
  await notificationService.createInAppNotificationOnce({
    dedupeKey: [
      params.caseId,
      params.userId,
      params.type,
      params.status,
    ].join(":"),
    recipientId: params.userId,
    recipientRole: params.role,
    type: params.type,
    title: params.title,
    body: params.body,
    caseId: params.caseId,
    data: {
      newStatus: params.status,
      emergencyType: params.emergencyType,
    },
  });
}

async function markNotificationsRead(params: {
  caseId: string;
  types: string[];
  userId?: string;
}): Promise<void> {
  if (!params.caseId || params.types.length === 0) return;
  const query: FirebaseFirestore.Query = db.collection("notifications")
    .where("caseId", "==", params.caseId);

  const snapshot = await query.get();
  if (snapshot.empty) return;

  const batch = db.batch();
  let updates = 0;
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const type = data.type as string | undefined;
    if (
      data.read === true ||
      !params.types.includes(type || "") ||
      (params.userId && data.userId !== params.userId)
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
 *   - Frontend must not create status-change notifications directly.
 *
 * Backend handles (only these):
 *   - "ambulanceRequested" → nearest admin only
 *   - "dispatched" → VHT, clinician, assigned driver
 *   - "arrived"    → VHT: ambulance is at your location
 *   - "inTransit"  → Clinician: patient is on the way
 *   - "delivered"  → VHT, clinician, admins
 *   - "completed"  → VHT, admins for discharge; VHT for advice closure
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
    const vhtId = after.vhtId;
    const assignedClinicId = after.assignedClinicId;
    const assignedAmbulanceId = after.assignedAmbulanceId;
    const emergencyType = after.emergencyType || "Emergency";
    const pName = patientName(after);
    const clinicName = after.assignedClinicName || "the clinic";
    const driverName = after.assignedDriverName || "the ambulance driver";
    const clinicianName = after.assignedClinicianName || "the clinician";

    // ─── Status-driven notifications (single backend source of truth) ───────

    if (newStatus === "ambulanceRequested") {
      const adminIds = await nearestAdminIds(after);
      await Promise.all(adminIds.map((adminId) =>
        createCaseNotificationOnce({
          caseId,
          userId: adminId,
          role: "Admin",
          type: "dispatch_request",
          title: "Ambulance Dispatch Required",
          body: `${clinicianName} requested an ambulance for ` +
            `${emergencyType}. Patient: ${pName}.`,
          status: newStatus,
          emergencyType,
        })
      ));
      await markNotificationsRead({
        caseId,
        types: ["ambulance_request_standby"],
      });
    }

    if (newStatus === "dispatched") {
      await markNotificationsRead({
        caseId,
        types: ["ambulance_request_standby"],
      });
      await Promise.all([
        vhtId ? createCaseNotificationOnce({
          caseId,
          userId: vhtId,
          role: "VHT",
          type: "ambulance_dispatched",
          title: "Ambulance On The Way",
          body: `Ambulance driver ${driverName} has been dispatched. ` +
            `Stay with ${pName}.`,
          status: newStatus,
          emergencyType,
        }) : Promise.resolve(),
        assignedClinicId ? createCaseNotificationOnce({
          caseId,
          userId: assignedClinicId,
          role: "Clinician",
          type: "ambulance_dispatched",
          title: "Ambulance Dispatched",
          body: `${driverName} has been dispatched for ${emergencyType}. ` +
            `Patient: ${pName}.`,
          status: newStatus,
          emergencyType,
        }) : Promise.resolve(),
        assignedAmbulanceId ? createCaseNotificationOnce({
          caseId,
          userId: assignedAmbulanceId,
          role: "Ambulance Driver",
          type: "dispatch_assigned",
          title: "New Dispatch Assignment",
          body: `You have been assigned to a ${emergencyType} case. ` +
            `Collect ${pName} and deliver to ${clinicName}.`,
          status: newStatus,
          emergencyType,
        }) : Promise.resolve(),
      ]);
    }

    // "arrived": Ambulance has arrived at VHT's location.
    // (Frontend comment: "No notifications for arrived" — backend handles it.)
    if (vhtId && newStatus === "arrived") {
      await createCaseNotificationOnce({
        caseId,
        userId: vhtId,
        role: "VHT",
        type: "ambulance_arrived",
        title: "Ambulance Arrived",
        body: "The ambulance has arrived at your location. " +
          `Prepare ${pName} for handover.`,
        status: newStatus,
        emergencyType,
      });
    }

    // "inTransit": Patient is being transported — notify the clinician to prepare.
    // (Frontend only notifies on "delivered", not on "inTransit".)
    if (assignedClinicId && newStatus === "inTransit") {
      await createCaseNotificationOnce({
        caseId,
        userId: assignedClinicId,
        role: "Clinician",
        type: "patient_in_transit",
        title: "Patient In Transit",
        body: `${pName} is being transported to your clinic. Prepare for arrival.`,
        status: newStatus,
        emergencyType,
      });
    }

    if (newStatus === "delivered") {
      if (assignedAmbulanceId) {
        await markNotificationsRead({
          caseId,
          userId: assignedAmbulanceId,
          types: ["dispatch_assigned"],
        });
      }

      const adminIds = await userIdsByRole("Admin");
      await Promise.all([
        vhtId ? createCaseNotificationOnce({
          caseId,
          userId: vhtId,
          role: "VHT",
          type: "patient_delivered",
          title: "Patient Delivered",
          body: `${pName} (${emergencyType}) was delivered safely to ` +
            `${clinicName} by ${driverName}.`,
          status: newStatus,
          emergencyType,
        }) : Promise.resolve(),
        assignedClinicId ? createCaseNotificationOnce({
          caseId,
          userId: assignedClinicId,
          role: "Clinician",
          type: "patient_arriving",
          title: "Patient Arriving",
          body: `${pName} (${emergencyType}) has been delivered by ` +
            `${driverName}. Please receive the patient.`,
          status: newStatus,
          emergencyType,
        }) : Promise.resolve(),
        ...adminIds.map((adminId) => createCaseNotificationOnce({
          caseId,
          userId: adminId,
          role: "Admin",
          type: "patient_delivered",
          title: "Patient Delivered",
          body: `${pName} (${emergencyType}) was delivered safely to ` +
            `${clinicName} by ${driverName}.`,
          status: newStatus,
          emergencyType,
        })),
      ]);
    }

    if (newStatus === "completed") {
      if (assignedAmbulanceId) {
        await markNotificationsRead({
          caseId,
          userId: assignedAmbulanceId,
          types: ["dispatch_assigned"],
        });
      }

      const dischargedAt = after.dischargedAt;
      const adminIds = dischargedAt ? await userIdsByRole("Admin") : [];
      const completedType = dischargedAt ? "patient_discharged" : "case_closed";
      const completedTitle = dischargedAt ? "Patient Discharged" : "Case Closed";
      const completedBody = dischargedAt ?
        `${pName} (${emergencyType}) was treated and discharged ` +
          `from ${clinicName}. The case is complete.` :
        `${clinicianName} confirmed ${pName} (${emergencyType}) ` +
          "is okay and closed the case.";

      await Promise.all([
        vhtId ? createCaseNotificationOnce({
          caseId,
          userId: vhtId,
          role: "VHT",
          type: completedType,
          title: completedTitle,
          body: completedBody,
          status: newStatus,
          emergencyType,
        }) : Promise.resolve(),
        ...adminIds.map((adminId) => createCaseNotificationOnce({
          caseId,
          userId: adminId,
          role: "Admin",
          type: "case_completed",
          title: "Case Completed",
          body: `${pName} (${emergencyType}) was discharged from ` +
            `${clinicName} by ${clinicianName}.`,
          status: newStatus,
          emergencyType,
        })),
      ]);
    }

    // "cancelled": Case was cancelled — notify VHT.
    if (vhtId && newStatus === "cancelled") {
      await createCaseNotificationOnce({
        caseId,
        userId: vhtId,
        role: "VHT",
        type: "case_cancelled",
        title: "Case Cancelled",
        body: `Your ${emergencyType} case for ${pName} has been cancelled.`,
        status: newStatus,
        emergencyType,
      });
    }

    // NOTE: "advised" remains excluded because clinician advice text is not
    // carried by the status update alone.
  }
);
