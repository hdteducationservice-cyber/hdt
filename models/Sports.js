const mongoose = require('mongoose');

const sportsSchema = new mongoose.Schema({
  mediaType: {
    type: String,
    required: true,
    enum: ['image', 'video']
  },
  mediaFile: {
  type: String,
  required: true // Secure URL to uploaded media file (Cloudinary)
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  uploadedByName: {
    type: String,
    required: false // Name of the teacher who uploaded
  },
  category: {
    type: String,
    enum: ['Football', 'Basketball', 'Volleyball', 'Athletics', 'Swimming', 'Tennis', 'Netball', 'Traditional Games', 'Other'],
    default: 'Other'
  },
  eventDate: {
    type: Date
  },
  location: {
    type: String,
    trim: true
  },
  fileSize: {
    type: Number // File size in bytes
  },
  fileName: {
    type: String // Original file name
  },
  mimeType: {
    type: String // File MIME type
  },
  mediaFilePublicId: {
    type: String
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  dislikes: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for faster queries
sportsSchema.index({ category: 1, uploadDate: -1 });
sportsSchema.index({ description: 'text' });

module.exports = mongoose.model('Sports', sportsSchema);
