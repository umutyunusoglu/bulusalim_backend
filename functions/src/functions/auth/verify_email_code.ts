import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();

export const verifyEmailCode = onCall(async (request) => {
    // 1. Kimlik Doğrulama
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Yetkisiz erişim.");
    }

    const userOTP = request.data.otp; // Kullanıcının girdiği kod
    const universityName = request.data.universityName;
    const universityEmail = request.data.universityEmail;

    const uid = request.auth.uid;

    if (!userOTP) {
        throw new HttpsError("invalid-argument", "Doğrulama kodu boş olamaz.");
    }

    const userRef = db.collection("otp_verifications").doc(uid);
    const doc = await userRef.get();

    // 2. Kayıt Var mı Kontrolü
    if (!doc.exists) {
        throw new HttpsError("not-found", "Geçerli bir doğrulama talebi bulunamadı.");
    }

    const data = doc.data();
    const serverOTP = data?.code;
    const expiresAt = data?.expiresAt; // Kaydederken eklediğimiz son kullanma tarihi

    if (Date.now() > expiresAt) {
        await userRef.delete(); // Süresi dolmuş kodu temizle
        throw new HttpsError("deadline-exceeded", "Kodun süresi dolmuş. Lütfen yeni bir kod isteyin.");
    }

    if (userOTP !== serverOTP) {
        return { success: false, message: "Girdiğiniz kod hatalı." };
    }

    await userRef.delete();

    await db.collection("users").doc(uid).update({
        universityName: universityName,
        universityEmail: universityEmail,
        universityVerified: true
    });


    return {
        success: true,
        message: "Email adresiniz başarıyla doğrulandı."
    };
});