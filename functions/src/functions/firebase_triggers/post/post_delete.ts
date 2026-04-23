import {
  onDocumentDeleted,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
const db = admin.firestore();

export const handlePostDelete = onDocumentDeleted(
  "posts/{postId}",
  async (event) => {
    if (!event.data) {
      logger.error("No data found in updated document.");
      return;
    }

    const postData = event.data?.data();

    const includeInDump = postData?.includeInDump;
    if (includeInDump) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // Months are zero-indexed

      const creatorID = postData?.creator?.userID || "unknown_creator";
      const postID = event.data.id;


      const dumpBucketDirectoryPath = 'private/users/' + creatorID + '/dumps/' + currentYear + '/' + currentMonth + '/' + postID + '/';

      try {
        const bucket = admin.storage().bucket();

        const imageUrls = postData?.imageUrls || [];


        // download images from the URLs and upload them to the storage bucket
        var index = 0;
        for (const imageUrl of imageUrls) {
          const response = await fetch(imageUrl);

          if (!response.ok) {
            logger.error(`Failed to download image from URL: ${imageUrl}`);
            continue;
          }

          const imageBuffer = await response.arrayBuffer();
          const fileName = `image_${index}.jpg`;

          const file = bucket.file(dumpBucketDirectoryPath + fileName);
          await file.save(Buffer.from(imageBuffer));

          logger.info(`Image uploaded to storage bucket at path: ${dumpBucketDirectoryPath + fileName}`);
          index++;

        }

        const categories = postData?.categories || [];
        const participantUsernames = postData?.participants?.map((participant: any) => participant.username) || [];

        const location = postData?.location || {};

        //Emote counts is a map emoteName: count, we want to convert it to an array of objects with emoteName and count properties
        const emoteCounts = postData?.emoteCounts ? Object.entries(postData.emoteCounts).map(([emoteName, count]) => ({ emoteName, count })) : [];
        const totalEmoteCount = emoteCounts.reduce((total: number, emote: any) => {
          return total + Number(emote.count);
        }, 0);

        const postDumpData = {
          categories,
          participantUsernames,
          location,
          emoteCounts,
          totalEmoteCount,
        };


        const dumpFile = bucket.file(dumpBucketDirectoryPath + 'postData.json');
        await dumpFile.save(JSON.stringify(postDumpData));

        logger.info(`Post data dumped to storage bucket at path: ${dumpBucketDirectoryPath + 'postData.json'}`);


      } catch (storageError) {
        logger.error(
          `Failed to dump post data to storage for post ${postID}:`,
          storageError,
        );
      }

    }


    const postId = event.data.id;
    const postOwnerID = event.data.data().creator.userID;

    const postRef = event.data?.ref;
    if (postRef) {
      await admin.firestore().recursiveDelete(postRef.collection("emotes"));
    }


    //Delete the image from bucket

    const imagePostImagePath = 'private/users/' + postOwnerID + '/posts/' + postId + '/';
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({ prefix: imagePostImagePath });

    for (const file of files) {
      try {
        await file.delete();
        logger.info(`Deleted image from storage bucket at path: ${file.name}`);
      } catch (deleteError) {
        logger.error(
          `Failed to delete image from storage bucket at path ${file.name}:`,
          deleteError,
        );
      }
    }



    try {
      await db
        .collection("users")
        .doc(postOwnerID)
        .collection("posts")
        .doc(postId)
        .delete();
      logger.info(`Feed entry updated for post: ${postId}`);
    } catch (dbError) {
      logger.error(
        `Failed to update feed document for post ${postId}:`,
        dbError,
      );
    }
  },
);
