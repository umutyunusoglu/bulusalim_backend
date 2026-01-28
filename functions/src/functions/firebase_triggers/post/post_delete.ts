import { onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
const db = admin.firestore();


export const handlePostDelete = onDocumentDeleted("posts/{postId}", async (event) => {

    if (!event.data) {
        logger.error("No data found in updated document.");
        return;
    }

    const postId = event.data.id;
    const postOwnerID = event.data.data().creator.userID;

    try {
        await db.collection("feed").doc(postId).delete();
        await db.collection("users").doc(postOwnerID).collection("posts").doc(postId).delete();
        logger.info(`Feed entry updated for post: ${postId}`);
    } catch (dbError) {
        logger.error(`Failed to update feed document for post ${postId}:`, dbError);
    }
});
