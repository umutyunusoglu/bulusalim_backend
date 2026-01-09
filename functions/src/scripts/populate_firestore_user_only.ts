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
import { User, UserEvent } from "./types/user";
import { Post, PinnedPost } from "./types/post";
import { FeedTypeEnum } from "./types/feed_enum";

// ------------------------------
// ENUMS
// ------------------------------

// EVENT STATUS (Etkinliğin genel durumu)
enum EventStatus {
    Upcoming = 'upcoming',
    Ongoing = 'ongoing',
    Completed = 'completed',
    Cancelled = 'cancelled'
}

// PARTICIPANT STATUS (Kullanıcının etkinlikle ilişkisi)
enum EventParticipantStatus {
    Saved = 'saved',
    Pending = 'pending',
    Accepted = 'accepted',
    Rejected = 'rejected',
    Upcoming = 'upcoming', // Kullanıcı için de bu statüler loglarda kullanılabilir
    Ongoing = 'ongoing',
    Completed = 'completed',
    Cancelled = 'cancelled',
}

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

console.log("🚀 Final Script: EVENT STATUS ADDED (Upcoming, Ongoing, Completed)...");

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

const DISTRICT_CENTERS = [
    { name: "Kadıköy (Moda)", lat: 40.9870, lng: 29.0234, district: "İstanbul, Kadıköy" },
    { name: "Beşiktaş (Çarşı)", lat: 41.0422, lng: 29.0067, district: "İstanbul, Beşiktaş" },
    { name: "Şişli (Nişantaşı)", lat: 41.0520, lng: 28.9935, district: "İstanbul, Şişli" },
    { name: "Beyoğlu (Cihangir)", lat: 41.0315, lng: 28.9837, district: "İstanbul, Beyoğlu" },
    { name: "Sarıyer (Emirgan)", lat: 41.1042, lng: 29.0536, district: "İstanbul, Sarıyer" }
];

const MAX_OFFSET_DEG = 0.0045;

// ------------------------------
// UTILS
// ------------------------------

async function uploadRandomPhoto(path: string, type: 'profile' | 'post' = 'profile'): Promise<string> {
    const width = type === 'post' ? 600 : 200;
    const height = type === 'post' ? 800 : 200;

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

function getRandomIstanbulLocation() {
    const district = faker.helpers.arrayElement(DISTRICT_CENTERS);
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
    status: EventStatus // EventStatus enum kullanıyoruz
) {
    // KURAL: Upcoming ise post atma
    if (status === EventStatus.Upcoming) {
        return;
    }

    const nowMs = Date.now();
    const eventStartMs = event.startTime.toDate().getTime();
    const potentialPostersIdx = [creatorIdx, ...acceptedIdxs];

    console.log(`    -> Generating posts for ${event.name}...`);

    for (const userIdx of potentialPostersIdx) {
        const u = users[userIdx];
        const postID = faker.string.uuid();

        // KURAL: 1-3 Fotoğraf
        const photoCount = faker.number.int({ min: 1, max: 3 });
        const imageUrls: string[] = [];
        for (let k = 0; k < photoCount; k++) {
            const url = await uploadRandomPhoto(`users/${u.userID}/posts/${postID}_${k}.jpg`, 'post');
            imageUrls.push(url);
        }

        // KURAL: Zamanlama
        let postDateObj: Date;
        if (status === EventStatus.Ongoing) {
            postDateObj = new Date(nowMs - faker.number.int({ min: 1000, max: 30 * 60 * 1000 }));
        } else {
            // Completed: Max 24 saat içinde
            const maxDelay = 24 * 60 * 60 * 1000;
            const offset = faker.number.int({ min: 0, max: maxDelay });
            postDateObj = new Date(eventStartMs + offset);
        }

        const captions = status === EventStatus.Completed
            ? ["What a night!", "So fun.", `Loved the ${event.hobbies?.[0]} session!`, "Can't wait for next time.", "Memories 📸"]
            : ["Live now!", "Happening!", "Vibes are immaculate.", "Join us!", "Here right now!"];
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
            displayAddress: event.displayAddress,
            hobbies: event.hobbies,
            imageUrls: imageUrls,
            participants: [],
            emoteCounts: emoteCounts,
            feedType: FeedTypeEnum.Post,
            showParticipants: true,
            includeInDump: true
        };

        await setDoc(doc(db, "posts", postID), postData);

        if (Math.random() < 0.3) {
            const pinned: PinnedPost = {
                postID: postID,
                caption: caption,
                location: event.location,
                imageUrls: imageUrls,
                participants: [],
                emoteCounts: emoteCounts,
                createdAt: Timestamp.fromDate(postDateObj)
            };
            await setDoc(doc(db, "users", u.userID, "pinnedPosts", postID), pinned);
        }
    }
}

