import { onRequest, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import PromisePool from "es6-promise-pool";

const MAX_CONCURRENT = 5;

export const manualZombieCleanup = onRequest(async (request, response) => {
  const db = admin.firestore();
  const mainCollections = ["events", "posts", "users"];
  let totalDeleted = 0;

  for (const colName of mainCollections) {
    logger.info(`${colName} için veriler aranıyor...`);

    const allDocRefs = await db.collection(colName).listDocuments();
    let index = 0;

    const promiseProducer = () => {
      if (index >= allDocRefs.length) {
        return undefined;
      }

      const docRef = allDocRefs[index++];

      return (async () => {
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
          logger.warn(`Zombi koleksiyon siliniyor: ${docRef.path}`);
          await db.recursiveDelete(docRef);
          totalDeleted++;
        }
      })();
    };

    const pool = new PromisePool(promiseProducer, MAX_CONCURRENT);
    await pool.start();

    logger.info(`${colName} koleksiyonu tamamen tarandı.`);
  }

  logger.log(
    `Zombi temizliği bitti. Toplam silinen zombi sayısı: ${totalDeleted}`,
  );

  // İşlem bitince Client'a (Admin Panele) bilgi gönderiyoruz
  response.json({ success: true, deletedZombies: totalDeleted });
});
