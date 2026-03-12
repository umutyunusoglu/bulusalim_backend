import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/logger";
import { Timestamp } from "firebase-admin/firestore";

const db = admin.firestore();

export const hourlyEventPostCleanup = onSchedule({
    schedule: 'every 1 hours',
    timeZone: 'Europe/Istanbul'
}, async (event) => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const threshold = Timestamp.fromDate(twentyFourHoursAgo);

    try {
        const [eventsSnapshot, postsSnapshot] = await Promise.all([
            db.collection('events').where('completedAt', '<=', threshold).get(),
            db.collection('posts').where('createdAt', '<=', threshold).get()
        ]);

        const bulkWriter = db.bulkWriter();
        let deleteCount = 0;

        // Eventleri sil (completedAt kriterine uyan hepsi)
        eventsSnapshot.docs.forEach(doc => {
            bulkWriter.delete(doc.ref);
            deleteCount++;
        });

        // Postları filtrele: isPinned true DEĞİLSE sil (false veya undefined durumu)
        postsSnapshot.docs.forEach(doc => {
            if (doc.data().isPinned !== true) {
                bulkWriter.delete(doc.ref);
                deleteCount++;
            }
        });

        if (deleteCount > 0) {
            await bulkWriter.close();
            logger.info(`${deleteCount} doküman temizlendi.`);
        } else {
            logger.info("Temizlenecek doküman bulunamadı.");
        }

    } catch (error) {
        logger.error("Cleanup hatası:", error);
    }
});