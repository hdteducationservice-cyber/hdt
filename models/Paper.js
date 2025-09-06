const mongoose = require('mongoose');

const classLevels = [
  'Form I', 'Form II', 'Form III', 'Form IV', 'Form V', 'Form VI', 'Other'
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

const paperSchema = new mongoose.Schema({
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
  year: {
    type: Number,
    required: true,
    min: 2000,
    max: new Date().getFullYear() + 5
  },
  paperFile: {
  type: String,
  required: true // Secure URL to uploaded paper file (Cloudinary)
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
  examType: {
    type: String,
    enum: ['Mock', 'NECTA', 'School', 'Practice'],
    default: 'Practice'
  },
  paperType: {
    type: String,
    enum: ['Paper 1', 'Paper 2', 'Paper 3', 'Practical', 'Project'],
    default: 'Paper 1'
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
  paperFilePublicId: {
    type: String
  },
  downloads: {
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
paperSchema.index({ classLevel: 1, subject: 1, year: -1 });

module.exports = mongoose.model('Paper', paperSchema);
