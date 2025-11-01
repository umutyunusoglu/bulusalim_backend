import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import { Firestore } from 'firebase-admin/firestore';
import { User } from './types/user';
import * as path from 'path';

import { faker } from '@faker-js/faker';
import { hobbies } from './types/hobby';
import { start } from 'repl';
dotenv.config();

const serviceAccountKeyString = process.env.FIREBASE_SA_KEY;

if (!serviceAccountKeyString) {
    throw new Error('FIREBASE_SA_KEY environment variable is not set.');
}

let db: Firestore;
let storage: admin.storage.Storage;
let profile_pic_path: string;

try {
    const serviceAccount = JSON.parse(serviceAccountKeyString);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "gs://bulusalim-e8e7c.firebasestorage.app/"
    });

    db = admin.firestore();
    storage = admin.storage();
    profile_pic_path = path.join(__dirname, '..', 'assets', 'profile.jpg');


    console.log("Admin SDK başarıyla başlatıldı.");

} catch (error) {
    console.error("Hata oluştu:", error);
    process.exit(1);
}

async function uploadProfilePicture(filePath: string): Promise<string | undefined> {
    const bucket = storage.bucket();
    const destinationPath = 'profile_pics/profile.png';

    try {
        await bucket.upload(filePath, {
            destination: destinationPath,
            metadata: {
                contentType: 'image/png',
            },
        });

        console.log(`Dosya başarıyla yüklendi: gs://${bucket.name}/${destinationPath}`);

        const file = bucket.file(destinationPath);
        const [url] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        return url;

    } catch (error) {
        console.error('Profil resmi yüklenirken hata oluştu:', error);
        if (error instanceof Error) {
            console.error(error.message);
        }
        return undefined;
    }
}

async function populateFirestore(num_users: number, num_events: number) {

    const url = await uploadProfilePicture(profile_pic_path);

    const usersCollection = db.collection('users');

    var users = [];
    var events = [];


    for (let i = 0; i < num_users; i++) {

        var birthdate = faker.date.birthdate({ min: 18, max: 65, mode: 'age' });

        const userData: User = {
            uid: faker.string.uuid(),
            email: `kullanici${i + 1}@example.com`,
            birthdate: admin.firestore.Timestamp.fromDate(birthdate),
            gender: faker.person.sexType(),
            organization: faker.company.name(),
            bio: faker.lorem.sentence(),
            username: faker.internet.username() + faker.number.int({ min: 1, max: 1000 }).toString(),
            profilePictureUrls: [url || 'default_url'],
            permissions: {
                locationEnabled: faker.datatype.boolean(),
                notificationsEnabled: faker.datatype.boolean(),
            },
            metadata: {
                // Largest possible date range
                createdAt: admin.firestore.Timestamp.fromDate(birthdate),
                updatedAt: admin.firestore.Timestamp.now(),
                lastActiveAt: admin.firestore.Timestamp.now(),
            }
        };
        users.push(userData);
        await usersCollection.doc(userData.uid).set(userData);
        console.log(`Kullanıcı eklendi: ${userData.uid}`);
    }
    // Create events
    for (let j = 0; j < num_events; j++) {
        const capacity = faker.number.int({ min: 2, max: 10 });
        const joined_number = faker.number.int({ min: 2, max: capacity });
        const participants = faker.helpers.arrayElements(users, capacity);

        const hobby_count = faker.number.int({ min: 1, max: 5 });
        const startDate = faker.date.future();
        const startTime = admin.firestore.Timestamp.fromDate(startDate);
        const additionalHours = faker.number.int({ min: 1, max: 5 }); // hours to add
        const endDate = new Date(startDate.getTime() + additionalHours * 60 * 60 * 1000);
        const endTime = admin.firestore.Timestamp.fromDate(endDate);
        const hobbiesForEvent = faker.helpers.arrayElements(hobbies, hobby_count);

        const eventData = {
            eventId: faker.string.uuid(),
            name: faker.lorem.words(3),
            info: faker.lorem.sentence(),
            hobbies: hobbiesForEvent,
            creator: participants[0].uid,
            capacity: capacity,
            startTime: startTime,
            endTime: endTime,
            location: new admin.firestore.GeoPoint(
                faker.location.latitude(),
                faker.location.longitude()
            ),
            attributes: {
                price: faker.number.int({ min: 0, max: 100 }),
                smokingAllowed: faker.datatype.boolean(),
                alcoholAllowed: faker.datatype.boolean(),
                isPublic: faker.datatype.boolean(),

            },
            metadata: {
                createdAt: admin.firestore.Timestamp.now(),
                updatedAt: admin.firestore.Timestamp.now(),
            }
        }

        await db.collection('events').doc(eventData.eventId).set(eventData);
        console.log(`Etkinlik eklendi: ${eventData.eventId}`);
        events.push(eventData);


        for (let k = 0; k < joined_number; k++) {
            const participant = participants[k];
            //add hobby to user if not exists else increment eventsJoined

            const participantData = {
            }
        }
    }
}
async function main() {
    await populateFirestore(5, 10);
    console.log("Populate Scripti Tamamlandı!");
    process.exit(0);
}

main();