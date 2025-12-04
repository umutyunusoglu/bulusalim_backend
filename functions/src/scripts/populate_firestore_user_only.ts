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
} from "firebase/auth";

import {
    getStorage,
    connectStorageEmulator,
    ref,
    uploadBytes,
    getDownloadURL
} from "firebase/storage";

import { faker } from "@faker-js/faker";
import { User } from "./types/user";

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

console.log("Client SDK ve Emülatörler başlatıldı.");

async function uploadPhoto(destinationPath: string) {
    const src = "https://picsum.photos/361/361";
    try {
        const res = await fetch(src);
        const buffer = Buffer.from(await res.arrayBuffer());
        const storageRef = ref(storage, destinationPath);
        await uploadBytes(storageRef, buffer);
        return await getDownloadURL(storageRef);
    } catch (e) {
        console.warn("Fotoğraf yüklenemedi, placeholder kullanılıyor.", e);
        return "https://via.placeholder.com/150";
    }
}

// İki kullanıcıyı karşılıklı arkadaş yapan fonksiyon
async function makeFriends(user1: User, user2: User) {
    const commonData = { createdAt: Timestamp.now() };

    // 1. User1 -> User2 (Followees)
    await setDoc(doc(db, "users", user1.userID, "followees", user2.userID), {
        userID: user2.userID,
        username: user2.username,
        profileImageUrl: user2.profileImageUrl,
        ...commonData
    });

    // 2. User2 -> User1 (Followers)
    await setDoc(doc(db, "users", user2.userID, "followers", user1.userID), {
        userID: user1.userID,
        username: user1.username,
        profileImageUrl: user1.profileImageUrl,
        ...commonData
    });

    // 3. User2 -> User1 (Followees)
    await setDoc(doc(db, "users", user2.userID, "followees", user1.userID), {
        userID: user1.userID,
        username: user1.username,
        profileImageUrl: user1.profileImageUrl,
        ...commonData
    });

    // 4. User1 -> User2 (Followers)
    await setDoc(doc(db, "users", user1.userID, "followers", user2.userID), {
        userID: user2.userID,
        username: user2.username,
        profileImageUrl: user2.profileImageUrl,
        ...commonData
    });

    console.log(`${user1.username} ve ${user2.username} arkadaş oldu.`);
}

async function populateFirestoreAndAuth() {
    const users: User[] = [];
    const num_users = 5;
    const defaultPassword = "123456";

    console.log(`--- ${num_users} Kullanıcı Auth ve Firestore'a Kaydediliyor ---`);

    for (let i = 0; i < num_users; i++) {
        const email = `user${i + 1}@example.com`;
        const username = faker.internet.username() + faker.number.int({ min: 1, max: 100 });
        const birthdate = faker.date.birthdate({ min: 18, max: 65, mode: 'age' });

        let uid = "";
        let photoUrl = "";

        try {
            // 1. Authentication'da Kullanıcı Oluştur
            // Client SDK kullandığımız için bu işlem otomatik olarak "Sign In" yapar.
            const userCredential = await createUserWithEmailAndPassword(auth, email, defaultPassword);
            const authUser = userCredential.user;
            uid = authUser.uid; // Auth tarafından verilen UID'yi alıyoruz.

            // Fotoğraf yükle
            const destination_path = `users/${uid}/profile/images/profile.jpg`;
            photoUrl = await uploadPhoto(destination_path);

            // 2. Auth Profilini Güncelle (DisplayName ve PhotoURL)
            await updateProfile(authUser, {
                displayName: username,
                photoURL: photoUrl
            });

            console.log(`Auth Created: ${email} (UID: ${uid})`);

        } catch (error: any) {
            console.error(`Hata oluştu (${email}):`, error.message);
            continue; // Hata varsa bu kullanıcıyı atla
        }

        // 3. Firestore Verisini Hazırla (Auth'tan gelen UID ile)
        const userData: User = {
            userID: uid, // ÖNEMLİ: Auth UID ile aynı olmalı
            email: email,
            birthDate: Timestamp.fromDate(birthdate),
            gender: faker.person.sexType(),
            organization: faker.company.name(),
            bio: faker.lorem.sentence(),
            username: username,
            profileImageUrl: photoUrl,
            permissions: {
                locationEnabled: true,
                notificationsEnabled: true,
            },
            createdAt: Timestamp.fromDate(birthdate),
            updatedAt: Timestamp.now(),
            lastActiveAt: Timestamp.now(),
            hobbies: [],
        };

        // 4. Firestore'a Yaz
        users.push(userData);
        await setDoc(doc(db, "users", uid), userData);
        console.log(`Firestore Document Created: users/${uid}`);

        // Client SDK ile döngü içinde create yaparken session karışabilir,
        // ancak script ortamında her create yeni session açar, sorun olmaz.
        // Yine de temizlik için sign out diyebiliriz ama gerekli değil.
    }

    console.log("--- İlişkiler Kuruluyor ---");

    if (users.length === 5) {
        // Grup A: User 1 & User 2
        await makeFriends(users[0], users[1]);

        // Grup B: User 3 & User 4
        await makeFriends(users[2], users[3]);

        // Connector: User 5 herkesle arkadaş
        await makeFriends(users[4], users[0]);
        await makeFriends(users[4], users[1]);
        await makeFriends(users[4], users[2]);
        await makeFriends(users[4], users[3]);
    } else {
        console.warn("Yeterli kullanıcı oluşturulamadı, ilişkiler atlanıyor.");
    }

    console.log("--- İşlem Tamamlandı ---");
    console.log(`Test için giriş yapabilirsiniz -> Email: user1@example.com, Şifre: ${defaultPassword}`);
}

async function main() {
    await populateFirestoreAndAuth();
    console.log("Script başarıyla sonlandı.");
    process.exit(0);
}

main();