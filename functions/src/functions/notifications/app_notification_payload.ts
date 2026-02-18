/**
 * Interface representing the notification content and metadata.
 * Matches the structure expected by the Flutter frontend.
 */
interface AppNotificationPayload {
  title: string;
  body: string;
  type: string; // From NotificationType enum in Flutter (e.g., 'join', 'invite')
  eventId?: string; // Optional: ID of the related event
  userId?: string; // Optional: ID of the user who triggered the notification
  postId?: string; // Optional: ID of the related post (if applicable)
  profileImageUrl?: string; // Optional: URL of the sender's profile picture
  actionText?: string; // Optional: Label for the action button (e.g., 'View Event')
}

export type { AppNotificationPayload };
