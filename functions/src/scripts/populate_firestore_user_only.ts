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
import { encode } from "ngeohash"; // <--- YENİ EKLENDİ

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

console.log("🚀 Final Script: Subcollection & Smart Count Logic...");

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
    event: any, // 'any' kullandık çünkü participants dizisi tipte var ama objede yok
    creatorIdx: number,
    acceptedIdxs: number[],
    timeStatus: 'ongoing' | 'completed'
) {

    console.log(`    -> Generating posts for ${event.name}...`);
    const potentialPostersIdx = [creatorIdx, ...acceptedIdxs];

    for (const userIdx of potentialPostersIdx) {
        const isCreator = userIdx === creatorIdx;
        const postChance = isCreator ? 0.9 : 0.6;

        if (Math.random() > postChance) continue;

        const u = users[userIdx];
        const postID = faker.string.uuid();
        const imageUrl = await uploadRandomPhoto(`users/${u.userID}/posts/${postID}.jpg`, 'post');

        const postDate = timeStatus === 'ongoing'
            ? new Date(Date.now() - 1000 * 60 * 15)
            : new Date(event.startTime.toDate().getTime() + 1000 * 60 * 60 * 2);

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
            createdAt: Timestamp.fromDate(postDate),
            updatedAt: Timestamp.fromDate(postDate),
            location: event.location,
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
                createdAt: Timestamp.fromDate(postDate)
            };
            await setDoc(doc(db, "users", u.userID, "pinnedPosts", postID), pinned);
            console.log(`       📌 PINNED POST created for ${u.username} (ID: ${postID})`);
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
        hobby: string,
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

    const debugName = `S${params.scenarioID}: ${params.title} (${timeStatus.toUpperCase().slice(0, 3)}) [Cnt:${activeParticipantCount}]`;

    // --- GEOHASH LOGIC ADDED HERE ---
    // Rastgele koordinatları önce değişkenlere alıyoruz
    const lat = 41.0082 + Math.random() * 0.01;
    const lng = 28.9784 + Math.random() * 0.01;

    // 1. Geohash üret (MapRepository ile uyumlu olması için precision: 7)
    const geohash = encode(lat, lng, 7);

    // 2. GeoPoint üret
    const geoPoint = new GeoPoint(lat, lng);
    // --------------------------------

    const eventDoc: any = {
        eventID: eventID,
        name: debugName,
        search_name: debugName.toLowerCase(),
        info: `Scenario ${params.scenarioID} hosted by ${creator.username}.`,
        hobbies: [params.hobby],
        creator: participantsData[0],
        capacity: FIXED_CAPACITY,
        startTime: Timestamp.fromDate(eventDate),
        endTime: Timestamp.fromDate(new Date(eventDate.getTime() + 2 * 60 * 60 * 1000)),
        location: geoPoint,
        geohash: geohash, // <--- YENİ ALAN EKLENDİ
        attributes: { isPublic: true },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        feedType: FeedTypeEnum.Event,
        participantCount: activeParticipantCount,
        participants: participantsData,
    };


    await setDoc(doc(db, "events", eventID), eventDoc);

    // Subcollection Write
    const participantsBatch = writeBatch(db);
    participantsData.forEach(p => {
        const pRef = doc(db, "events", eventID, "participants", p.userID);
        participantsBatch.set(pRef, p);
    });
    await participantsBatch.commit();

    console.log(`  -> Created Event: ${debugName} with ${activeParticipantCount} active participants. Geohash: ${geohash}`);

    // User Logs
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

    if (timeStatus === 'completed' || timeStatus === 'ongoing') {
        await createPostsForEvent(users, eventDoc, params.creatorIdx, params.acceptedIdxs, timeStatus);
    }
}

// ------------------------------
// MAIN
// ------------------------------
async function main() {
    const users = await createUsers();
    await createFriendships(users);

    console.log("\nGenerating Scenarios...");

    await createScenarioEvent(users, {
        scenarioID: 1, title: "Squad Match", hobby: "Football",
        creatorIdx: 0, acceptedIdxs: [1, 2, 3, 4], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 2
    });

    await createScenarioEvent(users, {
        scenarioID: 2, title: "Open Party", hobby: "Party",
        creatorIdx: 0, acceptedIdxs: [1], pendingIdxs: [10, 11, 12, 13, 14], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 5
    });

    await createScenarioEvent(users, {
        scenarioID: 3, title: "Elite Chess", hobby: "Chess",
        creatorIdx: 5, acceptedIdxs: [6, 7, 8], pendingIdxs: [], rejectedIdxs: [0], savedIdxs: [],
        timeOffsetDay: 3
    });

    await createScenarioEvent(users, {
        scenarioID: 4, title: "LAN Party", hobby: "Gaming",
        creatorIdx: 2, acceptedIdxs: [3, 4], pendingIdxs: [0], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 1
    });

    await createScenarioEvent(users, {
        scenarioID: 5, title: "Art Exhibition", hobby: "Art",
        creatorIdx: 12, acceptedIdxs: [13, 14], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [0],
        timeOffsetDay: 10
    });

    await createScenarioEvent(users, {
        scenarioID: 6, title: "Morning Run", hobby: "Run",
        creatorIdx: 0, acceptedIdxs: [5], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: 0
    });

    await createScenarioEvent(users, {
        scenarioID: 7, title: "Festival", hobby: "Concert",
        creatorIdx: 0, acceptedIdxs: [1, 5, 10], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [],
        timeOffsetDay: -5
    });

    await createScenarioEvent(users, {
        scenarioID: 8, title: "Private B-Day", hobby: "Party",
        creatorIdx: 6, acceptedIdxs: [5, 7, 8, 9], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [0],
        timeOffsetDay: -2
    });

    await createScenarioEvent(users, {
        scenarioID: 9, title: "Night Drive", hobby: "Drive",
        creatorIdx: 0, acceptedIdxs: [], pendingIdxs: [], rejectedIdxs: [], savedIdxs: [1],
        timeOffsetDay: 7
    });

    await createScenarioEvent(users, {
        scenarioID: 10, title: "Workshop", hobby: "Code",
        creatorIdx: 0, acceptedIdxs: [], pendingIdxs: [6, 7], rejectedIdxs: [11], savedIdxs: [],
        timeOffsetDay: 6
    });

    console.log("\n=================================");
    console.log("✅ DONE! Check 'events' collection for correct 'participantCount'.");
    console.log("=================================");
    process.exit(0);
}

main();