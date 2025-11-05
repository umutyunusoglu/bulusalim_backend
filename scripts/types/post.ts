import { GeoPoint } from "firebase-admin/firestore";

type Post = {
    postId: string;
    userId: string;
    eventId: string;
    title: string;
    metadata: PostMetadata;
    location: GeoPoint;
    hobbies?: string[];
    imagePaths: string[];
    participants?: string[];
    emoteCounts?: { [emote: string]: number };

}
type PostMetadata = {
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
}
export { Post, PostMetadata };