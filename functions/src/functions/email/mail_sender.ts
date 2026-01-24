import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
// v2 importları kullanıyoruz
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const root_mail = process.env.ROOT_MAIL;
const mail_client_id = process.env.MAIL_CLIENT_ID;
const mail_client_secret = process.env.MAIL_CLIENT_SECRET;
const mail_refresh_token = process.env.MAIL_REFRESH_TOKEN;

const transporter = nodemailer.createTransport({
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
  // 1. Strict Auth Check
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Bu işlemi yapmak için giriş yapmalısınız.");
  }

  const data = request.data;
  const requestOwnerId = request.auth.uid; // Always use the server-side auth ID

  // 2. Basic Validation
  if (!data.reportedUserID || !data.reportedEntityType) {
    throw new HttpsError("invalid-argument", "Eksik rapor bilgisi.");
  }

  const reportedEntityID = data.reportedEntityID || "N/A";
  const reportedEntityType = data.reportedEntityType;
  const reportedUserID = data.reportedUserID;

  // 3. Unique Report ID
  const reportID = `${Date.now()}_${reportedUserID}_${requestOwnerId}`;

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

  try {
    // Send Email
    await transporter.sendMail(mailOptions);

    // 4. Save Notification (Linked to the reporting user)
    await db.collection("users").doc(requestOwnerId).collection("notifications").doc(reportID).set({
      "userId": requestOwnerId, // Essential for the frontend to query
      "type": "warning",
      "title": "Rapor Alındı",
      "message": "Şikayetiniz incelenmek üzere ekibimize iletilmiştir.",
      "createdAt": FieldValue.serverTimestamp(),
    });

    return {success: true, reportID};
  } catch (error) {
    console.error("Report Error:", error);
    throw new HttpsError("internal", "Rapor gönderilirken bir hata oluştu.");
  }
});
