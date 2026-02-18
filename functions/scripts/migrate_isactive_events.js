const admin = require("firebase-admin");

// Firebase Admin SDK başlatma (Service Account ile)
const serviceAccount = require("../service_account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateEventLogs() {
  console.time("Migrasyon Süresi");
  console.log("Migrasyon başlıyor...");

  // İstatistik sayaçları
  let totalProcessed = 0;
  let updatedToTrue = 0;
  let updatedToFalse = 0;
  let errors = 0;

  // Event varlık kontrolü için basit bir In-Memory Cache
  // Key: eventID, Value: true (varsa) / false (yoksa)
  const eventExistenceCache = new Map();

  // BulkWriter başlatma (Varsayılan ayarlar genellikle yeterlidir)
  const bulkWriter = db.bulkWriter();

  // Hata dinleyicisi
  bulkWriter.onWriteError((error) => {
    errors++;
    console.error(
      `Yazma hatası (Doc: ${error.documentRef.path}):`,
      error.message,
    );
    // return true; // Eğer işlemin tekrar denenmesini isterseniz true döndürün
    return false;
  });

  try {
    // 1. ADIM: collectionGroup ile tüm eventLog dokümanlarını çekiyoruz.
    // .stream() kullanımı belleği şişirmeden büyük verileri okumamızı sağlar.
    const logsQuery = db.collectionGroup("eventLog");
    const logsStream = logsQuery.stream();

    for await (const logDoc of logsStream) {
      totalProcessed++;
      const data = logDoc.data();
      const eventID = data.eventID;
      const currentIsActive = data.isActive;

      if (!eventID) {
        console.warn(
          `Uyarı: ${logDoc.id} dokümanında eventID bulunamadı, atlanıyor.`,
        );
        continue;
      }

      let eventExists = false;

      // 2. ADIM: Cache kontrolü ve Event varlık sorgusu
      if (eventExistenceCache.has(eventID)) {
        // Cache'te varsa oradan al (Read tasarrufu)
        eventExists = eventExistenceCache.get(eventID);
      } else {
        // Cache'te yoksa veritabanından sorgula
        const eventDocRef = db.collection("events").doc(eventID);
        const eventSnapshot = await eventDocRef.get();

        eventExists = eventSnapshot.exists;

        // Sonucu cache'e yaz
        eventExistenceCache.set(eventID, eventExists);
      }

      // 3. ADIM: Değişiklik gerekiyorsa BulkWriter kuyruğuna ekle
      // Gereksiz yazma maliyetinden kaçınmak için mevcut değer ile yenisini karşılaştırıyoruz.
      if (currentIsActive !== eventExists) {
        bulkWriter.update(logDoc.ref, { isActive: eventExists });

        if (eventExists) updatedToTrue++;
        else updatedToFalse++;
      }
    }

    // Bekleyen tüm işlemlerin tamamlanmasını bekle
    await bulkWriter.close();

    console.log("-------------------------------------------");
    console.log("✅ Migrasyon Tamamlandı.");
    console.log(`📂 Toplam Taranan Log: ${totalProcessed}`);
    console.log(`🟢 isActive: true yapılanlar: ${updatedToTrue}`);
    console.log(`🔴 isActive: false yapılanlar: ${updatedToFalse}`);
    console.log(`⚠️ Hatalar: ${errors}`);
    console.log(
      `💾 Cache Boyutu (Benzersiz Event Sayısı): ${eventExistenceCache.size}`,
    );
    console.timeEnd("Migrasyon Süresi");
  } catch (error) {
    console.error("Kritik Hata:", error);
  }
}

migrateEventLogs();
