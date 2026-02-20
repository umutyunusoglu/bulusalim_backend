const admin = require("firebase-admin");
const serviceAccount = require("../service_account.json");

// 1. Firebase Admin SDK Başlat
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateEventDates() {
  console.log("🚀 Field isimlendirme migrationı başlatılıyor...");

  try {
    const eventsSnapshot = await db.collection("events").get();

    if (eventsSnapshot.empty) {
      console.log("⚠️ Hiç etkinlik bulunamadı.");
      return;
    }

    console.log(
      `📦 Toplam ${eventsSnapshot.size} etkinlik bulundu. İşleniyor...`,
    );

    const batchSize = 450; // Firestore 500 limitine yakın ama güvenli.
    let batch = db.batch();
    let operationCount = 0;

    for (const doc of eventsSnapshot.docs) {
      const data = doc.data();

      // Sadece startTime olan dökümanları işle (zaten güncellenmişleri atla)
      if (data.startTime !== undefined) {
        const currentStartTime = data.startTime;

        const updateData = {
          startDate: currentStartTime, // Yeni field'ı ekle
          startTime: admin.firestore.FieldValue.delete(), // Eski field'ı sil
        };

        batch.update(doc.ref, updateData);
        operationCount++;

        // Batch limit kontrolü
        if (operationCount >= batchSize) {
          await batch.commit();
          console.log(`✅ Batch commit edildi (${operationCount} döküman).`);
          batch = db.batch();
          operationCount = 0;
        }
      }
    }

    // Kalan işlemleri tamamla
    if (operationCount > 0) {
      await batch.commit();
      console.log(`✅ Son ${operationCount} döküman güncellendi.`);
    }

    console.log(
      "🎉 Field ismi başarıyla startTime -> startDate olarak değiştirildi!",
    );
  } catch (error) {
    console.error("❌ Migration hatası:", error);
  }
}

migrateEventDates();
