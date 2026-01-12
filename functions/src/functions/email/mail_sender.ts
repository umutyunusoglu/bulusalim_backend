import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
// v2 importları kullanıyoruz
import { onCall, HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) {
    admin.initializeApp();
}

const root_mail = process.env.ROOT_MAIL;
const mail_client_id = process.env.MAIL_CLIENT_ID;
const mail_client_secret = process.env.MAIL_CLIENT_SECRET;
const mail_refresh_token = process.env.MAIL_REFRESH_TOKEN;

let transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        type: "OAuth2",
        user: root_mail,
        clientId: mail_client_id,
        clientSecret: mail_client_secret,
        refreshToken: mail_refresh_token,
    },
});

// TypeScript için veri arayüzü tanımlıyoruz
interface ReportData {
    reportedEntityID?: string;
    reportedEntityType?: string;
    reportedUserID?: string;
    requestOwnerId?: string;
}

export const reportUser = onCall<ReportData>(async (request) => {


    if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'Bu işlemi yapmak için giriş yapmalısınız.'
        );
    }

    // HATA ÇÖZÜMÜ 2: Property does not exist on 'CallableRequest'.
    // Veriye request.data üzerinden erişmelisiniz.
    const data = request.data;

    const reportedEntityID = data.reportedEntityID || "null";
    const reportedEntityType = data.reportedEntityType || "null";
    const reportedUserID = data.reportedUserID || "null";

    // Auth garantilendiği için request.auth.uid güvenle kullanılabilir
    const requestOwnerId = data.requestOwnerId || request.auth.uid;

    const reportID = `${Date.now()}-${reportedUserID}-${requestOwnerId}`;

    const mailOptions = {
        from: `Outnest Report <${root_mail}>`,
        to: root_mail,
        subject: `Report Request ${reportID}`,
        html: `
            <div style="font-family: Arial, sans-serif;">
                <h3>Auto-generated Report from Outnest Server</h3>
                <p>There has been a report request made by <strong>${requestOwnerId}</strong>.</p>
                <hr/>
                <p><strong>Reported User ID:</strong> ${reportedUserID}</p>
                <p><strong>Reported Entity ID:</strong> ${reportedEntityID}</p>
                <p><strong>Reported Entity Type:</strong> ${reportedEntityType}</p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        return { success: true, reportID };
    } catch (error) {
        console.error("Mail error:", error);
        throw new HttpsError('internal', 'Mail gönderilemedi.');
    }
});