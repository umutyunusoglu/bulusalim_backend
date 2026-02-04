
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { NotificationMetadata, notifyUsers } from "../../notifications/notify_users";
import { FieldValue } from "firebase-admin/firestore";
const db = admin.firestore();

const { CloudTasksClient } = require('@google-cloud/tasks');
const tasksClient = new CloudTasksClient();

// Proje bilgilerin (Bunları kendi bilgilerine göre doldur)
import * as config from "../../configs/event_lifecycle_config.json";

const PROJECT = config.firebase.projectId;
const LOCATION = config.firebase.location;
const QUEUE = config.cloudTasks.queueName;

// Worker URL'i otomatik oluşturuyoruz
const WORKER_URL = `https://${LOCATION}-${PROJECT}.cloudfunctions.net/${config.cloudTasks.workerFunctionName}`;

export const handleEventUpdate = onDocumentUpdated("events/{eventId}", async (event) => {
  try {
    if (!event.data) return;

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const eventId = event.data.after.id;
    const eventRef = event.data.after.ref;

    if (!afterData || !beforeData) return;

    // 1. Değişiklik Kontrolleri
    const isLocationChanged = !beforeData.location?.isEqual(afterData.location);

    const isStartTimeChanged = !beforeData.startTime?.isEqual(afterData.startTime);

    const isForceStarted = beforeData.status !== "ongoing" && afterData.status === "ongoing";
    console.log("isForceStarted:", isForceStarted);

    console.log("isLocationChanged:", isLocationChanged);
    console.log("Previous Location:", beforeData.location);
    console.log("New Location:", afterData.location);

    const eventName = afterData.name || "Etkinlik";

    // 2. Feed Güncelleme



    // 3. Bildirim Gönderimi (Sadece değişiklik varsa katılımcıları çek)
    if (isLocationChanged || isStartTimeChanged || isForceStarted) {
      const participantsSnapshot = await db.collection("events").doc(eventId).collection("participants").get();
      const participantIDs = participantsSnapshot.docs.map((doc) => doc.id);

      if (participantIDs.length > 0) {
        const notificationMetadata: NotificationMetadata = { eventId };
        const promises: Promise<void>[] = [];

        if (isLocationChanged) {
          promises.push(notifyUsers(
            participantIDs,
            {
              title: `📍 ${eventName} Konumu Değişti!`, // Template literal düzeltildi
              body: "Yeni konumu görüntülemek için tıkla!",
              type: "updateLocation",
            },
            notificationMetadata
          ));
        }

        if (isStartTimeChanged) {

          await tasksClient.deleteTask({ name: beforeData.eventStartTaskName }).catch(() => {
            logger.info("Silinecek task zaten çalışmış veya bulunamadı.");
          });

          if (afterData.status !== "ongoing" && afterData.status !== "completed") {
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
            await eventRef.update({ eventStartTaskName: response.name });

          }

          promises.push(notifyUsers(
            participantIDs,
            {
              title: `⏰ ${eventName} Saati Değişti!`, // Template literal düzeltildi
              body: "Yeni saati görüntülemek için tıkla!",
              type: "updateTime",
            },
            notificationMetadata
          ));
        }

        if (isForceStarted) {

          await tasksClient.deleteTask({ name: beforeData.eventStartTaskName }).catch(() => {
            logger.info("Silinecek task zaten çalışmış veya bulunamadı.");
          });

          promises.push(notifyUsers(
            participantIDs,
            {
              title: `📢 ${eventName} Etkinliği Başlatıldı!`, // Template literal düzeltildi
              body: "Etkinliği görüntülemek için tıkla!",
              type: "earlyStart",
            },
            notificationMetadata
          ));
        }


        // Bildirimleri paralel gönder
        await Promise.all(promises);
      }
    }

    logger.info(`Event update processed for: ${eventId}`);
  } catch (error) {
    logger.error("An unexpected error occurred in handleEventUpdate:", error);
  }
});
