
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { NotificationMetadata, notifyUsers } from "../../notifications/notify_users";
import { FieldValue } from "firebase-admin/firestore";
const db = admin.firestore();




export const handleEventUpdate = onDocumentUpdated("events/{eventId}", async (event) => {
    try {
        if (!event.data) return;

        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();
        const eventId = event.data.after.id;

        if (!afterData || !beforeData) return;

        // 1. Değişiklik Kontrolleri
        const isLocationChanged = !beforeData.location?.isEqual(afterData.location);

        const isStartTimeChanged = !beforeData.startTime?.isEqual(afterData.startTime);
        console.log("isLocationChanged:", isLocationChanged);
        console.log("Previous Location:", beforeData.location);
        console.log("New Location:", afterData.location);

        const eventName = afterData.name || "Etkinlik";

        // 2. Feed Güncelleme
        await db.collection("feed").doc(eventId).set({
            ...afterData,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        // 3. Bildirim Gönderimi (Sadece değişiklik varsa katılımcıları çek)
        if (isLocationChanged || isStartTimeChanged) {
            const participantsSnapshot = await db.collection("events").doc(eventId).collection("participants").get();
            const participantIDs = participantsSnapshot.docs.map(doc => doc.id);

            if (participantIDs.length > 0) {
                const notificationMetadata: NotificationMetadata = { eventId };
                const promises: Promise<void>[] = [];

                if (isLocationChanged) {
                    promises.push(notifyUsers(
                        participantIDs,
                        {
                            title: `📍 ${eventName} Konumu Değişti!`, // Template literal düzeltildi
                            body: "Yeni konumu görüntülemek için tıkla!",
                            type: "updateLocation"
                        },
                        notificationMetadata
                    ));
                }

                if (isStartTimeChanged) {
                    promises.push(notifyUsers(
                        participantIDs,
                        {
                            title: `⏰ ${eventName} Saati Değişti!`, // Template literal düzeltildi
                            body: "Yeni saati görüntülemek için tıkla!",
                            type: "updateTime"
                        },
                        notificationMetadata
                    ));
                }

                // Bildirimleri paralel gönder
                await Promise.all(promises);
            }
        }

        logger.info(`Event update processed for: ${eventId}`);

    } catch (error) {
        logger.error("An unexpected error occurred in handleEventUpdate:", error);
    }
});