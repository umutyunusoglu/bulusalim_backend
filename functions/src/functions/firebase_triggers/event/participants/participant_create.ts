import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { AppNotificationPayload } from "../../../notifications/app_notification_payload";
import NotificationManager from "../../../notifications/notification_manager";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();


export const handleParticipantCreate = onDocumentCreated("events/{eventId}/participants/{userId}", async (event) => {
    try {
        const { eventId, userId } = event.params;
        const snapshot = event.data;
        if (!snapshot) return;

        // 1. Gerekli verileri paralel çekerek zaman kazanalım
        const [userData, eventDoc, followersOfUser] = await Promise.all([
            db.collection("users").doc(userId).get(),
            db.collection("events").doc(eventId).get(),
            db.collection("users").doc(userId).collection("followers").get()
        ]);

        const username = userData.data()?.username || "Someone";
        const userImage = userData.data()?.profileImageUrl;
        const eventData = eventDoc.data();
        const eventCategory = eventData?.hobbies?.[0] || "activity";
        const eventName = eventData?.name || "an event";

        const targetIds = followersOfUser.docs.map(doc => doc.id);
        if (targetIds.length === 0) return;

        // 2. Push Bildirimlerini Gönder
        const notificationPayload: AppNotificationPayload = {
            title: `${username} bir etkinliğe katıldı!`,
            body: `${username}, bir ${eventCategory} etkinliğine katıldı!\nGöz atmak için tıkla!`,
            type: "join"
        };

        // NotificationManager await edilmeli (içeride asenkron işlem varsa)
        await NotificationManager.sendToMultipleUsers(targetIds, notificationPayload);

        // 3. Uygulama İçi Bildirimleri Firestore'a Yaz (Promise.all ile)
        const writePromises = targetIds.map((targetId) => {
            return db.collection("users")
                .doc(targetId)
                .collection("notifications")
                .doc(`${userId}_join_${eventId}`) // Çakışmayı önlemek için benzersiz ID
                .set({
                    type: "join",
                    title: eventName,
                    message: `${username} buluşmaya katıldı.`,
                    avatarUrl: userImage,
                    createdAt: FieldValue.serverTimestamp(),
                    eventId: eventId,
                    userId: userId
                });
        });

        await Promise.all(writePromises);

        logger.info(`${username}'ın katılımı ${targetIds.length} takipçisine bildirildi.`);

    } catch (error) {
        logger.error("An unexpected error occurred in handleParticipantCreate:", error);
    }
});