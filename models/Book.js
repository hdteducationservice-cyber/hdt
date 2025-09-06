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
  // O-Level Subjects (Form I-IV)
  'Civics',
  'History',
  'Geography',
  'Kiswahili',
  'English Language',
  'Biology',
  'Basic Mathematics',
  'Physics',
  'Chemistry',
  'Bookkeeping',
  'Commerce',
  'Information and Computer Studies (ICS)',
  'Islamic Religion',
  'Christian Religion',
  'Agriculture',
  'Home Economics',
  'Technical Drawing',
  'Food and Nutrition',
  'Fine Art',
  'Music',
  // A-Level Subjects (Form V-VI) - Common combinations
  'Advanced Mathematics',
  'Physics (A-Level)',
  'Chemistry (A-Level)',
  'Biology (A-Level)',
  'Geography (A-Level)',
  'History (A-Level)',
  'Economics',
  'Accountancy',
  'Business Studies',
  'Computer Science',
  'Literature in English',
  'Political Science',
  'Sociology',
  'Philosophy',
  'French',
  'Arabic'
];

const bookSchema = new mongoose.Schema({
  title: {
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
  bookImage: {
    type: String,
    required: true // Secure URL to uploaded image (Cloudinary)
  },
  bookFile: {
    type: String,
    required: true // Secure URL to uploaded book file (Cloudinary)
  },
  bookImagePublicId: {
    type: String
  },
  bookFilePublicId: {
    type: String
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
  description: {
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
  }
}, {
  timestamps: true
});

// Index for faster queries
bookSchema.index({ classLevel: 1, subject: 1 });
bookSchema.index({ title: 'text' });

module.exports = mongoose.model('Book', bookSchema);
