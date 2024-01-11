const nodemailer = require("nodemailer");
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: "Gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

function sendConfirmation(recipient, link) {
    const mailOptions = {
        from: "TimeWise.noreplies@gmail.com",
        to: recipient,
        subject: "Password Reset Confirmation",
        text: "Your password reset request has been received. Here is your unique link for the password reset. Please keep it confidential and use it within the next hour:\n\n"
            + link +
            "\n\nIf you did not request a password reset, please ignore this email.\n\nBest regards,\nTimeWise Team",
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("Error sending email: ", error);
        } else {
            console.log("Email sent: ", info.response);
        }
    });
}

module.exports = { sendConfirmation };