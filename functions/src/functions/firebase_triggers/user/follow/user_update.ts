import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

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
      const userID = event.params.userID; // Event params'dan almak daha garantidir

      // 1. Değişiklik Kontrolü (Change Detection)
      // Public profile ve diğer yerleri etkileyen alanlar değişti mi?
      const isProfileChanged =
        beforeData.username !== afterData.username ||
        beforeData.profileImageUrl !== afterData.profileImageUrl ||
        beforeData.universityName !== afterData.universityName ||
        beforeData.nameSurname !== afterData.nameSurname ||
        beforeData.bio !== afterData.bio ||
        beforeData.isPrivate !== afterData.isPrivate;

      if (!isProfileChanged) {
        logger.info(
          "No relevant profile changes detected, skipping propagation.",
        );
        return;
      }

      const {
        username,
        profileImageUrl,
        universityName,
        nameSurname,
        bio,
        isPrivate,
      } = afterData;
      const updatePromises: Promise<any>[] = [];

      // --- A. PUBLIC_USERS GÜNCELLEME (Yeni Eklediğimiz Kısım) ---
      const publicUserRef = db.collection("public_users").doc(userID);
      updatePromises.push(
        publicUserRef.set(
          {
            userID: userID,
            username: username ?? "isimsiz",
            profileImageUrl: profileImageUrl ?? "",
            nameSurname: nameSurname ?? null,
            bio: bio ?? null,
            university: universityName ?? null,
            isPrivate: isPrivate ?? false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      );

      // --- B. ETKİNLİK VE POST PROPAGASYONU ---
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

      // Etkinlikleri İşle
      eventsSnapshot.docs.forEach((doc) => {
        const eventId = doc.data().eventID;
        if (!eventId) return;

        const eventRef = db.collection("events").doc(eventId);

        // 1. Creator bilgisini güncelle (Dot notation ile dökümanı okumadan update deniyoruz)
        // Önemli: Eğer creator o değilse Firestore kuralları veya uygulama mantığıyla hata almamak için
        // burada event dökümanını kontrol etmek veya "events" koleksiyonunda creatorID'ye göre sorgu atmak daha iyidir.
        // Şimdilik senin mantığınla devam ediyoruz:
        updatePromises.push(
          eventRef
            .update({
              "creator.username": username,
              "creator.profileImageUrl": profileImageUrl,
              "creator.university": universityName,
            })
            .catch(() => {
              /* Creator değilse hata verebilir, yutuyoruz */
            }),
        );

        // 2. Katılımcı bilgisini güncelle
        const participantRef = eventRef.collection("participants").doc(userID);
        updatePromises.push(
          participantRef
            .update({
              username: username,
              profileImageUrl: profileImageUrl,
              university: universityName,
            })
            .catch(() => {
              /* Katılımcı değilse yutuyoruz */
            }),
        );
      });

      // Postları İşle
      postsSnapshot.docs.forEach((doc) => {
        const postId = doc.data().postID;
        if (!postId) return;

        const postRef = db.collection("posts").doc(postId);
        updatePromises.push(
          postRef
            .update({
              "creator.username": username,
              "creator.profileImageUrl": profileImageUrl,
              "creator.university": universityName,
            })
            .catch(() => {
              /* Creator değilse yutuyoruz */
            }),
        );
      });

      // Tüm işlemleri paralel bitir
      await Promise.all(updatePromises);
      logger.info(
        `Updated public profile and propagated changes to ${updatePromises.length - 1} related records.`,
      );
    } catch (error) {
      logger.error("An unexpected error occurred in handleUserUpdate:", error);
    }
  },
);
