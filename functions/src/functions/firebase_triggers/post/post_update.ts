import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
const db = admin.firestore();


export const handlePostUpdate = onDocumentUpdated("posts/{postId}", async (event) => {
  try {
    if (!event.data) {
      logger.error("No data found in updated document.");
      return;
    }

    const afterSnapshot = event.data.after;

    const postId = afterSnapshot.id;

    const afterData = afterSnapshot.data();
    const postOwnerID = afterData.creator.userID;

    if (!afterData) {
      logger.error("After snapshot contains no data.");
      return;
    }
    try {

      await db.collection("users").doc(postOwnerID).collection("posts").doc(postId).set({
        ...afterData,
      });
      logger.info(`Feed entry updated for post: ${postId}`);
    } catch (dbError) {
      logger.error(`Failed to update feed document for post ${postId}:`, dbError);
    }
  } catch (error) {
    logger.error("An unexpected error occurred in handlePostUpdate:", error);
  }
});
