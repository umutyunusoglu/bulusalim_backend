import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

const MAX_RETRIES = 3;

async function updateStatsWithRetry(
  file: any,
  updateFn: (stats: any) => void,
  retries = 0
): Promise<void> {
  const [exists] = await file.exists();

  let eventStats = {
    totalEvents: 0,
    categories: {} as { [key: string]: number },
    participants: {} as { [key: string]: number },
  };
  let metageneration = "0";

  if (exists) {
    const [contents, metadata] = await file.download();
    eventStats = JSON.parse(contents.toString());
    metageneration = metadata.metageneration;
  }

  updateFn(eventStats);

  try {
    await file.save(JSON.stringify(eventStats), {
      preconditionOpts: exists
        ? { ifMetagenerationMatch: metageneration }
        : { ifGenerationMatch: 0 },
    });
  } catch (err: any) {
    if (err.code === 412 && retries < MAX_RETRIES) {
      logger.warn(`Race condition detected, retrying... (${retries + 1}/${MAX_RETRIES})`);
      await updateStatsWithRetry(file, updateFn, retries + 1);
    } else {
      throw err;
    }
  }
}

export const handleEventDelete = onDocumentDeleted(
  "events/{eventId}",
  async (event) => {
    const eventId = event.params.eventId;
    const snapshot = event.data;

    if (!snapshot) {
      logger.error("Snapshot not found.");
      return;
    }

    try {
      const participantsRef = snapshot.ref.collection("participants");
      const participantsSnapshot = await participantsRef.get();

      if (!participantsSnapshot.empty) {
        // 1. eventLog güncellemeleri — bulkWriter ile toplu
        const bulkWriter = db.bulkWriter();
        for (const doc of participantsSnapshot.docs) {
          const userLogRef = db
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
            { merge: true }
          );
        }
        await bulkWriter.close();

        // 2. İstatistik dosyaları — paralel + retry ile güvenli
        const categories = snapshot.data()?.categories || [];
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const bucket = admin.storage().bucket();

        await Promise.all(
          participantsSnapshot.docs.map(async (doc) => {
            const participantID = doc.id;
            const filePath =
              `private/users/${participantID}/dumps/${currentYear}/${currentMonth}/event_stats.json`;
            const file = bucket.file(filePath);

            await updateStatsWithRetry(file, (eventStats) => {
              // totalEvents
              eventStats.totalEvents += 1;

              // categories
              for (const category of categories) {
                eventStats.categories[category] =
                  (eventStats.categories[category] || 0) + 1;
              }

              // participants
              for (const otherDoc of participantsSnapshot.docs) {
                if (otherDoc.id === participantID) continue;
                eventStats.participants[otherDoc.id] =
                  (eventStats.participants[otherDoc.id] || 0) + 1;
              }
            });
          })
        );
      }

      // 3. Tüm subcollection'ları kökten sil
      await db.recursiveDelete(snapshot.ref);
      logger.info(`Event ${eventId} and its subcollections deleted successfully.`);
    } catch (error) {
      logger.error("Cleanup error:", error);
    }
  }
);