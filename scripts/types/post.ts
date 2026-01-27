import {GeoPoint} from "firebase/firestore";
import {FeedTypeEnum} from "./feed_enum.js";
type Post = {
    postID: string;
    creator: PostParticipant;
    eventID: string;
    caption: string;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
    location: GeoPoint;
    displayAddress: string;
    hobbies?: string[];
    imageUrls: string[];
    participants?: PostParticipant[];
    emoteCounts?: { [emote: string]: number };
    feedType: FeedTypeEnum;
    showParticipants: boolean;
    includeInDump: boolean;

}

type PinnedPost = {

    postID: string;
    caption: string;
    location: GeoPoint;
    imageUrls: string[];
    participants?: PostParticipant[];
    emoteCounts?: { [emote: string]: number };
    createdAt: FirebaseFirestore.Timestamp;
}


type PostParticipant = {
    userID: string;
    username?: string;
    profileImageUrl?: string;
}

export {Post, PostParticipant, PinnedPost};


