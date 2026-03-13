# Zamtel TDR Field Monitor PWA

**Create your World** - A Progressive Web App for Trade Development Representatives

![Zamtel Colors](https://img.shields.io/badge/Zamtel-00A651-green) ![Version](https://img.shields.io/badge/version-1.0.0-blue) ![PWA](https://img.shields.io/badge/PWA-Ready-orange)

---

## 📱 Overview

The **Zamtel TDR Field Monitor** is a mobile-first Progressive Web App (PWA) designed to help Trade Development Representatives track outlet visits, monitor float status, and manage field operations efficiently. The app works on both **Android** and **iOS** devices and can be installed directly from the browser without requiring app store downloads.

### Key Features

✅ **Multi-Platform Support**: Works on Android and iOS  
✅ **GPS Location Tracking**: Automatically captures outlet coordinates  
✅ **Float Status Monitoring**: RED (Critical), YELLOW (Low), GREEN (OK) indicators  
✅ **Dashboard Analytics**: Visual charts and progress tracking  
✅ **Leaderboard**: Compare performance with other TDRs  
✅ **Offline Capability**: Works without internet connection  
✅ **Google Sheets Integration**: Backend data storage and reporting  
✅ **Easy Deployment**: Install with one click, no app store required  

---

## 🎨 Branding

- **Colors**: 
  - Zamtel Green: `#00A651`
  - Zamtel Pink: `#E91E8C`
  - White: `#FFFFFF`
- **Slogan**: *"Create your World"*

---

## 🚀 Quick Start

### For TDRs (Field Users)

#### **Installing on Android:**

1. Open Chrome browser on your Android device
2. Navigate to the app URL: `https://your-deployment-url.com`
3. Tap the **menu icon** (three dots) in the top right
4. Select **"Add to Home Screen"** or **"Install App"**
5. Confirm installation
6. The app icon will appear on your home screen

#### **Installing on iPhone (iOS):**

1. Open Safari browser on your iPhone
2. Navigate to the app URL: `https://your-deployment-url.com`
3. Tap the **Share button** (square with arrow pointing up)
4. Scroll down and tap **"Add to Home Screen"**
5. Name the app "Zamtel TDR" and tap **Add**
6. The app icon will appear on your home screen

#### **First Time Login:**

1. Open the installed app
2. Select your **TDR Name** from the dropdown
3. Select your **Zone**
4. Tap **Login**

---

## 📋 Features Guide

### 1. **Dashboard Screen**

- View total outlets visited
- Monitor monthly target progress
- See float status breakdown (Critical/Low/OK)
- View weekly activity charts

### 2. **New Visit Form**

- **Capture GPS Location**: Tap "Get GPS Location" to capture coordinates
- Fill in all required fields:
  - ZBM Name
  - Outlet Name
  - Contact Number (Zambian format: 09XXXXXXXX or 07XXXXXXXX)
  - Agent Code
  - Town
  - Cluster Name
  - Market Name
  - Float Amount (in ZMW)
  - Has Float (Yes/No)
- Tap **Save Visit** to record

### 3. **Visits List**

- View all recorded visits
- Filter by float status or zone
- See color-coded float indicators:
  - 🔴 **RED**: Critical (Below K500)
  - 🟡 **YELLOW**: Low (K500-K999)
  - 🟢 **GREEN**: OK (K1000+)
- Click location link to view on Google Maps

### 4. **Leaderboard**

- View top-performing TDRs
- See visit counts and target progress
- Compare your performance

### 5. **Reports**

- Export data to CSV
- View zone performance charts
- See monthly trends
- Access summary statistics

### 6. **Settings**

- Configure Google Sheets sync
- Set monthly target
- Adjust float thresholds
- Manage local data

---

## 🔧 Technical Setup

### For Administrators

#### **Deployment Options:**

1. **GitHub Pages** (Free, Recommended)
   - Fork this repository
   - Enable GitHub Pages in Settings
   - App will be available at: `https://username.github.io/zamtel-tdr/`

2. **Netlify** (Free, Drag-and-Drop)
   - Sign up at [netlify.com](https://netlify.com)
   - Drag the project folder to Netlify
   - Get instant deployment URL

3. **Vercel** (Free, Fast)
   - Sign up at [vercel.com](https://vercel.com)
   - Import from Git or upload files
   - Deploy with one click

4. **Firebase Hosting** (Free)
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init hosting
   firebase deploy
   ```

#### **Google Sheets Backend Setup:**

1. **Create Google Sheet:**
   - Go to [Google Sheets](https://sheets.google.com)
   - Create a new spreadsheet named "Zamtel TDR Data"
   - Create headers in Row 1:
     ```
     TDR Name | Zone | ZBM Name | Date | Outlet Name | Contact | Agent Code | Town | Cluster | Market | Float Amount | Has Float | Float Status | Latitude | Longitude
     ```

2. **Create Google Form (Optional but Recommended):**
   - Go to [Google Forms](https://forms.google.com)
   - Create a form with all the fields listed above
   - Link form to the Google Sheet
   - Note the form submission URL

3. **Setup Apps Script (For Automatic Sync):**
   
   a. In your Google Sheet, go to **Extensions > Apps Script**
   
   b. Delete any existing code and paste:

   ```javascript
   function doPost(e) {
     try {
       const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
       const data = JSON.parse(e.postData.contents);
       
       // Append data to sheet
       sheet.appendRow([
         data.tdrName,
         data.zone,
         data.zbmName,
         data.date,
         data.outletName,
         data.contactNumber,
         data.agentCode,
         data.town,
         data.clusterName,
         data.marketName,
         data.floatAmount,
         data.hasFloat,
         data.floatStatus,
         data.latitude,
         data.longitude
       ]);
       
       return ContentService.createTextOutput(JSON.stringify({
         'status': 'success',
         'message': 'Data saved successfully'
       })).setMimeType(ContentService.MimeType.JSON);
       
     } catch (error) {
       return ContentService.createTextOutput(JSON.stringify({
         'status': 'error',
         'message': error.toString()
       })).setMimeType(ContentService.MimeType.JSON);
     }
   }
   
   function doGet(e) {
     const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
     const data = sheet.getDataRange().getValues();
     
     return ContentService.createTextOutput(JSON.stringify(data))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```

   c. Click **Deploy > New Deployment**
   
   d. Select **Web App**
   
   e. Settings:
      - Execute as: **Me**
      - Who has access: **Anyone**
   
   f. Click **Deploy** and copy the **Web App URL**

4. **Connect App to Google Sheets:**
   
   In `index.html`, find the `submitToGoogleSheets` function and update:

   ```javascript
   function submitToGoogleSheets(visit) {
       const url = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';
       
       fetch(url, {
           method: 'POST',
           mode: 'no-cors',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
               ...visit,
               floatStatus: getFloatLabel(getFloatStatus(visit.floatAmount))
           })
       });
   }
   ```

---

## 📊 Data Fields Collected

| Field | Type | Description |
|-------|------|-------------|
| TDR Name | Text | Name of the representative |
| Zone | Text | Zone assignment |
| ZBM Name | Text | Zone Business Manager name |
| Date | DateTime | Visit timestamp |
| Outlet Name | Text | Name of the outlet visited |
| Contact Number | Phone | Zambian format (09/07 + 8 digits) |
| Agent Code | Text | Unique agent identifier |
| Town | Text | Town location |
| Cluster Name | Text | Cluster classification |
| Market Name | Text | Market location |
| Float Amount | Number | Current float in ZMW |
| Has Float | Yes/No | Float availability |
| Float Status | Text | RED/YELLOW/GREEN |
| Latitude | Number | GPS latitude |
| Longitude | Number | GPS longitude |

---

## 🎯 Float Status Thresholds

Default thresholds (customizable in Settings):

- 🔴 **CRITICAL (RED)**: Below K500
- 🟡 **LOW (YELLOW)**: K500 - K999
- 🟢 **OK (GREEN)**: K1000 and above

---

## 📈 Reports & Analytics

### Available Reports:

1. **Dashboard Charts**
   - Float status pie chart
   - Weekly visit bar chart

2. **Reports Screen**
   - Zone performance comparison
   - 30-day trend analysis
   - Summary statistics

3. **Leaderboard**
   - TDR rankings by visits
   - Target completion percentage

4. **Export Options**
   - CSV download
   - Google Sheets view
   - Excel-compatible format

---

## 🔐 Security & Privacy

- All data stored locally on device using `localStorage`
- GPS coordinates only captured with user permission
- Google Sheets data encrypted in transit (HTTPS)
- No personal data shared without consent
- Offline-first architecture for data protection

---

## 🛠️ Troubleshooting

### GPS Not Working:

1. **Check Browser Permissions**:
   - Android Chrome: Settings > Site Settings > Location > Allow
   - iPhone Safari: Settings > Safari > Location > Allow

2. **Enable Device Location**:
   - Android: Settings > Location > On
   - iPhone: Settings > Privacy > Location Services > On

3. **Clear Browser Cache**:
   - Android Chrome: Settings > Privacy > Clear browsing data
   - iPhone Safari: Settings > Safari > Clear History and Website Data

### App Not Installing:

1. **Use Correct Browser**:
   - Android: Chrome or Edge (not Firefox)
   - iPhone: Safari (not Chrome)

2. **Check Internet Connection**: Initial install requires internet

3. **Update Browser**: Ensure latest version of browser

### Data Not Syncing to Google Sheets:

1. Verify Apps Script deployment URL is correct
2. Check Apps Script execution permissions
3. Ensure "Anyone" access is enabled
4. Test the URL directly in browser

### Offline Mode Issues:

1. Visit the app while online first (to cache files)
2. Check service worker registration in browser console
3. Clear cache and reload if issues persist

---

## 📱 App Screens

### 1. Login Screen
- TDR name selection
- Zone selection
- Zamtel branding

### 2. Dashboard
- Visit statistics
- Target progress bar
- Float status charts
- Weekly activity

### 3. New Visit Form
- GPS capture button
- All data fields
- Validation for phone numbers
- Submit confirmation

### 4. Visits List
- All recorded visits
- Filter options
- Color-coded status
- Map links

### 5. Leaderboard
- Top performer rankings
- Visit counts
- Target percentages
- Zone information

### 6. Reports
- Export functionality
- Visual charts
- Statistics summary

### 7. Settings
- Google Sheets URL
- Monthly target
- Float thresholds
- Data management

---

## 🌐 Browser Support

| Browser | Android | iOS | Desktop |
|---------|---------|-----|---------|
| Chrome | ✅ | ❌ | ✅ |
| Safari | ❌ | ✅ | ✅ |
| Edge | ✅ | ❌ | ✅ |
| Firefox | ⚠️ | ⚠️ | ✅ |

✅ Fully Supported | ⚠️ Partial Support | ❌ Not Supported

---

## 📦 Project Structure

```
zamtel-tdr-monitor/
├── index.html              # Main app file (single-page PWA)
├── manifest.json           # PWA manifest for installability
├── service-worker.js       # Offline functionality
├── icon-192.png           # App icon (192x192)
├── icon-512.png           # App icon (512x512)
├── icon-192.svg           # Source SVG icon
├── icon-512.svg           # Source SVG icon
├── generate-icons.html    # Icon generator utility
└── README.md              # This file
```

---

## 🔄 Updates & Maintenance

### Updating the App:

1. Make changes to `index.html`
2. Update cache version in `service-worker.js`:
   ```javascript
   const CACHE_NAME = 'zamtel-tdr-v2'; // Increment version
   ```
3. Redeploy to hosting platform
4. Users will automatically get updates on next visit

### Adding New TDRs:

Edit the TDR dropdown in `index.html`:

```html
<select id="tdrName" required>
    <option value="">Select your name</option>
    <option value="John Mwanza">John Mwanza</option>
    <option value="Mary Banda">Mary Banda</option>
    <!-- Add new TDRs here -->
    <option value="New TDR Name">New TDR Name</option>
</select>
```

### Adding New Zones:

Edit the Zone dropdown in `index.html`:

```html
<select id="loginZone" required>
    <option value="">Select zone</option>
    <option value="Lusaka Central">Lusaka Central</option>
    <!-- Add new zones here -->
    <option value="New Zone">New Zone</option>
</select>
```

---

## 📞 Support & Contact

**Email**: zamtel.sd@gmail.com

**For Technical Issues**:
1. Check the Troubleshooting section above
2. Clear browser cache and try again
3. Email support with screenshots and error messages

**For Feature Requests**:
- Email your suggestions to zamtel.sd@gmail.com
- Include detailed descriptions and use cases

---

## 🎓 Training Resources

### For New TDRs:

1. **Installation Video** (to be created)
2. **User Guide PDF** (to be created)
3. **Quick Reference Card** (to be created)

### Training Checklist:

- [ ] Install app on device
- [ ] Complete login process
- [ ] Record first test visit with GPS
- [ ] View visit on map
- [ ] Check dashboard statistics
- [ ] View leaderboard
- [ ] Export CSV report
- [ ] Configure settings

---

## 📊 Sample Data

The app includes sample data for demonstration:
- 3 sample visits
- Multiple TDRs with different zones
- Various float statuses
- Complete field data

To clear sample data:
1. Go to **Settings**
2. Scroll to **Data Management**
3. Tap **Clear All Local Data**

---

## ✨ Features Coming Soon

- [ ] Photo capture for outlets
- [ ] Voice notes recording
- [ ] Signature capture
- [ ] Barcode scanning
- [ ] Push notifications
- [ ] Advanced analytics
- [ ] Team messaging
- [ ] Route optimization

---

## 🏆 Best Practices

### For TDRs:

1. **Always capture GPS** before filling the form
2. **Enable location services** on your device
3. **Sync data daily** when internet is available
4. **Double-check contact numbers** for accuracy
5. **Update float amounts** accurately
6. **Visit outlets systematically** by cluster

### For Managers:

1. **Review Google Sheet daily** for new entries
2. **Monitor leaderboard** for performance trends
3. **Set realistic targets** based on zone capacity
4. **Provide feedback** to low performers
5. **Celebrate top performers** publicly
6. **Export reports weekly** for analysis

---

## 📄 License

© 2024 Zamtel. All rights reserved.

This application is proprietary software developed for Zamtel Trade Development Representatives.

---

## 🙏 Acknowledgments

- Zamtel team for requirements and testing
- TDRs for field feedback
- Chart.js for data visualization
- Font Awesome for icons

---

## 📝 Changelog

### Version 1.0.0 (Initial Release)
- ✅ Progressive Web App architecture
- ✅ Android & iOS installation support
- ✅ GPS location tracking
- ✅ Float status monitoring (RED/YELLOW/GREEN)
- ✅ Dashboard with charts
- ✅ Leaderboard functionality
- ✅ Google Sheets integration
- ✅ Offline mode support
- ✅ CSV export
- ✅ Zamtel branding and colors
- ✅ Mobile-first responsive design
- ✅ 7 complete screens/tabs
- ✅ Sample data for testing

---

**Create your World** 🌍 | *Powered by Zamtel*
