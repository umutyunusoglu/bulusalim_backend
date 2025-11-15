import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import { Firestore, GeoPoint } from 'firebase-admin/firestore';
import { User, UserEvent } from './types/user';
import * as path from 'path';

import { faker } from '@faker-js/faker';
import { hobbies } from './types/hobby';
import { start } from 'repl';
import { Event, EventParticipant } from './types/event';
import { Post } from './types/post';
import { getDownloadURL } from 'firebase-admin/storage';
import { FeedTypeEnum } from './types/feed_enum';
dotenv.config();

const serviceAccountKeyString = process.env.FIREBASE_SA_KEY;

if (!serviceAccountKeyString) {
    throw new Error('FIREBASE_SA_KEY environment variable is not set.');
}

let db: Firestore;
let storage: admin.storage.Storage;

try {
    const serviceAccount = JSON.parse(serviceAccountKeyString);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "gs://bulusalim-e8e7c.firebasestorage.app/"
    });

    db = admin.firestore();
    storage = admin.storage();



    console.log("Admin SDK başarıyla başlatıldı.");

} catch (error) {
    console.error("Hata oluştu:", error);
    process.exit(1);
}


async function uploadPhoto(source_path: string, destination_path: string): Promise<string> {
    const bucket = storage.bucket();

    await bucket.upload(source_path, {
        destination: destination_path,
        metadata: {
            contentType: 'image/jpeg',
        },
    });

    return await getDownloadURL(bucket.file(destination_path));

}

