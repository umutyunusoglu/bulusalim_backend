import { initializeApp } from "firebase/app";
import {
    getFirestore,
    connectFirestoreEmulator,
    setDoc,
    doc,
    Timestamp,
    GeoPoint,
    writeBatch
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
import { encode } from "ngeohash";

// TİPLER
// Not: Projenizdeki tip dosyalarının yollarının doğru olduğundan emin olun
import { User, UserEvent } from "./types/user";
import { EventParticipant } from "./types/event";
import { Post, PinnedPost } from "./types/post";
import { FeedTypeEnum } from "./types/feed_enum";

// ------------------------------
// CONFIG
// ------------------------------
const TOTAL_USERS = 15;
const FIXED_CAPACITY = 20;

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

// Emulator Bağlantıları
connectFirestoreEmulator(db, "localhost", 8080);
connectAuthEmulator(auth, "http://localhost:9099");
connectStorageEmulator(storage, "localhost", 9199);

console.log("🚀 Final Script: Categories, Real Locations & Smart Post Logic...");

// ------------------------------
// CONSTANTS & CATEGORIES
// ------------------------------

const EVENT_CATEGORIES: Record<string, string> = {
    "Sohbet": "💬", "Tanışma": "👋", "Kahve": "☕", "Yemek": "🍔", "Tatlı": "🍰",
    "İçmece": "🍺", "Parti": "🎉️", "Karaoke": "🎤", "Film": "🎬", "Müzik": "🎸",
    "Masa Oyunları": "🎲", "Oyun": "🎮", "Dans": "💃", "Tiyatro": "🎭",
    "Doğum Günü": "🎂", "Bowling": "🎳", "Gym": "🏋️", "Futbol": "⚽",
    "Basketbol": "🏀", "Tenis": "🎾", "Voleybol": "🏐", "Koşu": "🏃",
    "Yürüyüş": "🚶", "Yoga": "🧘", "Ders Çalışma": "📖", "Workshop": "🛠️",
    "Seminer": "🎤", "Topluluk Etkinliği": "🙌", "Kitap Okuma": "📚", "Diğer": "✨"
};

// İstanbul'un 5 Popüler Semt Merkezi
const DISTRICT_CENTERS = [
    { name: "Kadıköy (Moda)", lat: 40.9870, lng: 29.0234, district: "İstanbul, Kadıköy" },
    { name: "Beşiktaş (Çarşı)", lat: 41.0422, lng: 29.0067, district: "İstanbul, Beşiktaş" },
    { name: "Şişli (Nişantaşı)", lat: 41.0520, lng: 28.9935, district: "İstanbul, Şişli" },
    { name: "Beyoğlu (Cihangir)", lat: 41.0315, lng: 28.9837, district: "İstanbul, Beyoğlu" },
    { name: "Sarıyer (Emirgan)", lat: 41.1042, lng: 29.0536, district: "İstanbul, Sarıyer" }
];

// 500m sapma (derece cinsinden yaklaşık değer)
const MAX_OFFSET_DEG = 0.0045;

// ------------------------------
// UTILS
// ------------------------------

async function uploadRandomPhoto(path: string, type: 'profile' | 'post' = 'profile'): Promise<string> {
    const width = type === 'post' ? 600 : 200;
    const height = type === 'post' ? 400 : 200;

    try {
        const res = await fetch(`https://picsum.photos/${width}/${height}?random=${Math.random()}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, buffer);
        return await getDownloadURL(storageRef);
    } catch {
        return "https://via.placeholder.com/150";
    }
}

// Semt seçip 500m içinde randomize eden fonksiyon
function getRandomIstanbulLocation() {
    // Rastgele bir semt seç
    const district = faker.helpers.arrayElement(DISTRICT_CENTERS);

    // Merkezden +/- 0.0045 derece sapma
    const latOffset = (Math.random() * (MAX_OFFSET_DEG * 2)) - MAX_OFFSET_DEG;
    const lngOffset = (Math.random() * (MAX_OFFSET_DEG * 2)) - MAX_OFFSET_DEG;

    const lat = district.lat + latOffset;
    const lng = district.lng + lngOffset;

    const geohash = encode(lat, lng, 7);
    const geoPoint = new GeoPoint(lat, lng);

    return {
        geoPoint,
        geohash,
        address: district.district,
        debugName: district.name
    };
}

// ------------------------------
// 1. USER CREATION
// ------------------------------

async function createUsers(): Promise<User[]> {
    const users: User[] = [];
    console.log(`\nCreating ${TOTAL_USERS} Users...`);

    for (let i = 0; i < TOTAL_USERS; i++) {
        const id = i + 1;
        const email = `user${id}@test.com`;
        const password = "password123";
        const username = `User ${id}`;

        let uid = "";
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            uid = cred.user.uid;
        } catch (e) {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            uid = cred.user.uid;
        }

        const photoUrl = await uploadRandomPhoto(`users/${uid}/profile.jpg`, 'profile');
        await updateProfile(auth.currentUser!, { displayName: username, photoURL: photoUrl });

        const userData: User = {
            userID: uid,
            email: email,
            username: username,
            search_name: username.toLowerCase(),
            profileImageUrl: photoUrl,
            birthDate: Timestamp.fromDate(faker.date.birthdate({ min: 20, max: 30, mode: 'age' })),
            gender: 'other',
            permissions: { locationEnabled: true, notificationsEnabled: true },
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            lastActiveAt: Timestamp.now(),
            hobbies: [],
            bio: id === 1 ? "MAIN TEST USER" : `Simulation user ${id}`,
            isPrivate: faker.datatype.boolean()
        }
        await setDoc(doc(db, "users", uid), userData);
        users.push(userData);
    }
    console.log("✅ Users Created.");
    return users;
}

// ------------------------------
// 2. FRIENDSHIPS
// ------------------------------

async function createFriendships(users: User[]) {
    console.log("\nWeaving Social Network...");
    const batch = writeBatch(db);

    const connect = (u1: User, u2: User) => {
        const common = { createdAt: Timestamp.now() };
        batch.set(doc(db, "users", u1.userID, "followees", u2.userID), {
            userID: u2.userID, username: u2.username, profileImageUrl: u2.profileImageUrl, ...common
        });
        batch.set(doc(db, "users", u2.userID, "followers", u1.userID), {
            userID: u1.userID, username: u1.username, profileImageUrl: u1.profileImageUrl, ...common
        });
        batch.set(doc(db, "users", u2.userID, "followees", u1.userID), {
            userID: u1.userID, username: u1.username, profileImageUrl: u1.profileImageUrl, ...common
        });
        batch.set(doc(db, "users", u1.userID, "followers", u2.userID), {
            userID: u2.userID, username: u2.username, profileImageUrl: u2.profileImageUrl, ...common
        });
    };

    connect(users[0], users[1]); connect(users[0], users[2]); connect(users[0], users[3]); connect(users[0], users[4]);
    connect(users[1], users[2]); connect(users[2], users[3]); connect(users[3], users[4]);
    for (let i = 6; i < 9; i++) connect(users[5], users[i]);
    connect(users[4], users[5]);
    connect(users[0], users[10]);

    await batch.commit();
    console.log("✅ Social Graph Established.");
}

// ------------------------------
// 3. POST GENERATION LOGIC
// ------------------------------

async function createPostsForEvent(
    users: User[],
    event: any,
    creatorIdx: number,
    acceptedIdxs: number[],
    timeStatus: 'ongoing' | 'completed' | 'upcoming'
) {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const eventStartMs = event.startTime.toDate().getTime();

    // --- LOGIC GATES ---
    // 1. Upcoming etkinliklere ASLA post atılmaz.
    if (timeStatus === 'upcoming') return;

    // 2. Completed etkinliklerde 24 saat geçmişse ASLA post atılmaz.
    if (timeStatus === 'completed' && (nowMs - eventStartMs > ONE_DAY_MS)) {
        console.log(`    -> Skipped posts for ${event.name} (Older than 24h).`);
        return;
    }

    console.log(`    -> Generating posts for ${event.name}...`);
    const potentialPostersIdx = [creatorIdx, ...acceptedIdxs];

    for (const userIdx of potentialPostersIdx) {
        const isCreator = userIdx === creatorIdx;
        const postChance = isCreator ? 0.9 : 0.6; // Creator almost always posts

        if (Math.random() > postChance) continue;

        const u = users[userIdx];
        const postID = faker.string.uuid();
        const imageUrl = await uploadRandomPhoto(`users/${u.userID}/posts/${postID}.jpg`, 'post');

        // --- TIME CALCULATION ---
        let postDateObj: Date;

        if (timeStatus === 'ongoing') {
            // Şu andan max 15 dk öncesi
            postDateObj = new Date(nowMs - faker.number.int({ min: 1000, max: 15 * 60 * 1000 }));
        } else {
            // Completed (ve 24 saat sınırını geçmiş değil):
            // Etkinlik başlangıcı ile şu an arasında rastgele bir an
            const range = nowMs - eventStartMs;
            const offset = faker.number.int({ min: 0, max: range });
            postDateObj = new Date(eventStartMs + offset);
        }

        const captions = timeStatus === 'completed'
            ? ["What a night!", "So fun.", `Loved the ${event.hobbies?.[0]} session!`, "Can't wait for next time."]
            : ["Live now!", "Happening!", "Vibes are immaculate.", "Join us!"];
        const caption = faker.helpers.arrayElement(captions);

        const emoteCounts = {
            'heart': faker.number.int({ min: 5, max: 25 }),
            'clap': faker.number.int({ min: 1, max: 15 }),
            'egg': faker.number.int({ min: 0, max: 5 })
        };

        const postData: Post = {
            postID: postID,
            creator: { userID: u.userID, username: u.username, profileImageUrl: u.profileImageUrl },
            eventID: event.eventID,
            caption: caption,
            createdAt: Timestamp.fromDate(postDateObj),
            updatedAt: Timestamp.fromDate(postDateObj),
            location: event.location,
            address: event.address,
            hobbies: event.hobbies,
            imageUrls: [imageUrl],
            participants: [],
            emoteCounts: emoteCounts,
            feedType: FeedTypeEnum.Post,
            showParticipants: true,
            includeInDump: true
        };

        await setDoc(doc(db, "posts", postID), postData);

        const pinChance = (userIdx === 0) ? 1.0 : 0.5;
        if (Math.random() < pinChance) {
            const pinned: PinnedPost = {
                postID: postID,
                caption: caption,
                location: event.location,
                imageUrls: [imageUrl],
                participants: [],
                emoteCounts: emoteCounts,
                createdAt: Timestamp.fromDate(postDateObj)
            };
            await setDoc(doc(db, "users", u.userID, "pinnedPosts", postID), pinned);
        }
    }
}

// ------------------------------
// 4. SCENARIO BUILDER (SMART COUNT)
// ------------------------------

async function createScenarioEvent(
    users: User[],
    params: {
        scenarioID: number,
        title: string,
        hobbyKey: keyof typeof EVENT_CATEGORIES, // String değil Key zorunlu
        creatorIdx: number,
        acceptedIdxs: number[],
        pendingIdxs: number[],
        rejectedIdxs: number[],
        savedIdxs: number[],
        timeOffsetDay: number,
    }
) {
    const eventID = faker.string.uuid();
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + params.timeOffsetDay);

    let timeStatus: 'completed' | 'ongoing' | 'upcoming';
    if (params.timeOffsetDay < 0) timeStatus = 'completed';
    else if (params.timeOffsetDay === 0) timeStatus = 'ongoing';
    else timeStatus = 'upcoming';

    const participantsData: EventParticipant[] = [];
    const creator = users[params.creatorIdx];

    const addP = (uIdx: number, status: string, role: 'creator' | 'participant') => {
        const u = users[uIdx];
        participantsData.push({
            userID: u.userID,
            username: u.username,
            profileImageUrl: u.profileImageUrl,
            role: role,
            status: status as any,
            eventScore: role === 'creator' ? 100 : 0
        });
    };

    addP(params.creatorIdx, timeStatus, 'creator');
    params.acceptedIdxs.forEach(i => addP(i, timeStatus, 'participant'));
    params.pendingIdxs.forEach(i => addP(i, 'pending', 'participant'));
    params.rejectedIdxs.forEach(i => addP(i, 'rejected', 'participant'));

    const activeParticipantCount = participantsData.filter(p =>
        p.role === 'creator' ||
        p.status === 'accepted' ||
        p.status === 'ongoing' ||
        p.status === 'completed'
    ).length;

    const debugName = `S${params.scenarioID}: ${params.title} (${timeStatus.toUpperCase().slice(0, 3)})`;

    // --- REAL LOCATION & ADDRESS LOGIC ---
    const locData = getRandomIstanbulLocation();
    // -------------------------------------

    const eventDoc: any = {
        eventID: eventID,
        name: debugName,
        search_name: debugName.toLowerCase(),
        info: `Scenario ${params.scenarioID} hosted by ${creator.username}. Category: ${params.hobbyKey}`,
        hobbies: [params.hobbyKey], // Sadece Key kullanıyoruz
        creator: participantsData[0],
        capacity: FIXED_CAPACITY,
        startTime: Timestamp.fromDate(eventDate),
        endTime: Timestamp.fromDate(new Date(eventDate.getTime() + 2 * 60 * 60 * 1000)),
        location: locData.geoPoint,
        address: locData.address, // "İstanbul, Beşiktaş" gibi
        geohash: locData.geohash,
        attributes: { isPublic: true },
        createdAt: Timestamp.now(), // Event önce oluşturulur
        updatedAt: Timestamp.now(),
        feedType: FeedTypeEnum.Event,
        participantCount: activeParticipantCount,
        participants: participantsData,
    };

    // 1. Create Event Document
    await setDoc(doc(db, "events", eventID), eventDoc);

    // 2. Subcollection Write
    const participantsBatch = writeBatch(db);
    participantsData.forEach(p => {
        const pRef = doc(db, "events", eventID, "participants", p.userID);
        participantsBatch.set(pRef, p);
    });
    await participantsBatch.commit();

    console.log(`  -> Created Event: ${debugName} @ ${locData.debugName}`);

    // 3. User Logs
    const userLogBatch = writeBatch(db);
    const addToLog = (uIdx: number, status: string, role: string) => {
        const u = users[uIdx];
        userLogBatch.set(doc(db, "users", u.userID, "eventLog", eventID), {
            eventID: eventID, date: Timestamp.fromDate(eventDate), role: role, status: status, pinned: false
        } as UserEvent);
    };

    addToLog(params.creatorIdx, timeStatus, 'creator');
    params.acceptedIdxs.forEach(i => addToLog(i, timeStatus, 'participant'));
    params.pendingIdxs.forEach(i => addToLog(i, 'pending', 'participant'));
    params.rejectedIdxs.forEach(i => addToLog(i, 'rejected', 'participant'));
    params.savedIdxs.forEach(i => addToLog(i, 'saved', 'participant'));

    await userLogBatch.commit();

    // 4. Create Posts (AFTER event creation to ensure chronology)
    // Post mantığı (24 saat kuralı vs) bu fonksiyonun içinde
    await createPostsForEvent(users, eventDoc, params.creatorIdx, params.acceptedIdxs, timeStatus);
}

// ------------------------------
// MAIN
// ------------------------------
async function main() {
    const users = await createUsers();
    await createFriendships(users);

    console.log("\nGenerating Scenarios with New Categories & Locations...");

    // S1: Futbol
    await createScenarioEvent(users, {
        scenarioID: 1, title: "Squad Match", hobbyKey: "Futbol",
        creatorIdx: 0, acceptedIdxs: [1, 2, 3, 4], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 2 // Upcoming
    });

    // S2: Parti
    await createScenarioEvent(users, {
        scenarioID: 2, title: "Open Party", hobbyKey: "Parti",
        creatorIdx: 0, acceptedIdxs: [1], pendingIdxs: [10, 11, 12, 13, 14], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 5 // Upcoming
    });

    // S3: Masa Oyunları (Eski Chess)
    await createScenarioEvent(users, {
        scenarioID: 3, title: "Elite Chess", hobbyKey: "Masa Oyunları",
        creatorIdx: 5, acceptedIdxs: [6, 7, 8], pendingIdxs: [], rejectedIdxs: [0], savedIdxs: [],
        timeOffsetDay: 3 // Upcoming
    });

    // S4: Oyun (Eski Gaming)
    await createScenarioEvent(users, {
        scenarioID: 4, title: "LAN Party", hobbyKey: "Oyun",
        creatorIdx: 2, acceptedIdxs: [3, 4], pendingIdxs: [0], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 1 // Upcoming
    });

    // S5: Diğer (Eski Art - Sergi için en uygunu)
    await createScenarioEvent(users, {
        scenarioID: 5, title: "Art Exhibition", hobbyKey: "Diğer",
        creatorIdx: 12, acceptedIdxs: [13, 14], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [0],
        timeOffsetDay: 10 // Upcoming
    });

    // S6: Koşu (Morning Run) - ONGOING (0 gün)
    await createScenarioEvent(users, {
        scenarioID: 6, title: "Morning Run", hobbyKey: "Koşu",
        creatorIdx: 0, acceptedIdxs: [5], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 0 // Ongoing -> Post atar (son 15 dk içinde)
    });

    // S7: Müzik (Festival) - COMPLETED OLD (-5 gün)
    await createScenarioEvent(users, {
        scenarioID: 7, title: "Festival", hobbyKey: "Müzik",
        creatorIdx: 0, acceptedIdxs: [1, 5, 10], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: -5 // Completed & >24h -> Post ATMAZ
    });

    // S8: Doğum Günü (Eski Private B-Day) - COMPLETED OLD (-2 gün)
    await createScenarioEvent(users, {
        scenarioID: 8, title: "Private B-Day", hobbyKey: "Doğum Günü",
        creatorIdx: 6, acceptedIdxs: [5, 7, 8, 9], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [0],
        timeOffsetDay: -2 // Completed & >24h -> Post ATMAZ
    });

    // S9: Diğer (Night Drive) - Upcoming
    await createScenarioEvent(users, {
        scenarioID: 9, title: "Night Drive", hobbyKey: "Diğer",
        creatorIdx: 0, acceptedIdxs: [], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [1],
        timeOffsetDay: 7 // Upcoming
    });

    // S10: Workshop (Eski Code) - Upcoming
    await createScenarioEvent(users, {
        scenarioID: 10, title: "Code Workshop", hobbyKey: "Workshop",
        creatorIdx: 0, acceptedIdxs: [], pendingIdxs: [6, 7], rejectedIdxs: [11], savedIdxs: [],
        timeOffsetDay: 6 // Upcoming
    });

    console.log("\n=================================");
    console.log("✅ DONE! Check 'events' & 'posts' collections.");
    console.log("=================================");
    process.exit(0);
}

main();