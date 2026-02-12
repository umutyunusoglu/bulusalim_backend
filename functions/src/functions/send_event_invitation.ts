import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
// FieldValue veya Timestamp kullanacaksanız burada kalsın, aksi halde temizlenebilir.
// import { FieldValue, Timestamp } from "firebase-admin/firestore"; 
import { notifyUsers } from "./notifications/notify_users";
import { AppNotificationPayload } from "./notifications/app_notification_payload";

const db = admin.firestore();

export const sendEventInvitation = onCall(async (request) => {
    // 1. Kimlik Doğrulama Kontrolü
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Bu işlemi yapmak için giriş yapmalısınız.");
    }

    const fromID = request.auth.uid;
    const data = request.data;

    // 2. Veri Yapısı Kontrolü
    if (!data) {
        throw new HttpsError("invalid-argument", "İstek verisi eksik.");
    }

    const { toID, toUsername, toAvatarUrl, eventID, eventName } = data;

    if (!toID || !eventID || !toUsername) {
        throw new HttpsError("invalid-argument", "Gerekli parametreler (toID, eventID, toUsername) eksik.");
    }

    // 3. Mantıksal Kontrol: Kendi kendine davet gönderemez
    if (fromID === toID) {
        throw new HttpsError("invalid-argument", "Kendinize davet gönderemezsiniz.");
    }

    try {
        // 4. Opsiyonel: Etkinlik var mı kontrolü (Önerilir)
        const eventDoc = await db.collection("events").doc(eventID).get();
        if (!eventDoc.exists) {
            throw new HttpsError("not-found", "Davet edilmek istenen buluşma bulunamadı.");
        }
        

        //TODO: kimden geldiği yazsın
        // 5. Bildirim Hazırlığı
        const payload: AppNotificationPayload = {
            title: toUsername, // Burada bir mantık hatası olabilir: Başlık genelde gönderen kişinin adı olur.
            body: `${eventName} buluşmasına davetlisiniz!`,
            type: "invite",
            actionText: "Buluşma kartını görüntüle.",
            avatarUrl: toAvatarUrl,
        };

        // 6. Bildirim Gönderimi ve Hata Yönetimi
        try {
            await notifyUsers(
                [toID],
                payload,
                {
                    eventId: eventID,
                    userId: fromID,
                    avatarUrl: toAvatarUrl || ""
                }
            );
        } catch (notificationError) {
            console.error("Bildirim gönderilirken hata oluştu:", notificationError);
            throw new HttpsError("internal", "Bildirim gönderilemedi.");
        }

        // 7. İşlem Başarılı
        console.log(`Davet başarıyla gönderildi: From ${fromID} To ${toID} for Event ${eventID}`);
        return {
            success: true,
            message: "Davet başarıyla iletildi.",
            timestamp: new Date().toISOString()
        };

    } catch (error: any) {
        // 8. Genel Hata Yakalama
        console.error("sendEventInvitation hatası:", error);

        // Eğer hata zaten bir HttpsError ise direkt fırlat
        if (error instanceof HttpsError) {
            throw error;
        }

        // Bilinmeyen hataları sarmala
        throw new HttpsError("internal", "Davet işlemi sırasında teknik bir hata oluştu.", error.message);
    }
});