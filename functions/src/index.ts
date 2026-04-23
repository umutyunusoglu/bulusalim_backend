import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

const serviceAccount = require("../service_account.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "bulusalim-e8e7c.firebasestorage.app"
});

setGlobalOptions({ maxInstances: 10, timeoutSeconds: 300, memory: "1GiB" });

import { reportUser } from "./functions/reporting/report";
import { sendVerificationEmail } from "./functions/auth/send_verification_email";
import { verifyEmailCode } from "./functions/auth/verify_email_code";
import {
  handleEventCreate,
  handleEventDelete,
  handleEventSensitiveUpdate,
  handleEventUpdate,
  handleFolloweeDelete,
  handleFollowerCreate,
  handleFollowRequestCreate,
  handleParticipantCreate,
  handlePostCreate,
  handlePostDelete,
  handlePostUpdate,
  handleUserCreate,
  handleUserUpdate,
} from "./functions/firebase_triggers";
import { deleteAccount } from "./functions/auth/delete_account";
import { startEventLogic } from "./functions/event_lifecycle/start_event_logic";
import { stopEventLogic } from "./functions/event_lifecycle/stop_event_logic";
import { sendEventInvitation } from "./functions/send_event_invitation";
import { hourlyEventPostCleanup } from "./functions/crone_jobs/hourly_event_post_cleanup";
import { monthlyDumpProcessor } from "./functions/crone_jobs/dump_creator";

export {
  handleUserCreate,
  handleUserUpdate,
  deleteAccount,
  handleEventCreate,
  handleEventUpdate,
  handleEventSensitiveUpdate,
  handleEventDelete,
  handlePostCreate,
  handlePostUpdate,
  handlePostDelete,
  handleFollowerCreate,
  handleFolloweeDelete,
  handleFollowRequestCreate,
  reportUser,
  handleParticipantCreate,
  sendVerificationEmail,
  verifyEmailCode,
  startEventLogic,
  stopEventLogic,
  sendEventInvitation,
  hourlyEventPostCleanup,
  monthlyDumpProcessor,
};
