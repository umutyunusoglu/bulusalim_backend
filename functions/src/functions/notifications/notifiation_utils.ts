import * as admin from "firebase-admin";
import { FieldPath } from "firebase-admin/firestore";

/**
 * Retrieves all FCM tokens for a given list of user IDs.
 * Useful for 1-to-Many notifications like Event Updates or Participant joins.
 * Handles the Firestore 'in' query limitation by chunking the IDs if necessary.
 */
async function getFirebaseMessagingTokensFromUserIDs(userIDs: string[]): Promise<string[]> {
    if (!userIDs || userIDs.length === 0) return [];

    const allTokens: string[] = [];
    const chunks: string[][] = [];

    // Firestore 'in' sorgusu sınırı (30) için parçalara bölme
    for (let i = 0; i < userIDs.length; i += 30) {
        chunks.push(userIDs.slice(i, i + 30));
    }

    const firestore = admin.firestore();

    for (const chunk of chunks) {
        try {
            // "FieldPath.documentId()" kullanımını doğrudan yapıyoruz
            const userSnapshots = await firestore
                .collection('users')
                .where(FieldPath.documentId(), 'in', chunk)
                .get();

            userSnapshots.forEach(doc => {
                const userData = doc.data();
                if (userData && Array.isArray(userData.fcmTokens)) {
                    allTokens.push(...userData.fcmTokens);
                }
            });
        } catch (error) {
            console.error("Token çekme sırasında hata (chunk):", error);
            // Bir parça hata alsa da diğerlerini etkilememesi için devam ediyoruz
        }
    }

    // Tekrar eden tokenları temizle
    return [...new Set(allTokens)];
}

/**
 * Retrieves all active FCM tokens for a single specific user.
 * Best used for 1-to-1 notifications like Invites, Warnings, or Tagging.
 */
async function getFirebaseMessagingTokenFromUserID(userID: string): Promise<string[]> {
    try {
        const userDoc = await admin.firestore().collection('users').doc(userID).get();

        if (!userDoc.exists) {
            console.log(`No user found with ID: ${userID}`);
            return [];
        }

        const userData = userDoc.data();
        // Returns the list of tokens associated with the user's various devices.
        return (userData && Array.isArray(userData.fcmTokens)) ? userData.fcmTokens : [];
    } catch (error) {
        console.error(`Error fetching tokens for user ${userID}:`, error);
        return [];
    }
}



export { getFirebaseMessagingTokensFromUserIDs, getFirebaseMessagingTokenFromUserID };