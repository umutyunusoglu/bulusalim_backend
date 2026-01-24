

import * as admin from "firebase-admin";
import {setGlobalOptions} from "firebase-functions/v2";


const serviceAccount = require("../service_account.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

setGlobalOptions({maxInstances: 10, timeoutSeconds: 300, memory: "1GiB"});

import {handleEventCreate, handleEventUpdate, handleFollowerCreate, handleFolloweeDelete, handlePostCreate, handlePostUpdate, handleFollowRequestCreate, handleParticipantCreate} from "./functions/firebase_triggers/index";
import {reportUser} from "./functions/email/mail_sender";

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
};
