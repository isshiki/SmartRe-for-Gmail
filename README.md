# SmartRe for Gmail™

SmartRe for Gmail™ is a Chrome extension that formats quoted reply content and original-message headers in Gmail reply drafts.
It keeps Gmail's quote structure intact while making replies cleaner and easier to read.

![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Coming%20soon-lightgrey.svg)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

[Privacy Policy](PRIVACY.md)

---

## ✨ Features

### ✉️ Reply Formatting

* Automatically opens Gmail's hidden quoted content when you reply
* Keeps Gmail's `blockquote.gmail_quote` elements in place in rich text mode
* Removes only the visible left quote bar and left spacing in rich text mode
* Removes leading `>` quote markers in Gmail plain text reply mode
* Preserves rich text quote structure so receiving mail clients can still recognize quoted content

### 🧾 Original Message Header

* Converts Gmail's one-line reply header into an Outlook-style `Original message` header
* Supports both rich text replies and Gmail plain text reply mode
* Extracts sender name, sender address, and date from Gmail's generated header
* Uses the Gmail thread subject as the `Subject` line
* Uses the signed-in Chrome profile email, and the Gmail account display name when detectable, as the `To` line
* Omits header lines when the required data cannot be detected

### ⚙️ Settings

* Enable or disable quote style adjustment
* Enable or disable reply header rewriting
* Preferences are saved with Chrome Storage Sync
* Popup UI supports English and Japanese through Chrome i18n

---

## 🎯 Target Site

SmartRe for Gmail intentionally requests access only to:

```text
https://mail.google.com/*
```

This covers the normal Gmail web app, including account-specific paths such as `https://mail.google.com/mail/u/0/`. Short entry URLs such as `https://gmail.com/` and `https://www.gmail.com/` redirect users to `mail.google.com`, so they do not need separate extension host permissions.

Sign-in pages on `accounts.google.com` are not part of the extension's scope.

---

## 🔐 Permissions

SmartRe for Gmail uses only the permissions needed for reply formatting:

* `storage`: saves popup settings with Chrome Storage Sync
* `identity` and `identity.email`: reads the signed-in Chrome profile email for the `To` line
* `https://mail.google.com/*`: runs the formatter only on Gmail

SmartRe itself does not send message contents or account information to external services.

---

## 📦 Installation

### From Chrome Web Store

SmartRe for Gmail is not published yet.

### Manual (Development)

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this repository root folder.
5. Reload any open Gmail tabs.

After changing source files, reload the extension on `chrome://extensions`, then reload Gmail.

---

## 🗒 Version History

| Version | Date       | Notes |
| ------- | ---------- | ----- |
| 1.0.0   | 2026-04-26 | Initial release with quote style adjustment and Outlook-style reply header formatting |

---

## 🛠️ Development

### Project Structure

```text
SmartRe-for-Gmail/
├── manifest.json              # Extension core config
│
├── src/
│   ├── content.js             # Gmail reply detection and formatting logic
│   ├── background.js          # Service worker for profile email lookup
│   ├── popup.html             # Popup UI
│   ├── popup.js
│   └── popup.css
│
├── _locales/                  # Chrome i18n
│   ├── en/
│   └── ja/
│
├── icons/                     # App icons
│   └── icon-source.svg        # Source artwork for the PNG icons
│
├── build.ps1                  # Build scripts
├── build.bat
│
├── PRIVACY.md
└── README.md
```

### 🧪 Testing the Extension

SmartRe for Gmail can be tested locally before publishing to the Chrome Web Store.

#### During Development

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the project folder
4. Open or reload Gmail
5. Open a reply draft and verify that the quote and header formatting are applied
6. Change popup settings and verify the behavior on the next reply draft

#### Before Publishing

1. Run the build script:

   ```powershell
   .\build.ps1
   ```

   This generates a ZIP file in `dist/`.

2. In `chrome://extensions`, remove any unpacked development version to avoid conflicts.
3. Drag and drop the generated ZIP file onto `chrome://extensions`.
4. Verify that the packaged extension installs and works correctly before uploading it to the Chrome Web Store.

🗒 **Tip:**
Always test the ZIP version before submitting. This confirms that `manifest.json` paths and packaged files are correct.

### 📤 To Publish

If you plan to publish or update the extension:

1. Go to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole/)
2. Upload the `.zip` package built from this project
3. Fill out the metadata, screenshots, privacy information, and store description
4. Submit for review

Use the same version number as `manifest.json` before uploading.

---

## ⚠️ Gmail DOM Compatibility

SmartRe detects Gmail reply button clicks, opens hidden quoted content by clicking Gmail's quote expansion control when it exists, then formats Gmail's generated reply content. In rich text mode, it formats `blockquote.gmail_quote` and `div.gmail_attr` elements. In plain text mode, it formats the reply body editor directly.

The extension depends on Gmail's internal DOM class names. If Gmail changes its reply DOM, the selectors in `src/content.js` may need to be updated.

---

## ™️ Trademark Notice

Gmail is a trademark of Google LLC.

This extension is not affiliated with, endorsed by, sponsored by, or officially connected with Google LLC.

---

## 📄 License

Licensed under the [Apache License 2.0](LICENSE).

---

## 💬 Feedback

* Report bugs or suggestions via [GitHub Issues](https://github.com/isshiki/SmartRe-for-Gmail/issues)
* Pull requests are welcome
