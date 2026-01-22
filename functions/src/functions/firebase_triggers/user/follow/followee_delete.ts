import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const handleFolloweeDelete = onDocumentDeleted("users/{userId}/followees/{followeeId}", async (event) => {
    try {
        const { userId, followeeId } = event.params;

        if (!event.data) return;

        await Promise.all([
            // Kendi bildirim listeni güncelle (veya sil)
            db.collection("users").doc(userId)
                .collection("followNotifications").doc(followeeId)
                .set({
                    "status": "none",
                    "updatedAt": FieldValue.serverTimestamp()
                }, { merge: true }),

            // Karşı tarafın bildirimlerinden seni tamamen temizle
            db.collection("users").doc(followeeId)
                .collection("followNotifications").doc(userId)
                .delete()
        ]);

        logger.info(`User ${userId} unfollowed ${followeeId}. Notifications synced.`);
    }
    catch (error) {
        logger.error("Error in handleFolloweeDelete:", error);
    }
});