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
    if (!event.data) return;

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const eventId = event.params.eventId;

    if (!beforeData || !afterData) return;

    try {
      const isLocationChanged = !beforeData.location?.isEqual(
        afterData.location,
      );
      if (!isLocationChanged) return;

      // --- 1. Fetch Creator Data from the Parent Event Document ---
      const eventDoc = await db.collection("events").doc(eventId).get();
      const eventData = eventDoc.data();

      const eventName = eventData?.name || "Buluşmanın"; // Fallback title
      // Extract creator info (adjust field names based on your schema)
      const creatorData = eventData?.creator;
      const creatorProfileImageUrl = creatorData?.profileImageUrl || null;
      const creatorUserId = creatorData?.userID || null;

      // --- 2. Get Participants ---
      const participantsSnapshot = await db
        .collection("events")
        .doc(eventId)
        .collection("participants")
        .select()
        .get();

      if (participantsSnapshot.empty) return;

      const participantIDs = participantsSnapshot.docs.map((doc) => doc.id);

      // --- 3. Send Notification ---
      await notifyUsers(participantIDs, {
        title: eventName,
        body: "Buluşmasının konumu değişti!",
        type: "updateLocation",
        profileImageUrl: creatorProfileImageUrl, // Dynamic from parent doc
        actionText: "Yeni Konumu Gör...",
        eventId: eventId,
        userId: creatorUserId, // Dynamic from parent doc
      });
    } catch (error) {
      logger.error(`Event update failed for ID: ${eventId}`, error);
    }
  },
);
