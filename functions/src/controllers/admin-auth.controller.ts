/**
 * Admin Authentication Controller
 * Handles admin-specific authentication including email OTP verification
 */

import * as functions from "firebase-functions";
import {EmailService} from "../services/email.service";
import {OTPService} from "../services/otp.service";

const emailService = new EmailService();
const otpService = new OTPService();

/**
 * Send OTP code to admin's email
 */
export const sendAdminOTP = functions.https.onCall(async (request) => {
  try {
    const {email, phoneNumber} = request.data;

    // Validate input
    if (!email || !phoneNumber) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Email and phone number are required"
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid email format"
      );
    }

    // Optional: Add domain validation here when ready to restrict to corporate emails only
    // const allowedDomains = ['richcompany.com', 'yourcompany.com'];
    // const emailDomain = email.split('@')[1]?.toLowerCase();
    // if (!allowedDomains.includes(emailDomain)) {
    //   throw new functions.https.HttpsError(
    //     "permission-denied",
    //     "Only corporate email addresses are allowed"
    //   );
    // }

    // Generate and store OTP
    const otpCode = await otpService.createOTP(email, phoneNumber);

    // Send OTP via email
    const emailSent = await emailService.sendOTP(email, otpCode);

    if (!emailSent) {
      throw new functions.https.HttpsError(
        "internal",
        "Failed to send verification email. Please try again."
      );
    }

    functions.logger.info("Admin OTP sent", {
      email: email.substring(0, 5) + "***",
    });

    return {
      success: true,
      message: "Verification code sent to your email",
    };
  } catch (error: any) {
    functions.logger.error("Error sending admin OTP", error);

    if (error.code) {
      throw error; // Re-throw HttpsError
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Verify OTP code for admin registration
 */
export const verifyAdminOTP = functions.https.onCall(async (request) => {
  try {
    const {email, code} = request.data;

    // Validate input
    if (!email || !code) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Email and verification code are required"
      );
    }

    // Verify OTP
    const isValid = await otpService.verifyOTP(email, code);

    if (!isValid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Invalid or expired verification code"
      );
    }

    functions.logger.info("Admin OTP verified", {
      email: email.substring(0, 5) + "***",
    });

    return {
      success: true,
      message: "Email verified successfully",
    };
  } catch (error: any) {
    functions.logger.error("Error verifying admin OTP", error);

    if (error.code) {
      throw error; // Re-throw HttpsError
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});
