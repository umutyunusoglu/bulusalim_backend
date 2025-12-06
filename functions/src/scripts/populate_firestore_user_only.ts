import { initializeApp } from "firebase/app";
import {
    getFirestore,
    connectFirestoreEmulator,
    setDoc,
    doc,
    Timestamp,
    GeoPoint
} from "firebase/firestore";

import {
    getAuth,
    connectAuthEmulator,
    createUserWithEmailAndPassword,
    updateProfile,
    signInWithEmailAndPassword
} from "firebase/auth";

import {
    getStorage,
    connectStorageEmulator,
    ref,
    uploadBytes,
    getDownloadURL
} from "firebase/storage";

import { faker } from "@faker-js/faker";
import { User, UserEvent } from "./types/user";
import { Event, EventParticipant } from "./types/event";
import { FeedTypeEnum } from "./types/feed_enum"; // Enum dosyanızdan
// Eğer enum dosyanız yoksa buraya const olarak tanımlayabilirsiniz:
// const FeedTypeEnum = { Event: 'event', Post: 'post' };

// ------------------------------
// Firebase Client SDK Setup
// ------------------------------

const firebaseConfig = {
    apiKey: "fake-api-key",
    authDomain: "localhost",
    projectId: "bulusalim-e8e7c",
    storageBucket: "demo-project.appspot.com",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

connectFirestoreEmulator(db, "localhost", 8080);
connectAuthEmulator(auth, "http://localhost:9099");
connectStorageEmulator(storage, "localhost", 9199);

console.log("SDK Başlatıldı.");

// ------------------------------
// Yardımcı Fonksiyonlar
// ------------------------------

async function uploadPhoto(destinationPath: string) {
    // Rastgele doğa/şehir resmi
    const src = `https://picsum.photos/400/400?random=${Math.random()}`;
    try {
        const res = await fetch(src);
        const buffer = Buffer.from(await res.arrayBuffer());
        const storageRef = ref(storage, destinationPath);
        await uploadBytes(storageRef, buffer);
        return await getDownloadURL(storageRef);
    } catch (e) {
        return "https://via.placeholder.com/150";
    }
}

async function makeFriends(user1: User, user2: User) {
    const commonData = { createdAt: Timestamp.now() };
    // Çift yönlü takip
    await setDoc(doc(db, "users", user1.userID, "followees", user2.userID), {
        userID: user2.userID, username: user2.username, profileImageUrl: user2.profileImageUrl, ...commonData
    });
    await setDoc(doc(db, "users", user2.userID, "followers", user1.userID), {
        userID: user1.userID, username: user1.username, profileImageUrl: user1.profileImageUrl, ...commonData
    });
    await setDoc(doc(db, "users", user2.userID, "followees", user1.userID), {
        userID: user1.userID, username: user1.username, profileImageUrl: user1.profileImageUrl, ...commonData
    });
    await setDoc(doc(db, "users", user1.userID, "followers", user2.userID), {
        userID: user2.userID, username: user2.username, profileImageUrl: user2.profileImageUrl, ...commonData
    });
    console.log(`Arkadaşlık: ${user1.username} <-> ${user2.username}`);
}

// Özel Etkinlik Oluşturucu Fonksiyon
async function createSpecificEvent(
    title: string,
    creatorUser: User,
    participantsUsers: User[],
    startTimeDate: Date,
    durationHours: number,
    status: 'upcoming' | 'ongoing' | 'completed'
) {
    const eventID = faker.string.uuid();
    const endTimeDate = new Date(startTimeDate.getTime() + durationHours * 60 * 60 * 1000);

    // Katılımcı listesini hazırla
    const participantsData: EventParticipant[] = participantsUsers.map(u => ({
        userID: u.userID,
        username: u.username!,
        profileImageUrl: u.profileImageUrl,
        role: u.userID === creatorUser.userID ? 'creator' : 'participant',
        eventScore: 0
    }));

    const eventData: Event = {
        eventID: eventID,
        name: title,
        info: faker.lorem.sentence(),
        hobbies: ["coding", "coffee"], // Örnek hobi
        creator: participantsData.find(p => p.userID === creatorUser.userID)!,
        capacity: 10,
        startTime: Timestamp.fromDate(startTimeDate),
        endTime: Timestamp.fromDate(endTimeDate),
        location: new GeoPoint(41.0082, 28.9784), // İstanbul
        attributes: { price: 0, smokingAllowed: false, alcoholAllowed: true, isPublic: true },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        feedType: FeedTypeEnum.Event, // Veya 'event' string
        participants: participantsData
    };

    // 1. Etkinliği 'events' koleksiyonuna yaz
    await setDoc(doc(db, "events", eventID), eventData);
    console.log(`Etkinlik Oluşturuldu: "${title}" (ID: ${eventID}) - Durum: ${status}`);

    // 2. Her kullanıcının 'eventHistory' subcollection'ına yaz
    for (const participant of participantsUsers) {
        const userEventData: UserEvent = {
            eventID: eventID,
            date: Timestamp.fromDate(startTimeDate),
            role: participant.userID === creatorUser.userID ? 'creator' : 'participant',
            status: status, // ongoing, upcoming vs.
            pinned: false
        };
        await setDoc(doc(db, "users", participant.userID, "eventHistory", eventID), userEventData);
    }
}

// ------------------------------
// Ana Populate Fonksiyonu
// ------------------------------

async function populateFirestoreAndAuth() {
    const users: User[] = [];
    const num_users = 5;
    const defaultPassword = "123456";

    console.log(`--- ${num_users} Kullanıcı Oluşturuluyor ---`);

    for (let i = 0; i < num_users; i++) {
        const email = `user${i + 1}@example.com`;
        const username = `User_${i + 1}_${faker.word.adjective()}`;

        let uid = "";
        let photoUrl = "";

        try {
            // Auth oluştur
            const userCredential = await createUserWithEmailAndPassword(auth, email, defaultPassword);
            uid = userCredential.user.uid;

            // Foto yükle ve Profil güncelle
            photoUrl = await uploadPhoto(`users/${uid}/profile.jpg`);
            await updateProfile(userCredential.user, { displayName: username, photoURL: photoUrl });

        } catch (e: any) {
            console.log(`Kullanıcı ${email} zaten var olabilir veya hata:`, e.message);
            // Varolanı login yapıp bilgilerini alalım (Script tekrar çalışırsa diye)
            try {
                const loginCred = await signInWithEmailAndPassword(auth, email, defaultPassword);
                uid = loginCred.user.uid;
                photoUrl = loginCred.user.photoURL || "https://via.placeholder.com/150";
            } catch (loginErr) {
                continue;
            }
        }

        const userData: User = {
            userID: uid,
            email: email,
            birthDate: Timestamp.fromDate(faker.date.birthdate({ min: 20, max: 30, mode: 'age' })),
            gender: 'other',
            username: username,
            profileImageUrl: photoUrl,
            permissions: { locationEnabled: true, notificationsEnabled: true },
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            lastActiveAt: Timestamp.now(),
            hobbies: [],
            // Diğer zorunlu alanlar...
        };

        users.push(userData);
        await setDoc(doc(db, "users", uid), userData);
        console.log(`User ${i + 1} Hazır: ${uid}`);
    }

    if (users.length < 5) {
        console.error("Yeterli kullanıcı yok, iptal ediliyor.");
        return;
    }

    console.log("\n--- Arkadaşlıklar Kuruluyor ---");
    // Grup A: 1 & 2
    await makeFriends(users[0], users[1]);
    // Grup B: 3 & 4
    await makeFriends(users[2], users[3]);
    // Connector: 5 herkesle
    users.slice(0, 4).forEach(async u => await makeFriends(users[4], u));


    console.log("\n--- Etkinlik Senaryoları Ekleniyor ---");

    const now = new Date();

    // SENARYO 1: User 1 ve User 2 AKTİF etkinlikte
    // Başlangıç: 1 saat önce, Bitiş: 2 saat sonra
    const activeStartTime = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    await createSpecificEvent(
        "Akşam Kahvesi Sohbeti", // Başlık
        users[0], // Creator: User 1
        [users[0], users[1]], // Katılımcılar: User 1, User 2
        activeStartTime,
        3, // 3 saatlik etkinlik (biri geçmiş, ikisi gelecek)
        'ongoing' // STATUS
    );

    // SENARYO 2: User 3 ve User 4 GELECEK etkinlikte
    // Başlangıç: Yarın bu saatte
    const futureStartTime1 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await createSpecificEvent(
        "Haftasonu Koşusu",
        users[2], // Creator: User 3
        [users[2], users[3]], // Katılımcılar: User 3, User 4
        futureStartTime1,
        2, // 2 saatlik
        'upcoming'
    );

    // SENARYO 3: User 1, 2 ve 3 GELECEK etkinlikte (Daha ileri tarih)
    // Başlangıç: 3 Gün sonra
    const futureStartTime2 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    await createSpecificEvent(
        "Büyük Buluşma Partisi",
        users[1], // Creator: User 2
        [users[0], users[1], users[2]], // Katılımcılar: User 1, 2, 3
        futureStartTime2,
        5,
        'upcoming'
    );

    console.log("\n--- TÜM İŞLEMLER TAMAMLANDI ---");
    console.log(`User 1 (${users[0].email}) ile giriş yapıp 'ongoing' etkinliği görebilirsin.`);
}

populateFirestoreAndAuth().then(() => {
    // process.exit(0); // Emulator bağlantısını kesmemesi için bazen açık bırakmak gerekebilir ama CLI run için exit iyidir.
});