// ------------------------------
// 4. SCENARIO BUILDER (PURE SUBCOLLECTIONS)
// ------------------------------

async function createScenarioEvent(
    users: User[],
    params: {
        scenarioID: number,
        title: string,
        hobbyKey: keyof typeof EVENT_CATEGORIES,
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

    // -------------------------------------------------------------
    // EVENT STATUS & PARTICIPANT STATUS HESAPLAMA
    // -------------------------------------------------------------
    let eventStatus: EventStatus;

    if (params.timeOffsetDay < 0) {
        eventStatus = EventStatus.Completed;
    } else if (params.timeOffsetDay === 0) {
        eventStatus = EventStatus.Ongoing;
    } else {
        eventStatus = EventStatus.Upcoming;
    }

    const creator = users[params.creatorIdx];
    const creatorSummary = {
        userID: creator.userID,
        username: creator.username,
        profileImageUrl: creator.profileImageUrl,
        role: 'creator',
        status: eventStatus, // Creator status genellikle event status ile aynıdır
        eventScore: 100
    };

    const locData = getRandomIstanbulLocation();
    const debugName = `S${params.scenarioID}: ${params.title} (${eventStatus.toUpperCase()})`;
    console.log(`  -> Creating Event: ${debugName}`);

    const batch = writeBatch(db);

    // 1. PARTICIPANTS (Active)
    const addActiveParticipant = (uIdx: number, role: 'creator' | 'participant') => {
        const u = users[uIdx];
        const pData = {
            userID: u.userID,
            username: u.username,
            profileImageUrl: u.profileImageUrl,
            role: role,
            status: eventStatus, // Katılımcının statüsü de etkinliğin o anki durumu olur
            eventScore: role === 'creator' ? 100 : 0
        };
        const ref = doc(db, "events", eventID, "participants", u.userID);
        batch.set(ref, pData);
    };

    addActiveParticipant(params.creatorIdx, 'creator');
    params.acceptedIdxs.forEach(idx => addActiveParticipant(idx, 'participant'));

    // 2. REQUEST POOL (Pending)
    params.pendingIdxs.forEach(idx => {
        const u = users[idx];
        const reqData = { userID: u.userID, username: u.username, profileImageUrl: u.profileImageUrl };
        batch.set(doc(db, "events", eventID, "requestPool", u.userID), reqData);
    });

    // 3. REJECTED USERS
    params.rejectedIdxs.forEach(idx => {
        const u = users[idx];
        const rejData = { userID: u.userID, username: u.username, profileImageUrl: u.profileImageUrl };
        batch.set(doc(db, "events", eventID, "rejectedUsers", u.userID), rejData);
    });

    // -------------------------------------------------------------
    // 4. EVENT DOCUMENT (UPDATED WITH STATUS)
    // -------------------------------------------------------------
    const eventDoc: any = {
        eventID: eventID,
        name: debugName,
        search_name: debugName.toLowerCase(),
        info: `Scenario ${params.scenarioID} hosted by ${creator.username}. Category: ${params.hobbyKey}`,
        hobbies: [params.hobbyKey],
        creator: creatorSummary,
        capacity: FIXED_CAPACITY,
        startTime: Timestamp.fromDate(eventDate),
        endTime: Timestamp.fromDate(new Date(eventDate.getTime() + 2 * 60 * 60 * 1000)),
        location: locData.geoPoint,
        address: locData.address,
        displayAddress: locData.address,
        geohash: locData.geohash,

        // YENİ EKLENEN ALAN:
        status: eventStatus,

        isLocked: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        feedType: FeedTypeEnum.Event,
    };

    batch.set(doc(db, "events", eventID), eventDoc);

    // 5. USER EVENT LOGS
    const addToLog = (uIdx: number, pStatus: EventParticipantStatus, role: 'creator' | 'participant') => {
        const u = users[uIdx];
        const logData: UserEvent = {
            eventID: eventID,
            date: Timestamp.fromDate(eventDate),
            role: role,
            status: pStatus,
            pinned: false
        };
        batch.set(doc(db, "users", u.userID, "eventLog", eventID), logData);
    };

    // User Loglarına yazarken 'eventStatus'u uygun 'EventParticipantStatus'a cast ediyoruz veya map ediyoruz.
    // Burada string değerleri aynı olduğu için (upcoming, completed vs.) doğrudan kullanabiliriz 
    // ama Pending/Rejected gibi özel durumlar ayrı kalıyor.

    // Aktif katılımcılar için eventin o anki durumu:
    const activeStatus = eventStatus as unknown as EventParticipantStatus;

    addToLog(params.creatorIdx, activeStatus, 'creator');
    params.acceptedIdxs.forEach(i => addToLog(i, activeStatus, 'participant'));

    // Diğerleri için özel statüler:
    params.pendingIdxs.forEach(i => addToLog(i, EventParticipantStatus.Pending, 'participant'));
    params.rejectedIdxs.forEach(i => addToLog(i, EventParticipantStatus.Rejected, 'participant'));
    params.savedIdxs.forEach(i => addToLog(i, EventParticipantStatus.Saved, 'participant'));

    await batch.commit();

    await createPostsForEvent(users, eventDoc, params.creatorIdx, params.acceptedIdxs, eventStatus);
}

// ------------------------------
// MAIN
// ------------------------------
async function main() {
    const users = await createUsers();
    await createFriendships(users);

    console.log("\nGenerating ALL Scenarios...");

    // S1: Futbol - Upcoming
    await createScenarioEvent(users, {
        scenarioID: 1, title: "Squad Match", hobbyKey: "Futbol",
        creatorIdx: 0, acceptedIdxs: [1, 2, 3, 4], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 2
    });

    // S2: Parti - Upcoming
    await createScenarioEvent(users, {
        scenarioID: 2, title: "Open Party", hobbyKey: "Parti",
        creatorIdx: 0, acceptedIdxs: [1], pendingIdxs: [10, 11, 12, 13, 14], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 5
    });

    // S3: Masa Oyunları - Upcoming
    await createScenarioEvent(users, {
        scenarioID: 3, title: "Elite Chess", hobbyKey: "Masa Oyunları",
        creatorIdx: 5, acceptedIdxs: [6, 7, 8], pendingIdxs: [], rejectedIdxs: [0], savedIdxs: [],
        timeOffsetDay: 3
    });

    // S4: Oyun - Upcoming
    await createScenarioEvent(users, {
        scenarioID: 4, title: "LAN Party", hobbyKey: "Oyun",
        creatorIdx: 2, acceptedIdxs: [3, 4], pendingIdxs: [0], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 1
    });

    // S5: Sergi - Upcoming
    await createScenarioEvent(users, {
        scenarioID: 5, title: "Art Exhibition", hobbyKey: "Diğer",
        creatorIdx: 12, acceptedIdxs: [13, 14], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [0],
        timeOffsetDay: 10
    });

    // S6: Koşu - ONGOING
    await createScenarioEvent(users, {
        scenarioID: 6, title: "Morning Run", hobbyKey: "Koşu",
        creatorIdx: 0, acceptedIdxs: [5], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 0
    });

    // S7: Festival - COMPLETED
    await createScenarioEvent(users, {
        scenarioID: 7, title: "Festival", hobbyKey: "Müzik",
        creatorIdx: 0, acceptedIdxs: [1, 5, 10], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: -5
    });

    // S8: Doğum Günü - COMPLETED
    await createScenarioEvent(users, {
        scenarioID: 8, title: "Private B-Day", hobbyKey: "Doğum Günü",
        creatorIdx: 6, acceptedIdxs: [5, 7, 8, 9], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [0],
        timeOffsetDay: -2
    });

    // S9: Night Drive - Upcoming
    await createScenarioEvent(users, {
        scenarioID: 9, title: "Night Drive", hobbyKey: "Diğer",
        creatorIdx: 0, acceptedIdxs: [], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [1],
        timeOffsetDay: 7
    });

    // S10: Workshop - Upcoming
    await createScenarioEvent(users, {
        scenarioID: 10, title: "Code Workshop", hobbyKey: "Workshop",
        creatorIdx: 0, acceptedIdxs: [], pendingIdxs: [6, 7], rejectedIdxs: [11], savedIdxs: [],
        timeOffsetDay: 6
    });

    console.log("\n=================================");
    console.log("✅ DONE! All 10 Scenarios Created with Event Status field.");
    console.log("=================================");
    process.exit(0);
}

main();