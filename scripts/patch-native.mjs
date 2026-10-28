// Adds the permissions Mappin needs to the generated phone projects (run after "npx cap add ...").
// Safe to run more than once.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Android: location ("Show my location")
const manifest = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (existsSync(manifest)) {
  let xml = readFileSync(manifest, 'utf8');
  const perms = [
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-feature android:name="android.hardware.location.gps" android:required="false" />'
  ].filter(p => !xml.includes(p.match(/name="([^"]+)"/)[1]));
  if (perms.length) {
    xml = xml.replace('</manifest>', '    ' + perms.join('\n    ') + '\n</manifest>');
    writeFileSync(manifest, xml);
    console.log('Android: added location permissions');
  }
}

// iOS: location message and file sharing
const plist = join(root, 'ios', 'App', 'App', 'Info.plist');
if (existsSync(plist)) {
  let xml = readFileSync(plist, 'utf8');
  const add = [];
  if (!xml.includes('NSLocationWhenInUseUsageDescription')) {
    add.push('\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>Mappin shows where you are on the map.</string>');
  }
  if (add.length) {
    xml = xml.replace(/<\/dict>\s*<\/plist>\s*$/, add.join('\n') + '\n</dict>\n</plist>\n');
    writeFileSync(plist, xml);
    console.log('iOS: added location message');
  }
}
