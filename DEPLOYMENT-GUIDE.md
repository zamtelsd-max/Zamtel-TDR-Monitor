# 🚀 DEPLOYMENT GUIDE

## Zamtel TDR Field Monitor PWA

**Quick deployment guide for hosting the application online**

---

## 📦 PRE-DEPLOYMENT CHECKLIST

Before deploying, ensure you have:

- [ ] Google Apps Script Web App URL (from Google Sheets setup)
- [ ] Updated `index.html` with your Web App URL
- [ ] All files ready (index.html, manifest.json, service-worker.js, icons)
- [ ] Tested locally in browser
- [ ] Domain name (optional but recommended)

---

## 🌐 DEPLOYMENT OPTIONS

Choose one of these hosting platforms (all are FREE):

### Option 1: GitHub Pages (Recommended) ⭐

**Best for**: Version control, easy updates, professional setup

**Steps:**

1. **Create GitHub Account**: [github.com/signup](https://github.com/signup)

2. **Create New Repository**:
   - Click "+" → "New repository"
   - Name: `zamtel-tdr-monitor`
   - Public repository
   - Click "Create repository"

3. **Upload Files**:
   - Click "Upload files"
   - Drag all files:
     - index.html
     - manifest.json
     - service-worker.js
     - icon-192.png
     - icon-512.png
   - Commit changes

4. **Enable GitHub Pages**:
   - Go to repository Settings
   - Scroll to "Pages" section
   - Source: Deploy from branch → `main`
   - Click "Save"

5. **Your App URL**:
   ```
   https://YOUR-USERNAME.github.io/zamtel-tdr-monitor/
   ```

6. **Custom Domain** (Optional):
   - Buy domain (e.g., zamteltdr.com)
   - Add CNAME record pointing to `YOUR-USERNAME.github.io`
   - Add custom domain in GitHub Pages settings

**Pros:**
- ✅ Free forever
- ✅ SSL certificate included (HTTPS)
- ✅ Easy to update (just commit changes)
- ✅ Version control

**Cons:**
- ⚠️ Public repository (anyone can see code)

---

### Option 2: Netlify (Easiest) 🌟

**Best for**: Drag-and-drop simplicity, instant deployment

**Steps:**

1. **Sign Up**: [netlify.com](https://www.netlify.com/) (free account)

2. **Deploy**:
   - Click "Add new site" → "Deploy manually"
   - Drag project folder to upload area
   - Wait 30 seconds

3. **Your App URL**:
   ```
   https://random-name-12345.netlify.app
   ```

4. **Custom Domain** (Optional):
   - Click "Domain settings"
   - Add custom domain
   - Follow DNS instructions

**Pros:**
- ✅ Fastest deployment (drag & drop)
- ✅ Free SSL certificate (HTTPS)
- ✅ Can use custom domain
- ✅ Automatic HTTPS redirect

**Cons:**
- ⚠️ Random URL unless you buy domain

---

### Option 3: Vercel ⚡

**Best for**: Fast performance, professional developers

**Steps:**

1. **Sign Up**: [vercel.com](https://vercel.com/) (free account)

2. **Deploy**:
   - Click "Add New" → "Project"
   - Upload files or import from GitHub
   - Click "Deploy"

3. **Your App URL**:
   ```
   https://zamtel-tdr-monitor.vercel.app
   ```

**Pros:**
- ✅ Super fast CDN
- ✅ Free SSL certificate (HTTPS)
- ✅ Great performance
- ✅ Custom domains supported

**Cons:**
- ⚠️ Slightly more technical

---

### Option 4: Firebase Hosting 🔥

**Best for**: Google ecosystem integration, scalability

**Steps:**

1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   ```

2. **Login**:
   ```bash
   firebase login
   ```

3. **Initialize**:
   ```bash
   firebase init hosting
   ```
   - Select: Use existing project or create new
   - Public directory: `.` (current directory)
   - Single-page app: No
   - GitHub auto-deploys: No

4. **Deploy**:
   ```bash
   firebase deploy
   ```

5. **Your App URL**:
   ```
   https://YOUR-PROJECT.web.app
   ```

**Pros:**
- ✅ Google Cloud infrastructure
- ✅ Free SSL certificate (HTTPS)
- ✅ Custom domains supported
- ✅ Good for scaling

**Cons:**
- ⚠️ Requires command line
- ⚠️ More technical setup

---

## 🔧 POST-DEPLOYMENT SETUP

### 1. Update Web App URL

In `index.html`, find and update (around line 2100):

```javascript
function submitToGoogleSheets(visit) {
    const url = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
    // Rest of the code...
}
```

Replace `YOUR_GOOGLE_APPS_SCRIPT_URL_HERE` with your actual Google Apps Script Web App URL.

---

### 2. Test the Deployment

1. **Open your app URL** in Chrome/Safari
2. **Test Login**: Select TDR name and zone
3. **Test GPS**: Click "Get GPS Location"
4. **Test Form**: Fill and submit a test visit
5. **Check Google Sheet**: Verify data appears

---

### 3. Enable HTTPS (if not automatic)

Most platforms enable HTTPS automatically. If not:

1. Get SSL certificate (free from Let's Encrypt)
2. Configure in hosting settings
3. Force HTTPS redirect

**Why HTTPS?**
- Required for GPS location access
- Required for PWA installation
- Better security

---

### 4. Configure Custom Domain (Optional)

**Buy Domain**: From Namecheap, GoDaddy, etc. (~$10/year)

**DNS Setup** (example for GitHub Pages):

```
Type: CNAME
Name: www
Value: YOUR-USERNAME.github.io

Type: A
Name: @
Value: 185.199.108.153
Value: 185.199.109.153
Value: 185.199.110.153
Value: 185.199.111.153
```

**Wait 24-48 hours** for DNS propagation.

---

## 📱 DISTRIBUTE TO TDRs

### Method 1: QR Code (Easiest)

1. **Generate QR Code**: Use [qr-code-generator.com](https://www.qr-code-generator.com/)
2. **Input your app URL**
3. **Download QR code image**
4. **Print and distribute** to TDRs
5. TDRs scan with phone camera → opens app → install

---

### Method 2: Short URL

1. **Create Short URL**: Use [bit.ly](https://bitly.com/)
   - Long URL: `https://your-app-url.com`
   - Short URL: `bit.ly/zamtel-tdr`
2. **Easy to type** and remember
3. Share via SMS/WhatsApp

---

### Method 3: SMS Blast

Send SMS to all TDRs:

```
Zamtel TDR App is ready!

Install now: bit.ly/zamtel-tdr

Instructions:
1. Open link in Chrome (Android) or Safari (iPhone)
2. Add to Home Screen
3. Login with your name

Support: zamtel.sd@gmail.com
```

---

### Method 4: WhatsApp Group

1. Create TDR WhatsApp group
2. Share app link with installation video
3. Pin message to top
4. Provide support in group

---

## 🔄 UPDATING THE APP

### GitHub Pages:
```bash
git add .
git commit -m "Update description"
git push
```

### Netlify:
- Drag updated files to Netlify deploy area
- Or connect GitHub for auto-deploy

### Vercel:
- Push to GitHub (if connected)
- Or use Vercel CLI: `vercel --prod`

### Firebase:
```bash
firebase deploy
```

**Important**: Update service worker cache version:

```javascript
const CACHE_NAME = 'zamtel-tdr-v2'; // Increment version number
```

---

## 📊 MONITORING & ANALYTICS

### Add Google Analytics (Optional)

In `index.html`, before `</head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

**Track:**
- Daily active users
- Page views
- Visit submissions
- GPS usage
- Export downloads

---

## 🐛 TROUBLESHOOTING DEPLOYMENT

### Problem: App doesn't load

**Check:**
- HTTPS is enabled
- All files uploaded correctly
- No JavaScript errors (F12 console)
- Service worker registered

---

### Problem: GPS not working

**Reason**: HTTP doesn't support geolocation

**Solution**: Ensure HTTPS is enabled

---

### Problem: Can't install as PWA

**Check:**
- manifest.json is accessible
- Service worker is registered
- HTTPS is enabled
- Icons are loading

---

### Problem: Data not syncing to Google Sheets

**Check:**
- Google Apps Script URL is correct
- Apps Script is deployed as "Anyone" access
- No CORS errors in console
- Test Apps Script URL directly in browser

---

## 📋 FINAL CHECKLIST

### Before Going Live:

- [ ] Google Sheets backend is set up
- [ ] Apps Script Web App URL is updated in code
- [ ] All files are uploaded to hosting
- [ ] HTTPS is enabled
- [ ] App loads correctly in browser
- [ ] GPS location works
- [ ] Form submission saves to Google Sheets
- [ ] PWA installs on Android test device
- [ ] PWA installs on iPhone test device
- [ ] Icons display correctly
- [ ] Charts render properly
- [ ] Export CSV works
- [ ] Offline mode works

### After Going Live:

- [ ] Share URL with pilot group (5 TDRs)
- [ ] Monitor for 1 week
- [ ] Collect feedback
- [ ] Fix any issues
- [ ] Full rollout to all TDRs
- [ ] Provide training
- [ ] Set up support channel
- [ ] Monitor daily usage

---

## 🎯 RECOMMENDED DEPLOYMENT STRATEGY

**Week 1**: Deploy to staging environment
- Test with 3-5 TDRs
- Collect feedback
- Fix bugs

**Week 2**: Deploy to production
- Share with all TDRs
- Provide training sessions
- Monitor closely

**Week 3**: Optimize
- Based on usage data
- Fix reported issues
- Improve user experience

**Week 4**: Scale
- Full adoption
- Generate first reports
- Celebrate success

---

## 📞 DEPLOYMENT SUPPORT

**Technical Issues**: zamtel.sd@gmail.com

**Platform Support**:
- GitHub Pages: [docs.github.com/pages](https://docs.github.com/pages)
- Netlify: [docs.netlify.com](https://docs.netlify.com)
- Vercel: [vercel.com/docs](https://vercel.com/docs)
- Firebase: [firebase.google.com/docs](https://firebase.google.com/docs)

---

## 📝 DEPLOYMENT LOG

**Deployed By**: ___________________

**Date**: ___________________

**Platform**: ___________________

**Production URL**: ___________________

**Google Sheets URL**: ___________________

**Apps Script URL**: ___________________

**Short URL**: ___________________

**QR Code**: [ ] Generated and distributed

**TDRs Notified**: [ ] Yes, via ___________________

**Training Scheduled**: [ ] Yes, date: ___________________

---

**Zamtel TDR Field Monitor - Deployment Guide v1.0.0**  
**Create your World** 🌍
