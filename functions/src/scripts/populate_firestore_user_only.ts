import { initializeApp } from "firebase/app";
import {
    getFirestore,
    connectFirestoreEmulator,
    setDoc,
    doc,
    Timestamp,
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
import { Post, PinnedPost } from "./types/post";
import { FeedTypeEnum } from "./types/feed_enum";

// ------------------------------
// Firebase Client SDK Setup
// ------------------------------

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

console.log("SDK Başlatıldı.");

// ------------------------------
// Helper Functions
// ------------------------------

async function uploadPhoto(destinationPath: string) {
    // Returns a random valid image URL
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

    // Create bidirectional following
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
}

// ------------------------------
// Content Creation Helpers
// ------------------------------

async function createPost(
    user: User,
    eventID: string,
    isPinned: boolean,
    debugCaption: string,
    isRecent: boolean = false
) {
    const postID = faker.string.uuid();
    const imagePath = `private/users/${user.userID}/posts/${postID}/image.jpg`;
    const imageUrl = await uploadPhoto(imagePath);

    const postDate = isRecent
        ? new Date(Date.now() - 1000 * 60 * 15) // 15 mins ago
        : faker.date.recent({ days: 30 });

    const postData: Post = {
        postID: postID,
        creator: {
            userID: user.userID,
            username: user.username!,
            profileImageUrl: user.profileImageUrl
        },
        eventID: eventID,
        caption: debugCaption, // DEBUG CAPTION USED HERE
        createdAt: Timestamp.fromDate(postDate),
        updatedAt: Timestamp.fromDate(postDate),
        location: { "longitude": 28.9784, "latitude": 41.0082 },
        hobbies: ["debug_hobby"],
        imageUrls: [imageUrl],
        participants: [],
        emoteCounts: {},
        feedType: FeedTypeEnum.Post,
        showParticipants: true,
        includeInDump: true
    };

    await setDoc(doc(db, "posts", postID), postData);

    if (isPinned) {
        const pinnedPostData: PinnedPost = {
            postID: postData.postID,
            caption: postData.caption,
            location: postData.location,
            imageUrls: postData.imageUrls,
            participants: postData.participants,
            emoteCounts: postData.emoteCounts,
            createdAt: postData.createdAt,
        };
        await setDoc(doc(db, "users", user.userID, "pinnedPosts", postID), pinnedPostData);
    }
}

async function addSavedEventToUser(user: User, index: number) {
    const eventID = faker.string.uuid();
    const title = `SAVED_Event_${index}_For_${user.username}`;

    // Create random future dates using Faker, then convert to Firestore Timestamp
    const futureDate = faker.date.future();
    const futureEndDate = new Date(futureDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

    const eventData: Event = {
        eventID: eventID,
        name: title,
        info: "This is a dummy saved event for debugging.",
        hobbies: ["saved_hobby"],
        creator: { userID: 'random', username: 'random', profileImageUrl: '', role: 'creator', eventScore: 10 },
        capacity: 100,

        // --- FIX IS HERE ---
        startTime: Timestamp.fromDate(futureDate),
        endTime: Timestamp.fromDate(futureEndDate),
        // -------------------

        location: { "longitude": 28.9784, "latitude": 41.0082 },
        attributes: { price: 50, smokingAllowed: true, alcoholAllowed: true, isPublic: true },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        feedType: FeedTypeEnum.Event,
        participants: []
    };

    // Write to root events
    await setDoc(doc(db, "events", eventID), eventData);

    // Write to user savedEvents
    await setDoc(doc(db, "users", user.userID, "savedEvents", eventID), eventData);
}
async function createSpecificEvent(
    debugTitle: string,
    creatorUser: User,
    participantsUsers: User[],
    startTimeDate: Date,
    durationHours: number,
    status: 'upcoming' | 'ongoing' | 'completed'
): Promise<string> {
    const eventID = faker.string.uuid();
    const endTimeDate = new Date(startTimeDate.getTime() + durationHours * 60 * 60 * 1000);

    const participantsData: EventParticipant[] = participantsUsers.map(u => ({
        userID: u.userID,
        username: u.username!,
        profileImageUrl: u.profileImageUrl,
        role: u.userID === creatorUser.userID ? 'creator' : 'participant',
        eventScore: 0
    }));

    const eventData: Event = {
        eventID: eventID,
        name: debugTitle,
        info: `Debug Info: Created by ${creatorUser.username}, Status: ${status}`,
        hobbies: ["debug_event"],
        creator: participantsData.find(p => p.userID === creatorUser.userID)!,
        capacity: 10,
        startTime: Timestamp.fromDate(startTimeDate),
        endTime: Timestamp.fromDate(endTimeDate),
        location: { "longitude": 28.9784, "latitude": 41.0082 },
        attributes: { price: 0, smokingAllowed: false, alcoholAllowed: true, isPublic: true },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        feedType: FeedTypeEnum.Event,
        participants: participantsData
    };

    await setDoc(doc(db, "events", eventID), eventData);

    for (const participant of participantsUsers) {
        const userEventData: UserEvent = {
            eventID: eventID,
            date: Timestamp.fromDate(startTimeDate),
            role: participant.userID === creatorUser.userID ? 'creator' : 'participant',
            status: status,
            pinned: false
        };
        await setDoc(doc(db, "users", participant.userID, "eventHistory", eventID), userEventData);
    }
    console.log(`[EVENT] ${debugTitle} (ID: ${eventID})`);
    return eventID;
}

// ------------------------------
// MAIN SCRIPT
// ------------------------------

async function populateFirestoreAndAuth() {
    const users: User[] = [];
    const num_users = 5;
    const defaultPassword = "123456";

    console.log(`\n=== 1. Creating ${num_users} Users ===`);

    for (let i = 0; i < num_users; i++) {
        // Explicit Naming for Debugging
        const userIndex = i + 1;
        const email = `user${userIndex}@example.com`;
        const username = `User ${userIndex}`; // "User 1", "User 2"...

        let uid = "";
        let photoUrl = "";

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, defaultPassword);
            uid = userCredential.user.uid;
            photoUrl = await uploadPhoto(`private/users/${uid}/profile.jpg`);
            await updateProfile(userCredential.user, { displayName: username, photoURL: photoUrl });
        } catch (e: any) {
            // If user exists, try to login to get UID
            try {
                const loginCred = await signInWithEmailAndPassword(auth, email, defaultPassword);
                uid = loginCred.user.uid;
                photoUrl = loginCred.user.photoURL || "https://via.placeholder.com/150";
            } catch (loginErr) {
                console.log(`Skipping ${email}`);
                continue;
            }
        }

        const userData: User = {
            userID: uid,
            email: email,
            username: username, // Clean name
            profileImageUrl: photoUrl,
            birthDate: Timestamp.fromDate(faker.date.birthdate({ min: 20, max: 30, mode: 'age' })),
            gender: 'other',
            permissions: { locationEnabled: true, notificationsEnabled: true },
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            lastActiveAt: Timestamp.now(),
            hobbies: [],
            bio: `I am ${username}, a debug user.`
        };

        users.push(userData);
        await setDoc(doc(db, "users", uid), userData);
        console.log(`  -> Created: ${username} (ID: ${uid})`);
    }

    if (users.length < 5) return;

    console.log("\n=== 2. Creating Relationships ===");
    // User 1 <-> User 2
    await makeFriends(users[0], users[1]);
    // User 3 <-> User 4
    await makeFriends(users[2], users[3]);
    // User 5 connects to everyone
    users.slice(0, 4).forEach(async u => await makeFriends(users[4], u));

    console.log("\n=== 3. Creating Event Scenarios ===");
    const now = new Date();
    let user1Events: string[] = []; // Track IDs for User 1's posts

    // --- SCENARIO 1: User 1 & 2 (Ongoing) ---
    // Started 1 hour ago
    const s1_id = await createSpecificEvent(
        "SCENARIO_1_Ongoing_User1_User2",
        users[0],
        [users[0], users[1]],
        new Date(now.getTime() - 1 * 60 * 60 * 1000),
        3,
        'ongoing'
    );
    user1Events.push(s1_id);

    // --- SCENARIO 2: User 3 & 4 (Upcoming) ---
    // Starts tomorrow
    await createSpecificEvent(
        "SCENARIO_2_Upcoming_User3_User4",
        users[2],
        [users[2], users[3]],
        new Date(now.getTime() + 24 * 60 * 60 * 1000),
        2,
        'upcoming'
    );

    // --- SCENARIO 3: User 1, 2, 3 (Upcoming) ---
    // Starts in 3 days
    const s3_id = await createSpecificEvent(
        "SCENARIO_3_Upcoming_User1_User2_User3",
        users[1],
        [users[0], users[1], users[2]],
        new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        5,
        'upcoming'
    );
    user1Events.push(s3_id);

    // --- SCENARIO 4: User 1 & 3 (Ongoing) ---
    // Started 30 mins ago. THIS IS THE TARGET FOR THE RECENT POST.
    const s4_target_id = await createSpecificEvent(
        "SCENARIO_4_Ongoing_User1_User3_TARGET",
        users[0],
        [users[0], users[2]],
        new Date(now.getTime() - 30 * 60 * 1000),
        4,
        'ongoing'
    );
    user1Events.push(s4_target_id);

    console.log("\n=== 4. Creating Saved Events ===");

    // User 1 (index 0): 2 Saved Events
    await addSavedEventToUser(users[0], 1);
    await addSavedEventToUser(users[0], 2);

    // User 2 (index 1): 3 Saved Events
    await addSavedEventToUser(users[1], 1);
    await addSavedEventToUser(users[1], 2);
    await addSavedEventToUser(users[1], 3);

    // Others: 1 Saved Event
    for (let i = 2; i < users.length; i++) {
        await addSavedEventToUser(users[i], 1);
    }
    console.log("  -> Saved events distributed (2 for U1, 3 for U2, 1 for others).");

    console.log("\n=== 5. Creating Posts (4 per user, 2 Pinned) ===");

    for (let i = 0; i < users.length; i++) {
        const u = users[i];

        for (let p = 1; p <= 4; p++) {
            const isPinned = (p <= 2); // First 2 are pinned
            let eventID = faker.string.uuid(); // Default dummy
            let caption = `[DEBUG] ${isPinned ? 'PINNED' : 'NORMAL'} Post ${p} by ${u.username}`;
            let isRecent = false;

            // --- SPECIAL LOGIC FOR USER 1 ---
            if (i === 0) {
                if (p === 1) {
                    // Post 1: Must be on the Scenario 4 event and RECENT
                    eventID = s4_target_id;
                    isRecent = true;
                    caption = `[DEBUG] RECENT POST by ${u.username} on SCENARIO_4 (Ongoing U1/U3)`;
                } else {
                    // Other posts: use known history events
                    eventID = faker.helpers.arrayElement(user1Events);
                    caption += ` on known event`;
                }
            } else {
                caption += " on random event";
            }

            await createPost(u, eventID, isPinned, caption, isRecent);
        }
    }
    console.log("  -> Posts created successfully.");

    console.log("\n=== DONE ===");
    console.log("Summary for Debugging:");
    console.log(`1. Login as 'user1@example.com' (User 1).`);
    console.log(`2. Check Ongoing Events: Should see 'SCENARIO_1...' and 'SCENARIO_4...'.`);
    console.log(`3. Check 'SCENARIO_4' details: Should see a RECENT POST by User 1.`);
    console.log(`4. Check Saved Events: User 1 should have 2, User 2 should have 3.`);
}

populateFirestoreAndAuth().then(() => {
    process.exit(0);
});