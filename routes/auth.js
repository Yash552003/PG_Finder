const express = require('express');
const router = express.Router();
const logins = require('../models/login');
const registrations = require('../models/register');
const {
    generateValidationKey,
    forgetPasswordKeyGenerator
} = require('../utils/key_generator');
const {
    sendRegistrationEmail,
    sendForgotPasswordEmail,
    sendPasswordChangeEmail
} = require('../utils/mail_sender');
const { validateRegistration, validateLogin } = require('../middlewares/schema_validator');
const riders = require('../models/rider');
const providers = require('../models/provider');
const keys = require('../models/key');
const passport = require('passport');
const { adminKey, serverURL } = require('../config');

/* --------- REGISTRATION --------- */
router.get('/registration', (req, res) => {
    res.render('user-registration');
});

router.post('/registration', validateRegistration, async (req, res) => {
    try {
        if (req.user)
            req.logout(err => {
                if (err)
                    console.log('could not log out for registration due to ' + err);
            });

        const { email, pass, role, name } = req.body;

        // Check if already registered
        const existingUser = await logins.findOne({ username: email });
        if (existingUser) {
            return res.status(400).render('error', { error: 'User already exists!', code: 400 });
        }

        // Create login directly (skip email validation)
        const createdLogin = await logins.register(new logins({
            username: email,
            name: name,
            role: role,
            isFilled: false
        }), pass);

        if (!createdLogin) {
            return res.status(500).render('error', { code: 500, error: 'Could not create account!' });
        }

        // Also create rider/provider record
        const newUser = {
            email: email,
            name: name,
            dob: null,
            phone: null,
            address: null
        };

        let userRecord;
        if (role === 'rider')
            userRecord = await riders.create(newUser);
        else if (role === 'provider')
            userRecord = await providers.create(newUser);

        if (!userRecord) {
            await logins.deleteOne({ username: email });
            return res.status(500).render('error', { code: 500, error: 'Could not create user profile!' });
        }

        console.log('✅ Account successfully created for:', email);
        res.render('success', {
            success: 'Account created successfully! You can now <a href="/auth/login">login</a>.'
        });
    } catch (e) {
        console.error(e);
        res.render('error', { code: 500, error: 'Internal server error' });
    }
});

/* --------- LOGIN & LOGOUT --------- */

router.get('/login', (req, res) => {
    try {
        res.render('user-login', { attempt: req.query.attempt || 'first' });
    } catch (e) {
        res.render('error', { code: 500, error: 'Internal server error' });
    }
});

router.post(
    '/login',
    validateLogin,
    passport.authenticate('local', { failureRedirect: '/auth/login?attempt=failed' }),
    async (req, res) => {
        try {
            const user = req.user;

            if (!user) {
                console.log('❌ Login failed — no user object found.');
                return res.redirect('/auth/login?attempt=failed');
            }

            // --- FIX: Store session info for role-protected routes ---
            req.session.userID = user._id ? user._id.toString() : user.username;
            req.session.username = user.username;
            req.session.userRole = user.role;

            // Also set role-specific session values immediately so redirected
            // requests and any XHR/fetch calls in the same browser session
            // can rely on `req.session.userRoleID` and `req.session.userDet`.
            if (user.role === 'provider') {
                const prov = await providers.findOne({ email: user.username });
                if (prov) {
                    req.session.userRoleID = prov._id.toString();
                    req.session.userDet = prov;
                }
            } else if (user.role === 'rider') {
                const rid = await riders.findOne({ email: user.username });
                if (rid) {
                    req.session.userRoleID = rid._id.toString();
                    req.session.userDet = rid;
                }
            }

            // Determine redirect
            let redirectTo = '/';
            const { role } = user;

            if (role === 'admin') {
                redirectTo = '/admin/dashboard';
            } else if (role === 'rider') {
                redirectTo = '/rider/dashboard';
            } else if (role === 'provider') {
                redirectTo = '/provider/dashboard';
            }

            // Save session explicitly and redirect only after save completes to
            // avoid a race where the browser makes the next request before
            // session fields (userRoleID/userDet) are persisted.
            req.session.save((err) => {
                if (err) console.error('Session save error after login:', err);
                console.log(`✅ Logged in as: ${user.username} | Role: ${user.role} | Redirecting to: ${redirectTo}`);
                return res.redirect(redirectTo);
            });
        } catch (e) {
            console.error('⚠️ Login error:', e);
            res.render('error', { code: 500, error: 'Internal server error during login.' });
        }
    }
);

