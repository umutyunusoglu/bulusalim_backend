import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const handleFolloweeDelete = onDocumentDeleted("users/{userId}/followees/{followeeId}", async (event) => {
    try {
        const { userId, followeeId } = event.params;
        if (!event.data) return;

        const batch = db.batch();

        // 1. Kendi tarafın: Takip ettiğin kişiyle olan durumunu "none" yapıyoruz.
        // Bu sayede arayüzde "Takip Et" butonu tekrar görünür hale gelir.
        const myNotifRef = db.collection("users")
            .doc(userId)
            .collection("followNotifications")
            .doc(followeeId);

        batch.set(myNotifRef, {
            "status": "none",
            "updatedAt": FieldValue.serverTimestamp()
        }, { merge: true });

        // 2. Karşı taraf: Artık onu takip etmediğin için onun bildirimlerindeki kaydını siliyoruz.
        const targetNotifRef = db.collection("users")
            .doc(followeeId)
            .collection("followNotifications")
            .doc(userId);

        batch.delete(targetNotifRef);

        // İşlemleri atomik olarak gerçekleştir
        await batch.commit();

        logger.info(`Unfollow senkronizasyonu tamamlandı: ${userId} -> ${followeeId}`);
    }
    catch (error) {
        logger.error("handleFolloweeDelete hatası:", error);
    }
});