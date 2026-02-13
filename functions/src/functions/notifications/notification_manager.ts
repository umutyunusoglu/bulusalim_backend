import * as admin from "firebase-admin";
import { AppNotificationPayload } from "./app_notification_payload";
import {
  getFirebaseMessagingTokenFromUserID,
  getFirebaseMessagingTokensFromUserIDs,
} from "./notifiation_utils";

export class NotificationManager {
  static async sendToUser(
    userID: string,
    payload: AppNotificationPayload,
  ): Promise<void> {
    const tokens = await getFirebaseMessagingTokenFromUserID(userID);
    if (tokens.length === 0) return;
    await this.sendMulticast(tokens, payload);
  }

  static async sendToMultipleUsers(
    userIDs: string[],
    payload: AppNotificationPayload,
  ): Promise<void> {
    const allTokens = await getFirebaseMessagingTokensFromUserIDs(userIDs);
    if (allTokens.length === 0) return;
    await this.sendMulticast(allTokens, payload);
  }

  private static async sendMulticast(
    tokens: string[],
    payload: AppNotificationPayload,
  ): Promise<void> {
    const message: admin.messaging.MulticastMessage = {
      tokens: tokens,
      notification: { title: payload.title, body: payload.body },
      data: {
        type: payload.type,
        eventId: payload.eventId || "",
        profileImageUrl: payload.profileImageUrl || "",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      android: {
        priority: "high",
        notification: { channelId: "high_importance_channel" },
      },
      apns: {
        payload: {
          aps: { contentAvailable: true, badge: 1, sound: "default" },
        },
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);

      const tokensToRemove: string[] = [];
      response.responses.forEach((res, index) => {
        if (!res.success) {
          const error = res.error as any;
          // Error code for "Requested entity was not found"
          if (
            error.code === "messaging/registration-token-not-registered" ||
            error.code === "messaging/invalid-registration-token"
          ) {
            tokensToRemove.push(tokens[index]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        await this.removeInvalidTokens(tokensToRemove);
      }

      console.log(
        `FCM Summary: ${response.successCount} success, ${response.failureCount} failure.`,
      );
    } catch (error) {
      console.error("Critical FCM Multicast error:", error);
    }
  }

  private static async removeInvalidTokens(tokens: string[]) {
    const db = admin.firestore();
    const batch = db.batch();

    const tokenChunks = [];
    for (let i = 0; i < tokens.length; i += 10) {
      tokenChunks.push(tokens.slice(i, i + 10));
    }

    const snapshots = await Promise.all(
      tokenChunks.map((chunk) => {
        let query: FirebaseFirestore.Query = db.collection("users");
        for (const token of chunk) {
          query = query.where("fcmTokens", "array-contains", token);
        }
        return query.get();
      }),
    );

    const seenDocIds = new Set<string>();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((doc) => {
        if (!seenDocIds.has(doc.id)) {
          seenDocIds.add(doc.id);
          batch.update(doc.ref, {
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens),
          });
        }
      });
    });

    await batch.commit();
    console.log(`Cleaned up ${tokens.length} invalid tokens from Firestore.`);
  }
}

export default NotificationManager;
