import nodemailer from "nodemailer";
import * as functions from "firebase-functions";

export class EmailService {
  private corporateTransporter: nodemailer.Transporter | null = null;
  private gmailTransporter: nodemailer.Transporter | null = null;

  /**
   * Get configuration value from environment variable or legacy config
   */
  private getConfig(key: string, legacyKey?: string): string | undefined {
    // Try environment variable first (new way)
    const envValue = process.env[key];
    if (envValue) return envValue;

    // Fallback to legacy functions.config() for backward compatibility
    if (legacyKey) {
      try {
        const legacyConfig = functions.config();
        const keys = legacyKey.split(".");
        let value: any = legacyConfig;
        for (const k of keys) {
          value = value?.[k];
        }
        if (value) return value;
      } catch {
        // Ignore if config is not available
      }
    }

    return undefined;
  }

  /**
   * Get SMTP configuration based on email domain
   */
  private getSMTPConfig(email: string): {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    fromEmail: string;
    fromName: string;
  } {
    // Get configuration from environment variables (new way) or legacy config (fallback)
    const smtpHost = this.getConfig("EMAIL_SMTP_HOST", "email.smtp_host");
    const smtpPort = this.getConfig("EMAIL_SMTP_PORT", "email.smtp_port") || "587";
    const smtpUser = this.getConfig("EMAIL_SMTP_USER", "email.smtp_user");
    const smtpPassword = this.getConfig("EMAIL_SMTP_PASSWORD", "email.smtp_password");
    const fromEmail = this.getConfig("EMAIL_FROM_EMAIL", "email.from_email") || smtpUser;
    const fromName = this.getConfig("EMAIL_FROM_NAME", "email.from_name") || "HealthAlert";
    const useCorporate = this.getConfig("EMAIL_USE_CORPORATE", "email.use_corporate") === "true";

    const gmailUser = this.getConfig("EMAIL_GMAIL_SMTP_USER", "email.gmail_smtp_user");
    const gmailPassword = this.getConfig("EMAIL_GMAIL_SMTP_PASSWORD", "email.gmail_smtp_password");

    const isGmail = email.toLowerCase().endsWith("@gmail.com") ||
                    email.toLowerCase().endsWith("@googlemail.com");

    // If corporate email is configured and email is not Gmail, use corporate
    if (useCorporate && smtpHost && smtpUser && smtpPassword && !isGmail) {
      return {
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: smtpPort === "465",
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
        fromEmail: fromEmail || smtpUser,
        fromName: fromName,
      };
    }

    // Fallback to Gmail if Gmail credentials are configured
    if (gmailUser && gmailPassword) {
      return {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: gmailUser,
          pass: gmailPassword,
        },
        fromEmail: gmailUser,
        fromName: fromName,
      };
    }

    // Default to corporate if configured
    if (smtpHost && smtpUser && smtpPassword) {
      return {
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: smtpPort === "465",
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
        fromEmail: fromEmail || smtpUser,
        fromName: fromName,
      };
    }

    throw new Error(
      "Email configuration not set. Please configure environment variables or Firebase Functions config. " +
      "See EMAIL_OTP_SETUP_GUIDE.md for setup instructions."
    );
  }

  /**
   * Initialize email transporter based on email domain
   */
  private getTransporter(email: string): nodemailer.Transporter {
    const useCorporate = this.getConfig("EMAIL_USE_CORPORATE", "email.use_corporate") === "true";
    const smtpHost = this.getConfig("EMAIL_SMTP_HOST", "email.smtp_host");
    const isGmail = email.toLowerCase().endsWith("@gmail.com") ||
                    email.toLowerCase().endsWith("@googlemail.com");

    // Use corporate transporter for corporate emails
    if (useCorporate && smtpHost && !isGmail) {
      if (!this.corporateTransporter) {
        const smtpConfig = this.getSMTPConfig(email);
        this.corporateTransporter = nodemailer.createTransport({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          auth: smtpConfig.auth,
        });
      }
      return this.corporateTransporter;
    }

    // Use Gmail transporter for Gmail addresses or as fallback
    if (!this.gmailTransporter) {
      const smtpConfig = this.getSMTPConfig(email);
      this.gmailTransporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: smtpConfig.auth,
      });
    }
    return this.gmailTransporter;
  }

  /**
   * Send OTP code to email
   */
  async sendOTP(email: string, otpCode: string): Promise<boolean> {
    try {
      const smtpConfig = this.getSMTPConfig(email);
      const transporter = this.getTransporter(email);

      const mailOptions = {
        from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
        to: email,
        subject: "Admin Registration Verification Code",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0077CC;">Admin Registration Verification</h2>
            <p>Hello,</p>
            <p>You are registering as an administrator for the Health Alert System.</p>
            <p>Your verification code is:</p>
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center;
              margin: 20px 0; border-radius: 8px;">
              <h1 style="color: #0077CC; margin: 0; font-size: 32px;
                letter-spacing: 4px;">${otpCode}</h1>
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you did not request this code, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply.</p>
          </div>
        `,
        text: `
          Admin Registration Verification
          
          Your verification code is: ${otpCode}
          
          This code will expire in 10 minutes.
          
          If you did not request this code, please ignore this email.
        `,
      };

      await transporter.sendMail(mailOptions);
      functions.logger.info("OTP email sent successfully", {
        email: email.substring(0, 5) + "***",
        smtp: smtpConfig.host,
      });
      return true;
    } catch (error: any) {
      functions.logger.error("Failed to send OTP email", {
        error: error.message,
        email: email.substring(0, 5) + "***",
      });
      return false;
    }
  }

  /**
   * Send report/notification email to admin
   */
  async sendReportEmail(
    email: string,
    subject: string,
    content: string,
    attachment?: {filename: string; content: Buffer}
  ): Promise<boolean> {
    try {
      const smtpConfig = this.getSMTPConfig(email);
      const transporter = this.getTransporter(email);

      const mailOptions: nodemailer.SendMailOptions = {
        from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
        to: email,
        subject: subject,
        html: content,
        text: content.replace(/<[^>]*>/g, ""), // Strip HTML for text version
      };

      if (attachment) {
        mailOptions.attachments = [
          {
            filename: attachment.filename,
            content: attachment.content,
          },
        ];
      }

      await transporter.sendMail(mailOptions);
      functions.logger.info("Report email sent successfully", {
        email: email.substring(0, 5) + "***",
        smtp: smtpConfig.host,
      });
      return true;
    } catch (error: any) {
      functions.logger.error("Failed to send report email", {
        error: error.message,
        email: email.substring(0, 5) + "***",
      });
      return false;
    }
  }
}
