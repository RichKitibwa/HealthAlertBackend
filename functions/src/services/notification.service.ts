/**
 * Notification Service
 * Handles sending push notifications via Firebase Cloud Messaging (FCM)
 * and managing in-app notification documents.
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

const db = admin.firestore();

export class NotificationService {
  /**
   * Send an FCM push notification to a specific device token.
   */
  async sendPushNotification(params: {
    fcmToken: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<boolean> {
    try {
      if (!params.fcmToken || params.fcmToken.trim() === "") {
        functions.logger.warn("No FCM token provided, skipping push notification");
        return false;
      }

      const message: admin.messaging.Message = {
        token: params.fcmToken,
        notification: {
          title: params.title,
          body: params.body,
        },
        data: params.data || {},
        android: {
          priority: "high",
          notification: {
            channelId: "emergency_alerts",
            priority: "max",
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
      };

      await admin.messaging().send(message);
      functions.logger.info("Push notification sent successfully", {
        token: params.fcmToken.substring(0, 10) + "...",
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
   * Create an in-app notification document in the 'notifications' collection.
   */
  async createInAppNotification(params: {
    recipientId: string;
    type: string;
    title: string;
    body: string;
    caseId?: string;
    data?: Record<string, string>;
  }): Promise<string> {
    try {
      const notifDoc = await db.collection("notifications").add({
        recipientId: params.recipientId,
        type: params.type,
        title: params.title,
        body: params.body,
        caseId: params.caseId || null,
        data: params.data || {},
        read: false,
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
   * Notify a clinician about a new emergency case.
   * Sends both a push notification and an in-app notification.
   */
  async notifyClinicianOfNewCase(params: {
    clinicianId: string;
    caseId: string;
    emergencyType: string;
    urgencyLevel: string;
    patientId?: string;
    vhtName: string;
  }): Promise<{ pushSent: boolean; inAppCreated: boolean }> {
    let pushSent = false;
    let inAppCreated = false;

    try {
      // Get clinician's user document to find FCM token
      const clinicianDoc = await db.collection("users").doc(params.clinicianId).get();
      const clinicianData = clinicianDoc.data();

      const title = `Emergency: ${params.emergencyType}`;
      const body = `${params.urgencyLevel.toUpperCase()} - ${params.emergencyType} case reported by ${params.vhtName}`;

      // Attempt push notification
      if (clinicianData?.fcmToken) {
        pushSent = await this.sendPushNotification({
          fcmToken: clinicianData.fcmToken,
          title,
          body,
          data: {
            type: "emergency_case",
            caseId: params.caseId,
            emergencyType: params.emergencyType,
            urgencyLevel: params.urgencyLevel,
          },
        });
      }

      // Always create in-app notification
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

    return {pushSent, inAppCreated};
  }
}
