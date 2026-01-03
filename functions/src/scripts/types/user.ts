import { Timestamp } from "firebase/firestore";

type User = {
    userID: string;
    email?: string;
    username?: string;
    search_name: string;
    birthDate?: Timestamp;
    gender?: string;
    organization?: string;
    profileImageUrl: string;
    bio?: string;
    permissions?: UserPermissions;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    hobbies?: UserHobby[];
    events?: UserEvent[];
    lastActiveAt?: Timestamp;
    isPrivate: boolean;
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

type Friend = {
    userID: string;
    username: string;
    profileImageUrl: string;
    createdAt: Timestamp;
}


export { User, UserHobby, UserEvent, UserPermissions, Friend };

