import * as admin from "firebase-admin";

/**
 * Retrieves all FCM tokens for a given list of user IDs.
 * Useful for 1-to-Many notifications like Event Updates or Participant joins.
 * Handles the Firestore 'in' query limitation by chunking the IDs if necessary.
 */
async function getFirebaseMessagingTokensFromUserIDs(userIDs: string[]): Promise<string[]> {
    if (!userIDs || userIDs.length === 0) return [];

    const allTokens: string[] = [];

    // Firestore 'in' query supports up to 30 values per request.
    // For larger groups, we split the userIDs into chunks of 30.
    const chunks = [];
    for (let i = 0; i < userIDs.length; i += 30) {
        chunks.push(userIDs.slice(i, i + 30));
    }

    for (const chunk of chunks) {
        const userSnapshots = await admin.firestore()
            .collection('users')
            .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
            .get();

        userSnapshots.forEach(doc => {
            const userData = doc.data();
            // Assuming each user document has an 'fcmTokens' array as discussed.
            if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                allTokens.push(...userData.fcmTokens);
            }
        });
    }

    return allTokens;
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