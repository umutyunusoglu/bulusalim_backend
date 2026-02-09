import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions/logger";
const { CloudTasksClient } = require('@google-cloud/tasks');
const tasksClient = new CloudTasksClient();

import * as config from "../configs/event_lifecycle_config.json";

const PROJECT = config.firebase.projectId;
const LOCATION = config.firebase.location;
const QUEUE = config.cloudTasks.queueName;

export const startEventLogic = onRequest(async (req, res) => {
    const { eventId } = req.body;

    logger.info("StartEventLogic tetiklendi", { eventId, body: req.body });

    if (!eventId) {
        logger.error("HATA: eventId eksik!");
        res.status(400).send("eventId eksik");
        return;
    }

    const db = admin.firestore();

    try {
        const eventRef = db.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            logger.warn(`UYARI: Buluşma bulunamadı: ${eventId}`);
            res.status(404).send("Buluşma bulunamadı.");
            return;
        }

        // Zaten çalışıyorsa ve task adı kayıtlıysa işlem yapma
        if (eventDoc.data()?.status === 'ongoing') {
            logger.info(`BİLGİ: Buluşma zaten yayında: ${eventId}`);
            res.status(200).send("Zaten yayında.");
            return;
        }

        const batch = db.batch();

        // 1. ADIM: Katılımcıları Güncelle (Update yerine Set Merge kullanarak hatayı önle)
        const participantsRef = eventRef.collection('participants');
        const snapshot = await participantsRef.get();
        logger.info(`${eventId} için katılımcı sayısı: ${snapshot.size}`);

        if (!snapshot.empty) {
            snapshot.forEach((doc) => {
                const logRef = db.collection('users').doc(doc.id).collection('eventLog').doc(eventId);
                // ÖNEMLİ: update yerine set({ ... }, { merge: true }) kullanıldı.
                // Eğer doküman yoksa 'update' patlar, 'set merge' oluşturur.
                batch.set(logRef, { status: 'ongoing' }, { merge: true });
            });
        }

        // 2. ADIM: Cloud Task (Idempotency - Tekrarlanabilirlik Koruması)
        const SIX_HOURS_IN_SECONDS = 6 * 60 * 60;
        const stopTimeSeconds = Math.floor(Date.now() / 1000) + SIX_HOURS_IN_SECONDS;

        // Task'e özel bir isim veriyoruz. Böylece fonksiyon retry etse bile 2. task oluşmaz.
        const taskName = `projects/${PROJECT}/locations/${LOCATION}/queues/${QUEUE}/tasks/stop-event-${eventId}`;

        const stopTask = {
            name: taskName, // İSMİ BURADA VERİYORUZ
            httpRequest: {
                httpMethod: 'POST',
                url: `https://${LOCATION}-${PROJECT}.cloudfunctions.net/stopEventLogic`,
                body: Buffer.from(JSON.stringify({ eventId })).toString('base64'),
                headers: { 'Content-Type': 'application/json' },
            },
            scheduleTime: { seconds: stopTimeSeconds },
        };

        let createdTaskName = taskName;

        try {
            logger.info("Cloud Task oluşturuluyor...", { queue: QUEUE, taskName });

            const [stopResponse] = await tasksClient.createTask({
                parent: tasksClient.queuePath(PROJECT, LOCATION, QUEUE),
                task: stopTask,
            });
            createdTaskName = stopResponse.name;
            logger.info(`Task başarıyla oluşturuldu: ${createdTaskName}`);

        } catch (taskError: any) {
            // Hata Kodu 6 (ALREADY_EXISTS): Task zaten var demektir.
            // Bu durumda hata fırlatma, var olan task ismini kullan ve devam et.
            if (taskError.code === 6 || taskError.details?.includes('ALREADY_EXISTS')) {
                logger.info("Task zaten mevcut, yeniden oluşturulmadı (Idempotency koruması).");
                createdTaskName = taskName;
            } else {
                // Başka bir hata varsa (yetki, kota vb.) o zaman fırlat
                logger.error("Cloud Task oluşturulurken beklenmedik hata:", taskError);
                throw taskError;
            }
        }

        // 3. ADIM: Batch Commit
        batch.update(eventRef, {
            status: 'ongoing',
            eventStopTaskName: createdTaskName
        });

        await batch.commit();

        logger.info(`SİSTEM BAŞARILI: Event ${eventId} başlatıldı.`);
        res.status(200).send("Başlatıldı");

    } catch (error: any) {
        logger.error("startEventLogic KRİTİK HATA:", {
            error: error.message,
            stack: error.stack
        });
        res.status(500).send("İşlem başarısız.");
    }
});