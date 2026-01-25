import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { root_mail, transporter } from "../email/mail_sender";
import * as admin from "firebase-admin";


const db = admin.firestore();


// TypeScript için veri arayüzü tanımlıyoruz
interface ReportData {
    reportedEntityID?: string;
    reportedEntityType?: string;
    reportedUserID?: string;
    requestOwnerId?: string;
}

export const reportUser = onCall<ReportData>(async (request) => {
    // 1. Strict Auth Check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Bu işlemi yapmak için giriş yapmalısınız.");
    }

    const data = request.data;
    const requestOwnerId = request.auth.uid;
    const now = Date.now();
    const FIVE_MINUTES_MS = 15 * 1000; // 5 dakikalık bekleme süresi

    // 2. Basic Validation
    if (!data.reportedUserID || !data.reportedEntityType) {
        throw new HttpsError("invalid-argument", "Eksik rapor bilgisi.");
    }

    try {
        // --- RATE LIMITING KONTROLÜ ---
        // Kullanıcının son bildirimini kontrol et (notifications koleksiyonu üzerinden)
        const lastReports = await db.collection("users")
            .doc(requestOwnerId)
            .collection("notifications")
            .where("type", "==", "warning")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

        if (!lastReports.empty) {
            const lastReportData = lastReports.docs[0].data();
            const lastCreatedAt = lastReportData.createdAt?.toMillis() || 0;

            if (now - lastCreatedAt < FIVE_MINUTES_MS) {
                throw new HttpsError(
                    "resource-exhausted",
                    `Çok sık rapor gönderiyorsunuz. Lütfen 15 saniye sonra tekrar deneyin.`
                );
            }
        }
        // ------------------------------

        const reportedEntityID = data.reportedEntityID || "N/A";
        const reportedEntityType = data.reportedEntityType;
        const reportedUserID = data.reportedUserID;

        // 3. Unique Report ID
        const reportID = `${now}_${reportedUserID}_${requestOwnerId}`;

        const mailOptions = {
            from: `Outnest Report <${root_mail}>`,
            to: root_mail,
            subject: `[REPORT] ${reportedEntityType} - ${reportID}`,
            html: `
                <div style="font-family: sans-serif; line-height: 1.5;">
                    <h2 style="color: #d32f2f;">New User Report</h2>
                    <p><strong>Reporter UID:</strong> ${requestOwnerId}</p>
                    <hr/>
                    <p><strong>Reported User ID:</strong> ${reportedUserID}</p>
                    <p><strong>Entity Type:</strong> ${reportedEntityType}</p>
                    <p><strong>Entity ID:</strong> ${reportedEntityID}</p>
                </div>
            `,
        };

        // Send Email
        await transporter.sendMail(mailOptions);

        // 4. Save Notification
        await db.collection("users").doc(requestOwnerId).collection("notifications").doc(reportID).set({
            "userId": requestOwnerId,
            "type": "warning",
            "title": "Rapor Alındı",
            "message": "Şikayetiniz incelenmek üzere ekibimize iletilmiştir.",
            "createdAt": FieldValue.serverTimestamp(),
        });

        return { success: true, reportID };

    } catch (error: any) {
        // Eğer hata zaten bizim fırlattığımız bir HttpsError ise onu olduğu gibi ilet
        if (error instanceof HttpsError) {
            throw error;
        }
        console.error("Report Error:", error);
        throw new HttpsError("internal", "Rapor gönderilirken bir hata oluştu.");
    }
});