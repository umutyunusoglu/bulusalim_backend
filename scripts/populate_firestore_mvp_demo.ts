import {initializeApp} from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  setDoc,
  doc,
  Timestamp,
  GeoPoint,
  writeBatch,
} from "firebase/firestore";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import {fakerTR as faker} from "@faker-js/faker";
import {encode} from "ngeohash";

// ------------------------------
// ENUMS & CONFIG
// ------------------------------

enum EventStatus {
    Upcoming = "upcoming",
    Ongoing = "ongoing",
    Completed = "completed",
    Cancelled = "cancelled"
}

enum FeedTypeEnum {
    Post = "post",
    Event = "event"
}

// Kalabalık ve dolu gözükmesi için sayılar
const TOTAL_USERS = 40;
const TOTAL_EVENTS = 25;
const TOTAL_POSTS = 50;

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

console.log("🚀 MVP FINAL SCRIPT: High Pin Rate & Full Profiles...");

// ------------------------------
// CONSTANTS
// ------------------------------

const EVENT_CATEGORIES = [
  "Kahve", "Sohbet", "Tanışma", "Parti", "İçmece", "Müzik",
  "Film", "Tiyatro", "Oyun", "Masa Oyunları", "Doğum Günü",
  "Tatlı", "Karaoke", "Bowling", "Dans", "Koşu", "Futbol",
  "Basketbol", "Tenis", "Voleybol", "Yürüyüş", "Yoga", "Gym",
  "Workshop", "Kitap Okuma", "Ders Çalışma", "Seminer",
  "Topluluk Etkinliği", "Diğer",
];

const POST_CAPTIONS = [
  "Harika bir gündü! ☀️", "Bunu kesinlikle tekrar yapmalıyız.",
  "İstanbul manzarası... 🌉", "Kahve molası ☕", "Enerji tavan! ⚡",
  "Çok eğlendik, gelen herkese teşekkürler.", "Hafta sonu modu.",
  "Buluşalım ekibi toplanınca 🔥", "Yeni insanlarla tanışmak gibisi yok.",
  "Mood 😎", "Gece daha yeni başlıyor 🌙", "Favori mekanım.",
];

const DISTRICT_CENTERS = [
  {name: "Kadıköy", lat: 40.9870, lng: 29.0234, district: "İstanbul, Kadıköy"},
  {name: "Beşiktaş", lat: 41.0422, lng: 29.0067, district: "İstanbul, Beşiktaş"},
  {name: "Şişli", lat: 41.0520, lng: 28.9935, district: "İstanbul, Şişli"},
  {name: "Karaköy", lat: 41.0224, lng: 28.9774, district: "İstanbul, Beyoğlu"},
];

const MODERN_MALE_NAMES = [
  "Atlas", "Aras", "Rüzgar", "Çınar", "Toprak", "Kuzey", "Uzay", "Mars", "Ege", "Deniz",
  "Derin", "Sarp", "Pars", "Yaman", "Ediz", "Aren", "Ateş", "Baran", "Batı", "Berkay",
  "Can", "Cem", "Doğu", "Doruk", "Efe", "Emir", "Emre", "Eren", "Kaan", "Kerem",
  "Koray", "Mert", "Ozan", "Pamir", "Poyraz", "Umut", "Yağız", "Yiğit",
];

const MODERN_FEMALE_NAMES = [
  "Ada", "Alya", "Arya", "Asya", "Azra", "Bade", "Beren", "Defne", "Derin", "Duru",
  "Ece", "Ela", "Elif", "Eylül", "Gece", "Güneş", "Hayal", "Hira", "Ilgın", "İdil",
  "İpek", "İrem", "Lara", "Leyla", "Lina", "Masal", "Maya", "Melis", "Mila", "Mira",
  "Nehir", "Nil", "Öykü", "Parla", "Pera", "Peri", "Rüya", "Sahra", "Sare", "Selin",
  "Su", "Yaz", "Zeynep",
];

const MODERN_SURNAMES = [
  "Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Yıldırım", "Öztürk", "Aydın",
  "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt",
  "Özkan", "Şimşek", "Polat", "Güler", "Erdoğan", "Bulut", "Yalçın", "Aksoy", "Koçak",
  "Acar", "Uygun", "Tekin",
];

// ------------------------------
// UTILS
// ------------------------------

