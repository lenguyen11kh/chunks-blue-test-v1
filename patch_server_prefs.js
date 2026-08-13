const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const apiPrefs = `
// --- Teacher Preferences ---
const PREFERENCES_FILE = path.join(STORAGE_DIR, 'teacher-preferences.json');
let teacherPreferences: Record<string, any> = {};
if (fs.existsSync(PREFERENCES_FILE)) {
  try {
    teacherPreferences = JSON.parse(fs.readFileSync(PREFERENCES_FILE, 'utf-8'));
  } catch (e) {
    console.warn("Failed to load teacher preferences", e);
  }
}

app.get('/api/teacher-preferences', (req, res) => {
  res.json(teacherPreferences);
});

app.post('/api/teacher-preferences', (req, res) => {
  teacherPreferences = { ...teacherPreferences, ...req.body };
  fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(teacherPreferences, null, 2));
  res.json({ success: true });
});
`;

if (!code.includes('/api/teacher-preferences')) {
  code = code.replace('// --- Blue Test Data Storage ---', apiPrefs + '\n\n// --- Blue Test Data Storage ---');
  fs.writeFileSync('server.ts', code);
  console.log('Added teacher preferences API');
} else {
  console.log('API already exists');
}
