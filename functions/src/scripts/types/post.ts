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
    participants?: PostParticipant[];
    emoteCounts?: { [emote: string]: number };
    feedType: FeedTypeEnum;
    isPinned: boolean;

}

type PostParticipant = {
    userID: string;
    username?: string;
    profileImageUrl?: string;
}

export { Post, PostParticipant };



