import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { root_mail, transporter } from "../email/mail_sender";

const db = admin.firestore();
const auth = admin.auth();

export const deleteAccount = onCall(async (request) => {
  // 1. GÜVENLİK: Kimlik Doğrulama
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Yetkisiz erişim.");
  }

  const myUserID = request.auth.uid;
  const reason = request.data.reason;

  try {
    console.log(`Kullanıcı silme işlemi başlatıldı: ${myUserID}`);

    // =================================================================================
    // BÖLÜM 1: BAŞKALARININ VERİLERİNDEN KENDİNİ SİLME (Collection Group Queries)
    // =================================================================================
    // Bu koleksiyonlar başka dökümanların (User veya Event) ALTINDA yer alır.
    // Hepsini tek seferde taramak için 'collectionGroup' kullanıyoruz.
    // DİKKAT: Aşağıdaki her bir koleksiyon için Firestore Console'da INDEX oluşturman gerekecek.

    // Şemadaki isimlere birebir uyumlu liste:
    const subcollectionsToClean = [
      "followers", // users/{otherUser}/Followers/{me} -> (Ben başkasını takip ediyorsam)
      "followees", // users/{otherUser}/Followee/{me}  -> (Başkası beni takip ediyorsa)
      "bannedUsers", // users/{otherUser}/bannedUsers/{me} -> (Başkası beni engellediyse)
      "requestPool", // events/{eventID}/requestPool/{me} -> (İstek attıysam)
      "rejectedUsers", // events/{eventID}/rejectedUsers/{me} -> (Reddedildiysem)
      "participants", // events/{eventID}/participants/{me} VE posts/{postID}/participants/{me}
      "followRequests",
      "followNotifications",
    ];

    const cleanupPromises = subcollectionsToClean.map(
      async (collectionName) => {
        console.log(`${collectionName} temizliği başlıyor...`); // LOG EKLE
        const snapshot = await db
          .collectionGroup(collectionName)
          .where("userID", "==", myUserID)
          .get();

        // Eğer silinecek kayıt varsa Batch ile sil
        if (!snapshot.empty) {
          const batch = db.batch();
          snapshot.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
        return Promise.resolve();
      },
    );

    await Promise.all(cleanupPromises);

    // =================================================================================
    // BÖLÜM 2: MESAJLARI SİLME (Map Alanı Kontrolü)
    // =================================================================================
    // events/{eventID}/messages/{messageID} -> Mesajlardaki sender bir MAP.
    const messagesSnapshot = await db
      .collectionGroup("messages")
      .where("sender.userID", "==", myUserID)
      .get();

    if (!messagesSnapshot.empty) {
      const msgBatch = db.batch();
      messagesSnapshot.docs.forEach((doc) => msgBatch.delete(doc.ref));
      await msgBatch.commit();
    }

    // =================================================================================
    // BÖLÜM 3: OLUŞTURULAN ETKİNLİKLERİ DEVRETME
    // =================================================================================
    // events koleksiyonu root seviyededir (veya şemaya göre ana koleksiyondur).
    const eventsCreatedQuery = await db
      .collection("events")
      .where("creator.userID", "==", myUserID)
      .get();

    const eventHandoverPromises = eventsCreatedQuery.docs.map(
      async (eventDoc) => {
        const participantsRef = eventDoc.ref.collection("participants");
        const participantsSnapshot = await participantsRef.get();

        // Kendisi dışındaki katılımcıları bul
        const otherParticipants = participantsSnapshot.docs.filter(
          (doc) => doc.data().userID !== myUserID,
        );

        if (otherParticipants.length > 0) {
          // 1. Rastgele bir varis seç
          const randomParticipantDoc =
            otherParticipants[
              Math.floor(Math.random() * otherParticipants.length)
            ];
          const newOwnerData = randomParticipantDoc.data();

          // 2. Yeni Creator Map'ini oluştur (Şemadaki EventEntity yapısına uygun)
          const newCreatorMap = {
            userID: newOwnerData.userID,
            username: newOwnerData.username,
            profileImageUrl: newOwnerData.profileImageUrl || "",
            eventScore: null,
            role: "creator",
            status: newOwnerData.status,

            // BadgeLevel vs. varsa buraya ekle
          };

          // 3. Etkinliği güncelle
          return eventDoc.ref.update({
            creator: newCreatorMap,
          });
        } else {
          // Kimse yoksa etkinliği ve altındakileri (messages, requestPool vb.) sil
          return db.recursiveDelete(eventDoc.ref);
        }
      },
    );

    await Promise.all(eventHandoverPromises);

    // =================================================================================
    // BÖLÜM 4: KENDİ POSTLARINI SİLME
    // =================================================================================
    const postsQuery = await db
      .collection("posts")
      .where("userID", "==", myUserID)
      .get();

    // Postları ve altındaki (emotes, participants) koleksiyonları sil
    const postDeletePromises = postsQuery.docs.map((doc) =>
      db.recursiveDelete(doc.ref),
    );
    await Promise.all(postDeletePromises);

    // =================================================================================
    // BÖLÜM 5: KENDİ PROFİLİNİ SİLME
    // =================================================================================
    // users/{myID} ve altındaki tüm subcollection'lar (Followers, Followee, notifications vb.) silinir.
    console.log("Kendi profilini silme aşamasına gelindi..."); // LOG EKLE
    const userRef = db.collection("users").doc(myUserID);
    await db.recursiveDelete(userRef);

    const publicUsersRef = db.collection("public_users").doc(myUserID);
    await db.recursiveDelete(publicUsersRef);

    // =================================================================================
    // BÖLÜM 6: AUTH KAYDINI SİLME
    // =================================================================================
    await auth.deleteUser(myUserID);

    const mailOptions = {
      from: `Outnest System <${root_mail}>`,
      to: root_mail,
      subject: `[ACCOUNT DELETED] User: ${myUserID}`,
      html: `
        <h3>Kullanıcı Hesabı Silindi</h3>
        <p><strong>Silinen User ID:</strong> ${myUserID}</p>
        <p><strong>Silme Nedeni:</strong> ${reason || "Belirtilmedi"}</p>
    `,
    };

    transporter.sendMail(mailOptions);

    return { success: true, message: "Hesap temizliği tamamlandı." };
  } catch (error: any) {
    console.error("Hesap silme hatası:", error);
    throw new HttpsError("internal", error.message);
  }
});
