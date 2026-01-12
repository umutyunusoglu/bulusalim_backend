import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();



export const handlePostCreate = onDocumentCreated("posts/{postId}", async (event) => {
    try {
        const snapshot = event.data;
        if (!snapshot) {
            logger.error("No snapshot found.");
            return;
        }

        const postId = snapshot.id;
        const postData = snapshot.data();

        if (!postData) {
            logger.error("Snapshot contains no data.");
            return;
        }

        try {
            await db.collection("feed").doc(postId).set({
                ...postData,
            });
            logger.info(`Feed entry created for post: ${postId}`);
        } catch (dbError) {
            logger.error(`Failed to write feed document for post ${postId}:`, dbError);
        }
    } catch (error) {
        logger.error("An unexpected error occurred in handlePostCreate:", error);
    }
});