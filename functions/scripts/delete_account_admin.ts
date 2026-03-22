// scripts/admin-delete-by-id.ts
//
// Kullanım:
//   npx ts-node scripts/admin-delete-by-id.ts <userID> [reason]
//
// Örnek:
//   npx ts-node scripts/admin-delete-by-id.ts "42Novg2eUXQqzIkD3BZWlPx5KvE3" "Spam hesap"

import * as admin from "firebase-admin";
import * as path from "path";

const serviceAccount = require("../service_account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

async function deleteUserByID(targetUserID: string, reason: string) {
    console.log(`\n🔍 User ID: ${targetUserID}`);
    console.log(`📋 Sebep: ${reason}`);
    console.log(`\n⏳ Silme işlemi başlıyor...\n`);

    // =========================================================================
    // BÖLÜM 1: BAŞKALARININ VERİLERİNDEN KENDİNİ SİLME
    // =========================================================================
    const subcollectionsToClean = [
        "followers",
        "followees",
        "bannedUsers",
        "requestPool",
        "rejectedUsers",
        "participants",
        "followRequests",
        "followNotifications",
    ];

    for (const collectionName of subcollectionsToClean) {
        const snapshot = await db
            .collectionGroup(collectionName)
            .where("userID", "==", targetUserID)
            .get();

        if (!snapshot.empty) {
            const chunks = chunkArray(snapshot.docs, 499);
            for (const chunk of chunks) {
                const batch = db.batch();
                chunk.forEach((doc) => batch.delete(doc.ref));
                await batch.commit();
            }
            console.log(`  ✓ ${collectionName}: ${snapshot.size} kayıt silindi`);
        } else {
            console.log(`  - ${collectionName}: temiz`);
        }
    }

    // =========================================================================
    // BÖLÜM 2: MESAJLARI SİLME
    // =========================================================================
    const messagesSnapshot = await db
        .collectionGroup("messages")
        .where("sender.userID", "==", targetUserID)
        .get();

    if (!messagesSnapshot.empty) {
        const chunks = chunkArray(messagesSnapshot.docs, 499);
        for (const chunk of chunks) {
            const batch = db.batch();
            chunk.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
        }
        console.log(`  ✓ messages: ${messagesSnapshot.size} mesaj silindi`);
    } else {
        console.log(`  - messages: temiz`);
    }

    // =========================================================================
    // BÖLÜM 3: ETKİNLİKLERİ DEVRETME VEYA SİLME
    // =========================================================================
    const eventsQuery = await db
        .collection("events")
        .where("creator.userID", "==", targetUserID)
        .get();

    for (const eventDoc of eventsQuery.docs) {
        const participantsSnapshot = await eventDoc.ref
            .collection("participants")
            .get();

        const otherParticipants = participantsSnapshot.docs.filter(
            (doc) => doc.data().userID !== targetUserID
        );

        if (otherParticipants.length > 0) {
            const randomDoc =
                otherParticipants[Math.floor(Math.random() * otherParticipants.length)];
            const newOwner = randomDoc.data();

            await eventDoc.ref.update({
                creator: {
                    userID: newOwner.userID,
                    username: newOwner.username,
                    profileImageUrl: newOwner.profileImageUrl || "",
                    eventScore: null,
                    role: "creator",
                },
            });
            console.log(
                `  ✓ Event ${eventDoc.id} -> yeni sahip: ${newOwner.username}`
            );
        } else {
            await db.recursiveDelete(eventDoc.ref);
            console.log(`  ✓ Event ${eventDoc.id} -> silindi (katılımcı yok)`);
        }
    }

    if (eventsQuery.empty) {
        console.log(`  - events: temiz`);
    }

    // =========================================================================
    // BÖLÜM 4: POSTLARI SİLME
    // =========================================================================
    const postsQuery = await db
        .collection("posts")
        .where("userID", "==", targetUserID)
        .get();

    for (const doc of postsQuery.docs) {
        await db.recursiveDelete(doc.ref);
    }
    console.log(
        postsQuery.empty
            ? `  - posts: temiz`
            : `  ✓ posts: ${postsQuery.size} post silindi`
    );

    // =========================================================================
    // BÖLÜM 5: PROFİL SİLME
    // =========================================================================
    await db.recursiveDelete(db.collection("users").doc(targetUserID));
    console.log(`  ✓ users/${targetUserID} silindi`);

    await db.recursiveDelete(db.collection("public_users").doc(targetUserID));
    console.log(`  ✓ public_users/${targetUserID} silindi`);

    // =========================================================================
    // BÖLÜM 6: AUTH SİLME
    // =========================================================================
    try {
        await auth.deleteUser(targetUserID);
        console.log(`  ✓ Auth kaydı silindi`);
    } catch (err: any) {
        if (err.code === "auth/user-not-found") {
            console.log(`  ⚠ Auth kaydı zaten mevcut değil`);
        } else {
            throw err;
        }
    }

    console.log(`\n🎉 ${targetUserID} başarıyla silindi.\n`);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const [userID, ...reasonParts] = process.argv.slice(2);

if (!userID) {
    console.log(`
  Kullanım:
    npx ts-node scripts/admin-delete-by-id.ts <userID> [reason]

  Örnek:
    npx ts-node scripts/admin-delete-by-id.ts "42Novg2eUXQqzIkD3BZWlPx5KvE3" "Spam"
  `);
    process.exit(1);
}

const reason = reasonParts.join(" ") || "Admin tarafından silindi";

deleteUserByID(userID, reason)
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("\n❌ Hata:", err.message);
        process.exit(1);
    });