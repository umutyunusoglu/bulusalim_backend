import { GeoPoint } from "firebase/firestore";
import { FeedTypeEnum } from "./feed_enum";

type Event = {
    eventID: string;
    name: string;
    search_name: string;
    info: string;
    hobbies: string[];
    creator: EventParticipant;
    capacity: number;
    startTime: FirebaseFirestore.Timestamp;
    endTime: FirebaseFirestore.Timestamp;
    location: GeoPoint;
    attributes?: EventAttributes;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
    participants: EventParticipant[];
    feedType: FeedTypeEnum;
    geohash: String,
    isLocked: boolean,

}

type EventAttributes = {
    price?: number;
    smokingAllowed?: boolean;
    alcoholAllowed?: boolean;
    isPublic?: boolean;
}
type EventParticipant = {
    userID: string;
    status: UserEventStatus;
    username?: string;
    profileImageUrl: string;
    role: string;
    eventScore?: number;
}

type Message = {
    messageId: string;
    content: string;
    sender: string;
    sendTime: FirebaseFirestore.Timestamp;
}

enum UserEventStatus {
    Saved = 'saved',
    Pending = 'pending',
    Accepted = 'accepted',
    Rejected = 'rejected',
    Upcoming = 'upcoming',
    Ongoing = 'ongoing',
    Completed = 'completed',
    Cancelled = 'cancelled',
}


export { Event, EventAttributes, EventParticipant, Message };
