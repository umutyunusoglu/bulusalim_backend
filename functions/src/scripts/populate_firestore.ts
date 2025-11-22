import { initializeApp } from "firebase/app";
import {
    getFirestore,
    connectFirestoreEmulator,
    setDoc,
    doc,
    Timestamp,
    collection,
    getDoc,
    updateDoc
} from "firebase/firestore";

import { GeoPoint } from "firebase/firestore";

import {
    getAuth,
    connectAuthEmulator
} from "firebase/auth";
import {
    getStorage,
    connectStorageEmulator,
    ref,
    uploadBytes,
    getDownloadURL
} from "firebase/storage";

import { Event, EventParticipant } from "./types/event";
import { Post } from "./types/post";
import { UserEvent } from "./types/user";
import { FeedTypeEnum } from "./types/feed_enum";
import { faker } from "@faker-js/faker";
import { User } from "./types/user";
import { hobbies } from "./types/hobby";

// ------------------------------
// Firebase Client SDK
// ------------------------------

const firebaseConfig = {
    apiKey: "fake-api-key",
    authDomain: "localhost",
    projectId: "bulusalim-e8e7c",
    storageBucket: "demo-project.appspot.com",
};

// Initialize Client SDK
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Connect Emulators
connectFirestoreEmulator(db, "localhost", 8080);
connectAuthEmulator(auth, "http://localhost:9099");
connectStorageEmulator(storage, "localhost", 9199);

console.log("Client SDK başarıyla başlatıldı.");


async function uploadPhoto(destinationPath: string) {
    const src = "https://picsum.photos/361/361";
    const res = await fetch(src);
    const buffer = Buffer.from(await res.arrayBuffer());

    const storageRef = ref(storage, destinationPath);

    await uploadBytes(storageRef, buffer);
    const url = await getDownloadURL(storageRef);
    console.log("Fotoğraf yüklendi, URL:", url);
    return url;
}


