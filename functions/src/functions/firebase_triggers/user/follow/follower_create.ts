import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import NotificationManager from "../../../notifications/notification_manager";
import { AppNotificationPayload } from "../../../notifications/app_notification_payload";
const db = admin.firestore();

export const handleFollowerCreate = onDocumentCreated("users/{userId}/followers/{followerId}", async (event) => {
    try {
        const snapshot = event.data;
        if (!snapshot) {
            logger.error("No snapshot found.");
            return;
        }

        const currentUser = event.params.userId;

        const followerID = snapshot.id;

        const followerData = snapshot.data();

        const followerUsername = followerData.username;
        const followerProfileImageUrl = followerData.profileImageUrl;

        let status = "none";

        // Check if current user is following the new follower
        const followingDoc = await db.collection("users").doc(currentUser).collection("followees").doc(followerID).get();

        if (followingDoc.exists) {
            status = "following";
        } else {
            // Check if a follow request has been sent
            const requestDoc = await db.collection("users").doc(followerID).collection("followRequests").doc(currentUser).get();
            if (requestDoc.exists) {
                status = "sent";
            }
        }


        const notificationPayload: AppNotificationPayload = {
            title: "Yeni Bir Takipçin Var!",
            body: `${followerUsername} seni takip etmeye başladı!`,
            type: "newFollower",
            avatarUrl: followerProfileImageUrl,
        }

        // Execute write operations concurrently and await them
        await Promise.all([
            db.collection("users").doc(currentUser).collection("followNotifications").doc(followerID).set({
                "userID": followerID,
                "username": followerUsername,
                "profileImageUrl": followerProfileImageUrl,
                "status": status,
                "createdAt": FieldValue.serverTimestamp()
            }),
            NotificationManager.sendToUser(currentUser, notificationPayload)
        ]);

    }
    catch (error) {
        logger.error("An unexpected error occurred in handleFollowerCreate:", error);
    }
});
