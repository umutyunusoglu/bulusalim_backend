import { Timestamp } from "firebase-admin/firestore";

type User = {
    uid: string;
    email?: string;
    username?: string;
    birthdate?: Timestamp;
    gender?: string;
    organization?: string;
    profilePictureUrls?: string[];
    bio?: string;
    permissions?: UserPermissions;
    metadata?: UserMetadata;
}

type UserHobby = {
    hobbyId: string;
    eventsJoined: number;
    hobbyRating?: number;
    badgeLevel?: string;
}

type UserEvents = {
    eventId: string;
    date: Timestamp;
    role: string;
}

type UserPermissions = {
    locationEnabled: boolean;
    notificationsEnabled: boolean;
}

type UserMetadata = {
    createdAt: Timestamp;
    updatedAt: Timestamp;
    lastActiveAt?: Timestamp;
}
export { User, UserHobby, UserEvents, UserPermissions, UserMetadata };