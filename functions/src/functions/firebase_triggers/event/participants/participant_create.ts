import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {AppNotificationPayload} from "../../../notifications/app_notification_payload";
import {notifyUsers} from "../../../notifications/notify_users";

const db = admin.firestore();

export const handleParticipantCreate = onDocumentCreated("events/{eventId}/participants/{userId}", async (event) => {
  try {
    const {eventId, userId} = event.params;
    const snapshot = event.data;
    if (!snapshot) return;

    // 1. Veri toplama - Participants alt koleksiyonunu da ekliyoruz
    const [userData, eventDoc, followersSnapshot, participantsSnapshot] = await Promise.all([
      db.collection("users").doc(userId).get(),
      db.collection("events").doc(eventId).get(),
      db.collection("users").doc(userId).collection("followers").get(),
      db.collection("events").doc(eventId).collection("participants").get(), // Alt koleksiyonu çekiyoruz
    ]);

    const user = userData.data();
    const eventData = eventDoc.data();

    const username = user?.username || "Biri";
    const userImage = user?.profileImageUrl;
    const eventName = eventData?.name || "bir buluşma";
    const category = eventData?.hobbies?.[0] || "buluşma";

    const sharedData = {eventId, userId, eventName, userImage};

    // 2. Takipçileri Belirle
    const followerIds = followersSnapshot.docs.map((doc) => doc.id);
    const followerPayload: AppNotificationPayload = {
      title: `${username} bir etkinliğe katıldı!`,
      body: `${username}, bir ${category} etkinliğine katıldı!`,
      type: "join",
    };

    // 3. Katılımcıları Belirle (Alt koleksiyondan gelen veriyi filtrele)
    // Döküman ID'leri userId'ye denk geldiği için doc.id kullanıyoruz
    const allParticipantIds = participantsSnapshot.docs.map((doc) => doc.id);
    const otherParticipants = allParticipantIds.filter((id) => id !== userId);

    const participantPayload: AppNotificationPayload = {
      title: `${eventName} için yeni katılımcı!`,
      body: `${username} bu etkinliğe katıldı. Kimlerin geldiğine bak!`,
      type: "participants",
    };

    // 4. Bildirimleri Gönder
    await Promise.all([
      notifyUsers(followerIds, followerPayload, sharedData),
      notifyUsers(otherParticipants, participantPayload, sharedData),
    ]);

    logger.info(`Bildirimler ${followerIds.length} takipçiye ve ${otherParticipants.length} katılımcıya iletildi.`);
  } catch (error) {
    logger.error("handleParticipantCreate Hatası:", error);
  }
});
