import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/logger";
import { getRemoteConfig } from "firebase-admin/remote-config";

const db = admin.firestore();
const bucket = admin.storage().bucket();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Aggregated statistics written to Storage as `event_stats.json`. */
interface EventStats {
    totalEvents: number;
    categories: Record<string, number>;
    participants: Record<string, number>;
}

/** Geographic or named location attached to a post. */
interface PostLocation {
    lat?: number;
    lng?: number;
    name?: string;
    [key: string]: unknown;
}

/** A single emote reaction with its total count. */
interface EmoteCount {
    emoteName: string;
    count: number;
}

/** Post data serialised to Storage (`postData.json`). */
interface StoredPostData {
    categories: string[];
    participantUsernames: string[];
    location: PostLocation;
    emoteCounts: EmoteCount[];
    totalEmoteCount: number;
}

/** `StoredPostData` enriched with resolved public image URLs at runtime. */
interface PostDumpData extends StoredPostData {
    postId: string;
    imageUrls: string[];
}

/** Column/row dimensions for a photo-grid dump page. */
interface GridType {
    cols: number;
    rows: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Supported grid layouts, ordered from largest to smallest.
 * The first layout whose slot count fits the available images is used.
 */
const GRID_TYPES: GridType[] = [
    { cols: 3, rows: 4 },
    { cols: 3, rows: 3 },
    { cols: 2, rows: 4 },
    { cols: 2, rows: 3 },
    { cols: 2, rows: 2 },
];

/**
 * Fallback category → estimated duration (hours) table used when Remote Config
 * is unreachable or missing a category. Category names must exactly match those
 * stored in Firestore posts. Remote Config values override these; categories
 * absent from Remote Config retain their default here, so a missing entry never
 * breaks the dump.
 */
const DEFAULT_CATEGORY_HOURS: Record<string, number> = {
    "kahve": 2.0,
    "sohbet": 3.0,
    "tanışma": 1.5,
    "parti": 5.0,
    "içmece": 5.0,
    "yemek": 2.5,
    "müzik": 4.0,
    "film": 4.0,
    "tiyatro": 3.5,
    "oyun": 3.0,
    "doğum günü": 5.0,
    "karaoke": 3.0,
    "masa oyunları": 3.0,
    "dans": 2.0,
    "koşu": 1.5,
    "futbol": 2.0,
    "basketbol": 2.5,
    "tenis": 1.5,
    "voleybol": 2.5,
    "yürüyüş": 2.0,
    "yoga": 1.5,
    "gym": 2.0,
    "bowling": 3.0,
    "ders çalışma": 4.0,
    "workshop": 4.0,
    "topluluk etkinliği": 6.0,
    "diğer": 3.0,
};

/** Remote Config parameter name that holds the category-hours JSON object. */
const CATEGORY_HOURS_RC_KEY = "category_hours";

/**
 * Maximum number of users processed in parallel per batch.
 * Keeping this bounded prevents Firestore/Storage rate-limit errors and
 * excessive Cloud Functions memory consumption.
 */
const USER_BATCH_SIZE = 20;

/** Maximum number of images downloaded/uploaded in parallel within a single post. */
const IMAGE_CONCURRENCY = 4;

// ---------------------------------------------------------------------------
// Remote Config
// ---------------------------------------------------------------------------

/**
 * Fetches the `category_hours` mapping from Firebase Remote Config.
 *
 * The returned object is a merge of `DEFAULT_CATEGORY_HOURS` and whatever is
 * stored in Remote Config: Remote Config values win on conflict, but any
 * category absent from Remote Config retains its default. This ensures the
 * dump pipeline stays operational even when new categories are added without
 * a corresponding Remote Config update.
 *
 * Falls back to `DEFAULT_CATEGORY_HOURS` on any error or missing value.
 */
async function fetchCategoryHours(): Promise<Record<string, number>> {
    try {
        const rc = getRemoteConfig();
        const template = await rc.getServerTemplate({
            defaultConfig: {
                [CATEGORY_HOURS_RC_KEY]: JSON.stringify(DEFAULT_CATEGORY_HOURS),
            },
        });
        const config = template.evaluate();
        const raw = config.getString(CATEGORY_HOURS_RC_KEY);

        if (!raw) {
            logger.warn("Remote Config category_hours is empty, using defaults");
            return DEFAULT_CATEGORY_HOURS;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!isNumericRecord(parsed)) {
            logger.warn(
                "Remote Config category_hours has invalid shape, using defaults"
            );
            return DEFAULT_CATEGORY_HOURS;
        }

        // Remote Config values override defaults; missing keys retain defaults.
        return { ...DEFAULT_CATEGORY_HOURS, ...parsed };
    } catch (error) {
        logger.error("Failed to fetch category_hours from Remote Config:", error);
        return DEFAULT_CATEGORY_HOURS;
    }
}

/**
 * Type guard that checks whether `value` is a `Record<string, number>`.
 * Non-finite values are rejected to prevent `NaN` propagating into
 * `hours * count` calculations.
 */
function isNumericRecord(value: unknown): value is Record<string, number> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    for (const v of Object.values(value)) {
        if (typeof v !== "number" || !Number.isFinite(v)) return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Splits `arr` into sub-arrays of at most `size` elements. */
function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

/**
 * Maps over `items` with bounded parallelism.
 * Behaves like `Promise.all(items.map(fn))` but ensures at most `concurrency`
 * promises are in-flight at any time.
 */
async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await fn(items[index]);
        }
    });

    await Promise.all(workers);
    return results;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/**
 * Downloads and parses a JSON file from Cloud Storage.
 * Returns `null` if the file does not exist or cannot be parsed.
 */
