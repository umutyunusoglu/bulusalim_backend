import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const handleEventDelete = onDocumentDeleted(
  "events/{eventId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const eventId = event.params.eventId;
    const eventRef = snapshot.ref;

    try {
      // 1. Fetch participants BEFORE starting the deletion process
      const participantsSnapshot = await eventRef
        .collection("participants")
        .get();

      if (!participantsSnapshot.empty) {
        const BATCH_SIZE = 400;
        let batch = db.batch();
        let opCount = 0;
        const batchPromises: Promise<any>[] = [];

        for (const doc of participantsSnapshot.docs) {
          const logRef = db
            .collection("users")
            .doc(doc.id)
            .collection("eventLog")
            .doc(eventId);

          batch.set(
            logRef,
            {
              status: "completed",
              isActive: false,
              endedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          opCount++;

          if (opCount >= BATCH_SIZE) {
            batchPromises.push(batch.commit());
            batch = db.batch();
            opCount = 0;
          }
        }

        if (opCount > 0) {
          batchPromises.push(batch.commit());
        }

        await Promise.all(batchPromises);
        logger.info(
          `Updated logs for ${participantsSnapshot.size} participants.`,
        );
      }

      // 2. Final Recursive Cleanup
      logger.info(`Starting recursive cleanup for event: ${eventId}`);
      await db.recursiveDelete(eventRef);
    } catch (error) {
      logger.error("Error handling event deletion:", error);
    }
  },
);
