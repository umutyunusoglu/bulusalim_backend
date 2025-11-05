import { Timestamp } from "firebase-admin/firestore";

type User = {
    uid: string;
    email?: string;
    username?: string;
    birthdate?: Timestamp;
    gender?: string;
    organization?: string;
    profileImagePaths?: string[];
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

type UserEvent = {
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
export { User, UserHobby, UserEvent, UserPermissions, UserMetadata };