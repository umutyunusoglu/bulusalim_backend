import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  NotificationMetadata,
  notifyUsers,
} from "../../notifications/notify_users";

const db = admin.firestore();
const { CloudTasksClient } = require("@google-cloud/tasks");
const tasksClient = new CloudTasksClient();

// Konfigürasyonlar
import * as config from "../../configs/event_lifecycle_config.json";
const PROJECT = config.firebase.projectId;
const LOCATION = config.firebase.location;
const QUEUE = config.cloudTasks.queueName;
const WORKER_URL = `https://${LOCATION}-${PROJECT}.cloudfunctions.net/${config.cloudTasks.workerFunctionName}`;

export const handleEventUpdate = onDocumentUpdated(
  "events/{eventId}",
  async (event) => {
    try {
      if (!event.data) return;

      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();
      const eventId = event.params.eventId;
      const eventRef = event.data.after.ref;

      if (!afterData || !beforeData) return;

      const isLocationChanged = !beforeData.location?.isEqual(
        afterData.location,
      );
      const isStartTimeChanged = !beforeData.startTime?.isEqual(
        afterData.startTime,
      );
      const isForceStarted =
        beforeData.status !== "ongoing" && afterData.status === "ongoing";

      // 2. Task Management
      if (isStartTimeChanged || isForceStarted) {
        if (beforeData.eventStartTaskName) {
          try {
            await tasksClient.deleteTask({
              name: beforeData.eventStartTaskName,
            });
          } catch (e: any) {
            if (e.code !== 5) logger.error("Task delete error", e);
          }
        }

        if (
          isStartTimeChanged &&
          !["ongoing", "completed"].includes(afterData.status)
        ) {
          const parent = tasksClient.queuePath(PROJECT, LOCATION, QUEUE);
          const task = {
            httpRequest: {
              httpMethod: "POST",
              url: WORKER_URL,
              body: Buffer.from(JSON.stringify({ eventId })).toString("base64"),
              headers: { "Content-Type": "application/json" },
            },
            scheduleTime: { seconds: afterData.startTime.seconds },
          };

          const [response] = await tasksClient.createTask({ parent, task });

          // Safety: Only update if different to prevent redundant triggers
          if (afterData.eventStartTaskName !== response.name) {
            await eventRef.update({ eventStartTaskName: response.name });
          }
        }
      }

      // 3. Notifications
      const participantsSnapshot = await db
        .collection("events")
        .doc(eventId)
        .collection("participants")
        .get();
      const participantIDs = participantsSnapshot.docs.map((doc) => doc.id);

      if (participantIDs.length > 0) {
        const metadata: NotificationMetadata = { eventId };
        const promises = [];

        if (isLocationChanged)
          promises.push(
            notifyUsers(
              participantIDs,
              {
                title: "📍 Konum Değişti",
                body: "Yeni konumu gör!",
                type: "updateLocation",
              },
              metadata,
            ),
          );
        if (isStartTimeChanged)
          promises.push(
            notifyUsers(
              participantIDs,
              {
                title: "⏰ Saat Değişti",
                body: "Yeni saati gör!",
                type: "updateTime",
              },
              metadata,
            ),
          );
        if (isForceStarted)
          promises.push(
            notifyUsers(
              participantIDs,
              {
                title: "📢 Etkinlik Başladı",
                body: "Hadi gel!",
                type: "earlyStart",
              },
              metadata,
            ),
          );

        await Promise.all(promises);
      }
    } catch (error) {
      logger.error("Event update process failed", error);
    }
  },
);
