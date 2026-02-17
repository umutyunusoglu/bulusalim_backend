import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  NotificationMetadata,
  notifyUsers,
} from "../../notifications/notify_users";

const db = admin.firestore();

// Bildirim metinlerini konfigüre edilebilir bir obje içinde tutmak daha temizdir

export const handleEventSensitiveUpdate = onDocumentUpdated(
  "events/{eventId}/sensitive/meta",
  async (event) => {
    // 1. Veri Güvenliği Kontrolü
    if (!event.data) return;

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const eventId = event.params.eventId;

    const creatorProfileImageUrl = afterData?.creator?.profileImageUrl || null;
    // Veri eksikse (örn: silinmişse) işlem yapma
    if (!beforeData || !afterData) return;

    try {
      const isLocationChanged = !beforeData.location?.isEqual(
        afterData.location,
      );

      if (!isLocationChanged) return;

      const participantsSnapshot = await db
        .collection("events")
        .doc(eventId)
        .collection("participants")
        .select()
        .get();

      if (participantsSnapshot.empty) return;

      const participantIDs = participantsSnapshot.docs.map((doc) => doc.id);

      // 4. Bildirim Gönderme
      const metadata: NotificationMetadata = { eventId };

      await notifyUsers(
        participantIDs,
        {
          title: "📍 Konum Değişti",
          body: "Yeni konumu gör!",
          type: "updateLocation",
          profileImageUrl: creatorProfileImageUrl,
          actionText: "goToEvent",
          eventId: eventId,
        },
        metadata,
      );
    } catch (error) {
      // Hata loguna eventId eklemek debug işlemini kolaylaştırır
      logger.error(`Event update failed for ID: ${eventId}`, error);
    }
  },
);
