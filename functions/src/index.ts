

import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";


const serviceAccount = require("../service_account.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

setGlobalOptions({ maxInstances: 10, timeoutSeconds: 300, memory: "1GiB" });

import { reportUser } from "./functions/reporting/report";
import { sendVerificationEmail } from "./functions/auth/send_verification_email";
import { verifyEmailCode } from "./functions/auth/verify_email_code";
import { handleEventCreate, handleEventUpdate, handleFolloweeDelete, handleFollowerCreate, handleFollowRequestCreate, handleParticipantCreate, handlePostCreate, handlePostUpdate } from "./functions/firebase_triggers";


export {
  handleEventCreate,
  handleEventUpdate,
  handlePostCreate,
  handlePostUpdate,
  handleFollowerCreate,
  handleFolloweeDelete,
  handleFollowRequestCreate,
  reportUser,
  handleParticipantCreate,
  sendVerificationEmail,
  verifyEmailCode
};