async function populateFirestore(num_users: number, num_events: number) {

    var users = [];
    var events = [];


    for (let i = 0; i < num_users; i++) {


        var birthdate = faker.date.birthdate({ min: 18, max: 65, mode: 'age' });
        var user_id = faker.string.uuid();
        const destination_path = `users/${user_id}/profile/images/profile.jpg`;

        const url = await uploadPhoto(destination_path);

        const userData: User = {
            userID: user_id,
            email: `kullanici${i + 1}@example.com`,
            birthdate: Timestamp.fromDate(birthdate),
            gender: faker.person.sexType(),
            organization: faker.company.name(),
            bio: faker.lorem.sentence(),
            username: faker.internet.username() + faker.number.int({ min: 1, max: 1000 }).toString(),
            profileImageUrl: url,
            permissions: {
                locationEnabled: faker.datatype.boolean(),
                notificationsEnabled: faker.datatype.boolean(),
            },
            createdAt: Timestamp.fromDate(birthdate),
            updatedAt: Timestamp.now(),
            lastActiveAt: Timestamp.now(),


        };
        users.push(userData);
        await setDoc(doc(db, "users", user_id), userData);
        console.log(`Kullanıcı eklendi: ${user_id}`);
    }
    // Create events
    for (let j = 0; j < num_events; j++) {
        const capacity = faker.number.int({ min: 2, max: 10 });
        const joined_number = faker.number.int({ min: 2, max: capacity });
        const participant_users = faker.helpers.arrayElements(users, joined_number);

        const hobby_count = faker.number.int({ min: 1, max: 5 });
        const startDate = faker.date.future();
        const startTime = Timestamp.fromDate(startDate);
        const additionalHours = faker.number.int({ min: 1, max: 5 }); // hours to add
        const endDate = new Date(startDate.getTime() + additionalHours * 60 * 60 * 1000);
        const endTime = Timestamp.fromDate(endDate);
        const hobbiesForEvent = faker.helpers.arrayElements(hobbies, hobby_count);
        const participants: EventParticipant[] = participant_users.map((u) => ({
            userID: u.userID,
            username: u.username!,
            profileImageUrl: u.profileImageUrl,
            role: 'participant',
            eventScore: faker.number.int({ min: 1, max: 10 }),
        }));

        const eventData: Event = {
            eventID: faker.string.uuid(),
            name: faker.lorem.words(3).substring(0, 20),
            info: faker.lorem.sentence().substring(0, 20),
            hobbies: hobbiesForEvent,
            creator: participants[0],
            capacity: capacity,
            startTime: startTime,
            endTime: endTime,
            location: new GeoPoint(
                faker.location.latitude() ?? 0,
                faker.location.longitude() ?? 0
            ),
            attributes: {
                price: faker.number.int({ min: 0, max: 100 }),
                smokingAllowed: faker.datatype.boolean(),
                alcoholAllowed: faker.datatype.boolean(),
                isPublic: faker.datatype.boolean(),

            },
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            feedType: FeedTypeEnum.Event,
            participants: participants,

        }

        await setDoc(doc(db, "events", eventData.eventID), eventData);
        console.log(`Etkinlik eklendi: ${eventData.eventID}`);
        events.push(eventData);


        for (let k = 0; k < joined_number; k++) {


            const participant = participants[k];
            try { console.log(participant.userID); } catch (e) {

                console.log(participant);
                throw e;
            }
            //add hobby to user if not exists else increment eventsJoined

            const userEventData: UserEvent = {
                eventID: eventData.eventID,
                date: startTime,
                role: k === 0 ? 'creator' : 'participant',
            }
            await setDoc(doc(db, "users", participant.userID, "events", eventData.eventID), userEventData);

            for (const hobby of hobbiesForEvent) {
                const userHobbyRef = doc(collection(db, "users", participant.userID, "hobbies"), hobby);

                // Doc'u oku
                const userHobbySnap = await getDoc(userHobbyRef);

                if (userHobbySnap.exists()) {
                    // Mevcut eventsJoined değerini al
                    const currentEventsJoined = (userHobbySnap.data()?.eventsJoined ?? 0) as number;

                    // Güncelle
                    await updateDoc(userHobbyRef, {
                        eventsJoined: currentEventsJoined + 1
                    });
                } else {
                    // Yoksa oluştur
                    await setDoc(userHobbyRef, {
                        hobbyId: hobby,
                        eventsJoined: 1,
                    });
                }


                const sendPost = faker.datatype.boolean();
                if (sendPost) {
                    const num_pics = faker.number.int({ min: 1, max: 2 });

                    const post_urls = [];
                    const post_id = faker.string.uuid();

                    for (let p = 0; p < num_pics; p++) {

                        const post_destination_path = `users/${participant.userID}/posts/${post_id}/images/${p}.jpg`;
                        console.log("uploading image to ", post_destination_path);
                        const url = await uploadPhoto(post_destination_path);

                        post_urls.push(url);
                    }
                    console.log("Post resim yolları:", post_urls);

                    const post_participants = faker.helpers.arrayElements(participants, faker.number.int({ min: 1, max: joined_number }));

                    const postData: Post = {
                        postID: post_id,
                        userID: participant.userID,
                        eventID: eventData.eventID,
                        caption: faker.lorem.sentence().substring(0, 20),
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),

                        location: new GeoPoint(
                            faker.location.latitude(),
                            faker.location.longitude()
                        ),
                        hobbies: hobbiesForEvent,
                        imageUrls: post_urls.filter((u): u is string => u !== undefined),
                        participants: post_participants.map((p) => ({
                            participantID: p.userID,
                            username: p.username,
                            profileImageUrl: p.profileImageUrl,
                        })),
                        emoteCounts: {},
                        feedType: FeedTypeEnum.Post,
                        isPinned: faker.datatype.boolean(),
                    }
                    await setDoc(doc(db, "posts", postData.postID), postData);
                }

            }

            const messageCount = faker.number.int({ min: 1, max: 20 });
            for (let m = 0; m < messageCount; m++) {
                const sender_id = participants[faker.number.int({ min: 0, max: joined_number - 1 })].userID;
                const messageData = {
                    messageId: faker.string.uuid(),
                    content: faker.lorem.sentence(),
                    sender: sender_id,
                    sendTime: Timestamp.now(),
                }
                await setDoc(doc(db, "events", eventData.eventID, "messages", messageData.messageId), messageData);
            }

        }
    }
}

async function main() {
    await populateFirestore(500, 100);
    console.log("Populate Scripti Tamamlandı!");
    process.exit(0);
}

main();
