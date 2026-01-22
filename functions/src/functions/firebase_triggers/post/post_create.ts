import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { AppNotificationPayload } from "../../notifications/app_notification_payload";
import NotificationManager from "../../notifications/notification_manager";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const handlePostCreate = onDocumentCreated("posts/{postId}", async (event) => {
    try {
        const snapshot = event.data;
        if (!snapshot) {
            logger.error("No snapshot found.");
            return;
        }

        const postData = snapshot.data();
        if (!postData) {
            logger.error("Snapshot contains no data.");
            return;
        }

        const postId = snapshot.id;
        const postOwnerID = postData.creator?.userID;
        const creatorUsername = postData.creator?.username || "Bir kullanıcı";
        const creatorImage = postData.creator?.profileImageUrl || "";
        const eventID = postData.eventID;

        // 1. Hedef listesini oluşturma (Kendisi hariç katılımcılar)
        const participants = postData.participants || [];
        const participantIDs: string[] = participants.map((p: any) => p.userID);

        // Eğer post sahibi katılımcılar listesinde yoksa ekleyip sonra filtreliyoruz
        // Ya da direkt katılımcılardan post sahibini çıkarıyoruz:
        const targetIDs = participantIDs.filter(id => id !== postOwnerID);

        if (targetIDs.length === 0) {
            logger.info("Bildirim gönderilecek başka katılımcı yok.");
        } else {
            // 2. Push Bildirimi Gönder
            const payload: AppNotificationPayload = {
                title: "Buluşmandan biri bir fotoğraf paylaştı!",
                body: "Görüntülemek için tıkla!",
                type: "tag"
            };

            await NotificationManager.sendToMultipleUsers(targetIDs, payload);

            // 3. Uygulama içi bildirimleri Firestore'a kaydet (Paralel işlem)
            const notificationPromises = targetIDs.map(targetID => {
                return db.collection("users").doc(targetID).collection("notifications").add({
                    type: "participants",
                    title: "Yeni Paylaşım",
                    message: `${creatorUsername} senin bulunduğun bir buluşmada bir gönderi paylaştı.`,
                    avatarUrl: creatorImage,
                    createdAt: FieldValue.serverTimestamp(),
                    eventId: eventID,
                    userId: postOwnerID,
                    postId: postId // Hangi post olduğu bilgisi önemli
                });
            });

            await Promise.all(notificationPromises);
        }

        // 4. Feed koleksiyonuna kopyala
        await db.collection("feed").doc(postId).set({
            ...postData,
            createdAt: FieldValue.serverTimestamp() // Sıralama için eklendi
        });

        logger.info(`Feed entry created and notifications sent for post: ${postId}`);

    } catch (error) {
        logger.error("An unexpected error occurred in handlePostCreate:", error);
    }
});