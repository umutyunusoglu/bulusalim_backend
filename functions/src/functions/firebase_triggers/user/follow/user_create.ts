import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

export const handleUserCreate = onDocumentCreated(
  "users/{userId}",
  async (event) => {
    try {
      const userId = event.params.userId;
      const snapshot = event.data;

      if (!snapshot) {
        logger.error("Snapshot boş geldi.");
        return;
      }

      const userData = snapshot.data();

      // Sadece public olması gereken alanları seçiyoruz
      const publicUser = {
        userID: userId,
        username: userData.username || "isimsiz_kullanici",
        profileImageUrl: userData.profileImageUrl || "",
        nameSurname: userData.nameSurname || null,
        isPrivate: userData.isPrivate ?? false,
        bio: userData.bio || null,
        university: userData.universityName || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // 'public_users' koleksiyonuna aynı ID ile kaydediyoruz
      await db.collection("public_users").doc(userId).set(publicUser);

      logger.info(`${userId} için public profil başarıyla oluşturuldu.`);
    } catch (error) {
      logger.error("handleUserCreate hatası:", error);
    }
  },
);
