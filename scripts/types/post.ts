import { GeoPoint } from "firebase-admin/firestore";

type Post = {
    postID: string;
    userID: string;
    eventID: string;
    title: string;
    metadata: PostMetadata;
    location: GeoPoint;
    hobbies?: string[];
    imageUrls: string[];
    participants?: string[];
    emoteCounts?: { [emote: string]: number };

}
type PostMetadata = {
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
}
export { Post, PostMetadata };