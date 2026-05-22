/**
 * Notification Service
 * Handles sending push notifications via Firebase Cloud Messaging (FCM)
 * and managing in-app notification documents.
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

const db = admin.firestore();

/** Maps a user role string to the matching Android notification channel ID. */
function channelIdForRole(role: string | undefined): string {
  if (!role) return "emergency_alerts";
  const r = role.toLowerCase();
  if (r.includes("ambulance")) return "ambulance_emergency";
  if (r.includes("clinic") || r.includes("clinician")) return "clinician_emergency";
  if (r.includes("admin")) return "admin_emergency";
  if (r.includes("vht")) return "vht_emergency";
  return "emergency_alerts";
}

export class NotificationService {
  /**
   * Send an FCM push notification to a specific device token.
   * Uses data-only messages so the Flutter background handler controls
   * the sound channel (role-specific). Android wakes the app via
   * high-priority FCM even when terminated.
   */
  async sendPushNotification(params: {
    fcmToken: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    recipientRole?: string;
  }): Promise<boolean> {
    try {
      if (!params.fcmToken || params.fcmToken.trim() === "") {
        functions.logger.warn("No FCM token provided, skipping push notification");
        return false;
      }

      const channelId = channelIdForRole(params.recipientRole);

      // Use a notification message so Android shows it even when the app is
      // terminated, while the correct channel/sound is specified via channelId.
      const message: admin.messaging.Message = {
        token: params.fcmToken,
        notification: {
          title: params.title,
          body: params.body,
        },
        data: {
          ...(params.data || {}),
          title: params.title,
          body: params.body,
          recipientRole: params.recipientRole ?? "",
        },
        android: {
          priority: "high",
          notification: {
            channelId,
            priority: "max",
            defaultVibrateTimings: true,
            sound: "default",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      await admin.messaging().send(message);
      functions.logger.info("Push notification sent successfully", {
        token: params.fcmToken.substring(0, 10) + "...",
        channelId,
      });
      return true;
    } catch (error: any) {
      // Handle token-related errors (invalid token, unregistered device)
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        functions.logger.warn("Invalid FCM token, removing from user document", {
          error: error.code,
        });
      } else {
        functions.logger.error("Failed to send push notification", {
          error: error.message,
        });
      }
      return false;
    }
  }

  /**
   * Send an FCM push directly to a user by looking up their FCM token
   * and role from the users Firestore collection.
   * Called by the onNotificationDocCreated trigger.
   */
  async sendPushToUser(params: {
    userId: string;
    title: string;
    body: string;
    caseId?: string;
    type?: string;
    notifDocId?: string;
  }): Promise<boolean> {
    try {
      const userDoc = await db.collection("users").doc(params.userId).get();
      const userData = userDoc.data();
      if (!userData?.fcmToken) {
        functions.logger.warn("No FCM token for user, skipping push", {
          userId: params.userId,
        });
        return false;
      }

      return await this.sendPushNotification({
        fcmToken: userData.fcmToken as string,
        title: params.title,
        body: params.body,
        recipientRole: userData.role as string | undefined,
        data: {
          caseId: params.caseId ?? "",
          type: params.type ?? "notification",
          notifDocId: params.notifDocId ?? "",
          recipientRole: (userData.role as string) ?? "",
        },
      });
    } catch (error: any) {
      functions.logger.error("sendPushToUser failed", {
        userId: params.userId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Create an in-app notification document in the 'notifications' collection.
   * Uses 'userId' field (consistent with Flutter's notification listener query).
   * The onNotificationDocCreated trigger will send the FCM push automatically.
   */
  async createInAppNotification(params: {
    recipientId: string;
    type: string;
    title: string;
    body: string;
    caseId?: string;
    data?: Record<string, string>;
    recipientRole?: string;
  }): Promise<string> {
    try {
      const notifDoc = await db.collection("notifications").add({
        userId: params.recipientId,
        recipientId: params.recipientId,
        type: params.type,
        title: params.title,
        message: params.body,
        body: params.body,
        caseId: params.caseId || null,
        data: params.data || {},
        ...(params.recipientRole ? {recipientRole: params.recipientRole} : {}),
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info("In-app notification created", {
        notificationId: notifDoc.id,
        recipientId: params.recipientId,
      });

      return notifDoc.id;
    } catch (error: any) {
      functions.logger.error("Failed to create in-app notification", {
        error: error.message,
      });
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  /**
   * Create a notification once per durable business event.
   * Firestore doc IDs are deterministic, so Cloud Function retries or repeated
   * client actions cannot create duplicate in-app notifications for the same
   * user/case/type tuple.
   */
  async createInAppNotificationOnce(params: {
    dedupeKey: string;
    recipientId: string;
    type: string;
    title: string;
    body: string;
    caseId?: string;
    data?: Record<string, string>;
    recipientRole?: string;
  }): Promise<string | null> {
    try {
      const safeKey = encodeURIComponent(params.dedupeKey).replace(/\./g, "%2E");
      const ref = db.collection("notifications").doc(safeKey);
      await ref.create({
        userId: params.recipientId,
        recipientId: params.recipientId,
        type: params.type,
        title: params.title,
        message: params.body,
        body: params.body,
        caseId: params.caseId || null,
        data: params.data || {},
        ...(params.recipientRole ? {recipientRole: params.recipientRole} : {}),
        dedupeKey: params.dedupeKey,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info("In-app notification created once", {
        notificationId: ref.id,
        recipientId: params.recipientId,
        dedupeKey: params.dedupeKey,
      });

      return ref.id;
    } catch (error: any) {
      if (error.code === 6 || error.code === "already-exists") {
        functions.logger.info("Skipping duplicate notification", {
          dedupeKey: params.dedupeKey,
          recipientId: params.recipientId,
        });
        return null;
      }
      functions.logger.error("Failed to create idempotent notification", {
        error: error.message,
        dedupeKey: params.dedupeKey,
      });
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  /**
   * Notify a clinician about a new emergency case.
   * Creates an in-app notification document; the onNotificationDocCreated
   * Firestore trigger handles sending the FCM push automatically.
   */
  async notifyClinicianOfNewCase(params: {
    clinicianId: string;
    caseId: string;
    emergencyType: string;
    urgencyLevel: string;
    patientId?: string;
    vhtName: string;
  }): Promise<{ pushSent: boolean; inAppCreated: boolean }> {
    let inAppCreated = false;

    try {
      const title = `Emergency: ${params.emergencyType}`;
      const body = `${params.urgencyLevel.toUpperCase()} - ${params.emergencyType} case reported by ${params.vhtName}`;

      await this.createInAppNotification({
        recipientId: params.clinicianId,
        type: "emergency_case",
        title,
        body,
        caseId: params.caseId,
        data: {
          emergencyType: params.emergencyType,
          urgencyLevel: params.urgencyLevel,
          patientId: params.patientId || "",
          vhtName: params.vhtName,
        },
      });
      inAppCreated = true;
    } catch (error: any) {
      functions.logger.error("Error notifying clinician", {
        clinicianId: params.clinicianId,
        caseId: params.caseId,
        error: error.message,
      });
    }

    return {pushSent: false, inAppCreated};
  }
}
