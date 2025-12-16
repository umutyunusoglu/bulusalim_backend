import { FeedTypeEnum } from "./feed_enum.js";
type Post = {
    postID: string;
    creator: PostParticipant;
    eventID: string;
    caption: string;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
    location: {
        longitude: number;
        latitude: number;
    };
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
    location: {
        longitude: number;
        latitude: number;
    };
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

export { Post, PostParticipant, PinnedPost };



