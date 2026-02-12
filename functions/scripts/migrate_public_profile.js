const admin = require("firebase-admin");

// 1. Service Account anahtarını Firebase Console > Project Settings > Service Accounts kısmından indir
const serviceAccount = require("../service_account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateUsersToPublic() {
  const usersSnapshot = await db.collection("users").get();
  console.log(`${usersSnapshot.size} kullanıcı bulundu. Taşıma başlıyor...`);

  // Firestore'da toplu yazma işlemi için batch kullanıyoruz (limit 500)
  let batch = db.batch();
  let count = 0;

  for (const doc of usersSnapshot.docs) {
    const userData = doc.data();
    const userId = doc.id;

    const publicUserRef = db.collection("public_users").doc(userId);
    
    const publicUser = {
      userID: userId,
      username: userData.username || "isimsiz",
      profileImageUrl: userData.profileImageUrl || "",
      fullname: userData.nameSurname || null,
      isPrivate: userData.isPrivate ?? false,
      bio: userData.bio || null,
      university: userData.universityName || null,
      createdAt: userData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    };

    batch.set(publicUserRef, publicUser);
    count++;

    // Firestore Batch limiti 500'dür. 
    if (count % 500 === 0) {
      await batch.commit();
      batch = db.batch();
      console.log(`${count} kullanıcı taşındı...`);
    }
  }

  // Kalanları commit et
  if (count % 500 !== 0) {
    await batch.commit();
  }

  console.log("Taşıma işlemi başarıyla tamamlandı!");
}

migrateUsersToPublic().catch(console.error);