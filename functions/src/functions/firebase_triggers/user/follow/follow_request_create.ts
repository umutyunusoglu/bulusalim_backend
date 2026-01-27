import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {notifyUsers} from "../../../notifications/notify_users";

const db = admin.firestore();

export const handleFollowRequestCreate = onDocumentCreated("users/{targetId}/followRequests/{userId}", async (event) => {
  try {
    const {targetId, userId} = event.params;

    // 1. Gerekli referanslar ve veriler
    const myNotificationRef = db.collection("users").doc(userId).collection("followNotifications").doc(targetId);
    const targetNotificationRef = db.collection("users").doc(targetId).collection("followNotifications").doc(userId);

    // Kullanıcı verisini push bildirimi için çekelim
    const senderDoc = await db.collection("users").doc(userId).get();
    const senderData = senderDoc.data();
    const username = senderData?.username || "Bir kullanıcı";
    const avatarUrl = senderData?.profileImageUrl;

    const batch = db.batch();

    // İŞLEM 1: Gönderen Kişinin Tarafı (Senin tarafın)
    // Eğer karşı taraf sana daha önce istek atmışsa, senin ekranında "İstek Gönderildi" (sent) görünmeli.
    const myNotificationSnap = await myNotificationRef.get();
    if (myNotificationSnap.exists && myNotificationSnap.data()?.status === "pending") {
      batch.update(myNotificationRef, {
        "status": "sent",
        "updatedAt": FieldValue.serverTimestamp(),
      });
    }

    // İŞLEM 2: Karşı Taraf (Alıcının tarafı)
    // Alıcıya "Takip İsteği" (pending) durumunu kaydediyoruz/güncelliyoruz.
    const targetDocSnap = await targetNotificationRef.get();
    const followNotifData = {
      "userID": userId,
      "username": username,
      "profileImageUrl": avatarUrl,
      "status": "pending",
      "type": "followRequest",
      "updatedAt": FieldValue.serverTimestamp(),
    };

    if (!targetDocSnap.exists) {
      batch.set(targetNotificationRef, {
        ...followNotifData,
        "createdAt": FieldValue.serverTimestamp(),
      });
    } else {
      batch.update(targetNotificationRef, followNotifData);
    }

    // Batch işlemini tamamla
    await batch.commit();

    // 3. Bölüm: Push Bildirimi Gönder (notifyUsers helper kullanımı)
    // Takip isteği özel bir durum olduğu için notifyUsers içindeki batch kısmını
    // yukarıda manuel hallettik, burada sadece Push göndermek için helper'ı çağırabiliriz.
    // Veya helper'ı sadece push için kullanacak şekilde sadeleştirebilirsin.

    await notifyUsers(
      [targetId],
      {
        title: "Yeni bir takip isteği!",
        body: `${username} seni takip etmek istiyor.`,
        type: "followRequest",
      },
      {
        userId: userId,
        avatarUrl: avatarUrl,
      }
    );

    logger.info(`Takip isteği işlendi: ${userId} -> ${targetId}`);
  } catch (error) {
    logger.error("handleFollowRequestCreate hatası:", error);
  }
});
