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

      // 1. Basit Alanların Değişiklik Kontrolü
      const fieldsToWatch = [
        "username",
        "profileImageUrl",
        "universityName",
        "nameSurname",
        "bio",
        "isPrivate",
        "accountType", // <-- Eklendi
      ];

      let isProfileChanged = fieldsToWatch.some(
        (field) => beforeData[field] !== afterData[field]
      );

      // 2. Obje (Map) Olan communityData'nın Değişiklik Kontrolü (Deep Check)
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
        accountType,    // <-- Eklendi
        communityData,  // <-- Eklendi
      } = afterData;

      const batches: Promise<admin.firestore.WriteResult[]>[] = [];
      let currentBatch = db.batch();
      let operationCount = 0;

      const commitBatchIfFull = () => {
        if (operationCount >= 490) { 
          batches.push(currentBatch.commit());
          currentBatch = db.batch();
          operationCount = 0;
        }
      };

      // 3. Public User Güncellemesi (Yeni alanlarla birlikte)
      const publicUserRef = db.collection("public_users").doc(userID);
      currentBatch.set(
        publicUserRef,
        {
          userID: userID,
          username: username ?? "isimsiz",
          profileImageUrl: profileImageUrl ?? "",
          nameSurname: nameSurname ?? null,
          bio: bio ?? null,
          university: universityName ?? null,
          isPrivate: isPrivate ?? false,
          accountType: accountType ?? "personal", // <-- Varsayılan atandı
          communityData: communityData ?? null,   // <-- Obje olarak doğrudan Firestore'a yazılır
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true } 
      );
      operationCount++;

      logger.info(`Starting profile update propagation for user: ${userID}`);

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
        currentBatch.update(eventRef, {
          "creator.username": username ?? null,
          "creator.profileImageUrl": profileImageUrl ?? null,
          "creator.university": universityName ?? null,
          // Not: Eğer etkinliklerde accountType görünmesi gerekiyorsa buraya da ekleyebilirsin:
          // "creator.accountType": accountType ?? "personal",
        });
        operationCount++;
        commitBatchIfFull();

        const participantRef = eventRef.collection("participants").doc(userID);
        currentBatch.update(participantRef, {
          username: username ?? null,
          profileImageUrl: profileImageUrl ?? null,
          university: universityName ?? null,
        });
        operationCount++;
        commitBatchIfFull();
      });

      // Postların Güncellenmesi
      postsSnapshot.docs.forEach((doc) => {
        const postId = doc.data().postID;
        if (!postId) return;

        const postRef = db.collection("posts").doc(postId);
        currentBatch.update(postRef, {
          "creator.username": username ?? null,
          "creator.profileImageUrl": profileImageUrl ?? null,
          "creator.university": universityName ?? null,
        });
        operationCount++;
        commitBatchIfFull();
      });

      if (operationCount > 0) {
        batches.push(currentBatch.commit());
      }

      await Promise.all(batches);

      logger.info(
        `Successfully updated public profile and propagated changes via ${batches.length} batch(es).`
      );
    } catch (error) {
      logger.error("An unexpected error occurred in handleUserUpdate:", error);
    }
  }
);