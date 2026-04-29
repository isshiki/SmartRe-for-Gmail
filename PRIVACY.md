# Privacy Policy

Last updated: April 29, 2026

SmartRe for Gmail™ is a Chrome extension that formats or removes quoted reply content and original-message headers in Gmail reply drafts.

## Data handled by the extension

SmartRe for Gmail handles the minimum data needed to provide its reply-formatting features:

* Gmail reply draft content, including quoted text and Gmail-generated reply header text
* The Gmail thread subject shown on the current Gmail page
* The signed-in Chrome profile email address, used only to add the `To` line to the rewritten reply header
* The Gmail account display name when it can be detected from the Gmail page, used only with the `To` line
* Extension settings, such as quote handling settings, reply header rewriting settings, and the user's reply header template

## How the data is used

The extension uses this data only inside the user's browser to:

* Adjust the appearance of quoted reply text
* Remove quoted original messages from reply drafts when the user enables quote removal mode
* Remove leading quote markers in Gmail plain text reply mode
* Rewrite Gmail's one-line reply header using the user's reply header template
* Save the user's extension settings

## Data sharing and transfer

SmartRe for Gmail does not send Gmail message contents, profile email addresses, account display names, extension settings, or any other user data to the developer's servers or to third-party services.

The extension does not sell, share, or transfer user data for advertising, analytics, profiling, or marketing purposes.

## Data storage

SmartRe for Gmail stores only extension settings using Chrome Storage Sync. These settings may include the user's reply header template.

The extension does not store Gmail message contents, rewritten headers, profile email addresses, or account display names outside the current Gmail page.

## Limited Use disclosure

SmartRe for Gmail uses data obtained through Chrome extension permissions only to provide and improve its single purpose: formatting or removing quoted reply content and original-message headers in Gmail replies.

The extension does not use or transfer user data for personalized advertising, retargeting, interest-based advertising, creditworthiness decisions, or any purpose unrelated to this user-facing feature.

Human access to user data is not provided by the extension. The developer does not receive Gmail message contents or profile email addresses through the extension.

## Permissions

SmartRe for Gmail uses the following Chrome extension permissions:

* `storage`: saves extension settings
* `identity` and `identity.email`: reads the signed-in Chrome profile email address for the `To` line
* `https://mail.google.com/*`: runs the reply formatter only on Gmail

## Contact

For privacy questions or support requests, please use GitHub Issues:

https://github.com/isshiki/SmartRe-for-Gmail/issues

Gmail is a trademark of Google LLC. This extension is not affiliated with, endorsed by, sponsored by, or officially connected with Google LLC.
