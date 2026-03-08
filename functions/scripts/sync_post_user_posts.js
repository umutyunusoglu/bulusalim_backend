const admin = require("firebase-admin");
const serviceAccount = require("../service_account.json");

// 1. Firebase Admin SDK Başlat
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function syncPostsToUserSubcollections() {
  console.log("🚀 Posts senkronizasyonu başlatılıyor...");

  try {
    const postsSnapshot = await db.collection("posts").get();
    const validPostIds = new Set(); // Ana koleksiyondaki post ID'lerini hafızada tutacağız

    // --- 1. AŞAMA: KOPYALAMA ---
    if (postsSnapshot.empty) {
      console.log("⚠️ Ana posts koleksiyonunda hiç post bulunamadı.");
    } else {
      console.log(`📦 Toplam ${postsSnapshot.size} ana post bulundu. Kopyalanıyor...`);

      const batchSize = 450;
      let copyBatch = db.batch();
      let copyOperationCount = 0;

      for (const doc of postsSnapshot.docs) {
        const data = doc.data();
        const postId = doc.id;
        const userId = data.creator.userID; // Veritabanındaki isme göre burayı kontrol et

        // Post ID'sini geçerli listeye ekle
        validPostIds.add(postId);

        if (!userId) {
          console.log(`⚠️ Post (${postId}) için userId bulunamadı, atlanıyor.`);
          continue;
        }

        const newUserPostRef = db
          .collection("users")
          .doc(userId)
          .collection("posts")
          .doc(postId);

        copyBatch.set(newUserPostRef, data);
        copyOperationCount++;

        // Kopyalama Batch limit kontrolü
        if (copyOperationCount >= batchSize) {
          await copyBatch.commit();
          console.log(`✅ Kopyalama batch commit edildi (${copyOperationCount} döküman).`);
          copyBatch = db.batch();
          copyOperationCount = 0;
        }
      }

      // Kalan kopyalama işlemlerini tamamla
      if (copyOperationCount > 0) {
        await copyBatch.commit();
        console.log(`✅ Son kopyalama batch commit edildi (${copyOperationCount} döküman).`);
      }
      console.log("🎉 Kopyalama aşaması tamamlandı!");
    }

    // --- 2. AŞAMA: TEMİZLİK (Eksik olanları silme) ---
    console.log("🧹 Temizlik aşaması başlatılıyor: Ana posts'ta olmayanlar alt koleksiyonlardan silinecek...");

    const usersSnapshot = await db.collection("users").get();
    
    const batchSize = 450;
    let deleteBatch = db.batch();
    let deleteOperationCount = 0;
    let totalDeleted = 0;

    console.log(`👥 ${usersSnapshot.size} kullanıcının alt koleksiyonları kontrol ediliyor...`);

    for (const userDoc of usersSnapshot.docs) {
      // Her kullanıcının posts alt koleksiyonunu getir
      const userPostsSnapshot = await userDoc.ref.collection("posts").get();

      for (const userPostDoc of userPostsSnapshot.docs) {
        const userPostId = userPostDoc.id;

        // Eğer bu döküman ana posts koleksiyonunda yoksa, silinmek üzere işaretle
        if (!validPostIds.has(userPostId)) {
          deleteBatch.delete(userPostDoc.ref);
          deleteOperationCount++;
          totalDeleted++;

          // Silme Batch limit kontrolü
          if (deleteOperationCount >= batchSize) {
            await deleteBatch.commit();
            console.log(`🗑️ Silme batch commit edildi (${deleteOperationCount} döküman silindi).`);
            deleteBatch = db.batch();
            deleteOperationCount = 0;
          }
        }
      }
    }

    // Kalan silme işlemlerini tamamla
    if (deleteOperationCount > 0) {
      await deleteBatch.commit();
      console.log(`🗑️ Son silme batch commit edildi (${deleteOperationCount} döküman silindi).`);
    }

    console.log(`🎉 Senkronizasyon başarıyla tamamlandı! Toplam ${totalDeleted} geçersiz/eski post silindi.`);

  } catch (error) {
    console.error("❌ Senkronizasyon hatası:", error);
  }
}

syncPostsToUserSubcollections();