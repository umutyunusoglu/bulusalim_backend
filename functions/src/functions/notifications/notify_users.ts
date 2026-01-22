import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { AppNotificationPayload } from "../notifications/app_notification_payload";
import NotificationManager from "../notifications/notification_manager";

export interface NotificationMetadata {
    eventId?: string;
    userId?: string; // Bildirimi tetikleyen kişi
    postId?: string;
    avatarUrl?: string;
}

export async function notifyUsers(
    targetIds: string[],
    payload: AppNotificationPayload,
    metadata: NotificationMetadata
) {
    if (targetIds.length === 0) return;

    // 1. Push Bildirimleri (FCM)
    await NotificationManager.sendToMultipleUsers(targetIds, payload);

    // 2. Firestore Uygulama İçi Bildirim Kayıtları
    const db = admin.firestore();
    const batch = db.batch();

    targetIds.forEach((targetId) => {
        const notifRef = db.collection("users").doc(targetId).collection("notifications").doc();
        batch.set(notifRef, {
            type: payload.type,
            title: payload.title,
            message: payload.body,
            avatarUrl: metadata.avatarUrl || null,
            createdAt: FieldValue.serverTimestamp(),
            eventId: metadata.eventId || null,
            userId: metadata.userId || null,
            postId: metadata.postId || null,
        });
    });

    await batch.commit();
}