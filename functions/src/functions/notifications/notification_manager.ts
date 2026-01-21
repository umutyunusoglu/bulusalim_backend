import * as admin from "firebase-admin";
import { getFirebaseMessagingTokenFromUserID, getFirebaseMessagingTokensFromUserIDs } from "./notifiation_utils";
import { AppNotificationPayload } from "./app_notification_payload";




export class NotificationManager {

    /**
     * Sends a 1-to-1 notification to all devices of a single user.
     * Use case: Invites, Warnings, Direct Tags.
     */
    static async sendToUser(userID: string, payload: AppNotificationPayload): Promise<void> {
        const tokens = await getFirebaseMessagingTokenFromUserID(userID);

        if (tokens.length === 0) {
            console.log(`Notification skipped: No tokens found for user ${userID}`);
            return;
        }

        await this.sendMulticast(tokens, payload);
    }

    /**
     * Sends a notification to multiple users (1-to-Many).
     * Use case: Event updates, New participants, Time/Location changes.
     */
    static async sendToMultipleUsers(userIDs: string[], payload: AppNotificationPayload): Promise<void> {
        const allTokens = await getFirebaseMessagingTokensFromUserIDs(userIDs);

        if (allTokens.length === 0) {
            console.log("Notification skipped: No tokens found for the provided user list.");
            return;
        }

        await this.sendMulticast(allTokens, payload);
    }

    /**
     * Internal helper to handle the actual Firebase Admin SDK multicast call.
     * Batches tokens and sends them efficiently.
     */
    private static async sendMulticast(tokens: string[], payload: AppNotificationPayload): Promise<void> {
        // Firebase sendEachForMulticast allows up to 500 tokens per call.
        // For very large lists, you may need to chunk the tokens further.
        const message: admin.messaging.MulticastMessage = {
            tokens: tokens,
            notification: {
                title: payload.title,
                body: payload.body,
            },
            // Important: Data payload must contain strings only for FCM consistency.
            data: {
                type: payload.type,
                eventId: payload.eventId || "",
                avatarUrl: payload.avatarUrl || "",
                actionText: payload.actionText || "",
                click_action: "FLUTTER_NOTIFICATION_CLICK", // Required for Android background handling
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "high_importance_channel", // Matches Flutter local notifications config
                },
            },
            apns: {
                payload: {
                    aps: {
                        contentAvailable: true,
                        badge: 1,
                        sound: "default",
                    },
                },
            },
        };

        try {
            const response = await admin.messaging().sendEachForMulticast(message);
            console.log(`Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);

            // Optional: Clean up invalid tokens from database if response.responses has errors
        } catch (error) {
            console.error("Error sending multicast notification:", error);
        }
    }
}

export default NotificationManager;