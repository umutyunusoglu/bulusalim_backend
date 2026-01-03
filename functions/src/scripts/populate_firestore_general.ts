import { initializeApp } from "firebase/app";
import {
    getFirestore,
    connectFirestoreEmulator,
    doc,
    Timestamp,
    GeoPoint,
    writeBatch,
    DocumentReference
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
import { fakerTR as faker } from "@faker-js/faker";
import { encode } from "ngeohash";

// ==========================================
// 1. CONFIG & AYARLAR
// ==========================================


// Bedava Hugging Face için mecburi hız: 1
const CONCURRENCY_LIMIT = 1;

const TARGET_USER_COUNT = 30;
const TARGET_EVENT_COUNT = 50;

const firebaseConfig = {
    apiKey: "fake-api-key",
    authDomain: "localhost",
    projectId: "bulusalim-e8e7c",
    storageBucket: "bulusalim-e8e7c.firebasestorage.app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

connectFirestoreEmulator(db, "localhost", 8080);
connectAuthEmulator(auth, "http://localhost:9099");
connectStorageEmulator(storage, "localhost", 9199);

// ==========================================
// 2. HELPER: HF IMAGE GENERATOR (SAF KAN)
// ==========================================
// ==========================================
// 2. HELPER: FOOOCUS IMAGE GENERATOR (DOĞRU)
// ==========================================

// ==========================================
// 2. HELPER: FOOOCUS IMAGE GENERATOR (DOĞRU ENDPOINT)
// ==========================================

async function generateLocalImage(prompt: string): Promise<Blob> {
    const res = await fetch("http://127.0.0.1:7865/sdapi/v1/txt2img", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            prompt,
            steps: 20,
            width: 1024,
            height: 1024,
        }),
    });

    const data = await res.json();
    const base64 = data.images[0];
    const buffer = Buffer.from(base64, "base64");
    return new Blob([buffer], { type: "image/png" });
}


// ==========================================
// 3. HELPER: UPLOAD
// ==========================================
async function generateAndUpload(
    prompt: string,
    storagePath: string,
    label: string
): Promise<string> {

    console.log(`🎨 [${label}] Fooocus generating...`);

    try {
        const blob = await generateLocalImage(prompt);

        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, blob);

        console.log(`✅ [${label}] Fooocus OK`);
        return await getDownloadURL(storageRef);

    } catch (e: any) {
        console.error(`❌ [${label}] Fooocus FAIL → ${e.message}`);
        return "https://via.placeholder.com/600x400?text=Fooocus+Failed";
    }
}


async function downloadAndUpload(url: string, storagePath: string, label: string): Promise<string> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Fetch error");
        const blob = await response.blob();
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, blob);
        return await getDownloadURL(storageRef);
    } catch (e) {
        return "https://via.placeholder.com/150";
    }
}

// ==========================================
// 4. HELPER: BATCH MANAGER
// ==========================================

class BatchManager {
    private batch = writeBatch(db);
    private count = 0;

    async set(ref: DocumentReference, data: any) {
        this.batch.set(ref, data);
        this.count++;
        if (this.count >= 400) await this.commit();
    }

    async commit() {
        if (this.count === 0) return;
        const batchToCommit = this.batch;
        const countToLog = this.count;
        this.batch = writeBatch(db);
        this.count = 0;
        console.log(`💾  Veritabanına paket yazılıyor... (${countToLog} kayıt)`);
        await batchToCommit.commit();
    }
}
const batchManager = new BatchManager();

// ==========================================
// 5. HELPER: QUEUE
// ==========================================

async function processQueue<T>(items: T[], limit: number, handler: (item: T, index: number) => Promise<void>) {
    const executing: Promise<void>[] = [];
    for (const [index, item] of items.entries()) {
        const p = Promise.resolve().then(() => handler(item, index));
        executing.push(p);
        const clean = () => executing.splice(executing.indexOf(p), 1);
        p.then(clean).catch(clean);
        if (executing.length >= limit) await Promise.race(executing);
    }
    await Promise.all(executing);
}

// ==========================================
// 6. TİP & DATA
// ==========================================

