import { onCall, HttpsError } from "firebase-functions/v2/https";
import { root_mail, transporter } from "../email/mail_sender";
import * as admin from "firebase-admin";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

// Güvenli OTP Üretimi
function generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
}

export const sendVerificationEmail = onCall(async (request) => {
    // 1. Kimlik Doğrulama Kontrolü
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Bu işlemi yapmak için giriş yapmalısınız.");
    }

    const uid = request.auth.uid;
    const targetEmail = request.data.email;

    if (!targetEmail) {
        throw new HttpsError("invalid-argument", "Geçerli bir e-posta adresi gerekli.");
    }

    // 2. Güvenlik: Hız Sınırı (Rate Limiting) Kontrolü
    // Kullanıcının son 60 saniye içinde kod isteyip istemediğini kontrol edelim
    const userRef = db.collection("otp_verifications").doc(uid);
    const lastDoc = await userRef.get();

    if (lastDoc.exists) {
        const lastSent = lastDoc.data()?.createdAt?.toMillis() || 0;
        const now = Date.now();
        if (now - lastSent < 60000) { // 60 saniye sınırı
            throw new HttpsError("resource-exhausted", "Çok sık kod gönderdiniz. Lütfen bir dakika bekleyin.");
        }
    }

    const OTP = generateOTP();

    const mailOptions = {
        from: `Outnest Verification <${root_mail}>`,
        to: targetEmail,
        subject: `Outnest Doğrulama Kodun: ${OTP}`,
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #2c3e50;">E-posta Doğrulaması</h2>
                <p>Aşağıdaki kodu kullanarak e-posta adresinizi doğrulayabilirsiniz:</p>
                <div style="font-size: 32px; font-weight: bold; color: #e74c3c; margin: 20px 0; letter-spacing: 5px;">
                    ${OTP}
                </div>
                <p style="color: #7f8c8d; font-size: 14px;">Bu kod 10 dakika süreyle geçerlidir.</p>
            </div>
        `,
    };

    try {
        // 3. Veritabanına Kaydet (UID ile eşleştirerek)
        await userRef.set({
            code: OTP,
            email: targetEmail,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 dakika geçerlilik
        });

        // 4. Maili Gönder
        await transporter.sendMail(mailOptions);

        return { success: true, message: "Doğrulama kodu başarıyla gönderildi." };
    } catch (error) {
        console.error("Verification Mail Error:", error);
        throw new HttpsError("internal", "E-posta gönderimi başarısız oldu.");
    }
});