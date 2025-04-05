require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const cors = require("cors");
const path = require("path");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.json());



app.use(cors({
  origin: ["http://localhost:5173", "https://your-frontend-domain.com"], // Add frontend domain if deployed
  methods: ["GET", "POST"],
}));

// ✅ MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ✅ Twilio Setup
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ✅ Mongoose Schema
const BookingSchema = new mongoose.Schema({
  customerName: String,
  phoneNumber: String,
  roomType: String,
  checkInDate: String,
  checkOutDate: String,
  amountPaid: Number,
  paymentMethod: String,
  transactionId: String,
});

const Booking = mongoose.model("Booking", BookingSchema);

// ✅ Ensure 'vouchers' folder exists
const vouchersDir = path.join(__dirname, "vouchers");
if (!fs.existsSync(vouchersDir)) {
  fs.mkdirSync(vouchersDir);
}

// ✅ Generate PDF Voucher
const generateVoucher = (booking) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const filePath = path.join(vouchersDir, `${booking._id}.pdf`);
    const writeStream = fs.createWriteStream(filePath);

    doc.pipe(writeStream);
    doc.fontSize(16).text("Sampath Residency - Payment Confirmation", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Guest Name: ${booking.customerName}`);
    doc.text(`Room Type: ${booking.roomType}`);
    doc.text(`Check-in: ${booking.checkInDate}`);
    doc.text(`Check-out: ${booking.checkOutDate}`);
    doc.text(`Amount Paid: ₹${booking.amountPaid}`);
    doc.text(`Payment Method: ${booking.paymentMethod}`);
    doc.text(`Transaction ID: ${booking.transactionId}`);
    doc.end();

    writeStream.on("finish", () => resolve(filePath));
    writeStream.on("error", reject);
  });
};

// ✅ Send WhatsApp Message with Twilio
const sendWhatsAppMessage = async (customerNumber, documentUrl) => {
  try {
    const formattedNumber = `whatsapp:${customerNumber.replace(/\s+/g, "")}`;
    const message = await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: formattedNumber,
      body: "📜 Your payment confirmation voucher from Sampath Residency.",
      mediaUrl: [documentUrl],
    });

    console.log("✅ WhatsApp message sent via Twilio:", message.sid);
  } catch (error) {
    console.error("❌ Error sending WhatsApp via Twilio:", error.message);
  }
};

// ✅ Booking API
app.post("/bookings", async (req, res) => {
  try {
    const booking = new Booking(req.body);
    await booking.save();

    const filePath = await generateVoucher(booking);
    const documentUrl = `https://backend-sampath-vouchers.onrender.com/vouchers/${booking._id}.pdf`;
    // Update to public URL if hosted

    await sendWhatsAppMessage(booking.phoneNumber, documentUrl);

    res.status(200).json({ message: "✅ Booking confirmed! Voucher sent via WhatsApp." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Serve PDF files publicly
app.use("/vouchers", express.static(vouchersDir));

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
