import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { notifyUsers } from "../../../notifications/notify_users";

const db = admin.firestore();

export const handleFollowerCreate = onDocumentCreated("users/{userId}/followers/{followerId}", async (event) => {
    try {
        const snapshot = event.data;
        if (!snapshot) return;

        const { userId: currentUser, followerId: followerID } = event.params;
        const followerData = snapshot.data();
        const followerUsername = followerData?.username || "Bir kullanıcı";
        const followerProfileImageUrl = followerData?.profileImageUrl;

        // 1. Durum Kontrolü (Paralel Get)
        // Kullanıcının yeni takipçisini takip edip etmediğini veya istek atıp atmadığını kontrol ediyoruz
        const [followingDoc, requestDoc] = await Promise.all([
            db.collection("users").doc(currentUser).collection("followees").doc(followerID).get(),
            db.collection("users").doc(followerID).collection("followRequests").doc(currentUser).get()
        ]);

        let status = "none";
        if (followingDoc.exists) {
            status = "following";
        } else if (requestDoc.exists) {
            status = "sent";
        }

        // 2. Uygulama İçi Bildirim Kaydı (Batch)
        // FollowNotifications koleksiyonunu güncelliyoruz
        const batch = db.batch();
        const notificationRef = db.collection("users")
            .doc(currentUser)
            .collection("followNotifications")
            .doc(followerID);

        batch.set(notificationRef, {
            "userID": followerID,
            "username": followerUsername,
            "profileImageUrl": followerProfileImageUrl,
            "status": status,
            "type": "newFollower", // Bildirim tipini belirtmek her zaman iyidir
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp()
        });

        await batch.commit();

        // 3. Push Bildirimi Gönder
        // Daha önce yazdığımız notifyUsers helper'ını sadece PUSH için veya genel yapı için kullanabilirsin
        await notifyUsers(
            [currentUser],
            {
                title: "Yeni Bir Takipçin Var!",
                body: `${followerUsername} seni takip etmeye başladı!`,
                type: "newFollower"
            },
            {
                userId: followerID,
                avatarUrl: followerProfileImageUrl
            }
        );

        logger.info(`Yeni takipçi bildirimi başarıyla işlendi: ${followerID} -> ${currentUser}`);

    } catch (error) {
        logger.error("handleFollowerCreate hatası:", error);
    }
});