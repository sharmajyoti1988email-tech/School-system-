require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const adminRouter = require('./admin');

const app = express();

// ==========================================
// CONFIGURATION & PLACEHOLDERS
// ==========================================
const SCHOOL_CONFIG = {
    name: "Sarvhitkari Keshav Vidya Niketan",
    shortName: "SKVN",
    established: 2004,
    address: "Guru Gobind Singh Avenue, Jalandhar, Punjab, India",
    phone: process.env.SCHOOL_PHONE || "Contact details to be confirmed by the school",
    email: process.env.SCHOOL_EMAIL || "Contact details to be confirmed by the school",
    images: {
        hero: "https://placehold.co/1920x1080/1a432b/ffffff?text=School+Building+Exterior+(Photo+1)",
        campus: "https://placehold.co/1200x800/1a432b/ffffff?text=School+Building+and+Playground+(Photo+2)",
        facade: "https://placehold.co/1200x800/1a432b/ffffff?text=School+Building+Facade+(Photo+3)",
        vidyaBharatiLogo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e6/Vidya_Bharati_Logo.svg/200px-Vidya_Bharati_Logo.svg.png" // Placeholder - Use Authentic Source
    }
};

// ==========================================
// DATABASE SETUP & MODELS
// ==========================================
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    if (!process.env.MONGODB_URI) return console.warn("MONGODB_URI is missing. Database not connected.");
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        isConnected = true;
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB connection error:', error);
    }
};

// Schemas
const admissionSchema = new mongoose.Schema({
    reference: { type: String, unique: true },
    parentName: String, relation: String, phone: String, email: String,
    studentName: String, dob: Date, gender: String,
    currentClass: String, session: String, appliedClass: String, prevSchool: String,
    contactMethod: String, specialRequests: String,
    status: { type: String, default: 'submitted' }, // submitted, under_review, approved, rejected
    createdAt: { type: Date, default: Date.now }
});

const visitSchema = new mongoose.Schema({
    reference: { type: String, unique: true },
    name: String, phone: String, email: String,
    date: Date, timeRange: String, visitors: Number, purpose: String,
    status: { type: String, default: 'pending' }, // pending, approved, completed, declined
    createdAt: { type: Date, default: Date.now }
});

const contactSchema = new mongoose.Schema({
    reference: { type: String, unique: true },
    name: String, phone: String, email: String, message: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const noticeSchema = new mongoose.Schema({
    title: String, description: String, category: String,
    status: { type: String, default: 'draft' }, // draft, published
    createdAt: { type: Date, default: Date.now }
});

const Admission = mongoose.model('Admission', admissionSchema);
const Visit = mongoose.model('Visit', visitSchema);
const Contact = mongoose.model('Contact', contactSchema);
const Notice = mongoose.model('Notice', noticeSchema);

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled for inline scripts/styles in this unified architecture
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Apply database connection to all routes in serverless context
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Session Management
if (process.env.MONGODB_URI && process.env.SESSION_SECRET) {
    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
        cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 86400000 }
    }));
}

// Rate Limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: "Too many requests, please try again later." });
app.use('/api/', apiLimiter);

// Mount Admin Routes
app.use(adminRouter());

// Utility to sanitize inputs
const sanitize = (str) => typeof str === 'string' ? str.replace(/[<>]/g, '') : str;
const generateRef = (prefix) => `${prefix}-${new Date().getFullYear()}-${Math.random().toString(36).substring(2,8).toUpperCase()}`;

