import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

export const handleUserUpdate = onDocumentUpdated("users/{userID}", async (event) => {
  try {
    // 1. Veri kontrolü
    if (!event.data) {
      logger.error("No data found in updated document.");
      return;
    }

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const userID = event.data.after.id;

    // 2. Değişiklik Kontrolü (Change Detection)
    // Eğer username veya resim değişmediyse fonksiyonu burada bitir.
    // Bu işlem maliyeti ve fonksiyon süresini ciddi oranda düşürür.
    if (
      beforeData.username === afterData.username &&
      beforeData.profileImageUrl === afterData.profileImageUrl &&
      beforeData.universityName === afterData.universityName // Bu satırı ekledik
    ) {
      logger.info("No relevant profile changes detected, skipping update.");
      return;
    }

    const username = afterData.username;
    const profileImageUrl = afterData.profileImageUrl;
    const university = afterData.universityName;


    logger.info(`Starting profile update propagation for user: ${userID}`);

    // 3. Etkinlikleri ve Postları Paralel Çekme
    // Promise.all ile iki sorguyu aynı anda başlatıyoruz.
    const [eventsSnapshot, postsSnapshot] = await Promise.all([
      db.collection("users")
        .doc(userID)
        .collection("eventLog")
        .where("status", "in", ["upcoming", "ongoing"])
        .get(),
      db.collection("users")
        .doc(userID)
        .collection("posts")
        .get(),
    ]);

    const updatePromises: Promise<any>[] = [];

    // 4. Etkinlikleri Güncelleme Mantığı
    // for...of yerine map kullanarak promise dizisi oluşturuyoruz
    const eventUpdates = eventsSnapshot.docs.map(async (doc) => {
      const eventId = doc.data().eventID;
      if (!eventId) return;

      const eventRef = db.collection("events").doc(eventId);

      // Eventi oku (Creator kontrolü için mecburuz)
      const eventSnap = await eventRef.get();
      if (!eventSnap.exists) return;

      const eventData = eventSnap.data();

      // Eğer creator bu kullanıcı ise güncelle
      if (eventData?.creator?.userID === userID) {
        // Dot notation kullanarak sadece ilgili alanları güncelle (Daha güvenli ve hızlı)
        updatePromises.push(eventRef.update({
          "creator.username": username,
          "creator.profileImageUrl": profileImageUrl,
          "creator.university": university
        },));
      }

      // Katılımcı bilgisini güncelle
      // BURADA OKUMA YAPMAYA GEREK YOK. Doğrudan update deneyebiliriz.
      // Eğer döküman yoksa hata vermemesi için { merge: true } yerine update kullanıyoruz,
      // update döküman yoksa hata fırlatır, bu yüzden catch ile yakalayabiliriz veya
      // katılımcının kesin var olduğunu varsayıyorsak direkt update ederiz.
      const participantRef = eventRef.collection("participants").doc(userID);
      updatePromises.push(
        participantRef.update({
          username: username,
          profileImageUrl: profileImageUrl,
          university: university
        }).catch((err) => {
          // Katılımcı verisi silinmişse (örneğin etkinlikten çıkmışsa) hatayı yutabiliriz.
          logger.warn(`Participant doc update failed for event ${eventId}: ${err.message}`);
        })
      );
    });

    // 5. Postları Güncelleme Mantığı
    const postUpdates = postsSnapshot.docs.map(async (doc) => {
      const postId = doc.data().postID;
      if (!postId) return;

      const postRef = db.collection("posts").doc(postId);
      const postSnap = await postRef.get();

      if (!postSnap.exists) return;

      const postData = postSnap.data();

      if (postData?.creator?.userID === userID) {
        updatePromises.push(postRef.update({
          "creator.username": username,
          "creator.profileImageUrl": profileImageUrl,
          "creator.university": university
        }));
      }
    });

    // Event ve Post döngülerini (async map) bekleyelim
    await Promise.all([...eventUpdates, ...postUpdates]);

    // Oluşan tüm update işlemlerini (Firestore yazmalarını) paralel çalıştıralım
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      logger.info(`Updated ${updatePromises.length} documents successfully.`);
    } else {
      logger.info("No documents needed updating.");
    }
  } catch (error) {
    logger.error("An unexpected error occurred in handleUserUpdate:", error);
  }
});
