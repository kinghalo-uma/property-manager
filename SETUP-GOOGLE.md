# Google Drive setup (one-time, free)

The site stores everything in your own Google Drive. To let it do that, you create a free "client ID" in Google Cloud. No billing or card is needed. Google changes the wording of its console from time to time, so the menu names below may differ slightly.

## 1. Create a project
1. Go to https://console.cloud.google.com and sign in with the Google account whose Drive you want to use.
2. Create a new project (for example "Property Manager").

## 2. Turn on the Drive API
1. Open **APIs & Services > Library**.
2. Search for **Google Drive API** and click **Enable**.

## 3. Set up the consent screen
1. Open **APIs & Services > OAuth consent screen** (may be called **Google Auth Platform**).
2. Choose **External**, give the app a name and your email address.
3. Add the scope `.../auth/drive.file`. This lets the site see only files it creates itself.
4. While the app is in **Testing** mode, add your own Google email under **Test users**. Without this, sign-in is refused.

You will see an "unverified app" warning when you sign in. That is expected for your own personal app. Click **Advanced**, then continue.

## 4. Create the client ID
1. Open **APIs & Services > Credentials > Create credentials > OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorised JavaScript origins** add:
   - `https://kinghalo-uma.github.io`
   - `http://localhost:8000` (only if you want to test on your own computer)
4. You do not need a redirect URI. Click **Create**, then copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

## 5. Give it to the site
Either:
- Open the site, click **Settings**, and paste the client ID (saved in that browser only), or
- Paste it into `config.js` and commit, so it works on every device.

The client ID is a public identifier, not a password, so it is safe to commit. Never commit a client *secret*; this site doesn't use one.

## 6. Connect
Click **Connect Google Drive** on the site and approve access. It creates a folder called **Property Manager** in your Drive.
