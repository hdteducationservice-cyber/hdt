// admin-auth.js
// Validates an admin session (adminToken) first, falling back to user session check.
// Exposes window.currentUser when authenticated.

async function validateAdminToken() {
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) return null;

    try {
        const res = await fetch('/api/admin/profile', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (!res.ok) {
            localStorage.removeItem('adminToken');
            return null;
        }

        const data = await res.json();
        return { ...data.admin, role: 'admin' };
    } catch (err) {
        console.error('Admin token validation failed', err);
        localStorage.removeItem('adminToken');
        return null;
    }
}

async function validateUserSession() {
    try {
        const response = await fetch('/api/users/check-session', {
            method: 'GET',
            credentials: 'include'
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.user;
    } catch (err) {
        console.error('Session validation failed', err);
        return null;
    }
}

// Public function used by admin pages
async function checkAdminOrTeacher(allowTeacher = false) {
    // 1) Try admin token first
    const admin = await validateAdminToken();
    if (admin) {
        window.currentUser = admin;
        return true;
    }

    // 2) Fallback to user session
    const user = await validateUserSession();
    if (!user) {
        window.location.href = 'ulogin.html';
        return false;
    }

    window.currentUser = user;

    // If the page expects a teacher, ensure role and approval
    if (!allowTeacher && user.role !== 'admin') {
        alert('Access denied. This page is for administrators only.');
        window.location.href = 'ulogin.html';
        return false;
    }

    if (allowTeacher && user.role === 'teacher' && user.status !== 'approved') {
        alert('Your account needs admin approval before you can access teaching tools.');
        window.location.href = 'tprofile.html';
        return false;
    }

    return true;
}

// default export for easier inclusion
window.adminAuth = {
    checkAdminOrTeacher
};
