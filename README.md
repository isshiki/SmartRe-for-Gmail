# SmartRe for Gmail™

SmartRe for Gmail™ is a Chrome extension that formats or removes quoted reply content and original-message headers in Gmail reply drafts.
It helps keep Gmail replies cleaner and easier to read.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-0F766E.svg)](https://chromewebstore.google.com/detail/smartre-for-gmail/didekpjkeflkjeffikpphaccodoaohid)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

[Privacy Policy](PRIVACY.md)

---

## ✨ Features

### ✉️ Reply Formatting

* Automatically opens Gmail's hidden quoted content when you reply
* Keeps Gmail's `blockquote.gmail_quote` elements in place when quote style adjustment is enabled
* Removes only the visible left quote bar and left spacing in rich text mode
* Removes leading `>` quote markers in Gmail plain text reply mode
* Preserves rich text quote structure in formatting mode so receiving mail clients can still recognize quoted content
* Optionally removes the quoted original message from reply drafts

### 🧾 Original Message Header

* Converts Gmail's one-line reply header into an Outlook-style `Original message` header
* Supports both rich text replies and Gmail plain text reply mode
* Extracts sender name, sender address, and date from Gmail's generated header
* Uses the Gmail thread subject as the `Subject` line
* Uses the signed-in Chrome profile email, and the Gmail account display name when detectable, as the `To` line
* Supports an editable reply header template with variables such as `$from`, `$date`, `$subject`, `$to`, and `$cc`
* Leaves unknown template variables as text and inserts empty text for values that cannot be detected

### ⚙️ Settings

* Enable quote removal mode
* Enable or disable quote style adjustment
* Enable or disable reply header rewriting
* Edit the reply header template directly in the popup
* Reset the reply header template to the default Outlook-style format
* Quote removal mode automatically disables quote style adjustment and reply header rewriting
* Preferences are saved with Chrome Storage Sync
* Popup UI supports English and Japanese through Chrome i18n

---

## 🌐 Checked Gmail UI Languages

Reply action detection has been checked with the following Gmail display languages:

* English (US) (English US)
* English (UK) (English UK)
* 日本語 (Japanese)
* Deutsch (German)
* Español (Spanish)
* Español (Latinoamérica) (Spanish Latin America)
* Français (French)
* Français (Canada) (French Canada)
* Português (Brasil) (Portuguese Brazil)
* Português (Portugal) (Portuguese Portugal)
* Italiano (Italian)
* Nederlands (Dutch)
* Polski (Polish)
* Türkçe (Turkish)
* Bahasa Indonesia (Indonesian)
* Tiếng Việt (Vietnamese)
* Русский (Russian)
* Українська (Ukrainian)
* 中文 (简体) (Chinese Simplified)
* 中文 (繁體) (Chinese Traditional)
* 中文 (香港) (Chinese Hong Kong)
* 한국어 (Korean)
* ภาษาไทย (Thai)
* हिन्दी (Hindi)
* العربية (Arabic)

Other Gmail display languages may also work when Gmail uses the same reply button structure, but they have not been manually checked.

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

Install SmartRe for Gmail from the Chrome Web Store:

https://chromewebstore.google.com/detail/smartre-for-gmail/didekpjkeflkjeffikpphaccodoaohid

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
| 1.4.0   | 2026-07-18 | Expanded Gmail UI language support for reply action detection |
| 1.3.0   | 2026-07-17 | Improved original header detection and added Cc support |
| 1.2.1   | 2026-06-03 | Improved reply draft detection for signatures and Google Workspace accounts |
| 1.2.0   | 2026-04-29 | Added editable reply header templates |
| 1.1.0   | 2026-04-29 | Added quote removal mode for Gmail replies |
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

SmartRe detects Gmail reply button clicks, opens hidden quoted content by clicking Gmail's quote expansion control when it exists, then formats or removes Gmail's generated reply content. In rich text mode, it formats `blockquote.gmail_quote` and `div.gmail_attr` elements, or removes Gmail's generated quote container when quote removal is enabled. In plain text mode, it formats or removes generated quote text in the reply body editor directly.

Reply header templates and variable values are inserted as text, not HTML. Markup-like text such as `<script>` is displayed as plain text.

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

* Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/smartre-for-gmail/didekpjkeflkjeffikpphaccodoaohid)
* Report bugs or suggestions via [GitHub Issues](https://github.com/isshiki/SmartRe-for-Gmail/issues)
* Pull requests are welcome
