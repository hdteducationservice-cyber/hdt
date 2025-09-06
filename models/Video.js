const mongoose = require('mongoose');

const classLevels = [
  'Form I',
  'Form II', 
  'Form III',
  'Form IV',
  'Form V',
  'Form VI',
  'Other'
];

const subjects = [
  'Civics', 'History', 'Geography', 'Kiswahili', 'English Language',
  'Biology', 'Basic Mathematics', 'Physics', 'Chemistry', 'Bookkeeping',
  'Commerce', 'Information and Computer Studies (ICS)', 'Islamic Religion',
  'Christian Religion', 'Agriculture', 'Home Economics', 'Technical Drawing',
  'Food and Nutrition', 'Fine Art', 'Music', 'Advanced Mathematics',
  'Physics (A-Level)', 'Chemistry (A-Level)', 'Biology (A-Level)',
  'Geography (A-Level)', 'History (A-Level)', 'Economics', 'Accountancy',
  'Business Studies', 'Computer Science', 'Literature in English',
  'Political Science', 'Sociology', 'Philosophy', 'French', 'Arabic'
];

const videoSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
    trim: true
  },
  classLevel: {
    type: String,
    required: true,
    enum: classLevels
  },
  subject: {
    type: String,
    required: true,
    enum: subjects
  },
  videoFile: {
  type: String,
  required: true // Secure URL to uploaded video file (Cloudinary)
  },
  thumbnail: {
  type: String // URL to video thumbnail if generated
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
  duration: {
    type: Number // Video duration in seconds
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
  videoFilePublicId: {
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
videoSchema.index({ classLevel: 1, subject: 1 });
videoSchema.index({ description: 'text' });

module.exports = mongoose.model('Video', videoSchema);