// ==========================================
// PUBLIC API ROUTES
// ==========================================
app.get('/api/health', (req, res) => res.json({ status: 'ok', db: isConnected }));
app.get('/api/school', (req, res) => res.json(SCHOOL_CONFIG));
app.get('/api/notices', async (req, res) => {
    try {
        const notices = await Notice.find({ status: 'published' }).sort({ createdAt: -1 }).limit(10);
        res.json(notices);
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admissions', async (req, res) => {
    try {
        const ref = generateRef('SKVN');
        const admission = new Admission({
            reference: ref,
            parentName: sanitize(req.body.parentName), relation: sanitize(req.body.relation),
            phone: sanitize(req.body.phone), email: sanitize(req.body.email),
            studentName: sanitize(req.body.studentName), dob: sanitize(req.body.dob),
            gender: sanitize(req.body.gender), currentClass: sanitize(req.body.currentClass),
            session: sanitize(req.body.session), appliedClass: sanitize(req.body.appliedClass),
            prevSchool: sanitize(req.body.prevSchool), contactMethod: sanitize(req.body.contactMethod),
            specialRequests: sanitize(req.body.specialRequests)
        });
        await admission.save();
        res.json({ success: true, reference: ref, message: 'Admission enquiry submitted successfully.' });
    } catch (err) { res.status(500).json({ error: 'Failed to submit application.' }); }
});

app.post('/api/visits', async (req, res) => {
    try {
        const ref = generateRef('VST');
        const visit = new Visit({
            reference: ref, name: sanitize(req.body.name), phone: sanitize(req.body.phone),
            email: sanitize(req.body.email), date: sanitize(req.body.date),
            timeRange: sanitize(req.body.timeRange), visitors: parseInt(req.body.visitors) || 1,
            purpose: sanitize(req.body.purpose)
        });
        await visit.save();
        res.json({ success: true, reference: ref, message: 'Visit request submitted successfully.' });
    } catch (err) { res.status(500).json({ error: 'Failed to submit visit request.' }); }
});

app.post('/api/contact', async (req, res) => {
    try {
        const ref = generateRef('MSG');
        const msg = new Contact({
            reference: ref, name: sanitize(req.body.name), phone: sanitize(req.body.phone),
            email: sanitize(req.body.email), message: sanitize(req.body.message)
        });
        await msg.save();
        res.json({ success: true, reference: ref, message: 'Message sent successfully.' });
    } catch (err) { res.status(500).json({ error: 'Failed to send message.' }); }
});

// ==========================================
// FRONTEND RENDERING
// ==========================================
app.get('/', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${SCHOOL_CONFIG.name} | Jalandhar</title>
    <meta name="description" content="${SCHOOL_CONFIG.name} - Nurturing knowledge, character, creativity, and confidence through value-based education in Jalandhar.">
    <meta name="theme-color" content="#1a432b">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg-color: #f2f5f3;
            --primary: #1a432b;
            --accent: #ff9933;
            --text-dark: #2d3748;
            --text-light: #718096;
            --white: #ffffff;
            --mint: #e6f2ec;
            --clay-shadow-out: 10px 10px 24px rgba(35, 55, 40, 0.10), -8px -8px 22px rgba(255, 255, 255, 0.85);
            --clay-shadow-in: inset 6px 6px 15px rgba(35, 55, 40, 0.08), inset -6px -6px 15px rgba(255, 255, 255, 0.9);
            --border-rad: 20px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Poppins', sans-serif; background-color: var(--bg-color); color: var(--text-dark); overflow-x: hidden; line-height: 1.6; }
        a { text-decoration: none; color: inherit; }
        ul { list-style: none; }
        
        /* Claymorphism Classes */
        .clay-card { background: var(--bg-color); border-radius: var(--border-rad); box-shadow: var(--clay-shadow-out); padding: 2rem; transition: transform 0.3s ease; }
        .clay-card:hover { transform: translateY(-5px); }
        .clay-btn { background: var(--bg-color); color: var(--primary); font-weight: 600; padding: 12px 24px; border: none; border-radius: 12px; box-shadow: var(--clay-shadow-out); cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .clay-btn:hover { color: var(--accent); }
        .clay-btn:active { box-shadow: var(--clay-shadow-in); transform: scale(0.98); }
        .clay-btn-primary { background: var(--primary); color: var(--white); box-shadow: 6px 6px 16px rgba(26, 67, 43, 0.3), -6px -6px 16px rgba(255, 255, 255, 0.5); }
        .clay-btn-primary:hover { color: var(--white); background: #143622; }
        .clay-input { width: 100%; padding: 14px; background: var(--bg-color); border: none; border-radius: 12px; box-shadow: var(--clay-shadow-in); font-family: 'Poppins', sans-serif; color: var(--text-dark); margin-bottom: 15px; outline: none; }
        .clay-input:focus { box-shadow: var(--clay-shadow-in), 0 0 0 2px rgba(26, 67, 43, 0.2); }
        
        /* Typography */
        h1, h2, h3 { color: var(--primary); margin-bottom: 1rem; }
        h2 { font-size: 2.2rem; text-align: center; margin-bottom: 2.5rem; position: relative; }
        h2::after { content: ''; position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%); width: 60px; height: 4px; background: var(--accent); border-radius: 2px; }
        p { color: var(--text-light); margin-bottom: 1rem; }
        
        /* Layout */
        .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        section { padding: 5rem 0; }
        
        /* Navbar */
        nav { position: sticky; top: 0; z-index: 1000; background: rgba(242, 245, 243, 0.9); backdrop-filter: blur(10px); padding: 15px 0; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .nav-container { display: flex; justify-content: space-between; align-items: center; }
        .logo-area { display: flex; align-items: center; gap: 15px; }
        .logo-img { height: 50px; width: auto; object-fit: contain; }
        .school-name { font-weight: 700; font-size: 1.2rem; color: var(--primary); line-height: 1.2; }
        .nav-links { display: flex; gap: 20px; align-items: center; }
        .nav-links a { font-weight: 500; transition: color 0.3s; }
        .nav-links a:hover { color: var(--accent); }
        .mobile-menu-btn { display: none; font-size: 1.5rem; cursor: pointer; color: var(--primary); }
        
        /* Hero */
        .hero { min-height: 85vh; display: flex; align-items: center; position: relative; padding-top: 2rem; }
        .hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; }
        .hero-content h1 { font-size: 3.5rem; line-height: 1.2; color: var(--primary); }
        .hero-content p { font-size: 1.1rem; color: var(--text-dark); margin-bottom: 2rem; }
        .hero-tags { display: flex; gap: 15px; margin-bottom: 2rem; flex-wrap: wrap; }
        .hero-tag { background: var(--mint); color: var(--primary); padding: 5px 15px; border-radius: 20px; font-size: 0.9rem; font-weight: 600; }
        .hero-image-wrap { position: relative; border-radius: var(--border-rad); padding: 15px; background: var(--bg-color); box-shadow: var(--clay-shadow-out); }
        .hero-image-wrap img { width: 100%; border-radius: 12px; object-fit: cover; height: 400px; }
        
        /* Academics & Facilities */
        .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; }
        .icon-box { height: 60px; width: 60px; background: var(--mint); color: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 15px; }
        
        /* Values Timeline */
        .values-list { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
        .value-pill { background: var(--bg-color); box-shadow: var(--clay-shadow-out); padding: 15px 30px; border-radius: 30px; font-weight: 500; display: flex; align-items: center; gap: 10px; }
        .value-pill i { color: var(--accent); }
        
        /* Admission Form */
        .form-container { max-width: 800px; margin: 0 auto; }
        .step-indicator { display: flex; justify-content: center; gap: 15px; margin-bottom: 30px; }
        .step-dot { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--bg-color); box-shadow: var(--clay-shadow-out); font-weight: bold; color: var(--text-light); }
        .step-dot.active { background: var(--primary); color: white; box-shadow: none; }
        .form-step { display: none; animation: fadeIn 0.5s; }
        .form-step.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .full-width { grid-column: 1 / -1; }
        
        /* Gallery */
        .gallery-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; }
        .gallery-item { border-radius: var(--border-rad); overflow: hidden; cursor: pointer; box-shadow: var(--clay-shadow-out); background: var(--bg-color); padding: 10px; }
        .gallery-item img { width: 100%; height: 250px; object-fit: cover; border-radius: 12px; transition: transform 0.3s; }
        .gallery-item:hover img { transform: scale(1.05); }
        
        /* Notices */
        .notice-list { display: flex; flex-direction: column; gap: 15px; }
        .notice-card { border-left: 4px solid var(--accent); padding: 15px 20px; }
        .notice-date { font-size: 0.8rem; color: var(--primary); font-weight: 600; margin-bottom: 5px; }
        
        /* Footer */
        footer { background: var(--primary); color: white; padding: 4rem 0 2rem; border-top-left-radius: 40px; border-top-right-radius: 40px; margin-top: 3rem; }
        .footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 40px; margin-bottom: 2rem; }
        .footer-logo { filter: brightness(0) invert(1); max-width: 150px; margin-bottom: 15px; }
        footer h3 { color: var(--accent); }
        footer a { color: #cbd5e0; transition: color 0.3s; }
        footer a:hover { color: var(--accent); }
        .footer-bottom { text-align: center; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.9rem; color: #a0aec0; }
        
        /* Lightbox */
        .lightbox { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 2000; display: none; align-items: center; justify-content: center; flex-direction: column; }
        .lightbox.active { display: flex; }
        .lightbox img { max-width: 90%; max-height: 80vh; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .lightbox-close { position: absolute; top: 20px; right: 30px; color: white; font-size: 2rem; cursor: pointer; }
        
        /* Alerts */
        .alert { padding: 15px; border-radius: 12px; margin-bottom: 20px; display: none; }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        
        /* Responsive */
        @media (max-width: 768px) {
            .hero-grid { grid-template-columns: 1fr; }
            .hero-content h1 { font-size: 2.5rem; }
            .nav-links { display: none; position: absolute; top: 100%; left: 0; width: 100%; background: rgba(242, 245, 243, 0.95); flex-direction: column; padding: 20px; box-shadow: 0 10px 15px rgba(0,0,0,0.05); }
            .nav-links.active { display: flex; }
            .mobile-menu-btn { display: block; }
            .form-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>

    <!-- Navigation -->
    <nav>
        <div class="container nav-container">
            <div class="logo-area">
                <img src="${SCHOOL_CONFIG.images.vidyaBharatiLogo}" alt="Vidya Bharati Logo" class="logo-img">
                <div class="school-name">
                    SARVHITKARI KESHAV<br>VIDYA NIKETAN
                </div>
            </div>
            <div class="mobile-menu-btn" onclick="document.querySelector('.nav-links').classList.toggle('active')">
                <i class="fas fa-bars"></i>
            </div>
            <ul class="nav-links">
                <li><a href="#home">Home</a></li>
                <li><a href="#about">About School</a></li>
                <li><a href="#academics">Academics</a></li>
                <li><a href="#facilities">Facilities</a></li>
                <li><a href="#admissions">Admissions</a></li>
                <li><a href="#gallery">Gallery</a></li>
                <li><a href="#contact">Contact</a></li>
                <li><button class="clay-btn clay-btn-primary" onclick="document.getElementById('admissions').scrollIntoView()"><i class="fas fa-paper-plane"></i> Apply Now</button></li>
            </ul>
        </div>
    </nav>

    <!-- Hero Section -->
    <section id="home" class="hero">
        <div class="container hero-grid">
            <div class="hero-content">
                <div class="hero-tags">
                    <span class="hero-tag"><i class="fas fa-check-circle"></i> CBSE Affiliated</span>
                    <span class="hero-tag"><i class="fas fa-book"></i> English Medium</span>
                    <span class="hero-tag"><i class="fas fa-graduation-cap"></i> Nursery to Class XII</span>
                </div>
                <h1>A Foundation for Knowledge.<br>A Future Full of Possibilities.</h1>
                <p>Welcome to ${SCHOOL_CONFIG.name}, Jalandhar — nurturing knowledge, character, creativity, and confidence through value-based education guided by Vidya Bharati.</p>
                <div style="display:flex; gap:15px;">
                    <button class="clay-btn clay-btn-primary" onclick="document.getElementById('admissions').scrollIntoView()">Start Admission</button>
                    <button class="clay-btn" onclick="document.getElementById('about').scrollIntoView()">Explore School</button>
                </div>
            </div>
            <div class="hero-image-wrap">
                <img src="${SCHOOL_CONFIG.images.hero}" alt="SKVN School Building Exterior">
            </div>
        </div>
    </section>

    <!-- About Section -->
    <section id="about">
        <div class="container">
            <h2>About Our Institution</h2>
            <div class="grid-3" style="grid-template-columns: 1fr 1fr; align-items: center;">
                <div class="clay-card">
                    <img src="${SCHOOL_CONFIG.images.facade}" alt="School Facade" style="width:100%; border-radius: 12px;">
                </div>
                <div>
                    <h3 style="font-size:1.8rem;">Established in ${SCHOOL_CONFIG.established}</h3>
                    <p>Managed by the Sarv Hitkari Educational Society (Punjab state unit of Vidya Bharati), our co-educational English-medium school is committed to delivering academic excellence alongside Indian cultural values.</p>
                    <p>We emphasize a balanced approach to modern education, character building, discipline, and holistic personality development, preparing students to be responsible citizens and future leaders.</p>
                    
                    <h4 style="margin-top: 20px; color: var(--primary);">Our Core Values</h4>
                    <div class="values-list" style="justify-content: flex-start; margin-top: 15px;">
                        <span class="value-pill"><i class="fas fa-brain"></i> Academic Learning</span>
                        <span class="value-pill"><i class="fas fa-hands-holding-child"></i> Character Building</span>
                        <span class="value-pill"><i class="fas fa-om"></i> Indian Cultural Values</span>
                        <span class="value-pill"><i class="fas fa-palette"></i> Creativity & Curiosity</span>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Academics Section -->
    <section id="academics">
        <div class="container">
            <h2>Academic Stages</h2>
            <p style="text-align:center; max-width:800px; margin: 0 auto 2rem;">We provide a continuous learning journey from early childhood to young adulthood. <em>Note: Class availability and subject combinations should be confirmed with the school office.</em></p>
            <div class="grid-3">
                <div class="clay-card">
                    <div class="icon-box"><i class="fas fa-shapes"></i></div>
                    <h3>Pre-Primary</h3>
                    <p>Nursery and Kindergarten focus on foundational skills, play-way learning, and early socialization in a nurturing environment.</p>
                </div>
                <div class="clay-card">
                    <div class="icon-box"><i class="fas fa-pencil-alt"></i></div>
                    <h3>Primary & Middle</h3>
                    <p>Building strong fundamentals in languages, mathematics, sciences, and arts while encouraging curiosity and independent thinking.</p>
                </div>
                <div class="clay-card">
                    <div class="icon-box"><i class="fas fa-microscope"></i></div>
                    <h3>Secondary & Senior</h3>
                    <p>Rigorous CBSE curriculum preparation focusing on in-depth subject knowledge, practical application, and career readiness.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Facilities Section -->
    <section id="facilities">
        <div class="container">
            <h2>Campus Facilities</h2>
            <div class="grid-3">
                <div class="clay-card"><div class="icon-box"><i class="fas fa-chalkboard-teacher"></i></div><h3>Smart Classrooms</h3><p>Technology-integrated learning spaces for interactive education.</p></div>
                <div class="clay-card"><div class="icon-box"><i class="fas fa-flask"></i></div><h3>Science & IT Labs</h3><p>Well-equipped laboratories for practical scientific and computer learning.</p></div>
                <div class="clay-card"><div class="icon-box"><i class="fas fa-book-reader"></i></div><h3>Library</h3><p>A comprehensive resource center promoting reading habits.</p></div>
                <div class="clay-card"><div class="icon-box"><i class="fas fa-running"></i></div><h3>Sports Facilities</h3><p>Playgrounds and physical education programs for physical fitness.</p></div>
                <div class="clay-card"><div class="icon-box"><i class="fas fa-theater-masks"></i></div><h3>Cultural Activities</h3><p>Dedicated spaces for performing arts and cultural development.</p></div>
                <div class="clay-card"><div class="icon-box"><i class="fas fa-users"></i></div><h3>Personality Dev.</h3><p>Programs focusing on public speaking, discipline, and teamwork.</p></div>
            </div>
        </div>
    </section>

    <!-- Admission Section -->
    <section id="admissions">
        <div class="container form-container">
            <h2>Online Admission Enquiry</h2>
            <div class="clay-card">
                <p style="text-align:center; font-size:0.9rem; margin-bottom:20px;"><strong>Process:</strong> 1. Submit Enquiry &rarr; 2. Get Reference Number &rarr; 3. Wait for Review &rarr; 4. Document Verification at School.<br><em>Submitting this form does not guarantee admission. Admissions are subject to official school approval.</em></p>
                
                <div id="adm-alert" class="alert"></div>

                <div class="step-indicator">
                    <div class="step-dot active" id="dot-1">1</div>
                    <div class="step-dot" id="dot-2">2</div>
                    <div class="step-dot" id="dot-3">3</div>
                </div>

                <form id="admissionForm">
                    <!-- Step 1: Parent -->
                    <div class="form-step active" id="step-1">
                        <h3>Parent/Guardian Details</h3>
                        <div class="form-grid">
                            <input type="text" id="parentName" class="clay-input" placeholder="Parent/Guardian Full Name *" required>
                            <input type="text" id="relation" class="clay-input" placeholder="Relationship to Student *" required>
                            <input type="tel" id="phone" class="clay-input" placeholder="Mobile Number *" required pattern="[0-9]{10}">
                            <input type="email" id="email" class="clay-input" placeholder="Email Address (Optional)">
                        </div>
                        <div style="text-align:right; margin-top:20px;">
                            <button type="button" class="clay-btn clay-btn-primary" onclick="nextStep(1)">Next Step <i class="fas fa-arrow-right"></i></button>
                        </div>
                    </div>

                    <!-- Step 2: Student -->
                    <div class="form-step" id="step-2">
                        <h3>Student Details</h3>
                        <div class="form-grid">
                            <input type="text" id="studentName" class="clay-input" placeholder="Student Full Name *" required>
                            <input type="date" id="dob" class="clay-input" placeholder="Date of Birth *" required>
                            <select id="gender" class="clay-input">
                                <option value="">Select Gender (Optional)</option>
                                <option value="Male">Male</option><option value="Female">Female</option>
                            </select>
                            <select id="appliedClass" class="clay-input" required>
                                <option value="">Class Applied For *</option>
                                <option value="Nursery">Nursery / KG</option>
                                <option value="Primary">Primary (I-V)</option>
                                <option value="Middle">Middle (VI-VIII)</option>
                                <option value="Secondary">Secondary (IX-X)</option>
                                <option value="Senior">Senior Secondary (XI-XII)</option>
                            </select>
                            <input type="text" id="session" class="clay-input" placeholder="Academic Session (e.g. 2026-27) *" required>
                            <input type="text" id="prevSchool" class="clay-input" placeholder="Previous School (Optional)">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:20px;">
                            <button type="button" class="clay-btn" onclick="prevStep(2)"><i class="fas fa-arrow-left"></i> Back</button>
                            <button type="button" class="clay-btn clay-btn-primary" onclick="nextStep(2)">Next Step <i class="fas fa-arrow-right"></i></button>
                        </div>
                    </div>

                    <!-- Step 3: Additional -->
                    <div class="form-step" id="step-3">
                        <h3>Additional Information</h3>
                        <div class="form-grid">
                            <select id="contactMethod" class="clay-input full-width">
                                <option value="Phone">Preferred Contact: Phone</option>
                                <option value="Email">Preferred Contact: Email</option>
                            </select>
                            <textarea id="specialRequests" class="clay-input full-width" rows="3" placeholder="Any questions or special requests? (Optional)"></textarea>
                            <div class="full-width" style="display:flex; gap:10px; align-items:start;">
                                <input type="checkbox" id="consent" required style="margin-top:5px;">
                                <label for="consent" style="font-size:0.9rem; color:var(--text-light);">I confirm that the information provided is accurate and I consent to the school contacting me regarding this enquiry.</label>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:20px;">
                            <button type="button" class="clay-btn" onclick="prevStep(3)"><i class="fas fa-arrow-left"></i> Back</button>
                            <button type="submit" class="clay-btn clay-btn-primary" id="submitAdmBtn"><i class="fas fa-check"></i> Submit Application</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    </section>

    <!-- Gallery & Notices -->
    <section id="gallery">
        <div class="container">
            <div class="grid-3" style="grid-template-columns: 2fr 1fr;">
                <div>
                    <h2>Campus Gallery</h2>
                    <div class="gallery-grid" style="grid-template-columns: 1fr 1fr;">
                        <div class="gallery-item" onclick="openLightbox('${SCHOOL_CONFIG.images.hero}')">
                            <img src="${SCHOOL_CONFIG.images.hero}" alt="School Building">
                            <p style="text-align:center; margin-top:10px; font-weight:600;">School Building</p>
                        </div>
                        <div class="gallery-item" onclick="openLightbox('${SCHOOL_CONFIG.images.campus}')">
                            <img src="${SCHOOL_CONFIG.images.campus}" alt="Campus and Playground">
                            <p style="text-align:center; margin-top:10px; font-weight:600;">Campus & Playground</p>
                        </div>
                    </div>
                </div>
                <div>
                    <h2>Notice Board</h2>
                    <div class="clay-card notice-list" id="noticeContainer">
                        <p style="text-align:center;">Loading notices...</p>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Visitor & Contact -->
    <section id="contact">
        <div class="container">
            <h2>Visitor & Contact Information</h2>
            <div class="grid-3">
                <div class="clay-card">
                    <h3><i class="fas fa-map-marker-alt"></i> Location</h3>
                    <p><strong>${SCHOOL_CONFIG.name}</strong><br>${SCHOOL_CONFIG.address}</p>
                    <h3 style="margin-top:20px;"><i class="fas fa-phone-alt"></i> Contact</h3>
                    <p>Phone: ${SCHOOL_CONFIG.phone}<br>Email: ${SCHOOL_CONFIG.email}</p>
                    <p style="font-size:0.8rem; color:#a0aec0; margin-top:15px;">* Contact details subject to official school confirmation.</p>
                </div>
                
                <div class="clay-card" style="grid-column: span 2;">
                    <h3>Request a Campus Visit</h3>
                    <div id="visit-alert" class="alert"></div>
                    <form id="visitForm">
                        <div class="form-grid">
                            <input type="text" id="vName" class="clay-input" placeholder="Visitor Name *" required>
                            <input type="tel" id="vPhone" class="clay-input" placeholder="Mobile Number *" required>
                            <input type="date" id="vDate" class="clay-input" required>
                            <select id="vTime" class="clay-input" required>
                                <option value="">Preferred Time *</option>
                                <option value="Morning (9 AM - 12 PM)">Morning (9 AM - 12 PM)</option>
                                <option value="Afternoon (12 PM - 3 PM)">Afternoon (12 PM - 3 PM)</option>
                            </select>
                            <input type="number" id="vCount" class="clay-input" placeholder="Number of Visitors" min="1" max="10" value="1">
                            <input type="text" id="vPurpose" class="clay-input" placeholder="Purpose of Visit (Optional)">
                        </div>
                        <button type="submit" class="clay-btn clay-btn-primary" style="margin-top:15px;" id="submitVisitBtn">Submit Request</button>
                        <p style="font-size:0.8rem; margin-top:10px;">* The school office will confirm the final visit timing.</p>
                    </form>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer>
        <div class="container">
            <div class="footer-grid">
                <div>
                    <img src="${SCHOOL_CONFIG.images.vidyaBharatiLogo}" alt="Logo" class="footer-logo">
                    <h3>${SCHOOL_CONFIG.shortName}</h3>
                    <p>A Vidya Bharati affiliated institution focusing on holistic development and academic excellence.</p>
                </div>
                <div>
                    <h3>Quick Links</h3>
                    <ul>
                        <li><a href="#about">About Us</a></li>
                        <li><a href="#academics">Academic Stages</a></li>
                        <li><a href="#admissions">Admissions Enquiry</a></li>
                        <li><a href="#gallery">Campus Gallery</a></li>
                        <li><a href="/admin">Admin Portal</a></li>
                    </ul>
                </div>
                <div>
                    <h3>Contact Us</h3>
                    <p><i class="fas fa-map-marker-alt"></i> ${SCHOOL_CONFIG.address}</p>
                    <p><i class="fas fa-phone"></i> ${SCHOOL_CONFIG.phone}</p>
                </div>
            </div>
            <div class="footer-bottom">
                &copy; <span id="year"></span> ${SCHOOL_CONFIG.name}. All rights reserved.<br>
                Admissions and visit approvals are strictly subject to official school rules and confirmation.
            </div>
        </div>
    </footer>

    <!-- Lightbox -->
    <div class="lightbox" id="lightbox" onclick="closeLightbox()">
        <span class="lightbox-close">&times;</span>
        <img id="lightbox-img" src="" alt="Enlarged view">
    </div>

    <!-- JavaScript -->
    <script>
        document.getElementById('year').textContent = new Date().getFullYear();

        // Multistep Form Logic
        function nextStep(current) {
            const form = document.getElementById('admissionForm');
            if(!form.checkValidity()) { form.reportValidity(); return; }
            document.getElementById('step-' + current).classList.remove('active');
            document.getElementById('dot-' + current).classList.remove('active');
            document.getElementById('step-' + (current + 1)).classList.add('active');
            document.getElementById('dot-' + (current + 1)).classList.add('active');
        }
        function prevStep(current) {
            document.getElementById('step-' + current).classList.remove('active');
            document.getElementById('dot-' + current).classList.remove('active');
            document.getElementById('step-' + (current - 1)).classList.add('active');
            document.getElementById('dot-' + (current - 1)).classList.add('active');
        }

        function showAlert(id, type, msg) {
            const el = document.getElementById(id);
            el.className = 'alert alert-' + type;
            el.innerHTML = msg;
            el.style.display = 'block';
            setTimeout(() => el.style.display = 'none', 10000);
        }

        // Form Submissions
        document.getElementById('admissionForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submitAdmBtn'); btn.disabled = true; btn.innerHTML = 'Submitting...';
            const data = {
                parentName: document.getElementById('parentName').value,
                relation: document.getElementById('relation').value,
                phone: document.getElementById('phone').value,
                email: document.getElementById('email').value,
                studentName: document.getElementById('studentName').value,
                dob: document.getElementById('dob').value,
                gender: document.getElementById('gender').value,
                appliedClass: document.getElementById('appliedClass').value,
                session: document.getElementById('session').value,
                prevSchool: document.getElementById('prevSchool').value,
                contactMethod: document.getElementById('contactMethod').value,
                specialRequests: document.getElementById('specialRequests').value
            };
            try {
                const res = await fetch('/api/admissions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
                const json = await res.json();
                if(json.success) {
                    showAlert('adm-alert', 'success', 'Enquiry Submitted! Reference: <strong>' + json.reference + '</strong>. Keep this safe.');
                    e.target.reset(); prevStep(3); prevStep(2); // reset to step 1
                } else throw new Error(json.error);
            } catch (err) { showAlert('adm-alert', 'error', 'Error: ' + err.message); }
            finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Submit Application'; }
        });

        document.getElementById('visitForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submitVisitBtn'); btn.disabled = true; btn.innerText = 'Submitting...';
            const data = {
                name: document.getElementById('vName').value, phone: document.getElementById('vPhone').value,
                date: document.getElementById('vDate').value, timeRange: document.getElementById('vTime').value,
                visitors: document.getElementById('vCount').value, purpose: document.getElementById('vPurpose').value
            };
            try {
                const res = await fetch('/api/visits', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
                const json = await res.json();
                if(json.success) {
                    showAlert('visit-alert', 'success', 'Request Sent! Ref: <strong>' + json.reference + '</strong>.');
                    e.target.reset();
                } else throw new Error(json.error);
            } catch (err) { showAlert('visit-alert', 'error', 'Error: ' + err.message); }
            finally { btn.disabled = false; btn.innerText = 'Submit Request'; }
        });

        // Load Notices
        async function loadNotices() {
            try {
                const res = await fetch('/api/notices');
                const notices = await res.json();
                const container = document.getElementById('noticeContainer');
                if(!notices.length) { container.innerHTML = '<p>No recent notices.</p>'; return; }
                container.innerHTML = notices.map(n => 
                    '<div class="notice-card clay-card" style="padding:15px;">' +
                    '<div class="notice-date">' + new Date(n.createdAt).toLocaleDateString() + ' | ' + n.category + '</div>' +
                    '<h4>' + n.title + '</h4><p style="margin:0; font-size:0.9rem;">' + n.description + '</p></div>'
                ).join('');
            } catch (err) { console.error(err); }
        }
        loadNotices();

        // Lightbox
        function openLightbox(src) {
            document.getElementById('lightbox-img').src = src;
            document.getElementById('lightbox').classList.add('active');
        }
        function closeLightbox() { document.getElementById('lightbox').classList.remove('active'); }
    </script>
</body>
</html>
    `;
    res.send(html);
});

// For local development execution
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Export for Vercel serverless
module.exports = app;
