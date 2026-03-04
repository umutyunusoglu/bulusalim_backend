import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const handleFolloweeDelete = onDocumentDeleted(
  "users/{userId}/followees/{followeeId}",
  async (event) => {
    try {
      const { userId, followeeId } = event.params;
      if (!event.data) return;

      const batch = db.batch();

      // 1. Kendi taraf: bildirimleri "none" yap
      const myNotifRef = db
        .collection("users")
        .doc(userId)
        .collection("followNotifications")
        .doc(followeeId);

      batch.set(
        myNotifRef,
        { status: "none", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );

      // 2. Karşı taraf: bildirimleri sil
      const targetNotifRef = db
        .collection("users")
        .doc(followeeId)
        .collection("followNotifications")
        .doc(userId);

      batch.delete(targetNotifRef);

      // 3. Karşı taraf: followers koleksiyonundan sil
      const targetFollowerRef = db
        .collection("users")
        .doc(followeeId)
        .collection("followers")
        .doc(userId);

      batch.delete(targetFollowerRef);

      // 4. Follower sayısını eksilt
      batch.update(db.collection("users").doc(followeeId), {
        followersCount: FieldValue.increment(-1),
      });

      await batch.commit();

      logger.info(
        `Unfollow senkronizasyonu tamamlandı: ${userId} -> ${followeeId}`,
      );
    } catch (error) {
      logger.error("handleFolloweeDelete hatası:", error);
    }
  },
);
