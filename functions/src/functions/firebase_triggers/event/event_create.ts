import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

const { CloudTasksClient } = require('@google-cloud/tasks');
const tasksClient = new CloudTasksClient();

import * as config from "../../configs/event_lifecycle_config.json";

const PROJECT = config.firebase.projectId;
const LOCATION = config.firebase.location;
const QUEUE = config.cloudTasks.queueName;
const WORKER_URL = `https://${LOCATION}-${PROJECT}.cloudfunctions.net/startEventLogic`;


export const handleEventCreate = onDocumentCreated("events/{eventId}", async (event) => {
  try {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No snapshot found.");
      return;
    }

    const eventId = snapshot.id;
    const eventData = snapshot.data();

    if (!eventData) {
      logger.error("Snapshot contains no data.");
      return;
    }

    try { 
    const taskName = `projects/${PROJECT}/locations/${LOCATION}/queues/${QUEUE}/tasks/start-event-${eventId}`;
      if (eventData.startTime) {
        const parent = tasksClient.queuePath(PROJECT, LOCATION, QUEUE);
        const task = {
          name:taskName,
          httpRequest: {
            
            httpMethod: 'POST',
            url: WORKER_URL,
            body: Buffer.from(JSON.stringify({ eventId })).toString('base64'),
            headers: { 'Content-Type': 'application/json' },
          },
          scheduleTime: { seconds: eventData.startTime.seconds },
        };

        const [response] = await tasksClient.createTask({ parent, task });

        // Task ismini dökümana yazıyoruz ki güncellenirse silebilelim
        await snapshot.ref.update({ eventStartTaskName: response.name });
      }


      logger.info(`Feed entry created for event: ${eventId}`);
    } catch (dbError) {
      logger.error(`Failed to write feed document for event ${eventId}:`, dbError);
    }
  } catch (error) {
    logger.error("An unexpected error occurred in handleEventCreate:", error);
  }
});


