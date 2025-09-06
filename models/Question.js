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

const questionSchema = new mongoose.Schema({
  questionType: {
    type: String,
    required: true,
    enum: ['text', 'image', 'file']
  },
  questionText: {
    type: String,
    required: function() { return this.questionType === 'text'; },
    trim: true
  },
  questionImage: {
  type: String,
  required: function() { return this.questionType === 'image'; }
  },
  questionFile: {
  type: String,
  required: function() { return this.questionType === 'file'; }
  },
  answer: {
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
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  tags: [{
    type: String,
    trim: true
  }],
  fileName: {
    type: String // Original file name for file type questions
  },
  mimeType: {
    type: String // File MIME type
  },
  questionImagePublicId: {
    type: String
  },
  questionFilePublicId: {
    type: String
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
questionSchema.index({ classLevel: 1, subject: 1 });
questionSchema.index({ questionText: 'text', answer: 'text' });

module.exports = mongoose.model('Question', questionSchema);