async function readJsonFromStorage<T>(path: string): Promise<T | null> {
    try {
        const file = bucket.file(path);
        const [exists] = await file.exists();
        if (!exists) return null;
        const [content] = await file.download();
        return JSON.parse(content.toString()) as T;
    } catch (error) {
        logger.error(`Failed to read JSON from ${path}:`, error);
        return null;
    }
}

/**
 * Returns the public HTTPS URLs of all `.jpg` files under `prefix` in the
 * default Storage bucket.
 */
async function getPublicImageUrls(prefix: string): Promise<string[]> {
    const [files] = await bucket.getFiles({ prefix });
    return files
        .filter((f) => f.name.endsWith(".jpg"))
        .map((f) => `https://storage.googleapis.com/${bucket.name}/${f.name}`);
}

// ---------------------------------------------------------------------------
// prepareDumpData — copies eligible posts for the month into Storage
// ---------------------------------------------------------------------------

/**
 * Fetches posts created within `year`/`month` that have `includeInDump == true`
 * and writes their images and metadata to
 * `private/users/{userId}/dumps/{year}/{month}/{postId}/`.
 *
 * Idempotent: posts whose `postData.json` already exists in Storage are skipped,
 * so the function is safe to re-run without duplicating work.
 *
 * @param userId - Firestore user document ID.
 * @param year   - Four-digit calendar year.
 * @param month  - Month number (1–12).
 */
async function prepareDumpData(
    userId: string,
    year: number,
    month: number
): Promise<void> {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);

    const postsSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("posts")
        .where("createdAt", ">=", monthStart)
        .where("createdAt", "<", monthEnd)
        .where("includeInDump", "==", true)
        .get();

    if (postsSnapshot.empty) {
        logger.info(`No dump-eligible posts found for user ${userId}`);
        return;
    }

    // Process posts with bounded parallelism; each post downloads its images in parallel.
    await mapWithConcurrency(postsSnapshot.docs, IMAGE_CONCURRENCY, async (postDoc) => {
        const postData = postDoc.data();
        const postId = postDoc.id;
        const postDumpPath = `private/users/${userId}/dumps/${year}/${month}/${postId}/`;

        // Idempotency check: skip if postData.json already written.
        const jsonMarker = bucket.file(`${postDumpPath}postData.json`);
        const [alreadyProcessed] = await jsonMarker.exists();
        if (alreadyProcessed) {
            logger.info(`Post ${postId} already dumped for ${userId}, skipping`);
            return;
        }

        // Download remote images and upload them to Storage in parallel.
        const imageUrls: string[] = postData.imageUrls || [];
        await Promise.all(
            imageUrls.map(async (imageUrl, index) => {
                try {
                    const response = await fetch(imageUrl);
                    if (!response.ok) {
                        logger.error(`Failed to download image: ${imageUrl}`);
                        return;
                    }
                    const imageBuffer = await response.arrayBuffer();
                    const file = bucket.file(`${postDumpPath}image_${index}.jpg`);
                    await file.save(Buffer.from(imageBuffer));
                } catch (error) {
                    logger.error(`Failed to process image ${imageUrl}:`, error);
                }
            })
        );

        // Build and persist the post metadata snapshot.
        const emoteCounts: EmoteCount[] = postData.emoteCounts
            ? Object.entries(postData.emoteCounts).map(([emoteName, count]) => ({
                emoteName,
                count: Number(count),
            }))
            : [];

        const stored: StoredPostData = {
            categories: postData.categories || [],
            participantUsernames:
                postData.participants?.map((p: { username: string }) => p.username) || [],
            location: postData.location || {},
            emoteCounts,
            totalEmoteCount: emoteCounts.reduce((total, e) => total + e.count, 0),
        };

        await jsonMarker.save(JSON.stringify(stored));
        logger.info(`Post ${postId} dumped for user ${userId}`);
    });
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

