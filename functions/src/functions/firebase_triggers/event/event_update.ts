
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
const db = admin.firestore();




export const handleEventUpdate = onDocumentUpdated("events/{eventId}", async (event) => {
    try {
        if (!event.data) {
            logger.error("No data found in updated document.");
            return;
        }

        const afterSnapshot = event.data.after;
        const eventId = afterSnapshot.id;
        const afterData = afterSnapshot.data();

        if (!afterData) {
            logger.error("After snapshot contains no data.");
            return;
        }

        try {
            await db.collection("feed").doc(eventId).update({
                ...afterData,
            });
            logger.info(`Feed entry updated for event: ${eventId}`);
        } catch (dbError) {
            logger.error(`Failed to update feed document for event ${eventId}:`, dbError);
        }
    } catch (error) {
        logger.error("An unexpected error occurred in handleEventUpdate:", error);
    }
});