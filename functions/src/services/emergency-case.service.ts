/**
 * Emergency Case Service
 * Handles database operations for emergency cases
 */

import * as admin from "firebase-admin";
import {EmergencyCase, CreateEmergencyCaseData, UpdateEmergencyCaseData} from "../models/emergency-case.model";

const db = admin.firestore();

export class EmergencyCaseService {
  /**
   * Create a new emergency case
   */
  async createCase(data: CreateEmergencyCaseData, vhtId: string, vhtName: string): Promise<EmergencyCase> {
    try {
      const caseData: EmergencyCase = {
        ...data,
        vhtId,
        vhtName,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
        updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
      };

      const docRef = await db.collection("emergencyCases").add(caseData);

      return {
        id: docRef.id,
        ...caseData,
      };
    } catch (error: any) {
      throw new Error(`Failed to create emergency case: ${error.message}`);
    }
  }

  /**
   * Get case by ID
   */
  async getCaseById(caseId: string): Promise<EmergencyCase | null> {
    try {
      const doc = await db.collection("emergencyCases").doc(caseId).get();

      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data(),
      } as EmergencyCase;
    } catch (error: any) {
      throw new Error(`Failed to get emergency case: ${error.message}`);
    }
  }

  /**
   * Get cases with filters
   */
  async getCases(filters: {
    status?: string;
    urgencyLevel?: string;
    vhtId?: string;
    limit?: number;
  }): Promise<EmergencyCase[]> {
    try {
      let query: admin.firestore.Query = db.collection("emergencyCases");

      if (filters.status) {
        query = query.where("status", "==", filters.status);
      }
      if (filters.urgencyLevel) {
        query = query.where("urgencyLevel", "==", filters.urgencyLevel);
      }
      if (filters.vhtId) {
        query = query.where("vhtId", "==", filters.vhtId);
      }

      query = query.orderBy("createdAt", "desc");

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as EmergencyCase[];
    } catch (error: any) {
      throw new Error(`Failed to get emergency cases: ${error.message}`);
    }
  }

  /**
   * Update case
   */
  async updateCase(caseId: string, data: UpdateEmergencyCaseData): Promise<void> {
    try {
      const updateData: any = {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection("emergencyCases").doc(caseId).update(updateData);
    } catch (error: any) {
      throw new Error(`Failed to update emergency case: ${error.message}`);
    }
  }

  /**
   * Delete case
   */
  async deleteCase(caseId: string): Promise<void> {
    try {
      await db.collection("emergencyCases").doc(caseId).delete();
    } catch (error: any) {
      throw new Error(`Failed to delete emergency case: ${error.message}`);
    }
  }
}