/**
 * Builds the monthly statistics page.
 *
 * `eventHours` is estimated by multiplying each category's event count by the
 * configured average duration for that category, rounded to one decimal place.
 */
function buildStatsPage(
    stats: EventStats,
    bgImageUrl: string,
    categoryHours: Record<string, number>
): Record<string, unknown> {
    const totalHours = Object.entries(stats.categories).reduce(
        (sum, [category, count]) => {
            const hours = categoryHours[category] ?? categoryHours["diğer"] ?? 3.0;
            return sum + hours * count;
        },
        0
    );

    return {
        type: "stats",
        order: 1,
        bgImageUrl,
        eventCount: stats.totalEvents,
        eventHours: Math.round(totalHours * 10) / 10,
        userCount: Object.keys(stats.participants).length,
    };
}

/**
 * Builds the "most popular post" highlight page using the post with the
 * highest total emote count.
 * Returns `null` if there are no posts or the top post has no images.
 */
function buildMostPopularPostPage(
    posts: PostDumpData[]
): Record<string, unknown> | null {
    if (posts.length === 0) return null;

    const topPost = posts.reduce((best, post) =>
        post.totalEmoteCount > best.totalEmoteCount ? post : best
    );

    const bgImageUrl = topPost.imageUrls[0];
    if (!bgImageUrl) return null;

    const emoteCounts = Object.fromEntries(
        topPost.emoteCounts.map(({ emoteName, count }) => [emoteName, count])
    );

    return {
        type: "most_popular_post",
        order: 2,
        bgImageUrl,
        emoteCounts,
    };
}

/**
 * Builds the "most-attended event category" page.
 * Prefers an image from a post in that category; falls back to any available
 * image if none is found.
 * Returns `null` if there are no categories or no images.
 */
function buildMostlyDoneEventPage(
    stats: EventStats,
    posts: PostDumpData[]
): Record<string, unknown> | null {
    if (Object.keys(stats.categories).length === 0) return null;

    const topCategory = Object.entries(stats.categories).reduce((a, b) =>
        b[1] > a[1] ? b : a
    )[0];

    const categoryPost = posts.find((p) => p.categories.includes(topCategory));
    const bgImageUrl =
        categoryPost?.imageUrls[0] ??
        posts[Math.floor(Math.random() * posts.length)]?.imageUrls[0];

    if (!bgImageUrl) return null;

    return {
        type: "mostly_done_event",
        order: 3,
        bgImageUrl,
        category: topCategory,
        eventCount: stats.categories[topCategory],
    };
}

/**
 * Builds a photo-grid page using the largest `GRID_TYPES` layout whose total
 * slot count does not exceed the number of available images.
 * Returns `null` if there are not enough images for the smallest grid (2×2).
 */
function buildGridPage(
    allImageUrls: string[]
): Record<string, unknown> | null {
    const gridType = GRID_TYPES.find(
        (g) => allImageUrls.length >= g.cols * g.rows
    );
    if (!gridType) return null;

    const totalSlots = gridType.cols * gridType.rows;
    const selectedUrls = allImageUrls.slice(0, totalSlots);
    const permutedIndices = Array.from({ length: totalSlots }, (_, i) => i);

    return {
        type: "grid",
        order: 4,
        imageUrls: selectedUrls,
        dumpWidth: gridType.cols,
        dumpHeight: gridType.rows,
        permutedIndices,
    };
}

// ---------------------------------------------------------------------------
// processUserDumpData — reads from Storage and writes the dump to Firestore
// ---------------------------------------------------------------------------

/**
 * Reads the pre-prepared Storage data for a user's current month, assembles
 * up to four dump pages, and writes the result to
 * `users/{userId}/dumps/{year}-{month}` in Firestore.
 *
 * Idempotent: if the Firestore document already exists the function returns
 * early without overwriting it.
 *
 * @param userId        - Firestore user document ID.
 * @param now           - Current date; determines the year/month being processed.
 * @param categoryHours - Mapping of event category names to estimated durations (hours).
 */
