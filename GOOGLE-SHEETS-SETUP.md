# 📊 GOOGLE SHEETS BACKEND SETUP GUIDE

## For System Administrators

---

## 📋 OVERVIEW

This guide explains how to set up Google Sheets as the backend database for the Zamtel TDR Field Monitor app. This allows:

- ✅ Automatic data collection from all TDRs
- ✅ Real-time reporting and analytics
- ✅ Excel-compatible data format
- ✅ Free, no server costs
- ✅ Easy sharing with management

---

## 🚀 STEP-BY-STEP SETUP

### STEP 1: Create Google Sheet

1. **Go to**: [https://sheets.google.com](https://sheets.google.com)
2. **Sign in** with: `zamtel.sd@gmail.com`
3. **Click**: "+ Blank" to create new spreadsheet
4. **Rename** to: "Zamtel TDR Field Data"

---

### STEP 2: Setup Sheet Headers

In **Row 1**, add these column headers (exactly as shown):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TDR Name | Zone | ZBM Name | Date | Outlet Name | Contact Number | Agent Code | Town | Cluster Name | Market Name | Float Amount | Has Float | Float Status | Latitude | Longitude |

**Tips:**
- Bold Row 1 for headers
- Apply freeze: View → Freeze → 1 row
- Auto-resize columns: Select all → Format → Resize columns → Fit to data

---

### STEP 3: Format Columns

1. **Select Column D (Date)**:
   - Format → Number → Date time

2. **Select Column F (Contact Number)**:
   - Format → Number → Plain text

3. **Select Column K (Float Amount)**:
   - Format → Number → Currency (ZMW)

4. **Select Column M (Float Status)**:
   - Use conditional formatting (see below)

---

### STEP 4: Add Conditional Formatting for Float Status

1. **Select Column M** (Float Status)
2. **Format → Conditional formatting**
3. **Add three rules**:

**Rule 1 - RED (Critical):**
- Format cells if: Text contains → `CRITICAL`
- Background color: Red `#dc2626`
- Text color: White

**Rule 2 - YELLOW (Low):**
- Format cells if: Text contains → `LOW`
- Background color: Yellow `#fbbf24`
- Text color: Dark gray

**Rule 3 - GREEN (OK):**
- Format cells if: Text contains → `OK`
- Background color: Green `#00A651`
- Text color: White

**Click "Done"**

---

### STEP 5: Create Apps Script for API

1. **In your Google Sheet**: Extensions → Apps Script
2. **Delete** existing code
3. **Paste** this code:

```javascript
// Zamtel TDR Data Collection API
// Version 1.0.0

function doPost(e) {
  try {
    // Get the active sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Parse incoming data
    const data = JSON.parse(e.postData.contents);
    
    // Validate required fields
    if (!data.tdrName || !data.outletName) {
      return createResponse('error', 'Missing required fields');
    }
    
    // Format date
    const dateObj = new Date(data.date);
    const formattedDate = Utilities.formatDate(
      dateObj, 
      Session.getScriptTimeZone(), 
      'yyyy-MM-dd HH:mm:ss'
    );
    
    // Determine float status
    const floatAmount = parseFloat(data.floatAmount) || 0;
    let floatStatus = 'OK';
    if (floatAmount < 500) {
      floatStatus = 'CRITICAL';
    } else if (floatAmount < 1000) {
      floatStatus = 'LOW';
    }
    
    // Append row to sheet
    sheet.appendRow([
      data.tdrName,
      data.zone,
      data.zbmName,
      formattedDate,
      data.outletName,
      data.contactNumber,
      data.agentCode,
      data.town,
      data.clusterName,
      data.marketName,
      floatAmount,
      data.hasFloat,
      floatStatus,
      data.latitude,
      data.longitude
    ]);
    
    // Log success
    Logger.log('Data saved: ' + data.outletName);
    
    return createResponse('success', 'Visit recorded successfully');
    
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return createResponse('error', error.toString());
  }
}

function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    // Convert to JSON array
    const headers = data[0];
    const rows = data.slice(1);
    
    const jsonData = rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
    
    return createResponse('success', 'Data retrieved', jsonData);
    
  } catch (error) {
    return createResponse('error', error.toString());
  }
}

function createResponse(status, message, data) {
  const response = {
    status: status,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  if (data) {
    response.data = data;
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// Test function (run manually to test)
function testInsert() {
  const testData = {
    tdrName: 'Test TDR',
    zone: 'Test Zone',
    zbmName: 'Test ZBM',
    date: new Date().toISOString(),
    outletName: 'Test Outlet',
    contactNumber: '0977000000',
    agentCode: 'TEST001',
    town: 'Lusaka',
    clusterName: 'Test Cluster',
    marketName: 'Test Market',
    floatAmount: 1500,
    hasFloat: 'Yes',
    latitude: '-15.4167',
    longitude: '28.2833'
  };
  
  const e = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(e);
  Logger.log(result.getContent());
}
```

4. **Click Save** (disk icon)
5. **Name the project**: "Zamtel TDR API"

---

### STEP 6: Deploy as Web App

1. **Click "Deploy"** → "New deployment"
2. **Click gear icon** ⚙️ → "Web app"
3. **Fill in details**:
   - Description: `Zamtel TDR Data Collection API v1`
   - Execute as: **Me (zamtel.sd@gmail.com)**
   - Who has access: **Anyone**
4. **Click "Deploy"**
5. **Authorize** the script:
   - Click "Authorize access"
   - Choose your Google account
   - Click "Advanced" → "Go to Zamtel TDR API (unsafe)"
   - Click "Allow"
6. **Copy the Web App URL**:
   - It looks like: `https://script.google.com/macros/s/ABC123.../exec`
   - **SAVE THIS URL** - you'll need it for the app

---

### STEP 7: Test the API

1. **In Apps Script**: Run → Run function → `testInsert`
2. **Check your Google Sheet**: Should see a test row added
3. **If successful**: You'll see "Execution completed" with no errors

**Test via Browser:**
- Open the Web App URL in browser
- You should see JSON response with all data

---

### STEP 8: Connect App to Google Sheets

1. **Open** your `index.html` file
2. **Find** the `submitToGoogleSheets` function (around line 2100)
3. **Replace** the URL:

```javascript
function submitToGoogleSheets(visit) {
    const url = 'YOUR_WEB_APP_URL_HERE'; // Paste your URL here
    
    fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visit)
    }).then(() => {
        console.log('Data sent to Google Sheets');
    }).catch(error => {
        console.error('Sync error:', error);
    });
}
```

4. **Save** and redeploy your app

---

## 📊 CREATE DASHBOARD IN GOOGLE SHEETS

### Summary Stats Sheet

1. **Create new sheet**: Click "+" → Rename to "Dashboard"
2. **Add these formulas**:

**Total Visits:**
```
=COUNTA('Sheet1'!A2:A) - 1
```

**Active TDRs:**
```
=COUNTA(UNIQUE('Sheet1'!A2:A))
```

**Critical Float Count:**
```
=COUNTIF('Sheet1'!M2:M, "CRITICAL")
```

**Low Float Count:**
```
=COUNTIF('Sheet1'!M2:M, "LOW")
```

**OK Float Count:**
```
=COUNTIF('Sheet1'!M2:M, "OK")
```

**Average Float:**
```
=AVERAGE('Sheet1'!K2:K)
```

---

### Pivot Tables for Analysis

**By TDR:**
1. Data → Pivot table
2. Rows: TDR Name
3. Values: COUNTA of Outlet Name

**By Zone:**
1. Data → Pivot table
2. Rows: Zone
3. Values: COUNTA of Outlet Name

**By Float Status:**
1. Data → Pivot table
2. Rows: Float Status
3. Values: COUNTA of Outlet Name

---

### Create Charts

**Float Status Pie Chart:**
1. Insert → Chart
2. Chart type: Pie chart
3. Data range: Float Status column
4. Aggregate: COUNT

**Visits by TDR Bar Chart:**
1. Insert → Chart
2. Chart type: Column chart
3. X-axis: TDR Name
4. Y-axis: Count of visits

**Daily Trend Line Chart:**
1. Insert → Chart
2. Chart type: Line chart
3. X-axis: Date
4. Y-axis: Count of visits
5. Group by day

---

## 🔐 SECURITY & PERMISSIONS

### Share Sheet with Team

1. **Click "Share"** button
2. **Add emails** of managers who need access
3. **Set permission**: "Viewer" (read-only)
4. **Send** invitation

**For ZBMs (Zone Managers):**
- Create filtered views for each zone
- Share → Advanced → Create filtered view

---

### Protect Header Row

1. **Select Row 1**
2. **Data → Protect sheets and ranges**
3. **Set permissions**: Only you can edit
4. **Done**

---

## 📈 REPORTING & ANALYTICS

### Weekly Report

Create a separate sheet with:
- Total visits this week
- Top 3 TDRs
- Critical float outlets (with contact details)
- Zone-wise breakdown

**Formula for this week's visits:**
```
=COUNTIFS('Sheet1'!D2:D, ">="&TODAY()-7)
```

---

### Monthly Report

- Total visits this month
- Target achievement percentage
- Float status summary
- Geographic distribution
- TDR rankings

**Formula for this month's visits:**
```
=COUNTIFS('Sheet1'!D2:D, ">="&DATE(YEAR(TODAY()), MONTH(TODAY()), 1))
```

---

## 🔄 MAINTENANCE

### Daily Tasks:
- [ ] Check for new data entries
- [ ] Verify GPS coordinates are valid
- [ ] Review critical float outlets
- [ ] Update dashboard charts

### Weekly Tasks:
- [ ] Export backup to Excel
- [ ] Generate weekly report
- [ ] Share with management
- [ ] Clean up test data

### Monthly Tasks:
- [ ] Archive previous month data
- [ ] Reset monthly counters
- [ ] Update targets
- [ ] Review and optimize formulas

---

## 🐛 TROUBLESHOOTING

### Problem: Data Not Appearing

**Solutions:**
1. Check Apps Script execution logs: Executions tab
2. Verify Web App URL is correct in app code
3. Check authorization status
4. Re-deploy with new version

---

### Problem: Duplicate Entries

**Solutions:**
1. Add unique ID column
2. Use UNIQUE() function to filter
3. Set up data validation

---

### Problem: Wrong Date Format

**Solution:**
Update date formatting in Apps Script:
```javascript
Utilities.formatDate(dateObj, 'GMT+2', 'yyyy-MM-dd HH:mm:ss')
```

---

## 📱 MOBILE ACCESS

**Google Sheets Mobile App:**
- Download from Play Store / App Store
- Sign in with zamtel.sd@gmail.com
- Access sheets on the go
- View real-time updates

---

## 💾 BACKUP STRATEGY

### Automatic Backups:
1. File → Version history → See version history
2. Google Drive keeps version history automatically

### Manual Backups:
1. File → Download → Microsoft Excel (.xlsx)
2. Save to local drive
3. Schedule weekly

---

## 📧 EMAIL NOTIFICATIONS

Add this to Apps Script for email alerts:

```javascript
function sendDailySummary() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const today = new Date();
  const todayStr = Utilities.formatDate(today, 'GMT+2', 'yyyy-MM-dd');
  
  // Count today's visits
  const data = sheet.getDataRange().getValues();
  const todayVisits = data.filter(row => {
    const rowDate = Utilities.formatDate(new Date(row[3]), 'GMT+2', 'yyyy-MM-dd');
    return rowDate === todayStr;
  });
  
  const count = todayVisits.length;
  
  // Send email
  MailApp.sendEmail({
    to: 'management@zamtel.com',
    subject: 'Daily TDR Summary - ' + todayStr,
    body: `Total visits recorded today: ${count}\n\nView details: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`
  });
}
```

**Set up trigger:**
1. Triggers (clock icon)
2. Add Trigger
3. Function: sendDailySummary
4. Time-driven → Day timer → 6pm to 7pm

---

## 🎯 BEST PRACTICES

1. **Regular Backups**: Export weekly to Excel
2. **Clean Data**: Remove test entries regularly
3. **Monitor Usage**: Check Apps Script quotas
4. **Document Changes**: Note any modifications
5. **Train Users**: Ensure TDRs know how data flows

---

## 📞 SUPPORT

**Google Apps Script Documentation**: [script.google.com](https://script.google.com)

**Google Sheets Help**: [support.google.com/sheets](https://support.google.com/sheets)

**Zamtel Support**: zamtel.sd@gmail.com

---

## ✅ SETUP CHECKLIST

- [ ] Created Google Sheet with headers
- [ ] Applied formatting and colors
- [ ] Created Apps Script API
- [ ] Deployed as Web App
- [ ] Tested with sample data
- [ ] Connected app to Sheet URL
- [ ] Created Dashboard sheet
- [ ] Set up charts and pivot tables
- [ ] Configured permissions
- [ ] Set up backup schedule
- [ ] Documented Web App URL
- [ ] Trained administrators

**Setup Completed By**: _______________ **Date**: __________

**Web App URL**: ___________________________________________

---

**Zamtel TDR Field Monitor - Backend Setup v1.0.0**  
**Create your World** 🌍
