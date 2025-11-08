import { GeoPoint } from "firebase-admin/firestore";

type Event = {
    eventID: string;
    name: string;
    info: string;
    hobbies: string[];
    creator: string;
    capacity: number;
    startTime: FirebaseFirestore.Timestamp;
    endTime: FirebaseFirestore.Timestamp;
    location: GeoPoint;
    attributes?: EventAttributes;
    metadata?: EventMetadata;

}

type EventAttributes = {
    price?: number;
    smokingAllowed?: boolean;
    alcoholAllowed?: boolean;
    isPublic?: boolean;
}

type EventMetadata = {
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
}

type EventParticipant = {
    userID: string;
    role: string;
    eventScore?: number;
}

type Message = {
    messageId: string;
    content: string;
    sender: string;
    sendTime: FirebaseFirestore.Timestamp;
}

export { Event, EventAttributes, EventMetadata, EventParticipant, Message };