async function processUserDumpData(
    userId: string,
    now: Date,
    categoryHours: Record<string, number>
): Promise<void> {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const dumpRootPath = `private/users/${userId}/dumps/${year}/${month}/`;
    const dumpId = `${year}-${month}`;

    // Idempotency: skip if this month's dump document already exists.
    const dumpRef = db
        .collection("users")
        .doc(userId)
        .collection("dumps")
        .doc(dumpId);
    const existing = await dumpRef.get();
    if (existing.exists) {
        logger.info(`Dump ${dumpId} already exists for user ${userId}, skipping`);
        return;
    }

    const stats = await readJsonFromStorage<EventStats>(
        `${dumpRootPath}event_stats.json`
    );

    if (!stats) {
        logger.info(`No event_stats.json found for user ${userId}, skipping.`);
        return;
    }

    const [allFiles] = await bucket.getFiles({ prefix: dumpRootPath });

    const postIds = [
        ...new Set(
            allFiles
                .map((f) => f.name.replace(dumpRootPath, "").split("/")[0])
                .filter((name) => !name.endsWith(".json") && name.length > 0)
        ),
    ];

    const posts: PostDumpData[] = (
        await Promise.all(
            postIds.map(async (postId) => {
                const data = await readJsonFromStorage<StoredPostData>(
                    `${dumpRootPath}${postId}/postData.json`
                );
                if (!data) return null;

                const imageUrls = await getPublicImageUrls(
                    `${dumpRootPath}${postId}/`
                );

                return { ...data, postId, imageUrls };
            })
        )
    ).filter((p): p is PostDumpData => p !== null);

    const allImageUrls = posts.flatMap((p) => p.imageUrls);
    const randomBgImage =
        allImageUrls[Math.floor(Math.random() * allImageUrls.length)] ?? "";

    const pages = [
        buildStatsPage(stats, randomBgImage, categoryHours),
        buildMostPopularPostPage(posts),
        buildMostlyDoneEventPage(stats, posts),
        buildGridPage(allImageUrls),
    ].filter((p): p is Record<string, unknown> => p !== null);

    if (pages.length === 0) {
        logger.info(`No pages generated for user ${userId}, skipping.`);
        return;
    }

    await dumpRef.set({
        id: dumpId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        pages,
    });

    logger.info(
        `Dump ${dumpId} written for user ${userId} with ${pages.length} pages.`
    );
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Returns `true` on the night that is exactly 3 days before the last day of
 * the current month — the single night when the Firestore dump is written.
 *
 * Examples:
 * - 31-day months  → day 28
 * - 30-day months  → day 27
 * - February (28)  → day 25
 * - February (29)  → day 26
 *
 * The Cloud Function is scheduled for days 25–28 so it fires four nights and
 * self-selects the correct one using this guard.
 */
function isLastDumpNight(now: Date): boolean {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return lastDay - now.getDate() === 3;
}

/**
 * Runs the full dump pipeline for one user, isolating errors so a failure for
 * one user does not abort processing of the remaining users.
 */
async function processUserSafely(
    userId: string,
    now: Date,
    categoryHours: Record<string, number>
): Promise<void> {
    try {
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        await prepareDumpData(userId, year, month);
        await processUserDumpData(userId, now, categoryHours);
    } catch (error) {
        logger.error(`Failed to process dump for user ${userId}:`, error);
    }
}

/**
 * Scheduled Cloud Function that generates monthly photo-album dumps for all users.
 *
 * **Schedule:** runs nightly at 03:00 Istanbul time on days 25–28 of every month,
 * but only performs work on the single night that is 3 days before month-end
 * (`isLastDumpNight`). The four-day window provides a retry buffer in case the
 * function fails on the intended night.
 *
 * **Pipeline per user:**
 * 1. `prepareDumpData` — copies eligible posts and their images from their
 *    Firestore/external URLs into Cloud Storage under
 *    `private/users/{userId}/dumps/{year}/{month}/`.
 * 2. `processUserDumpData` — reads the Storage data, builds up to four dump
 *    pages (stats, most-popular post, top category, photo grid), and writes
 *    the result to `users/{userId}/dumps/{year}-{month}` in Firestore.
 *
 * Both steps are idempotent, so the function can be safely retried.
 * Users are processed in batches of `USER_BATCH_SIZE` to stay within
 * Firestore/Storage rate limits.
 */
export const monthlyDumpProcessor = onSchedule(
    {
        schedule: "0 3 25-28 * *",
        timeZone: "Europe/Istanbul",
    },
    async () => {
        const now = new Date();
        if (!isLastDumpNight(now)) {
            logger.info("Not the last dump night, skipping.");
            return;
        }

        // Fetch once so all users share the same category-hours table.
        // fetchCategoryHours falls back to defaults on error, so the dump continues.
        const categoryHours = await fetchCategoryHours();
        logger.info(
            `Loaded category_hours with ${Object.keys(categoryHours).length} categories`
        );

        const allUsersSnapshot = await db.collection("users").get();
        const userIds = allUsersSnapshot.docs.map((d) => d.id);

        logger.info(
            `Starting dump for ${userIds.length} users in batches of ${USER_BATCH_SIZE}`
        );

        const batches = chunk(userIds, USER_BATCH_SIZE);
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            logger.info(`Processing batch ${i + 1}/${batches.length} (${batch.length} users)`);
            await Promise.all(
                batch.map((userId) => processUserSafely(userId, now, categoryHours))
            );
        }

        logger.info("Monthly dump completed");
    }
);
