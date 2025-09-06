// AI Support Live Chat System
// This file provides AI educational assistance across the HDT EDUCATION platform

let aiChatSession = {
    isOpen: false,
    messages: [],
    sessionId: null
};

// Initialize AI Support System
function initializeAISupport() {
    // Add AI Support CSS if not already present
    if (!document.getElementById('ai-support-styles')) {
        const aiStyles = document.createElement('style');
        aiStyles.id = 'ai-support-styles';
        aiStyles.textContent = `
            /* AI Support Chat Styles */
            .ai-support-btn {
                position: fixed;
                /* right-center of the viewport */
                top: 50%;
                right: 24px;
                left: auto;
                transform: translateY(-50%);
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                border: none;
                cursor: pointer;
                box-shadow: 0 8px 30px rgba(102, 126, 234, 0.35);
                z-index: 1001;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 20px;
                transition: transform 0.25s ease, box-shadow 0.25s ease;
                animation: pulse 2s infinite;
                touch-action: manipulation;
            }

            .ai-support-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6);
            }

            @keyframes pulse {
                0% { box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4); }
                50% { box-shadow: 0 4px 20px rgba(102, 126, 234, 0.8), 0 0 0 10px rgba(102, 126, 234, 0.1); }
                100% { box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4); }
            }

            .ai-chat-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1002;
                display: none;
                align-items: center;
                justify-content: center;
            }

            .ai-chat-container {
                background: white;
                border-radius: 15px;
                width: 90%;
                max-width: 500px;
                height: 80vh;
                max-height: 600px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                overflow: hidden;
            }

            .ai-chat-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .ai-chat-title {
                font-size: 18px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .ai-status {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                opacity: 0.9;
            }

            .ai-status-dot {
                width: 8px;
                height: 8px;
                background: #28a745;
                border-radius: 50%;
                animation: blink 1.5s infinite;
            }

            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0.3; }
            }

            .ai-close-btn {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 5px;
                border-radius: 50%;
                transition: background 0.3s ease;
            }

            .ai-close-btn:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .ai-chat-messages {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                background: #f8f9fa;
            }

            .ai-message {
                margin-bottom: 15px;
                display: flex;
                gap: 12px;
            }

            .ai-message.user {
                flex-direction: row-reverse;
            }

            .ai-message.user .ai-message-content {
                background: #667eea;
                color: white;
                border-radius: 18px 18px 5px 18px;
            }

            .ai-message.ai .ai-message-content {
                background: white;
                color: #333;
                border-radius: 18px 18px 18px 5px;
                border: 1px solid #e9ecef;
            }

            .ai-message-avatar {
                width: 35px;
                height: 35px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                flex-shrink: 0;
            }

            .ai-message.user .ai-message-avatar {
                background: #667eea;
                color: white;
            }

            .ai-message.ai .ai-message-avatar {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }

            .ai-message-content {
                padding: 12px 16px;
                max-width: 80%;
                word-wrap: break-word;
                line-height: 1.4;
            }

            .ai-typing {
                display: none;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
            }

            .ai-typing-dots {
                display: flex;
                gap: 4px;
            }

            .ai-typing-dot {
                width: 8px;
                height: 8px;
                background: #667eea;
                border-radius: 50%;
                animation: typing 1.4s infinite ease-in-out;
            }

            .ai-typing-dot:nth-child(2) { animation-delay: 0.2s; }
            .ai-typing-dot:nth-child(3) { animation-delay: 0.4s; }

            @keyframes typing {
                0%, 60%, 100% { transform: translateY(0); }
                30% { transform: translateY(-10px); }
            }

            .ai-chat-input-area {
                padding: 20px;
                border-top: 1px solid #e9ecef;
                background: white;
            }

            .ai-input-container {
                display: flex;
                gap: 10px;
                align-items: flex-end;
            }

            .ai-chat-input {
                flex: 1;
                border: 2px solid #e9ecef;
                border-radius: 25px;
                padding: 12px 20px;
                font-size: 14px;
                resize: none;
                outline: none;
                max-height: 80px;
                min-height: 44px;
                transition: border-color 0.3s ease;
            }

            .ai-chat-input:focus {
                border-color: #667eea;
            }

            .ai-send-btn {
                background: #667eea;
                border: none;
                border-radius: 50%;
                width: 44px;
                height: 44px;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                transition: all 0.3s ease;
                flex-shrink: 0;
            }

            .ai-send-btn:hover:not(:disabled) {
                background: #5a6fd8;
                transform: scale(1.05);
            }

            .ai-send-btn:disabled {
                background: #ccc;
                cursor: not-allowed;
            }

            .ai-quick-actions {
                display: flex;
                gap: 8px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }

            .ai-quick-action {
                background: white;
                border: 1px solid #667eea;
                color: #667eea;
                border-radius: 20px;
                padding: 8px 16px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                white-space: nowrap;
            }

            .ai-quick-action:hover {
                background: #667eea;
                color: white;
            }

            @media (max-width: 768px) {
                .ai-chat-container {
                    width: 95%;
                    height: 90vh;
                }

                .ai-message-content {
                    max-width: 85%;
                }

                .ai-support-btn {
                    /* keep right-center on small screens for consistency */
                    top: 50%;
                    right: 18px;
                    left: auto;
                    transform: translateY(-50%);
                    width: 64px;
                    height: 64px;
                }

                .ai-quick-actions {
                    flex-direction: column;
                }

                .ai-quick-action {
                    text-align: center;
                }
            }
        `;
        document.head.appendChild(aiStyles);
    }

    // Add AI Support HTML if not already present
    if (!document.getElementById('ai-support-btn')) {
        const aiSupportHTML = `
            <!-- AI Support Chat -->
            <button class="ai-support-btn" id="ai-support-btn" onclick="toggleAiChat()" title="AI Support - Get instant help!">
                🤖
            </button>

            <!-- AI Chat Modal -->
            <div class="ai-chat-modal" id="aiChatModal">
                <div class="ai-chat-container">
                    <div class="ai-chat-header">
                        <div>
                            <div class="ai-chat-title">
                                🤖 AI Educational Assistant
                            </div>
                            <div class="ai-status">
                                <div class="ai-status-dot"></div>
                                Online & Ready to Help
                            </div>
                        </div>
                        <button class="ai-close-btn" onclick="toggleAiChat()">×</button>
                    </div>
                    
                    <div class="ai-chat-messages" id="aiChatMessages">
                        <div class="ai-message ai">
                            <div class="ai-message-avatar">🤖</div>
                            <div class="ai-message-content">
                                Hello! I'm your AI Educational Assistant. I'm here to help you with:
                                <br>• Academic questions & explanations
                                <br>• Study guidance & tips  
                                <br>• Platform navigation
                                <br>• Technical support
                                <br><br>What would you like to know?
                            </div>
                        </div>
                    </div>

                    <div class="ai-typing" id="aiTyping">
                        <div class="ai-message-avatar">🤖</div>
                        <div>
                            <div class="ai-typing-dots">
                                <div class="ai-typing-dot"></div>
                                <div class="ai-typing-dot"></div>
                                <div class="ai-typing-dot"></div>
                            </div>
                        </div>
                    </div>

                    <div class="ai-chat-input-area">
                        <div class="ai-quick-actions">
                            <button class="ai-quick-action" onclick="sendQuickMessage('How do I access my courses?')">📚 Course Access</button>
                            <button class="ai-quick-action" onclick="sendQuickMessage('Explain this topic')">❓ Explain Topic</button>
                            <button class="ai-quick-action" onclick="sendQuickMessage('Study tips')">💡 Study Tips</button>
                            <button class="ai-quick-action" onclick="sendQuickMessage('Technical help')">🔧 Tech Help</button>
                        </div>
                        <div class="ai-input-container">
                            <textarea 
                                class="ai-chat-input" 
                                id="aiChatInput" 
                                placeholder="Ask me anything about your studies..." 
                                rows="1"
                                onkeydown="handleInputKeydown(event)"
                            ></textarea>
                            <button class="ai-send-btn" id="aiSendBtn" onclick="sendMessage()">
                                ➤
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', aiSupportHTML);
    }
}

// AI Chat Functionality
function toggleAiChat() {
    const modal = document.getElementById('aiChatModal');
    aiChatSession.isOpen = !aiChatSession.isOpen;
    
    if (aiChatSession.isOpen) {
        modal.style.display = 'flex';
        document.getElementById('aiChatInput').focus();
        if (!aiChatSession.sessionId) {
            initializeAiSession();
        }
    } else {
        modal.style.display = 'none';
    }
}

function initializeAiSession() {
    aiChatSession.sessionId = 'session_' + Date.now();
    console.log('AI Chat session initialized:', aiChatSession.sessionId);
}

function sendQuickMessage(message) {
    document.getElementById('aiChatInput').value = message;
    sendMessage();
}

function handleInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('aiChatInput');
    const message = input.value.trim();
    
    if (!message) return;

    // Add user message to chat
    addMessageToChat('user', message);
    input.value = '';
    
    // Show typing indicator
    showTypingIndicator();
    
    // Simulate AI processing and response
    try {
        const response = await getAiResponse(message);
        hideTypingIndicator();
        addMessageToChat('ai', response);
    } catch (error) {
        hideTypingIndicator();
        addMessageToChat('ai', 'I apologize, but I\'m having trouble processing your request right now. Please try again or contact technical support if the issue persists.');
    }
}

function addMessageToChat(sender, message) {
    const messagesContainer = document.getElementById('aiChatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${sender}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.textContent = sender === 'user' ? '👤' : '🤖';
    
    const content = document.createElement('div');
    content.className = 'ai-message-content';
    content.innerHTML = message.replace(/\n/g, '<br>');
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store message in session
    aiChatSession.messages.push({ sender, message, timestamp: Date.now() });
}

function showTypingIndicator() {
    document.getElementById('aiTyping').style.display = 'flex';
    const messagesContainer = document.getElementById('aiChatMessages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
    document.getElementById('aiTyping').style.display = 'none';
}

async function getAiResponse(userMessage) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
    
    // Educational AI responses based on keywords
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('course') || lowerMessage.includes('access')) {
        return `To access your courses:\n\n1. Navigate to the main dashboard\n2. Click on the subject/course cards\n3. Browse available materials including videos, papers, and Q&A\n\nYou can access:\n• 📚 Study Materials (Papers)\n• 🎥 Educational Videos\n• ❓ Q&A Section\n• ⚽ Sports Updates\n\nNeed help with a specific subject? Just ask!`;
    }
    
    if (lowerMessage.includes('study') || lowerMessage.includes('tip')) {
        return `Here are some effective study tips:\n\n📚 **Study Strategies:**\n• Create a consistent study schedule\n• Break large topics into smaller chunks\n• Use active recall and practice testing\n• Join study groups or discussions\n\n🧠 **Memory Techniques:**\n• Use visual aids and diagrams\n• Create flashcards for key concepts\n• Teach concepts to others\n• Take regular breaks (Pomodoro technique)\n\n💡 **Platform Tips:**\n• Use our Q&A section for difficult questions\n• Watch educational videos for visual learning\n• Download study materials for offline access\n\nWhat specific subject would you like study tips for?`;
    }
    
    if (lowerMessage.includes('math') || lowerMessage.includes('mathematics')) {
        return `I'd be happy to help with mathematics! 🧮\n\n**Available Math Resources:**\n• Practice problems in our Q&A section\n• Step-by-step solution videos\n• Past examination papers\n• Interactive problem-solving sessions\n\n**Math Study Tips:**\n• Practice daily, even if just 15-20 minutes\n• Work through problems step-by-step\n• Don't just memorize formulas - understand concepts\n• Use visual representations when possible\n\n**Need help with specific math topics like:**\n• Algebra & Equations\n• Geometry & Trigonometry\n• Calculus & Advanced Topics\n• Statistics & Probability\n\nJust ask about any specific problem or topic!`;
    }
    
    if (lowerMessage.includes('science') || lowerMessage.includes('physics') || lowerMessage.includes('chemistry') || lowerMessage.includes('biology')) {
        return `Science learning made easier! 🔬\n\n**Science Resources Available:**\n• Laboratory experiment videos\n• Detailed explanations of scientific concepts\n• Practice questions with solutions\n• Real-world application examples\n\n**Science Study Approach:**\n• Connect theory with practical examples\n• Use diagrams and visual models\n• Practice problem-solving regularly\n• Relate concepts to everyday life\n\n**Subject Areas:**\n• 🧪 Chemistry - Reactions, compounds, equations\n• ⚛️ Physics - Motion, energy, forces\n• 🧬 Biology - Life processes, ecosystems, genetics\n\nWhat specific science topic interests you?`;
    }
    
    if (lowerMessage.includes('exam') || lowerMessage.includes('test')) {
        return `Exam preparation strategies! 📝\n\n**Exam Prep Resources:**\n• Past papers with marking schemes\n• Timed practice tests\n• Revision summaries\n• Key topic highlights\n\n**Effective Exam Strategies:**\n• Start revision early (not last minute!)\n• Create a revision timetable\n• Practice under timed conditions\n• Focus on understanding, not just memorizing\n• Get enough sleep before exams\n\n**During the Exam:**\n• Read all instructions carefully\n• Plan your time for each section\n• Start with questions you know well\n• Review your answers if time permits\n\n**Access Practice Materials:**\nCheck our Papers section for past exams and practice questions!\n\nNeed specific exam tips for particular subjects?`;
    }
    
    if (lowerMessage.includes('technical') || lowerMessage.includes('help') || lowerMessage.includes('problem')) {
        return `Technical Support 🔧\n\n**Common Solutions:**\n• **Videos not playing?** Try refreshing the page or check your internet connection\n• **Can't download files?** Make sure pop-ups are allowed for this site\n• **Login issues?** Clear browser cookies and try again\n• **Slow loading?** Try using a different browser or device\n\n**Platform Features:**\n• Works best on modern browsers (Chrome, Firefox, Safari)\n• Mobile-friendly responsive design\n• Download materials for offline study\n• Real-time chat and discussions\n\n**Need More Help?**\nIf the issue persists:\n1. Take a screenshot of any error messages\n2. Contact our technical support team\n3. Try accessing from a different device\n\nDescribe your specific technical issue and I'll provide targeted help!`;
    }
    
    if (lowerMessage.includes('teacher') || lowerMessage.includes('contact')) {
        return `Connect with Teachers & Support 👨‍🏫\n\n**Ways to Get Help:**\n• Use the Q&A section to ask academic questions\n• Join live chat sessions during office hours\n• Access teacher-created video explanations\n• Participate in group discussions\n\n**Contact Information:**\n📧 Email: info@hdteducation.ac.tz\n📱 Phone: +255 123 456 789\n🕐 Office Hours: Mon-Fri 8:00 AM - 5:00 PM\n\n**Academic Support:**\n• Subject-specific teacher consultations\n• Study group coordination\n• Assignment guidance\n• Career counseling\n\nWould you like me to help you with a specific academic question?`;
    }
    
    // Default helpful response
    return `I'm here to help with your educational journey! 🎓\n\n**I can assist you with:**\n• 📚 Study tips and learning strategies\n• 🔍 Platform navigation and features\n• 📖 Subject-specific questions\n• 🛠️ Technical support\n• 📞 Contact information\n\n**Popular topics:**\n• Mathematics problem-solving\n• Science concept explanations  \n• Exam preparation strategies\n• Course access and materials\n\n**Quick Actions:**\nTry asking about specific subjects like "help with mathematics" or "biology study tips"\n\nWhat would you like to explore today?`;
}

// Initialize AI Support when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeAISupport();
});

// Make functions globally available
window.toggleAiChat = toggleAiChat;
window.sendQuickMessage = sendQuickMessage;
window.handleInputKeydown = handleInputKeydown;
window.sendMessage = sendMessage;
