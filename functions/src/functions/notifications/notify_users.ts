import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { AppNotificationPayload } from "../notifications/app_notification_payload";
import NotificationManager from "../notifications/notification_manager";

export interface NotificationMetadata {
  eventId?: string;
  userId?: string;
  postId?: string;
  profileImageUrl?: string;
}

export async function notifyUsers(
  targetIds: string[],
  payload: AppNotificationPayload,
  metadata: NotificationMetadata,
) {
  if (targetIds.length === 0) return;

  // 1. Trigger Push Notifications & Handle Cleanup
  await NotificationManager.sendToMultipleUsers(targetIds, payload);

  // 2. Write In-App Notifications (with 500-item batch safety)
  const db = admin.firestore();
  const CHUNK_SIZE = 500;

  for (let i = 0; i < targetIds.length; i += CHUNK_SIZE) {
    const chunk = targetIds.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    chunk.forEach((targetId) => {
      const notifRef = db
        .collection("users")
        .doc(targetId)
        .collection("notifications")
        .doc();
      batch.set(notifRef, {
        type: payload.type,
        title: payload.title,
        message: payload.body,
        profileImageUrl: metadata.profileImageUrl || null,
        createdAt: FieldValue.serverTimestamp(),
        eventId: metadata.eventId || null,
        triggeringUserId: metadata.userId || null,
        postId: metadata.postId || null,
        isRead: false,
      });
    });

    await batch.commit();
  }
}
