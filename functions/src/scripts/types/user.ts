import { Timestamp } from "firebase-admin/firestore";

type User = {
    userID: string;
    email?: string;
    username?: string;
    birthDate?: Timestamp;
    gender?: string;
    organization?: string;
    profileImageUrl: string;
    bio?: string;
    permissions?: UserPermissions;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    lastActiveAt?: Timestamp;
}

type UserHobby = {
    hobbyId: string;
    eventsJoined: number;
    hobbyRating?: number;
    badgeLevel?: string;
}

type UserEvent = {
    eventID: string;
    date: Timestamp;
    role: string;
    status?: string;
    pinned?: boolean;
}

type UserPermissions = {
    locationEnabled: boolean;
    notificationsEnabled: boolean;
}


export { User, UserHobby, UserEvent, UserPermissions };


