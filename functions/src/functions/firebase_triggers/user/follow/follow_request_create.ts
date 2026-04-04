import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { notifyUsers } from "../../../notifications/notify_users";

const db = admin.firestore();

export const handleFollowRequestCreate = onDocumentCreated(
  "users/{targetId}/followRequests/{userId}",
  async (event) => {
    try {
      const { targetId, userId } = event.params;
      if (!targetId || !userId) return;

      const batch = db.batch();

      // 1. Veri Hazırlığı
      const senderDoc = await db.collection("users").doc(userId).get();
      const senderData = senderDoc.data();
      const username = senderData?.username || "Bir kullanıcı";
      const profileImageUrl = senderData?.profileImageUrl || "";

      // 2. Referanslar
      const myNotificationRef = db
        .collection("users")
        .doc(userId)
        .collection("followNotifications")
        .doc(targetId);
      const targetNotificationRef = db
        .collection("users")
        .doc(targetId)
        .collection("followNotifications")
        .doc(userId);

      // İŞLEM 1: İstek Atan Kişi (Senin tarafın)
      // Burada sadece doküman varsa "sent" yapıyoruz.

      //sent pending falan legacy
      const myNotifSnap = await myNotificationRef.get();
      if (myNotifSnap.exists && myNotifSnap.data()?.status === "pending") {
        batch.update(myNotificationRef, {
          status: "sent",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // İŞLEM 2: İsteği Alan Kişi (Hedef taraf) - ASIL SORUN BURADA OLABİLİR
      // set(..., { merge: true }) kullanarak doküman yoksa oluşmasını, varsa güncellenmesini sağlarız.
      batch.set(
        targetNotificationRef,
        {
          userID: userId,
          username: username,
          profileImageUrl: profileImageUrl,
          status: "pending",
          type: "followRequest",
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(), // Merge true olduğu için mevcutsa ezilmez (eğer set içinde mantık kurarsanız)
        },
        { merge: true },
      );

      await batch.commit();

      // Bildirim gönderimi
      await notifyUsers([targetId], {
        title: "Yeni bir takip isteği!",
        body: `${username} seni takip etmek istiyor.`,
        type: "followRequest",
        actionText: "Takip İsteklerini Gör",
        profileImageUrl: profileImageUrl,
        userId: userId,
      });

      logger.info(`İşlem başarılı: ${userId} -> ${targetId}`);
    } catch (error) {
      logger.error("Hata detayı:", error);
    }
  },
);