// (Type tanımları aynı)
type EventStatus = 'saved' | 'pending' | 'rejected' | 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

interface User {
    userID: string;
    email: string;
    username: string;
    search_name: string;
    profileImageUrl: string;
    birthDate: Timestamp;
    gender: 'male' | 'female';
    permissions: { locationEnabled: boolean; notificationsEnabled: boolean };
    createdAt: Timestamp;
    updatedAt: Timestamp;
    lastActiveAt: Timestamp;
    bio: string;
    isPrivate: boolean;
}

interface EventParticipant {
    userID: string;
    username: string;
    profileImageUrl: string;
    role: 'creator' | 'participant';
    status: EventStatus;
    eventScore: number;
}

interface Event {
    eventID: string;
    name: string;
    search_name: string;
    info: string;
    hobbies: string[];
    creator: EventParticipant;
    capacity: number;
    startTime: Timestamp;
    endTime: Timestamp;
    location: GeoPoint;
    address: string;
    geohash: string;
    attributes: { isPublic: boolean; price: number; smokingAllowed: boolean; alcoholAllowed: boolean };
    createdAt: Timestamp;
    updatedAt: Timestamp;
    feedType: 'event';
    participantCount: number;
    participants: EventParticipant[];
}

interface PostParticipant {
    userID: string;
    username: string;
    profileImageUrl: string;
}

interface Post {
    postID: string;
    creator: { userID: string; username: string; profileImageUrl: string };
    eventID: string;
    caption: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    location: GeoPoint;
    address: string;
    hobbies: string[];
    imageUrls: string[];
    emoteCounts: { [key: string]: number };
    feedType: 'post';
    showParticipants: boolean;
    participants: PostParticipant[];
    includeInDump: boolean;
}

const LOCATIONS = [
    { name: "Kadıköy, İstanbul", lat: 40.9819, lng: 29.0254 },
    { name: "Beşiktaş, İstanbul", lat: 41.0422, lng: 29.0067 },
    { name: "Şişli, İstanbul", lat: 41.0529, lng: 28.9869 },
    { name: "Karaköy, İstanbul", lat: 41.0255, lng: 28.9742 },
    { name: "Caddebostan, İstanbul", lat: 40.9632, lng: 29.0688 },
    { name: "Üsküdar, İstanbul", lat: 41.0269, lng: 29.0167 }
];

const PHOTO_KEYWORDS: { [key: string]: string } = {
    "Kahve": "people drinking coffee in a cafe",
    "Yemek": "friends eating dinner restaurant",
    "Parti": "party atmosphere neon lights",
    "Futbol": "people playing soccer field",
    "Basketbol": "basketball game outdoor",
    "Koşu": "people running park",
    "Doğa Yürüyüşü": "hiking nature forest",
    "Müzik": "concert crowd live music",
    "Film": "cinema audience watching movie",
    "Oyun": "gamers playing video games",
    "Dans": "people dancing club",
    "Yoga": "yoga class studio",
    "Ders Çalışma": "students studying library",
    "Tatlı": "delicious dessert cake",
    "İçmece": "friends drinking beer pub",
    "Gym": "people workout gym fitness",
    "Tenis": "tennis match court",
    "Kitap Okuma": "person reading book cafe",
    "Sohbet": "friends talking laughing",
    "Tanışma": "people shaking hands meeting",
    "Karaoke": "karaoke singing microphone",
    "Masa Oyunları": "board games table friends",
    "Tiyatro": "theater stage actors",
    "Doğum Günü": "birthday cake celebration",
    "Bowling": "bowling alley game",
    "Voleybol": "volleyball game beach",
    "Yürüyüş": "people walking city street",
    "Workshop": "creative workshop craft",
    "Seminer": "conference speaker audience",
    "Topluluk Etkinliği": "crowd festival outdoor",
    "Diğer": "city lights night abstract"
};

const EVENT_TAXONOMY = Object.keys(PHOTO_KEYWORDS);