async function uploadRandomPhoto(path: string, type: "profile" | "post"): Promise<string> {
  const width = type === "post" ? 600 : 300;
  const height = type === "post" ? 800 : 300;
  try {
    const res = await fetch(`https://picsum.photos/${width}/${height}?random=${Math.random()}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, buffer);
    return await getDownloadURL(storageRef);
  } catch {
    return "https://via.placeholder.com/300";
  }
}

function getRandomLocation() {
  const d = faker.helpers.arrayElement(DISTRICT_CENTERS);
  const lat = d.lat + (Math.random() - 0.5) * 0.008;
  const lng = d.lng + (Math.random() - 0.5) * 0.008;
  return {
    geoPoint: new GeoPoint(lat, lng),
    geohash: encode(lat, lng, 7),
    address: d.district,
  };
}

// Memory Store
interface MiniUser { userID: string; username: string; profileImageUrl: string; }
const createdUsers: MiniUser[] = [];

// ------------------------------
// 1. CREATE USERS
// ------------------------------
async function createUsers() {
  console.log(`\nCreating ${TOTAL_USERS} Users...`);
  for (let i = 0; i < TOTAL_USERS; i++) {
    const id = i + 1;
    const email = `demo${id}@test.com`;

    const isFemale = Math.random() < 0.5;
    const firstName = isFemale ?
      faker.helpers.arrayElement(MODERN_FEMALE_NAMES) :
      faker.helpers.arrayElement(MODERN_MALE_NAMES);
    const lastName = faker.helpers.arrayElement(MODERN_SURNAMES);
    const username = `${firstName} ${lastName}`;

    let uid = "";
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, "password123");
      uid = cred.user.uid;
    } catch {
      const cred = await signInWithEmailAndPassword(auth, email, "password123");
      uid = cred.user.uid;
    }

    const photoUrl = await uploadRandomPhoto(`users/${uid}/profile.jpg`, "profile");
    await updateProfile(auth.currentUser!, {displayName: username, photoURL: photoUrl});

    await setDoc(doc(db, "users", uid), {
      userID: uid,
      email,
      username,
      search_name: username.toLowerCase(),
      profileImageUrl: photoUrl,
      birthDate: Timestamp.fromDate(faker.date.birthdate({min: 20, max: 35, mode: "age"})),
      gender: isFemale ? "female" : "male",
      permissions: {locationEnabled: true, notificationsEnabled: true},
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      lastActiveAt: Timestamp.now(),
      hobbies: faker.helpers.arrayElements(EVENT_CATEGORIES, 3),
      bio: faker.lorem.sentences(2), // Biraz daha uzun bio
      followeeCount: faker.number.int({min: 10, max: 100}),
      followerCount: faker.number.int({min: 10, max: 100}),
      activeEvents: [],
    });

    createdUsers.push({userID: uid, username, profileImageUrl: photoUrl});
    process.stdout.write(".");
  }
  console.log("\n✅ Users Ready.");
}

// ------------------------------
// 2. MIXED FEED GENERATOR
// ------------------------------
async function generateMixedFeed() {
  console.log("\nGenerating Content (Events & Posts)...");

  // Feed Akış Sırası (En yeni -> En eski):
  // 2 Etkinlik, 3 Post, 2 Etkinlik, 3 Post...
  const PATTERN = ["E", "E", "P", "P", "P"];

  let eventCount = 0;
  let postCount = 0;

  let currentTime = Date.now(); // Şimdiden geriye doğru gideceğiz

  while (eventCount < TOTAL_EVENTS || postCount < TOTAL_POSTS) {
    for (const type of PATTERN) {
      // Her içerik arasında zamanı biraz geriye al (Akışkanlık için)
      currentTime -= faker.number.int({min: 10 * 60 * 1000, max: 60 * 60 * 1000});
      const itemDate = new Date(currentTime);

      if (type === "E" && eventCount < TOTAL_EVENTS) {
        await createSingleEvent(itemDate);
        eventCount++;
      } else if (type === "P" && postCount < TOTAL_POSTS) {
        await createSinglePost(itemDate);
        postCount++;
      }
    }
  }
  console.log("\n✅ Feed Populated.");
}

// ------------------------------
// EVENT CREATOR (Single)
// ------------------------------
async function createSingleEvent(createdAt: Date) {
  const creator = faker.helpers.arrayElement(createdUsers);
  const eventID = faker.string.uuid();
  const loc = getRandomLocation();
  const category = faker.helpers.arrayElement(EVENT_CATEGORIES);

  // Feed'de karışık tarihli eventler:
  // %60 Upcoming (Yakın gelecek), %40 Completed (Yakın geçmiş)
  const isUpcoming = Math.random() > 0.4;
  let startTime: Date;
  let status: EventStatus;

  if (isUpcoming) {
    status = EventStatus.Upcoming;
    // CreatedAt'ten 1-3 gün sonrası
    startTime = new Date(Date.now() + faker.number.int({min: 1, max: 3}) * 24 * 60 * 60 * 1000);
  } else {
    status = EventStatus.Completed;
    // CreatedAt'ten 5 saat sonrası (ama şu anki zamana göre geçmişte kalıyor)
    startTime = new Date(createdAt.getTime() + 1000 * 60 * 60 * 5);
  }

  const eventName = `${category} Buluşması`;
  const batch = writeBatch(db);

  // Participants (Subcollection)
  const pList = faker.helpers.arrayElements(createdUsers, faker.number.int({min: 3, max: 12}));
  if (!pList.find((u) => u.userID === creator.userID)) pList.push(creator);

  for (const u of pList) {
    const role = u.userID === creator.userID ? "creator" : "participant";
    batch.set(doc(db, "events", eventID, "participants", u.userID), {
      userID: u.userID, username: u.username, profileImageUrl: u.profileImageUrl,
      role, status, eventScore: 50,
    });

    // User Logs
    batch.set(doc(db, "users", u.userID, "eventLog", eventID), {
      eventID, role, status, updatedAt: Timestamp.fromDate(createdAt),
    });
  }

  const eventDoc = {
    eventID,
    name: eventName,
    search_name: eventName.toLowerCase(),
    hobbies: [category],
    creator: {userID: creator.userID, username: creator.username, profileImageUrl: creator.profileImageUrl, role: "creator", status},
    capacity: 20,
    participantCount: pList.length,
    status,
    startTime: Timestamp.fromDate(startTime),
    endTime: Timestamp.fromDate(new Date(startTime.getTime() + 7200000)),
    location: loc.geoPoint,
    address: loc.address,
    displayAddress: loc.address,
    geohash: loc.geohash,
    createdAt: Timestamp.fromDate(createdAt), // Feed sıralaması
    updatedAt: Timestamp.fromDate(createdAt),
    feedType: FeedTypeEnum.Event,
    participants: [], requestPool: [], rejectedUsers: [], isLocked: false,
  };

  batch.set(doc(db, "events", eventID), eventDoc);
  await batch.commit();
  process.stdout.write("E");
}

// ------------------------------
// POST CREATOR (Single)
// ------------------------------
async function createSinglePost(createdAt: Date) {
  const creator = faker.helpers.arrayElement(createdUsers);
  const postID = faker.string.uuid();
  const loc = getRandomLocation();

  const photoUrl = await uploadRandomPhoto(`posts/${postID}.jpg`, "post");
  const batch = writeBatch(db);

  const postDoc = {
    postID,
    creator: {userID: creator.userID, username: creator.username, profileImageUrl: creator.profileImageUrl},
    eventID: "",
    caption: faker.helpers.arrayElement(POST_CAPTIONS),
    location: loc.geoPoint,
    address: loc.address,
    hobbies: faker.helpers.arrayElements(EVENT_CATEGORIES, 1),
    imageUrls: [photoUrl],
    participants: [],
    emoteCounts: {"heart": faker.number.int({min: 10, max: 80}), "clap": faker.number.int(30)},
    showParticipants: true,
    includeInDump: true,
    createdAt: Timestamp.fromDate(createdAt),
    updatedAt: Timestamp.fromDate(createdAt),
    feedType: FeedTypeEnum.Post,
  };

  // 1. Global Post Collection
  batch.set(doc(db, "posts", postID), postDoc);

  // 2. User Profile Post (Pinned Logic)
  // KRİTİK DEĞİŞİKLİK: Sınır kalktı, olasılık %70
  const isPinned = Math.random() < 0.7;

  const userPostDoc = {
    ...postDoc,
    isPinned: isPinned,
  };

  // Kullanıcının profilindeki gönderiler koleksiyonu
  batch.set(doc(db, "users", creator.userID, "posts", postID), userPostDoc);

  await batch.commit();
  process.stdout.write("P");
}

// ------------------------------
// RUN
// ------------------------------
async function main() {
  await createUsers();
  await generateMixedFeed();
  console.log("\n\n✅ DONE. Feed Balanced & Profiles filled with Pinned posts.");
  process.exit(0);
}

main();
