import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

let tasksClientPromise: Promise<any> | null = null;
const getTasksClient = async () => {
  if (!tasksClientPromise) {
    tasksClientPromise = import("@google-cloud/tasks").then(
      ({ CloudTasksClient }) => new CloudTasksClient(),
    );
  }
  return tasksClientPromise;
};

export const stopEventLogic = onRequest(async (req, res) => {
  const { eventId } = req.body;
  logger.info("StopEventLogic tetiklendi", { eventId });

  if (!eventId) {
    res.status(400).send("eventId eksik.");
    return;
  }

  const db = admin.firestore();

  try {
    const eventRef = db.collection("events").doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      res.status(200).send("Döküman bulunamadı.");
      return;
    }

    const eventData = eventDoc.data();
    const stopTaskName = eventData?.eventStopTaskName;
    if (stopTaskName) {
      try {
        const tasksClient = await getTasksClient();
        await tasksClient.deleteTask({ name: stopTaskName });
      } catch (err) {
        // Task yoksa hatayı yut
      }
    }

    if (eventData?.status === "completed" && eventData?.expiresAt) {
      logger.info(`BİLGİ: Event tamamen bitmiş (Tarih de var): ${eventId}`);
      res.status(200).send("Zaten tamamlanmış ve tarihi atılmış.");
      return;
    }

    // ✅ Category kontrolü — badge mantığı için gerekli
    const category = eventData?.category as string | undefined;
    if (!category) {
      logger.warn(`Event'in category alanı yok: ${eventId}`);
    }



    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const expirationDate = new Date(Date.now() + ONE_DAY_MS);
    const finalExpiresAt = admin.firestore.Timestamp.fromDate(expirationDate);

    const participantsSnapshot = await eventRef.collection("participants").get();

    const BATCH_SIZE = 400;
    let batch = db.batch();
    let operationCounter = 0;
    let batchPromises: Promise<any>[] = [];

    batch.set(
      eventRef,
      {
        status: "completed",
        expiresAt: finalExpiresAt,
        eventStopTaskName: FieldValue.delete(),
        completedAt: eventData?.completedAt || FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    operationCounter++;

    if (!participantsSnapshot.empty) {
      for (const doc of participantsSnapshot.docs) {
        const userId = doc.id;

        const logRef = db
          .collection("users")
          .doc(userId)
          .collection("eventLog")
          .doc(eventId);

        const logDoc = await logRef.get();
        const isVerified = logDoc.exists && logDoc.data()?.isVerified === true;

        logger.info(
          `User: ${userId}, logDoc exists: ${logDoc.exists}, data: ${JSON.stringify(logDoc.data())}`,
        );

        // eventLog güncelle
        batch.set(
          logRef,
          {
            status: "completed",
            endedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        operationCounter++;

        if (isVerified) {
          const userRef = db.collection("users").doc(userId);

          batch.update(userRef, {
            verifiedEventCount: FieldValue.increment(1),
          });
          operationCounter++;

          if (category) {
            const activityCountRef = db
              .collection("users")
              .doc(userId)
              .collection("activityCounts")
              .doc(category);

            batch.set(
              activityCountRef,
              { count: FieldValue.increment(1) },
              { merge: true }, // doc yoksa oluşturur
            );
            operationCounter++;
          }
        }

        if (operationCounter >= BATCH_SIZE) {
          batchPromises.push(batch.commit());
          batch = db.batch();
          operationCounter = 0;
        }
      }
    }

    if (operationCounter > 0) {
      batchPromises.push(batch.commit());
    }

    await Promise.all(batchPromises);

    if (category && !participantsSnapshot.empty) {
      const badgeCheckPromises = participantsSnapshot.docs.map(async (doc) => {
        const userId = doc.id;

        const logDoc = await db
          .collection("users")
          .doc(userId)
          .collection("eventLog")
          .doc(eventId)
          .get();

        const isVerified = logDoc.exists && logDoc.data()?.isVerified === true;
        if (!isVerified) return;

        await checkAndAwardBadges(db, userId, category);
      });

      await Promise.all(badgeCheckPromises);
    }

    logger.info(`GÜNCELLEME BAŞARILI: expiresAt eklendi/güncellendi.`);
    res.status(200).send("Event completed ve expiresAt set edildi.");
  } catch (error: any) {
    logger.error("HATA:", error);
    res.status(500).send("Hata oluştu");
  }
});

async function checkAndAwardBadges(
  db: admin.firestore.Firestore,
  userId: string,
  category: string,
): Promise<void> {
  // Güncel count'ı al
  const countSnap = await db
    .collection("users")
    .doc(userId)
    .collection("activityCounts")
    .doc(category)
    .get();

  const currentCount = (countSnap.data()?.count as number) ?? 0;

  // Bu kategorideki tüm badge tanımlarını çek
  const badgeDefs = await db
    .collection("badges")
    .where("category", "==", category)
    .get();

  const awardPromises = badgeDefs.docs.map(async (badgeDoc) => {
    const { threshold, tier } = badgeDoc.data();

    if (currentCount < threshold) return;

    const userBadgeRef = db
      .collection("users")
      .doc(userId)
      .collection("badges")
      .doc(badgeDoc.id);

    const alreadyEarned = await userBadgeRef.get();
    if (alreadyEarned.exists) return;

    await userBadgeRef.set({
      earnedAt: FieldValue.serverTimestamp(),
      category,
      tier,
    });

    logger.info(`Badge verildi: ${userId} → ${badgeDoc.id} (${tier})`);
  });

  await Promise.all(awardPromises);
}