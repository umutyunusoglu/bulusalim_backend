const admin = require('firebase-admin');


const serviceAccount = require("../service_account.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function syncUsersToPublicUsers() {
  console.log("Senkronizasyon başlatılıyor: users -> public_users");

  try {
    const usersSnapshot = await db.collection("users").get();

    if (usersSnapshot.empty) {
      console.log("Hiç kullanıcı bulunamadı.");
      return;
    }

    let batch = db.batch();
    let operationCount = 0;
    let totalSynced = 0;

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const userID = doc.id;

      // public_users için veriyi hazırla (Cloud Function mantığı ile birebir aynı)
      const publicUserData = {
        userID: userID,
        username: userData.username ?? "isimsiz",
        profileImageUrl: userData.profileImageUrl ?? "",
        nameSurname: userData.nameSurname ?? null,
        bio: userData.bio ?? null,
        university: userData.universityName ?? null,
        isPrivate: userData.isPrivate ?? false,
        accountType: userData.accountType ?? "personal",
        communityData: userData.communityData ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const publicUserRef = db.collection("public_users").doc(userID);

      // Mevcut veriyi ezmemek için merge: true kullanıyoruz
      batch.set(publicUserRef, publicUserData, { merge: true });
      operationCount++;
      totalSynced++;

      // Firestore batch limiti maksimum 500'dür. 490'da bir commit ediyoruz.
      if (operationCount >= 490) {
        await batch.commit();
        console.log(`${totalSynced} kullanıcı senkronize edildi...`);

        // Batch'i sıfırla
        batch = db.batch();
        operationCount = 0;
      }
    }

    // Kalan işlemleri commit et
    if (operationCount > 0) {
      await batch.commit();
      console.log(`${totalSynced} kullanıcı senkronize edildi...`);
    }

    console.log(`✅ Senkronizasyon tamamlandı! Toplam ${totalSynced} kullanıcı aktarıldı/güncellendi.`);
  } catch (error) {
    console.error("❌ Senkronizasyon sırasında hata oluştu:", error);
  }
}

// Scripti tetikle
syncUsersToPublicUsers();