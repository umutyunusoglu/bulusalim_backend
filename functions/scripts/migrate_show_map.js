const admin = require('firebase-admin');
const serviceAccount = require("../service_account.json");

// 1. Firebase Admin SDK Başlat
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateEvents() {
  console.log('🚀 Migration başlatılıyor...');

  try {
    // Tüm eventleri çek
    const eventsSnapshot = await db.collection('events').get();
    
    if (eventsSnapshot.empty) {
      console.log('⚠️ Hiç etkinlik bulunamadı.');
      return;
    }

    console.log(`📦 Toplam ${eventsSnapshot.size} etkinlik bulundu. İşleniyor...`);

    const batchSize = 400; // Firestore limiti 500'dür, güvenli olsun diye 400 yapıyoruz.
    let batch = db.batch();
    let operationCount = 0;
    let batchCount = 0;

    for (const doc of eventsSnapshot.docs) {
      const data = doc.data();
      const eventId = doc.id;

      // --- 1. SENSITIVE DATA HAZIRLIĞI ---
      // Mevcut verideki location ve address'i alıyoruz.
      // Not: Firestore'dan gelen location zaten GeoPoint objesidir.
      const realLocation = data.location; 
      const realAddress = data.address;

      const sensitiveRef = db
        .collection('events')
        .doc(eventId)
        .collection('sensitive')
        .doc('meta');

      const sensitiveData = {
        realLocation: realLocation || null,
        realAddress: realAddress || null,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // --- 2. ANA DÖKÜMAN GÜNCELLEMESİ ---
      // showOnMap: true ekliyoruz.
      // showOnMap: true olduğu için location ve address'i SİLMİYORUZ (Legacy support).
      const mainDocUpdate = {
        showOnMap: true, // Mevcut etkinliklerin hepsi haritada kalsın
        // Eğer bu etkinlikler zaten private ise ve gizlemek istiyorsan burayı false yapabilirsin.
        // Ama varsayılan olarak mevcutları bozmamak için true yapıyoruz.
      };

      // Batch kuyruğuna ekle
      batch.set(sensitiveRef, sensitiveData); // Alt koleksiyonu oluştur/yaz
      batch.update(doc.ref, mainDocUpdate);   // Ana dökümanı güncelle

      operationCount += 2; // Her döngüde 2 işlem yapıyoruz (set + update)

      // --- BATCH COMMIT KONTROLÜ ---
      // Eğer limit dolduysa commit et ve yeni batch aç
      if (operationCount >= batchSize) {
        await batch.commit();
        batchCount++;
        console.log(`✅ Batch ${batchCount} tamamlandı. (${operationCount} işlem)`);
        batch = db.batch(); // Yeni batch
        operationCount = 0; // Sayacı sıfırla
      }
    }

    // Kalan son işlemleri commit et
    if (operationCount > 0) {
      await batch.commit();
      batchCount++;
      console.log(`✅ Son Batch ${batchCount} tamamlandı. (${operationCount} işlem)`);
    }

    console.log('🎉 Migration başarıyla tamamlandı!');

  } catch (error) {
    console.error('❌ Migration sırasında hata oluştu:', error);
  }
}

migrateEvents();