const NAMES_MALE = ["Emre", "Burak", "Can", "Mert", "Kerem", "Barış", "Onur", "Eren", "Mehmet", "Cem", "Arda", "Kaan", "Yiğit", "Mustafa", "Ali", "Ozan", "Serkan"];
const NAMES_FEMALE = ["Zeynep", "Melis", "Elif", "Hande", "Selin", "Ayşe", "Gizem", "Gamze", "Yasemin", "Ece", "Buse", "İlayda", "Seda", "Merve", "Büşra", "Ceren"];
const LAST_NAMES = ["Yılmaz", "Demir", "Kaya", "Çelik", "Şahin", "Yıldız", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin"];

// ==========================================
// 8. MAIN
// ==========================================

async function main() {
    console.log("🚀 SCRIPT BAŞLIYOR... (Mod: PURE HUGGING FACE - CompVis v1.4)");


    // A. KULLANICI OLUŞTURMA
    const users: User[] = [];
    const userIndices = Array.from({ length: TARGET_USER_COUNT }, (_, i) => i);
    console.log(`\n👤 --- ADIM 1: ${TARGET_USER_COUNT} KULLANICI OLUŞTURULUYOR ---`);

    // Kullanıcı için AI yok, hızlı (10)
    await processQueue(userIndices, 10, async (i) => {
        const isFemale = i % 2 === 0;
        const gender = isFemale ? 'female' : 'male';
        const fname = isFemale ? faker.helpers.arrayElement(NAMES_FEMALE) : faker.helpers.arrayElement(NAMES_MALE);
        const lname = faker.helpers.arrayElement(LAST_NAMES);
        const fullName = `${fname} ${lname}`;
        const email = faker.internet.email({ firstName: fname, lastName: lname, provider: 'test.com' }).toLowerCase();

        let uid;
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, "password123");
            uid = cred.user.uid;
        } catch {
            const cred = await signInWithEmailAndPassword(auth, email, "password123");
            uid = cred.user.uid;
        }

        const avatarUrl = `https://xsgames.co/randomusers/avatar.php?g=${gender}&r=${Math.random()}`;
        const photoUrl = await downloadAndUpload(avatarUrl, `users/${uid}/profile.jpg`, `User: ${fname}`);

        await updateProfile(auth.currentUser!, { displayName: fullName, photoURL: photoUrl });

        const userData: User = {
            userID: uid, email, username: `${fname.toLowerCase()}_${lname.toLowerCase()}_${faker.string.numeric(2)}`,
            search_name: fullName.toLowerCase(), profileImageUrl: photoUrl,
            birthDate: Timestamp.fromDate(faker.date.birthdate({ min: 18, max: 35, mode: 'age' })),
            gender, permissions: { locationEnabled: true, notificationsEnabled: true },
            createdAt: Timestamp.now(), updatedAt: Timestamp.now(), lastActiveAt: Timestamp.now(),
            bio: faker.person.bio(), isPrivate: Math.random() < 0.2
        };

        users.push(userData);
        await batchManager.set(doc(db, "users", uid), userData);
    });

    console.log("\n✅ TÜM KULLANICILAR HAZIR.");

    // B. ETKİNLİK VE POST OLUŞTURMA
    const eventIndices = Array.from({ length: TARGET_EVENT_COUNT }, (_, i) => i);
    console.log(`\n📅 --- ADIM 2: ${TARGET_EVENT_COUNT} ETKİNLİK ve POSTLAR İŞLENİYOR ---`);

    // HUGGING FACE KULLANILIYOR -> HIZ = 1
    await processQueue(eventIndices, CONCURRENCY_LIMIT, async (i) => {
        const loc = faker.helpers.arrayElement(LOCATIONS);
        const eventType = faker.helpers.arrayElement(EVENT_TAXONOMY);

        const lat = loc.lat + (Math.random() * 0.01 - 0.005);
        const lng = loc.lng + (Math.random() * 0.01 - 0.005);
        const geoPoint = new GeoPoint(lat, lng);
        const geohash = encode(lat, lng, 7);
        const title = `${loc.name.split(',')[0]} ${eventType} Buluşması`;
        const eventID = faker.string.uuid();
        const creator = faker.helpers.arrayElement(users);

        const timeState: 'upcoming' | 'ongoing' | 'completed' = faker.helpers.weightedArrayElement([
            { weight: 4, value: 'upcoming' },
            { weight: 2, value: 'ongoing' },
            { weight: 4, value: 'completed' }
        ]);

        let startTime: Date;
        if (timeState === 'upcoming') startTime = faker.date.soon({ days: 10 });
        else if (timeState === 'ongoing') startTime = new Date(Date.now() - 30 * 60000);
        else startTime = faker.date.recent({ days: 5 });
        const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

        const participantsData: EventParticipant[] = [];
        participantsData.push({
            userID: creator.userID, username: creator.username, profileImageUrl: creator.profileImageUrl,
            role: 'creator', status: timeState, eventScore: 100
        });

        const selectedUsers = faker.helpers.arrayElements(users.filter(u => u.userID !== creator.userID), faker.number.int({ min: 2, max: 8 }));
        selectedUsers.forEach(u => {
            participantsData.push({
                userID: u.userID, username: u.username, profileImageUrl: u.profileImageUrl,
                role: 'participant', status: (timeState === 'upcoming' ? 'upcoming' : timeState) as EventStatus, eventScore: 0
            });
        });

        const eventDoc: Event = {
            eventID, name: title, search_name: title.toLowerCase(),
            info: faker.lorem.paragraph(1), hobbies: [eventType],
            creator: participantsData[0], capacity: 20,
            startTime: Timestamp.fromDate(startTime), endTime: Timestamp.fromDate(endTime),
            location: geoPoint, address: loc.name, geohash: geohash,
            attributes: { isPublic: true, price: 0, smokingAllowed: false, alcoholAllowed: true },
            createdAt: Timestamp.now(), updatedAt: Timestamp.now(), feedType: 'event',
            participantCount: participantsData.length, participants: participantsData
        };
        await batchManager.set(doc(db, "events", eventID), eventDoc);

        for (const p of participantsData) {
            await batchManager.set(doc(db, "events", eventID, "participants", p.userID), p);
            await batchManager.set(doc(db, "users", p.userID, "eventLog", eventID), {
                eventID, date: Timestamp.fromDate(startTime), role: p.role, status: p.status
            });
        }

        console.log(`📌 Event [${i + 1}/${TARGET_EVENT_COUNT}]: ${title}`);

        if (timeState !== 'upcoming') {
            const posters = participantsData.slice(0, 2);

            // Postları SIRAYLA işle
            for (const poster of posters) {
                const postID = faker.string.uuid();

                const basePrompt = PHOTO_KEYWORDS[eventType] || "social gathering";
                const prompt = `${basePrompt}, realistic, photography, highly detailed, 4k`;

                // BURADA HUGGING FACE ÇALIŞACAK
                const postImgUrl = await generateAndUpload(prompt, `posts/${postID}.jpg`, `Post: ${eventType}`);

                const taggedUsers = participantsData.filter(p => p.userID !== poster.userID).slice(0, 2)
                    .map(p => ({ userID: p.userID, username: p.username, profileImageUrl: p.profileImageUrl }));

                const postDoc: Post = {
                    postID,
                    creator: { userID: poster.userID, username: poster.username, profileImageUrl: poster.profileImageUrl },
                    eventID,
                    caption: faker.helpers.arrayElement([`Harika bir ${eventType} günü!`, "Ortam süper.", "Keyifler yerinde."]),
                    createdAt: Timestamp.fromDate(new Date()), updatedAt: Timestamp.now(),
                    location: geoPoint, address: loc.name, hobbies: [eventType], imageUrls: [postImgUrl],
                    emoteCounts: { 'heart': faker.number.int({ min: 5, max: 50 }) },
                    feedType: 'post', showParticipants: taggedUsers.length > 0, participants: taggedUsers, includeInDump: true
                };
                await batchManager.set(doc(db, "posts", postID), postDoc);
            }
        }
    });

    await batchManager.commit();
    console.log("\n✅✅✅ BÜTÜN İŞLEMLER BAŞARIYLA TAMAMLANDI.");
    process.exit(0);
}

main().catch(e => {
    console.error("KRİTİK HATA:", e);
    process.exit(1);
});