import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();


export const handleFollowRequestCreate = onDocumentCreated("users/{targetId}/followRequests/{userId}", async (event) => {
    try {
        const { targetId, userId } = event.params;

        const myNotificationRef = db.collection("users").doc(userId).collection("followNotifications").doc(targetId);
        const targetNotificationRef = db.collection("users").doc(targetId).collection("followNotifications").doc(userId);

        const myNotificationSnap = await myNotificationRef.get();

        // İŞLEM 1: Senin tarafın (Senin bildirim kutun)
        // Eğer o sana daha önce istek atmışsa (pending), artık senin için o "sent" (istek gönderildi) durumuna geçer.
        if (myNotificationSnap.exists && myNotificationSnap.data()?.status === "pending") {
            await myNotificationRef.update({
                "status": "sent", // Frontend: FollowStatus.sent
                "updatedAt": FieldValue.serverTimestamp()
            });
        }

        // İŞLEM 2: Onun tarafı (Onun bildirim kutusu)
        const targetDocSnap = await targetNotificationRef.get();
        if (!targetDocSnap.exists) {
            await targetNotificationRef.set({
                "userID": userId,
                "status": "pending", // Frontend: FollowStatus.pending
                "type": "followRequest",
                "createdAt": FieldValue.serverTimestamp(),
                "updatedAt": FieldValue.serverTimestamp()
            });
        } else {
            await targetNotificationRef.update({
                "status": "pending",
                "updatedAt": FieldValue.serverTimestamp()
            });
        }

    } catch (error) {
        logger.error("handleFollowRequestCreate hatası:", error);
    }
});