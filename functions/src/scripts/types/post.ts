import { GeoPoint } from "firebase-admin/firestore";
import { FeedTypeEnum } from "./feed_enum.js";
type Post = {
    postID: string;
    userID: string;
    eventID: string;
    caption: string;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
    location: GeoPoint;
    hobbies?: string[];
    imageUrls: string[];
    participants?: string[];
    emoteCounts?: { [emote: string]: number };
    feedType: FeedTypeEnum;
    isPinned: boolean;

}

export { Post };


