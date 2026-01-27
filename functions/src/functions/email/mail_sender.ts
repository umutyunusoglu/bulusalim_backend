import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
// v2 importları kullanıyoruz

if (!admin.apps.length) {
  admin.initializeApp();
}


const root_mail = process.env.ROOT_MAIL;
const mail_client_id = process.env.MAIL_CLIENT_ID;
const mail_client_secret = process.env.MAIL_CLIENT_SECRET;
const mail_refresh_token = process.env.MAIL_REFRESH_TOKEN;

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    type: "OAuth2",
    user: root_mail,
    clientId: mail_client_id,
    clientSecret: mail_client_secret,
    refreshToken: mail_refresh_token,
  },
});

export {transporter, root_mail};
