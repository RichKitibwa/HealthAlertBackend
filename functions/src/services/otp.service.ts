/**
 * OTP Service
 * Handles OTP code generation, storage, and verification
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

const db = admin.firestore();
const OTP_COLLECTION = "adminOTPs";
const OTP_EXPIRY_MINUTES = 10;

export class OTPService {
  /**
   * Generate a random 4-digit OTP code
   */
  private generateOTP(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Create and store OTP for email verification
   */
  async createOTP(email: string, phoneNumber: string): Promise<string> {
    const otpCode = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    // Delete any existing OTPs for this email
    const existingOTPs = await db
      .collection(OTP_COLLECTION)
      .where("email", "==", email)
      .get();

    const batch = db.batch();
    existingOTPs.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Create new OTP document
    const otpRef = db.collection(OTP_COLLECTION).doc();
    batch.set(otpRef, {
      email: email.toLowerCase().trim(),
      phoneNumber: phoneNumber,
      code: otpCode,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt,
      verified: false,
    });

    await batch.commit();

    functions.logger.info("OTP created", {
      email: email.substring(0, 5) + "***",
      expiresAt: expiresAt.toISOString(),
    });

    return otpCode;
  }

  /**
   * Verify OTP code
   */
  async verifyOTP(email: string, code: string): Promise<boolean> {
    try {
      const emailLower = email.toLowerCase().trim();

      // Find OTP document
      const otpQuery = await db
        .collection(OTP_COLLECTION)
        .where("email", "==", emailLower)
        .where("code", "==", code)
        .where("verified", "==", false)
        .limit(1)
        .get();

      if (otpQuery.empty) {
        functions.logger.warn("OTP not found or already used", {
          email: email.substring(0, 5) + "***",
        });
        return false;
      }

      const otpDoc = otpQuery.docs[0];
      const otpData = otpDoc.data();

      // Check if expired
      const expiresAt = otpData.expiresAt?.toDate();
      if (!expiresAt || expiresAt < new Date()) {
        functions.logger.warn("OTP expired", {
          email: email.substring(0, 5) + "***",
        });
        // Delete expired OTP
        await otpDoc.ref.delete();
        return false;
      }

      // Mark as verified
      await otpDoc.ref.update({
        verified: true,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info("OTP verified successfully", {
        email: email.substring(0, 5) + "***",
      });

      return true;
    } catch (error: any) {
      functions.logger.error("Error verifying OTP", {
        error: error.message,
        email: email.substring(0, 5) + "***",
      });
      return false;
    }
  }

  /**
   * Clean up expired OTPs (can be called periodically)
   */
  async cleanupExpiredOTPs(): Promise<number> {
    try {
      const now = new Date();
      const expiredOTPs = await db
        .collection(OTP_COLLECTION)
        .where("expiresAt", "<", now)
        .get();

      const batch = db.batch();
      expiredOTPs.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      functions.logger.info("Cleaned up expired OTPs", {
        count: expiredOTPs.size,
      });

      return expiredOTPs.size;
    } catch (error: any) {
      functions.logger.error("Error cleaning up expired OTPs", error);
      return 0;
    }
  }
}
