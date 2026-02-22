import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// Yardımcı fonksiyon: Bir koleksiyondaki tüm dökümanları siler
async function deleteCollection(
  ref: admin.firestore.CollectionReference,
  batchSize: number = 450,
) {
  const query = ref.limit(batchSize);
  const snapshot = await query.get();

  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  // Eğer hala veri varsa rekürsif olarak devam et
  if (snapshot.size >= batchSize) {
    await deleteCollection(ref, batchSize);
  }
}

export const handleEventDelete = onDocumentDeleted(
  {
    document: "events/{eventId}",
    memory: "512MiB",
    timeoutSeconds: 540, // 9 dakika - Çok fazla mesaj/katılımcı varsa süre lazım
  },
  async (event) => {
    const eventId = event.params.eventId;
    const snapshot = event.data;
    if (!snapshot) return;

    const eventRef = snapshot.ref;

    try {
      // 1. ÖZEL DURUM: Participants (Hem log güncellemesi hem silme)
      const participantsSnapshot = await eventRef
        .collection("participants")
        .get();
      if (!participantsSnapshot.empty) {
        let batch = db.batch();
        let count = 0;

        for (const doc of participantsSnapshot.docs) {
          // Log güncelle
          batch.set(
            db
              .collection("users")
              .doc(doc.id)
              .collection("eventLog")
              .doc(eventId),
            {
              status: "completed",
              isActive: false,
              endedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          // Katılımcıyı sil
          batch.delete(doc.ref);
          count += 2;

          if (count >= 450) {
            await batch.commit();
            batch = db.batch();
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      // 2. DİĞER TÜM ALT KOLEKSİYONLARI SİL
      // Bunlar sadece silinecek, ekstra işlem yok
      const otherCollections = [
        "messages",
        "requestPool",
        "rejectedUsers",
        "sensitive",
      ];

      await Promise.all(
        otherCollections.map((colName) =>
          deleteCollection(eventRef.collection(colName)),
        ),
      );

      logger.info(
        `Event ${eventId} ve tüm bağlı veriler (5 alt koleksiyon) temizlendi.`,
      );
    } catch (error) {
      logger.error("Temizlik sırasında hata:", error);
    }
  },
);
