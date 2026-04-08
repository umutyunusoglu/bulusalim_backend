import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const handleUserUpdate = onDocumentUpdated(
  "users/{userID}",
  async (event) => {
    try {
      if (!event.data) {
        logger.error("No data found in updated document.");
        return;
      }

      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();
      const userID = event.params.userID;

      // 1. Alanların Değişiklik Kontrolü
      const fieldsToWatch = [
        "username",
        "profileImageUrl",
        "universityName",
        "nameSurname",
        "bio",
        "isPrivate",
        "accountType",
        "verifiedEventCount",
      ];

      let isProfileChanged = fieldsToWatch.some(
        (field) => beforeData[field] !== afterData[field]
      );

      const beforeCommunityStr = JSON.stringify(beforeData.communityData || null);
      const afterCommunityStr = JSON.stringify(afterData.communityData || null);

      if (beforeCommunityStr !== afterCommunityStr) {
        isProfileChanged = true;
      }

      if (!isProfileChanged) {
        logger.info("No relevant profile changes detected, skipping propagation.");
        return;
      }

      const {
        username,
        profileImageUrl,
        universityName,
        nameSurname,
        bio,
        isPrivate,
        accountType,
        communityData,
        verifiedEventCount,
      } = afterData;

      logger.info(`Starting profile update propagation for user: ${userID}`);

      // 2. Ana Profil Güncellemesi (Bağımsız ve Garanti)
      const publicUserRef = db.collection("public_users").doc(userID);
      await publicUserRef.set(
        {
          userID: userID,
          username: username ?? "isimsiz",
          profileImageUrl: profileImageUrl ?? "",
          nameSurname: nameSurname ?? null,
          bio: bio ?? null,
          university: universityName ?? null,
          isPrivate: isPrivate ?? false,
          accountType: accountType ?? "personal",
          communityData: communityData ?? null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedEventCount: verifiedEventCount ?? 0,
        },
        { merge: true }
      );

      // 3. Toplu İşlemler için BulkWriter Kurulumu
      const bulkWriter = db.bulkWriter();

      // ÖNEMLİ: Hata yönetimi. Doküman bulunamazsa (code: 5) atla!
      bulkWriter.onWriteError((error) => {
        if (error.code === 5) { // 5 = NOT_FOUND
          logger.warn(`Skipping deleted document: ${error.documentRef.path}`);
          return false; // false döndürmek: "Bu işlemi tekrar deneme, atla" demektir.
        }
        logger.error(`Write error on ${error.documentRef.path}:`, error);
        return false;
      });

      const [eventsSnapshot, postsSnapshot] = await Promise.all([
        db
          .collection("users")
          .doc(userID)
          .collection("eventLog")
          .where("status", "in", ["upcoming", "ongoing"])
          .get(),
        db.collection("users").doc(userID).collection("posts").get(),
      ]);

      // Etkinliklerin Güncellenmesi
      eventsSnapshot.docs.forEach((doc) => {
        const eventId = doc.data().eventID;
        if (!eventId) return;

        const eventRef = db.collection("events").doc(eventId);
        // BulkWriter promises döndürür, olası unhandled rejection'ları yutmak için .catch ekliyoruz.
        bulkWriter.update(eventRef, {
          "creator.username": username ?? null,
          "creator.profileImageUrl": profileImageUrl ?? null,
          "creator.university": universityName ?? null,
        }).catch(() => { });

        const participantRef = eventRef.collection("participants").doc(userID);
        bulkWriter.update(participantRef, {
          username: username ?? null,
          profileImageUrl: profileImageUrl ?? null,
          university: universityName ?? null,
        }).catch(() => { });
      });

      // Postların Güncellenmesi
      postsSnapshot.docs.forEach((doc) => {
        const postId = doc.data().postID;
        if (!postId) return;

        const postRef = db.collection("posts").doc(postId);
        bulkWriter.update(postRef, {
          "creator.username": username ?? null,
          "creator.profileImageUrl": profileImageUrl ?? null,
          "creator.university": universityName ?? null,
        }).catch(() => { });
      });

      // 4. Tüm Kuyruktaki İşlemlerin Bitmesini Bekle
      await bulkWriter.close();

      logger.info(`Successfully propagated deep changes for user: ${userID}.`);
    } catch (error) {
      logger.error("An unexpected error occurred in handleUserUpdate:", error);
    }
  }
);