router.get('/logout', (req, res) => {
    try {
        req.logout(err => {
            if (err)
                return res.status(500).send({ error: 'could not logout! Internal Server Failure!' });
        });

        console.log('✅ User logged out!');
        res.redirect('/');
    } catch (e) {
        res.render('error', { code: 500, error: 'Internal server error' });
    }
});

/* --------- ADMIN --------- */

router.get('/admin-create', (req, res) => {
    res.render('admin-registration');
});

router.post('/admin-create', async (req, res) => {
    try {
        const { email, adminKey: providedAdminKey } = req.body;

        if (providedAdminKey !== adminKey)
            return res.render('error', { code: 406, error: 'BAD REQUEST, UNAUTHORIZED' });

        const login = await logins.findOne({ username: email });
        login.role = 'admin';
        await riders.findOneAndDelete({ email });
        await login.save();

        res.redirect('/auth/admin-login');
    } catch (e) {
        res.render('error', { code: 500, error: 'Internal server error' });
    }
});

router.get('/admin-login', (req, res) => {
    res.render('admin-login');
});

router.post(
    '/admin-login',
    passport.authenticate('local', {
        successRedirect: '/admin/dashboard',
        failureRedirect: '/auth/admin-login'
    })
);

/* --------- FORGET PASSWORD --------- */

router.get('/forget-password', (req, res) => {
    if (req.user)
        req.logout(() => {});
    res.render('forgot-password');
});

router.post('/forget-password', async (req, res) => {
    try {
        const { email } = req.body;
        const resetUser = await logins.findOne({ username: email });

        if (!resetUser)
            return res.status(403).send({ error: 'User does not exist!' });

        const key = forgetPasswordKeyGenerator();
        await keys.create({
            key: key,
            purpose: 'password',
            content: {
                name: resetUser.name,
                email: resetUser.username
            }
        });

        await sendForgotPasswordEmail(resetUser.username, key);
        res.render('success', { success: 'Email sent successfully, check email to change password!' });
    } catch (e) {
        res.render('error', { code: 500, error: 'Internal server error' });
    }
});

/* --------- CHANGE PASSWORD --------- */

router.get('/change-password', async (req, res) => {
    try {
        const { key } = req.query;
        const keyData = await keys.findOne({ key });

        if (!keyData)
            return res.render('error', { code: 404, error: 'Reset request not found!' });

        res.render('reset-pass', { name: keyData.content.name, key });
    } catch (e) {
        res.render('error', { code: 500, error: 'Internal server error' });
    }
});

router.post('/change-password', async (req, res) => {
    try {
        const { pass, key } = req.body;
        const keyData = await keys.findOne({ key });

        if (!keyData)
            return res.render('error', { code: 404, error: 'Reset request not found!' });

        const username = keyData.content.email;
        const resetUser = await logins.findOne({ username });

        resetUser.setPassword(pass, (err) => {
            if (err)
                return res.status(500).render('error', { error: 'Could not update password!' });

            resetUser.save();
        });

        await keys.deleteOne({ key });
        await sendPasswordChangeEmail(username);
        return res.render('success', { success: 'Password changed successfully!' });
    } catch (e) {
        res.render('error', { code: 500, error: 'Could not change password, internal server failure!' });
    }
});

module.exports = router;
