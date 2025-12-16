import { FeedTypeEnum } from "./feed_enum";

type Event = {
    eventID: string;
    name: string;
    info: string;
    hobbies: string[];
    creator: EventParticipant;
    capacity: number;
    startTime: FirebaseFirestore.Timestamp;
    endTime: FirebaseFirestore.Timestamp;
    location: {
        longitude: number;
        latitude: number;
    };
    attributes?: EventAttributes;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
    participants: EventParticipant[];
    feedType: FeedTypeEnum;
}

type EventAttributes = {
    price?: number;
    smokingAllowed?: boolean;
    alcoholAllowed?: boolean;
    isPublic?: boolean;
}
type EventParticipant = {
    userID: string;
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

export { Event, EventAttributes, EventParticipant, Message };
