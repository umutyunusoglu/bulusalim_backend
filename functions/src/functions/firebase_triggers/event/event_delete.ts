import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const handleEventDelete = onDocumentDeleted(
  "events/{eventId}",

  async (event) => {
    const eventId = event.params.eventId;

    const snapshot = event.data;
    if (!snapshot) {
      logger.error("Snapshot bulunamadı.");
      return;
    }

    try {
      const participantsRef = snapshot.ref.collection("participants");
      const participantsSnapshot = await participantsRef.get();

      if (!participantsSnapshot.empty) {
        const bulkWriter = admin.firestore().bulkWriter();

        for (const doc of participantsSnapshot.docs) {
          const userLogRef = admin
            .firestore()
            .collection("users")
            .doc(doc.id)
            .collection("eventLog")
            .doc(eventId);

          bulkWriter.set(
            userLogRef,
            {
              status: "completed",
              isActive: false,
              endedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        await bulkWriter.close();
      }

      // Kalan tüm subcollection'ları kökten siler
      await db.recursiveDelete(snapshot.ref);

      logger.info(`Event ${eventId} ve bağlı tüm veriler temizlendi.`);
    } catch (error) {
      logger.error("Temizlik hatası:", error);
    }
  },
);
