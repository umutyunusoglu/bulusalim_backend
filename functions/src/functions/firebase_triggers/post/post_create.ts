import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { notifyUsers } from "../../notifications/notify_users";

const db = admin.firestore();

export const handlePostCreate = onDocumentCreated(
  "posts/{postId}",
  async (event) => {
    try {
      const snapshot = event.data;
      if (!snapshot) return;

      const postData = snapshot.data();
      if (!postData) return;

      const postId = snapshot.id;
      const postOwnerID = postData.creator?.userID;
      const creatorUsername = postData.creator?.username || "Bir kullanıcı";
      const creatorImage = postData.creator?.profileImageUrl;
      const eventID = postData.eventID;

      // 1. Hedef Listesini Belirle (Kendisi hariç katılımcılar)
      const participantIDs: string[] = (postData.participants || []).map(
        (p: any) => p.userID,
      );
      const targetIDs = participantIDs.filter((id) => id !== postOwnerID);

      // 2. Bildirim Gönder (Yeni notifyUsers mantığı)
      if (targetIDs.length > 0) {
        await notifyUsers(targetIDs, {
          title: "Yeni bir fotoğraf paylaşıldı!",
          body: `${creatorUsername} senin de olduğun grupta bir paylaşım yaptı.`,
          type: "participants",
          actionText: "Gönderiyi Gör",
          profileImageUrl: creatorImage,
          userId: postOwnerID,
          eventId: eventID,
          postId: postId,
        });
      }

      // 3. Feed Koleksiyonuna Yaz

      logger.info(
        `Post ${postId} için feed oluşturuldu ve ${targetIDs.length} kişiye bildirim gitti.`,
      );
    } catch (error) {
      logger.error("handlePostCreate Hatası:", error);
    }
  },
);
