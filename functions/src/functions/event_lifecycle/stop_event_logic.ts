import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions/logger";
import { CloudTasksClient } from "@google-cloud/tasks";
import { FieldValue } from "firebase-admin/firestore";

const tasksClient = new CloudTasksClient();

export const stopEventLogic = onRequest(async (req, res) => {
    const { eventId } = req.body;

    logger.info("StopEventLogic tetiklendi", { eventId });

    if (!eventId) {
        res.status(400).send("eventId eksik.");
        return;
    }

    const db = admin.firestore();

    try {
        const eventRef = db.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            res.status(200).send("Döküman bulunamadı.");
            return;
        }

        const eventData = eventDoc.data();

        // --- DÜZELTİLEN KISIM BAŞLANGIÇ ---
        // ESKİSİ: Sadece status 'completed' ise duruyordu.
        // YENİSİ: Status 'completed' ise VE 'expiresAt' alanı zaten varsa durur.
        // Böylece manuel tetiklediğinde expiresAt eksikse kod çalışmaya devam eder.
        if (eventData?.status === 'completed' && eventData?.expiresAt) {
            logger.info(`BİLGİ: Event tamamen bitmiş (Tarih de var): ${eventId}`);
            res.status(200).send("Zaten tamamlanmış ve tarihi atılmış.");
            return;
        }
        // --- DÜZELTİLEN KISIM BİTİŞ ---

        // Task Temizliği
        const stopTaskName = eventData?.eventStopTaskName;
        if (stopTaskName) {
            try {
                await tasksClient.deleteTask({ name: stopTaskName });
            } catch (err) {
                // Task yoksa hatayı yut
            }
        }

        const oneDayInMs = 24 * 60 * 60 * 1000;
        // Eğer veride zaten varsa onu koru, yoksa yeni tarih oluştur
      // 24 Saat hesapla
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const expirationDate = new Date(Date.now() + ONE_DAY_MS);
        const finalExpiresAt = admin.firestore.Timestamp.fromDate(expirationDate);

        const participantsSnapshot = await eventRef.collection('participants').get();

        // Batch işlemleri
        const BATCH_SIZE = 400;
        let batch = db.batch();
        let operationCounter = 0;
        let batchPromises: Promise<any>[] = [];

        // Event güncelleme (Merge: true kullanarak varsa ezer, yoksa ekler)
        batch.set(eventRef, {
            status: 'completed',
            expiresAt: finalExpiresAt, // Tarihi buraya basıyoruz
            eventStopTaskName: FieldValue.delete(),
            // Eğer daha önce completedAt atılmadıysa şimdi at, varsa dokunma
            completedAt: eventData?.completedAt || FieldValue.serverTimestamp()
        }, { merge: true });

        operationCounter++;

        if (!participantsSnapshot.empty) {
            for (const doc of participantsSnapshot.docs) {
                const logRef = db.collection('users').doc(doc.id).collection('eventLog').doc(eventId);

                batch.set(logRef, {
                    status: 'completed',
                    endedAt: FieldValue.serverTimestamp()
                }, { merge: true });

                operationCounter++;

                if (operationCounter >= BATCH_SIZE) {
                    batchPromises.push(batch.commit());
                    batch = db.batch();
                    operationCounter = 0;
                }
            }
        }

        if (operationCounter > 0) {
            batchPromises.push(batch.commit());
        }

        await Promise.all(batchPromises);

        logger.info(`GÜNCELLEME BAŞARI  LI: expiresAt eklendi/güncellendi.`);
        res.status(200).send("Event completed ve expiresAt set edildi.");

    } catch (error: any) {
        logger.error("HATA:", error);
        res.status(500).send("Hata oluştu");
    }
});