const nodemailer = require("nodemailer");
const fs = require('fs');
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
    const htmlContent = fs.readFileSync('./Mailer/ConfirmReset.html', 'utf8').replace('#link', link);
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipient,
        subject: "Password Reset Confirmation",
        html: htmlContent,
        attachments: [{
            filename: 'Logo.png',
            path: './Mailer/img/Logo.png',
            cid: 'logo'
        }]
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