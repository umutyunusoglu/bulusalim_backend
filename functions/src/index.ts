


import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

admin.initializeApp({

});

setGlobalOptions({ maxInstances: 10, timeoutSeconds: 300, memory: "1GiB" });

import { handleEventCreate, handleEventUpdate, handlePostCreate, handlePostUpdate } from "./functions/firebase_triggers/index";
import { reportUser } from "./functions/email/mail_sender";

export {
    handleEventCreate,
    handleEventUpdate,
    handlePostCreate,
    handlePostUpdate,
    reportUser
}