async function populateFirestore(num_users: number, num_events: number) {

    const usersCollection = db.collection('users');

    const profile_pic_paths = [
        path.join(__dirname, '..', 'assets', 'profile', 'profile_0.jpg'),
        path.join(__dirname, '..', 'assets', 'profile', 'profile_1.jpg'),

    ];

    const post_pic_paths = [
        path.join(__dirname, '..', 'assets', 'post', 'post_0.png'),
        path.join(__dirname, '..', 'assets', 'post', 'post_1.png'),
    ];
    var users = [];
    var events = [];


    for (let i = 0; i < num_users; i++) {


        var birthdate = faker.date.birthdate({ min: 18, max: 65, mode: 'age' });
        var user_id = faker.string.uuid();
        const pic_path = profile_pic_paths[faker.number.int({ min: 0, max: profile_pic_paths.length - 1 })];
        const destination_path = `users/${user_id}/profile/images/profile.jpg`;

        const url = await uploadPhoto(pic_path, destination_path);
        const userData: User = {
            userID: user_id,
            email: `kullanici${i + 1}@example.com`,
            birthdate: admin.firestore.Timestamp.fromDate(birthdate),
            gender: faker.person.sexType(),
            organization: faker.company.name(),
            bio: faker.lorem.sentence(),
            username: faker.internet.username() + faker.number.int({ min: 1, max: 1000 }).toString(),
            profileImageUrl: url,
            permissions: {
                locationEnabled: faker.datatype.boolean(),
                notificationsEnabled: faker.datatype.boolean(),
            },
            createdAt: admin.firestore.Timestamp.fromDate(birthdate),
            updatedAt: admin.firestore.Timestamp.now(),
            lastActiveAt: admin.firestore.Timestamp.now(),


        };
        users.push(userData);
        await usersCollection.doc(user_id).set(userData);
        console.log(`Kullanıcı eklendi: ${user_id}`);
    }
    // Create events
    for (let j = 0; j < num_events; j++) {
        const capacity = faker.number.int({ min: 2, max: 10 });
        const joined_number = faker.number.int({ min: 2, max: capacity });
        const participants = faker.helpers.arrayElements(users, joined_number);

        const hobby_count = faker.number.int({ min: 1, max: 5 });
        const startDate = faker.date.future();
        const startTime = admin.firestore.Timestamp.fromDate(startDate);
        const additionalHours = faker.number.int({ min: 1, max: 5 }); // hours to add
        const endDate = new Date(startDate.getTime() + additionalHours * 60 * 60 * 1000);
        const endTime = admin.firestore.Timestamp.fromDate(endDate);
        const hobbiesForEvent = faker.helpers.arrayElements(hobbies, hobby_count);

        const eventData: Event = {
            eventID: faker.string.uuid(),
            name: faker.lorem.words(3),
            info: faker.lorem.sentence(),
            hobbies: hobbiesForEvent,
            creator: participants[0].userID,
            capacity: capacity,
            startTime: startTime,
            endTime: endTime,
            location: new admin.firestore.GeoPoint(
                faker.location.latitude() ?? 0,
                faker.location.longitude() ?? 0
            ),
            attributes: {
                price: faker.number.int({ min: 0, max: 100 }),
                smokingAllowed: faker.datatype.boolean(),
                alcoholAllowed: faker.datatype.boolean(),
                isPublic: faker.datatype.boolean(),

            },
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
            feedType: FeedTypeEnum.Event,

        }

        await db.collection('events').doc(eventData.eventID).set(eventData);
        console.log(`Etkinlik eklendi: ${eventData.eventID}`);
        events.push(eventData);


        for (let k = 0; k < joined_number; k++) {


            const participant = participants[k];
            try { console.log(participant.userID); } catch (e) {

                console.log(participant);
                throw e;
            }
            //add hobby to user if not exists else increment eventsJoined

            const participantData: EventParticipant = {
                userID: participant.userID,
                role: k === 0 ? 'creator' : 'participant',
                eventScore: faker.number.int({ min: 1, max: 100 }),
            }
            await db.collection('events').doc(eventData.eventID).collection('participants').doc(participant.userID).set(participantData);

            const userEventData: UserEvent = {
                eventID: eventData.eventID,
                date: startTime,
                role: k === 0 ? 'creator' : 'participant',
            }
            await db.collection('users').doc(participant.userID).collection('events').doc(eventData.eventID).set(userEventData);

            for (const hobby of hobbiesForEvent) {
                const userHobbyRef = db.collection('users').doc(participant.userID).collection('hobbies').doc(hobby);
                const userHobbyDoc = await userHobbyRef.get();

                if (userHobbyDoc.exists) {
                    const currentEventsJoined = (userHobbyDoc.data()?.eventsJoined ?? 0) as number;
                    await userHobbyRef.update({
                        eventsJoined: currentEventsJoined + 1
                    });
                } else {
                    await userHobbyRef.set({
                        hobbyId: hobby,
                        eventsJoined: 1,
                    });
                }
            }


            const sendPost = faker.datatype.boolean();
            if (sendPost) {
                const num_pics = faker.number.int({ min: 1, max: 2 });

                const post_urls = [];
                const post_id = faker.string.uuid();

                for (let p = 0; p < num_pics; p++) {
                    const post_pic_path = post_pic_paths ? post_pic_paths[faker.number.int({ min: 0, max: post_pic_paths.length - 1 })] : undefined;
                    if (post_pic_path) {

                        const post_destination_path = `users/${participant.userID}/posts/${post_id}/images/${p}.jpg`;
                        console.log("uploading image to ", post_destination_path);
                        const url = await uploadPhoto(post_pic_path, post_destination_path);

                        post_urls.push(url);
                    }
                }
                console.log("Post resim yolları:", post_urls);
                const postData: Post = {
                    postID: post_id,
                    userID: participant.userID,
                    eventID: eventData.eventID,
                    title: faker.lorem.sentence(),
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),

                    location: new GeoPoint(
                        faker.location.latitude(),
                        faker.location.longitude()
                    ),
                    hobbies: hobbiesForEvent,
                    imageUrls: post_urls.filter((u): u is string => u !== undefined),
                    participants: [],
                    emoteCounts: {},
                    feedType: FeedTypeEnum.Post,
                }
                await db.collection('posts').doc(postData.postID).set(postData);
            }

        }

        const messageCount = faker.number.int({ min: 1, max: 20 });
        for (let m = 0; m < messageCount; m++) {
            const sender_id = participants[faker.number.int({ min: 0, max: joined_number - 1 })].userID;
            const messageData = {
                messageId: faker.string.uuid(),
                content: faker.lorem.sentence(),
                sender: sender_id,
                sendTime: admin.firestore.Timestamp.now(),
            }
            await db.collection('events').doc(eventData.eventID).collection('messages').doc(messageData.messageId).set(messageData);
        }

    }
}

async function main() {
    await populateFirestore(500, 100);
    console.log("Populate Scripti Tamamlandı!");
    process.exit(0);
}

main();
