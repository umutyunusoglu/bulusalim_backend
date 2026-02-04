import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { NotificationMetadata, notifyUsers } from "../../notifications/notify_users";

const db = admin.firestore();
const { CloudTasksClient } = require('@google-cloud/tasks');
const tasksClient = new CloudTasksClient();

// Konfigürasyonlar
import * as config from "../../configs/event_lifecycle_config.json";
const PROJECT = config.firebase.projectId;
const LOCATION = config.firebase.location;
const QUEUE = config.cloudTasks.queueName;
const WORKER_URL = `https://${LOCATION}-${PROJECT}.cloudfunctions.net/${config.cloudTasks.workerFunctionName}`;

export const handleEventUpdate = onDocumentUpdated("events/{eventId}", async (event) => {
  try {
    if (!event.data) return;

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const eventId = event.params.eventId;
    const eventRef = event.data.after.ref;

    if (!afterData || !beforeData) return;

    // 1. Değişiklik Kontrolleri
    const isLocationChanged = !beforeData.location?.isEqual(afterData.location);
    const isStartTimeChanged = !beforeData.startTime?.isEqual(afterData.startTime);
    const isForceStarted = beforeData.status !== "ongoing" && afterData.status === "ongoing";

    const eventName = afterData.name || "Etkinlik";
    const oldTaskName = beforeData.eventStartTaskName;

    // 2. Task Yönetimi (Silme ve Yeni Oluşturma)
    if (isStartTimeChanged || isForceStarted) {

      // ESKİ TASK'I SİL
      if (oldTaskName) {
        try {
          logger.info(`Eski task siliniyor: ${oldTaskName}`);
          await tasksClient.deleteTask({ name: oldTaskName });
          logger.info("Eski task başarıyla silindi.");
        } catch (error: any) {
          // Hata kodu 5: Task zaten çalışmış veya manuel silinmiş demektir
          if (error.code === 5) {
            logger.info("Task bulunamadı, muhtemelen zaten çalıştı.");
          } else {
            logger.error("Task silme sırasında kritik hata:", error);
          }
        }
      }

      // YENİ TASK OLUŞTUR (Sadece zaman değiştiyse ve etkinlik hala beklemedeyse)
      if (isStartTimeChanged && afterData.status !== "ongoing" && afterData.status !== "completed") {
        const parent = tasksClient.queuePath(PROJECT, LOCATION, QUEUE);
        const task = {
          httpRequest: {
            httpMethod: 'POST',
            url: WORKER_URL,
            body: Buffer.from(JSON.stringify({ eventId })).toString('base64'),
            headers: { 'Content-Type': 'application/json' },
          },
          scheduleTime: { seconds: afterData.startTime.seconds },
        };

        const [response] = await tasksClient.createTask({ parent, task });
        logger.info(`Yeni task oluşturuldu: ${response.name}`);

        // Firestore'u güncelle (Bu işlem fonksiyonu tekrar tetikler, 
        // ancak isStartTimeChanged artık false olacağı için döngüye girmez)
        await eventRef.update({ eventStartTaskName: response.name });
      }
    }

    // 3. Bildirim Gönderimi
    const participantsSnapshot = await db.collection("events").doc(eventId).collection("participants").get();
    const participantIDs = participantsSnapshot.docs.map((doc) => doc.id);

    if (participantIDs.length > 0) {
      const notificationMetadata: NotificationMetadata = { eventId };
      const promises: Promise<void>[] = [];

      if (isLocationChanged) {
        promises.push(notifyUsers(participantIDs, {
          title: `📍 ${eventName} Konumu Değişti!`,
          body: "Yeni konumu görüntülemek için tıkla!",
          type: "updateLocation",
        }, notificationMetadata));
      }

      if (isStartTimeChanged) {
        promises.push(notifyUsers(participantIDs, {
          title: `⏰ ${eventName} Saati Değişti!`,
          body: "Yeni saati görüntülemek için tıkla!",
          type: "updateTime",
        }, notificationMetadata));
      }

      if (isForceStarted) {
        promises.push(notifyUsers(participantIDs, {
          title: `📢 ${eventName} Etkinliği Başlatıldı!`,
          body: "Etkinliği görüntülemek için tıkla!",
          type: "earlyStart",
        }, notificationMetadata));
      }

      await Promise.all(promises);
    }

    logger.info(`Event update processed for: ${eventId}`);
  } catch (error) {
    logger.error("handleEventUpdate içinde beklenmedik hata:", error);
  }
});