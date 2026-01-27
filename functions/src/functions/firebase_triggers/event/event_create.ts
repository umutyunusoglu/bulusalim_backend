import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { hash } from "crypto";

const db = admin.firestore();


export const handleEventCreate = onDocumentCreated("events/{eventId}", async (event) => {
  try {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No snapshot found.");
      return;
    }

    const eventId = snapshot.id;
    const eventData = snapshot.data();

    if (!eventData) {
      logger.error("Snapshot contains no data.");
      return;
    }

    try {
      await db.collection("feed").doc(eventId).set({
        ...eventData,
      });
      logger.info(`Feed entry created for event: ${eventId}`);
    } catch (dbError) {
      logger.error(`Failed to write feed document for event ${eventId}:`, dbError);
    }
  } catch (error) {
    logger.error("An unexpected error occurred in handleEventCreate:", error);
  }
});



