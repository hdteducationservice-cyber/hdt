const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  targetAudience: {
    type: [String],
    enum: ['students', 'teachers', 'parents', 'all'],
    default: ['students']
  },
  classLevels: [{
    type: String,
    enum: ['Form I', 'Form II', 'Form III', 'Form IV', 'Form V', 'Form VI', 'All']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  expiryDate: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  attachments: [{
  fileName: String,
  url: String,
  publicId: String,
  resourceType: String,
  fileSize: Number,
  mimeType: String
  }],
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date
  },
  emailRecipients: [{
    email: String,
    name: String,
    sentAt: Date,
    status: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent'
    }
  }]
}, {
  timestamps: true
});

// Index for efficient querying
announcementSchema.index({ isActive: 1, createdAt: -1 });
// Separate indexes for array fields (can't create compound index on two arrays)
announcementSchema.index({ targetAudience: 1 });
announcementSchema.index({ classLevels: 1 });

// Virtual for priority display
announcementSchema.virtual('priorityIcon').get(function() {
  const icons = {
    'low': '📢',
    'medium': '📣',
    'high': '🔔',
    'urgent': '🚨'
  };
  return icons[this.priority] || '📢';
});

// Method to check if announcement is still valid
announcementSchema.methods.isValid = function() {
  if (!this.isActive) return false;
  if (this.expiryDate && this.expiryDate < new Date()) return false;
  return true;
};

// Method to mark as read by user
announcementSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(read => read.user.toString() === userId.toString());
  if (!existingRead) {
    this.readBy.push({ user: userId });
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to check if user has read this announcement
announcementSchema.methods.isReadBy = function(userId) {
  return this.readBy.some(read => read.user.toString() === userId.toString());
};

module.exports = mongoose.model('Announcement', announcementSchema);
